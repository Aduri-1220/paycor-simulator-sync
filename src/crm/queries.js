export function getRequestWithEmployee(db, requestId) {
  return db
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
         r.recipient_email,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.department
       FROM time_off_requests r
       LEFT JOIN employees e ON e.employee_id = r.employee_id
       WHERE r.request_id = ?`
    )
    .get(requestId);
}

export function insertCrmSyncJob(db, { requestId, payload, createdAt }) {
  const result = db
    .prepare(
      `INSERT INTO crm_sync_jobs (
         request_id, status, payload, attempt_count, created_at, updated_at
       ) VALUES (?, 'pending', ?, 0, ?, ?)
       ON CONFLICT(request_id) DO NOTHING`
    )
    .run(requestId, JSON.stringify(payload), createdAt, createdAt);
  return Number(result.changes);
}

export function getCrmSyncJob(db, requestId) {
  return db.prepare('SELECT * FROM crm_sync_jobs WHERE request_id = ?').get(requestId);
}

export function listJobsReadyForSync(db, nowIso) {
  return db
    .prepare(
      `SELECT *
       FROM crm_sync_jobs
       WHERE status IN ('pending', 'failed')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC`
    )
    .all(nowIso);
}

export function markJobProcessing(db, jobId, updatedAt) {
  db.prepare(
    `UPDATE crm_sync_jobs
     SET status = 'processing', updated_at = ?
     WHERE job_id = ?`
  ).run(updatedAt, jobId);
}

export function markJobSynced(db, { jobId, crmDealId, updatedAt }) {
  db.prepare(
    `UPDATE crm_sync_jobs
     SET status = 'synced', crm_deal_id = ?, synced_at = ?, updated_at = ?,
         last_error = NULL, next_retry_at = NULL
     WHERE job_id = ?`
  ).run(crmDealId, updatedAt, updatedAt, jobId);
}

export function scheduleJobRetry(db, { jobId, attemptCount, nextRetryAt, lastError, updatedAt }) {
  db.prepare(
    `UPDATE crm_sync_jobs
     SET status = 'failed', attempt_count = ?, next_retry_at = ?,
         last_error = ?, updated_at = ?
     WHERE job_id = ?`
  ).run(attemptCount, nextRetryAt, lastError, updatedAt, jobId);
}

export function markJobFailed(db, { jobId, attemptCount, lastError, updatedAt }) {
  db.prepare(
    `UPDATE crm_sync_jobs
     SET status = 'failed', attempt_count = ?, next_retry_at = NULL,
         last_error = ?, updated_at = ?
     WHERE job_id = ?`
  ).run(attemptCount, lastError, updatedAt, jobId);
}

export function listDashboardRows(db) {
  return db
    .prepare(
      `SELECT
         r.request_id,
         r.employee_id,
         r.start_date,
         r.end_date,
         r.status AS request_status,
         COALESCE(j.status, 'not_enqueued') AS crm_sync_status,
         j.crm_deal_id,
         j.last_error,
         j.attempt_count,
         j.next_retry_at,
         j.synced_at
       FROM time_off_requests r
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id
       WHERE r.status = 'approved'
       ORDER BY r.approved_at ASC`
    )
    .all();
}

export function listApprovedWithoutCrmJob(db) {
  return db
    .prepare(
      `SELECT r.request_id
       FROM time_off_requests r
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id
       WHERE r.status = 'approved' AND j.job_id IS NULL`
    )
    .all();
}

export function listAllTimeOffRequests(db) {
  return db
    .prepare(
      `SELECT
         r.request_id,
         r.employee_id,
         r.start_date,
         r.end_date,
         r.reason,
         r.status AS request_status,
         r.approved_at,
         r.approved_by,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.department,
         e.email AS employee_email,
         COALESCE(j.status, CASE WHEN r.status = 'approved' THEN 'not_enqueued' ELSE NULL END) AS crm_sync_status,
         j.crm_deal_id,
         j.last_error,
         j.attempt_count,
         j.next_retry_at,
         j.synced_at
       FROM time_off_requests r
       LEFT JOIN employees e ON e.employee_id = r.employee_id
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id
       ORDER BY
         CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
         r.approved_at DESC,
         r.request_id DESC`
    )
    .all();
}

export function listEmployees(db) {
  return db
    .prepare(
      `SELECT employee_id, first_name, last_name, email, department, job_title
       FROM employees
       ORDER BY last_name, first_name`
    )
    .all();
}

export function getTimeOffSummary(db) {
  return db
    .prepare(
      `SELECT
         SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN j.status = 'synced' THEN 1 ELSE 0 END) AS synced_count,
         SUM(CASE WHEN j.status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS crm_pending_count,
         SUM(CASE WHEN j.status = 'failed' AND j.next_retry_at IS NULL THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN j.status = 'failed' AND j.next_retry_at IS NOT NULL THEN 1 ELSE 0 END) AS retrying_count
       FROM time_off_requests r
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id`
    )
    .get();
}
