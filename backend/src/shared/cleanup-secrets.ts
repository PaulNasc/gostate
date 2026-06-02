#!/usr/bin/env node
/**
 * Cleanup script: removes artifacts containing secrets and redacts logs/results.
 * Run: npx tsx backend/src/shared/cleanup-secrets.ts
 */

import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'artifacts');
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,           // AWS Access Key
  /eyJ[A-Za-z0-9_-]{10,}\./,    // JWT token
  /Bearer\s+[A-Za-z0-9._-]{10}/, // Bearer token
];

function hasSecrets(content: string): boolean {
  return SECRET_PATTERNS.some(p => p.test(content));
}

let deletedCount = 0;
let scannedCount = 0;

if (fs.existsSync(ARTIFACTS_DIR)) {
  const execDirs = fs.readdirSync(ARTIFACTS_DIR);
  for (const execDir of execDirs) {
    const dirPath = path.join(ARTIFACTS_DIR, execDir);
    if (!fs.statSync(dirPath).isDirectory()) continue;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      scannedCount++;

      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (hasSecrets(content)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`[CLEANUP] Deleted secret-containing artifact: ${filePath}`);
        }
      } catch {
        // skip files that can't be read
      }
    }
  }
}

console.log(`[CLEANUP] Scanned ${scannedCount} JSON artifacts, deleted ${deletedCount} with secrets.`);
