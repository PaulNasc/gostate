import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/schema';
import { authenticate, requireRole } from '../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(authenticate);

const integrationSchema = z.object({
  type: z.enum(['discord', 'slack', 'teams', 'webhook']),
  label: z.string().min(1).max(120),
  webhook_url: z.string().url(),
  events: z.array(z.enum(['execution.passed', 'execution.failed', 'execution.error', 'execution.started'])).default(['execution.failed']),
  enabled: z.boolean().default(true),
});

router.get('/', (req: any, res) => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM integrations ORDER BY created_at DESC').all();
    res.json({ integrations: rows.map((r: any) => ({ ...r, events: JSON.parse(r.events || '[]') })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireRole('admin'), (req: any, res) => {
  const body = integrationSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { type, label, webhook_url, events, enabled } = body.data;
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO integrations (id, type, label, webhook_url, events, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, type, label, webhook_url, JSON.stringify(events), enabled ? 1 : 0, now, now);

    const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
    res.status(201).json({ integration: { ...integration, events: JSON.parse(integration.events || '[]') } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  const body = integrationSchema.partial().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });

  const { label, webhook_url, events, enabled } = body.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE integrations SET
      label = COALESCE(?, label),
      webhook_url = COALESCE(?, webhook_url),
      events = COALESCE(?, events),
      enabled = COALESCE(?, enabled),
      updated_at = ?
    WHERE id = ?
  `).run(label ?? null, webhook_url ?? null, events ? JSON.stringify(events) : null, enabled !== undefined ? (enabled ? 1 : 0) : null, now, id);

  const updated = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  res.json({ integration: { ...updated, events: JSON.parse(updated.events || '[]') } });
});

router.delete('/:id', requireRole('admin'), (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT id FROM integrations WHERE id = ?').get(id);
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });
  db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  res.status(204).end();
});

router.post('/:id/test', requireRole('admin'), async (req: any, res) => {
  const db = getDb();
  const { id } = req.params;
  const integration = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id) as any;
  if (!integration) return res.status(404).json({ error: 'Integração não encontrada' });

  try {
    const payload = buildPayload(integration.type, {
      status: 'passed',
      title: 'Teste de integração goState',
      project: 'Demo',
      duration_ms: 1234,
    });

    const resp = await fetch(integration.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    res.json({ ok: resp.ok, status: resp.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export function buildPayload(type: string, data: { status: string; title: string; project: string; duration_ms: number }) {
  const emoji = data.status === 'passed' ? '✅' : data.status === 'failed' ? '❌' : '⚠️';
  const color = data.status === 'passed' ? 3066993 : data.status === 'failed' ? 15158332 : 15844367;

  if (type === 'discord') {
    return {
      embeds: [{
        title: `${emoji} ${data.title}`,
        description: `**Projeto:** ${data.project}\n**Status:** ${data.status}\n**Duração:** ${(data.duration_ms / 1000).toFixed(1)}s`,
        color,
        footer: { text: 'goState Test Automation' },
        timestamp: new Date().toISOString(),
      }],
    };
  }

  if (type === 'slack') {
    return {
      text: `${emoji} *${data.title}* — ${data.status}`,
      blocks: [{
        type: 'section',
        text: { type: 'mrkdwn', text: `${emoji} *${data.title}*\n*Projeto:* ${data.project} | *Status:* ${data.status} | *Duração:* ${(data.duration_ms / 1000).toFixed(1)}s` },
      }],
    };
  }

  return { text: `${emoji} ${data.title} — ${data.status} (${data.project})` };
}

export default router;
