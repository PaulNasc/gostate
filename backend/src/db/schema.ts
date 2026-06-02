import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const DB_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const DB_PATH = path.join(DB_DIR, 'gostate.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { fileMustExist: false });
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = OFF');
    _db.pragma("encoding = 'UTF-8'");
    _db.pragma('busy_timeout = 5000');
    _db.pragma('wal_autocheckpoint = 1000');
    runMigrations(_db);
    _db.pragma('foreign_keys = ON');
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
          screenshot_enabled INTEGER NOT NULL DEFAULT 1,
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
    },
    {
      version: 11,
      sql: `ALTER TABLE executions ADD COLUMN schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL;`
    },
    {
      version: 12,
      sql: `
        ALTER TABLE integrations ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE CASCADE;
        ALTER TABLE integrations ADD COLUMN include_flags TEXT NOT NULL DEFAULT '{}';
      `
    },
    {
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
    },
    {
      version: 15,
      // Note: sqlite does not support IF NOT EXISTS for ADD COLUMN.
      // The v1 schema already includes screenshot_enabled for new installs.
      // We must check existence before applying the ALTER.
      sql: `SELECT 1;` // no-op; handled via code below after first loop
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
    },
  ];

  for (const migration of migrations.sort((a, b) => a.version - b.version)) {
    if (!applied.includes(migration.version)) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations (version) VALUES (?)').run(migration.version);
      console.log(`[DB] Migration v${migration.version} applied`);
    }
  }

  const migrations_extra: { version: number; sql: string }[] = [
    {
      version: 16,
      sql: `
        CREATE TABLE IF NOT EXISTS user_api_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          token_prefix TEXT NOT NULL,
          last_used_at TEXT,
          expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_id ON user_api_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_api_tokens_token_hash ON user_api_tokens(token_hash);
      `
    },
    {
      version: 17,
      sql: `
        CREATE TABLE IF NOT EXISTS integration_deliveries (
          id TEXT PRIMARY KEY,
          integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
          event TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
          status_code INTEGER,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_integration_deliveries_integration_id ON integration_deliveries(integration_id);
        CREATE INDEX IF NOT EXISTS idx_integration_deliveries_created_at ON integration_deliveries(created_at);
      `
    },
    {
      version: 18,
      sql: `
        -- Add 'paused' status to executions CHECK constraint
        CREATE TABLE IF NOT EXISTS executions_new (
          id TEXT PRIMARY KEY,
          test_plan_id TEXT REFERENCES test_plans(id),
          test_case_id TEXT REFERENCES test_cases(id),
          script_id TEXT REFERENCES scripts(id),
          agent_id TEXT REFERENCES agents(id),
          triggered_by TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','paused','passed','failed','error','cancelled')),
          result TEXT,
          logs TEXT,
          started_at TEXT,
          finished_at TEXT,
          duration_ms INTEGER,
          video_enabled INTEGER NOT NULL DEFAULT 0,
          screenshot_enabled INTEGER NOT NULL DEFAULT 1,
          browsers TEXT NOT NULL DEFAULT '["chromium"]',
          environment_id TEXT REFERENCES environments(id),
          schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO executions_new SELECT
          id, test_plan_id, test_case_id, script_id, agent_id, triggered_by, status, result, logs,
          started_at, finished_at, duration_ms, video_enabled, screenshot_enabled, browsers,
          environment_id, schedule_id, created_at
        FROM executions;
        DROP TABLE executions;
        ALTER TABLE executions_new RENAME TO executions;
        CREATE INDEX IF NOT EXISTS idx_executions_test_plan_id ON executions(test_plan_id);
        CREATE INDEX IF NOT EXISTS idx_executions_test_case_id ON executions(test_case_id);
        CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
        CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at);
        CREATE INDEX IF NOT EXISTS idx_executions_agent_id ON executions(agent_id);
      `
    },
    {
      version: 19,
      sql: `
        CREATE TABLE IF NOT EXISTS execution_comments (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          content TEXT NOT NULL,
          step_index INTEGER,
          timestamp_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_execution_comments_execution_id ON execution_comments(execution_id);
        CREATE INDEX IF NOT EXISTS idx_execution_comments_created_at ON execution_comments(created_at);
      `
    },
    {
      version: 20,
      sql: `
        CREATE TABLE IF NOT EXISTS execution_interventions (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          type TEXT NOT NULL CHECK(type IN ('add_step','update_selector','insert_wait','add_assertion','note')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','applied','rejected','cancelled')),
          target_step_index INTEGER,
          target_timestamp_ms INTEGER,
          label TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_execution_interventions_execution_id ON execution_interventions(execution_id);
        CREATE INDEX IF NOT EXISTS idx_execution_interventions_status ON execution_interventions(status);
        CREATE INDEX IF NOT EXISTS idx_execution_interventions_created_at ON execution_interventions(created_at);
      `
    },
    {
      version: 21,
      sql: `
        ALTER TABLE agents ADD COLUMN token_hash TEXT;
        ALTER TABLE agents ADD COLUMN token_prefix TEXT;
        CREATE INDEX IF NOT EXISTS idx_agents_token_hash ON agents(token_hash);
      `
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
      `
    },
  ];

  for (const migration of migrations_extra.sort((a, b) => a.version - b.version)) {
    if (!applied.includes(migration.version)) {
      try {
        db.exec(migration.sql);
        db.prepare('INSERT INTO migrations (version) VALUES (?)').run(migration.version);
        console.log(`[DB] Migration v${migration.version} applied`);
      } catch (err: any) {
        console.error(`[DB] ERROR: Migration v${migration.version} failed (non-fatal): ${err.message}`);
        // Continue applying remaining migrations — don't abort seeds
      }
    }
  }

  // v13: fix integrations.events stored as space-separated string instead of JSON array
  // Must run after standard migrations so the integrations table definitely exists.
  if (!applied.includes(13)) {
    const integrationsTableExists = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = 'integrations'
    `).get() as any;

    if (integrationsTableExists) {
      const badRows = db.prepare(`
        SELECT id, events
        FROM integrations
        WHERE events IS NOT NULL AND events NOT LIKE '[%'
      `).all() as any[];

      for (const row of badRows) {
        const parts = (row.events || '').trim().split(/\s+/).filter(Boolean);
        const fixed = JSON.stringify(parts);
        db.prepare('UPDATE integrations SET events = ? WHERE id = ?').run(fixed, row.id);
      }
    }

    db.prepare('INSERT INTO migrations (version) VALUES (?)').run(13);
    console.log('[DB] Migration v13 applied');
  }

  seedDefaultAdmin(db);
  seedDefaultAgent(db);
  seedMockProject(db);
}

