const EMPLOYMENT_STATUSES = new Set(['active', 'terminated', 'leave']);

export function normalizeUtcIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function compareSourceUpdatedAt(stored, incoming) {
  const a = normalizeUtcIso(stored);
  const b = normalizeUtcIso(incoming);
  if (!a || !b) return false;
  return new Date(a).getTime() >= new Date(b).getTime();
}

function applyTransform(transform, value, context) {
  switch (transform) {
    case 'trim':
      return value === undefined || value === null ? '' : String(value).trim();
    case 'trim_nullable': {
      if (value === undefined || value === null) return null;
      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    }
    case 'lowercase_enum': {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (!EMPLOYMENT_STATUSES.has(normalized)) {
        throw new Error(`Invalid employment_status: ${value}`);
      }
      return normalized;
    }
    case 'iso_date_nullable': {
      if (value === undefined || value === null || String(value).trim() === '') return null;
      const str = String(value).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        throw new Error(`Invalid hire_date: ${value}`);
      }
      return str;
    }
    case 'iso_datetime': {
      if (value === undefined || value === null || String(value).trim() === '') {
        return context.runStartedAt;
      }
      const iso = normalizeUtcIso(value);
      if (!iso) throw new Error(`Invalid updated_at: ${value}`);
      return iso;
    }
    case 'decimal_2': {
      const num = typeof value === 'number' ? value : Number.parseFloat(String(value));
      if (Number.isNaN(num)) throw new Error(`Invalid hourly_rate: ${value}`);
      return Math.round(num * 100) / 100;
    }
    default:
      throw new Error(`Unknown transform: ${transform}`);
  }
}

export function mapEmployee(raw, mappings, context) {
  const employee = {};
  const compensation = {};

  for (const rule of mappings.fields) {
    const [table, column] = rule.target.split('.');
    const transformed = applyTransform(rule.transform, raw[rule.source], context);

    if (table === 'employees') {
      employee[column] = transformed;
    } else if (table === 'compensation') {
      compensation[column] = transformed;
    } else {
      throw new Error(`Unknown target table: ${table}`);
    }
  }

  const syncedAt = new Date().toISOString();
  employee.synced_at = syncedAt;
  compensation.synced_at = syncedAt;
  compensation.employee_id = employee.employee_id;

  return { employee, compensation };
}
