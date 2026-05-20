export function parseDraftResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Response must be a JSON object' };
  }

  const customerName = trimString(raw.customer_name);
  if (!customerName) {
    return { ok: false, error: 'customer_name is required' };
  }

  if (!Array.isArray(raw.line_items) || raw.line_items.length === 0) {
    return { ok: false, error: 'line_items must be a non-empty array' };
  }

  const lineItems = [];
  for (let i = 0; i < raw.line_items.length; i++) {
    const line = raw.line_items[i];
    if (!line || typeof line !== 'object' || Array.isArray(line)) {
      return { ok: false, error: `line_items[${i}] must be an object` };
    }
    const sku = trimString(line.sku);
    if (!sku) {
      return { ok: false, error: `line_items[${i}].sku is required` };
    }
    const quantity = parsePositiveNumber(line.quantity, `line_items[${i}].quantity`);
    if (quantity === null) {
      return { ok: false, error: `line_items[${i}].quantity must be a positive number` };
    }
    const listPrice = parseNonNegativeNumber(line.list_price, `line_items[${i}].list_price`);
    if (listPrice === null) {
      return { ok: false, error: `line_items[${i}].list_price must be a non-negative number` };
    }
    const discountPct = parseDiscount(line.discount_pct);
    if (discountPct === null) {
      return { ok: false, error: `line_items[${i}].discount_pct must be between 0 and 100` };
    }

    lineItems.push({
      sku,
      description: trimString(line.description) || sku,
      quantity,
      unit: trimString(line.unit) || 'each',
      list_price: listPrice,
      discount_pct: discountPct,
    });
  }

  return {
    ok: true,
    draft: {
      customer_name: customerName,
      line_items: lineItems,
      assumptions: normalizeStringArray(raw.assumptions),
      risks: normalizeStringArray(raw.risks),
    },
  };
}

export function computeLineTotal(listPrice, quantity, discountPct) {
  const subtotal = listPrice * quantity;
  return Math.round(subtotal * (1 - discountPct / 100) * 100) / 100;
}

export function computeSellUnitPrice(listPrice, discountPct) {
  return Math.round(listPrice * (1 - discountPct / 100) * 100) / 100;
}

function trimString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function parsePositiveNumber(value) {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isNaN(num) || num <= 0) return null;
  return num;
}

function parseNonNegativeNumber(value) {
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function parseDiscount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (Number.isNaN(num) || num < 0 || num > 100) return null;
  return Math.round(num * 100) / 100;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((s) => trimString(s)).filter(Boolean);
}
