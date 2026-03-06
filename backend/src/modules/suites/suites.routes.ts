import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

const SuiteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  order_index: z.number().int().default(0),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  const suites = db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM test_cases tc WHERE tc.suite_id = s.id) as tc_count
    FROM suites s WHERE s.project_id = ? ORDER BY s.order_index ASC, s.created_at ASC
  `).all(req.params.projectId);
  res.json({ suites });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = SuiteSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  const { name, description, order_index } = parse.data;
  const id = uuidv4();
  db.prepare('INSERT INTO suites (id, project_id, name, description, order_index) VALUES (?, ?, ?, ?, ?)').run(id, req.params.projectId, name, description || null, order_index);
  const suite = db.prepare('SELECT * FROM suites WHERE id = ?').get(id);
  res.status(201).json({ suite });
});

router.put('/:suiteId', (req: AuthRequest, res: Response) => {
  const parse = SuiteSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ? AND project_id = ?').get(req.params.suiteId, req.params.projectId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  const { name, description, order_index } = parse.data;
  db.prepare('UPDATE suites SET name = ?, description = ?, order_index = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, description || null, order_index, req.params.suiteId);
  res.json({ suite: { ...suite, name, description, order_index } });
});

router.delete('/:suiteId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ? AND project_id = ?').get(req.params.suiteId, req.params.projectId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  db.prepare('DELETE FROM suites WHERE id = ?').run(req.params.suiteId);
  res.json({ message: 'Suite excluída com sucesso' });
});

export default router;
