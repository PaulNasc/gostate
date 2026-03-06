import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

const VariableSchema = z.object({
  key: z.string().min(1).max(128),
  value: z.string(),
  secret: z.boolean().default(false),
});

const EnvSchema = z.object({
  name: z.string().min(1).max(80),
  variables: z.array(VariableSchema).default([]),
});

// GET /api/projects/:projectId/environments
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const envs = db.prepare(`
    SELECT e.*, u.name AS created_by_name
    FROM environments e
    JOIN users u ON u.id = e.created_by
    WHERE e.project_id = ?
    ORDER BY e.name ASC
    LIMIT 200
  `).all(req.params.projectId) as any[];

  res.json({
    items: envs.map(e => ({
      ...e,
      variables: (() => {
        try { return JSON.parse(e.variables || '[]'); } catch { return []; }
      })(),
    })),
    total: envs.length,
  });
});

// GET /api/projects/:projectId/environments/:envId
router.get('/:envId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const env = db.prepare(`
    SELECT e.*, u.name AS created_by_name
    FROM environments e
    JOIN users u ON u.id = e.created_by
    WHERE e.id = ? AND e.project_id = ?
  `).get(req.params.envId, req.params.projectId) as any;

  if (!env) { res.status(404).json({ error: 'Ambiente não encontrado', code: 'NOT_FOUND' }); return; }

  res.json({
    data: {
      ...env,
      variables: (() => { try { return JSON.parse(env.variables || '[]'); } catch { return []; } })(),
    },
  });
});

// POST /api/projects/:projectId/environments
router.post('/', (req: AuthRequest, res: Response) => {
  const parse = EnvSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado', code: 'NOT_FOUND' }); return; }

  const id = uuidv4();
  const now = new Date().toISOString();
  const { name, variables } = parse.data;

  db.prepare(`
    INSERT INTO environments (id, project_id, name, variables, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.projectId, name, JSON.stringify(variables), req.user!.id, now, now);

  const created = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as any;
  res.status(201).json({
    data: { ...created, variables },
  });
});

// PUT /api/projects/:projectId/environments/:envId
router.put('/:envId', (req: AuthRequest, res: Response) => {
  const parse = EnvSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();
  const env = db.prepare('SELECT id FROM environments WHERE id = ? AND project_id = ?').get(req.params.envId, req.params.projectId);
  if (!env) { res.status(404).json({ error: 'Ambiente não encontrado', code: 'NOT_FOUND' }); return; }

  const now = new Date().toISOString();
  const { name, variables } = parse.data;

  db.prepare(`
    UPDATE environments SET name = ?, variables = ?, updated_at = ? WHERE id = ?
  `).run(name, JSON.stringify(variables), now, req.params.envId);

  res.json({
    data: { id: req.params.envId, name, variables },
  });
});

// DELETE /api/projects/:projectId/environments/:envId
router.delete('/:envId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const env = db.prepare('SELECT id FROM environments WHERE id = ? AND project_id = ?').get(req.params.envId, req.params.projectId);
  if (!env) { res.status(404).json({ error: 'Ambiente não encontrado', code: 'NOT_FOUND' }); return; }
  db.prepare('DELETE FROM environments WHERE id = ?').run(req.params.envId);
  res.status(204).end();
});

export default router;
