import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/schema.js';
import { runAiDraftQuote } from '../../src/quotes/runAiDraft.js';
import { getQuoteDetail } from '../../src/quotes/queries.js';

const tempFiles = [];

function tempDb() {
  const dbPath = path.join(os.tmpdir(), `quotes-${Date.now()}.db`);
  tempFiles.push(dbPath);
  const db = new Database(dbPath);
  migrate(db);
  return db;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

const catalogPath = path.resolve('config/catalog.json');
const promptPath = path.resolve('config/prompts/quote-draft-v1.json');

describe('runAiDraftQuote', () => {
  it('creates draft with audit run and validation errors for legacy SKU', async () => {
    const db = tempDb();
    const result = await runAiDraftQuote(db, {
      customer_name: 'Legacy Test Co',
      deal_notes: 'Need legacy hood install',
      catalogPath,
      aiMode: 'mock',
      aiModel: 'mock-quote-v1',
      promptVersion: 'quote-draft-v1',
      promptPath,
      openAiApiKey: '',
    });

    expect(result.status).toBe('validation_failed');
    const detail = getQuoteDetail(db, result.quoteId);
    expect(detail.validationErrors.some((e) => e.error_code === 'INACTIVE_SKU')).toBe(true);

    const run = db
      .prepare('SELECT model, prompt_version, status FROM ai_quote_runs WHERE run_id = ?')
      .get(result.runId);
    expect(run.model).toBe('mock-quote-v1');
    expect(run.prompt_version).toBe('quote-draft-v1');
    db.close();
  });

  it('creates approvable draft for standard kitchen notes', async () => {
    const db = tempDb();
    const result = await runAiDraftQuote(db, {
      customer_name: 'Acme Kitchens',
      deal_notes: '3 kitchens hood install by June with ventilation and 8 hours labor',
      catalogPath,
      aiMode: 'mock',
      aiModel: 'mock-quote-v1',
      promptVersion: 'quote-draft-v1',
      promptPath,
      openAiApiKey: '',
    });

    expect(result.status).toBe('draft');
    expect(result.validationErrors).toHaveLength(0);
    const detail = getQuoteDetail(db, result.quoteId);
    expect(detail.lines.length).toBeGreaterThan(0);
    db.close();
  });
});
