import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';
import { getIo } from '../../realtime/gateway';

const router = Router();
router.use(authenticate);

const CreatePlanSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  project_id: z.string().uuid(),
  test_case_ids: z.array(z.string().uuid()).min(1),
  max_parallel: z.number().int().min(1).max(10).default(1),
});

const UpdatePlanSchema = CreatePlanSchema.partial().omit({ project_id: true });

// GET /api/test-plans?project_id=X
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { project_id } = req.query as any;

  const conditions: string[] = [];
  const params: any[] = [];
  if (project_id) { conditions.push('tp.project_id = ?'); params.push(project_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const plans = db.prepare(`
    SELECT
      tp.id, tp.name, tp.description, tp.project_id, tp.test_case_ids,
      tp.max_parallel, tp.created_by, tp.created_at, tp.updated_at,
      p.name AS project_name,
      u.name AS created_by_name,
      (
        SELECT COUNT(*) FROM executions e
        WHERE e.test_plan_id = tp.id
      ) AS total_runs,
      (
        SELECT e2.status FROM executions e2
        WHERE e2.test_plan_id = tp.id
        ORDER BY e2.created_at DESC LIMIT 1
      ) AS last_run_status,
      (
        SELECT e3.created_at FROM executions e3
        WHERE e3.test_plan_id = tp.id
        ORDER BY e3.created_at DESC LIMIT 1
      ) AS last_run_at
    FROM test_plans tp
    JOIN projects p ON p.id = tp.project_id
    JOIN users u ON u.id = tp.created_by
    ${where}
    ORDER BY tp.created_at DESC
    LIMIT 200
  `).all(...params) as any[];

  res.json({
    items: plans.map(p => ({
      ...p,
      test_case_ids: (() => { try { return JSON.parse(p.test_case_ids || '[]'); } catch { return []; } })(),
    })),
    total: plans.length,
  });
});

// GET /api/test-plans/:id
router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const plan = db.prepare(`
    SELECT tp.*, p.name AS project_name, u.name AS created_by_name
    FROM test_plans tp
    JOIN projects p ON p.id = tp.project_id
    JOIN users u ON u.id = tp.created_by
    WHERE tp.id = ?
  `).get(req.params.id) as any;

  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }

  const tcIds: string[] = (() => { try { return JSON.parse(plan.test_case_ids || '[]'); } catch { return []; } })();

  const activeRuns = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
      SUM(CASE WHEN status IN ('running','queued') THEN 1 ELSE 0 END) AS running
    FROM executions
    WHERE test_plan_id = ?
      AND created_at >= (
        SELECT MAX(created_at) FROM executions WHERE test_plan_id = ? AND test_case_id = (
          SELECT json_extract(test_case_ids, '$[0]') FROM test_plans WHERE id = ?
        )
      )
  `).get(req.params.id, req.params.id, req.params.id) as any;

  res.json({
    data: {
      ...plan,
      test_case_ids: tcIds,
      active_run: activeRuns,
    },
  });
});

// POST /api/test-plans
router.post('/', (req: AuthRequest, res: Response) => {
  const parse = CreatePlanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();
  const { name, description, project_id, test_case_ids, max_parallel } = parse.data;

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado', code: 'NOT_FOUND' }); return; }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO test_plans (id, project_id, name, description, test_case_ids, max_parallel, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, name, description || null, JSON.stringify(test_case_ids), max_parallel, req.user!.id, now, now);

  const plan = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(id) as any;
  res.status(201).json({
    data: { ...plan, test_case_ids },
  });
});

// PUT /api/test-plans/:id
router.put('/:id', (req: AuthRequest, res: Response) => {
  const parse = UpdatePlanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();
  const plan = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(req.params.id) as any;
  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }

  const { name, description, test_case_ids, max_parallel } = parse.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE test_plans SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      test_case_ids = COALESCE(?, test_case_ids),
      max_parallel = COALESCE(?, max_parallel),
      updated_at = ?
    WHERE id = ?
  `).run(
    name ?? null,
    description ?? null,
    test_case_ids ? JSON.stringify(test_case_ids) : null,
    max_parallel ?? null,
    now,
    req.params.id,
  );

  const updated = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(req.params.id) as any;
  res.json({
    data: {
      ...updated,
      test_case_ids: (() => { try { return JSON.parse(updated.test_case_ids || '[]'); } catch { return []; } })(),
    },
  });
});

