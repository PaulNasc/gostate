import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/schema';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticate);

const includeFlagsSchema = z.object({
  detailed_report: z.boolean().default(false),
  steps: z.boolean().default(false),
  artifacts: z.boolean().default(false),
});

const integrationSchema = z.object({
  type: z.enum(['discord', 'slack', 'teams', 'webhook']),
  label: z.string().min(1).max(120),
  webhook_url: z.string().url(),
  events: z.array(z.enum(['execution.passed', 'execution.failed', 'execution.error', 'execution.started'])).default(['execution.failed']),
  enabled: z.boolean().default(true),
  project_id: z.string().uuid().nullable().optional(),
  include_flags: includeFlagsSchema.default({}),
});

router.get('/', (req: any, res) => {
  const db = getDb();
  try {
    const { project_id } = req.query;
    let rows: any[];
    if (project_id) {
      rows = db.prepare('SELECT * FROM integrations WHERE project_id = ? OR project_id IS NULL ORDER BY created_at DESC').all(project_id);
    } else {
      rows = db.prepare('SELECT * FROM integrations ORDER BY created_at DESC').all();
    }
    res.json({
      integrations: rows.map((r: any) => ({
        ...r,
        events: JSON.parse(r.events || '[]'),
        include_flags: JSON.parse(r.include_flags || '{}'),
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireRole('admin'), (req: any, res) => {
  const body = integrationSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { type, label, webhook_url, events, enabled, project_id, include_flags } = body.data;
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO integrations (id, type, label, webhook_url, events, enabled, project_id, include_flags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, label, webhook_url, JSON.stringify(events), enabled ? 1 : 0, project_id || null, JSON.stringify(include_flags), now, now);

    const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
    res.status(201).json({
      integration: {
        ...integration,
        events: JSON.parse(integration.events || '[]'),
        include_flags: JSON.parse(integration.include_flags || '{}'),
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  const body = integrationSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { label, webhook_url, events, enabled, project_id, include_flags } = body.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE integrations SET
      label = COALESCE(?, label),
      webhook_url = COALESCE(?, webhook_url),
      events = COALESCE(?, events),
      enabled = COALESCE(?, enabled),
      project_id = COALESCE(?, project_id),
      include_flags = COALESCE(?, include_flags),
      updated_at = ?
    WHERE id = ?
  `).run(
    label ?? null,
    webhook_url ?? null,
    events ? JSON.stringify(events) : null,
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    project_id !== undefined ? (project_id || null) : null,
    include_flags ? JSON.stringify(include_flags) : null,
    now, id
  );

  const updated = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  res.json({
    integration: {
      ...updated,
      events: JSON.parse(updated.events || '[]'),
      include_flags: JSON.parse(updated.include_flags || '{}'),
    }
  });
});

router.delete('/:id', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT id FROM integrations WHERE id = ?').get(id);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });
  db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  res.status(204).end();
});

router.post('/:id/test', requireRole('admin'), async (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  const flags = (() => { try { return JSON.parse(integration.include_flags || '{}'); } catch { return {}; } })();

  // Sample steps used when flags.steps or flags.detailed_report are enabled
  const sampleSteps = [
    { name: 'Abrir página de login', status: 'passed', duration_ms: 312 },
    { name: 'Preencher email', status: 'passed', duration_ms: 45 },
    { name: 'Preencher senha', status: 'passed', duration_ms: 38 },
    { name: 'Clicar em Entrar', status: 'passed', duration_ms: 890 },
    { name: 'Verificar redirecionamento para /dashboard', status: 'passed', duration_ms: 210 },
    { name: 'Verificar título da página', status: 'failed', duration_ms: 55, error_message: 'Expected "Dashboard" but got "Painel"' },
  ];

  const data: Parameters<typeof buildPayload>[1] = {
    status: 'failed',
    title: 'Login com credenciais válidas [TEST]',
    project: integration.project_id
      ? (db.prepare('SELECT name FROM projects WHERE id = ?').get(integration.project_id) as any)?.name || 'Projeto'
      : 'Demo',
    duration_ms: 1550,
    from_schedule: false,
  };

  if (flags.steps) {
    data.steps = sampleSteps;
  }

  if (flags.detailed_report) {
    data.detailed_report = {
      total_steps: sampleSteps.length,
      passed_steps: sampleSteps.filter(s => s.status === 'passed').length,
      failed_steps: sampleSteps.filter(s => s.status === 'failed').length,
      skipped_steps: 0,
    };
  }

  if (flags.artifacts) {
    data.artifacts = ['video-login-test.mp4', 'screenshot-step-6-fail.png'];
  }

  try {
    const payload = buildPayload(integration.type, data);

    const resp = await fetch(integration.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    res.json({ ok: resp.ok, status: resp.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export type WebhookData = {
  status: string;
  title: string;
  project: string;
  duration_ms: number;
  from_schedule?: boolean;
  steps?: Array<{ name: string; status: string; duration_ms?: number; error_message?: string }>;
  detailed_report?: {
    total_steps: number;
    passed_steps: number;
    failed_steps: number;
    skipped_steps: number;
    logs?: string;
  };
  artifacts?: string[];
};

export function buildPayload(type: string, data: WebhookData) {
  const emoji = data.status === 'passed' ? '✅' : data.status === 'failed' ? '❌' : '⚠️';
  const color = data.status === 'passed' ? 3066993 : data.status === 'failed' ? 15158332 : 15844367;
  const scheduleTag = data.from_schedule ? ' ⏰' : '';
  const scheduleSuffix = data.from_schedule ? '\n**Origem:** ⏰ Agendamento' : '';

  // Build report section text
  let reportText = '';
  if (data.detailed_report) {
    const r = data.detailed_report;
    reportText = `\n**Relatório:** ${r.total_steps} steps — ✅ ${r.passed_steps} passou · ❌ ${r.failed_steps} falhou · ⏭ ${r.skipped_steps} pulado`;
  }

  // Build steps section text (collapsed in Discord via code block)
  let stepsText = '';
  if (data.steps && data.steps.length > 0) {
    const lines = data.steps.map((s, i) => {
      const icon = s.status === 'passed' ? '✅' : s.status === 'failed' ? '❌' : '⏭';
      const dur = s.duration_ms ? ` (${s.duration_ms}ms)` : '';
      const err = s.error_message ? ` — ${s.error_message}` : '';
      return `${i + 1}. ${icon} ${s.name}${dur}${err}`;
    }).join('\n');
    stepsText = `\n\`\`\`\n${lines}\n\`\`\``;
  }

  // Artifacts
  let artifactsText = '';
  if (data.artifacts && data.artifacts.length > 0) {
    artifactsText = `\n**Artefatos:** ${data.artifacts.join(', ')}`;
  }

  if (type === 'discord') {
    return {
      embeds: [{
        title: `${emoji} ${data.title}${scheduleTag}`,
        description: `**Projeto:** ${data.project}\n**Status:** ${data.status}\n**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s${scheduleSuffix}${reportText}${artifactsText}${stepsText}`,
        color,
        footer: { text: 'goState Test Automation' },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (type === 'slack') {
    const schedFlag = data.from_schedule ? ' | _⏰ agendamento_' : '';
    const reportSlack = data.detailed_report
      ? `\n*Relatório:* ${data.detailed_report.total_steps} steps — ✅ ${data.detailed_report.passed_steps} · ❌ ${data.detailed_report.failed_steps} · ⏭ ${data.detailed_report.skipped_steps}`
      : '';
    return {
      text: `${emoji} *${data.title}* — ${data.status}${data.from_schedule ? ' _(agendamento)_' : ''}`,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `${emoji} *${data.title}*\n*Projeto:* ${data.project} | *Status:* ${data.status} | *Duração:* ${(data.duration_ms / 1000).toFixed(1)}s${schedFlag}${reportSlack}` },
      }],
    };
  }

  return {
    event: 'execution.finished',
    status: data.status,
    title: data.title,
    project: data.project,
    duration_ms: data.duration_ms,
    from_schedule: data.from_schedule || false,
    ...(data.detailed_report ? { report: data.detailed_report } : {}),
    ...(data.steps ? { steps: data.steps } : {}),
    ...(data.artifacts ? { artifacts: data.artifacts } : {}),
  };
}

export default router;
