import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

const StepSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'goto', 'click', 'fill', 'assert', 'wait', 'screenshot', 'api_call', 'group', 'library_ref',
    'expect_visible', 'expect_text', 'wait_for', 'wait_ms',
  ]),
  label: z.string().optional(),
  params: z.record(z.unknown()).default({}),
  order: z.number().optional(),
  group: z.string().optional(),
  is_secret: z.boolean().optional(),
});

const TestCaseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  steps: z.array(StepSchema).default([]),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  type: z.enum(['web', 'api', 'mobile', 'mixed']).default('web'),
  version_comment: z.string().optional(),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  const tcs = db.prepare(`
    SELECT tc.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM executions e WHERE e.test_case_id = tc.id) as exec_count,
      (SELECT status FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_status,
      (SELECT created_at FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_at,
      (SELECT id FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_id
    FROM test_cases tc JOIN users u ON u.id = tc.created_by
    WHERE tc.suite_id = ? ORDER BY tc.created_at DESC
  `).all(req.params.suiteId);
  res.json({ test_cases: tcs.map(parseTC) });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = TestCaseSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  const { title, description, steps, tags, priority, status, type, version_comment } = parse.data;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO test_cases (id, suite_id, title, description, steps, tags, priority, status, type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.suiteId, title, description || null, JSON.stringify(steps), JSON.stringify(tags), priority, status, type, req.user!.id);
  saveVersion(db, id, 1, steps, version_comment || 'Versão inicial', req.user!.id);
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  res.status(201).json({ test_case: parseTC(tc) });
});

router.get('/:tcId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  res.json({ test_case: parseTC(tc) });
});

router.put('/:tcId', (req: AuthRequest, res: Response) => {
  const parse = TestCaseSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  const { title, description, steps, tags, priority, status, type, version_comment } = parse.data;
  db.prepare(`
    UPDATE test_cases SET title=?, description=?, steps=?, tags=?, priority=?, status=?, type=?, updated_at=datetime('now') WHERE id=?
  `).run(title, description || null, JSON.stringify(steps), JSON.stringify(tags), priority, status, type, req.params.tcId);
  const lastVersion = db.prepare('SELECT MAX(version) as v FROM tc_versions WHERE tc_id = ?').get(req.params.tcId) as any;
  const nextVer = (lastVersion?.v || 0) + 1;
  saveVersion(db, req.params.tcId, nextVer, steps, version_comment || `Versão ${nextVer}`, req.user!.id);
  const updated = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.tcId);
  res.json({ test_case: parseTC(updated) });
});

router.delete('/:tcId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  db.prepare('DELETE FROM test_cases WHERE id = ?').run(req.params.tcId);
  res.json({ message: 'Caso de teste excluído com sucesso' });
});

router.patch('/:tcId/move', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  const { target_suite_id } = req.body;
  if (!target_suite_id) { res.status(400).json({ error: 'target_suite_id é obrigatório' }); return; }
  const targetSuite = db.prepare('SELECT * FROM suites WHERE id = ?').get(target_suite_id) as any;
  if (!targetSuite) { res.status(404).json({ error: 'Suite de destino não encontrada' }); return; }
  const srcSuite = db.prepare('SELECT project_id FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (srcSuite.project_id !== targetSuite.project_id) { res.status(400).json({ error: 'Suites pertencem a projetos diferentes' }); return; }
  db.prepare("UPDATE test_cases SET suite_id = ?, updated_at = datetime('now') WHERE id = ?").run(target_suite_id, req.params.tcId);
  res.json({ message: 'Caso de teste movido com sucesso' });
});

router.get('/:tcId/versions', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const versions = db.prepare(`
    SELECT v.*, u.name as author_name FROM tc_versions v JOIN users u ON u.id = v.author
    WHERE v.tc_id = ? ORDER BY v.version DESC
  `).all(req.params.tcId);
  res.json({ versions: versions.map((v: any) => ({ ...v, steps: JSON.parse(v.steps) })) });
});

function saveVersion(db: any, tcId: string, version: number, steps: unknown[], comment: string, author: string) {
  db.prepare('INSERT INTO tc_versions (id, tc_id, version, steps, comment, author) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), tcId, version, JSON.stringify(steps), comment, author);
}

function parseTC(tc: any) {
  if (!tc) return null;
  return {
    ...tc,
    steps: typeof tc.steps === 'string' ? JSON.parse(tc.steps) : tc.steps,
    tags: typeof tc.tags === 'string' ? JSON.parse(tc.tags) : tc.tags,
  };
}

export default router;
