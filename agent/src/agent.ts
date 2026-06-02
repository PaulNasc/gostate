import 'dotenv/config';
import { io, Socket } from 'socket.io-client';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import FormData from 'form-data';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const WORK_DIR = path.join(os.tmpdir(), 'gostate-agent');
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.AGENT_MAX_CONCURRENT || '3', 10));

const LIVE_ACTION_METHODS = ['goto', 'click', 'fill', 'hover', 'dblclick', 'selectOption', 'press', 'check', 'uncheck', 'setInputFiles'];

if (!AGENT_TOKEN) {
  console.error('[Agent] AGENT_TOKEN não configurado. Defina a variável de ambiente AGENT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

// --- Concurrency semaphore ---
let activeSlots = 0;
const pendingQueue: ExecConfig[] = [];
const inflightExecs = new Set<string>();

function acquireSlot(config: ExecConfig): boolean {
  if (activeSlots < MAX_CONCURRENT) {
    activeSlots++;
    console.log(`[Agent] Slot adquirido para ${config.execId} (${activeSlots}/${MAX_CONCURRENT} ativos)`);
    return true;
  }
  pendingQueue.push(config);
  console.log(`[Agent] Fila: ${config.execId} aguardando (${pendingQueue.length} na fila, ${activeSlots}/${MAX_CONCURRENT} ativos)`);
  return false;
}

function releaseSlot() {
  activeSlots--;
  const next = pendingQueue.shift();
  if (next) {
    console.log(`[Agent] Fila: despachando ${next.execId} (${pendingQueue.length} restantes na fila)`);
    activeSlots++;
    runExecution(next).finally(() => { inflightExecs.delete(next.execId); releaseSlot(); });
  } else {
    console.log(`[Agent] Slot liberado (${activeSlots}/${MAX_CONCURRENT} ativos)`);
  }
}

function dispatch(config: ExecConfig) {
  if (inflightExecs.has(config.execId)) {
    console.log(`[Agent] Ignorando dispatch duplicado para ${config.execId}`);
    return;
  }
  inflightExecs.add(config.execId);
  if (acquireSlot(config)) {
    runExecution(config).finally(() => { inflightExecs.delete(config.execId); releaseSlot(); });
  }
}
// --- End concurrency ---

let socket: Socket;

function connect() {
  console.log(`[Agent] Conectando em ${BACKEND_URL}... (paralelo máx: ${MAX_CONCURRENT})`);
  socket = io(BACKEND_URL, {
    auth: { agentToken: AGENT_TOKEN },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log(`[Agent] Conectado ao backend (id=${socket.id})`);
    heartbeat();
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Agent] Desconectado: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.error(`[Agent] Erro de conexão: ${err.message}`);
  });

  socket.on('exec:dispatch', (config: ExecConfig) => {
    console.log(`[Agent] Recebida execução: ${config.execId}`);
    dispatch(config);
  });

  socket.on('exec:pause', (data: { execId: string }) => {
    const pid = pausedExecs.get(data.execId);
    if (!pid) { console.log(`[Agent] Pause ignorado — execId ${data.execId} não encontrada`); return; }
    try {
      pausedFlags.set(data.execId, true);
      if (process.platform !== 'win32') {
        // Send SIGSTOP to the entire process group to pause Playwright inside Docker
        try { process.kill(-pid, 'SIGSTOP'); } catch {
          // fallback: send to direct PID if group kill fails
          try { process.kill(pid, 'SIGSTOP'); } catch {}
        }
      }
      console.log(`[Agent] Execução pausada: ${data.execId} (PID ${pid})`);
      socket.emit('exec:paused', { execId: data.execId });
    } catch (e: any) {
      console.error(`[Agent] Erro ao pausar ${data.execId}: ${e.message}`);
      // Even if signal fails, mark as paused in software
      pausedFlags.set(data.execId, true);
      socket.emit('exec:paused', { execId: data.execId });
    }
  });

  socket.on('exec:resume', (data: { execId: string }) => {
    const pid = pausedExecs.get(data.execId);
    if (!pid) { console.log(`[Agent] Resume ignorado — execId ${data.execId} não encontrada`); return; }
    try {
      pausedFlags.set(data.execId, false);
      if (process.platform !== 'win32') {
        try { process.kill(-pid, 'SIGCONT'); } catch {
          try { process.kill(pid, 'SIGCONT'); } catch {}
        }
      }
      console.log(`[Agent] Execução retomada: ${data.execId} (PID ${pid})`);
      socket.emit('exec:resumed', { execId: data.execId });
    } catch (e: any) {
      console.error(`[Agent] Erro ao retomar ${data.execId}: ${e.message}`);
      pausedFlags.set(data.execId, false);
      socket.emit('exec:resumed', { execId: data.execId });
    }
  });

  // Live code patch: rewrite the script file so next run (after restart) picks up changes
  socket.on('exec:code_patch', (data: { execId: string; content: string }) => {
    try {
      const scriptPath = path.join(WORK_DIR, data.execId, 'test.spec.js');
      if (fs.existsSync(scriptPath) && typeof data.content === 'string') {
        fs.writeFileSync(scriptPath, data.content, 'utf-8');
        console.log(`[Agent] Script atualizado via code_patch: ${data.execId}`);
        socket.emit('exec:code_patched', { execId: data.execId, ok: true });
      }
    } catch (e: any) {
      console.error(`[Agent] Erro ao aplicar code_patch: ${e.message}`);
      socket.emit('exec:code_patched', { execId: data.execId, ok: false, error: e.message });
    }
  });
}

function heartbeat() {
  const interval = setInterval(() => {
    if (socket.connected) {
      socket.emit('agent:heartbeat');
    } else {
      clearInterval(interval);
    }
  }, 15000);
}

interface ExecConfig {
  execId: string;
  test_case_id?: string;
  script_id?: string;
  scriptContent?: string;
  steps?: any[];
  framework: string;
  language: string;
  browsers: string[];
  videoEnabled: boolean;
  screenshotEnabled?: boolean;
  timeout: number;
  backendUrl: string;
  env?: Record<string, string>;
}

// Track paused executions — key=execId, value=child PID
const pausedExecs = new Map<string, number>();
// Software pause flag — pauses live artifact upload without killing process
const pausedFlags = new Map<string, boolean>();

async function runExecution(config: ExecConfig) {
  const { execId, backendUrl } = config;
  const execWorkDir = path.join(WORK_DIR, execId);
  fs.mkdirSync(execWorkDir, { recursive: true });

  // Always prefer the env-level BACKEND_URL (set when container started) over the
  // backendUrl embedded in the runConfig payload, which may carry 'localhost' and
  // therefore be unreachable from inside Docker.
  const apiBase = (() => {
    const fromEnv = BACKEND_URL;
    const fromPayload = backendUrl || '';
    const isLocalhost = (u: string) =>
      u.includes('localhost') || u.includes('127.0.0.1');
    if (!isLocalhost(fromEnv)) return fromEnv;          // env is a real host — use it
    if (!isLocalhost(fromPayload)) return fromPayload;   // payload has a real host — use it
    return fromEnv;                                      // both localhost, nothing we can do
  })();

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHFABCDsuJnhliM]|\x1B\([A-Z]|\x1B=/g, '');
  const emitLog = (line: string) => {
    const clean = stripAnsi(typeof line === 'string' ? line : String(line));
    socket.emit('exec:log', { execId, line: clean });
    process.stdout.write(clean);
  };

  try {
    await patchStatus(apiBase, execId, 'running');

    let scriptPath: string;
    if (config.scriptContent && config.scriptContent.trim()) {
      scriptPath = path.join(execWorkDir, 'test.spec.js');
      fs.writeFileSync(scriptPath, instrumentScriptContent(config.scriptContent, config.screenshotEnabled !== false), 'utf-8');
    } else if (config.steps && config.steps.length > 0) {
      scriptPath = path.join(execWorkDir, 'test.spec.js');
      const code = generatePlaywrightCode(config.steps, config.screenshotEnabled !== false, config.env);
      fs.writeFileSync(scriptPath, code, 'utf-8');
    } else {
      // fallback: smoke test básico
      scriptPath = path.join(execWorkDir, 'test.spec.js');
      fs.writeFileSync(scriptPath, `const { test, expect } = require('@playwright/test');
test('smoke', async ({ page }) => {
  await page.goto('about:blank');
  expect(true).toBe(true);
});
`, 'utf-8');
      emitLog('[goState Agent] Nenhum script/steps fornecido — executando smoke test\n');
    }

    // Detect installed browsers before generating config
    const browsersInstallPath = (() => {
      const candidates = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '',
        path.join(os.homedir(), '.cache', 'ms-playwright'),
        '/root/.cache/ms-playwright',
        '/home/.cache/ms-playwright',
        path.join(AGENT_NODE_MODULES, 'playwright-core', '.local-browsers'),
      ].filter(Boolean) as string[];
      return candidates.find(p => fs.existsSync(p)) || '';
    })();

    const requestedBrowsers = Array.isArray(config.browsers) ? config.browsers : ['chromium'];
    const availableBrowsers = requestedBrowsers.filter(b => {
      if (!browsersInstallPath) return b === 'chromium';
      const dirPrefix = b === 'webkit' ? 'webkit' : b === 'firefox' ? 'firefox' : 'chromium';
      try { return fs.readdirSync(browsersInstallPath).some(d => d.startsWith(dirPrefix)); }
      catch { return b === 'chromium'; }
    });

    if (availableBrowsers.length === 0) {
      emitLog(`[goState Agent] AVISO: browsers solicitados (${requestedBrowsers.join(', ')}) não encontrados. Usando chromium como fallback.\n`);
      availableBrowsers.push('chromium');
    } else if (availableBrowsers.length < requestedBrowsers.length) {
      const missing = requestedBrowsers.filter(b => !availableBrowsers.includes(b));
      emitLog(`[goState Agent] AVISO: browsers não instalados ignorados: ${missing.join(', ')}\n`);
    }

    const playwrightConfig = generatePlaywrightConfig(execWorkDir, config, availableBrowsers);
    const configPath = path.join(execWorkDir, 'playwright.config.js');
    fs.writeFileSync(configPath, playwrightConfig, 'utf-8');

    emitLog(`[goState Agent] Iniciando execução ${execId}\n`);
    emitLog(`[goState Agent] Framework: ${config.framework} | Browsers: ${availableBrowsers.join(', ')}\n`);
    emitLog(`[goState Agent] Timeout: ${config.timeout}ms\n\n`);

    const startTime = Date.now();
    const { exitCode, logs, stepResults } = await runPlaywright(execWorkDir, configPath, scriptPath, config, apiBase, emitLog);
    const duration = Date.now() - startTime;

    const finalStatus = exitCode === 0 ? 'passed' : 'failed';
    emitLog(`\n[goState Agent] Execução finalizada: ${finalStatus.toUpperCase()} (${duration}ms)\n`);

    await uploadArtifacts(apiBase, execId, execWorkDir, emitLog);

    await patchStatus(apiBase, execId, finalStatus, stripAnsi(logs), duration, stepResults);

  } catch (err: any) {
    const msg = err?.message || String(err);
    emitLog(`\n[goState Agent] ERRO: ${msg}\n`);
    await patchStatus(apiBase, execId, 'error', msg, 0, []);
  } finally {
    setTimeout(() => {
      fs.rmSync(execWorkDir, { recursive: true, force: true });
    }, 60000);
  }
}

