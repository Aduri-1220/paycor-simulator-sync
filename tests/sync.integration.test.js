import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { runSync } from '../src/sync/runSync.js';

const tempFiles = [];

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `paycor-sync-int-${Date.now()}-${name}`);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

const mappingsPath = path.resolve('config/mappings.json');

function syncOptions(sourcePath, dbPath, overrides = {}) {
  return {
    sourcePath,
    sourceFormat: 'json',
    dbPath,
    mappingsPath,
    maxRetries: 3,
    retryBaseMs: 50,
    skipUnchanged: true,
    ...overrides,
  };
}

describe('sync integration', () => {
  it('marks run failed when source file is missing', async () => {
    const dbPath = tempPath('payroll.db');
    const result = await runSync(
      syncOptions(path.join(os.tmpdir(), 'missing.json'), dbPath)
    );
    expect(result.status).toBe('failed');
    expect(result.recordsUpserted).toBe(0);
  });

  it('handles partial success with invalid row', async () => {
    const sourcePath = tempPath('employees.json');
    const dbPath = tempPath('payroll.db');

    fs.writeFileSync(
      sourcePath,
      JSON.stringify({
        employees: [
          {
            employee_id: 'E1001',
            first_name: 'Jordan',
            last_name: 'Lee',
            hourly_rate: 18.5,
            employment_status: 'active',
            updated_at: '2026-05-18T10:00:00Z',
          },
          {
            employee_id: 'E1002',
            first_name: 'Bad',
            last_name: 'Rate',
            hourly_rate: -5,
            employment_status: 'active',
          },
        ],
      })
    );

    const result = await runSync(syncOptions(sourcePath, dbPath));
    expect(result.status).toBe('partial');
    expect(result.recordsUpserted).toBe(1);
    expect(result.recordsFailed).toBe(1);

    const db = new Database(dbPath);
    const errors = db.prepare('SELECT * FROM sync_errors WHERE run_id = ?').all(result.runId);
    expect(errors).toHaveLength(1);
    expect(errors[0].error_code).toBe('VALIDATION_ERROR');
    db.close();
  });

  it('rejects duplicate employee_id in same file', async () => {
    const sourcePath = tempPath('employees.json');
    const dbPath = tempPath('payroll.db');

    fs.writeFileSync(
      sourcePath,
      JSON.stringify({
        employees: [
          {
            employee_id: 'E1001',
            first_name: 'Jordan',
            last_name: 'Lee',
            hourly_rate: 18.5,
            employment_status: 'active',
            updated_at: '2026-05-18T10:00:00Z',
          },
          {
            employee_id: 'E1001',
            first_name: 'Duplicate',
            last_name: 'Row',
            hourly_rate: 20,
            employment_status: 'active',
            updated_at: '2026-05-19T10:00:00Z',
          },
        ],
      })
    );

    const result = await runSync(syncOptions(sourcePath, dbPath));
    expect(result.status).toBe('partial');
    expect(result.recordsUpserted).toBe(1);
    expect(result.recordsFailed).toBe(1);

    const db = new Database(dbPath);
    const employee = db.prepare('SELECT first_name FROM employees WHERE employee_id = ?').get('E1001');
    expect(employee.first_name).toBe('Jordan');
    db.close();
  });

  it('stores terminated employees without deleting', async () => {
    const sourcePath = tempPath('employees.json');
    const dbPath = tempPath('payroll.db');

    fs.writeFileSync(
      sourcePath,
      JSON.stringify({
        employees: [
          {
            employee_id: 'E1004',
            first_name: 'Taylor',
            last_name: 'Brooks',
            hourly_rate: 16.25,
            employment_status: 'terminated',
            updated_at: '2026-05-10T08:00:00Z',
          },
        ],
      })
    );

    await runSync(syncOptions(sourcePath, dbPath));

    const db = new Database(dbPath);
    const row = db
      .prepare('SELECT employment_status FROM employees WHERE employee_id = ?')
      .get('E1004');
    expect(row.employment_status).toBe('terminated');
    db.close();
  });
});