// DELETE /api/test-plans/:id
router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const plan = db.prepare('SELECT id FROM test_plans WHERE id = ?').get(req.params.id);
  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }
  db.prepare('DELETE FROM test_plans WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// POST /api/test-plans/:id/runs — dispatch all test cases as a batch
router.post('/:id/runs', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(req.params.id) as any;
  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }

  const tcIds: string[] = (() => { try { return JSON.parse(plan.test_case_ids || '[]'); } catch { return []; } })();
  if (tcIds.length === 0) {
    res.status(400).json({ error: 'Plano sem casos de teste', code: 'EMPTY_PLAN' });
    return;
  }

  const { browsers = ['chromium'], video_enabled = false } = req.body;
  const browsersJson = JSON.stringify(browsers);

  const availableAgents = db.prepare(
    "SELECT * FROM agents WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT ?"
  ).all(plan.max_parallel) as any[];

  const io = getIo();
  const now = new Date().toISOString();
  const executionIds: string[] = [];

  const createRun = db.transaction(() => {
    for (let i = 0; i < tcIds.length; i++) {
      const tcId = tcIds[i];
      const tc = db.prepare('SELECT id, steps FROM test_cases WHERE id = ?').get(tcId) as any;
      if (!tc) continue;

      const agent = availableAgents[i % availableAgents.length] || null;
      const execId = uuidv4();
      executionIds.push(execId);

      db.prepare(`
        INSERT INTO executions
          (id, test_plan_id, test_case_id, agent_id, triggered_by, status, video_enabled, browsers, created_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `).run(execId, plan.id, tcId, agent?.id || null, req.user!.id, video_enabled ? 1 : 0, browsersJson, now);

      if (agent) {
        db.prepare("UPDATE agents SET status = 'busy' WHERE id = ?").run(agent.id);
        const steps = (() => { try { return JSON.parse(tc.steps || '[]'); } catch { return []; } })();
        io.to(`agent:${agent.id}`).emit('exec:dispatch', {
          execId,
          test_case_id: tcId,
          script_id: null,
          scriptContent: '',
          steps,
          framework: 'playwright',
          language: 'js',
          browsers,
          videoEnabled: video_enabled,
          timeout: 60000,
          backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
        });
      }
    }
  });

  createRun();

  io.emit('plan:started', { planId: plan.id, executionIds, total: executionIds.length });

  res.status(201).json({
    data: {
      plan_id: plan.id,
      execution_ids: executionIds,
      total: executionIds.length,
      agent_count: availableAgents.length,
    },
  });
});

