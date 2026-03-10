import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/schema';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

const router = Router();
router.use(authenticate);

const includeFlagsSchema = z.object({
  detailed_report: z.boolean().default(false),
  steps: z.boolean().default(false),
  artifacts: z.boolean().default(false),
});

const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  subject_prefix: z.string().default('[goState]'),
}).partial();

const integrationBaseSchema = z.object({
  type: z.enum(['discord', 'slack', 'teams', 'webhook', 'telegram', 'pagerduty', 'smtp']),
  label: z.string().min(1).max(120),
  webhook_url: z.string().default('').optional(),
  events: z.array(z.enum(['execution.passed', 'execution.failed', 'execution.error', 'execution.started'])).default(['execution.failed']),
  enabled: z.boolean().default(true),
  project_id: z.string().uuid().nullable().optional(),
  include_flags: includeFlagsSchema.default({}),
  smtp_config: smtpConfigSchema.optional(),
});

const integrationSchema = integrationBaseSchema.superRefine((data, ctx) => {
  if (data.type !== 'smtp' && !data.webhook_url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhook_url é obrigatório para este tipo', path: ['webhook_url'] });
  }
  if (data.type === 'smtp') {
    const cfg = data.smtp_config || {};
    if (!cfg.host) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP host obrigatório', path: ['smtp_config', 'host'] });
    if (!cfg.user) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP usuário obrigatório', path: ['smtp_config', 'user'] });
    if (!cfg.pass) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP senha obrigatória', path: ['smtp_config', 'pass'] });
    if (!cfg.from) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP remetente obrigatório', path: ['smtp_config', 'from'] });
    if (!cfg.to)   ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP destinatário obrigatório', path: ['smtp_config', 'to'] });
  }
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

  const { type, label, webhook_url, events, enabled, project_id, include_flags, smtp_config } = body.data;
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO integrations (id, type, label, webhook_url, events, enabled, project_id, include_flags, smtp_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, label, webhook_url || '', JSON.stringify(events), enabled ? 1 : 0, project_id || null, JSON.stringify(include_flags), JSON.stringify(smtp_config || {}), now, now);

    const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
    res.status(201).json({
      integration: {
        ...integration,
        events: JSON.parse(integration.events || '[]'),
        include_flags: JSON.parse(integration.include_flags || '{}'),
        smtp_config: JSON.parse(integration.smtp_config || '{}'),
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

  const body = integrationBaseSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { label, webhook_url, events, enabled, project_id, include_flags, smtp_config } = body.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE integrations SET
      label = COALESCE(?, label),
      webhook_url = COALESCE(?, webhook_url),
      events = COALESCE(?, events),
      enabled = COALESCE(?, enabled),
      project_id = COALESCE(?, project_id),
      include_flags = COALESCE(?, include_flags),
      smtp_config = COALESCE(?, smtp_config),
      updated_at = ?
    WHERE id = ?
  `).run(
    label ?? null,
    webhook_url ?? null,
    events ? JSON.stringify(events) : null,
    enabled !== undefined ? (enabled ? 1 : 0) : null,
    project_id !== undefined ? (project_id || null) : null,
    include_flags ? JSON.stringify(include_flags) : null,
    smtp_config ? JSON.stringify(smtp_config) : null,
    now, id
  );

  const updated = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  res.json({
    integration: {
      ...updated,
      events: JSON.parse(updated.events || '[]'),
      include_flags: JSON.parse(updated.include_flags || '{}'),
      smtp_config: JSON.parse(updated.smtp_config || '{}'),
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
    if (integration.type === 'smtp') {
      const smtpCfg = (() => { try { return JSON.parse(integration.smtp_config || '{}'); } catch { return {}; } })();
      await sendSmtpEmail(smtpCfg, data, true);
      res.json({ ok: true, status: 200 });
    } else {
      const payload = buildPayload(integration.type, data);
      const resp = await fetch(integration.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      res.json({ ok: resp.ok, status: resp.status });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export async function sendSmtpEmail(cfg: any, data: any, isTest = false) {
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: cfg.secure || false,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const emoji = data.status === 'passed' ? '✅' : data.status === 'failed' ? '❌' : '⚠️';
  const prefix = cfg.subject_prefix || '[goState]';
  const testTag = isTest ? ' [TESTE]' : '';
  const subject = `${prefix} ${emoji} ${data.title}${testTag}`;

  let reportHtml = '';
  if (data.detailed_report) {
    const r = data.detailed_report;
    reportHtml = `<p><strong>Relatório:</strong> ${r.total_steps} steps — ✅ ${r.passed_steps} passou · ❌ ${r.failed_steps} falhou · ⏭ ${r.skipped_steps} pulado</p>`;
  }

  let stepsHtml = '';
  if (data.steps && data.steps.length > 0) {
    const rows = data.steps.map((s: any, i: number) => {
      const ic = s.status === 'passed' ? '✅' : s.status === 'failed' ? '❌' : '⏭';
      const dur = s.duration_ms ? ` <span style="color:#64748b">(${s.duration_ms}ms)</span>` : '';
      const err = s.error_message ? `<br><span style="color:#ef4444;font-size:12px">${s.error_message}</span>` : '';
      return `<tr><td style="padding:4px 8px;color:#94a3b8">${i + 1}</td><td style="padding:4px 8px">${ic} ${s.name}${dur}${err}</td></tr>`;
    }).join('');
    stepsHtml = `<table style="width:100%;border-collapse:collapse;margin-top:12px;background:#1a2035;border-radius:6px">${rows}</table>`;
  }

  const statusColor = data.status === 'passed' ? '#10b981' : data.status === 'failed' ? '#ef4444' : '#f59e0b';
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;background:#0a0d14;color:#e2e8f0;padding:24px;border-radius:10px;max-width:600px;margin:0 auto">
      <div style="border-left:4px solid ${statusColor};padding-left:16px;margin-bottom:20px">
        <h2 style="margin:0;font-size:18px">${emoji} ${data.title}</h2>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">${data.from_schedule ? '⏰ Agendamento' : 'Execução manual'}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Projeto</td><td style="padding:4px 0;font-size:13px">${data.project}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Status</td><td style="padding:4px 0;font-size:13px;color:${statusColor};font-weight:600">${data.status.toUpperCase()}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:13px">Duração</td><td style="padding:4px 0;font-size:13px">${(data.duration_ms / 1000).toFixed(1)}s</td></tr>
      </table>
      ${reportHtml}
      ${stepsHtml}
      <p style="margin-top:24px;color:#475569;font-size:11px;border-top:1px solid #1e293b;padding-top:12px">goState Test Automation${isTest ? ' — E-mail de teste' : ''}</p>
    </div>
  `;

  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject,
    html,
  });
}

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
    // Find first image attachment to embed inline
    const firstImage = data.artifacts?.find(f =>
      f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg')
    );
    const embed: any = {
      title: `${emoji} ${data.title}${scheduleTag}`,
      description: `**Projeto:** ${data.project}\n**Status:** ${data.status}\n**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s${scheduleSuffix}${reportText}${artifactsText}${stepsText}`,
      color,
      footer: { text: 'goState Test Automation' },
      timestamp: new Date().toISOString(),
    };
    if (firstImage) {
      embed.image = { url: `attachment://${firstImage}` };
    }
    return { embeds: [embed] };
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
