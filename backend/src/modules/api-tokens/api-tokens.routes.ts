import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

const CreateTokenSchema = z.object({
  name: z.string().min(1).max(100),
  expires_at: z.string().datetime().optional(),
});

function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = 'gst_' + crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tokens = db.prepare(
    'SELECT id, name, token_prefix, last_used_at, expires_at, created_at FROM user_api_tokens WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user!.id);
  res.json({ tokens });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = CreateTokenSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }

  const { name, expires_at } = parse.data;
  const { raw, hash, prefix } = generateApiToken();
  const id = uuidv4();
  const db = getDb();

  const existing = db.prepare('SELECT COUNT(*) as n FROM user_api_tokens WHERE user_id = ?').get(req.user!.id) as any;
  if (existing.n >= 20) { res.status(400).json({ error: 'Limite de 20 tokens por usuário atingido' }); return; }

  db.prepare(
    'INSERT INTO user_api_tokens (id, user_id, name, token_hash, token_prefix, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, name, hash, prefix, expires_at ?? null);

  res.status(201).json({
    token: {
      id, name, token_prefix: prefix, expires_at: expires_at ?? null,
      created_at: new Date().toISOString(),
    },
    raw_token: raw,
  });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const token = db.prepare('SELECT id FROM user_api_tokens WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!token) { res.status(404).json({ error: 'Token não encontrado' }); return; }
  db.prepare('DELETE FROM user_api_tokens WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
