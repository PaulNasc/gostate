import { Router, Request, Response, NextFunction } from 'express';
import { checkPlanCompletion } from '../test-plans/test-plans.routes';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getDb } from '../../db/schema';
import { authenticate, requireProjectAccess, AuthRequest } from '../../shared/middleware/auth';
import { logAudit } from '../../shared/audit';
import { getIo } from '../../realtime/gateway';
import { resolveAndDispatch } from '../../shared/dispatch';
import { buildPayload, sendSmtpEmail } from '../integrations/integrations.routes';

const createExecLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Muitas execuções iniciadas. Aguarde 1 minuto.' },
  skip: (req) => !!(req as any).isAgent,
});

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

const ALLOWED_ARTIFACT_EXTENSIONS = ['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.zip', '.json', '.html', '.txt', '.log', '.trace'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const execDir = path.join(ARTIFACTS_DIR, `exec_${(req as any).params.id}`);
    if (!fs.existsSync(execDir)) fs.mkdirSync(execDir, { recursive: true });
    cb(null, execDir);
  },
  filename: (req, file, cb) => {
    const sanitized = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, sanitized);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_ARTIFACT_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${ext}`));
    }
  },
});

const CreateExecSchema = z.object({
  test_case_id: z.string().uuid().optional(),
  script_id: z.string().uuid().optional(),
  test_plan_id: z.string().uuid().optional(),
  environment_id: z.string().uuid().optional(),
  scriptContent: z.string().optional(),
  video_enabled: z.boolean().default(false),
  screenshot_enabled: z.boolean().default(true),
  browsers: z.array(z.string()).default(['chromium']),
  timeout: z.number().int().min(5000).max(300000).default(60000),
});

router.get('/', authenticate, requireProjectAccess('viewer', (req) => req.query.project_id as string | undefined), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const {
    project_id, status,
    limit = '50', offset = '0',
    date_from, date_to,
    test_case_id, test_plan_id,
  } = req.query as any;

  const baseJoin = `
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN suites su ON su.id = tc.suite_id
    LEFT JOIN scripts s ON s.id = e.script_id
    LEFT JOIN projects p ON p.id = COALESCE(s.project_id, su.project_id)
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN users u ON u.id = e.triggered_by
  `;

  const conditions: string[] = [];
  const params: any[] = [];

  if (status) { conditions.push('e.status = ?'); params.push(status); }
  if (project_id) { conditions.push('COALESCE(s.project_id, su.project_id) = ?'); params.push(project_id); }
  if (test_case_id) { conditions.push('e.test_case_id = ?'); params.push(test_case_id); }
  if (test_plan_id) { conditions.push('e.test_plan_id = ?'); params.push(test_plan_id); }
  if (date_from) { conditions.push("date(e.created_at) >= date(?)"); params.push(date_from); }
  if (date_to) { conditions.push("date(e.created_at) <= date(?)"); params.push(date_to); }

  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';

  const total = (db.prepare(`SELECT COUNT(*) as n ${baseJoin}${where}`).get(...params) as any).n;

  const listQuery = `
    SELECT e.*,
      tc.title as tc_title,
      s.filename as script_filename,
      COALESCE(s.project_id, su.project_id) as project_id,
      p.name as project_name,
      a.name as agent_name,
      u.name as triggered_by_name
    ${baseJoin}${where}
    ORDER BY
      CASE e.status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END ASC,
      CASE e.status WHEN 'queued' THEN e.created_at END ASC,
      CASE e.status WHEN 'queued' THEN NULL ELSE e.created_at END DESC
    LIMIT ? OFFSET ?`;

  const executions = db.prepare(listQuery).all(...params, parseInt(limit), parseInt(offset));
  res.json({ executions, total, limit: parseInt(limit), offset: parseInt(offset) });
});

router.post('/', authenticate, createExecLimiter, requireProjectAccess('editor', (req) => {
  const db = getDb();
  const { test_case_id, script_id } = req.body || {};
  if (test_case_id) {
    const tc = db.prepare('SELECT su.project_id FROM test_cases tc JOIN suites su ON su.id = tc.suite_id WHERE tc.id = ?').get(test_case_id) as any;
    return tc?.project_id;
  }
  if (script_id) {
    const sc = db.prepare('SELECT project_id FROM scripts WHERE id = ?').get(script_id) as any;
    return sc?.project_id;
  }
  return undefined;
}), (req: AuthRequest, res: Response) => {
  const parse = CreateExecSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();

  const availableAgent = db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY last_heartbeat DESC LIMIT 1').get('online') as any;

  const id = uuidv4();
  const {
    test_case_id,
    script_id,
    test_plan_id,
    environment_id,
    video_enabled,
    screenshot_enabled,
    browsers,
    scriptContent: bodyScriptContent
  } = parse.data;
  const browsersJson = JSON.stringify(browsers);

  db.prepare(`
    INSERT INTO executions (id, test_plan_id, test_case_id, script_id, environment_id, agent_id, triggered_by, status, video_enabled, screenshot_enabled, browsers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, test_plan_id || null, test_case_id || null, script_id || null, environment_id || null, availableAgent?.id || null, req.user!.id, 'queued', video_enabled ? 1 : 0, screenshot_enabled ? 1 : 0, browsersJson);

  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(id) as any;

  const io = getIo();
  io.emit('exec:created', execution);

  if (availableAgent) {
    db.prepare('UPDATE executions SET agent_id = ? WHERE id = ?').run(availableAgent.id, id);
    resolveAndDispatch(db, io, {
      id,
      agent_id: availableAgent.id,
      test_case_id: test_case_id || null,
      script_id: script_id || null,
      video_enabled,
      screenshot_enabled,
      browsers: browsersJson,
      environment_id: environment_id || null,
      timeout: parse.data.timeout,
    });
    if (bodyScriptContent) {
      io.to(`agent:${availableAgent.id}`).emit('exec:dispatch', { execId: id, scriptContent: bodyScriptContent });
    }
  }

  const tcForAudit = test_case_id ? db.prepare('SELECT title FROM test_cases WHERE id = ?').get(test_case_id) as any : null;
  const auditDetail = tcForAudit?.title ? `TC: ${tcForAudit.title}` : (test_case_id ? `TC: ${test_case_id.slice(0, 8)}` : 'Script avulso');
  logAudit({ user_id: (req as AuthRequest).user?.id, action: 'create', entity: 'execution', entity_id: execution.id, detail: auditDetail, ip: req.ip });
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
  logAudit({ user_id: req.user!.id, action: 'cancel', entity: 'execution', entity_id: req.params.id, ip: req.ip });
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

  const updatedExec = db.prepare(`
    SELECT e.*, tc.title as tc_title,
      COALESCE(s.project_id, su.project_id, sch.project_id) as project_id,
      p.name as project_name
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN suites su ON su.id = tc.suite_id
    LEFT JOIN scripts s ON s.id = e.script_id
    LEFT JOIN schedules sch ON sch.id = e.schedule_id
    LEFT JOIN projects p ON p.id = COALESCE(s.project_id, su.project_id, sch.project_id)
    WHERE e.id = ?
  `).get(req.params.id) as any;

  const io = getIo();
  if (status === 'running') io.emit('exec:started', updatedExec);
  else if (finished) io.emit('exec:finished', updatedExec);
  else io.emit('exec:update', updatedExec);

  if (finished) {
    fireWebhooks(db, status, updatedExec, !!updatedExec.schedule_id).catch((e: any) => {
      console.error('[Webhook] PATCH path error:', e?.message || e);
    });
    if (updatedExec?.test_plan_id) {
      checkPlanCompletion(db, updatedExec.test_plan_id).catch((e: any) => {
        console.error('[Plan] checkPlanCompletion error:', e?.message || e);
      });
    }
  }

  res.json({ execution: updatedExec });
});

