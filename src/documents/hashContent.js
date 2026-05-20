import crypto from 'crypto';

export function hashContent(payload) {
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export function hashFile(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
