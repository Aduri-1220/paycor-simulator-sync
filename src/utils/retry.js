import { logger } from './logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetriableSqliteError(err) {
  const code = err?.code;
  return code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED';
}

export async function withRetry(fn, { maxRetries, retryBaseMs, context = {} }) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
      if (!isRetriableSqliteError(err) || attempt === maxRetries - 1) {
        throw err;
      }
      const delay = retryBaseMs * 2 ** attempt;
      logger.warn('retrying after transient db error', {
        ...context,
        attempt: attempt + 1,
        delay_ms: delay,
        error_code: err.code,
      });
      await sleep(delay);
    }
  }
  throw lastError;
}
