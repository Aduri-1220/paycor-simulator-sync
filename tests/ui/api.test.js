import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/schema.js';
import { createUiServer } from '../../src/ui/server.js';
import { seedPendingTimeOff } from '../../src/ui/seed.js';

const tempFiles = [];
let server;

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `ui-api-${Date.now()}-${name}`);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  for (const file of tempFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

function setupDb(dbPath) {
  const db = new Database(dbPath);
  migrate(db);
  db.prepare(
    `INSERT INTO employees (employee_id, first_name, last_name, email, employment_status, synced_at)
     VALUES ('E1001', 'Jordan', 'Lee', 'jordan@example.com', 'active', ?)`
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO employees (employee_id, first_name, last_name, email, employment_status, synced_at)
     VALUES ('E1002', 'Sam', 'Rivera', 'sam.rivera@example.com', 'active', ?)`
  ).run(new Date().toISOString());
  seedPendingTimeOff(db);
  db.close();
}

async function startServer(dbPath) {
  const { server: s } = createUiServer({
    dbPath,
    config: {
      dbPath,
      crmMode: 'mock',
      crmBaseUrl: '',
      crmApiKey: '',
      crmHubspotPortalId: '',
      crmHubspotPipeline: '',
      crmHubspotDealStage: '',
      crmMaxJobRetries: 3,
      maxRetries: 2,
      retryBaseMs: 10,
    },
  });
  await new Promise((resolve) => s.listen(0, resolve));
  const { port } = s.address();
  server = s;
  return port;
}

describe('ui api', () => {
  it('lists pending requests and approves with crm job enqueue', async () => {
    const dbPath = tempPath('payroll.db');
    setupDb(dbPath);
    const port = await startServer(dbPath);

    const listRes = await fetch(`http://127.0.0.1:${port}/api/requests`);
    const list = await listRes.json();
    expect(list.requests.some((r) => r.requestId === 'PTO-2001' && r.requestStatus === 'pending')).toBe(true);

    const approveRes = await fetch(`http://127.0.0.1:${port}/api/requests/PTO-2001/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved_by: 'mgr@test.com' }),
    });
    expect(approveRes.status).toBe(200);

    const db = new Database(dbPath);
    const job = db.prepare("SELECT status FROM crm_sync_jobs WHERE request_id = 'PTO-2001'").get();
    expect(job.status).toBe('pending');
    db.close();
  });

  it('creates a new pending request', async () => {
    const dbPath = tempPath('payroll.db');
    setupDb(dbPath);
    const port = await startServer(dbPath);

    const res = await fetch(`http://127.0.0.1:${port}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: 'E1001',
        start_date: '2026-10-01',
        end_date: '2026-10-03',
        reason: 'UI test',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.requestId).toMatch(/^PTO-/);
  });
});