function seedMockProject(db: Database.Database): void {
  const existingProject = db.prepare("SELECT id FROM projects WHERE name = 'Demoblaze Store Real Flow' LIMIT 1").get();
  if (!existingProject) {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get() as any;
    const createdBy = admin ? admin.id : 'system';

    const projectId = uuidv4();
    
    db.prepare(`INSERT INTO projects (id, name, description, created_by) VALUES (?, ?, ?, ?)`).run(
      projectId, 'Demoblaze Store Real Flow', 'Fluxo real funcional utilizando o e-commerce de testes Demoblaze (Playwright Ready)', createdBy
    );

    // 1. Project Member (Admin)
    if (admin) {
      db.prepare(`INSERT INTO project_members (id, project_id, user_id, role, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(
        uuidv4(), projectId, admin.id, 'admin'
      );
    }

    // 2. Environments
    db.prepare(`INSERT INTO environments (id, project_id, name, variables, created_by) VALUES (?, ?, ?, ?, ?)`).run(
      uuidv4(), projectId, 'Produção', JSON.stringify([{ key: 'BASE_URL', value: 'https://www.demoblaze.com', secret: false }]), createdBy
    );

    // 3. Suites
    const suiteNavId = uuidv4();
    const suiteCartId = uuidv4();

    db.prepare(`INSERT INTO suites (id, project_id, name, description) VALUES (?, ?, ?, ?)`).run(
      suiteNavId, projectId, '1. Navegação de Categorias', 'Navegação por abas e visualização de produtos'
    );
    db.prepare(`INSERT INTO suites (id, project_id, name, description) VALUES (?, ?, ?, ?)`).run(
      suiteCartId, projectId, '2. Carrinho e Compras', 'Fluxos de compra completos'
    );

    // 4. Test Cases
    const tcs: any[] = [];
    const insertTc = (suiteId: string, title: string, priority: string, steps: any[]) => {
      const id = uuidv4();
      tcs.push(id);
      db.prepare(`INSERT INTO test_cases (id, suite_id, title, description, steps, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        id, suiteId, title, '', JSON.stringify(steps), priority, createdBy
      );
    };

    // Suite: Navigation
    insertTc(suiteNavId, 'Visualizar categoria "Laptops"', 'high', [
      { type: "goto", order: 1, params: { url: "{{BASE_URL}}" } },
      { type: "click", order: 2, params: { selector: "a[onclick=\"byCat('notebook')\"]" } },
      { type: "wait_ms", order: 3, params: { ms: "1000" } },
      { type: "screenshot", order: 4, params: { filename: "laptops.png" } }
    ]);
    
    insertTc(suiteNavId, 'Abrir detalhes de um produto', 'medium', [
      { type: "goto", order: 1, params: { url: "{{BASE_URL}}" } },
      { type: "wait_ms", order: 2, params: { ms: "1500" } },
      { type: "click", order: 3, params: { selector: "a[href='prod.html?idp_=1']" } },
      { type: "wait_ms", order: 4, params: { ms: "1500" } },
      { type: "screenshot", order: 5, params: { filename: "samsung_galaxy_s6.png" } }
    ]);

    // Suite: Cart
    insertTc(suiteCartId, 'Adicionar produto ao carrinho', 'high', [
      { type: "goto", order: 1, params: { url: "{{BASE_URL}}/prod.html?idp_=1" } },
      { type: "wait_ms", order: 2, params: { ms: "1000" } },
      { type: "click", order: 3, params: { selector: "a.btn-success" } },
      { type: "wait_ms", order: 4, params: { ms: "1000" } },
      { type: "goto", order: 5, params: { url: "{{BASE_URL}}/cart.html" } },
      { type: "wait_ms", order: 6, params: { ms: "1000" } },
      { type: "screenshot", order: 7, params: { filename: "cart_with_item.png" } }
    ]);

    insertTc(suiteCartId, 'Finalizar compra (Checkout)', 'high', [
      { type: "goto", order: 1, params: { url: "{{BASE_URL}}/cart.html" } },
      { type: "wait_ms", order: 2, params: { ms: "1000" } },
      { type: "click", order: 3, params: { selector: "button[data-target='#orderModal']" } },
      { type: "wait_ms", order: 4, params: { ms: "500" } },
      { type: "fill", order: 5, params: { selector: "#name", value: "Cliente de Teste" } },
      { type: "fill", order: 6, params: { selector: "#country", value: "Brasil" } },
      { type: "fill", order: 7, params: { selector: "#city", value: "São Paulo" } },
      { type: "fill", order: 8, params: { selector: "#card", value: "1111222233334444" } },
      { type: "fill", order: 9, params: { selector: "#month", value: "12" } },
      { type: "fill", order: 10, params: { selector: "#year", value: "2030" } },
      { type: "click", order: 11, params: { selector: "button[onclick='purchaseOrder()']" } },
      { type: "wait_ms", order: 12, params: { ms: "1000" } },
      { type: "screenshot", order: 13, params: { filename: "order_success.png" } }
    ]);

    // 5. Test Plan
    db.prepare(`INSERT INTO test_plans (id, project_id, name, description, test_case_ids, max_parallel, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      uuidv4(), projectId, 'Regressão Demoblaze Completa', 'Plano que executa navegação e o fluxo de compra no Demoblaze com asserções reais', JSON.stringify(tcs), 2, createdBy
    );

    console.log('[DB] Mock Project (Demoblaze Real Flow) seeded successfully.');
  }
}

function seedDefaultAdmin(db: Database.Database): void {
  const existing = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existing) {
    const email = process.env.ADMIN_EMAIL || 'admin@gostate.dev';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const isDefault = !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD;
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), email, hash, 'Administrador', 'admin');
    if (isDefault) {
      console.warn(`[DB] WARNING: Admin criado com credenciais padrão (${email} / ${password}). Defina ADMIN_EMAIL e ADMIN_PASSWORD antes de ir para produção.`);
    } else {
      console.log(`[DB] Admin criado: ${email}`);
    }
  }
}

function seedDefaultAgent(db: Database.Database): void {
  const existing = db.prepare("SELECT id FROM agents WHERE name = 'agente-local'").get();
  if (!existing) {
    const id = uuidv4();
    const token = process.env.DEFAULT_AGENT_TOKEN || 'gostate-dev-agent-token-local';
    const isDefault = !process.env.DEFAULT_AGENT_TOKEN;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.slice(0, 8);
    db.prepare(`
      INSERT INTO agents (id, name, token_hash, token_prefix, capabilities)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, 'agente-local', tokenHash, tokenPrefix, JSON.stringify({
      browsers: ['chromium', 'firefox'],
      frameworks: ['playwright'],
      os: process.platform,
      max_concurrent: 1,
    }));
    if (isDefault) {
      console.warn(`[DB] WARNING: Agente padrão criado com token estático "${token}". Defina DEFAULT_AGENT_TOKEN antes de ir para produção.`);
    } else {
      console.log(`[DB] Agente padrão criado com token configurado via env.`);
    }
  }

  // Backfill token_hash for any agents that don't have it yet, then clear plaintext
  const unhashed = db.prepare('SELECT id, token FROM agents WHERE token_hash IS NULL AND token IS NOT NULL').all() as any[];
  if (unhashed.length > 0) {
    for (const agent of unhashed) {
      const hash = crypto.createHash('sha256').update(agent.token).digest('hex');
      const prefix = (agent.token || '').slice(0, 8);
      db.prepare('UPDATE agents SET token_hash = ?, token_prefix = ?, token = NULL WHERE id = ?').run(hash, prefix, agent.id);
    }
    console.log(`[DB] Backfilled token_hash and cleared plaintext token for ${unhashed.length} agent(s)`);
  }
}
