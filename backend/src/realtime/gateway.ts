import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../shared/middleware/auth';
import { getDb } from '../db/schema';

let io: SocketServer;

export function initSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['polling', 'websocket'],
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const agentToken = socket.handshake.auth?.agentToken;

    if (agentToken) {
      const db = getDb();
      const agent = db.prepare('SELECT * FROM agents WHERE token = ?').get(agentToken) as any;
      if (!agent) { next(new Error('Token de agente inválido')); return; }
      (socket as any).agentId = agent.id;
      (socket as any).agentName = agent.name;
      (socket as any).isAgent = true;
      next();
      return;
    }

    if (!token) { next(new Error('Token não fornecido')); return; }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  // Periodic sweep: every 60s reset agents without heartbeat and their stuck executions
  setInterval(() => {
    const db = getDb();
    const stale = db.prepare(
      "SELECT id, name FROM agents WHERE status != 'offline' AND last_heartbeat IS NOT NULL AND (strftime('%s','now') - strftime('%s', last_heartbeat)) > 60"
    ).all() as any[];
    for (const agent of stale) {
      console.log(`[Socket][Sweep] Agente ${agent.name} sem heartbeat — forçando offline`);
      db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agent.id);
      db.prepare("UPDATE executions SET status = 'error', logs = COALESCE(logs,'') || '\n[AGENTE TIMEOUT — SWEEP]' WHERE agent_id = ? AND status IN ('running','queued')").run(agent.id);
      io.emit('agent:offline', { agentId: agent.id, agentName: agent.name });
      io.emit('exec:update', { agentId: agent.id });
    }
  }, 60000);

  io.on('connection', (socket: Socket) => {
    const isAgent = (socket as any).isAgent;

    if (isAgent) {
      const agentId = (socket as any).agentId;
      const agentName = (socket as any).agentName;
      console.log(`[Socket] Agente conectado: ${agentName} (${agentId})`);

      socket.join(`agent:${agentId}`);

      const db = getDb();

      // On reconnect: reset any stale executions this agent left in running/queued state
      const stuckCount = (db.prepare("SELECT COUNT(*) as n FROM executions WHERE agent_id = ? AND status IN ('running','queued')").get(agentId) as any)?.n ?? 0;
      if (stuckCount > 0) {
        console.log(`[Socket] Agente ${agentName} reconectado — resetando ${stuckCount} execuções presas`);
        db.prepare("UPDATE executions SET status = 'error', logs = COALESCE(logs,'') || '\n[AGENTE RECONECTOU — EXECUÇÃO INTERROMPIDA]' WHERE agent_id = ? AND status IN ('running','queued')").run(agentId);
        io.emit('exec:update', { agentId });
      }

      db.prepare("UPDATE agents SET status = ?, last_heartbeat = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run('online', agentId);
      io.emit('agent:online', { agentId, agentName });

      // Heartbeat timeout: mark offline if no heartbeat for 45s (handles Docker stop without clean TCP close)
      let heartbeatTimer = setTimeout(() => markOffline(), 45000);

      function markOffline() {
        const current = db.prepare('SELECT status FROM agents WHERE id = ?').get(agentId) as any;
        if (current && current.status !== 'offline') {
          console.log(`[Socket] Agente ${agentName} sem heartbeat — marcando offline`);
          db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agentId);
          db.prepare("UPDATE executions SET status = 'error', logs = logs || '\n[AGENTE TIMEOUT]' WHERE agent_id = ? AND status IN ('running','queued')").run(agentId);
          io.emit('agent:offline', { agentId, agentName });
          io.emit('exec:update', { agentId });
        }
      }

      socket.on('agent:heartbeat', () => {
        db.prepare("UPDATE agents SET last_heartbeat = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(agentId);
        clearTimeout(heartbeatTimer);
        heartbeatTimer = setTimeout(() => markOffline(), 45000);
      });

      socket.on('exec:log', (data: { execId: string; line: string }) => {
        // Strip ANSI escape codes before storing
        const cleanLine = data.line.replace(/\x1B\[[0-9;]*[mGKHFABCDsuJn]|\x1B\([A-Z]|\x1B=/g, '');
        const exec = db.prepare('SELECT logs FROM executions WHERE id = ?').get(data.execId) as any;
        const newLogs = (exec?.logs || '') + cleanLine;
        db.prepare('UPDATE executions SET logs = ? WHERE id = ?').run(newLogs, data.execId);
        io.emit('exec:log', { ...data, line: cleanLine });
      });

      socket.on('disconnect', () => {
        clearTimeout(heartbeatTimer);
        console.log(`[Socket] Agente desconectado: ${agentName}`);
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agentId);
        db.prepare("UPDATE executions SET status = 'error', logs = logs || '\n[AGENTE DESCONECTADO]' WHERE agent_id = ? AND status IN ('running','queued')").run(agentId);
        io.emit('agent:offline', { agentId, agentName });
        io.emit('exec:update', { agentId });
      });
    } else {
      const user = (socket as any).user;
      console.log(`[Socket] Cliente conectado: ${user?.email}`);

      socket.on('disconnect', () => {
        console.log(`[Socket] Cliente desconectado: ${user?.email}`);
      });
    }
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.IO não inicializado');
  return io;
}
