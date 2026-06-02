import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JWT_SECRET } from '../shared/middleware/auth';
import { getDb } from '../db/schema';
import { fireWebhooksFromGateway } from '../modules/executions/executions.routes';
import { parseJSON } from '../shared/utils';
import { appendExecLog } from '../shared/exec-logs';

let io: SocketServer;

export function initSocket(server: HttpServer): SocketServer {
  const socketCorsOrigin = process.env.CORS_ORIGIN || '*';
  io = new SocketServer(server, {
    cors: { origin: socketCorsOrigin, methods: ['GET', 'POST'] },
    transports: ['polling', 'websocket'],
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const agentToken = socket.handshake.auth?.agentToken;

    if (agentToken) {
      const db = getDb();
      const hash = crypto.createHash('sha256').update(agentToken).digest('hex');
      const agent = db.prepare('SELECT id, name FROM agents WHERE token_hash = ?').get(hash) as any;
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

  io.on('connection', (socket: Socket) => {
    const isAgent = (socket as any).isAgent;

    if (isAgent) {
      const agentId = (socket as any).agentId;
      const agentName = (socket as any).agentName;
      console.log(`[Socket] Agente conectado: ${agentName} (${agentId})`);

      socket.join(`agent:${agentId}`);

      const db = getDb();

      // On reconnect: reset running executions (truly interrupted), but re-dispatch queued ones from last 30min
      const stuckRunning = db.prepare(
        "SELECT COUNT(*) as n FROM executions WHERE agent_id = ? AND status = 'running'"
      ).get(agentId) as any;
      if ((stuckRunning?.n ?? 0) > 0) {
        console.log(`[Socket] Agente ${agentName} reconectado — resetando ${stuckRunning.n} execuções running presas`);
        db.prepare("UPDATE executions SET status = 'error', logs = COALESCE(logs,'') || '\n[AGENTE RECONECTOU — EXECUÇÃO INTERROMPIDA]' WHERE agent_id = ? AND status = 'running'").run(agentId);
        io.emit('exec:update', { agentId });
      }

      // Re-dispatch queued executions from last 30 min
      const queuedExecs = db.prepare(`
        SELECT e.id, e.test_case_id, e.script_id, e.video_enabled, e.screenshot_enabled, e.browsers
        FROM executions e
        WHERE e.agent_id = ? AND e.status = 'queued'
          AND (julianday('now') - julianday(e.created_at)) * 1440 <= 30
        ORDER BY e.created_at ASC
      `).all(agentId) as any[];

      if (queuedExecs.length > 0) {
        console.log(`[Socket] Agente ${agentName} reconectado — redespatching ${queuedExecs.length} execuções queued`);
        for (const exec of queuedExecs) {
          let scriptContent = '';
          let tcSteps: any[] = [];
          if (exec.script_id) {
            const script = db.prepare('SELECT content FROM scripts WHERE id = ?').get(exec.script_id) as any;
            if (script) scriptContent = script.content || '';
          }
          if (exec.test_case_id) {
            const tc = db.prepare('SELECT steps FROM test_cases WHERE id = ?').get(exec.test_case_id) as any;
            if (tc) tcSteps = parseJSON<any[]>(tc.steps, []);
          }
          const browsers = parseJSON<string[]>(exec.browsers, ['chromium']);
          socket.emit('exec:dispatch', {
            execId: exec.id,
            test_case_id: exec.test_case_id || null,
            script_id: exec.script_id || null,
            scriptContent,
            steps: tcSteps,
            framework: 'playwright',
            language: 'js',
            browsers,
            videoEnabled: !!exec.video_enabled,
            screenshotEnabled: exec.screenshot_enabled !== 0,
            timeout: 60000,
            backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
          });
          console.log(`[Socket] Re-dispatch: ${exec.id} → agente ${agentName}`);
        }
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
          db.prepare("UPDATE executions SET status = 'error', logs = logs || '\n[AGENTE TIMEOUT]' WHERE agent_id = ? AND status IN ('running','paused','queued')").run(agentId);
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
        appendExecLog(data.execId, cleanLine);
        io.emit('exec:log', { ...data, line: cleanLine });
      });

      // Live step events from agent — relay to frontend and save to DB
      socket.on('exec:step', (data: { execId: string; event: string; stepIndex?: number; name?: string; status?: string; duration?: number; error?: string; timestamp?: number }) => {
        // Relay to all frontend clients
        io.emit('exec:step', data);

        // Save live step state to DB (deterministic ID to avoid duplicates)
        if ((data.event === 'stepBegin' || data.event === 'stepEnd') && data.execId && data.stepIndex !== undefined) {
          try {
            const stepId = `${data.execId}_step_${data.stepIndex}`;
            db.prepare(`
              INSERT OR REPLACE INTO exec_steps (id, execution_id, step_index, name, type, status, duration_ms, error_message, timestamp_ms)
              VALUES (?, ?, ?, ?, 'action', ?, ?, ?, ?)
            `).run(
              stepId,
              data.execId,
              data.stepIndex,
              data.name || '',
              data.event === 'stepBegin' ? 'running' : (data.status || 'passed'),
              data.event === 'stepBegin' ? null : (data.duration || 0),
              data.event === 'stepBegin' ? null : (data.error || null),
              data.timestamp || null,
            );
          } catch {}
        }
      });

      // Pause/resume confirmations from agent — relay to frontend
      socket.on('exec:paused', (data: { execId: string }) => {
        io.emit('exec:paused', data);
      });
      socket.on('exec:resumed', (data: { execId: string }) => {
        io.emit('exec:resumed', data);
      });

      // Fallback: agent emits status via socket when HTTP PATCH /status fails
      // (e.g. backendUrl resolved to localhost inside Docker)
      socket.on('exec:status', (data: { execId: string; status: string; logs?: string; duration_ms?: number; steps?: any[] }) => {
        try {
          const { execId, status, logs = '', duration_ms = 0, steps = [] } = data;
          const validStatuses = ['running', 'paused', 'passed', 'failed', 'error', 'cancelled'];
          if (!execId || !validStatuses.includes(status)) return;

          const execution = db.prepare('SELECT id, agent_id, status FROM executions WHERE id = ?').get(execId) as any;
          if (!execution) return;

          console.log(`[Socket] exec:status fallback — ${execId}: ${execution.status} → ${status} (agente: ${agentName})`);

          const isTerminal = ['passed', 'failed', 'error', 'cancelled'].includes(status);
          const now = new Date().toISOString();

          if (status === 'running') {
            db.prepare(`UPDATE executions SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ?`).run(now, execId);
          } else if (isTerminal) {
            db.prepare(`
              UPDATE executions
              SET status = ?, logs = COALESCE(?, logs), duration_ms = COALESCE(?, duration_ms),
                  finished_at = COALESCE(finished_at, ?),
                  started_at = COALESCE(started_at, ?)
              WHERE id = ?
            `).run(status, logs || null, duration_ms || null, now, now, execId);

            // Save step results if provided
            if (steps && steps.length > 0) {
              const insertStep = db.prepare(`
                INSERT OR IGNORE INTO exec_steps
                  (id, execution_id, step_index, name, type, status, duration_ms, error_message, timestamp_ms)
                VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
              `);
              for (const step of steps) {
                insertStep.run(execId, step.step_index ?? 0, step.name ?? '', step.type ?? 'action',
                  step.status ?? 'passed', step.duration_ms ?? 0, step.error_message ?? null, step.timestamp_ms ?? null);
              }
            }

            // Free the agent
            if (execution.agent_id) {
              db.prepare("UPDATE agents SET status = 'online' WHERE id = ?").run(execution.agent_id);
            }

            io.emit('exec:finished', { id: execId, status });
          }

          // Fire webhooks on every status transition (running, passed, failed, error, etc.)
          const updatedExec = db.prepare(`
            SELECT e.*, tc.title as tc_title,
              COALESCE(s.project_id, su.project_id) as project_id,
              p.name as project_name
            FROM executions e
            LEFT JOIN test_cases tc ON tc.id = e.test_case_id
            LEFT JOIN suites su ON su.id = tc.suite_id
            LEFT JOIN scripts s ON s.id = e.script_id
            LEFT JOIN projects p ON p.id = COALESCE(s.project_id, su.project_id)
            WHERE e.id = ?
          `).get(execId) as any;
          if (updatedExec) {
            fireWebhooksFromGateway(db, status, updatedExec, !!updatedExec.schedule_id).catch((e: any) => {
              console.error('[Socket] fireWebhooks error:', e?.message || e);
            });
          }

          io.emit('exec:update', { id: execId, status });
        } catch (err: any) {
          console.error(`[Socket] Erro ao processar exec:status: ${err.message}`);
        }
      });

      socket.on('disconnect', () => {
        clearTimeout(heartbeatTimer);
        console.log(`[Socket] Agente desconectado: ${agentName}`);
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agentId);
        db.prepare("UPDATE executions SET status = 'error', logs = logs || '\n[AGENTE DESCONECTADO]' WHERE agent_id = ? AND status IN ('running','paused','queued')").run(agentId);
        io.emit('agent:offline', { agentId, agentName });
        io.emit('exec:update', { agentId });
      });
    } else {
      const user = (socket as any).user;
      console.log(`[Socket] Cliente conectado: ${user?.email}`);

      socket.on('exec:watch', (execId: string) => {
        socket.join(`exec:${execId}`);
        // Send current script content back to the watcher
        const db2 = getDb();
        const execution = db2.prepare('SELECT script_id, test_case_id FROM executions WHERE id = ?').get(execId) as any;
        if (execution?.script_id) {
          const script = db2.prepare('SELECT content, filename FROM scripts WHERE id = ?').get(execution.script_id) as any;
          if (script) socket.emit('exec:script', { execId, content: script.content || '', filename: script.filename || '', type: 'script' });
        } else if (execution?.test_case_id) {
          const tc = db2.prepare('SELECT steps, title FROM test_cases WHERE id = ?').get(execution.test_case_id) as any;
          if (tc) socket.emit('exec:script', { execId, content: tc.steps || '[]', filename: tc.title || '', type: 'test_case' });
        }
      });

      // Relay code patch from frontend to the agent
      socket.on('exec:code_patch', (data: { execId: string; content: string }) => {
        const db2 = getDb();
        const execution = db2.prepare('SELECT agent_id FROM executions WHERE id = ?').get(data.execId) as any;
        if (execution?.agent_id) {
          io.to(`agent:${execution.agent_id}`).emit('exec:code_patch', data);
        }
      });

      // Forward pause/resume commands from frontend to the agent running the execution
      socket.on('exec:pause', (data: { execId: string }) => {
        const db2 = getDb();
        const execution = db2.prepare('SELECT agent_id FROM executions WHERE id = ?').get(data.execId) as any;
        if (execution?.agent_id) {
          io.to(`agent:${execution.agent_id}`).emit('exec:pause', { execId: data.execId });
          db2.prepare("UPDATE executions SET status = 'paused' WHERE id = ?").run(data.execId);
          io.emit('exec:update', { id: data.execId, status: 'paused' });
        }
      });
      socket.on('exec:resume', (data: { execId: string }) => {
        const db2 = getDb();
        const execution = db2.prepare('SELECT agent_id FROM executions WHERE id = ?').get(data.execId) as any;
        if (execution?.agent_id) {
          io.to(`agent:${execution.agent_id}`).emit('exec:resume', { execId: data.execId });
          db2.prepare("UPDATE executions SET status = 'running' WHERE id = ?").run(data.execId);
          io.emit('exec:update', { id: data.execId, status: 'running' });
        }
      });

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
