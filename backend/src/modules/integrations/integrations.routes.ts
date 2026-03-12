import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDb } from '../../db/schema';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';

const testIntegrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de teste de integração. Aguarde 1 minuto.' },
});

const router = Router();
router.use(authenticate);

const includeFlagsSchema = z.object({
  detailed_report: z.boolean().default(false),
  steps: z.boolean().default(false),
  artifacts: z.boolean().default(false),
  environment_info: z.boolean().default(false),
  browser_info: z.boolean().default(false),
  error_summary: z.boolean().default(false),
  retry_info: z.boolean().default(false),
  flaky_detection: z.boolean().default(false),
});

const smtpConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().optional(),
  pass: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject_prefix: z.string().default('[goState]'),
}).optional();

const integrationBaseSchema = z.object({
  type: z.enum(['discord', 'slack', 'teams', 'webhook', 'telegram', 'pagerduty', 'smtp', 'jira', 'github', 'mattermost', 'opsgenie', 'grafana', 'linear', 'datadog']),
  jira_config: z.object({
    base_url: z.string().optional(),
    email: z.string().optional(),
    api_token: z.string().optional(),
    project_key: z.string().optional(),
    issue_type: z.string().default('Bug'),
  }).optional(),
  github_config: z.object({
    repo: z.string().optional(),
    token: z.string().optional(),
    labels: z.array(z.string()).default(['gostate', 'automated-test']),
  }).optional(),
  label: z.string().min(1).max(120),
  webhook_url: z.string().default('').optional(),
  events: z.array(z.enum([
    'execution.passed', 'execution.failed', 'execution.error', 'execution.started',
    'execution.queued', 'execution.retried', 'execution.flaky',
    'plan.finished', 'plan.started',
    'schedule.triggered',
  ])).default(['execution.failed']),
  enabled: z.boolean().default(true),
  project_id: z.string().uuid().nullable().optional(),
  include_flags: includeFlagsSchema.default({}),
  smtp_config: smtpConfigSchema.optional(),
});

const integrationSchema = integrationBaseSchema.superRefine((data, ctx) => {
  if (!['smtp', 'jira', 'github', 'linear', 'opsgenie', 'datadog'].includes(data.type) && !data.webhook_url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'webhook_url é obrigatório para este tipo', path: ['webhook_url'] });
  }
  if (data.type === 'smtp') {
    const cfg = (data.smtp_config || {}) as Record<string, any>;
    if (!cfg['host']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP host obrigatório', path: ['smtp_config', 'host'] });
    if (!cfg['user']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP usuário obrigatório', path: ['smtp_config', 'user'] });
    if (!cfg['pass']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP senha obrigatória', path: ['smtp_config', 'pass'] });
    if (!cfg['from']) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP remetente obrigatório', path: ['smtp_config', 'from'] });
    if (!cfg['to'])   ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SMTP destinatário obrigatório', path: ['smtp_config', 'to'] });
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
  if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });

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
  if (!body.success) return res.status(400).json({ error: 'Dados inválidos', details: body.error.flatten() });

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

router.get('/:id/deliveries', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, event, status, status_code, error, created_at
    FROM integration_deliveries
    WHERE integration_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.params.id);
  res.json({ deliveries: rows });
});

router.delete('/:id', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT id FROM integrations WHERE id = ?').get(id);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });
  db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  res.status(204).end();
});

