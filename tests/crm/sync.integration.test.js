import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/schema.js';
import { approveTimeOffRequest } from '../../src/crm/approveRequest.js';
import { getDashboardRows } from '../../src/crm/dashboard.js';
import { MockCrmClient } from '../../src/crm/mockCrm.js';
import { runCrmSync } from '../../src/crm/runCrmSync.js';
import { seedApprovedWithCrmJobs } from '../../src/crm/seed.js';

const tempFiles = [];

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `crm-sync-${Date.now()}-${name}`);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

function setupDb(dbPath) {
  const db = new Database(dbPath);
  migrate(db);
  db.prepare(
    `INSERT INTO employees (
       employee_id, first_name, last_name, email, employment_status, synced_at
     ) VALUES ('E1001', 'Jordan', 'Lee', 'jordan@example.com', 'active', ?)`
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO employees (
       employee_id, first_name, last_name, email, employment_status, synced_at
     ) VALUES ('E1002', 'Sam', 'Rivera', 'sam.rivera@example.com', 'active', ?)`
  ).run(new Date().toISOString());
  seedApprovedWithCrmJobs(db);
  db.close();
}

function syncOptions(dbPath, crmClient, overrides = {}) {
  return {
    dbPath,
    crmMode: 'mock',
    maxRetries: 3,
    retryBaseMs: 10,
    maxJobRetries: 5,
    crmClient,
    ...overrides,
  };
}

describe('crm sync integration', () => {
  it('enqueues crm_sync_job when a request is approved (outbox write)', () => {
    const dbPath = tempPath('payroll.db');
    const db = new Database(dbPath);
    migrate(db);
    db.prepare(
      `INSERT INTO employees (employee_id, first_name, last_name, email, employment_status, synced_at)
       VALUES ('E2001', 'Alex', 'Kim', 'alex@example.com', 'active', ?)`
    ).run(new Date().toISOString());

    approveTimeOffRequest(db, {
      request_id: 'PTO-NEW',
      employee_id: 'E2001',
      start_date: '2026-09-01',
      end_date: '2026-09-03',
      reason: 'Conference',
      approved_by: 'manager@example.com',
    });

    const job = db.prepare("SELECT * FROM crm_sync_jobs WHERE request_id = 'PTO-NEW'").get();
    expect(job.status).toBe('pending');
    expect(JSON.parse(job.payload).requestId).toBe('PTO-NEW');
    db.close();
  });

  it('syncs deals to mock CRM with request_id idempotency', async () => {
    const dbPath = tempPath('payroll.db');
    const crm = new MockCrmClient();
    setupDb(dbPath);

    const first = await runCrmSync(syncOptions(dbPath, crm));
    expect(first.status).toBe('success');
    expect(first.recordsSynced).toBe(2);
    expect(crm.deals.size).toBe(2);

    const second = await runCrmSync(syncOptions(dbPath, crm));
    expect(second.recordsSynced).toBe(0);
    expect(crm.deals.size).toBe(2);

    const db = new Database(dbPath);
    const jobs = db.prepare("SELECT * FROM crm_sync_jobs WHERE status = 'synced'").all();
    expect(jobs).toHaveLength(2);
    expect(jobs[0].crm_deal_id).toBe(`deal-${jobs[0].request_id}`);
    db.close();
  });

  it('retries transient CRM failures with backoff then syncs', async () => {
    const dbPath = tempPath('payroll.db');
    const crm = new MockCrmClient();
    crm.setFailureForKey('PTO-1001', { failUntilAttempt: 2 });
    setupDb(dbPath);

    const result = await runCrmSync(syncOptions(dbPath, crm));
    expect(result.status).toBe('success');
    expect(result.recordsSynced).toBe(2);
    expect(crm.getDeal('PTO-1001').dealId).toBe('deal-PTO-1001');

    const db = new Database(dbPath);
    const job = db.prepare("SELECT * FROM crm_sync_jobs WHERE request_id = 'PTO-1001'").get();
    expect(job.status).toBe('synced');
    expect(job.attempt_count).toBe(0);
    db.close();
  });

  it('marks permanent failure and shows sync failed on dashboard', async () => {
    const dbPath = tempPath('payroll.db');
    const crm = new MockCrmClient();
    crm.setFailureForKey('PTO-1001', { failUntilAttempt: 99, status: 400, message: 'Invalid deal payload' });
    setupDb(dbPath);

    const result = await runCrmSync(
      syncOptions(dbPath, crm, { maxJobRetries: 2, maxRetries: 1, retryBaseMs: 5 })
    );

    expect(result.recordsFailed).toBe(1);
    expect(result.recordsSynced).toBe(1);

    const db = new Database(dbPath);
    const failedJob = db.prepare("SELECT * FROM crm_sync_jobs WHERE request_id = 'PTO-1001'").get();
    expect(failedJob.status).toBe('failed');
    expect(failedJob.next_retry_at).toBeNull();

    const rows = getDashboardRows(db);
    const row = rows.find((r) => r.requestId === 'PTO-1001');
    expect(row.crmSyncLabel).toBe('Sync failed');
    expect(row.lastError).toContain('Invalid deal payload');
    db.close();
  });
});
