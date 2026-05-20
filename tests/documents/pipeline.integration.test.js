import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/schema.js';
import { runDocumentPipeline } from '../../src/documents/runDocumentPipeline.js';
import { seedApprovedTimeOff } from '../../src/documents/seed.js';

const tempFiles = [];
const tempDirs = [];

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `doc-pipeline-${Date.now()}-${name}`);
  tempFiles.push(filePath);
  return filePath;
}

function tempDir(name) {
  const dir = path.join(os.tmpdir(), `doc-pipeline-dir-${Date.now()}-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const file of tempFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
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
  seedApprovedTimeOff(db);
  db.close();
}

function pipelineOptions(dbPath, documentsDir, overrides = {}) {
  return {
    dbPath,
    templatesRoot: path.resolve('config/templates'),
    templateId: 'time-off-approval',
    documentsDir,
    emailProvider: 'resend',
    emailApiKey: '',
    emailFrom: 'onboarding@resend.dev',
    emailDryRun: true,
    maxRetries: 2,
    retryBaseMs: 10,
    renderPdfFn: async () => Buffer.from('%PDF-1.4 mock'),
    ...overrides,
  };
}

describe('document pipeline integration', () => {
  it('generates PDFs and records audit rows for approved requests', async () => {
    const dbPath = tempPath('payroll.db');
    const documentsDir = tempDir('documents');
    setupDb(dbPath);

    const result = await runDocumentPipeline(pipelineOptions(dbPath, documentsDir));

    expect(result.status).toBe('success');
    expect(result.recordsRead).toBe(2);
    expect(result.recordsGenerated).toBe(2);
    expect(result.recordsFailed).toBe(0);

    const db = new Database(dbPath);
    const docs = db.prepare('SELECT * FROM documents').all();
    expect(docs).toHaveLength(2);
    expect(docs[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(docs[0].file_path)).toBe(true);

    const emails = db.prepare("SELECT * FROM email_deliveries WHERE status = 'delivered'").all();
    expect(emails).toHaveLength(2);

    const run = db.prepare('SELECT status FROM document_runs WHERE run_id = ?').get(result.runId);
    expect(run.status).toBe('success');
    db.close();
  });

  it('skips PDF regeneration on second run (idempotent)', async () => {
    const dbPath = tempPath('payroll.db');
    const documentsDir = tempDir('documents');
    setupDb(dbPath);

    await runDocumentPipeline(pipelineOptions(dbPath, documentsDir));
    const second = await runDocumentPipeline(pipelineOptions(dbPath, documentsDir));

    expect(second.recordsSkipped).toBe(2);
    expect(second.recordsGenerated).toBe(0);

    const db = new Database(dbPath);
    const docs = db.prepare('SELECT COUNT(*) AS c FROM documents').get();
    expect(docs.c).toBe(2);
    db.close();
  });

  it('marks partial when PDF succeeds but recipient email is missing', async () => {
    const dbPath = tempPath('payroll.db');
    const documentsDir = tempDir('documents');
    const db = new Database(dbPath);
    migrate(db);
    db.prepare(
      `INSERT INTO employees (employee_id, first_name, last_name, email, employment_status, synced_at)
       VALUES ('E9999', 'No', 'Email', NULL, 'active', ?)`
    ).run(new Date().toISOString());
    db.prepare(
      `INSERT INTO time_off_requests (
         request_id, employee_id, start_date, end_date, reason, status,
         approved_at, approved_by, recipient_email
       ) VALUES ('PTO-X', 'E9999', '2026-08-01', '2026-08-02', 'Test', 'approved',
         '2026-05-20T10:00:00Z', 'mgr@example.com', NULL)`
    ).run();
    db.close();

    const result = await runDocumentPipeline(pipelineOptions(dbPath, documentsDir));

    expect(result.status).toBe('partial');
    expect(result.recordsGenerated).toBe(1);
    expect(result.recordsFailed).toBe(1);

    const check = new Database(dbPath);
    const err = check
      .prepare('SELECT error_code FROM document_errors WHERE request_id = ?')
      .get('PTO-X');
    expect(err.error_code).toBe('MISSING_RECIPIENT');
    check.close();
  });
});
