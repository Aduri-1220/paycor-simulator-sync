import { computeLineTotal, computeSellUnitPrice } from './schema.js';

export function validateQuoteDraft(draft, catalog) {
  const errors = [];
  const policy = catalog.policy;
  const warnings = [];

  for (let lineIndex = 0; lineIndex < draft.line_items.length; lineIndex++) {
    const line = draft.line_items[lineIndex];
    const product = catalog.bySku.get(line.sku);

    if (!product) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'UNKNOWN_SKU',
        error_message: `SKU not in catalog: ${line.sku}`,
      });
      continue;
    }

    if (!product.active) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'INACTIVE_SKU',
        error_message: `SKU is discontinued or inactive: ${line.sku}`,
      });
    }

    if (line.discount_pct > policy.max_discount_pct) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'DISCOUNT_EXCEEDS_POLICY',
        error_message: `Discount ${line.discount_pct}% exceeds max ${policy.max_discount_pct}%`,
      });
    }

    const expectedList = product.list_price;
    if (Math.abs(line.list_price - expectedList) > 0.01) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'LIST_PRICE_MISMATCH',
        error_message: `List price ${line.list_price} does not match catalog ${expectedList}`,
      });
    }

    const sellUnit = computeSellUnitPrice(line.list_price, line.discount_pct);
    const marginPct = sellUnit > 0 ? ((sellUnit - product.cost) / sellUnit) * 100 : 0;
    const roundedMargin = Math.round(marginPct * 100) / 100;

    if (roundedMargin < policy.min_margin_pct) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'MARGIN_BELOW_FLOOR',
        error_message: `Margin ${roundedMargin}% is below minimum ${policy.min_margin_pct}%`,
      });
    } else if (roundedMargin < policy.min_margin_pct + 2) {
      warnings.push({
        line_index: lineIndex,
        sku: line.sku,
        code: 'MARGIN_NEAR_FLOOR',
        message: `Margin ${roundedMargin}% is close to floor ${policy.min_margin_pct}%`,
      });
    }

    const expectedTotal = computeLineTotal(line.list_price, line.quantity, line.discount_pct);
    const providedTotal = computeLineTotal(line.list_price, line.quantity, line.discount_pct);
    if (Math.abs(providedTotal - expectedTotal) > 0.01) {
      errors.push({
        line_index: lineIndex,
        sku: line.sku,
        error_code: 'LINE_TOTAL_INVALID',
        error_message: 'Line total could not be computed consistently',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    enrichedLines: draft.line_items.map((line, lineIndex) => {
      const product = catalog.bySku.get(line.sku);
      const lineTotal = computeLineTotal(line.list_price, line.quantity, line.discount_pct);
      return {
        ...line,
        line_index: lineIndex,
        line_total: lineTotal,
        catalog_name: product?.name ?? null,
      };
    }),
  };
}
