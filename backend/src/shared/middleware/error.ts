import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error('[ERROR]', err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';
  res.status(status).json({ error: message, ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }) });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
}
