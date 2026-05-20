export function listApprovedRequests(db) {
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
         COALESCE(r.recipient_email, e.email) AS recipient_email,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.department
       FROM time_off_requests r
       LEFT JOIN employees e ON e.employee_id = r.employee_id
       WHERE r.status = 'approved'
       ORDER BY r.approved_at ASC`
    )
    .all();
}

export function findExistingDocument(db, requestId, templateId, templateVersion, contentHash) {
  return db
    .prepare(
      `SELECT document_id, file_path, sha256
       FROM documents
       WHERE request_id = ? AND template_id = ? AND template_version = ? AND content_hash = ?`
    )
    .get(requestId, templateId, templateVersion, contentHash);
}

export function findDeliveredEmail(db, documentId) {
  return db
    .prepare(
      `SELECT id FROM email_deliveries
       WHERE document_id = ? AND status = 'delivered'
       LIMIT 1`
    )
    .get(documentId);
}

export function insertDocument(db, row) {
  const result = db
    .prepare(
      `INSERT INTO documents (
         request_id, run_id, template_id, template_version,
         file_path, sha256, byte_size, content_hash, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.requestId,
      row.runId,
      row.templateId,
      row.templateVersion,
      row.filePath,
      row.sha256,
      row.byteSize,
      row.contentHash,
      row.createdAt
    );
  return Number(result.lastInsertRowid);
}

export function insertEmailDelivery(db, row) {
  db.prepare(
    `INSERT INTO email_deliveries (
       document_id, to_email, status, provider, provider_message_id, error_message, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.documentId,
    row.toEmail,
    row.status,
    row.provider,
    row.providerMessageId ?? null,
    row.errorMessage ?? null,
    row.createdAt
  );
}
