export function getQuoteSummary(db) {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM quotes GROUP BY status`
    )
    .all();
  const counts = Object.fromEntries(rows.map((r) => [r.status, r.count]));
  return {
    draft_count: counts.draft ?? 0,
    validation_failed_count: counts.validation_failed ?? 0,
    approved_count: counts.approved ?? 0,
    total_count: rows.reduce((n, r) => n + r.count, 0),
  };
}

export function listQuotes(db) {
  return db
    .prepare(
      `SELECT
         q.quote_id,
         q.customer_name,
         q.deal_notes,
         q.status,
         q.approved_at,
         q.approved_by,
         q.latest_run_id,
         q.created_at,
         q.updated_at,
         r.model AS ai_model,
         r.prompt_version,
         r.assumptions_json,
         r.risks_json,
         r.status AS run_status
       FROM quotes q
       LEFT JOIN ai_quote_runs r ON r.run_id = q.latest_run_id
       ORDER BY q.updated_at DESC`
    )
    .all();
}

export function getQuoteDetail(db, quoteId) {
  const quote = db
    .prepare(
      `SELECT
         q.*,
         r.model AS ai_model,
         r.prompt_version,
         r.assumptions_json,
         r.risks_json,
         r.status AS run_status,
         r.started_at AS run_started_at
       FROM quotes q
       LEFT JOIN ai_quote_runs r ON r.run_id = q.latest_run_id
       WHERE q.quote_id = ?`
    )
    .get(quoteId);
  if (!quote) return null;

  const lines = db
    .prepare(
      `SELECT line_index, sku, description, quantity, unit, list_price, discount_pct, line_total
       FROM quote_line_items
       WHERE quote_id = ?
       ORDER BY line_index`
    )
    .all(quoteId);

  const validationErrors = quote.latest_run_id
    ? db
        .prepare(
          `SELECT line_index, sku, error_code, error_message
           FROM ai_quote_validation_errors
           WHERE run_id = ?
           ORDER BY id`
        )
        .all(quote.latest_run_id)
    : [];

  return { quote, lines, validationErrors };
}

export function insertValidationErrors(db, runId, errors, createdAt) {
  const stmt = db.prepare(
    `INSERT INTO ai_quote_validation_errors (run_id, line_index, sku, error_code, error_message, created_at)
     VALUES (@run_id, @line_index, @sku, @error_code, @error_message, @created_at)`
  );
  for (const err of errors) {
    stmt.run({
      run_id: runId,
      line_index: err.line_index ?? null,
      sku: err.sku ?? null,
      error_code: err.error_code,
      error_message: err.error_message,
      created_at: createdAt,
    });
  }
}

export function replaceQuoteLines(db, quoteId, enrichedLines) {
  db.prepare('DELETE FROM quote_line_items WHERE quote_id = ?').run(quoteId);
  const stmt = db.prepare(
    `INSERT INTO quote_line_items (
       quote_id, line_index, sku, description, quantity, unit, list_price, discount_pct, line_total
     ) VALUES (
       @quote_id, @line_index, @sku, @description, @quantity, @unit, @list_price, @discount_pct, @line_total
     )`
  );
  for (const line of enrichedLines) {
    stmt.run({
      quote_id: quoteId,
      line_index: line.line_index,
      sku: line.sku,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      list_price: line.list_price,
      discount_pct: line.discount_pct,
      line_total: line.line_total,
    });
  }
}
