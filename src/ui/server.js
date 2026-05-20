import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateCrmConfig, validateQuoteConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { logger, setLogLevel } from '../utils/logger.js';
import { createApiHandlers } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../../public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function serveStatic(req, res) {
  const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(publicDir, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export function createUiServer(options = {}) {
  const db = options.db ?? createDb(options.dbPath ?? config.dbPath);
  const handlers = createApiHandlers({ db, config: options.config ?? config });

  const server = http.createServer(async (req, res) => {
    try {
      const { method } = req;
      const url = new URL(req.url, 'http://localhost');

      if (method === 'GET' && url.pathname === '/api/summary') {
        return sendJson(res, 200, handlers.getSummary());
      }

      if (method === 'GET' && url.pathname === '/api/config') {
        return sendJson(res, 200, {
          crmMode: config.crmMode,
          hubspotPortalConfigured: Boolean(config.crmHubspotPortalId),
          quoteAiMode: config.quoteAiMode,
          quotePromptVersion: config.quotePromptVersion,
        });
      }

      if (method === 'GET' && url.pathname === '/api/quotes/summary') {
        return sendJson(res, 200, handlers.getQuoteSummary());
      }

      if (method === 'GET' && url.pathname === '/api/quotes') {
        return sendJson(res, 200, { quotes: handlers.listQuotes() });
      }

      const quoteDetailMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)$/);
      if (method === 'GET' && quoteDetailMatch) {
        const quote = handlers.getQuote(decodeURIComponent(quoteDetailMatch[1]));
        return sendJson(res, 200, { quote });
      }

      if (method === 'POST' && url.pathname === '/api/quotes/draft') {
        const body = await readJsonBody(req);
        const result = await handlers.createQuoteDraft(body);
        return sendJson(res, 201, result);
      }

      const quoteApproveMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)\/approve$/);
      if (method === 'POST' && quoteApproveMatch) {
        const body = await readJsonBody(req);
        const result = handlers.approveQuote(decodeURIComponent(quoteApproveMatch[1]), body);
        return sendJson(res, 200, result);
      }

      const quoteRegenerateMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)\/regenerate$/);
      if (method === 'POST' && quoteRegenerateMatch) {
        const body = await readJsonBody(req);
        const quoteId = decodeURIComponent(quoteRegenerateMatch[1]);
        const existing = handlers.getQuote(quoteId);
        const result = await handlers.createQuoteDraft({
          quote_id: quoteId,
          customer_name: body.customer_name ?? existing.customerName,
          deal_notes: body.deal_notes ?? existing.dealNotes,
        });
        return sendJson(res, 200, result);
      }

      if (method === 'GET' && url.pathname === '/api/requests') {
        return sendJson(res, 200, { requests: handlers.listRequests() });
      }

      if (method === 'GET' && url.pathname === '/api/employees') {
        return sendJson(res, 200, { employees: handlers.listEmployees() });
      }

      if (method === 'POST' && url.pathname === '/api/requests') {
        const body = await readJsonBody(req);
        const result = handlers.createRequest(body);
        return sendJson(res, 201, result);
      }

      const approveMatch = url.pathname.match(/^\/api\/requests\/([^/]+)\/approve$/);
      if (method === 'POST' && approveMatch) {
        const body = await readJsonBody(req);
        const result = handlers.approveRequest(decodeURIComponent(approveMatch[1]), body);
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && url.pathname === '/api/crm/sync') {
        const result = await handlers.runCrmSync();
        return sendJson(res, 200, result);
      }

      if (method === 'GET') {
        if (serveStatic(req, res)) return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      logger.error('ui request failed', { msg: err.message, path: req.url });
      sendJson(res, err.status ?? 500, { error: err.message });
    }
  });

  return { server, db };
}

export function startUiServer(port = config.uiPort) {
  validateCrmConfig();
  validateQuoteConfig();
  setLogLevel(config.logLevel);
  const { server } = createUiServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('ui port already in use', {
        port,
        hint: `Stop the other process or run: UI_PORT=${port + 1} npm run ui`,
      });
      process.exit(1);
    }
    throw err;
  });
  server.listen(port, () => {
    logger.info('ui server started', { url: `http://localhost:${port}` });
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startUiServer();
}
