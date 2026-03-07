import { Router, Response } from 'express';
import { getDb } from '../../db/schema';
import { authenticate, requireRole, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('admin'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { user_id, entity, action, limit = '100', offset = '0' } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: any[] = [];

  if (user_id) { conditions.push('al.user_id = ?'); params.push(user_id); }
  if (entity) { conditions.push('al.entity = ?'); params.push(entity); }
  if (action) { conditions.push('al.action = ?'); params.push(action); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const logs = db.prepare(`
    SELECT al.*, u.name AS user_name, u.email AS user_email
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ${where}
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), parseInt(offset)) as any[];

  const total = (db.prepare(`SELECT COUNT(*) as c FROM audit_logs al ${where}`).get(...params) as any)?.c ?? 0;

  res.json({ logs, total });
});

export default router;
