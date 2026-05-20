import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { approveTimeOffRequest } from '../../src/crm/approveRequest.js';
import { migrate } from '../../src/db/schema.js';
import {
  createCrmSyncJob,
  getQuoteDraft,
  getRequest,
  searchPriceCatalog,
} from '../../src/mcp/handlers.js';
import { seedProductCatalog } from '../../src/quotes/seedCatalog.js';
import { runAiDraftQuote } from '../../src/quotes/runAiDraft.js';
import { seedPendingTimeOff } from '../../src/ui/seed.js';

const tempFiles = [];

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `mcp-tools-${Date.now()}-${name}`);
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
    `INSERT INTO employees (employee_id, first_name, last_name, email, department, employment_status, synced_at)
     VALUES ('E1001', 'Jordan', 'Lee', 'jordan@example.com', 'Kitchen', 'active', ?)`
  ).run(new Date().toISOString());
  db.prepare(
    `INSERT INTO employees (employee_id, first_name, last_name, email, department, employment_status, synced_at)
     VALUES ('E1002', 'Sam', 'Rivera', 'sam.rivera@example.com', 'Kitchen', 'active', ?)`
  ).run(new Date().toISOString());
  seedPendingTimeOff(db);
  return db;
}

describe('portal mcp handlers', () => {
  it('get_request returns pending request details', () => {
    const dbPath = tempPath('payroll.db');
    const db = setupDb(dbPath);

    const request = getRequest(db, 'PTO-2001');
    expect(request.requestId).toBe('PTO-2001');
    expect(request.requestStatus).toBe('pending');
    expect(request.employeeName).toBe('Jordan Lee');
    expect(request.crmSyncStatus).toBeNull();

    db.close();
  });

  it('get_quote_draft returns AI draft with line items', async () => {
    const dbPath = tempPath('payroll.db');
    const db = setupDb(dbPath);
    const catalogPath = path.resolve('config/catalog.json');

    seedProductCatalog(db, catalogPath);
    const draft = await runAiDraftQuote(db, {
      customer_name: 'MCP Test Co',
      deal_notes: 'hood install 8 hours labor',
      catalogPath,
      aiMode: 'mock',
      aiModel: 'mock',
      promptVersion: 'quote-draft-v1',
      promptPath: path.resolve('config/prompts/quote-draft-v1.json'),
      openAiApiKey: '',
    });

    const quote = getQuoteDraft(db, draft.quoteId);
    expect(quote.customerName).toBe('MCP Test Co');
    expect(quote.lines.length).toBeGreaterThan(0);
    expect(quote.status).toBe('draft');

    db.close();
  });

  it('search_price_catalog finds hood products', () => {
    const dbPath = tempPath('payroll.db');
    const db = setupDb(dbPath);
    const catalogPath = path.resolve('config/catalog.json');
    seedProductCatalog(db, catalogPath);

    const results = searchPriceCatalog(db, 'hood', catalogPath);
    expect(results.matchCount).toBeGreaterThan(0);
    expect(results.products.some((p) => p.sku === 'HOOD-12')).toBe(true);
    expect(results.policy.min_margin_pct).toBe(15);

    db.close();
  });

  it('create_crm_sync_job rejects pending requests', () => {
    const dbPath = tempPath('payroll.db');
    const db = setupDb(dbPath);

    expect(() => createCrmSyncJob(db, 'PTO-2001')).toThrow(/approved requests/);

    db.close();
  });

  it('create_crm_sync_job enqueues for approved request and is idempotent', () => {
    const dbPath = tempPath('payroll.db');
    const db = setupDb(dbPath);

    approveTimeOffRequest(db, {
      request_id: 'PTO-2001',
      employee_id: 'E1001',
      start_date: '2026-08-15',
      end_date: '2026-08-16',
      reason: 'Personal day',
      approved_by: 'mgr@test.com',
    });

    db.prepare("DELETE FROM crm_sync_jobs WHERE request_id = 'PTO-2001'").run();

    const first = createCrmSyncJob(db, 'PTO-2001');
    expect(first.created).toBe(true);
    expect(first.status).toBe('pending');

    const second = createCrmSyncJob(db, 'PTO-2001');
    expect(second.created).toBe(false);
    expect(second.jobId).toBe(first.jobId);

    db.close();
  });
});
