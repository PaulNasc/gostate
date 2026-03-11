import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { errorHandler, notFound } from './shared/middleware/error';
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

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Token'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/data/artifacts', express.static(path.join(__dirname, '..', 'data', 'artifacts')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0', uptime: Math.round(process.uptime()) });
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

  app.use('/api/artifacts/:execId/:filename', (req, res) => {
    const filePath = path.join(__dirname, '..', 'data', 'artifacts', `exec_${req.params.execId}`, req.params.filename);
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
