import { createDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { hashContent } from './hashContent.js';
import { loadTemplate } from './loadTemplate.js';
import {
  findDeliveredEmail,
  findExistingDocument,
  insertDocument,
  insertEmailDelivery,
  listApprovedRequests,
} from './queries.js';
import { renderHtml } from './renderHtml.js';
import { renderPdf } from './renderPdf.js';
import { sendDocumentEmail, isRetriableEmailError } from './sendEmail.js';
import { storeDocument } from './storeDocument.js';

function startRun(db) {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO document_runs (
         started_at, status, records_read, records_generated, records_skipped, records_failed
       ) VALUES (?, 'running', 0, 0, 0, 0)`
    )
    .run(startedAt);
  return { runId: Number(result.lastInsertRowid), startedAt };
}

function finishRun(db, runId, payload) {
  db.prepare(
    `UPDATE document_runs
     SET finished_at = ?, status = ?, records_read = ?, records_generated = ?,
         records_skipped = ?, records_failed = ?, error_summary = ?
     WHERE run_id = ?`
  ).run(
    payload.finishedAt,
    payload.status,
    payload.recordsRead,
    payload.recordsGenerated,
    payload.recordsSkipped,
    payload.recordsFailed,
    payload.errorSummary ?? null,
    runId
  );
}

function logDocumentError(db, { runId, requestId, errorCode, errorMessage, rawContext }) {
  db.prepare(
    `INSERT INTO document_errors (run_id, request_id, error_code, error_message, raw_context, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    requestId,
    errorCode,
    errorMessage,
    rawContext ? JSON.stringify(rawContext) : null,
    new Date().toISOString()
  );
}

function finalizeStatus({ recordsFailed, recordsGenerated, recordsSkipped }) {
  if (recordsFailed > 0 && recordsGenerated === 0 && recordsSkipped === 0) return 'failed';
  if (recordsFailed > 0) return 'partial';
  return 'success';
}

function buildContentPayload(record) {
  return {
    request_id: record.request_id,
    employee_id: record.employee_id,
    start_date: record.start_date,
    end_date: record.end_date,
    reason: record.reason ?? '',
    approved_at: record.approved_at,
    approved_by: record.approved_by,
  };
}

async function withEmailRetry(fn, { maxRetries, retryBaseMs, context }) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetriableEmailError(err) || attempt === maxRetries - 1) {
        throw err;
      }
      const delay = retryBaseMs * 2 ** attempt;
      logger.warn('retrying after transient email error', {
        ...context,
        attempt: attempt + 1,
        delay_ms: delay,
        status: err.status,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function runDocumentPipeline(options) {
  const {
    dbPath,
    templatesRoot,
    templateId,
    documentsDir,
    emailProvider,
    emailApiKey,
    emailFrom,
    emailDryRun,
    maxRetries,
    retryBaseMs,
    renderPdfFn = renderPdf,
    sendEmailFn = sendDocumentEmail,
  } = options;

  const db = createDb(dbPath);
  const template = loadTemplate(templateId, templatesRoot);
  const { runId } = startRun(db);

  const stats = {
    recordsRead: 0,
    recordsGenerated: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
  };

  let errorSummary = null;
  const requests = listApprovedRequests(db);
  stats.recordsRead = requests.length;

  logger.info('document run started', { run_id: runId, records_read: stats.recordsRead });

  for (const record of requests) {
    const requestId = record.request_id;
    const contentHash = hashContent(buildContentPayload(record));

    try {
      const existing = findExistingDocument(
        db,
        requestId,
        template.templateId,
        template.version,
        contentHash
      );

      let documentId;
      let filePath;
      let sha256;

      if (existing) {
        documentId = existing.document_id;
        filePath = existing.file_path;
        sha256 = existing.sha256;
        stats.recordsSkipped += 1;
        logger.info('document skipped unchanged', {
          run_id: runId,
          request_id: requestId,
          document_id: documentId,
        });
      } else {
        const { html, vars } = renderHtml(template, record);
        const pdfBuffer = await renderPdfFn(html);
        const stored = storeDocument({
          documentsDir,
          requestId,
          templateId: template.templateId,
          templateVersion: template.version,
          pdfBuffer,
        });

        const createdAt = new Date().toISOString();
        documentId = insertDocument(db, {
          requestId,
          runId,
          templateId: template.templateId,
          templateVersion: template.version,
          filePath: stored.filePath,
          sha256: stored.sha256,
          byteSize: stored.byteSize,
          contentHash,
          createdAt,
        });

        filePath = stored.filePath;
        sha256 = stored.sha256;
        stats.recordsGenerated += 1;

        logger.info('document generated', {
          run_id: runId,
          request_id: requestId,
          document_id: documentId,
          sha256,
          file_path: stored.relativePath,
        });

        Object.assign(vars, { requestId });
      }

      const delivered = findDeliveredEmail(db, documentId);
      if (delivered) {
        logger.info('email already delivered', {
          run_id: runId,
          request_id: requestId,
          document_id: documentId,
        });
        continue;
      }

      const to = record.recipient_email;
      if (!to) {
        stats.recordsFailed += 1;
        logDocumentError(db, {
          runId,
          requestId,
          errorCode: 'MISSING_RECIPIENT',
          errorMessage: 'No recipient_email on request or employee record',
          rawContext: { request_id: requestId },
        });
        continue;
      }

      const { vars } = renderHtml(template, record);
      vars.requestId = requestId;

      try {
        const emailResult = await withEmailRetry(
          () =>
            sendEmailFn({
              provider: emailProvider,
              apiKey: emailApiKey,
              from: emailFrom,
              to,
              emailTemplate: template.email,
              vars,
              attachmentPath: filePath,
              dryRun: emailDryRun,
            }),
          { maxRetries, retryBaseMs, context: { run_id: runId, request_id: requestId } }
        );

        insertEmailDelivery(db, {
          documentId,
          toEmail: to,
          status: emailResult.status ?? 'delivered',
          provider: emailResult.provider,
          providerMessageId: emailResult.messageId,
          createdAt: new Date().toISOString(),
        });

        logger.info('email sent', {
          run_id: runId,
          request_id: requestId,
          document_id: documentId,
          provider: emailResult.provider,
        });
      } catch (err) {
        stats.recordsFailed += 1;
        const errorCode =
          err.status >= 400 && err.status < 500 ? 'EMAIL_CLIENT_ERROR' : 'EMAIL_SEND_ERROR';

        insertEmailDelivery(db, {
          documentId,
          toEmail: to,
          status: 'failed',
          provider: emailProvider,
          errorMessage: err.message,
          createdAt: new Date().toISOString(),
        });

        logDocumentError(db, {
          runId,
          requestId,
          errorCode,
          errorMessage: err.message,
          rawContext: { document_id: documentId, to },
        });

        logger.error('email send failed', {
          run_id: runId,
          request_id: requestId,
          error_code: errorCode,
          msg: err.message,
        });
      }
    } catch (err) {
      stats.recordsFailed += 1;
      logDocumentError(db, {
        runId,
        requestId,
        errorCode: 'PIPELINE_ERROR',
        errorMessage: err.message,
        rawContext: { request_id: requestId },
      });
      logger.error('document pipeline error', {
        run_id: runId,
        request_id: requestId,
        msg: err.message,
      });
    }
  }

  const status = finalizeStatus(stats);
  const finishedAt = new Date().toISOString();

  finishRun(db, runId, {
    finishedAt,
    status,
    errorSummary,
    ...stats,
  });

  logger.info('document run completed', { run_id: runId, status, ...stats });

  db.close();

  return { runId, status, ...stats, errorSummary };
}
