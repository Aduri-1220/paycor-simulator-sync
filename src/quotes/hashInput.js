import crypto from 'crypto';

export function hashQuoteInput({ customer_name, deal_notes }) {
  const payload = JSON.stringify({
    customer_name: String(customer_name ?? '').trim(),
    deal_notes: String(deal_notes ?? '').trim(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