// Resolve agent's own node_modules using require.resolve for reliability
const AGENT_NODE_MODULES = (() => {
  try {
    // require.resolve finds the actual installed package, regardless of cwd
    const pwMain = require.resolve('@playwright/test/package.json');
    return path.join(path.dirname(pwMain), '..', '..');
  } catch {
    // fallbacks
    const candidates = [
      path.join(__dirname, '..', 'node_modules'),
      path.join(__dirname, '..', '..', 'agent', 'node_modules'),
      path.join(process.cwd(), 'agent', 'node_modules'),
    ];
    return candidates.find(p => fs.existsSync(path.join(p, '@playwright', 'test'))) || candidates[0];
  }
})();

// Warn if playwright browsers are not linked
(() => {
  const localBrowsers = path.join(AGENT_NODE_MODULES, 'playwright-core', '.local-browsers');
  if (!fs.existsSync(localBrowsers)) {
    console.warn('[Agent] AVISO: Browsers do Playwright não encontrados em', localBrowsers);
    console.warn('[Agent] Execute: cmd /c mklink /J "node_modules\\playwright-core\\.local-browsers" "%LOCALAPPDATA%\\ms-playwright"');
  }
})();

function generatePlaywrightCode(steps: any[], screenshotEnabled = false, envVars: Record<string, string> = {}): string {
  let code = "const { test, expect } = require('@playwright/test');\nconst path = require('path');\n\ntest('goState Test', async ({ page }) => {\n";
  let stepIdx = 0;

  const replaceEnv = (str: string) => {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{([^\}]+)\}\}/g, (_, key) => envVars[key] || '');
  };

  for (const step of steps) {
    const p = step.params || {};
    // Replace env variables in all params
    for (const k in p) {
      if (typeof p[k] === 'string') {
        p[k] = replaceEnv(p[k]);
      }
    }
    
    switch (step.type) {
      case 'goto':
        code += `  await page.goto(${JSON.stringify(p.url || 'about:blank')});
`; break;
      case 'click':
        code += `  await page.click(${JSON.stringify(p.selector || 'body')});
`; break;
      case 'fill':
        code += `  await page.fill(${JSON.stringify(p.selector || 'input')}, ${JSON.stringify(p.value || '')});
`; break;
      case 'expect_text':
        code += `  await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toContainText(${JSON.stringify(p.text || '')});
`; break;
      case 'expect_visible':
        code += `  await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toBeVisible();
`; break;
      case 'wait_for':
        code += `  await page.waitForSelector(${JSON.stringify(p.selector || 'body')});
`; break;
      case 'screenshot': {
        const fname = path.join(WORK_DIR, p.filename || 'screenshot.png');
        code += `  await page.screenshot({ path: ${JSON.stringify(fname)} });
`; break;
      }
      case 'wait_ms':
        code += `  await page.waitForTimeout(${parseInt(p.ms || '1000', 10)});
`; break;
      case 'hover':
        code += `  await page.hover(${JSON.stringify(p.selector || 'body')});
`; break;
      case 'double_click':
        code += `  await page.dblclick(${JSON.stringify(p.selector || 'body')});
`; break;
      case 'select_option':
        code += `  await page.selectOption(${JSON.stringify(p.selector || 'select')}, ${JSON.stringify(p.value || '')});
`; break;
      case 'clear':
        code += `  await page.fill(${JSON.stringify(p.selector || 'input')}, '');
`; break;
      case 'keyboard':
        code += `  await page.keyboard.press(${JSON.stringify(p.key || 'Enter')});
`; break;
      case 'scroll': {
        const dir = p.direction || 'down';
        const sel = p.selector || null;
        if (dir === 'bottom') {
          code += `  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
`; break;
        } else if (dir === 'top') {
          code += `  await page.evaluate(() => window.scrollTo(0, 0));
`; break;
        } else if (sel) {
          const delta = dir === 'up' ? -300 : 300;
          code += `  await page.locator(${JSON.stringify(sel)}).evaluate(el => el.scrollBy(0, ${delta}));
`; break;
        } else {
          const delta = dir === 'up' ? -300 : 300;
          code += `  await page.evaluate(() => window.scrollBy(0, ${delta}));
`; break;
        }
      }
      case 'expect_hidden':
        code += `  await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toBeHidden();
`; break;
      case 'expect_value':
        code += `  await expect(page.locator(${JSON.stringify(p.selector || 'input')})).toHaveValue(${JSON.stringify(p.value || '')});
`; break;
      case 'assert_url':
        code += `  await expect(page).toHaveURL(/${p.url ? p.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}/);
`; break;
      case 'assert_title':
        code += `  await expect(page).toHaveTitle(/${p.title ? p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}/);
`; break;
      case 'wait_for_url':
        code += `  await page.waitForURL(${JSON.stringify(`**${p.url || '/'}**`)});
`; break;
      case 'api_call': {
        const method = (p.method || 'GET').toLowerCase();
        const body = p.body ? `, { data: ${p.body} }` : '';
        code += `  await page.request.${method}(${JSON.stringify(p.url || '')}${body});
`; break;
      }
      default:
        code += `  // step desconhecido: ${step.type}\n`;
    }
    // Inject per-step screenshot when enabled (after action steps, not after waits/assertions)
    if (screenshotEnabled && ['goto', 'click', 'fill', 'hover', 'double_click', 'select_option', 'clear', 'keyboard', 'scroll'].includes(step.type)) {
      code += `  await page.screenshot({ path: path.join('test-results', 'step-${stepIdx}.png') });\n`;
    }
    stepIdx++;
  }
  code += `});
`;
  return code;
}