export async function fireWebhooksFromGateway(db: any, status: string, exec: any, fromSchedule = false) {
  return fireWebhooks(db, status, exec, fromSchedule);
}

async function fireWebhooks(db: any, status: string, exec: any, fromSchedule = false) {
  const eventMap: Record<string, string> = {
    passed: 'execution.passed',
    failed: 'execution.failed',
    error: 'execution.error',
    running: 'execution.started',
  };
  const event = eventMap[status];
  console.log(`[Webhook] fireWebhooks called — status=${status} event=${event} exec_id=${exec?.id} project_id=${exec?.project_id}`);
  if (!event) return;

  const deliveryId = () => uuidv4();

  // Fetch integrations that match: enabled + (global OR same project)
  let integrations: any[];
  if (exec.project_id) {
    integrations = db.prepare(
      `SELECT * FROM integrations WHERE enabled = 1 AND (project_id IS NULL OR project_id = ?)`
    ).all(exec.project_id) as any[];
  } else {
    integrations = db.prepare(
      `SELECT * FROM integrations WHERE enabled = 1 AND project_id IS NULL`
    ).all() as any[];
  }
  console.log(`[Webhook] integrations found: ${integrations.length}`);

  for (const intg of integrations) {
    const events: string[] = (() => {
      try {
        const parsed = JSON.parse(intg.events || '[]');
        if (Array.isArray(parsed)) return parsed;
        return (intg.events || '').trim().split(/\s+/).filter(Boolean);
      } catch {
        return (intg.events || '').trim().split(/\s+/).filter(Boolean);
      }
    })();
    console.log(`[Webhook] intg=${intg.label} type=${intg.type} events=${JSON.stringify(events)} — match=${events.includes(event)}`);
    if (!events.includes(event)) continue;

    const flags = (() => { try { return JSON.parse(intg.include_flags || '{}'); } catch { return {}; } })();

    // Build enriched data based on include_flags
    let stepsData: any[] | undefined;
    let detailedReport: any | undefined;
    let artifacts: string[] | undefined;

    if (flags.steps || flags.detailed_report) {
      const rawSteps = db.prepare(
        'SELECT name, type, status, duration_ms, error_message FROM exec_steps WHERE execution_id = ? ORDER BY step_index ASC'
      ).all(exec.id) as any[];

      if (flags.steps && rawSteps.length > 0) {
        stepsData = rawSteps.map((s: any) => ({
          name: s.name,
          status: s.status,
          duration_ms: s.duration_ms,
          error_message: s.error_message || undefined,
        }));
      }

      if (flags.detailed_report && rawSteps.length > 0) {
        detailedReport = {
          total_steps: rawSteps.length,
          passed_steps: rawSteps.filter((s: any) => s.status === 'passed').length,
          failed_steps: rawSteps.filter((s: any) => s.status === 'failed').length,
          skipped_steps: rawSteps.filter((s: any) => s.status === 'skipped').length,
        };
      }
    }

    let artifactFiles: Array<{ filename: string; path: string; size_bytes: number; url: string }> | undefined;
    if (flags.artifacts) {
      const arts = db.prepare(
        `SELECT filename, path, size_bytes, url FROM exec_artifacts WHERE execution_id = ? ORDER BY created_at ASC`
      ).all(exec.id) as any[];
      if (arts.length > 0) {
        artifacts = arts.map((a: any) => a.filename);
        artifactFiles = arts;
      }
    }

    // Enrich with environment info
    let environment: string | undefined;
    if (flags.environment_info && exec.environment_id) {
      const env = db.prepare('SELECT name FROM environments WHERE id = ?').get(exec.environment_id) as any;
      if (env) environment = env.name;
    }

    // Enrich with browser info
    let browsers: string[] | undefined;
    if (flags.browser_info && exec.browsers) {
      try { browsers = JSON.parse(exec.browsers); } catch { browsers = [exec.browsers]; }
    }

    // Enrich with agent info
    let agentName: string | undefined;
    if (exec.agent_id) {
      const ag = db.prepare('SELECT name FROM agents WHERE id = ?').get(exec.agent_id) as any;
      if (ag) agentName = ag.name;
    }

    // Error summary from first failed step
    let errorSummary: string | undefined;
    if (flags.error_summary && (status === 'failed' || status === 'error')) {
      const failedStep = db.prepare(
        `SELECT error_message FROM exec_steps WHERE execution_id = ? AND status IN ('failed','error') AND error_message IS NOT NULL ORDER BY step_index ASC LIMIT 1`
      ).get(exec.id) as any;
      if (failedStep?.error_message) errorSummary = failedStep.error_message;
      else if (exec.error_message) errorSummary = exec.error_message;
    }

    // Retry / flaky info
    const retryCount: number | undefined = flags.retry_info ? (exec.retry_count ?? undefined) : undefined;
    const isFlaky: boolean | undefined = flags.flaky_detection ? (exec.flaky === 1 || exec.flaky === true ? true : undefined) : undefined;

    // Pass rate in detailed_report
    if (detailedReport && detailedReport.total_steps > 0) {
      detailedReport.pass_rate = (detailedReport.passed_steps / detailedReport.total_steps) * 100;
    }

    const webhookData = {
      event,
      execution_id: exec.id,
      status,
      title: exec.tc_title || `Execução #${exec.id.slice(0, 8)}`,
      project: exec.project_name || '—',
      duration_ms: exec.duration_ms || 0,
      from_schedule: fromSchedule,
      environment,
      browsers,
      agent: agentName,
      retry_count: retryCount,
      flaky: isFlaky,
      error_summary: errorSummary,
      steps: stepsData,
      detailed_report: detailedReport,
      artifacts,
      artifact_urls: artifactFiles?.map(a => ({ filename: a.filename, url: a.url })),
    };

    const dId = deliveryId();
    const payloadForLog = intg.type === 'smtp' ? webhookData : buildPayload(intg.type, webhookData);
    db.prepare(`INSERT INTO integration_deliveries (id, integration_id, event, payload, status) VALUES (?, ?, ?, ?, 'pending')`)
      .run(dId, intg.id, event, JSON.stringify(payloadForLog));

    try {
      if (intg.type === 'smtp') {
        const smtpCfg = (() => { try { return JSON.parse(intg.smtp_config || '{}'); } catch { return {}; } })();
        await sendSmtpEmail(smtpCfg, webhookData, false);
        db.prepare(`UPDATE integration_deliveries SET status='delivered', status_code=200 WHERE id=?`).run(dId);
        console.log(`[Webhook] ${intg.label} e-mail SMTP enviado com sucesso`);
      } else {
        const payload = buildPayload(intg.type, webhookData);
        if (intg.type === 'discord' && artifactFiles && artifactFiles.length > 0) {
          await sendDiscordWithFiles(intg.webhook_url, payload, artifactFiles);
          db.prepare(`UPDATE integration_deliveries SET status='delivered', status_code=200 WHERE id=?`).run(dId);
        } else {
          const resp = await fetch(intg.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          db.prepare(`UPDATE integration_deliveries SET status=?, status_code=? WHERE id=?`)
            .run(resp.ok ? 'delivered' : 'failed', resp.status, dId);
          if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            console.error(`[Webhook] ${intg.label} respondeu HTTP ${resp.status}: ${body.slice(0, 300)}`);
          } else {
            console.log(`[Webhook] ${intg.label} disparado com sucesso (HTTP ${resp.status})`);
          }
        }
      }
    } catch (_err: any) {
      db.prepare(`UPDATE integration_deliveries SET status='failed', error=? WHERE id=?`)
        .run((_err as any)?.message ?? 'unknown', dId);
      console.error(`[Webhook] ERRO ao disparar ${intg.label}:`, _err?.message || _err);
    }
  }
}

