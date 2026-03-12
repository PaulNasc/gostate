import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { getDb } from '../../db/schema';
import { authenticate, requireProjectAccess, AuthRequest } from '../../shared/middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);
router.use(requireProjectAccess('viewer', (req) => {
  const db = getDb();
  const suite = db.prepare('SELECT project_id FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  return suite?.project_id;
}));

const StepSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'goto', 'click', 'fill', 'assert', 'wait', 'screenshot', 'api_call', 'group', 'library_ref',
    'expect_visible', 'expect_text', 'wait_for', 'wait_ms',
    'expect_hidden', 'expect_value', 'assert_url', 'assert_title', 'wait_for_url',
    'hover', 'double_click', 'select_option', 'clear', 'keyboard', 'scroll',
  ]),
  label: z.string().optional(),
  params: z.record(z.unknown()).default({}),
  order: z.number().optional(),
  group: z.string().optional(),
  is_secret: z.boolean().optional(),
});

const TestCaseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  steps: z.array(StepSchema).default([]),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  type: z.enum(['web', 'api', 'mobile', 'mixed']).default('web'),
  version_comment: z.string().optional(),
});

const SuggestStepsSchema = z.object({
  url: z.string().url(),
  goal: z.string().max(300).optional(),
});

type SuggestionPayload = ReturnType<typeof buildSuggestionPayload>;

const suggestionCache = new Map<string, { expiresAt: number; payload: SuggestionPayload }>();
const rateLimitWindowMs = 60 * 1000;
const rateLimitMaxRequests = 5;
const requestCounters = new Map<string, number[]>();

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizeText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? normalizeText(match[1]) : '';
}

function extractMetaDescription(html: string) {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  return match ? normalizeText(match[1]) : '';
}

function extractButtons(html: string) {
  const buttons: Array<{ selector: string; text: string; reason: string }> = [];
  const buttonRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  let match: RegExpExecArray | null;
  while ((match = buttonRegex.exec(html)) && buttons.length < 6) {
    const attrs = match[1] || '';
    const text = normalizeText(match[2].replace(/<[^>]+>/g, ' '));
    if (!text) continue;
    const idMatch = attrs.match(/\sid=["']([^"']+)["']/i);
    const dataTestIdMatch = attrs.match(/\sdata-testid=["']([^"']+)["']/i);
    const selector = idMatch
      ? `#${idMatch[1]}`
      : dataTestIdMatch
        ? `[data-testid="${dataTestIdMatch[1]}"]`
        : `button:has-text("${text.slice(0, 80)}")`;
    buttons.push({ selector, text, reason: `Botão com texto "${text}"` });
  }
  return buttons;
}

function extractInputs(html: string) {
  const inputs: Array<{ selector: string; label: string; reason: string; suggestedValue: string }> = [];
  const inputRegex = /<input([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRegex.exec(html)) && inputs.length < 6) {
    const attrs = match[1] || '';
    const typeMatch = attrs.match(/\stype=["']([^"']+)["']/i);
    const type = (typeMatch?.[1] || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'file'].includes(type)) continue;
    const idMatch = attrs.match(/\sid=["']([^"']+)["']/i);
    const nameMatch = attrs.match(/\sname=["']([^"']+)["']/i);
    const placeholderMatch = attrs.match(/\splaceholder=["']([^"']+)["']/i);
    const selector = idMatch
      ? `#${idMatch[1]}`
      : nameMatch
        ? `input[name="${nameMatch[1]}"]`
        : placeholderMatch
          ? `input[placeholder="${placeholderMatch[1]}"]`
          : 'input';
    const label = normalizeText(placeholderMatch?.[1] || nameMatch?.[1] || idMatch?.[1] || `campo ${inputs.length + 1}`);
    const suggestedValue =
      /mail|email/i.test(label) ? 'usuario@exemplo.com'
        : /senha|password/i.test(label) ? 'Senha123!'
          : /nome/i.test(label) ? 'Usuário Teste'
            : /busca|search/i.test(label) ? 'consulta teste'
              : 'valor de teste';
    inputs.push({ selector, label, reason: `Campo detectado: ${label}`, suggestedValue });
  }
  return inputs;
}

function extractLinks(html: string) {
  const links: Array<{ selector: string; text: string; reason: string }> = [];
  const linkRegex = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) && links.length < 4) {
    const attrs = match[1] || '';
    const text = normalizeText(match[2].replace(/<[^>]+>/g, ' '));
    if (!text) continue;
    const hrefMatch = attrs.match(/\shref=["']([^"']+)["']/i);
    const selector = hrefMatch?.[1]
      ? `a[href="${hrefMatch[1]}"]`
      : `a:has-text("${text.slice(0, 80)}")`;
    links.push({ selector, text, reason: `Link com texto "${text}"` });
  }
  return links;
}

