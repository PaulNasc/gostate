import cron from 'node-cron';
import { getDb } from '../db/schema';
import { getIo } from '../realtime/gateway';
import { v4 as uuidv4 } from 'uuid';

let started = false;

export function startCronRunner() {
  if (started) return;
  started = true;

  // Check every minute — dispatch any schedule whose cron is due
  cron.schedule('* * * * *', () => {
    try {
      runDueSchedules();
    } catch (err) {
      console.error('[CRON] Erro ao executar schedules:', err);
    }
  });

  console.log('[CRON] Scheduler iniciado — verificando a cada minuto');
}

function runDueSchedules() {
  const db = getDb();
  const schedules = db.prepare("SELECT * FROM schedules WHERE enabled = 1").all() as any[];

  for (const sched of schedules) {
    if (!isScheduleDue(sched)) continue;

    const agent = db.prepare("SELECT * FROM agents WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT 1").get() as any;
    if (!agent) {
      console.warn(`[CRON] Schedule "${sched.label}" — nenhum agente online`);
      continue;
    }

    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
    if (!adminUser) continue;

    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO executions (id, test_case_id, agent_id, triggered_by, status, video_enabled, created_at)
      VALUES (?, ?, ?, ?, 'queued', 0, ?)
    `).run(id, sched.test_case_id || null, agent.id, adminUser.id, now);

    db.prepare('UPDATE schedules SET last_run = ? WHERE id = ?').run(now, sched.id);
    db.prepare('UPDATE agents SET status = ? WHERE id = ?').run('busy', agent.id);

    const io = getIo();

    const runConfig: any = {
      execId: id,
      test_case_id: sched.test_case_id || null,
      script_id: null,
      scriptContent: '',
      steps: [],
      framework: 'playwright',
      language: 'js',
      browsers: (() => { try { return JSON.parse(sched.browsers || '["chromium"]'); } catch { return ['chromium']; } })(),
      videoEnabled: false,
      timeout: 60000,
      backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
    };

    if (sched.test_case_id) {
      const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(sched.test_case_id) as any;
      if (tc) {
        try { runConfig.steps = JSON.parse(tc.steps || '[]'); } catch { runConfig.steps = []; }
      }
    }

    io.to(`agent:${agent.id}`).emit('exec:dispatch', runConfig);
    console.log(`[CRON] Schedule "${sched.label}" disparado → exec ${id} (agente: ${agent.name})`);
  }
}

/**
 * Returns true if a schedule should fire right now.
 * Logic: uses the cron interval in minutes and compares against last_run.
 * If no last_run, fires immediately.
 */
function isScheduleDue(sched: any): boolean {
  if (!sched.cron) return false;

  // Validate cron expression
  if (!cron.validate(sched.cron)) {
    console.warn(`[CRON] Expressão inválida para "${sched.label}": ${sched.cron}`);
    return false;
  }

  // No last_run → fire on first check
  if (!sched.last_run) return true;

  const intervalMs = getIntervalMs(sched.cron);
  if (intervalMs <= 0) return false;

  const lastRun = new Date(sched.last_run).getTime();
  const elapsed = Date.now() - lastRun;

  // Allow a 30-second grace window to avoid missing ticks
  return elapsed >= intervalMs - 30_000;
}

// Parses a cron expression and returns the interval in milliseconds.
// Handles: step minutes (e.g. every 5 min), step hours, fixed daily/weekly.
function getIntervalMs(cronExpr: string): number {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return 60 * 60 * 1000;

  const minute = parts[0];
  const hour = parts[1];
  const weekday = parts[4];

  const MINUTE_STEP = /^\*\/(\d+)$/;
  const HOUR_STEP = /^\*\/(\d+)$/;
  const FIXED_NUM = /^\d+$/;

  // Every N minutes: "*/N * * * *"
  const mMatch = minute.match(MINUTE_STEP);
  if (mMatch && hour === '*') {
    const n = parseInt(mMatch[1], 10);
    if (n >= 1 && n <= 59) return n * 60 * 1000;
  }

  // Every N hours: "0 */N * * *"
  const hMatch = hour.match(HOUR_STEP);
  if (minute === '0' && hMatch) {
    const n = parseInt(hMatch[1], 10);
    if (n >= 1 && n <= 23) return n * 60 * 60 * 1000;
  }

  // Weekly: "0 N * * W"
  if (minute === '0' && FIXED_NUM.test(hour) && weekday !== '*') {
    return 7 * 24 * 60 * 60 * 1000;
  }

  // Daily: "0 N * * *"
  if (minute === '0' && FIXED_NUM.test(hour)) {
    return 24 * 60 * 60 * 1000;
  }

  // Default: hourly
  return 60 * 60 * 1000;
}