const DISCORD_MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB per file limit

async function sendDiscordWithFiles(
  webhookUrl: string,
  payload: object,
  artifactFiles: Array<{ filename: string; path: string; size_bytes: number; url: string }>
) {
  const ARTIFACTS_BASE = path.join(__dirname, '..', '..', '..', 'data');

  // Filter to files that exist on disk and are within Discord's 8MB limit
  const sendable = artifactFiles.filter(a => {
    const fullPath = path.join(ARTIFACTS_BASE, a.path);
    return fs.existsSync(fullPath) && a.size_bytes <= DISCORD_MAX_FILE_BYTES;
  }).slice(0, 10); // Discord allows max 10 files per message

  if (sendable.length === 0) {
    // No local files available — fall back to plain JSON
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const b = await r.text().catch(() => ''); console.error(`[Webhook/Discord] fallback HTTP ${r.status}: ${b.slice(0,300)}`); }
    else console.log(`[Webhook/Discord] fallback enviado OK (HTTP ${r.status})`);
    return;
  }

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));

  for (let i = 0; i < sendable.length; i++) {
    const a = sendable[i];
    const fullPath = path.join(ARTIFACTS_BASE, a.path);
    const buffer = fs.readFileSync(fullPath);
    const mimeType = a.filename.endsWith('.webm') ? 'video/webm'
      : a.filename.endsWith('.mp4') ? 'video/mp4'
      : a.filename.endsWith('.png') ? 'image/png'
      : a.filename.endsWith('.jpg') || a.filename.endsWith('.jpeg') ? 'image/jpeg'
      : 'application/octet-stream';
    form.append(`files[${i}]`, new Blob([buffer], { type: mimeType }), a.filename);
  }

  const dr = await fetch(webhookUrl, { method: 'POST', body: form });
  if (!dr.ok) { const b = await dr.text().catch(() => ''); console.error(`[Webhook/Discord] multipart HTTP ${dr.status}: ${b.slice(0,300)}`); }
  else console.log(`[Webhook/Discord] multipart enviado OK (HTTP ${dr.status}) — ${sendable.length} arquivo(s)`);
}

export default router;