function instrumentScriptContent(scriptContent: string, screenshotEnabled = false): string {
  if (!screenshotEnabled) return scriptContent;

  // Wrap each test to take exactly 1 screenshot after completion
  // This avoids multiple screenshots per action method
  const prelude = `const { test: __gostateTest } = require('@playwright/test');
const path = require('path');
let __gostateStepScreenshotIdx = 0;
__gostateTest.afterEach(async ({ page }, testInfo) => {
  try {
    await page.screenshot({ path: path.join('test-results', 'step-' + (__gostateStepScreenshotIdx++) + '.png') });
  } catch {}
});

`;

  return prelude + scriptContent;
}

function generatePlaywrightConfig(workDir: string, config: ExecConfig, browsers?: string[]): string {
  const effectiveBrowsers = browsers && browsers.length > 0 ? browsers : (Array.isArray(config.browsers) ? config.browsers : ['chromium']);
  const projects = effectiveBrowsers.map(b => `{ name: '${b}', use: { browserName: '${b}' } }`).join(', ');
  const video = config.videoEnabled ? `'on'` : `'retain-on-failure'`;
  // Always 'off' — per-step screenshots are injected via afterEach in the script itself,
  // so Playwright's built-in 'on' mode (which fires after EVERY action) must not run.
  const screenshot = `'off'`;
  const wdFwd = workDir.replace(/\\/g, '/');

  // Resolve the custom reporter path (lives next to the agent source)
  const reporterPath = path.join(__dirname, 'gostate-reporter.js').replace(/\\/g, '/');
  const eventsFile = path.join(workDir, 'events.jsonl').replace(/\\/g, '/');

  return `
module.exports = {
  testMatch: ['**/*.spec.js'],
  timeout: ${config.timeout},
  retries: 0,
  reporter: [
    ['json', { outputFile: '${wdFwd}/results.json' }],
    ['html', { outputFolder: '${wdFwd}/html-report', open: 'never' }],
    ['${reporterPath}', { eventsFile: '${eventsFile}' }],
  ],
  use: {
    headless: true,
    video: ${video},
    screenshot: ${screenshot},
    trace: 'off',
  },
  outputDir: '${wdFwd}/test-results',
  projects: [${projects}],
};
`;
}

