import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { getDb } from '../../db/schema';
import { authenticate, requireRole, AuthRequest } from '../../shared/middleware/auth';
import { getIo } from '../../realtime/gateway';
import { parseJSON } from '../../shared/utils';

const router = Router();
router.use(authenticate);

const CreateAgentSchema = z.object({
  name: z.string().min(1).max(100),
  capabilities: z.object({
    browsers: z.array(z.string()).default(['chromium']),
    frameworks: z.array(z.string()).default(['playwright']),
    os: z.string().optional(),
    max_concurrent: z.number().int().min(1).max(20).default(2),
  }).default({}),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agents = db.prepare('SELECT id, name, status, capabilities, deploy_config, last_heartbeat, created_at FROM agents ORDER BY created_at DESC').all();
  res.json({ agents: agents.map((a: any) => ({ ...a, capabilities: parseJSON(a.capabilities, {}), deploy_config: parseJSON(a.deploy_config || '{}', {}) })) });
});

router.post('/', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const parse = CreateAgentSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const { name, capabilities } = parse.data;
  const id = uuidv4();
  const token = uuidv4() + '-' + uuidv4();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenPrefix = token.slice(0, 8);
  const db = getDb();
  db.prepare('INSERT INTO agents (id, name, token_hash, token_prefix, capabilities) VALUES (?, ?, ?, ?, ?)').run(id, name, tokenHash, tokenPrefix, JSON.stringify(capabilities));
  // Return token ONLY ONCE at creation — it cannot be retrieved later
  res.status(201).json({ agent: { id, name, token, token_prefix: tokenPrefix, capabilities, status: 'offline' } });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name, status, capabilities, deploy_config, last_heartbeat, created_at FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }
  res.json({ agent: { ...agent, capabilities: parseJSON(agent.capabilities, {}), deploy_config: parseJSON(agent.deploy_config || '{}', {}) } });
});

router.get('/:id/token', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name, token_prefix FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }
  res.json({ token_prefix: agent.token_prefix, message: 'O token completo só é exibido na criação. Se perdido, regenere com POST /:id/regenerate-token.' });
});

router.post('/:id/regenerate-token', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }
  const newToken = uuidv4() + '-' + uuidv4();
  const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
  const newTokenPrefix = newToken.slice(0, 8);
  db.prepare('UPDATE agents SET token_hash = ?, token_prefix = ?, token = NULL WHERE id = ?').run(newTokenHash, newTokenPrefix, req.params.id);
  res.json({ agent_id: agent.id, agent_name: agent.name, token: newToken, token_prefix: newTokenPrefix, warning: 'Salve este token agora — ele não poderá ser recuperado depois.' });
});

router.put('/:id', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const { name, capabilities } = req.body;
  const db = getDb();
  const agent = db.prepare('SELECT id, capabilities FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }

  if (name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Nome inválido' }); return;
    }
    db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  }

  if (capabilities !== undefined) {
    const current = parseJSON<Record<string, unknown>>(agent.capabilities, {});
    const merged = { ...current, ...capabilities };
    db.prepare('UPDATE agents SET capabilities = ? WHERE id = ?').run(JSON.stringify(merged), req.params.id);
  }

  const updated = db.prepare('SELECT id, name, status, capabilities, deploy_config, last_heartbeat, created_at FROM agents WHERE id = ?').get(req.params.id) as any;
  res.json({ agent: { ...updated, capabilities: parseJSON(updated.capabilities, {}), deploy_config: parseJSON(updated.deploy_config || '{}', {}) } });
});

router.put('/:id/deploy-config', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name, token FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }

  const allowed = ['backend_url', 'docker_image', 'node_env', 'extra_env', 'notes', 'max_concurrent'];
  const config: Record<string, string> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) config[key] = String(req.body[key]);
  }
  const current = parseJSON<Record<string, unknown>>((db.prepare('SELECT deploy_config FROM agents WHERE id = ?').get(req.params.id) as any)?.deploy_config || '{}', {});
  const merged = { ...current, ...config };
  db.prepare('UPDATE agents SET deploy_config = ? WHERE id = ?').run(JSON.stringify(merged), req.params.id);
  res.json({ deploy_config: merged });
});

