import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../../db/schema';
import { authenticate, AuthRequest } from '../../shared/middleware/auth';

const router = Router();
router.use(authenticate);

// Block dangerous patterns in script content to prevent sandbox escape
const DANGEROUS_PATTERNS = [
  { pattern: /require\s*\(\s*['"]child_process['"]\s*\)/i, message: 'Uso de child_process não é permitido' },
  { pattern: /require\s*\(\s*['"]fs['"]\s*\)/i, message: 'Uso do módulo fs não é permitido' },
  { pattern: /require\s*\(\s*['"]net['"]\s*\)/i, message: 'Uso do módulo net não é permitido' },
  { pattern: /require\s*\(\s*['"]http['"]\s*\)/i, message: 'Uso do módulo http não é permitido' },
  { pattern: /require\s*\(\s*['"]https['"]\s*\)/i, message: 'Uso do módulo https não é permitido' },
  { pattern: /require\s*\(\s*['"]dns['"]\s*\)/i, message: 'Uso do módulo dns não é permitido' },
  { pattern: /\bexec\s*\(/, message: 'exec() não é permitido — risco de code injection' },
  { pattern: /\beval\s*\(/, message: 'eval() não é permitido — risco de code injection' },
  { pattern: /\bspawn\s*\(/, message: 'spawn() não é permitido' },
  { pattern: /\bexecSync\s*\(/, message: 'execSync() não é permitido' },
  { pattern: /\bspawnSync\s*\(/, message: 'spawnSync() não é permitido' },
  { pattern: /\bexecFile\s*\(/, message: 'execFile() não é permitido' },
  { pattern: /process\.exit\s*\(/, message: 'process.exit() não é permitido' },
  { pattern: /process\.env\s*\[/, message: 'Acesso direto a process.env não é permitido' },
  { pattern: /__proto__/, message: 'Manipulação de __proto__ não é permitida' },
  { pattern: /constructor\s*\[/, message: 'Acesso via constructor não é permitido' },
];

function validateScriptContent(content: string): { valid: true } | { valid: false; message: string } {
  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      return { valid: false, message };
    }
  }
  return { valid: true };
}

const ScriptSchema = z.object({
  project_id: z.string().uuid(),
  filename: z.string().min(1).refine(f => f.endsWith('.spec.js') || f.endsWith('.spec.ts') || f.endsWith('.test.js') || f.endsWith('.test.ts'), {
    message: 'Arquivo deve terminar com .spec.js, .spec.ts, .test.js ou .test.ts',
  }),
  content: z.string(),
  framework: z.string().default('playwright'),
  language: z.enum(['js', 'ts']).default('js'),
});

const UpdateScriptSchema = z.object({
  content: z.string(),
  filename: z.string().optional(),
});

router.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const { project_id } = req.query;
  const query = project_id
    ? 'SELECT s.*, u.name as created_by_name FROM scripts s JOIN users u ON u.id = s.created_by WHERE s.project_id = ? ORDER BY s.created_at DESC'
    : 'SELECT s.*, u.name as created_by_name FROM scripts s JOIN users u ON u.id = s.created_by ORDER BY s.created_at DESC';
  const scripts = project_id ? db.prepare(query).all(project_id as string) : db.prepare(query).all();
  res.json({ scripts });
});

router.post('/', (req: AuthRequest, res: Response) => {
  const parse = ScriptSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }

  // Validate script content against dangerous patterns
  const contentCheck = validateScriptContent(parse.data.content);
  if (!contentCheck.valid) { res.status(400).json({ error: `Script bloqueado: ${contentCheck.message}` }); return; }

  const db = getDb();
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(parse.data.project_id) as any;
  if (!project) { res.status(404).json({ error: 'Projeto não encontrado' }); return; }
  const existing = db.prepare('SELECT id FROM scripts WHERE project_id = ? AND filename = ?').get(parse.data.project_id, parse.data.filename) as any;
  if (existing) { res.status(409).json({ error: 'Já existe um script com esse nome neste projeto' }); return; }
  const id = uuidv4();
  const { project_id, filename, content, framework, language } = parse.data;
  db.prepare('INSERT INTO scripts (id, project_id, filename, content, framework, language, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, project_id, filename, content, framework, language, req.user!.id);
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(id);
  res.status(201).json({ script });
});

router.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id) as any;
  if (!script) { res.status(404).json({ error: 'Script não encontrado' }); return; }
  res.json({ script });
});

router.put('/:id', (req: AuthRequest, res: Response) => {
  const parse = UpdateScriptSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: 'Dados inválidos', details: parse.error.flatten() }); return; }

  // Validate script content against dangerous patterns
  if (parse.data.content) {
    const contentCheck = validateScriptContent(parse.data.content);
    if (!contentCheck.valid) { res.status(400).json({ error: `Script bloqueado: ${contentCheck.message}` }); return; }
  }

  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id) as any;
  if (!script) { res.status(404).json({ error: 'Script não encontrado' }); return; }
  const { content, filename } = parse.data;
  const newFilename = filename || script.filename;
  db.prepare('UPDATE scripts SET content = ?, filename = ?, updated_at = datetime(\'now\') WHERE id = ?').run(content, newFilename, req.params.id);
  res.json({ script: { ...script, content, filename: newFilename } });
});

router.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const script = db.prepare('SELECT * FROM scripts WHERE id = ?').get(req.params.id) as any;
  if (!script) { res.status(404).json({ error: 'Script não encontrado' }); return; }

  const removeScript = db.transaction((scriptId: string) => {
    db.prepare('UPDATE executions SET script_id = NULL WHERE script_id = ?').run(scriptId);
    db.prepare('DELETE FROM scripts WHERE id = ?').run(scriptId);
  });

  removeScript(req.params.id);
  res.json({ message: 'Script excluído com sucesso' });
});

export default router;