function runPlaywright(
  workDir: string,
  configPath: string,
  scriptPath: string,
  config: ExecConfig,
  apiBase: string,
  emitLog: (line: string) => void
): Promise<{ exitCode: number; logs: string; stepResults: any[] }> {
  return new Promise((resolve) => {
    let logs = '';
    let resolved = false;

    const eventsFile = path.join(workDir, 'events.jsonl');
    const uploadedManifestPath = path.join(workDir, '.uploaded-artifacts.json');
    let eventsWatcher: ReturnType<typeof setInterval> | null = null;
    let eventsOffset = 0;
    let artifactWatcher: ReturnType<typeof setInterval> | null = null;
    const uploadedArtifacts = readUploadedArtifactManifest(uploadedManifestPath);

    // Watch events.jsonl and emit live step events via socket
    const startEventsWatcher = () => {
      eventsWatcher = setInterval(() => {
        try {
          if (!fs.existsSync(eventsFile)) return;
          const content = fs.readFileSync(eventsFile, 'utf-8');
          if (content.length <= eventsOffset) return;
          const newData = content.slice(eventsOffset);
          eventsOffset = content.length;
          const lines = newData.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const evt = JSON.parse(line);
              socket.emit('exec:step', { execId: config.execId, ...evt });
            } catch {}
          }
        } catch {}
      }, 200);
    };

    const stopEventsWatcher = () => {
      if (eventsWatcher) { clearInterval(eventsWatcher); eventsWatcher = null; }
      // Flush remaining events
      try {
        if (fs.existsSync(eventsFile)) {
          const content = fs.readFileSync(eventsFile, 'utf-8');
          if (content.length > eventsOffset) {
            const lines = content.slice(eventsOffset).split('\n').filter(Boolean);
            for (const line of lines) {
              try {
                const evt = JSON.parse(line);
                socket.emit('exec:step', { execId: config.execId, ...evt });
              } catch {}
            }
          }
        }
      } catch {}
    };

    const stopArtifactWatcher = () => {
      if (artifactWatcher) {
        clearInterval(artifactWatcher);
        artifactWatcher = null;
      }
    };

    const scanAndUploadArtifacts = async () => {
      const testResultsDir = path.join(workDir, 'test-results');
      // Only upload: our injected step-N.png files + videos.
      // Deliberately ignore .jpeg/.jpg (Playwright trace frames), test-failed-*.png, etc.
      const candidates = findArtifactFiles(testResultsDir, ['.webm', '.mp4', '.png']);
      const allowed = candidates.filter(f => isAllowedArtifact(f));

      for (const file of allowed) {
        const stat = safeStat(file);
        if (!stat || !stat.isFile()) continue;
        const artifactKey = buildArtifactKey(file, stat.size, stat.mtimeMs);
        if (uploadedArtifacts.has(artifactKey)) continue;
        try {
          await uploadArtifactFile(apiBase, config.execId, file, uploadedArtifacts.size, emitLog);
          uploadedArtifacts.add(artifactKey);
          writeUploadedArtifactManifest(uploadedManifestPath, uploadedArtifacts);
        } catch (e: any) {
          emitLog(`[goState Agent] Falha ao enviar artefato ${path.basename(file)}: ${e.message}\n`);
        }
      }
    };

    artifactWatcher = setInterval(() => {
      // Skip upload while execution is software-paused
      if (pausedFlags.get(config.execId)) return;
      void scanAndUploadArtifacts();
    }, 1000);

    const doResolve = async (exitCode: number) => {
      if (resolved) return;
      resolved = true;
      stopEventsWatcher();
      stopArtifactWatcher();
      await scanAndUploadArtifacts();
      pausedExecs.delete(config.execId);
      pausedFlags.delete(config.execId);
      let stepResults: any[] = [];
      const resultsFile = path.join(workDir, 'results.json');
      if (fs.existsSync(resultsFile)) {
        try {
          const json = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
          stepResults = parsePlaywrightResults(json);
        } catch {}
      }
      resolve({ exitCode, logs, stepResults });
    };

    const binExt = process.platform === 'win32' ? '.cmd' : '';
    const playwrightBin = path.join(AGENT_NODE_MODULES, '.bin', `playwright${binExt}`);
    const args = ['test', path.basename(scriptPath), `--config=${configPath}`];
    emitLog(`[goState Agent] $ ${playwrightBin} ${args.join(' ')}\n`);

    const browsersPath = (() => {
      const candidates = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '',
        path.join(os.homedir(), '.cache', 'ms-playwright'),
        '/root/.cache/ms-playwright',
        path.join(AGENT_NODE_MODULES, 'playwright-core', '.local-browsers'),
      ].filter(Boolean) as string[];
      return candidates.find(p => fs.existsSync(p)) || '';
    })();

    const hardTimeout = config.timeout + 60000;
    const killTimer = setTimeout(() => {
      if (!resolved) {
        emitLog(`\n[goState Agent] TIMEOUT: processo encerrado após ${hardTimeout}ms\n`);
        try { child.kill('SIGKILL'); } catch {}
        void doResolve(1);
      }
    }, hardTimeout);

    // Use spawn with detached=false but create a new process group so SIGSTOP/-pid works in Docker
    const child = spawn(playwrightBin, args, {
      cwd: workDir,
      detached: false,
      env: {
        ...process.env,
        ...(config.env || {}),
        NODE_PATH: AGENT_NODE_MODULES,
        ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {}),
        GOSTATE_EVENTS_FILE: eventsFile,
        GOSTATE_STEP_SCREENSHOTS: config.screenshotEnabled !== false ? '1' : '0',
        GOSTATE_OUTPUT_DIR: path.join(workDir, 'test-results'),
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        TERM: 'dumb',
      },
    });

    // Store PID for pause/resume
    if (child.pid) {
      pausedExecs.set(config.execId, child.pid);
    }

    startEventsWatcher();

    child.stdout?.on('data', (d: Buffer | string) => { const s = d.toString('utf8'); logs += s; emitLog(s); });
    child.stderr?.on('data', (d: Buffer | string) => { const s = d.toString('utf8'); logs += s; emitLog(s); });

    child.on('error', (err) => {
      emitLog(`\n[goState Agent] Erro ao executar Playwright: ${err.message}\n`);
      clearTimeout(killTimer);
      void doResolve(1);
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      void doResolve(code ?? 1);
    });
  });
}

