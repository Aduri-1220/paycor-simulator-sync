import { buildDealPayload } from './buildDealPayload.js';
import { getRequestWithEmployee, insertCrmSyncJob } from './queries.js';
import { logger } from '../utils/logger.js';

export function approveTimeOffRequest(db, row) {
  const now = new Date().toISOString();
  const approvedRow = {
    ...row,
    status: 'approved',
    approved_at: row.approved_at ?? now,
    approved_by: row.approved_by ?? null,
    recipient_email: row.recipient_email ?? null,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO time_off_requests (
         request_id, employee_id, start_date, end_date, reason,
         status, approved_at, approved_by, recipient_email
       ) VALUES (
         @request_id, @employee_id, @start_date, @end_date, @reason,
         @status, @approved_at, @approved_by, @recipient_email
       )
       ON CONFLICT(request_id) DO UPDATE SET
         employee_id = excluded.employee_id,
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         reason = excluded.reason,
         status = excluded.status,
         approved_at = excluded.approved_at,
         approved_by = excluded.approved_by,
         recipient_email = excluded.recipient_email`
    ).run(approvedRow);

    const record = getRequestWithEmployee(db, approvedRow.request_id);
    const payload = buildDealPayload(record);
    const inserted = insertCrmSyncJob(db, {
      requestId: approvedRow.request_id,
      payload,
      createdAt: now,
    });

    return { requestId: approvedRow.request_id, jobEnqueued: inserted > 0 };
  });

  const result = tx();
  logger.info('time off approved', {
    request_id: result.requestId,
    crm_job_enqueued: result.jobEnqueued,
  });
  return result;
}

export function createPendingTimeOffRequest(db, row) {
  const requestId = row.request_id ?? `PTO-${Date.now().toString(36).toUpperCase()}`;
  const record = {
    request_id: requestId,
    employee_id: row.employee_id,
    start_date: row.start_date,
    end_date: row.end_date,
    reason: row.reason ?? '',
    status: 'pending',
    approved_at: null,
    approved_by: null,
    recipient_email: row.recipient_email ?? null,
  };

  db.prepare(
    `INSERT INTO time_off_requests (
       request_id, employee_id, start_date, end_date, reason,
       status, approved_at, approved_by, recipient_email
     ) VALUES (
       @request_id, @employee_id, @start_date, @end_date, @reason,
       @status, @approved_at, @approved_by, @recipient_email
     )`
  ).run(record);

  logger.info('time off request created', { request_id: requestId, status: 'pending' });
  return { requestId };
}

export function enqueueMissingCrmJobs(db) {
  const now = new Date().toISOString();
  const missing = db
    .prepare(
      `SELECT
         r.request_id,
         r.employee_id,
         r.start_date,
         r.end_date,
         r.reason,
         r.status,
         r.approved_at,
         r.approved_by,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.department
       FROM time_off_requests r
       LEFT JOIN employees e ON e.employee_id = r.employee_id
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id
       WHERE r.status = 'approved' AND j.job_id IS NULL`
    )
    .all();

  let enqueued = 0;
  for (const record of missing) {
    const payload = buildDealPayload(record);
    const inserted = insertCrmSyncJob(db, {
      requestId: record.request_id,
      payload,
      createdAt: now,
    });
    enqueued += inserted;
  }

  logger.info('backfilled crm sync jobs', { count: enqueued });
  return { count: enqueued };
}
