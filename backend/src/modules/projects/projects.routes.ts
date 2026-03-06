import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

const ProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM suites s WHERE s.project_id = p.id) as suites_count,
      (SELECT COUNT(*) FROM test_cases tc JOIN suites s ON tc.suite_id = s.id WHERE s.project_id = p.id) as tc_count,
      (SELECT COUNT(*) FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = p.id AND e.status IN ('passed','failed','error')) as exec_total,
      (SELECT COUNT(*) FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = p.id AND e.status = 'passed') as exec_passed,
      (SELECT e.status FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = p.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_status,
      (SELECT e.created_at FROM executions e JOIN test_cases tc ON tc.id = e.test_case_id JOIN suites s ON s.id = tc.suite_id WHERE s.project_id = p.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_at
    FROM projects p JOIN users u ON u.id = p.created_by
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
  res.json({ project: { ...project, name, description } });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Projeto excluído com sucesso' });
});

export default router;