function isUserStep(step: any): boolean {
  if (!step || !step.title) return false;
  const cat = step.category || '';
  const title: string = step.title || '';
  // Accept test.step blocks, expect assertions, page actions and locator actions
  if (cat === 'test.step' || cat === 'expect') return true;
  if (title.startsWith('page.') || title.startsWith('locator.') || title.startsWith('expect(')) return true;
  // Reject internal Playwright hooks and fixture lifecycle
  const skipPrefixes = ['Before Hooks', 'After Hooks', 'fixture:', 'Worker Cleanup', 'browserType.', 'browser.', 'context.', 'tracing.'];
  if (skipPrefixes.some(p => title.startsWith(p))) return false;
  // Reject lines that look like internal titles
  return cat === 'action' || cat === 'navigation';
}

function parsePlaywrightResults(json: any): any[] {
  const steps: any[] = [];
  let idx = 0;

  const visitStep = (step: any) => {
    if (!step) return;
    const nested = Array.isArray(step.steps) ? step.steps : [];
    if (isUserStep(step)) {
      steps.push({
        step_index: idx++,
        name: step.title,
        type: step.category || 'action',
        status: step.error ? 'failed' : 'passed',
        duration_ms: typeof step.duration === 'number' ? step.duration : null,
        error_message: step.error?.message || null,
        timestamp_ms: step.startTime ? new Date(step.startTime).getTime() : null,
      });
      // Visit nested steps (e.g. inside test.step blocks)
      nested.forEach(visitStep);
    } else {
      // Skip this node but still visit children (e.g. steps inside Before Hooks that wrap user steps)
      nested.forEach(visitStep);
    }
  };

  for (const suite of json.suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          for (const step of result.steps || []) visitStep(step);
        }
      }
    }
  }
  return steps;
}

function findArtifactFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    try {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (exts.some(e => entry.name.toLowerCase().endsWith(e))) results.push(full);
      }
    } catch {}
  };
  walk(dir);
  return results;
}

function safeStat(file: string) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function buildArtifactKey(file: string, size: number, mtimeMs: number) {
  return `${artifactType(file)}:${path.basename(file)}:${size}:${mtimeMs}`;
}

function readUploadedArtifactManifest(manifestPath: string): Set<string> {
  try {
    if (!fs.existsSync(manifestPath)) return new Set<string>();
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeUploadedArtifactManifest(manifestPath: string, uploadedArtifacts: Set<string>) {
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(Array.from(uploadedArtifacts)), 'utf-8');
  } catch {}
}

async function uploadArtifactFile(apiBase: string, execId: string, file: string, sequence: number, emitLog: (l: string) => void) {
  const type = artifactType(file);
  const filename = `${type}_${sequence}_${path.basename(file)}`;
  const stat = safeStat(file);
  const form = new FormData();
  form.append('file', fs.createReadStream(file), { filename });
  form.append('type', type);
  form.append('timestamp_ms', String(Math.round(stat?.mtimeMs || Date.now())));
  await axios.post(`${apiBase}/api/executions/${execId}/artifacts`, form, {
    headers: { ...form.getHeaders(), 'X-Agent-Token': AGENT_TOKEN },
    maxBodyLength: Infinity,
  });
  emitLog(`[goState Agent] Artefato enviado: ${filename} (${type})\n`);
}

