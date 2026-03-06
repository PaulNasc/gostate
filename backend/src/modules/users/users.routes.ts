import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, requireRole, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['admin', 'tester', 'viewer']).default('tester'),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['admin', 'tester', 'viewer']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

router.get('/', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const users = db.prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

router.post('/', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const parse = CreateUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() });
    return;
  }
  const { email, password, name, role } = parse.data;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Email já cadastrado' });
    return;
  }
  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(id, email, password_hash, name, role);
  res.status(201).json({ user: { id, email, name, role } });
});

router.get('/:id', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, name, role, active, created_at FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  res.json({ user });
});

router.put('/:id', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const parse = UpdateUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }

  const { name, role, active, password } = parse.data;
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (role !== undefined) { updates.push('role = ?'); values.push(role); }
  if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
  if (password !== undefined) { updates.push('password_hash = ?'); values.push(bcrypt.hashSync(password, 10)); }
  updates.push('updated_at = datetime(\'now\')');
  values.push(req.params.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updated = db.prepare('SELECT id, email, name, role, active FROM users WHERE id = ?').get(req.params.id);
  res.json({ user: updated });
});

router.delete('/:id', requireRole('admin'), (req: AuthRequest, res: Response) => {
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: 'Não é possível excluir seu próprio usuário' });
    return;
  }
  const db = getDb();
  db.prepare('UPDATE users SET active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado com sucesso' });
});

export default router;
