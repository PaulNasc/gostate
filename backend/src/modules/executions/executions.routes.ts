import { Router, Response, Request, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';
import { getIo } from '../../realtime/gateway';
import { buildPayload } from '../integrations/integrations.routes';

const router = Router();

// Middleware que aceita tanto JWT de usuário quanto X-Agent-Token de agente
function authenticateAgentOrUser(req: Request, res: Response, next: NextFunction): void {
  const agentToken = req.headers['x-agent-token'] as string;
  if (agentToken) {
    const db = getDb();
    const agent = db.prepare('SELECT id FROM agents WHERE token = ?').get(agentToken) as any;
    if (!agent) { res.status(401).json({ error: 'Token de agente inválido' }); return; }
    (req as any).agentId = agent.id;
    (req as any).isAgent = true;
    next();
    return;
  }
  authenticate(req as AuthRequest, res, next);
}

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const execDir = path.join(ARTIFACTS_DIR, `exec_${(req as any).params.id}`);
    if (!fs.existsSync(execDir)) fs.mkdirSync(execDir, { recursive: true });
    cb(null, execDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

const CreateExecSchema = z.object({
  test_case_id: z.string().uuid().optional(),
  script_id: z.string().uuid().optional(),
  test_plan_id: z.string().uuid().optional(),
  scriptContent: z.string().optional(),
  video_enabled: z.boolean().default(false),
  browsers: z.array(z.string()).default(['chromium']),
  timeout: z.number().int().min(5000).max(300000).default(60000),
});

router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { project_id, status, limit = '100' } = req.query as any;
  let query = `
    SELECT e.*,
      tc.title as tc_title,
      s.filename as script_filename,
      COALESCE(s.project_id, su.project_id) as project_id,
      p.name as project_name,
      a.name as agent_name,
      u.name as triggered_by_name
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN suites su ON su.id = tc.suite_id
    LEFT JOIN scripts s ON s.id = e.script_id
    LEFT JOIN projects p ON p.id = COALESCE(s.project_id, su.project_id)
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN users u ON u.id = e.triggered_by
  `;
  const params: any[] = [];
  const conditions: string[] = [];
  if (status) { conditions.push('e.status = ?'); params.push(status); }
  if (project_id) { conditions.push('COALESCE(s.project_id, su.project_id) = ?'); params.push(project_id); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ` ORDER BY
    CASE e.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END ASC,
    e.created_at DESC
    LIMIT ?`;
  params.push(parseInt(limit));
  const executions = db.prepare(query).all(...params);
  res.json({ executions });
});

router.post('/', authenticate, (req: AuthRequest, res: Response) => {
  const parse = CreateExecSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();

  const availableAgent = db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY last_heartbeat DESC LIMIT 1').get('online') as any;

  const id = uuidv4();
  const { test_case_id, script_id, test_plan_id, video_enabled, browsers, scriptContent: bodyScriptContent } = parse.data;
  const browsersJson = JSON.stringify(browsers);

  db.prepare(`
    INSERT INTO executions (id, test_plan_id, test_case_id, script_id, agent_id, triggered_by, status, video_enabled, browsers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, test_plan_id || null, test_case_id || null, script_id || null, availableAgent?.id || null, req.user!.id, 'queued', video_enabled ? 1 : 0, browsersJson);

  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as any;

  const io = getIo();
  io.emit('exec:created', execution);

  if (availableAgent) {
    let scriptContent = bodyScriptContent || '';
    let tcSteps: any[] = [];

    if (!scriptContent && script_id) {
      const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(script_id) as any;
      if (script) scriptContent = script.content;
    }
    if (test_case_id) {
      const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(test_case_id) as any;
      if (tc) tcSteps = JSON.parse(tc.steps || '[]');
    }

    db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('busy', availableAgent.id);
    db.prepare('UPDATE executions SET status = ?, agent_id = ? WHERE id = ?').run('queued', availableAgent.id, id);

    const runConfig = {
      execId: id,
      test_case_id: test_case_id || null,
      script_id: script_id || null,
      scriptContent,
      steps: tcSteps,
      framework: 'playwright',
      language: 'js',
      browsers: parse.data.browsers,
      videoEnabled: video_enabled,
      timeout: parse.data.timeout,
      backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
    };

    io.to(`agent:${availableAgent.id}`).emit('exec:dispatch', runConfig);
  }

  res.status(201).json({ execution });
});

router.get('/:id', authenticate, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id) as any;
  if (!execution) { res.status(404).json({ error: 'Execução não encontrada' }); return; }
  const steps = db.prepare('SELECT * FROM exec_steps WHERE execution_id = ? ORDER BY step_index ASC').all(req.params.id);
  const artifacts = db.prepare('SELECT * FROM exec_artifacts WHERE execution_id = ?').all(req.params.id);
  res.json({ execution, steps, artifacts });
});

router.get('/:id/logs', authenticate, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const execution = db.prepare('SELECT id, logs, status FROM executions WHERE id = ?').get(req.params.id) as any;
  if (!execution) { res.status(404).json({ error: 'Execução não encontrada' }); return; }
  res.json({ logs: execution.logs || '', status: execution.status });
});

router.post('/:id/cancel', authenticate, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id) as any;
  if (!execution) { res.status(404).json({ error: 'Execução não encontrada' }); return; }
  if (!['queued', 'running'].includes(execution.status)) {
    res.status(400).json({ error: 'Só é possível cancelar execuções com status queued ou running' });
    return;
  }
  db.prepare('UPDATE executions SET status = ?, finished_at = datetime(\'now\') WHERE id = ?').run('cancelled', req.params.id);
  const io = getIo();
  io.emit('exec:cancelled', { id: req.params.id });
  res.json({ message: 'Execução cancelada' });
});

router.post('/:id/artifacts', authenticateAgentOrUser, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'Arquivo não enviado' }); return; }
  const db = getDb();
  const execution = db.prepare('SELECT id FROM executions WHERE id = ?').get(req.params.id) as any;
  if (!execution) { res.status(404).json({ error: 'Execução não encontrada' }); return; }

  const type = (req.body.type || 'screenshot') as string;
  const id = uuidv4();
  const relPath = path.join('artifacts', `exec_${req.params.id}`, req.file.filename);
  const url = `/api/artifacts/${req.params.id}/${req.file.filename}`;
  const size = req.file.size;

  db.prepare('INSERT INTO exec_artifacts (id, execution_id, type, filename, path, url, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.params.id, type, req.file.filename, relPath, url, size);

  const io = getIo();
  io.emit('exec:artifact', { execId: req.params.id, type, url });

  res.status(201).json({ artifact: { id, type, filename: req.file.filename, url, size_bytes: size } });
});

router.patch('/:id/status', authenticateAgentOrUser, (req: Request, res: Response) => {
  const db = getDb();
  const { status, logs, result, duration_ms, steps } = req.body;
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id) as any;
  if (!execution) { res.status(404).json({ error: 'Execução não encontrada' }); return; }

  const finished = ['passed', 'failed', 'error', 'cancelled'].includes(status);
  const setParts = [
    'status = ?',
    'logs = ?',
    'result = ?',
    'duration_ms = ?',
    ...(finished ? ['finished_at = datetime(\'now\')'] : []),
    ...(status === 'running' ? ['started_at = datetime(\'now\')'] : []),
  ];
  db.prepare(`UPDATE executions SET ${setParts.join(', ')} WHERE id = ?`
  ).run(status, logs || execution.logs || null, result || null, duration_ms || null, req.params.id);

  if (steps && Array.isArray(steps)) {
    for (const step of steps) {
      const stepId = uuidv4();
      db.prepare('INSERT OR REPLACE INTO exec_steps (id, execution_id, step_index, name, type, status, duration_ms, error_message, screenshot_url, timestamp_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(stepId, req.params.id, step.step_index, step.name, step.type || null, step.status, step.duration_ms || null, step.error_message || null, step.screenshot_url || null, step.timestamp_ms || null);
    }
  }

  if (finished && execution.agent_id) {
    db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('online', execution.agent_id);
  }

  const updated = db.prepare(`
    SELECT e.*, tc.title as tc_title, p.name as project_name
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN suites su ON su.id = tc.suite_id
    LEFT JOIN projects p ON p.id = su.project_id
    WHERE e.id = ?
  `).get(req.params.id) as any;

  const io = getIo();
  if (status === 'running') io.emit('exec:started', updated);
  else if (finished) io.emit('exec:finished', updated);
  else io.emit('exec:update', updated);

  if (finished) {
    fireWebhooks(db, status, updated).catch(() => {});
  }

  res.json({ execution: updated });
});

async function fireWebhooks(db: any, status: string, exec: any) {
  const eventMap: Record<string, string> = {
    passed: 'execution.passed',
    failed: 'execution.failed',
    error: 'execution.error',
    running: 'execution.started',
  };
  const event = eventMap[status];
  if (!event) return;

  const integrations = db.prepare(
    'SELECT * FROM integrations WHERE enabled = 1'
  ).all() as any[];

  for (const intg of integrations) {
    const events: string[] = JSON.parse(intg.events || '[]');
    if (!events.includes(event)) continue;

    try {
      const payload = buildPayload(intg.type, {
        status,
        title: exec.tc_title || `Execução #${exec.id.slice(0, 8)}`,
        project: exec.project_name || '—',
        duration_ms: exec.duration_ms || 0,
      });

      await fetch(intg.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_err) {
    }
  }
}

export default router;