function artifactType(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.webm') || lower.endsWith('.mp4')) return 'video';
  if (lower.endsWith('.zip')) return 'trace';
  if (lower.endsWith('.html')) return 'html_report';
  if (lower.endsWith('.json')) return 'json_report';
  return 'screenshot';
}

/**
 * Whitelist filter — only our injected step-N.png screenshots and videos are
 * ever uploaded to the backend.  Everything else (Playwright trace .jpeg frames,
 * test-failed-*.png, html-report assets, etc.) stays on disk only.
 */
function isAllowedArtifact(file: string): boolean {
  const lower = file.toLowerCase();
  const base = path.basename(lower);
  // Allow videos
  if (lower.endsWith('.webm') || lower.endsWith('.mp4')) return true;
  // Allow only our named screenshots: step-N.png or manual-screenshot*.png
  if (lower.endsWith('.png')) {
    return /^step-\d+\.png$/.test(base) || base.startsWith('manual-screenshot');
  }
  return false;
}

async function uploadArtifacts(apiBase: string, execId: string, workDir: string, emitLog: (l: string) => void) {
  const testResultsDir = path.join(workDir, 'test-results');
  const uploadedManifestPath = path.join(workDir, '.uploaded-artifacts.json');
  const uploadedArtifacts = readUploadedArtifactManifest(uploadedManifestPath);

  // Only scan for .png and video — then whitelist-filter to step-N.png + videos
  const allFiles = findArtifactFiles(testResultsDir, ['.webm', '.mp4', '.png']);
  const allowed = allFiles.filter(f => isAllowedArtifact(f));

  let uploaded = 0;
  for (const file of allowed) {
    try {
      const stat = safeStat(file);
      if (!stat) continue;
      const artifactKey = buildArtifactKey(file, stat.size, stat.mtimeMs);
      if (uploadedArtifacts.has(artifactKey)) continue;
      await uploadArtifactFile(apiBase, execId, file, uploaded, emitLog);
      uploadedArtifacts.add(artifactKey);
      writeUploadedArtifactManifest(uploadedManifestPath, uploadedArtifacts);
      uploaded++;
    } catch (e: any) {
      emitLog(`[goState Agent] Falha ao enviar artefato ${path.basename(file)}: ${e.message}\n`);
    }
  }

  if (uploaded === 0) emitLog('[goState Agent] Nenhum artefato encontrado para enviar\n');
}


async function patchStatus(
  apiBase: string,
  execId: string,
  status: string,
  logs = '',
  duration_ms = 0,
  steps: any[] = []
) {
  try {
    await axios.patch(`${apiBase}/api/executions/${execId}/status`, { status, logs, duration_ms, steps }, {
      headers: { 'X-Agent-Token': AGENT_TOKEN },
      timeout: 10000,
    });
  } catch (e: any) {
    console.error(`[Agent] Falha ao atualizar status via HTTP: ${e.message}`);
    // Fallback: emit via socket so the backend can still update the execution
    // even when the HTTP endpoint is unreachable (e.g. localhost vs host.docker.internal mismatch)
    try {
      if (socket?.connected) {
        socket.emit('exec:status', { execId, status, logs, duration_ms, steps });
        console.log(`[Agent] Status emitido via socket como fallback: ${execId} → ${status}`);
      }
    } catch (se: any) {
      console.error(`[Agent] Fallback socket também falhou: ${se.message}`);
    }
  }
}

connect();
console.log('[Agent] goState Agent iniciado. Aguardando execuções...');