function inferAssertionSelector(html: string) {
  const headings = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (headings) {
    return {
      selector: 'h1',
      text: normalizeText(headings[1].replace(/<[^>]+>/g, ' ')),
      reason: 'Título principal da página',
    };
  }
  return null;
}

function buildSuggestionPayload(url: string, goal: string | undefined, html: string) {
  const title = extractTitle(html);
  const description = extractMetaDescription(html);
  const buttons = extractButtons(html);
  const inputs = extractInputs(html);
  const links = extractLinks(html);
  const heading = inferAssertionSelector(html);
  const steps: Array<{ type: string; params: Record<string, string>; rationale: string }> = [
    {
      type: 'goto',
      params: { url },
      rationale: 'Abrir a página inicial informada para iniciar o fluxo.',
    },
  ];

  if (heading?.text) {
    steps.push({
      type: 'expect_text',
      params: { selector: heading.selector, text: heading.text },
      rationale: `Validar que a página carregou corretamente usando ${heading.reason.toLowerCase()}.`,
    });
  } else {
    steps.push({
      type: 'assert_title',
      params: { title: title || 'Título esperado' },
      rationale: 'Validar o título da página após a navegação.',
    });
  }

  if (inputs[0]) {
    steps.push({
      type: 'fill',
      params: { selector: inputs[0].selector, value: inputs[0].suggestedValue },
      rationale: inputs[0].reason,
    });
  }

  if (inputs[1]) {
    steps.push({
      type: 'fill',
      params: { selector: inputs[1].selector, value: inputs[1].suggestedValue },
      rationale: inputs[1].reason,
    });
  }

  const primaryAction = buttons[0] || links[0];
  if (primaryAction) {
    steps.push({
      type: 'click',
      params: { selector: primaryAction.selector },
      rationale: primaryAction.reason,
    });
  }

  steps.push({
    type: 'wait_for_url',
    params: { url: goal?.trim() || '/' },
    rationale: goal?.trim()
      ? `Aguardar o destino esperado para o objetivo "${goal.trim()}".`
      : 'Aguardar mudança de URL após a ação principal.',
  });

  const summary = [
    title ? `Título: ${title}` : null,
    description ? `Descrição: ${description}` : null,
    inputs.length ? `${inputs.length} campo(s) detectado(s)` : null,
    buttons.length ? `${buttons.length} botão(ões) detectado(s)` : null,
    links.length ? `${links.length} link(s) detectado(s)` : null,
  ].filter(Boolean);

  return {
    analysis: {
      title,
      description,
      goal: goal || '',
      signals: summary,
      selectorHints: [...inputs, ...buttons, ...links].slice(0, 8),
    },
    suggestedSteps: steps,
  };
}

function enforceRateLimit(userId: string) {
  const now = Date.now();
  const recent = (requestCounters.get(userId) || []).filter((ts) => now - ts < rateLimitWindowMs);
  if (recent.length >= rateLimitMaxRequests) {
    return false;
  }
  recent.push(now);
  requestCounters.set(userId, recent);
  return true;
}

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  const tcs = db.prepare(`
    SELECT tc.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM executions e WHERE e.test_case_id = tc.id) as exec_count,
      (SELECT status FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_status,
      (SELECT created_at FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_at,
      (SELECT id FROM executions e WHERE e.test_case_id = tc.id ORDER BY e.created_at DESC LIMIT 1) as last_exec_id
    FROM test_cases tc JOIN users u ON u.id = tc.created_by
    WHERE tc.suite_id = ? ORDER BY tc.created_at DESC
  `).all(req.params.suiteId);
  res.json({ test_cases: tcs.map(parseTC) });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = TestCaseSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const suite = db.prepare('SELECT * FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (!suite) { res.status(404).json({ error: 'Suite não encontrada' }); return; }
  const { title, description, steps, tags, priority, status, type, version_comment } = parse.data;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO test_cases (id, suite_id, title, description, steps, tags, priority, status, type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.suiteId, title, description || null, JSON.stringify(steps), JSON.stringify(tags), priority, status, type, req.user!.id);
  saveVersion(db, id, 1, steps, version_comment || 'Versão inicial', req.user!.id);
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  res.status(201).json({ test_case: parseTC(tc) });
});

router.get('/:tcId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  res.json({ test_case: parseTC(tc) });
});

