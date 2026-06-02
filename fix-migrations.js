const Database = require('better-sqlite3');
const db = new Database('/app/data/gostate.db');

db.pragma('foreign_keys = OFF');

const applied = db.prepare('SELECT version FROM migrations ORDER BY version').all().map(r => r.version);
console.log('Currently applied:', applied.join(','));

const fixes = [
  {
    version: 16,
    check: "SELECT name FROM sqlite_master WHERE type='table' AND name='user_api_tokens'",
    sql: null, // table already exists, just register
  },
  {
    version: 17,
    sql: `
      CREATE TABLE IF NOT EXISTS integration_deliveries (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        status_code INTEGER,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_integration_deliveries_integration_id ON integration_deliveries(integration_id);
      CREATE INDEX IF NOT EXISTS idx_integration_deliveries_created_at ON integration_deliveries(created_at);
    `,
  },
  {
    version: 18,
    sql: null, // executions table already has paused status in base schema (v1 already has it)
  },
  {
    version: 19,
    sql: `
      CREATE TABLE IF NOT EXISTS execution_comments (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        step_index INTEGER,
        timestamp_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_execution_comments_execution_id ON execution_comments(execution_id);
      CREATE INDEX IF NOT EXISTS idx_execution_comments_created_at ON execution_comments(created_at);
    `,
  },
  {
    version: 20,
    sql: `
      CREATE TABLE IF NOT EXISTS execution_interventions (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_execution_interventions_execution_id ON execution_interventions(execution_id);
      CREATE INDEX IF NOT EXISTS idx_execution_interventions_status ON execution_interventions(status);
      CREATE INDEX IF NOT EXISTS idx_execution_interventions_created_at ON execution_interventions(created_at);
    `,
  },
  {
    version: 21,
    sql: `
      ALTER TABLE agents ADD COLUMN token_hash TEXT;
      ALTER TABLE agents ADD COLUMN token_prefix TEXT;
      CREATE INDEX IF NOT EXISTS idx_agents_token_hash ON agents(token_hash);
    `,
  },
  {
    version: 22,
    sql: `
      CREATE INDEX IF NOT EXISTS idx_integrations_project_enabled ON integrations(project_id, enabled);
      CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
      CREATE INDEX IF NOT EXISTS idx_exec_steps_execution_id ON exec_steps(execution_id);
      CREATE INDEX IF NOT EXISTS idx_exec_artifacts_execution_id ON exec_artifacts(execution_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_executions_schedule_id ON executions(schedule_id);
    `,
  },
];

for (const fix of fixes) {
  if (applied.includes(fix.version)) {
    console.log(`v${fix.version} already applied, skipping`);
    continue;
  }
  try {
    if (fix.sql) {
      db.exec(fix.sql);
    }
    db.prepare('INSERT INTO migrations (version) VALUES (?)').run(fix.version);
    console.log(`v${fix.version} applied OK`);
  } catch (e) {
    console.log(`v${fix.version} ERROR: ${e.message}`);
  }
}

// Backfill token_hash for existing agents
try {
  const crypto = require('crypto');
  const agents = db.prepare('SELECT id, token FROM agents WHERE token_hash IS NULL AND token IS NOT NULL').all();
  for (const agent of agents) {
    const hash = crypto.createHash('sha256').update(agent.token).digest('hex');
    const prefix = (agent.token || '').slice(0, 8);
    db.prepare('UPDATE agents SET token_hash = ?, token_prefix = ? WHERE id = ?').run(hash, prefix, agent.id);
  }
  if (agents.length > 0) console.log(`Backfilled token_hash for ${agents.length} agent(s)`);
} catch(e) {
  console.log('Backfill error:', e.message);
}

const finalMigrations = db.prepare('SELECT version FROM migrations ORDER BY version').all().map(r => r.version);
console.log('Final applied:', finalMigrations.join(','));

db.pragma('foreign_keys = ON');
db.close();
console.log('Done!');