router.get('/:id/install-command', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name, token_prefix, deploy_config FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }

  const cfg = parseJSON<Record<string, any>>(agent.deploy_config || '{}', {});
  const backendUrl = cfg.backend_url || `http://localhost:4000`;
  const dockerBackendUrl = backendUrl.replace('localhost', 'host.docker.internal').replace('127.0.0.1', 'host.docker.internal');
  const image = cfg.docker_image || 'node:20-slim';
  const nodeEnv = cfg.node_env || 'production';
  const agentSlug = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  const extraEnvLines: string[] = [];
  if (cfg.extra_env) {
    cfg.extra_env.split('\n').map((l: string) => l.trim()).filter(Boolean).forEach((l: string) => extraEnvLines.push(l));
  }

  // Linux/Mac bash (docker run — build from local Dockerfile)
  const extraDockerEnv = extraEnvLines.map((l: string) => ` \\\n  -e ${l}`).join('');
  const dockerBash = `# Build da imagem (necessario apos alteracoes em agent/src/)
docker build -t gostate-agent-${agentSlug} .

# Subir o container (substitua SEU_AGENT_TOKEN pelo token salvo na criação)
docker run -d \\
  --name agent-${agentSlug} \\
  --restart unless-stopped \\
  --add-host=host.docker.internal:host-gateway \\
  -e AGENT_TOKEN=SEU_AGENT_TOKEN \\
  -e BACKEND_URL=${dockerBackendUrl} \\
  -e NODE_ENV=${nodeEnv} \\
  -e AGENT_MAX_CONCURRENT=3 \\
  -e PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright${extraDockerEnv} \\
  gostate-agent-${agentSlug}`;

  // PowerShell (Windows — build from local Dockerfile)
  const extraPsEnv = extraEnvLines.map((l: string) => `  -e "${l}" \`\n`).join('');
  const dockerPowershell = `# Build da imagem (necessario apos alteracoes em agent/src/)
docker build -t gostate-agent-${agentSlug} .

# Subir o container (substitua SEU_AGENT_TOKEN pelo token salvo na criação)
docker run -d \`
  --name agent-${agentSlug} \`
  --restart unless-stopped \`
  --add-host=host.docker.internal:host-gateway \`
  -e "AGENT_TOKEN=SEU_AGENT_TOKEN" \`
  -e "BACKEND_URL=${dockerBackendUrl}" \`
  -e "NODE_ENV=${nodeEnv}" \`
  -e "AGENT_MAX_CONCURRENT=3" \`
  -e "PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright" \`
${extraPsEnv}  gostate-agent-${agentSlug}`;

  // NPM local (PowerShell)
  const extraPsVars = extraEnvLines.map((l: string) => { const [k, v] = l.split('='); return `$env:${k}="${v || ''}"; `; }).join('');
  const npmPowershell = `${extraPsVars}$env:AGENT_TOKEN="SEU_AGENT_TOKEN"; $env:BACKEND_URL="${backendUrl}"; $env:NODE_ENV="${nodeEnv}"; npm run dev`;

  // NPM local (bash)
  const extraBashVars = extraEnvLines.map((l: string) => `${l} `).join('');
  const npmBash = `${extraBashVars}AGENT_TOKEN=SEU_AGENT_TOKEN BACKEND_URL=${backendUrl} NODE_ENV=${nodeEnv} npm run dev`;

  const maxConcurrent = cfg.max_concurrent || 3;

  // docker-compose.yml (uses Dockerfile in agent/ dir — no Windows node_modules conflict)
  const extraComposeEnv = extraEnvLines.map((l: string) => `      ${l}`).join('\n');
  const dockerComposeYml = `services:
  agent-${agentSlug}:
    build: .
    restart: unless-stopped
    environment:
      AGENT_TOKEN: SEU_AGENT_TOKEN
      BACKEND_URL: ${dockerBackendUrl}
      NODE_ENV: ${nodeEnv}
      AGENT_MAX_CONCURRENT: ${maxConcurrent}
      PLAYWRIGHT_BROWSERS_PATH: /root/.cache/ms-playwright
${extraComposeEnv ? extraComposeEnv + '\n' : ''}    extra_hosts:
      - "host.docker.internal:host-gateway"

# Comandos:
#   1a vez ou apos alterar agent/src/:
#     docker-compose up -d --build agent
#   Apenas reiniciar (sem rebuild):
#     docker-compose up -d agent
#   Ver logs:
#     docker-compose logs -f agent`;

  res.json({
    agent_id: agent.id,
    agent_name: agent.name,
    token_prefix: agent.token_prefix,
    token_warning: 'O token completo não é armazenado. Use o token salvo na criação ou regenere com POST /:id/regenerate-token.',
    backend_url: backendUrl,
    commands: {
      docker_bash: dockerBash,
      docker_powershell: dockerPowershell,
      npm_powershell: npmPowershell,
      npm_bash: npmBash,
      docker_compose: dockerComposeYml,
    },
    env_vars: { AGENT_TOKEN: 'SEU_AGENT_TOKEN (salvo na criação)', BACKEND_URL: backendUrl, NODE_ENV: nodeEnv },
  });
});

router.post('/:id/check-status', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id, name, status, last_heartbeat FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }

  if (agent.status !== 'offline' && agent.last_heartbeat) {
    const lastHb = new Date(agent.last_heartbeat).getTime();
    const now = Date.now();
    const diffSeconds = (now - lastHb) / 1000;
    if (diffSeconds > 45) {
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agent.id);
      db.prepare("UPDATE executions SET status = 'error' WHERE agent_id = ? AND status IN ('running','queued')").run(agent.id);
      try {
        getIo().emit('agent:offline', { agentId: agent.id, agentName: agent.name });
      } catch { /* socket may not be ready */ }
      res.json({ status: 'offline', changed: true, message: `Agente marcado offline (sem heartbeat há ${Math.round(diffSeconds)}s)` });
      return;
    }
  }

  const updated = db.prepare('SELECT id, name, status, last_heartbeat FROM agents WHERE id = ?').get(req.params.id) as any;
  res.json({ status: updated.status, changed: false });
});

router.delete('/:id', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id) as any;
  if (!agent) { res.status(404).json({ error: 'Agente não encontrado' }); return; }
  db.prepare('UPDATE executions SET agent_id = NULL WHERE agent_id = ?').run(req.params.id);
  db.prepare('UPDATE schedules SET agent_id = NULL WHERE agent_id = ?').run(req.params.id);
  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
  res.json({ message: 'Agente removido com sucesso' });
});


export default router;
