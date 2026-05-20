import { describe, expect, it } from 'vitest';
import { hashContent, hashFile } from '../../src/documents/hashContent.js';

describe('hashContent', () => {
  it('returns stable sha256 for same payload', () => {
    const a = hashContent({ request_id: 'PTO-1', start_date: '2026-06-10' });
    const b = hashContent({ start_date: '2026-06-10', request_id: 'PTO-1' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes file bytes', () => {
    const hash = hashFile(Buffer.from('pdf-bytes'));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
