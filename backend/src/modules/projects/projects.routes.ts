import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';
import { logAudit } from '../../shared/audit';

const router = Router();
router.use(authenticate);

const ProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const projects = db.prepare(`
    WITH suites_agg AS (
      SELECT project_id, COUNT(*) as suites_count
      FROM suites
      GROUP BY project_id
    ),
    tc_agg AS (
      SELECT s.project_id, COUNT(*) as tc_count
      FROM test_cases tc
      JOIN suites s ON tc.suite_id = s.id
      GROUP BY s.project_id
    ),
    exec_agg AS (
      SELECT 
        s.project_id,
        SUM(CASE WHEN e.status IN ('passed','failed','error') THEN 1 ELSE 0 END) as exec_total,
        SUM(CASE WHEN e.status = 'passed' THEN 1 ELSE 0 END) as exec_passed,
        SUM(CASE WHEN e.status IN ('queued','running') THEN 1 ELSE 0 END) as running_count
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      JOIN suites s ON s.id = tc.suite_id
      GROUP BY s.project_id
    ),
    last_exec AS (
      SELECT 
        s.project_id,
        e.status as last_exec_status,
        e.created_at as last_exec_at,
        ROW_NUMBER() OVER (PARTITION BY s.project_id ORDER BY e.created_at DESC) as rn
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      JOIN suites s ON s.id = tc.suite_id
    )
    SELECT 
      p.*, 
      u.name as created_by_name,
      COALESCE(sa.suites_count, 0) as suites_count,
      COALESCE(ta.tc_count, 0) as tc_count,
      COALESCE(ea.exec_total, 0) as exec_total,
      COALESCE(ea.exec_passed, 0) as exec_passed,
      COALESCE(ea.running_count, 0) as running_count,
      le.last_exec_status,
      le.last_exec_at
    FROM projects p
    JOIN users u ON u.id = p.created_by
    LEFT JOIN suites_agg sa ON sa.project_id = p.id
    LEFT JOIN tc_agg ta ON ta.project_id = p.id
    LEFT JOIN exec_agg ea ON ea.project_id = p.id
    LEFT JOIN last_exec le ON le.project_id = p.id AND le.rn = 1
    ORDER BY p.created_at DESC
  `).all();
  res.json({ projects });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = ProjectSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const { name, description } = parse.data;
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO projects (id, name, description, created_by) VALUES (?, ?, ?, ?)').run(id, name, description || null, req.user!.id);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  logAudit({ user_id: req.user!.id, action: 'create', entity: 'project', entity_id: id, detail: name, ip: req.ip });
  res.status(201).json({ project });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  res.json({ project });
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const parse = ProjectSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  const { name, description } = parse.data;
  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, description || null, req.params.id);
  logAudit({ user_id: req.user!.id, action: 'update', entity: 'project', entity_id: req.params.id, detail: name, ip: req.ip });
  res.json({ project: { ...project, name, description } });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  logAudit({ user_id: req.user!.id, action: 'delete', entity: 'project', entity_id: req.params.id, detail: project.name, ip: req.ip });
  res.json({ message: 'Projeto excluído com sucesso' });
});

export default router;
