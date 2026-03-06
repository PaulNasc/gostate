import { Router, Response } from 'express';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();

  const totalProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c;
  const totalSuites = (db.prepare('SELECT COUNT(*) as c FROM suites').get() as any).c;
  const totalTestCases = (db.prepare('SELECT COUNT(*) as c FROM test_cases').get() as any).c;
  const totalAgents = (db.prepare('SELECT COUNT(*) as c FROM agents').get() as any).c;
  const onlineAgents = (db.prepare("SELECT COUNT(*) as c FROM agents WHERE status IN ('online','busy')").get() as any).c;

  const execTotals = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END), 0) as passed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error,
      COALESCE(SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END), 0) as running,
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
      COALESCE(AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END), 0) as avg_duration_ms
    FROM executions
  `).get() as any;

  const passRate = execTotals.total > 0
    ? Math.round((execTotals.passed / execTotals.total) * 100)
    : 0;

  const last7days = db.prepare(`
    SELECT
      date(created_at) as day,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM executions
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all() as any[];

  const recentExecs = db.prepare(`
    SELECT e.id, e.status, e.created_at, e.duration_ms,
      tc.title as tc_title,
      s.filename as script_filename,
      a.name as agent_name,
      p.name as project_name
    FROM executions e
    LEFT JOIN test_cases tc ON tc.id = e.test_case_id
    LEFT JOIN scripts s ON s.id = e.script_id
    LEFT JOIN agents a ON a.id = e.agent_id
    LEFT JOIN suites su ON su.id = tc.suite_id
    LEFT JOIN projects p ON p.id = su.project_id
    ORDER BY e.created_at DESC
    LIMIT 15
  `).all();

  res.json({
    projects: totalProjects,
    suites: totalSuites,
    test_cases: totalTestCases,
    agents: { total: totalAgents, online: onlineAgents },
    executions: {
      total: execTotals.total,
      passed: execTotals.passed,
      failed: execTotals.failed,
      error: execTotals.error,
      running: execTotals.running,
      cancelled: execTotals.cancelled,
      pass_rate: passRate,
      avg_duration_ms: Math.round(execTotals.avg_duration_ms || 0),
    },
    last7days,
    recent: recentExecs,
  });
});

export default router;
