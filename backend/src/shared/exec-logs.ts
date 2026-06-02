import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(__dirname, '..', '..', 'data', 'logs');

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logFilePath(execId: string): string {
  return path.join(LOGS_DIR, `${execId}.log`);
}

export function appendExecLog(execId: string, line: string): void {
  ensureLogsDir();
  fs.appendFileSync(logFilePath(execId), line);
}

export function readExecLog(execId: string): string {
  const filePath = logFilePath(execId);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function execLogExists(execId: string): boolean {
  return fs.existsSync(logFilePath(execId));
}
