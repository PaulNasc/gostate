import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types';
import { getDb } from '../../db/schema';

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required');
  }
  console.warn('[goState] WARNING: JWT_SECRET not set — using insecure dev default. Set JWT_SECRET before deploying to production.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'gostate-dev-secret-change-in-production';

export { JWT_SECRET };

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }
  const token = header.slice(7);

  // API personal tokens start with gst_
  if (token.startsWith('gst_')) {
    try {
      const db = getDb();
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const row = db.prepare(`
        SELECT t.id, t.user_id, t.expires_at, u.email, u.name, u.role
        FROM user_api_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ? AND u.active = 1
      `).get(hash) as any;

      if (!row) { res.status(401).json({ error: 'API token inválido' }); return; }
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        res.status(401).json({ error: 'API token expirado' }); return;
      }

      db.prepare('UPDATE user_api_tokens SET last_used_at = ? WHERE id = ?')
        .run(new Date().toISOString(), row.id);

      req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role };
      next();
    } catch {
      res.status(401).json({ error: 'Erro ao validar API token' });
    }
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permissão insuficiente' });
      return;
    }
    next();
  };
}

const PROJECT_ROLE_ORDER = ['viewer', 'editor', 'admin'] as const;
type ProjectRole = typeof PROJECT_ROLE_ORDER[number];

/**
 * Middleware factory: verifica se o usuário tem acesso ao projeto.
 * - Admins globais sempre passam.
 * - Demais usuários precisam constar em project_members com role >= minRole.
 *
 * O project_id é extraído de (em ordem de prioridade):
 *   1. req.params.projectId  (rotas como /api/projects/:projectId/suites)
 *   2. req.params.project_id
 *   3. req.body.project_id
 *   4. req.query.project_id
 *
 * Para rotas onde o project_id é indireto (ex: suites/:suiteId/testcases),
 * passe um getter `resolveProjectId` que recebe a req e devolve o project_id.
 */
export function requireProjectAccess(
  minRole: ProjectRole = 'viewer',
  resolveProjectId?: (req: AuthRequest) => string | undefined,
) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'Não autenticado' }); return; }

    // Admins globais têm acesso total
    if (req.user.role === 'admin') { next(); return; }

    const projectId: string | undefined = resolveProjectId
      ? resolveProjectId(req)
      : (req.params.projectId || req.params.project_id || req.body?.project_id || req.query?.project_id as string | undefined);

    if (!projectId) { next(); return; }

    const db = getDb();
    const member = db.prepare(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?'
    ).get(projectId, req.user.id) as { role: ProjectRole } | undefined;

    if (!member) {
      res.status(403).json({ error: 'Acesso negado ao projeto', code: 'PROJECT_ACCESS_DENIED' });
      return;
    }

    const memberLevel = PROJECT_ROLE_ORDER.indexOf(member.role);
    const requiredLevel = PROJECT_ROLE_ORDER.indexOf(minRole);

    if (memberLevel < requiredLevel) {
      res.status(403).json({ error: `Role mínima exigida: ${minRole}`, code: 'PROJECT_ROLE_INSUFFICIENT' });
      return;
    }

    next();
  };
}
