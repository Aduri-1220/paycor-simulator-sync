import { loadCatalog } from './catalog.js';
import { generateAiDraft } from './generateDraft.js';
import { hashQuoteInput } from './hashInput.js';
import { parseDraftResponse } from './schema.js';
import { validateQuoteDraft } from './validateDraft.js';
import {
  insertValidationErrors,
  replaceQuoteLines,
} from './queries.js';
import { logger } from '../utils/logger.js';

export async function runAiDraftQuote(db, options) {
  const {
    customer_name,
    deal_notes,
    quote_id: existingQuoteId,
    catalogPath,
    aiMode,
    aiModel,
    promptVersion,
    promptPath,
    openAiApiKey,
  } = options;

  const customerName = String(customer_name ?? '').trim();
  if (!customerName) {
    throw new Error('customer_name is required');
  }

  const catalog = loadCatalog(db, catalogPath);
  const now = new Date().toISOString();
  const quoteId =
    existingQuoteId ?? `Q-${Date.now().toString(36).toUpperCase()}`;
  const inputHash = hashQuoteInput({ customer_name: customerName, deal_notes });

  const startedAt = now;
  const effectiveModel = aiMode === 'openai' ? aiModel : 'mock-quote-v1';

  let aiResult;
  try {
    aiResult = await generateAiDraft({
      mode: aiMode,
      customer_name: customerName,
      deal_notes,
      catalog,
      model: effectiveModel,
      apiKey: openAiApiKey,
      promptPath,
    });
  } catch (err) {
    logger.error('ai quote generation failed', { quote_id: quoteId, msg: err.message });
    throw err;
  }

  const parseResult = parseDraftResponse(aiResult.draft ?? JSON.parse(aiResult.raw));
  const finishedAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO quotes (quote_id, customer_name, deal_notes, status, created_at, updated_at)
       VALUES (@quote_id, @customer_name, @deal_notes, 'draft', @created_at, @updated_at)
       ON CONFLICT(quote_id) DO UPDATE SET
         customer_name = excluded.customer_name,
         deal_notes = excluded.deal_notes,
         updated_at = excluded.updated_at`
    ).run({
      quote_id: quoteId,
      customer_name: customerName,
      deal_notes: deal_notes ?? '',
      created_at: now,
      updated_at: finishedAt,
    });

    if (!parseResult.ok) {
      const run = db
        .prepare(
          `INSERT INTO ai_quote_runs (
             quote_id, started_at, finished_at, status, model, prompt_version,
             input_hash, raw_response, parse_error
           ) VALUES (?, ?, ?, 'parse_failed', ?, ?, ?, ?, ?)`
        )
        .run(
          quoteId,
          startedAt,
          finishedAt,
          aiResult.model,
          promptVersion,
          inputHash,
          aiResult.raw,
          parseResult.error
        );
      const runId = run.lastInsertRowid;
      db.prepare(
        `UPDATE quotes SET status = 'parse_failed', latest_run_id = ?, updated_at = ? WHERE quote_id = ?`
      ).run(runId, finishedAt, quoteId);
      db.prepare('DELETE FROM quote_line_items WHERE quote_id = ?').run(quoteId);
      return {
        quoteId,
        runId,
        status: 'parse_failed',
        parseError: parseResult.error,
        validationErrors: [],
      };
    }

    const validation = validateQuoteDraft(parseResult.draft, catalog);
    const quoteStatus = validation.valid ? 'draft' : 'validation_failed';
    const runStatus = validation.valid ? 'success' : 'validation_failed';

    const run = db
      .prepare(
        `INSERT INTO ai_quote_runs (
           quote_id, started_at, finished_at, status, model, prompt_version,
           input_hash, assumptions_json, risks_json, raw_response
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        quoteId,
        startedAt,
        finishedAt,
        runStatus,
        aiResult.model,
        promptVersion,
        inputHash,
        JSON.stringify(parseResult.draft.assumptions),
        JSON.stringify(parseResult.draft.risks),
        aiResult.raw
      );

    const runId = run.lastInsertRowid;
    insertValidationErrors(db, runId, validation.errors, finishedAt);
    replaceQuoteLines(db, quoteId, validation.enrichedLines);

    db.prepare(
      `UPDATE quotes SET status = ?, latest_run_id = ?, updated_at = ? WHERE quote_id = ?`
    ).run(quoteStatus, runId, finishedAt, quoteId);

    return {
      quoteId,
      runId,
      status: quoteStatus,
      validationErrors: validation.errors,
      warnings: validation.warnings,
      assumptions: parseResult.draft.assumptions,
      risks: parseResult.draft.risks,
      model: aiResult.model,
      promptVersion,
    };
  });

  const result = tx();
  logger.info('ai quote draft completed', {
    quote_id: result.quoteId,
    run_id: result.runId,
    status: result.status,
    model: aiResult.model,
    prompt_version: promptVersion,
    validation_error_count: result.validationErrors?.length ?? 0,
  });
  return result;
}
