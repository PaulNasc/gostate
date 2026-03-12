import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/schema';
import { authenticate } from '../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

const scheduleSchema = z.object({
  test_case_id: z.string().uuid().optional(),
  test_plan_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  cron: z.string().min(5),
  agent_id: z.string().uuid().optional().nullable(),
  browsers: z.array(z.string()).default(['chromium']),
  enabled: z.boolean().default(true),
  label: z.string().min(1).max(120),
});

router.use(authenticate);

router.get('/', (req: any, res) => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT s.*, tc.title as tc_title, p.name as project_name, tp.name as plan_name
      FROM schedules s
      LEFT JOIN test_cases tc ON tc.id = s.test_case_id
      LEFT JOIN projects p ON p.id = s.project_id
      LEFT JOIN test_plans tp ON tp.id = s.test_plan_id
      ORDER BY s.created_at DESC
    `).all();
    res.json({ schedules: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req: any, res) => {
  const body = scheduleSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { test_case_id, test_plan_id, project_id, cron, agent_id, browsers, enabled, label } = body.data;
  if (!test_case_id && !test_plan_id && !project_id) {
    return res.status(400).json({ error: 'Informe test_case_id, test_plan_id ou project_id' });
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO schedules (id, test_case_id, test_plan_id, project_id, cron, agent_id, browsers, enabled, label, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, test_case_id ?? null, test_plan_id ?? null, project_id ?? null, cron, agent_id ?? null, JSON.stringify(browsers), enabled ? 1 : 0, label, req.user.id, now, now);

    const schedule = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    res.status(201).json({ schedule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', (req: any, res) => {
  const { id } = req.params;
  const db = getDb();
  const schedule: any = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado' });

  const body = scheduleSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { cron, agent_id, browsers, enabled, label } = body.data;
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE schedules SET
        cron = COALESCE(?, cron),
        agent_id = COALESCE(?, agent_id),
        browsers = COALESCE(?, browsers),
        enabled = COALESCE(?, enabled),
        label = COALESCE(?, label),
        updated_at = ?
      WHERE id = ?
    `).run(cron ?? null, agent_id ?? null, browsers ? JSON.stringify(browsers) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, label ?? null, now, id);

    const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    res.json({ schedule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const schedule = db.prepare('SELECT id FROM schedules WHERE id = ?').get(id);
  if (!schedule) return res.status(404).json({ error: 'Agendamento não encontrado' });
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
