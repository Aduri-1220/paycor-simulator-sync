import { getQuoteDetail } from './queries.js';
import { logger } from '../utils/logger.js';

export function approveQuote(db, quoteId, { approved_by }) {
  const detail = getQuoteDetail(db, quoteId);
  if (!detail) {
    const err = new Error(`Quote not found: ${quoteId}`);
    err.status = 404;
    throw err;
  }

  const { quote, validationErrors } = detail;

  if (quote.status === 'approved') {
    const err = new Error('Quote is already approved');
    err.status = 409;
    throw err;
  }

  if (quote.status === 'parse_failed') {
    const err = new Error('Cannot approve: AI response failed to parse');
    err.status = 400;
    throw err;
  }

  if (validationErrors.length > 0) {
    const err = new Error('Cannot approve: fix validation errors or regenerate draft');
    err.status = 400;
    throw err;
  }

  if (quote.status !== 'draft') {
    const err = new Error(`Cannot approve quote in status: ${quote.status}`);
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE quotes
     SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ?
     WHERE quote_id = ?`
  ).run(now, approved_by ?? 'manager@example.com', now, quoteId);

  logger.info('quote approved', {
    quote_id: quoteId,
    approved_by: approved_by ?? 'manager@example.com',
  });

  return { quoteId, status: 'approved', approvedAt: now };
}
