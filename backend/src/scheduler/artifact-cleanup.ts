import fs from 'fs';
import path from 'path';
import { getDb } from '../db/schema';

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'artifacts');
const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Cleans up artifacts and logs for executions older than the retention period.
 * Called once daily by the cron runner.
 */
export function cleanupOldArtifacts(): void {
  const retentionDays = parseInt(process.env.ARTIFACT_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10);
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const db = getDb();

  const oldExecs = db.prepare(`
    SELECT id FROM executions
    WHERE status IN ('passed', 'failed', 'error', 'cancelled')
      AND finished_at IS NOT NULL
      AND finished_at < ?
  `).all(cutoffDate) as Array<{ id: string }>;

  if (oldExecs.length === 0) return;

  let cleanedDirs = 0;
  let cleanedLogs = 0;

  for (const exec of oldExecs) {
    // Remove artifact directory
    const execDir = path.join(ARTIFACTS_DIR, `exec_${exec.id}`);
    if (fs.existsSync(execDir)) {
      try {
        fs.rmSync(execDir, { recursive: true, force: true });
        cleanedDirs++;
      } catch (err) {
        console.error(`[Cleanup] Erro ao remover ${execDir}:`, err);
      }
    }

    // Remove log file
    const logFile = path.join(LOGS_DIR, `${exec.id}.log`);
    if (fs.existsSync(logFile)) {
      try {
        fs.unlinkSync(logFile);
        cleanedLogs++;
      } catch (err) {
        console.error(`[Cleanup] Erro ao remover ${logFile}:`, err);
      }
    }

    // Remove artifact records from DB
    db.prepare('DELETE FROM exec_artifacts WHERE execution_id = ?').run(exec.id);
  }

  if (cleanedDirs > 0 || cleanedLogs > 0) {
    console.log(`[Cleanup] Removidos ${cleanedDirs} diretório(s) de artefatos e ${cleanedLogs} arquivo(s) de log com mais de ${retentionDays} dias`);
  }
}
