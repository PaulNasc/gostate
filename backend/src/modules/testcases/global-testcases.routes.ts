import { Router, Response } from 'express';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const { projectId, suiteId, priority, status, type, search } = req.query;

  let query = `
    SELECT tc.*, s.name AS suite_name, p.name AS project_name, p.id AS project_id
    FROM test_cases tc
    JOIN suites s ON tc.suite_id = s.id
    JOIN projects p ON s.project_id = p.id
    WHERE 1=1
  `;
  
  const params: any[] = [];

  // Enforce access control for non-admin users
  if (userRole !== 'admin') {
    query += `
      AND (p.id IN (SELECT project_id FROM project_members WHERE user_id = ?) OR p.created_by = ?)
    `;
    params.push(userId, userId);
  }

  // Apply optional filters
  if (projectId) {
    query += ` AND p.id = ?`;
    params.push(projectId);
  }
  if (suiteId) {
    query += ` AND s.id = ?`;
    params.push(suiteId);
  }
  if (priority) {
    query += ` AND tc.priority = ?`;
    params.push(priority);
  }
  if (status) {
    query += ` AND tc.status = ?`;
    params.push(status);
  }
  if (type) {
    query += ` AND tc.type = ?`;
    params.push(type);
  }
  if (search) {
    query += ` AND (tc.title LIKE ? OR tc.description LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  }

  query += ` ORDER BY tc.updated_at DESC`;

  try {
    const testCases = db.prepare(query).all(...params) as any[];
    
    const formattedTestCases = testCases.map(tc => ({
      ...tc,
      steps: JSON.parse(tc.steps || '[]'),
      tags: JSON.parse(tc.tags || '[]')
    }));

    res.json({ test_cases: formattedTestCases });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar casos de teste', details: error instanceof Error ? error.message : 'Desconhecido' });
  }
});

export default router;
