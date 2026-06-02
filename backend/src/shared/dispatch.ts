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
    scriptContent?: string;
  },
): void {
  if (!exec.agent_id) return;


  let scriptContent = exec.scriptContent || '';
  let steps: any[] = [];

  let envVars: Record<string, string> = {};
  if (exec.environment_id) {
    const env = db.prepare('SELECT variables FROM environments WHERE id = ?').get(exec.environment_id) as any;
    if (env) {
      const vars: Array<{ key: string; value: string }> = parseJSON(env.variables, []);
      for (const v of vars) { if (v.key) envVars[v.key] = v.value; }
    }
  }

  if (!scriptContent && exec.script_id) {
    const script = db.prepare('SELECT content FROM scripts WHERE id = ?').get(exec.script_id) as any;
    if (script) scriptContent = script.content || '';
  }
  if (exec.test_case_id) {
    const tc = db.prepare('SELECT steps FROM test_cases WHERE id = ?').get(exec.test_case_id) as any;
    if (tc) {
      const parsed = parseJSON<any>(tc.steps, []);
      if (parsed && !Array.isArray(parsed) && parsed.editorMode === 'canvas') {
        scriptContent = compileGraphToPlaywright(parsed, envVars);
        steps = [];
      } else {
        steps = Array.isArray(parsed) ? parsed : [];
      }
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

export function compileGraphToPlaywright(graph: any, envVars: Record<string, string> = {}): string {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  let code = "const { test, expect } = require('@playwright/test');\n";
  code += "const path = require('path');\n\n";
  code += "test('goState Canvas Test', async ({ page }) => {\n";
  code += "  const vars = {};\n";

  const replaceEnv = (str: string) => {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{([^\}]+)\}\}/g, (_, key) => envVars[key] || '');
  };

  const compileSequentialSteps = (steps: any[]) => {
    let script = "";
    let stepIdx = 0;
    for (const step of steps) {
      const p = { ...(step.params || {}) };
      for (const k in p) {
        if (typeof p[k] === 'string') p[k] = replaceEnv(p[k]);
      }
      switch (step.type) {
        case 'goto':
          script += `    await page.goto(${JSON.stringify(p.url || 'about:blank')});\n`; break;
        case 'click':
          script += `    await page.click(${JSON.stringify(p.selector || 'body')});\n`; break;
        case 'fill':
          script += `    await page.fill(${JSON.stringify(p.selector || 'input')}, ${JSON.stringify(p.value || '')});\n`; break;
        case 'expect_text':
          script += `    await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toContainText(${JSON.stringify(p.text || '')});\n`; break;
        case 'expect_visible':
          script += `    await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toBeVisible();\n`; break;
        case 'wait_for':
          script += `    await page.waitForSelector(${JSON.stringify(p.selector || 'body')});\n`; break;
        case 'screenshot':
          script += `    await page.screenshot({ path: path.join('test-results', 'manual-screenshot-' + Date.now() + '.png') });\n`; break;
        case 'wait_ms':
          script += `    await page.waitForTimeout(${parseInt(p.ms || '1000', 10)});\n`; break;
        case 'hover':
          script += `    await page.hover(${JSON.stringify(p.selector || 'body')});\n`; break;
        case 'double_click':
          script += `    await page.dblclick(${JSON.stringify(p.selector || 'body')});\n`; break;
        case 'select_option':
          script += `    await page.selectOption(${JSON.stringify(p.selector || 'select')}, ${JSON.stringify(p.value || '')});\n`; break;
        case 'clear':
          script += `    await page.fill(${JSON.stringify(p.selector || 'input')}, '');\n`; break;
        case 'keyboard':
          script += `    await page.keyboard.press(${JSON.stringify(p.key || 'Enter')});\n`; break;
        case 'scroll': {
          const dir = p.direction || 'down';
          const sel = p.selector || null;
          if (dir === 'bottom') {
            script += `    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));\n`;
          } else if (dir === 'top') {
            script += `    await page.evaluate(() => window.scrollTo(0, 0));\n`;
          } else if (sel) {
            const delta = dir === 'up' ? -300 : 300;
            script += `    await page.locator(${JSON.stringify(sel)}).evaluate(el => el.scrollBy(0, ${delta}));\n`;
          } else {
            const delta = dir === 'up' ? -300 : 300;
            script += `    await page.evaluate(() => window.scrollBy(0, ${delta}));\n`;
          }
          break;
        }
        case 'expect_hidden':
          script += `    await expect(page.locator(${JSON.stringify(p.selector || 'body')})).toBeHidden();\n`; break;
        case 'expect_value':
          script += `    await expect(page.locator(${JSON.stringify(p.selector || 'input')})).toHaveValue(${JSON.stringify(p.value || '')});\n`; break;
        case 'assert_url':
          script += `    await expect(page).toHaveURL(/${p.url ? p.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}/);\n`; break;
        case 'assert_title':
          script += `    await expect(page).toHaveTitle(/${p.title ? p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}/);\n`; break;
        case 'wait_for_url':
          script += `    await page.waitForURL(${JSON.stringify(`**${p.url || '/'}**`)});\n`; break;
        case 'api_call': {
          const method = (p.method || 'GET').toLowerCase();
          const body = p.body ? `, { data: ${p.body} }` : '';
          script += `    await page.request.${method}(${JSON.stringify(p.url || '')}${body});\n`;
          break;
        }
      }
      stepIdx++;
    }
    return script;
  };

  const visited = new Set<string>();

  const compileNodeRecursively = (nodeId: string, indent = "  "): string => {
    if (visited.has(nodeId)) return "";
    visited.add(nodeId);

    const node = nodes.find((n: any) => n.id === nodeId);
    if (!node) return "";

    let sc = "";
    const nodeLabel = node.data?.label || node.type || 'Nó';

    const data = { ...(node.data || {}) };
    for (const key in data) {
      if (typeof data[key] === 'string') {
        data[key] = replaceEnv(data[key]);
      }
    }

    if (node.type === 'webFlow' || node.type === 'smartWebFlow') {
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      if (data.url) {
        sc += `${indent}  await page.goto(${JSON.stringify(data.url)});\n`;
      }
      if (Array.isArray(data.steps)) {
        sc += compileSequentialSteps(data.steps);
      }
      sc += `${indent}});\n`;
    } 
    else if (node.type === 'ifCondition') {
      const selector = data.selector || 'body';
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      sc += `${indent}  const condition = await page.locator(${JSON.stringify(selector)}).isVisible();\n`;
      
      const trueEdge = edges.find((e: any) => e.source === nodeId && e.sourceHandle === 'true');
      const falseEdge = edges.find((e: any) => e.source === nodeId && e.sourceHandle === 'false');
      
      sc += `${indent}  if (condition) {\n`;
      if (trueEdge) {
        sc += compileNodeRecursively(trueEdge.target, indent + "    ");
      }
      sc += `${indent}  } else {\n`;
      if (falseEdge) {
        sc += compileNodeRecursively(falseEdge.target, indent + "    ");
      }
      sc += `${indent}  }\n`;
      sc += `${indent}});\n`;
      return sc;
    }
    else if (node.type === 'postgresQuery') {
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      sc += `${indent}  const { Client } = require('pg');\n`;
      sc += `${indent}  const client = new Client({ connectionString: ${JSON.stringify(data.connectionString || 'postgresql://localhost:5432')} });\n`;
      sc += `${indent}  await client.connect();\n`;
      sc += `${indent}  const res = await client.query(${JSON.stringify(data.query || 'SELECT 1')});\n`;
      sc += `${indent}  await client.end();\n`;
      sc += `${indent}  vars[${JSON.stringify(data.variableName || 'dbResult')}] = res.rows;\n`;
      sc += `${indent}});\n`;
    }
    else if (node.type === 'httpCall' || node.type === 'apiCall') {
      const method = (data.method || 'GET').toLowerCase();
      const body = data.body ? `, { data: ${data.body} }` : '';
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      sc += `${indent}  const res = await page.request.${method}(${JSON.stringify(data.url || '')}${body});\n`;
      sc += `${indent}  vars[${JSON.stringify(data.variableName || 'apiResult')}] = { status: res.status(), body: await res.json().catch(() => ({})) };\n`;
      sc += `${indent}});\n`;
    }
    else if (node.type === 'logNode') {
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      sc += `${indent}  console.log(${JSON.stringify(data.message || '')});\n`;
      sc += `${indent}});\n`;
    }
    else if (node.type === 'stopAndFail') {
      sc += `${indent}await test.step(${JSON.stringify(nodeLabel)}, async () => {\n`;
      sc += `${indent}  throw new Error(${JSON.stringify(data.message || 'Fluxo interrompido via Stop and Fail')});\n`;
      sc += `${indent}});\n`;
    }
    else {
      throw new Error(`Unsupported node type: ${node.type}`);
    }

    if (node.type !== 'ifCondition') {
      const nextEdge = edges.find((e: any) => e.source === nodeId);
      if (nextEdge) {
        sc += compileNodeRecursively(nextEdge.target, indent);
      }
    }

    return sc;
  };

  const incomingNodeIds = new Set(edges.map((e: any) => e.target));
  const rootNodes = nodes.filter((n: any) => !incomingNodeIds.has(n.id));

  const startNodes = rootNodes.length > 0 ? rootNodes : nodes.filter((n: any) => n.type === 'webFlow');
  const startNode = startNodes[0] || nodes[0];

  if (startNode) {
    code += compileNodeRecursively(startNode.id, "  ");
  }

  code += "});\n";
  return code;
}
