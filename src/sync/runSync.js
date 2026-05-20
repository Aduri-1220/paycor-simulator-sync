import { createDb, getExistingSourceUpdatedAt } from '../db/client.js';
import { loadMappings } from '../source/index.js';
import { readSourceFile } from '../source/reader.js';
import { logger } from '../utils/logger.js';
import { isRetriableSqliteError, withRetry } from '../utils/retry.js';
import { compareSourceUpdatedAt, mapEmployee } from './mapper.js';
import { upsertEmployee } from './upsert.js';
import { validateEmployee } from './validator.js';

function startRun(db) {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO sync_runs (started_at, status, records_read, records_upserted, records_skipped, records_failed)
       VALUES (?, 'running', 0, 0, 0, 0)`
    )
    .run(startedAt);
  return { runId: Number(result.lastInsertRowid), startedAt };
}

function finishRun(db, runId, payload) {
  db.prepare(
    `UPDATE sync_runs
     SET finished_at = ?, status = ?, records_read = ?, records_upserted = ?,
         records_skipped = ?, records_failed = ?, error_summary = ?
     WHERE run_id = ?`
  ).run(
    payload.finishedAt,
    payload.status,
    payload.recordsRead,
    payload.recordsUpserted,
    payload.recordsSkipped,
    payload.recordsFailed,
    payload.errorSummary ?? null,
    runId
  );
}

function logRowError(db, { runId, employeeId, errorCode, errorMessage, rawPayload }) {
  db.prepare(
    `INSERT INTO sync_errors (run_id, employee_id, error_code, error_message, raw_payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    employeeId,
    errorCode,
    errorMessage,
    rawPayload ? JSON.stringify(rawPayload) : null,
    new Date().toISOString()
  );
}

function finalizeStatus({ recordsFailed, recordsUpserted, recordsSkipped, fileFailed }) {
  if (fileFailed) return 'failed';
  if (recordsFailed > 0) return 'partial';
  return 'success';
}

export async function runSync(options) {
  const {
    sourcePath,
    sourceFormat,
    dbPath,
    mappingsPath,
    maxRetries,
    retryBaseMs,
    skipUnchanged,
  } = options;

  const db = createDb(dbPath);
  const mappings = loadMappings(mappingsPath);
  const { runId, startedAt } = startRun(db);

  const stats = {
    recordsRead: 0,
    recordsUpserted: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
  };

  logger.info('sync run started', { run_id: runId });

  let fileFailed = false;
  let errorSummary = null;
  let employees = [];

  try {
    employees = readSourceFile(sourcePath, sourceFormat);
  } catch (err) {
    fileFailed = true;
    errorSummary = err.message;
    const errorCode = err.code ?? 'SOURCE_PARSE_ERROR';
    logRowError(db, {
      runId,
      employeeId: null,
      errorCode,
      errorMessage: err.message,
      rawPayload: null,
    });
    logger.error('source file error', { run_id: runId, error_code: errorCode, msg: err.message });
  }

  if (!fileFailed) {
    stats.recordsRead = employees.length;
    const seenInFile = new Set();

    for (let index = 0; index < employees.length; index++) {
      const raw = employees[index];
      const validation = validateEmployee(raw, index);

      if (!validation.valid) {
        stats.recordsFailed += 1;
        logRowError(db, {
          runId,
          employeeId: validation.employeeId,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: validation.errors.join('; '),
          rawPayload: raw,
        });
        logger.error('employee validation failed', {
          run_id: runId,
          employee_id: validation.employeeId,
          action: 'error',
        });
        continue;
      }

      const employeeId = validation.employeeId;
      if (seenInFile.has(employeeId)) {
        stats.recordsFailed += 1;
        logRowError(db, {
          runId,
          employeeId,
          errorCode: 'DUPLICATE_IN_SOURCE',
          errorMessage: `Duplicate employee_id in source file: ${employeeId}`,
          rawPayload: raw,
        });
        logger.error('duplicate employee in source', {
          run_id: runId,
          employee_id: employeeId,
          action: 'error',
        });
        continue;
      }
      seenInFile.add(employeeId);

      let mapped;
      try {
        mapped = mapEmployee(raw, mappings, { runStartedAt: startedAt });
      } catch (err) {
        stats.recordsFailed += 1;
        logRowError(db, {
          runId,
          employeeId,
          errorCode: 'MAPPING_ERROR',
          errorMessage: err.message,
          rawPayload: raw,
        });
        logger.error('employee mapping failed', {
          run_id: runId,
          employee_id: employeeId,
          action: 'error',
        });
        continue;
      }

      if (skipUnchanged) {
        const existingUpdatedAt = getExistingSourceUpdatedAt(db, employeeId);
        if (compareSourceUpdatedAt(existingUpdatedAt, mapped.employee.source_updated_at)) {
          stats.recordsSkipped += 1;
          logger.info('employee skipped unchanged', {
            run_id: runId,
            employee_id: employeeId,
            action: 'skip',
          });
          continue;
        }
      }

      try {
        const action = await withRetry(
          () => upsertEmployee(db, mapped),
          {
            maxRetries,
            retryBaseMs,
            context: { run_id: runId, employee_id: employeeId },
          }
        );
        stats.recordsUpserted += 1;
        logger.info('employee upserted', {
          run_id: runId,
          employee_id: employeeId,
          action,
        });
      } catch (err) {
        stats.recordsFailed += 1;
        const errorCode = isRetriableSqliteError(err)
          ? 'DB_TRANSIENT_EXHAUSTED'
          : err.code?.startsWith('SQLITE')
            ? 'DB_CONSTRAINT_ERROR'
            : 'UNKNOWN_ERROR';
        logRowError(db, {
          runId,
          employeeId,
          errorCode,
          errorMessage: err.message,
          rawPayload: raw,
        });
        logger.error('employee upsert failed', {
          run_id: runId,
          employee_id: employeeId,
          action: 'error',
          error_code: errorCode,
        });
      }
    }
  }

  const status = finalizeStatus({ ...stats, fileFailed });
  const finishedAt = new Date().toISOString();

  finishRun(db, runId, {
    finishedAt,
    status,
    errorSummary,
    ...stats,
  });

  logger.info('sync run completed', {
    run_id: runId,
    status,
    ...stats,
  });

  db.close();

  return {
    runId,
    status,
    ...stats,
    errorSummary,
  };
}
