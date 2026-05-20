import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSync } from '../src/sync/runSync.js';

const tempFiles = [];

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `paycor-sync-${Date.now()}-${name}`);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

const mappingsPath = path.resolve('config/mappings.json');

const baseEmployees = {
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
      first_name: 'Sam',
      last_name: 'Rivera',
      hourly_rate: 12.75,
      employment_status: 'active',
      updated_at: '2026-05-17T14:30:00Z',
    },
  ],
};

function writeSource(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const syncOptions = (sourcePath, dbPath) => ({
  sourcePath,
  sourceFormat: 'json',
  dbPath,
  mappingsPath,
  maxRetries: 3,
  retryBaseMs: 50,
  skipUnchanged: true,
});

describe('idempotency', () => {
  it('inserts on first run and skips unchanged on second run', async () => {
    const sourcePath = tempPath('employees.json');
    const dbPath = tempPath('payroll.db');
    writeSource(sourcePath, baseEmployees);

    const first = await runSync(syncOptions(sourcePath, dbPath));
    expect(first.status).toBe('success');
    expect(first.recordsUpserted).toBe(2);

    const second = await runSync(syncOptions(sourcePath, dbPath));
    expect(second.status).toBe('success');
    expect(second.recordsSkipped).toBe(2);
    expect(second.recordsUpserted).toBe(0);
  });

  it('updates when source updated_at is newer', async () => {
    const sourcePath = tempPath('employees.json');
    const dbPath = tempPath('payroll.db');
    writeSource(sourcePath, baseEmployees);

    await runSync(syncOptions(sourcePath, dbPath));

    const updated = {
      employees: [
        {
          ...baseEmployees.employees[0],
          hourly_rate: 19.25,
          updated_at: '2026-05-20T08:00:00Z',
        },
        baseEmployees.employees[1],
      ],
    };
    writeSource(sourcePath, updated);

    const result = await runSync(syncOptions(sourcePath, dbPath));
    expect(result.recordsUpserted).toBe(1);
    expect(result.recordsSkipped).toBe(1);
  });
});
