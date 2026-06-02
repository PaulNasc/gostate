import cron from 'node-cron';
import { getDb } from '../db/schema';
import { getIo } from '../realtime/gateway';
import { v4 as uuidv4 } from 'uuid';
import { dispatchToAgent } from '../shared/dispatch';
import { parseJSON } from '../shared/utils';
import { cleanupOldArtifacts } from './artifact-cleanup';

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

  // Daily cleanup of old artifacts and logs (03:00 AM)
  cron.schedule('0 3 * * *', () => {
    try {
      cleanupOldArtifacts();
    } catch (err) {
      console.error('[CRON] Erro ao limpar artefatos:', err);
    }
  });

  console.log('[CRON] Scheduler iniciado — verificando a cada minuto');
  console.log('[CRON] Cleanup de artefatos agendado — 03:00 diariamente');
}

function runDueSchedules() {
  const db = getDb();
  const schedules = db.prepare("SELECT * FROM schedules WHERE enabled = 1").all() as any[];

  for (const sched of schedules) {
    if (!isScheduleDue(sched)) continue;

    const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
    if (!adminUser) continue;

    const now = new Date().toISOString();
    const browsers = (() => { try { return JSON.parse(sched.browsers || '["chromium"]'); } catch { return ['chromium']; } })();
    const browsersJson = JSON.stringify(browsers);
    const io = getIo();

    // --- Test Plan schedule: dispatch all TCs in the plan ---
    if (sched.test_plan_id) {
      const plan = db.prepare('SELECT * FROM test_plans WHERE id = ?').get(sched.test_plan_id) as any;
      if (!plan) {
        console.warn(`[CRON] Schedule "${sched.label}" — plano ${sched.test_plan_id} não encontrado`);
        continue;
      }

      const tcIds: string[] = (() => { try { return JSON.parse(plan.test_case_ids || '[]'); } catch { return []; } })();
      if (tcIds.length === 0) {
        console.warn(`[CRON] Schedule "${sched.label}" — plano sem casos de teste`);
        continue;
      }

      const maxParallel = plan.max_parallel || 1;
      const agents = db.prepare(
        "SELECT * FROM agents WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT ?"
      ).all(maxParallel) as any[];

      if (agents.length === 0) {
        console.warn(`[CRON] Schedule "${sched.label}" — nenhum agente online`);
        continue;
      }

      const executionIds: string[] = [];
      const dispatchPlan = db.transaction(() => {
        for (let i = 0; i < tcIds.length; i++) {
          const tcId = tcIds[i];
          const tc = db.prepare('SELECT id, steps FROM test_cases WHERE id = ?').get(tcId) as any;
          if (!tc) continue;

          const agent = agents[i % agents.length];
          const execId = uuidv4();
          executionIds.push(execId);

          db.prepare(`
            INSERT INTO executions (id, test_plan_id, test_case_id, agent_id, triggered_by, status, video_enabled, screenshot_enabled, browsers, created_at, schedule_id)
            VALUES (?, ?, ?, ?, ?, 'queued', 0, 1, ?, ?, ?)
          `).run(execId, plan.id, tcId, agent.id, adminUser.id, browsersJson, now, sched.id);

          const steps = parseJSON<any[]>(tc.steps, []);
          dispatchToAgent(db, io, agent.id, {
            execId, test_case_id: tcId, script_id: null,
            steps, browsers, videoEnabled: false, screenshotEnabled: true,
          });
        }
        db.prepare('UPDATE schedules SET last_run = ? WHERE id = ?').run(now, sched.id);
      });

      dispatchPlan();
      io.emit('plan:started', { planId: plan.id, executionIds, total: executionIds.length });
      console.log(`[CRON] Schedule "${sched.label}" (plano) disparado → ${executionIds.length} execuções`);
      continue;
    }

    // --- Single test case schedule ---
    const agent = db.prepare("SELECT * FROM agents WHERE status = 'online' ORDER BY last_heartbeat DESC LIMIT 1").get() as any;
    if (!agent) {
      console.warn(`[CRON] Schedule "${sched.label}" — nenhum agente online`);
      continue;
    }

    const id = uuidv4();

    // Resolve script_id from schedule's project if no test_case_id
    // so that fireWebhooks can JOIN back to the project correctly via script.project_id
    const schedScriptId: string | null = (() => {
      if (sched.test_case_id) return null;
      if (!sched.project_id) return null;
      const s = db.prepare('SELECT id FROM scripts WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(sched.project_id) as any;
      return s?.id || null;
    })();

    const dispatchSingle = db.transaction(() => {
      db.prepare(`
        INSERT INTO executions (id, test_case_id, script_id, agent_id, triggered_by, status, video_enabled, screenshot_enabled, browsers, created_at, schedule_id)
        VALUES (?, ?, ?, ?, ?, 'queued', 0, 1, ?, ?, ?)
      `).run(id, sched.test_case_id || null, schedScriptId || null, agent.id, adminUser.id, browsersJson, now, sched.id);

      db.prepare('UPDATE schedules SET last_run = ? WHERE id = ?').run(now, sched.id);
      });

    dispatchSingle();

    const steps = (() => {
      if (!sched.test_case_id) return [];
      const tc = db.prepare('SELECT steps FROM test_cases WHERE id = ?').get(sched.test_case_id) as any;
      return parseJSON<any[]>(tc?.steps, []);
    })();

    dispatchToAgent(db, io, agent.id, {
      execId: id,
      test_case_id: sched.test_case_id || null,
      script_id: schedScriptId || null,
      steps,
      browsers,
      videoEnabled: false,
      screenshotEnabled: true,
    });

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
