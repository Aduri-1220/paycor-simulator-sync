export function mapQuoteListRow(row) {
  let assumptions = [];
  let risks = [];
  try {
    if (row.assumptions_json) assumptions = JSON.parse(row.assumptions_json);
  } catch {
    /* ignore */
  }
  try {
    if (row.risks_json) risks = JSON.parse(row.risks_json);
  } catch {
    /* ignore */
  }

  return {
    quoteId: row.quote_id,
    customerName: row.customer_name,
    dealNotes: row.deal_notes,
    status: row.status,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    latestRunId: row.latest_run_id,
    aiModel: row.ai_model,
    promptVersion: row.prompt_version,
    assumptions,
    risks,
    runStatus: row.run_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapQuoteDetail(detail) {
  const base = mapQuoteListRow({
    ...detail.quote,
    ai_model: detail.quote.ai_model,
    prompt_version: detail.quote.prompt_version,
    assumptions_json: detail.quote.assumptions_json,
    risks_json: detail.quote.risks_json,
    run_status: detail.quote.run_status,
  });

  const lineTotal = detail.lines.reduce((sum, l) => sum + l.line_total, 0);

  return {
    ...base,
    lines: detail.lines.map((l) => ({
      lineIndex: l.line_index,
      sku: l.sku,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      listPrice: l.list_price,
      discountPct: l.discount_pct,
      lineTotal: l.line_total,
    })),
    validationErrors: detail.validationErrors.map((e) => ({
      lineIndex: e.line_index,
      sku: e.sku,
      errorCode: e.error_code,
      errorMessage: e.error_message,
    })),
    quoteTotal: Math.round(lineTotal * 100) / 100,
    runStartedAt: detail.quote.run_started_at,
  };
}