router.post('/:id/test', requireRole('admin'), testIntegrationLimiter, async (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  const flags = (() => { try { return JSON.parse(integration.include_flags || '{}'); } catch { return {}; } })();
  const events: string[] = (() => { try { return JSON.parse(integration.events || '[]'); } catch { return ['execution.failed']; } })();

  // Determine which event to simulate — prefer the first configured event
  const simulatedEvent = events[0] || 'execution.failed';

  // Derive status from the simulated event
  const eventStatusMap: Record<string, string> = {
    'execution.passed': 'passed',
    'execution.failed': 'failed',
    'execution.error': 'error',
    'execution.started': 'running',
    'execution.queued': 'queued',
    'execution.retried': 'failed',
    'execution.flaky': 'failed',
    'plan.finished': 'failed',
    'plan.started': 'running',
    'schedule.triggered': 'running',
  };
  const simulatedStatus = eventStatusMap[simulatedEvent] || 'failed';

  // Sample steps — always built, included only if flags say so
  const sampleSteps = [
    { name: 'Abrir página de login', status: 'passed', duration_ms: 312 },
    { name: 'Preencher credenciais', status: 'passed', duration_ms: 83 },
    { name: 'Submeter formulário', status: 'passed', duration_ms: 890 },
    { name: 'Aguardar redirecionamento', status: 'passed', duration_ms: 210 },
    { name: 'Verificar URL /dashboard', status: 'passed', duration_ms: 44 },
    { name: 'Verificar título da página', status: simulatedStatus === 'passed' ? 'passed' : 'failed', duration_ms: 55,
      error_message: simulatedStatus !== 'passed' ? 'Expected "Dashboard" but got "Painel"' : undefined },
  ];

  const projectName = integration.project_id
    ? (db.prepare('SELECT name FROM projects WHERE id = ?').get(integration.project_id) as any)?.name || 'Demo'
    : 'Demo';

  const data: Parameters<typeof buildPayload>[1] = {
    event: simulatedEvent,
    execution_id: 'test-exec-00000000',
    status: simulatedStatus,
    title: `[TESTE] Login com credenciais válidas`,
    project: projectName,
    duration_ms: 1550,
    from_schedule: simulatedEvent === 'schedule.triggered',
  };

  // ── Populate each flag exactly as the real dispatcher would ──

  if (flags.detailed_report) {
    const passed = sampleSteps.filter(s => s.status === 'passed').length;
    const failed = sampleSteps.filter(s => s.status === 'failed').length;
    const total = sampleSteps.length;
    data.detailed_report = {
      total_steps: total,
      passed_steps: passed,
      failed_steps: failed,
      skipped_steps: 0,
      pass_rate: parseFloat(((passed / total) * 100).toFixed(1)),
    };
  }

  if (flags.steps) {
    data.steps = sampleSteps.map(s => ({
      name: s.name,
      status: s.status,
      duration_ms: s.duration_ms,
      error_message: s.error_message,
    }));
  }

  if (flags.error_summary && simulatedStatus !== 'passed') {
    const failedStep = sampleSteps.find(s => s.status === 'failed');
    data.error_summary = failedStep?.error_message || 'Timeout ao aguardar elemento #submit-btn (5000ms)';
  }

  if (flags.environment_info) {
    data.environment = 'Staging — QA';
  }

  if (flags.browser_info) {
    data.browsers = ['chromium', 'firefox'];
  }

  if (flags.retry_info) {
    data.retry_count = 1;
  }

  if (flags.flaky_detection) {
    data.flaky = simulatedEvent === 'execution.flaky' || simulatedEvent === 'execution.retried';
  }

  if (flags.artifacts) {
    data.artifact_urls = [
      { filename: 'video-login-test.mp4', url: 'https://gostate.example/artifacts/video-login-test.mp4' },
      { filename: 'screenshot-step-6-fail.png', url: 'https://gostate.example/artifacts/screenshot-step-6-fail.png' },
    ];
    data.artifacts = data.artifact_urls.map(a => a.filename);
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
  event?: string;
  execution_id?: string;
  environment?: string;
  browsers?: string[];
  agent?: string;
  retry_count?: number;
  flaky?: boolean;
  steps?: Array<{ name: string; status: string; duration_ms?: number; error_message?: string }>;
  detailed_report?: {
    total_steps: number;
    passed_steps: number;
    failed_steps: number;
    skipped_steps: number;
    pass_rate?: number;
    logs?: string;
  };
  error_summary?: string;
  artifacts?: string[];
  artifact_urls?: Array<{ filename: string; url: string }>;
};

export function buildPayload(type: string, data: WebhookData) {
  const emoji = data.status === 'passed' ? '✅' : data.status === 'failed' ? '❌' : data.status === 'running' ? '🔄' : data.status === 'queued' ? '⏳' : '⚠️';
  const color = data.status === 'passed' ? 3066993 : data.status === 'failed' ? 15158332 : data.status === 'running' ? 3447003 : 15844367;
  const scheduleTag = data.from_schedule ? ' ⏰' : '';
  const scheduleSuffix = data.from_schedule ? '\n**Origem:** ⏰ Agendamento' : '';
  const flakyTag = data.flaky ? ' ⚡ _Flaky_' : '';
  const retryTag = data.retry_count && data.retry_count > 0 ? `\n**Tentativa:** #${data.retry_count + 1}` : '';

  // Build report section text
  let reportText = '';
  if (data.detailed_report) {
    const r = data.detailed_report;
    const rate = r.pass_rate != null ? ` (${r.pass_rate.toFixed(0)}%)` : '';
    reportText = `\n**Relatório:** ${r.total_steps} steps — ✅ ${r.passed_steps} passou${rate} · ❌ ${r.failed_steps} falhou · ⏭ ${r.skipped_steps} pulado`;
  }

  // Environment/browser info
  let envText = '';
  if (data.environment) envText += `\n**Ambiente:** ${data.environment}`;
  if (data.browsers && data.browsers.length > 0) envText += `\n**Browser(s):** ${data.browsers.join(', ')}`;
  if (data.agent) envText += `\n**Agente:** ${data.agent}`;

  // Error summary
  let errorText = '';
  if (data.error_summary) errorText = `\n**Erro:** \`${data.error_summary.slice(0, 200)}\``;

  // Build steps section text
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
  if (data.artifact_urls && data.artifact_urls.length > 0) {
    artifactsText = `\n**Artefatos:** ${data.artifact_urls.map(a => `[${a.filename}](${a.url})`).join(', ')}`;
  } else if (data.artifacts && data.artifacts.length > 0) {
    artifactsText = `\n**Artefatos:** ${data.artifacts.join(', ')}`;
  }

  if (type === 'discord' || type === 'mattermost') {
    const firstImage = data.artifact_urls?.find(a =>
      a.filename.endsWith('.png') || a.filename.endsWith('.jpg') || a.filename.endsWith('.jpeg')
    );
    const embed: any = {
      title: `${emoji} ${data.title}${scheduleTag}`,
      description: [
        `**Projeto:** ${data.project}`,
        `**Status:** ${data.status.toUpperCase()}${flakyTag}`,
        `**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s`,
        scheduleSuffix.trim(), retryTag.trim(), envText.trim(), reportText.trim(), errorText.trim(), artifactsText.trim(), stepsText.trim(),
      ].filter(Boolean).join('\n'),
      color,
      footer: { text: `goState · ${data.event || 'execution'} · ${new Date().toLocaleString('pt-BR')}` },
      timestamp: new Date().toISOString(),
    };
    if (firstImage) embed.image = { url: firstImage.url };
    return type === 'mattermost' ? { text: `${emoji} **${data.title}** — ${data.status}`, attachments: [embed] } : { embeds: [embed] };
  }

  if (type === 'slack') {
    const schedFlag = data.from_schedule ? ' | _⏰ agendamento_' : '';
    const reportSlack = data.detailed_report
      ? `\n*Relatório:* ${data.detailed_report.total_steps} steps — ✅ ${data.detailed_report.passed_steps} · ❌ ${data.detailed_report.failed_steps} · ⏭ ${data.detailed_report.skipped_steps}`
      : '';
    const envSlack = data.environment ? `\n*Ambiente:* ${data.environment}` : '';
    const browserSlack = data.browsers?.length ? `\n*Browser:* ${data.browsers.join(', ')}` : '';
    const errorSlack = data.error_summary ? `\n*Erro:* \`${data.error_summary.slice(0, 150)}\`` : '';
    const flakySlack = data.flaky ? ' ⚡ _flaky_' : '';
    const retrySlack = data.retry_count && data.retry_count > 0 ? `\n*Tentativa:* #${data.retry_count + 1}` : '';
    const artsSlack = data.artifact_urls?.length
      ? `\n*Artefatos:* ${data.artifact_urls.map(a => `<${a.url}|${a.filename}>`).join(', ')}`
      : data.artifacts?.length ? `\n*Artefatos:* ${data.artifacts.join(', ')}` : '';
    return {
      text: `${emoji} *${data.title}* — ${data.status}${flakySlack}${data.from_schedule ? ' _(agendamento)_' : ''}`,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `${emoji} *${data.title}*\n*Projeto:* ${data.project} | *Status:* ${data.status}${flakySlack} | *Duração:* ${(data.duration_ms / 1000).toFixed(1)}s${schedFlag}${retrySlack}${envSlack}${browserSlack}${reportSlack}${errorSlack}${artsSlack}` },
      }],
    };
  }

  if (type === 'opsgenie') {
    const priority = data.status === 'failed' || data.status === 'error' ? 'P2' : 'P5';
    return {
      message: `[goState] ${data.title} — ${data.status.toUpperCase()}`,
      description: `Projeto: ${data.project}\nDuração: ${(data.duration_ms / 1000).toFixed(1)}s${data.environment ? `\nAmbiente: ${data.environment}` : ''}${data.error_summary ? `\nErro: ${data.error_summary}` : ''}`,
      priority,
      tags: ['gostate', `status:${data.status}`, `project:${data.project.toLowerCase().replace(/\s/g, '-')}`],
      details: { project: data.project, status: data.status, duration_ms: String(data.duration_ms) },
    };
  }

  if (type === 'datadog') {
    return {
      title: `[goState] ${data.title}`,
      text: `%%% \n**Status:** ${data.status}\n**Projeto:** ${data.project}\n**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s${data.environment ? `\n**Ambiente:** ${data.environment}` : ''}${data.error_summary ? `\n**Erro:** ${data.error_summary}` : ''} \n%%%`,
      alert_type: data.status === 'passed' ? 'success' : data.status === 'failed' ? 'error' : 'warning',
      tags: [`project:${data.project}`, `status:${data.status}`, 'source:gostate'],
      source_type_name: 'goState',
    };
  }

  if (type === 'grafana') {
    return {
      state: data.status === 'passed' ? 'ok' : data.status === 'failed' ? 'alerting' : 'pending',
      message: `[goState] ${data.title} — ${data.status}`,
      ruleName: data.title,
      ruleUrl: '',
      evalMatches: [{ value: data.duration_ms, metric: 'duration_ms', tags: { project: data.project, status: data.status } }],
    };
  }

  if (type === 'linear') {
    return {
      title: `[goState] ${data.title} falhou`,
      description: `**Projeto:** ${data.project}\n**Status:** ${data.status}\n**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s${data.error_summary ? `\n**Erro:** ${data.error_summary}` : ''}`,
      priority: 1,
      labelIds: [],
    };
  }

  // Generic webhook / teams / telegram / pagerduty / jira / github
  return {
    event: data.event || 'execution.finished',
    status: data.status,
    title: data.title,
    project: data.project,
    duration_ms: data.duration_ms,
    duration_s: parseFloat((data.duration_ms / 1000).toFixed(1)),
    from_schedule: data.from_schedule || false,
    timestamp: new Date().toISOString(),
    ...(data.execution_id ? { execution_id: data.execution_id } : {}),
    ...(data.environment ? { environment: data.environment } : {}),
    ...(data.browsers?.length ? { browsers: data.browsers } : {}),
    ...(data.agent ? { agent: data.agent } : {}),
    ...(data.flaky !== undefined ? { flaky: data.flaky } : {}),
    ...(data.retry_count !== undefined ? { retry_count: data.retry_count } : {}),
    ...(data.error_summary ? { error_summary: data.error_summary } : {}),
    ...(data.detailed_report ? { report: data.detailed_report } : {}),
    ...(data.steps ? { steps: data.steps } : {}),
    ...(data.artifact_urls ? { artifacts: data.artifact_urls } : data.artifacts ? { artifacts: data.artifacts } : {}),
  };
}

export default router;
