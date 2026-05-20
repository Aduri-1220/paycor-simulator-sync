import { createDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { createCrmClient, isRetriableCrmError } from './crmClient.js';
import {
  listJobsReadyForSync,
  markJobFailed,
  markJobProcessing,
  markJobSynced,
  scheduleJobRetry,
} from './queries.js';

function startRun(db) {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO crm_sync_runs (
         started_at, status, records_read, records_synced, records_skipped, records_failed
       ) VALUES (?, 'running', 0, 0, 0, 0)`
    )
    .run(startedAt);
  return { runId: Number(result.lastInsertRowid), startedAt };
}

function finishRun(db, runId, payload) {
  db.prepare(
    `UPDATE crm_sync_runs
     SET finished_at = ?, status = ?, records_read = ?, records_synced = ?,
         records_skipped = ?, records_failed = ?, error_summary = ?
     WHERE run_id = ?`
  ).run(
    payload.finishedAt,
    payload.status,
    payload.recordsRead,
    payload.recordsSynced,
    payload.recordsSkipped,
    payload.recordsFailed,
    payload.errorSummary ?? null,
    runId
  );
}

function logCrmError(db, { runId, requestId, jobId, errorCode, errorMessage, rawContext }) {
  db.prepare(
    `INSERT INTO crm_sync_errors (
       run_id, request_id, job_id, error_code, error_message, raw_context, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    requestId,
    jobId,
    errorCode,
    errorMessage,
    rawContext ? JSON.stringify(rawContext) : null,
    new Date().toISOString()
  );
}

function finalizeStatus({ recordsFailed, recordsSynced, recordsSkipped }) {
  if (recordsFailed > 0 && recordsSynced === 0 && recordsSkipped === 0) return 'failed';
  if (recordsFailed > 0) return 'partial';
  return 'success';
}

async function withCrmRetry(fn, { maxRetries, retryBaseMs, context }) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetriableCrmError(err) || attempt === maxRetries - 1) {
        throw err;
      }
      const delay = retryBaseMs * 2 ** attempt;
      logger.warn('retrying after transient crm error', {
        ...context,
        attempt: attempt + 1,
        delay_ms: delay,
        status: err.status,
        error_code: err.code,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function runCrmSync(options) {
  const {
    dbPath,
    crmMode,
    crmBaseUrl,
    crmApiKey,
    maxRetries,
    retryBaseMs,
    maxJobRetries,
    crmClient,
  } = options;

  const db = createDb(dbPath);
  const crm =
    crmClient ??
    createCrmClient({
      mode: crmMode,
      baseUrl: crmBaseUrl,
      apiKey: crmApiKey,
      hubspotPipeline: options.hubspotPipeline,
      hubspotDealStage: options.hubspotDealStage,
    });

  const { runId } = startRun(db);
  const stats = {
    recordsRead: 0,
    recordsSynced: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
  };

  const nowIso = new Date().toISOString();
  const jobs = listJobsReadyForSync(db, nowIso);
  stats.recordsRead = jobs.length;

  logger.info('crm sync run started', { run_id: runId, records_read: stats.recordsRead });

  for (const job of jobs) {
    const requestId = job.request_id;
    const payload = JSON.parse(job.payload);
    const updatedAt = new Date().toISOString();

    markJobProcessing(db, job.job_id, updatedAt);

    try {
      const result = await withCrmRetry(
        () => crm.createOrUpdateDeal(requestId, payload, job.crm_deal_id),
        { maxRetries, retryBaseMs, context: { run_id: runId, request_id: requestId } }
      );

      markJobSynced(db, {
        jobId: job.job_id,
        crmDealId: result.dealId,
        updatedAt: new Date().toISOString(),
      });

      stats.recordsSynced += 1;
      logger.info('crm deal synced', {
        run_id: runId,
        request_id: requestId,
        crm_deal_id: result.dealId,
        action: result.action,
      });
    } catch (err) {
      const attemptCount = job.attempt_count + 1;
      const errorCode =
        err.status >= 400 && err.status < 500 && err.status !== 429
          ? 'CRM_CLIENT_ERROR'
          : 'CRM_SYNC_ERROR';
      const canRetry = isRetriableCrmError(err) && attemptCount < maxJobRetries;

      if (canRetry) {
        const nextRetryAt = new Date(Date.now() + retryBaseMs * 2 ** (attemptCount - 1)).toISOString();
        scheduleJobRetry(db, {
          jobId: job.job_id,
          attemptCount,
          nextRetryAt,
          lastError: err.message,
          updatedAt: new Date().toISOString(),
        });
        logger.warn('crm sync scheduled for retry', {
          run_id: runId,
          request_id: requestId,
          attempt_count: attemptCount,
          next_retry_at: nextRetryAt,
        });
      } else {
        markJobFailed(db, {
          jobId: job.job_id,
          attemptCount,
          lastError: err.message,
          updatedAt: new Date().toISOString(),
        });
        stats.recordsFailed += 1;
        logCrmError(db, {
          runId,
          requestId,
          jobId: job.job_id,
          errorCode,
          errorMessage: err.message,
          rawContext: { attempt_count: attemptCount, status: err.status },
        });
        logger.error('crm sync failed', {
          run_id: runId,
          request_id: requestId,
          error_code: errorCode,
          msg: err.message,
        });
      }
    }
  }

  const syncedJobs = db
    .prepare("SELECT COUNT(*) AS c FROM crm_sync_jobs WHERE status = 'synced'")
    .get().c;
  const failedJobs = db
    .prepare("SELECT COUNT(*) AS c FROM crm_sync_jobs WHERE status = 'failed' AND next_retry_at IS NULL")
    .get().c;

  const status = finalizeStatus(stats);
  const finishedAt = new Date().toISOString();
  const errorSummary =
    failedJobs > 0 ? `${failedJobs} request(s) show sync failed on dashboard` : null;

  finishRun(db, runId, {
    finishedAt,
    status,
    errorSummary,
    ...stats,
  });

  logger.info('crm sync run completed', {
    run_id: runId,
    status,
    synced_total: syncedJobs,
    ...stats,
  });

  db.close();

  return { runId, status, ...stats, errorSummary, syncedTotal: syncedJobs, failedTotal: failedJobs };
}
