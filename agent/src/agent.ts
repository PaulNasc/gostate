import 'dotenv/config';
import { io, Socket } from 'socket.io-client';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import FormData from 'form-data';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const WORK_DIR = path.join(os.tmpdir(), 'gostate-agent');
const MAX_CONCURRENT = Math.max(1, parseInt(process.env.AGENT_MAX_CONCURRENT || '3', 10));

if (!AGENT_TOKEN) {
  console.error('[Agent] AGENT_TOKEN não configurado. Defina a variável de ambiente AGENT_TOKEN.');
  process.exit(1);
}

if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

// --- Concurrency semaphore ---
let activeSlots = 0;
const pendingQueue: ExecConfig[] = [];

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
    runExecution(next).finally(releaseSlot);
  } else {
    console.log(`[Agent] Slot liberado (${activeSlots}/${MAX_CONCURRENT} ativos)`);
  }
}

function dispatch(config: ExecConfig) {
  if (acquireSlot(config)) {
    runExecution(config).finally(releaseSlot);
  }
}
// --- End concurrency ---

let socket: Socket;

function connect() {
  console.log(`[Agent] Conectando em ${BACKEND_URL}... (paralelo máx: ${MAX_CONCURRENT})`);
  socket = io(BACKEND_URL, {
    auth: { agentToken: AGENT_TOKEN },
    transports: ['polling', 'websocket'],
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
  timeout: number;
  backendUrl: string;
}

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
      fs.writeFileSync(scriptPath, config.scriptContent, 'utf-8');
    } else if (config.steps && config.steps.length > 0) {
      scriptPath = path.join(execWorkDir, 'test.spec.js');
      const code = generatePlaywrightCode(config.steps);
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

    const availableBrowsers = config.browsers.filter(b => {
      if (!browsersInstallPath) return b === 'chromium';
      const dirPrefix = b === 'webkit' ? 'webkit' : b === 'firefox' ? 'firefox' : 'chromium';
      try { return fs.readdirSync(browsersInstallPath).some(d => d.startsWith(dirPrefix)); }
      catch { return b === 'chromium'; }
    });

    if (availableBrowsers.length === 0) {
      emitLog(`[goState Agent] AVISO: browsers solicitados (${config.browsers.join(', ')}) não encontrados. Usando chromium como fallback.\n`);
      availableBrowsers.push('chromium');
    } else if (availableBrowsers.length < config.browsers.length) {
      const missing = config.browsers.filter(b => !availableBrowsers.includes(b));
      emitLog(`[goState Agent] AVISO: browsers não instalados ignorados: ${missing.join(', ')}\n`);
    }

    const playwrightConfig = generatePlaywrightConfig(execWorkDir, config, availableBrowsers);
    const configPath = path.join(execWorkDir, 'playwright.config.js');
    fs.writeFileSync(configPath, playwrightConfig, 'utf-8');

    emitLog(`[goState Agent] Iniciando execução ${execId}\n`);
    emitLog(`[goState Agent] Framework: ${config.framework} | Browsers: ${availableBrowsers.join(', ')}\n`);
    emitLog(`[goState Agent] Timeout: ${config.timeout}ms\n\n`);

    const startTime = Date.now();
    const { exitCode, logs, stepResults } = await runPlaywright(execWorkDir, configPath, scriptPath, config, emitLog);
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

function generatePlaywrightCode(steps: any[]): string {
  let code = "const { test, expect } = require('@playwright/test');\n\ntest('goState Test', async ({ page }) => {\n";
  for (const step of steps) {
    const p = step.params || {};
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
  }
  code += `});
`;
  return code;
}

function generatePlaywrightConfig(workDir: string, config: ExecConfig, browsers?: string[]): string {
  const effectiveBrowsers = browsers && browsers.length > 0 ? browsers : config.browsers;
  const projects = effectiveBrowsers.map(b => `{ name: '${b}', use: { browserName: '${b}' } }`).join(', ');
  const video = config.videoEnabled ? `'on'` : `'retain-on-failure'`;
  const wdFwd = workDir.replace(/\\/g, '/');
  return `
module.exports = {
  testMatch: ['**/*.spec.js'],
  timeout: ${config.timeout},
  retries: 0,
  reporter: [
    ['json', { outputFile: '${wdFwd}/results.json' }],
    ['html', { outputFolder: '${wdFwd}/html-report', open: 'never' }],
  ],
  use: {
    headless: true,
    video: ${video},
    screenshot: 'on',
    trace: 'retain-on-failure',
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
  emitLog: (line: string) => void
): Promise<{ exitCode: number; logs: string; stepResults: any[] }> {
  return new Promise((resolve) => {
    let logs = '';
    let resolved = false;

    const doResolve = (exitCode: number) => {
      if (resolved) return;
      resolved = true;
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
    const cmd = `"${playwrightBin}" test "${path.basename(scriptPath)}" --config="${configPath}"`;
    emitLog(`[goState Agent] $ ${cmd}\n`);

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
        doResolve(1);
      }
    }, hardTimeout);

    const child = exec(cmd, {
      cwd: workDir,
      timeout: config.timeout + 30000,
      env: {
        ...process.env,
        NODE_PATH: AGENT_NODE_MODULES,
        ...(browsersPath ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath } : {}),
        // Disable ANSI color output from Playwright on Windows
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        TERM: 'dumb',
      },
    });

    child.stdout?.on('data', (d: Buffer | string) => { const s = d.toString('utf8'); logs += s; emitLog(s); });
    child.stderr?.on('data', (d: Buffer | string) => { const s = d.toString('utf8'); logs += s; emitLog(s); });

    child.on('error', (err) => {
      emitLog(`\n[goState Agent] Erro ao executar Playwright: ${err.message}\n`);
      clearTimeout(killTimer);
      doResolve(1);
    });

    child.on('exit', (code) => {
      clearTimeout(killTimer);
      doResolve(code ?? 1);
    });
  });
}

function parsePlaywrightResults(json: any): any[] {
  const steps: any[] = [];
  let idx = 0;
  for (const suite of json.suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          for (const step of result.steps || []) {
            steps.push({
              step_index: idx++,
              name: step.title,
              type: 'action',
              status: step.error ? 'failed' : 'passed',
              duration_ms: step.duration,
              error_message: step.error?.message || null,
              timestamp_ms: step.startTime,
            });
          }
        }
      }
    }
  }
  return steps;
}

async function uploadArtifacts(apiBase: string, execId: string, workDir: string, emitLog: (l: string) => void) {
  const findFiles = (dir: string, exts: string[]): string[] => {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const walk = (d: string) => {
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
        }
      } catch {}
    };
    walk(dir);
    return results;
  };

  // Playwright puts artifacts in test-results/<test-name>/ subdirs
  const testResultsDir = path.join(workDir, 'test-results');
  const videoFiles = findFiles(testResultsDir, ['.webm', '.mp4']);
  const screenshotFiles = findFiles(testResultsDir, ['.png', '.jpg', '.jpeg']);

  const typeMap = (f: string): string => {
    if (f.endsWith('.webm') || f.endsWith('.mp4')) return 'video';
    return 'screenshot';
  };

  let uploaded = 0;
  for (const file of [...videoFiles, ...screenshotFiles]) {
    try {
      const type = typeMap(file);
      const filename = `${type}_${uploaded}_${path.basename(file)}`;
      const form = new FormData();
      form.append('file', fs.createReadStream(file), { filename });
      form.append('type', type);
      await axios.post(`${apiBase}/api/executions/${execId}/artifacts`, form, {
        headers: { ...form.getHeaders(), 'X-Agent-Token': AGENT_TOKEN },
        maxBodyLength: Infinity,
      });
      emitLog(`[goState Agent] Artefato enviado: ${filename} (${type})\n`);
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
    });
  } catch (e: any) {
    console.error(`[Agent] Falha ao atualizar status: ${e.message}`);
  }
}

connect();
console.log('[Agent] goState Agent iniciado. Aguardando execuções...');
