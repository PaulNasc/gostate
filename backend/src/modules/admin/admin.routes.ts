import { Router } from 'express';
import { authenticate, requireRole, AuthRequest } from '../../shared/middleware/auth';
import { getDb } from '../../db/schema';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(authenticate);
router.use(requireRole('admin'));

router.delete('/artifacts', (req: AuthRequest, res) => {
  const db = getDb();
  try {
    const { from, to } = req.body as { from?: string; to?: string };

    let query = `SELECT id, path FROM exec_artifacts WHERE 1=1`;
    const params: any[] = [];
    if (from) { query += ` AND date(created_at) >= date(?)`; params.push(from); }
    if (to)   { query += ` AND date(created_at) <= date(?)`; params.push(to); }

    const rows = db.prepare(query).all(...params) as Array<{ id: string; path: string }>;

    let deleted_files = 0;
    for (const row of rows) {
      if (row.path) {
        const abs = path.isAbsolute(row.path) ? row.path : path.join(process.cwd(), row.path);
        try { fs.unlinkSync(abs); deleted_files++; } catch { /* file may not exist */ }
      }
    }

    let delQuery = `DELETE FROM exec_artifacts WHERE 1=1`;
    const delParams: any[] = [];
    if (from) { delQuery += ` AND date(created_at) >= date(?)`; delParams.push(from); }
    if (to)   { delQuery += ` AND date(created_at) <= date(?)`; delParams.push(to); }
    const result = db.prepare(delQuery).run(...delParams);

    res.json({ deleted_records: result.changes, deleted_files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
