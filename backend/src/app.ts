import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFound } from './shared/middleware/error';
import { getDb } from './db/schema';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import projectsRoutes from './modules/projects/projects.routes';
import suitesRoutes from './modules/suites/suites.routes';
import testcasesRoutes from './modules/testcases/testcases.routes';
import scriptsRoutes from './modules/scripts/scripts.routes';
import agentsRoutes from './modules/agents/agents.routes';
import executionsRoutes from './modules/executions/executions.routes';
import schedulesRoutes from './modules/schedules/schedules.routes';
import integrationsRoutes from './modules/integrations/integrations.routes';
import statsRoutes from './modules/stats/stats.routes';
import testPlansRoutes from './modules/test-plans/test-plans.routes';
import environmentsRoutes from './modules/environments/environments.routes';
import projectMembersRoutes from './modules/projects/project-members.routes';
import auditRoutes from './modules/audit/audit.routes';
import adminRoutes from './modules/admin/admin.routes';
import apiTokensRoutes from './modules/api-tokens/api-tokens.routes';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  if (corsOrigin === '*' && process.env.NODE_ENV === 'production') {
    console.error('[goState] FATAL: CORS_ORIGIN not set in production. Set CORS_ORIGIN explicitly. Refusing to start with wildcard origin.');
    process.exit(1);
  }
  app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Token'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Global rate limit for write operations (POST/PUT/PATCH/DELETE)
  const globalWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Muitas requisições. Aguarde 1 minuto.' },
    skip: (req) => req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD',
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', globalWriteLimiter);

  app.use('/data/artifacts', express.static(path.join(__dirname, '..', 'data', 'artifacts')));

  app.get('/api/health', (_req, res) => {
    try {
      const db = getDb();
      const row = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      if (!row || row.ok !== 1) throw new Error('DB check failed');
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.round(process.uptime()),
        db: 'ok',
      });
    } catch (err) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        db: 'unavailable',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/projects', projectsRoutes);
  app.use('/api/projects/:projectId/suites', suitesRoutes);
  app.use('/api/suites/:suiteId/testcases', testcasesRoutes);
  app.use('/api/scripts', scriptsRoutes);
  app.use('/api/agents', agentsRoutes);
  app.use('/api/executions', executionsRoutes);
  app.use('/api/schedules', schedulesRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/test-plans', testPlansRoutes);
  app.use('/api/projects/:projectId/environments', environmentsRoutes);
  app.use('/api/projects/:projectId/members', projectMembersRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/me/tokens', apiTokensRoutes);

  app.use('/api/artifacts/:execId/:filename', (req, res) => {
    const sanitizedFilename = path.basename(req.params.filename);
    if (sanitizedFilename !== req.params.filename || sanitizedFilename.includes('..')) {
      res.status(400).json({ error: 'Nome de arquivo inválido' });
      return;
    }
    const filePath = path.join(__dirname, '..', 'data', 'artifacts', `exec_${req.params.execId}`, sanitizedFilename);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        const statusCode = typeof (err as any)?.statusCode === 'number' ? (err as any).statusCode : 404;
        res.status(statusCode).json({ error: 'Artefato não encontrado' });
      }
    });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
