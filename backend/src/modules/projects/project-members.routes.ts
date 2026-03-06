import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, requireRole, AuthRequest } from '../../shared/middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'editor', 'admin']).default('viewer'),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['viewer', 'editor', 'admin']),
});

// GET /api/projects/:projectId/members
router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado', code: 'NOT_FOUND' }); return; }

  const members = db.prepare(`
    SELECT pm.id, pm.role, pm.created_at,
      u.id AS user_id, u.name, u.email,
      inv.name AS invited_by_name
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    LEFT JOIN users inv ON inv.id = pm.invited_by
    WHERE pm.project_id = ?
    ORDER BY pm.created_at ASC
  `).all(req.params.projectId);

  res.json({ members, total: (members as any[]).length });
});

// POST /api/projects/:projectId/members — invite by email
router.post('/', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const parse = AddMemberSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado', code: 'NOT_FOUND' }); return; }

  const targetUser = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(parse.data.email) as any;
  if (!targetUser) {
    res.status(404).json({ error: 'Usuário não encontrado com este e-mail', code: 'USER_NOT_FOUND' });
    return;
  }

  const existing = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, targetUser.id);
  if (existing) {
    res.status(409).json({ error: 'Usuário já é membro deste projeto', code: 'ALREADY_MEMBER' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO project_members (id, project_id, user_id, role, invited_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.projectId, targetUser.id, parse.data.role, req.user!.id, now);

  res.status(201).json({
    data: { id, user_id: targetUser.id, name: targetUser.name, email: targetUser.email, role: parse.data.role, created_at: now },
  });
});

// PUT /api/projects/:projectId/members/:memberId — change role
router.put('/:memberId', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const parse = UpdateRoleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', code: 'VALIDATION_ERROR', details: parse.error.flatten() });
    return;
  }

  const db = getDb();
  const member = db.prepare('SELECT id, user_id FROM project_members WHERE id = ? AND project_id = ?')
    .get(req.params.memberId, req.params.projectId) as any;
  if (!member) { res.status(404).json({ error: 'Membro não encontrado', code: 'NOT_FOUND' }); return; }

  // Prevent demoting self
  if (member.user_id === req.user!.id && parse.data.role !== 'admin') {
    res.status(400).json({ error: 'Você não pode rebaixar sua própria role', code: 'SELF_DEMOTION' });
    return;
  }

  db.prepare('UPDATE project_members SET role = ? WHERE id = ?').run(parse.data.role, req.params.memberId);
  res.json({ data: { id: req.params.memberId, role: parse.data.role } });
});

// DELETE /api/projects/:projectId/members/:memberId — remove member
router.delete('/:memberId', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const member = db.prepare('SELECT id, user_id FROM project_members WHERE id = ? AND project_id = ?')
    .get(req.params.memberId, req.params.projectId) as any;
  if (!member) { res.status(404).json({ error: 'Membro não encontrado', code: 'NOT_FOUND' }); return; }

  if (member.user_id === req.user!.id) {
    res.status(400).json({ error: 'Você não pode remover a si mesmo', code: 'SELF_REMOVAL' });
    return;
  }

  db.prepare('DELETE FROM project_members WHERE id = ?').run(req.params.memberId);
  res.status(204).end();
});

export default router;
