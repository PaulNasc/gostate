import Database from 'better-sqlite3';
import { Server as SocketServer } from 'socket.io';
import { parseJSON } from './utils';

export interface DispatchConfig {
  execId: string;
  test_case_id: string | null;
  script_id: string | null;
  scriptContent?: string;
  steps?: any[];
  browsers: string[];
  videoEnabled: boolean;
  screenshotEnabled: boolean;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Marks a single agent as busy and emits exec:dispatch to it.
 * Does NOT create the execution record — caller is responsible for that.
 */
export function dispatchToAgent(
  db: Database.Database,
  io: SocketServer,
  agentId: string,
  config: DispatchConfig,
): void {
  db.prepare("UPDATE agents SET status = 'busy' WHERE id = ?").run(agentId);
  io.to(`agent:${agentId}`).emit('exec:dispatch', {
    execId: config.execId,
    test_case_id: config.test_case_id,
    script_id: config.script_id,
    scriptContent: config.scriptContent ?? '',
    steps: config.steps ?? [],
    framework: 'playwright',
    language: 'js',
    browsers: config.browsers,
    videoEnabled: config.videoEnabled,
    screenshotEnabled: config.screenshotEnabled,
    timeout: config.timeout ?? 60000,
    backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
    env: config.env ?? {},
  });
}

/**
 * Resolves steps and scriptContent from DB for a given execution row,
 * then dispatches to the assigned agent. Safe to call even if agent is null.
 */
export function resolveAndDispatch(
  db: Database.Database,
  io: SocketServer,
  exec: {
    id: string;
    agent_id: string | null;
    test_case_id: string | null;
    script_id: string | null;
    video_enabled: number | boolean;
    screenshot_enabled: number | boolean;
    browsers: string;
    environment_id?: string | null;
    timeout?: number | null;
  },
): void {
  if (!exec.agent_id) return;

  let scriptContent = '';
  let steps: any[] = [];

  if (exec.script_id) {
    const script = db.prepare('SELECT content FROM scripts WHERE id = ?').get(exec.script_id) as any;
    if (script) scriptContent = script.content || '';
  }
  if (exec.test_case_id) {
    const tc = db.prepare('SELECT steps FROM test_cases WHERE id = ?').get(exec.test_case_id) as any;
    if (tc) steps = parseJSON<any[]>(tc.steps, []);
  }

  let envVars: Record<string, string> = {};
  if (exec.environment_id) {
    const env = db.prepare('SELECT variables FROM environments WHERE id = ?').get(exec.environment_id) as any;
    if (env) {
      const vars: Array<{ key: string; value: string }> = parseJSON(env.variables, []);
      for (const v of vars) { if (v.key) envVars[v.key] = v.value; }
    }
  }

  const browsers = parseJSON<string[]>(exec.browsers, ['chromium']);

  dispatchToAgent(db, io, exec.agent_id, {
    execId: exec.id,
    test_case_id: exec.test_case_id,
    script_id: exec.script_id,
    scriptContent,
    steps,
    browsers,
    videoEnabled: !!exec.video_enabled,
    screenshotEnabled: exec.screenshot_enabled !== 0,
    timeout: exec.timeout ?? 60000,
    env: envVars,
  });
}
