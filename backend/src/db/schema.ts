import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'gostate.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { fileMustExist: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma("encoding = 'UTF-8'");
    runMigrations(_db);
  }
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = db.prepare('SELECT version FROM migrations').all().map((r: any) => r.version as number);

  const migrations: { version: number; sql: string }[] = [
    {
      version: 1,
      sql: `
        -- Users
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'tester' CHECK(role IN ('admin','tester','viewer')),
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Projects
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Suites
        CREATE TABLE IF NOT EXISTS suites (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          order_index INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Test Cases
        CREATE TABLE IF NOT EXISTS test_cases (
          id TEXT PRIMARY KEY,
          suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL DEFAULT '[]',
          tags TEXT NOT NULL DEFAULT '[]',
          priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft','archived')),
          type TEXT NOT NULL DEFAULT 'web' CHECK(type IN ('web','api','mobile','mixed')),
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Test Case Versions
        CREATE TABLE IF NOT EXISTS tc_versions (
          id TEXT PRIMARY KEY,
          tc_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          steps TEXT NOT NULL,
          comment TEXT,
          author TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Step Library
        CREATE TABLE IF NOT EXISTS step_library (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- TC Variables
        CREATE TABLE IF NOT EXISTS tc_variables (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          tc_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          value TEXT NOT NULL DEFAULT '',
          is_secret INTEGER NOT NULL DEFAULT 0,
          scope TEXT NOT NULL DEFAULT 'tc' CHECK(scope IN ('global','suite','tc')),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Scripts
        CREATE TABLE IF NOT EXISTS scripts (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          framework TEXT NOT NULL DEFAULT 'playwright',
          language TEXT NOT NULL DEFAULT 'js',
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Agents
        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'offline' CHECK(status IN ('online','offline','busy')),
          capabilities TEXT NOT NULL DEFAULT '{}',
          last_heartbeat TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Test Plans
        CREATE TABLE IF NOT EXISTS test_plans (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT,
          test_case_ids TEXT NOT NULL DEFAULT '[]',
          max_parallel INTEGER NOT NULL DEFAULT 1,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Executions
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          test_plan_id TEXT REFERENCES test_plans(id),
          test_case_id TEXT REFERENCES test_cases(id),
          script_id TEXT REFERENCES scripts(id),
          agent_id TEXT REFERENCES agents(id),
          triggered_by TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','passed','failed','error','cancelled')),
          result TEXT,
          logs TEXT,
          started_at TEXT,
          finished_at TEXT,
          duration_ms INTEGER,
          video_enabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Execution Steps
        CREATE TABLE IF NOT EXISTS exec_steps (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
          step_index INTEGER NOT NULL,
          name TEXT NOT NULL,
          type TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','passed','failed','skipped')),
          duration_ms INTEGER,
          error_message TEXT,
          screenshot_url TEXT,
          timestamp_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Execution Artifacts
        CREATE TABLE IF NOT EXISTS exec_artifacts (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('video','trace','screenshot','html_report','json_report')),
          filename TEXT NOT NULL,
          path TEXT NOT NULL,
          url TEXT,
          size_bytes INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Schedules
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          test_plan_id TEXT NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          cron_expr TEXT NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
          mode TEXT NOT NULL DEFAULT 'run' CHECK(mode IN ('run','monitor')),
          enabled INTEGER NOT NULL DEFAULT 1,
          last_run TEXT,
          next_run TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Integrations
        CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('discord','slack','jira','jenkins','teams','google_chat')),
          config TEXT NOT NULL DEFAULT '{}',
          events TEXT NOT NULL DEFAULT '[]',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Settings
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `
    },
    {
      version: 2,
      sql: `
        -- Recorder sessions
        CREATE TABLE IF NOT EXISTS recorder_sessions (
          id TEXT PRIMARY KEY,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          url TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','recording','finished','error')),
          generated_content TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `
    },
    {
      version: 4,
      sql: `
        UPDATE test_cases
        SET steps = '[
          {"order":1,"type":"goto","params":{"url":"https://example.com"}},
          {"order":2,"type":"expect_visible","params":{"selector":"h1"}},
          {"order":3,"type":"expect_text","params":{"selector":"h1","text":"Example Domain"}},
          {"order":4,"type":"screenshot","params":{"filename":"screenshot.png"}}
        ]'
        WHERE title = 'Login com credenciais válidas';
      `
    },
    {
      version: 5,
      sql: `
        ALTER TABLE executions ADD COLUMN browsers TEXT NOT NULL DEFAULT '["chromium"]';
      `
    },
    {
      version: 6,
      sql: `
        ALTER TABLE agents ADD COLUMN deploy_config TEXT NOT NULL DEFAULT '{}';
      `
    },
    {
      version: 7,
      sql: `
        CREATE INDEX IF NOT EXISTS idx_executions_test_plan_id ON executions(test_plan_id);
        CREATE INDEX IF NOT EXISTS idx_executions_test_case_id ON executions(test_case_id);
        CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
        CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
        CREATE INDEX IF NOT EXISTS idx_test_cases_suite_id ON test_cases(suite_id);
        CREATE INDEX IF NOT EXISTS idx_suites_project_id ON suites(project_id);
      `
    },
    {
      version: 8,
      sql: `
        CREATE TABLE IF NOT EXISTS environments (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          variables TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_environments_project_id ON environments(project_id);
        ALTER TABLE executions ADD COLUMN environment_id TEXT REFERENCES environments(id) ON DELETE SET NULL;
        ALTER TABLE schedules ADD COLUMN test_plan_id TEXT REFERENCES test_plans(id) ON DELETE CASCADE;
      `
    },
    {
      version: 9,
      sql: `
        CREATE TABLE IF NOT EXISTS project_members (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer', 'editor', 'admin')),
          invited_by TEXT REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(project_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);
        CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
      `
    },
    {
      version: 3,
      sql: `
        -- Drop and recreate schedules with updated schema
        DROP TABLE IF EXISTS schedules;
        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          test_case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
          project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
          cron TEXT NOT NULL,
          agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
          browsers TEXT NOT NULL DEFAULT '["chromium"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          last_run TEXT,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Drop and recreate integrations with updated schema
        DROP TABLE IF EXISTS integrations;
        CREATE TABLE IF NOT EXISTS integrations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('discord','slack','teams','webhook')),
          label TEXT NOT NULL,
          webhook_url TEXT NOT NULL,
          events TEXT NOT NULL DEFAULT '["execution.failed"]',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `
    }
  ];

  const v10: any = {
    version: 10,
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        detail TEXT,
        ip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity);
    `
  };
  migrations.push(v10);

  const v11: any = {
    version: 11,
    sql: `ALTER TABLE executions ADD COLUMN schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL;`
  };
  migrations.push(v11);

  const v12: any = {
    version: 12,
    sql: `
      ALTER TABLE integrations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
      ALTER TABLE integrations ADD COLUMN include_flags TEXT NOT NULL DEFAULT '{}';
    `
  };
  migrations.push(v12);

  const v14: any = {
    version: 14,
    sql: `
      CREATE TABLE IF NOT EXISTS integrations_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('discord','slack','teams','webhook','telegram','pagerduty','smtp')),
        label TEXT NOT NULL,
        webhook_url TEXT NOT NULL DEFAULT '',
        events TEXT NOT NULL DEFAULT '["execution.failed"]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        include_flags TEXT NOT NULL DEFAULT '{}',
        smtp_config TEXT NOT NULL DEFAULT '{}'
      );
      INSERT INTO integrations_new SELECT id, type, label, webhook_url, events, enabled, created_at, updated_at, project_id, include_flags, '{}' FROM integrations;
      DROP TABLE integrations;
      ALTER TABLE integrations_new RENAME TO integrations;
    `
  };
  migrations.push(v14);

  // v13: fix integrations.events stored as space-separated string instead of JSON array
  const v13: any = { version: 13, sql: `SELECT 1` }; // no-op SQL, logic runs below
  if (!applied.includes(13)) {
    const badRows = db.prepare(`SELECT id, events FROM integrations WHERE events NOT LIKE '[%'`).all() as any[];
    for (const row of badRows) {
      const parts = (row.events || '').trim().split(/\s+/).filter(Boolean);
      const fixed = JSON.stringify(parts);
      db.prepare('UPDATE integrations SET events = ? WHERE id = ?').run(fixed, row.id);
    }
    db.prepare('INSERT INTO migrations (version) VALUES (?)').run(13);
    console.log(`[DB] Migration v13 applied — fixed ${badRows.length} integration(s) with malformed events`);
  }

  for (const migration of migrations) {
    if (!applied.includes(migration.version)) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (version) VALUES (?)').run(migration.version);
      console.log(`[DB] Migration v${migration.version} applied`);
    }
  }

  seedDefaultAdmin(db);
  seedDefaultAgent(db);
}

function seedDefaultAdmin(db: Database.Database): void {
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existing) {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), 'admin@gostate.dev', hash, 'Administrador', 'admin');
    console.log('[DB] Admin padrão criado: admin@gostate.dev / admin123');
  }
}

function seedDefaultAgent(db: Database.Database): void {
  const existing = db.prepare("SELECT id FROM agents WHERE name = 'agente-local'").get();
  if (!existing) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    const token = 'gostate-dev-agent-token-local';
    db.prepare(`
      INSERT INTO agents (id, name, token, capabilities)
      VALUES (?, ?, ?, ?)
    `).run(id, 'agente-local', token, JSON.stringify({
      browsers: ['chromium', 'firefox'],
      frameworks: ['playwright'],
      os: process.platform,
      max_concurrent: 1,
    }));
    console.log('[DB] Agente padrão criado. Token: gostate-dev-agent-token-local');
  }
}
