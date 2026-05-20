import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { migrate } from './schema.js';

export function createDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  migrate(db);
  return db;
}

export function getExistingSourceUpdatedAt(db, employeeId) {
  const row = db
    .prepare('SELECT source_updated_at FROM employees WHERE employee_id = ?')
    .get(employeeId);
  return row?.source_updated_at ?? null;
}
