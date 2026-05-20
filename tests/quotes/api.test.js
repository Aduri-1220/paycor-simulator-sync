import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/schema.js';
import { config } from '../../src/config.js';
import { createUiServer } from '../../src/ui/server.js';

const tempFiles = [];
let server;

function tempPath(name) {
  const filePath = path.join(os.tmpdir(), `quotes-api-${Date.now()}-${name}`);
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

async function startServer(dbPath) {
  const db = new Database(dbPath);
  migrate(db);
  db.close();

  const { server: s } = createUiServer({
    dbPath,
    config: {
      ...config,
      dbPath,
      quoteAiMode: 'mock',
      quoteCatalogPath: path.resolve('config/catalog.json'),
      quotePromptPath: path.resolve('config/prompts/quote-draft-v1.json'),
      quotePromptVersion: 'quote-draft-v1',
      openAiApiKey: '',
    },
  });
  await new Promise((resolve) => s.listen(0, resolve));
  const { port } = s.address();
  server = s;
  return port;
}

describe('quotes api', () => {
  it('drafts, lists, and approves a valid quote', async () => {
    const dbPath = tempPath('payroll.db');
    const port = await startServer(dbPath);

    const draftRes = await fetch(`http://127.0.0.1:${port}/api/quotes/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'API Customer',
        deal_notes: 'hood and 4 hours install labor',
      }),
    });
    expect(draftRes.status).toBe(201);
    const draft = await draftRes.json();
    expect(draft.status).toBe('draft');

    const detailRes = await fetch(
      `http://127.0.0.1:${port}/api/quotes/${encodeURIComponent(draft.quoteId)}`
    );
    const { quote } = await detailRes.json();
    expect(quote.assumptions.length).toBeGreaterThan(0);
    expect(quote.lines.length).toBeGreaterThan(0);

    const approveRes = await fetch(
      `http://127.0.0.1:${port}/api/quotes/${encodeURIComponent(draft.quoteId)}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: 'mgr@test.com' }),
      }
    );
    expect(approveRes.status).toBe(200);

    const listRes = await fetch(`http://127.0.0.1:${port}/api/quotes`);
    const { quotes } = await listRes.json();
    expect(quotes.find((q) => q.quoteId === draft.quoteId)?.status).toBe('approved');
  });
});