// GET /api/test-plans/:id/runs/latest — aggregate status of most recent batch
router.get('/:id/runs/latest', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const plan = db.prepare('SELECT id FROM test_plans WHERE id = ?').get(req.params.id);
  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }

  const latestBatch = db.prepare(`
    SELECT created_at FROM executions
    WHERE test_plan_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id) as any;

  if (!latestBatch) {
    res.json({ data: null });
    return;
  }

  const batchStart = latestBatch.created_at.slice(0, 16);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'passed'  THEN 1 ELSE 0 END) AS passed,
      SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'error'   THEN 1 ELSE 0 END) AS error,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN status IN ('running','queued') THEN 1 ELSE 0 END) AS running,
      MIN(created_at) AS started_at,
      MAX(COALESCE(finished_at, created_at)) AS last_activity
    FROM executions
    WHERE test_plan_id = ?
      AND substr(created_at, 1, 16) >= ?
  `).get(req.params.id, batchStart) as any;

  const executions = db.prepare(`
    SELECT
      e.id, e.test_case_id, e.status, e.duration_ms, e.created_at, e.finished_at,
      tc.title AS tc_title,
      a.name AS agent_name
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN agents a ON a.id = e.agent_id
    WHERE e.test_plan_id = ?
      AND substr(e.created_at, 1, 16) >= ?
    ORDER BY e.created_at ASC
    LIMIT 200
  `).all(req.params.id, batchStart) as any[];

  const total = stats.total || 0;
  const done = (stats.passed || 0) + (stats.failed || 0) + (stats.error || 0) + (stats.cancelled || 0);

  res.json({
    data: {
      ...stats,
      progress_pct: total > 0 ? Math.round((done / total) * 100) : 0,
      is_complete: total > 0 && stats.running === 0,
      executions,
    },
  });
});

// POST /api/test-plans/:id/runs/retry — re-run only failed/error from latest batch
router.post('/:id/runs/retry', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const plan = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(req.params.id) as any;
  if (!plan) { res.status(404).json({ error: 'Plano não encontrado', code: 'NOT_FOUND' }); return; }

  const latestBatch = db.prepare(`
    SELECT created_at FROM executions WHERE test_plan_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id) as any;

  if (!latestBatch) {
    res.status(400).json({ error: 'Nenhuma execução anterior encontrada', code: 'NO_PREVIOUS_RUN' });
    return;
  }

  const batchStart = latestBatch.created_at.slice(0, 16);
  const failed = db.prepare(`
    SELECT DISTINCT test_case_id FROM executions
    WHERE test_plan_id = ?
      AND substr(created_at, 1, 16) >= ?
      AND status IN ('failed', 'error')
      AND test_case_id IS NOT NULL
  `).all(req.params.id, batchStart) as any[];

  if (failed.length === 0) {
    res.status(400).json({ error: 'Nenhuma execução com falha no último lote', code: 'NO_FAILURES' });
    return;
  }

  const { browsers = ['chromium'], video_enabled = false } = req.body;
  const browsersJson = JSON.stringify(browsers);
  const availableAgents = db.prepare("SELECT * FROM agents WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT ?").all(plan.max_parallel) as any[];
  const io = getIo();
  const now = new Date().toISOString();
  const executionIds: string[] = [];

  const retryTx = db.transaction(() => {
    for (let i = 0; i < failed.length; i++) {
      const tcId = failed[i].test_case_id;
      const tc = db.prepare('SELECT id, steps FROM test_cases WHERE id = ?').get(tcId) as any;
      if (!tc) continue;

      const agent = availableAgents[i % availableAgents.length] || null;
      const execId = uuidv4();
      executionIds.push(execId);

      db.prepare(`
        INSERT INTO executions
          (id, test_plan_id, test_case_id, agent_id, triggered_by, status, video_enabled, browsers, created_at)
        VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
      `).run(execId, plan.id, tcId, agent?.id || null, req.user!.id, video_enabled ? 1 : 0, browsersJson, now);

      if (agent) {
        db.prepare("UPDATE agents SET status = 'busy' WHERE id = ?").run(agent.id);
        const steps = (() => { try { return JSON.parse(tc.steps || '[]'); } catch { return []; } })();
        io.to(`agent:${agent.id}`).emit('exec:dispatch', {
          execId, test_case_id: tcId, script_id: null, scriptContent: '', steps,
          framework: 'playwright', language: 'js', browsers, videoEnabled: video_enabled,
          timeout: 60000, backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
        });
      }
    }
  });

  retryTx();
  io.emit('plan:started', { planId: plan.id, executionIds, total: executionIds.length, isRetry: true });

  res.status(201).json({
    data: { plan_id: plan.id, execution_ids: executionIds, total: executionIds.length },
  });
});

export default router;
