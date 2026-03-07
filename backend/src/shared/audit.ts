import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/schema';

export function logAudit(opts: {
  user_id?: string;
  action: string;
  entity: string;
  entity_id?: string;
  detail?: string;
  ip?: string;
}) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity, entity_id, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      uuidv4(),
      opts.user_id || null,
      opts.action,
      opts.entity,
      opts.entity_id || null,
      opts.detail || null,
      opts.ip || null,
    );
  } catch {
    // audit failures must never crash the main flow
  }
}
