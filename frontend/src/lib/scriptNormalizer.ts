type NormalizeOptions = {
  testName?: string;
};

export type NormalizeResult = {
  content: string;
  changes: string[];
};

const ASYNC_CALL_PATTERNS = [
  'page.goto(',
  'page.click(',
  'page.dblclick(',
  'page.fill(',
  'page.hover(',
  'page.check(',
  'page.uncheck(',
  'page.press(',
  'page.selectOption(',
  'page.waitFor',
  'page.screenshot(',
  'page.locator(',
  'page.getBy',
  'page.keyboard.',
  'locator.',
  'context.',
];

function ensureAsyncTestCallback(source: string, changes: string[]) {
  const updated = source.replace(/test\(([^,]+),\s*\(([^)]*)\)\s*=>\s*\{/g, (_m, name, args) => {
    changes.push('Callback do test normalizado para async');
    return `test(${name}, async (${args}) => {`;
  });
  return updated;
}

function ensureAwaits(source: string, changes: string[]) {
  const lines = source.split('\n');
  let changed = 0;
  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return line;
    if (trimmed.startsWith('await ') || trimmed.startsWith('const ') || trimmed.startsWith('let ') || trimmed.startsWith('return ')) return line;
    if (trimmed.startsWith('expect(') || trimmed.startsWith('await expect(')) return line;
    if (ASYNC_CALL_PATTERNS.some((pattern) => trimmed.includes(pattern))) {
      changed += 1;
      const indent = line.match(/^\s*/)?.[0] || '';
      return `${indent}await ${trimmed}`;
    }
    return line;
  });
  if (changed > 0) changes.push(`Adicionado await em ${changed} chamada(s) assíncrona(s)`);
  return updated.join('\n');
}

function stripHardcodedArtifacts(source: string, changes: string[]) {
  const lines = source.split('\n');
  let removedShots = 0;
  let removedVideoHints = 0;
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.includes('page.screenshot(')) {
      removedShots += 1;
      return false;
    }
    if (trimmed.includes('recordVideo') || trimmed.includes('video:')) {
      removedVideoHints += 1;
      return false;
    }
    return true;
  });
  if (removedShots > 0) changes.push(`Removido screenshot hardcoded (${removedShots}) para usar opção de execução`);
  if (removedVideoHints > 0) changes.push(`Removida configuração hardcoded de vídeo (${removedVideoHints})`);
  return kept.join('\n');
}

function ensureImports(source: string, changes: string[]) {
  if (source.includes("require('@playwright/test')") || source.includes("from '@playwright/test'")) return source;
  changes.push('Import do Playwright adicionado');
  return `const { test, expect } = require('@playwright/test');\n\n${source}`;
}

function normalizeWhitespace(source: string) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

function ensureTestName(source: string, testName: string | undefined, changes: string[]) {
  if (!testName?.trim()) return source;
  const sanitized = testName.trim().replace(/'/g, '');
  const updated = source.replace(/test\(\s*['"`][^'"`]*['"`]/, `test('${sanitized}'`);
  if (updated !== source) changes.push('Nome do teste alinhado com o nome informado');
  return updated;
}

export function normalizeRecordedScript(source: string, options: NormalizeOptions = {}): NormalizeResult {
  const changes: string[] = [];
  let content = source || '';

  content = ensureImports(content, changes);
  content = ensureAsyncTestCallback(content, changes);
  content = ensureAwaits(content, changes);
  content = stripHardcodedArtifacts(content, changes);
  content = ensureTestName(content, options.testName, changes);
  content = normalizeWhitespace(content);

  return {
    content,
    changes,
  };
}
