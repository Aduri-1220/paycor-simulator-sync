/**
 * Deterministic "reasoning" stub for local dev without an API key.
 * Parses deal notes keywords and maps to catalog SKUs.
 */
export function generateMockDraft({ customer_name, deal_notes, catalog, model }) {
  const notes = String(deal_notes ?? '').toLowerCase();
  const lines = [];
  const assumptions = [];
  const risks = [];

  function addLine(sku, quantity, discount_pct = 0) {
    const product = catalog.bySku.get(sku);
    if (!product) return;
    lines.push({
      sku,
      description: product.description || product.name,
      quantity,
      unit: product.unit,
      list_price: product.list_price,
      discount_pct,
    });
  }

  if (/hood|exhaust|kitchen/i.test(notes)) {
    const qty = notes.match(/(\d+)\s*(hood|kitchen)/i)?.[1] ?? (notes.includes('3 kitchen') ? 3 : 1);
    addLine('HOOD-12', Number(qty) || 1, notes.includes('10%') ? 10 : 5);
    assumptions.push(`Mapped hood/exhaust language to ${Number(qty) || 1}× HOOD-12`);
  }

  if (/vent|duct/i.test(notes)) {
    addLine('VENT-48', notes.includes('2') ? 2 : 1);
    assumptions.push('Included ventilation duct based on vent/duct keywords');
  }

  if (/filter/i.test(notes)) {
    addLine('FILTER-SET', 1);
  }

  if (/install|labor|hour/i.test(notes)) {
    const hours = Number.parseInt(notes.match(/(\d+)\s*hour/i)?.[1] ?? '8', 10);
    addLine('INSTALL-LABOR', hours);
    assumptions.push(`Estimated ${hours} installation labor hours`);
  }

  if (/inspect|survey|site/i.test(notes)) {
    addLine('INSPECTION', 1);
  }

  if (lines.length === 0) {
    addLine('INSPECTION', 1);
    addLine('HOOD-12', 1, 0);
    assumptions.push('No strong keywords — defaulted to site inspection plus one hood line');
    risks.push('Scope may be incomplete; confirm equipment list with customer');
  }

  if (/june|july|august|september|october|november|december|january|february|march|april|may/i.test(notes)) {
    assumptions.push('Install timing mentioned in notes — schedule not validated');
    risks.push('Install window not confirmed with operations team');
  }

  if (/discount|10%|15%|20%/i.test(notes)) {
    risks.push('Customer asked about discount — verify against policy cap');
  }

  if (/legacy|old\s*hood/i.test(notes)) {
    addLine('LEGACY-HOOD', 1);
    risks.push('Notes reference legacy equipment — validator should flag LEGACY-HOOD');
  }

  const draft = {
    customer_name,
    line_items: lines,
    assumptions,
    risks: risks.length ? risks : ['AI draft requires manager review before sending to customer'],
  };

  return {
    raw: JSON.stringify(draft, null, 2),
    draft,
    model: model ?? 'mock-quote-v1',
  };
}
