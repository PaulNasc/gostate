import http from 'http';
import { createApp } from './app';
import { initSocket, getIo } from './realtime/gateway';
import { startCronRunner } from './scheduler/cron-runner';
import { getDb } from './db/schema';

const PORT = parseInt(process.env.PORT || '4000', 10);

const app = createApp();
const server = http.createServer(app);
initSocket(server);
startCronRunner();

function startAgentHeartbeatSweep() {
  const SWEEP_INTERVAL_MS = 30 * 1000;
  const TIMEOUT_SECS = 60;

  setInterval(() => {
    try {
      const db = getDb();
      const staleAgents = db.prepare(`
        SELECT id, name FROM agents
        WHERE status != 'offline'
          AND last_heartbeat IS NOT NULL
          AND (julianday('now') - julianday(last_heartbeat)) * 86400 > ?
      `).all(TIMEOUT_SECS) as any[];

      for (const agent of staleAgents) {
        console.warn(`[AgentSweep] Agente ${agent.name} sem heartbeat > ${TIMEOUT_SECS}s — marcando offline`);
        db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('offline', agent.id);
        db.prepare(`UPDATE executions SET status = 'error',
          logs = COALESCE(logs, '') || '\n[AGENTE TIMEOUT - servidor]'
          WHERE agent_id = ? AND status IN ('running','queued')`).run(agent.id);
        try {
          const io = getIo();
          io.emit('agent:offline', { agentId: agent.id, agentName: agent.name });
          io.emit('exec:update', { agentId: agent.id });
        } catch {}
      }
    } catch (err) {
      console.error('[AgentSweep] Erro:', err);
    }
  }, SWEEP_INTERVAL_MS);

  console.log('[goState Backend] Agent heartbeat sweep ativado (intervalo: 30s, timeout: 60s)');
}

function startExecutionWatchdog() {
  const WATCHDOG_INTERVAL_MS = 2 * 60 * 1000;
  const MAX_RUNNING_SECS = 10 * 60;

  setInterval(() => {
    try {
      const db = getDb();
      const stuck = db.prepare(`
        SELECT id, agent_id FROM executions
        WHERE status IN ('running', 'queued')
          AND started_at IS NOT NULL
          AND (julianday('now') - julianday(started_at)) * 86400 > ?
      `).all(MAX_RUNNING_SECS) as any[];

      for (const exec of stuck) {
        console.warn(`[Watchdog] Execução ${exec.id} presa > ${MAX_RUNNING_SECS}s — marcando como error`);
        db.prepare(`UPDATE executions SET status = 'error', finished_at = datetime('now'),
          logs = COALESCE(logs, '') || '\n[Watchdog] Execução encerrada por timeout do servidor.'
          WHERE id = ?`).run(exec.id);
        if (exec.agent_id) {
          db.prepare(`UPDATE agents SET status = 'online' WHERE id = ?`).run(exec.agent_id);
        }
        try {
          const io = getIo();
          io.emit('exec:finished', { id: exec.id, status: 'error' });
        } catch {}
      }

      const stuckQueued = db.prepare(`
        SELECT id, agent_id FROM executions
        WHERE status = 'queued'
          AND started_at IS NULL
          AND (julianday('now') - julianday(created_at)) * 86400 > 300
      `).all() as any[];

      for (const exec of stuckQueued) {
        console.warn(`[Watchdog] Execução ${exec.id} na fila > 5min sem agente — marcando como error`);
        db.prepare(`UPDATE executions SET status = 'error', finished_at = datetime('now'),
          logs = '[Watchdog] Nenhum agente disponível processou esta execução em tempo hábil.'
          WHERE id = ?`).run(exec.id);
        try {
          const io = getIo();
          io.emit('exec:finished', { id: exec.id, status: 'error' });
        } catch {}
      }
    } catch (err) {
      console.error('[Watchdog] Erro:', err);
    }
  }, WATCHDOG_INTERVAL_MS);

  console.log('[goState Backend] Watchdog de execuções ativado (intervalo: 2min, timeout: 10min)');
}

server.listen(PORT, () => {
  console.log(`[goState Backend] Rodando em http://localhost:${PORT}`);
  console.log(`[goState Backend] Health: http://localhost:${PORT}/api/health`);
  startAgentHeartbeatSweep();
  startExecutionWatchdog();
});

server.on('error', (err) => {
  console.error('[goState Backend] Erro fatal:', err);
  process.exit(1);
});