router.post('/:tcId/suggest-steps', async (req: AuthRequest, res: Response) => {
  const parse = SuggestStepsSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  if (!enforceRateLimit(req.user!.id)) {
    res.status(429).json({ error: 'Limite de análises por minuto excedido. Aguarde e tente novamente.' });
    return;
  }

  const db = getDb();
  const tc = db.prepare('SELECT id FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }

  const { url, goal } = parse.data;
  const cacheKey = `${req.user!.id}:${url}:${goal || ''}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ ...cached.payload, cached: true });
    return;
  }

  try {
    const response = await axios.get(url, {
      timeout: 12000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'goState Suggestion Bot/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const payload = buildSuggestionPayload(url, goal, html);
    suggestionCache.set(cacheKey, {
      expiresAt: Date.now() + 10 * 60 * 1000,
      payload,
    });
    res.json({ ...payload, cached: false });
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Falha ao analisar a URL';
    const host = (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();
    res.status(502).json({ error: `Não foi possível analisar ${host}`, details: message });
  }
});

router.put('/:tcId', (req: AuthRequest, res: Response) => {
  const parse = TestCaseSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  const { title, description, steps, tags, priority, status, type, version_comment } = parse.data;
  db.prepare(`
    UPDATE test_cases SET title=?, description=?, steps=?, tags=?, priority=?, status=?, type=?, updated_at=datetime('now') WHERE id=?
  `).run(title, description || null, JSON.stringify(steps), JSON.stringify(tags), priority, status, type, req.params.tcId);
  const lastVersion = db.prepare('SELECT MAX(version) as v FROM tc_versions WHERE tc_id = ?').get(req.params.tcId) as any;
  const nextVer = (lastVersion?.v || 0) + 1;
  saveVersion(db, req.params.tcId, nextVer, steps, version_comment || `Versão ${nextVer}`, req.user!.id);
  const updated = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.tcId);
  res.json({ test_case: parseTC(updated) });
});

router.delete('/:tcId', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  db.prepare('DELETE FROM test_cases WHERE id = ?').run(req.params.tcId);
  res.json({ message: 'Caso de teste excluído com sucesso' });
});

router.post('/:tcId/duplicate', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  const newId = uuidv4();
  const now = new Date().toISOString();
  const { target_suite_id } = req.body;
  const destSuiteId = target_suite_id || req.params.suiteId;
  if (target_suite_id) {
    const dest = db.prepare('SELECT * FROM suites WHERE id = ?').get(target_suite_id) as any;
    if (!dest) { res.status(404).json({ error: 'Suite de destino não encontrada' }); return; }
  }
  db.prepare(`
    INSERT INTO test_cases (id, suite_id, title, description, steps, tags, priority, status, type, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newId, destSuiteId, `${tc.title} (cópia)`, tc.description, tc.steps, tc.tags, tc.priority, tc.status, tc.type, req.user!.id, now, now);
  saveVersion(db, newId, 1, JSON.parse(tc.steps || '[]'), 'Duplicado de ' + tc.title, req.user!.id);
  const created = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(newId);
  res.status(201).json({ test_case: parseTC(created) });
});

router.patch('/:tcId/move', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const tc = db.prepare('SELECT * FROM test_cases WHERE id = ? AND suite_id = ?').get(req.params.tcId, req.params.suiteId) as any;
  if (!tc) { res.status(404).json({ error: 'Caso de teste não encontrado' }); return; }
  const { target_suite_id } = req.body;
  if (!target_suite_id) { res.status(400).json({ error: 'target_suite_id é obrigatório' }); return; }
  const targetSuite = db.prepare('SELECT * FROM suites WHERE id = ?').get(target_suite_id) as any;
  if (!targetSuite) { res.status(404).json({ error: 'Suite de destino não encontrada' }); return; }
  const srcSuite = db.prepare('SELECT project_id FROM suites WHERE id = ?').get(req.params.suiteId) as any;
  if (srcSuite.project_id !== targetSuite.project_id) { res.status(400).json({ error: 'Suites pertencem a projetos diferentes' }); return; }
  db.prepare("UPDATE test_cases SET suite_id = ?, updated_at = datetime('now') WHERE id = ?").run(target_suite_id, req.params.tcId);
  res.json({ message: 'Caso de teste movido com sucesso' });
});

router.get('/:tcId/versions', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const versions = db.prepare(`
    SELECT v.*, u.name as author_name FROM tc_versions v JOIN users u ON u.id = v.author
    WHERE v.tc_id = ? ORDER BY v.version DESC
  `).all(req.params.tcId);
  res.json({ versions: versions.map((v: any) => ({ ...v, steps: JSON.parse(v.steps) })) });
});

function saveVersion(db: any, tcId: string, version: number, steps: unknown[], comment: string, author: string) {
  db.prepare('INSERT INTO tc_versions (id, tc_id, version, steps, comment, author) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), tcId, version, JSON.stringify(steps), comment, author);
}

function parseTC(tc: any) {
  if (!tc) return null;
  return {
    ...tc,
    steps: typeof tc.steps === 'string' ? JSON.parse(tc.steps) : tc.steps,
    tags: typeof tc.tags === 'string' ? JSON.parse(tc.tags) : tc.tags,
  };
}

export default router;
