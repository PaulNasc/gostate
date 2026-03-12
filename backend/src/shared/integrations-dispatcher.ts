import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import { buildPayload, sendSmtpEmail, WebhookData } from '../modules/integrations/integrations.routes';

export type IntegrationEvent =
  | 'execution.started'
  | 'execution.passed'
  | 'execution.failed'
  | 'execution.error'
  | 'plan.finished';

interface DispatchOptions {
  db: Database.Database;
  event: IntegrationEvent;
  project_id: string | null;
  data: WebhookData;
}

export async function dispatchIntegrations(opts: DispatchOptions): Promise<void> {
  const { db, event, project_id, data } = opts;

  const integrations = db.prepare(`
    SELECT * FROM integrations
    WHERE enabled = 1
      AND (project_id IS NULL OR project_id = ?)
  `).all(project_id ?? null) as any[];

  for (const integration of integrations) {
    let events: string[] = [];
    try { events = JSON.parse(integration.events || '[]'); } catch { events = []; }
    if (!events.includes(event)) continue;

    const flags = (() => { try { return JSON.parse(integration.include_flags || '{}'); } catch { return {}; } })();
    const enriched: WebhookData = { ...data };
    if (!flags.steps) delete enriched.steps;
    if (!flags.detailed_report) delete enriched.detailed_report;
    if (!flags.artifacts) delete enriched.artifacts;

    const deliveryId = uuidv4();
    const payloadObj = integration.type === 'smtp' ? { event, ...enriched } : buildPayload(integration.type, enriched);

    db.prepare(`
      INSERT INTO integration_deliveries (id, integration_id, event, payload, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(deliveryId, integration.id, event, JSON.stringify(payloadObj));

    try {
      if (integration.type === 'smtp') {
        const smtpCfg = (() => { try { return JSON.parse(integration.smtp_config || '{}'); } catch { return {}; } })();
        await sendSmtpEmail(smtpCfg, enriched);
        db.prepare(`UPDATE integration_deliveries SET status = 'delivered', status_code = 200 WHERE id = ?`).run(deliveryId);
      } else {
        const resp = await fetch(integration.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadObj),
          signal: AbortSignal.timeout(10000),
        });
        db.prepare(`UPDATE integration_deliveries SET status = ?, status_code = ? WHERE id = ?`)
          .run(resp.ok ? 'delivered' : 'failed', resp.status, deliveryId);
      }
    } catch (err: any) {
      db.prepare(`UPDATE integration_deliveries SET status = 'failed', error = ? WHERE id = ?`)
        .run(err?.message ?? 'unknown error', deliveryId);
    }
  }
}
