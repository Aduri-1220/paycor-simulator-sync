import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { loadCatalogFile } from '../../src/quotes/catalog.js';
import { validateQuoteDraft } from '../../src/quotes/validateDraft.js';

const catalogPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/catalog.json'
);

describe('validateQuoteDraft', () => {
  const catalog = loadCatalogFile(catalogPath);

  it('passes valid lines from catalog', () => {
    const result = validateQuoteDraft(
      {
        customer_name: 'Test',
        line_items: [
          {
            sku: 'HOOD-12',
            description: 'Hood',
            quantity: 1,
            unit: 'each',
            list_price: 4800,
            discount_pct: 5,
          },
        ],
        assumptions: [],
        risks: [],
      },
      catalog
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unknown SKU', () => {
    const result = validateQuoteDraft(
      {
        customer_name: 'Test',
        line_items: [
          {
            sku: 'NOPE-99',
            description: 'x',
            quantity: 1,
            unit: 'each',
            list_price: 100,
            discount_pct: 0,
          },
        ],
        assumptions: [],
        risks: [],
      },
      catalog
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0].error_code).toBe('UNKNOWN_SKU');
  });

  it('rejects discount above policy', () => {
    const result = validateQuoteDraft(
      {
        customer_name: 'Test',
        line_items: [
          {
            sku: 'FILTER-SET',
            description: 'Filters',
            quantity: 1,
            unit: 'kit',
            list_price: 450,
            discount_pct: 25,
          },
        ],
        assumptions: [],
        risks: [],
      },
      catalog
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.error_code === 'DISCOUNT_EXCEEDS_POLICY')).toBe(true);
  });

  it('rejects inactive SKU', () => {
    const result = validateQuoteDraft(
      {
        customer_name: 'Test',
        line_items: [
          {
            sku: 'LEGACY-HOOD',
            description: 'Old',
            quantity: 1,
            unit: 'each',
            list_price: 3000,
            discount_pct: 0,
          },
        ],
        assumptions: [],
        risks: [],
      },
      catalog
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.error_code === 'INACTIVE_SKU')).toBe(true);
  });
});
