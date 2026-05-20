const EMPLOYMENT_STATUSES = new Set(['active', 'terminated', 'leave']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateEmployee(raw, index) {
  const errors = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: [`Record at index ${index} must be an object`],
    };
  }

  const employeeId = trimString(raw.employee_id);
  if (!employeeId) {
    errors.push('employee_id is required');
  } else if (employeeId.length > 64) {
    errors.push('employee_id must be at most 64 characters');
  }

  const firstName = trimString(raw.first_name);
  if (!firstName) {
    errors.push('first_name is required');
  } else if (firstName.length > 100) {
    errors.push('first_name must be at most 100 characters');
  }

  const lastName = trimString(raw.last_name);
  if (!lastName) {
    errors.push('last_name is required');
  } else if (lastName.length > 100) {
    errors.push('last_name must be at most 100 characters');
  }

  const email = trimString(raw.email);
  if (email && !EMAIL_REGEX.test(email)) {
    errors.push('email must be a valid email address');
  }

  const department = trimString(raw.department);
  if (department && department.length > 100) {
    errors.push('department must be at most 100 characters');
  }

  const jobTitle = trimString(raw.job_title);
  if (jobTitle && jobTitle.length > 100) {
    errors.push('job_title must be at most 100 characters');
  }

  const statusRaw = trimString(raw.employment_status);
  if (!statusRaw) {
    errors.push('employment_status is required');
  } else {
    const normalized = statusRaw.toLowerCase();
    if (!EMPLOYMENT_STATUSES.has(normalized)) {
      errors.push(`employment_status must be one of: ${[...EMPLOYMENT_STATUSES].join(', ')}`);
    }
  }

  const hireDate = trimString(raw.hire_date);
  if (hireDate && !ISO_DATE_REGEX.test(hireDate)) {
    errors.push('hire_date must be YYYY-MM-DD');
  }

  const updatedAt = trimString(raw.updated_at);
  if (updatedAt && Number.isNaN(Date.parse(updatedAt))) {
    errors.push('updated_at must be a valid ISO 8601 datetime');
  }

  const rate = raw.hourly_rate;
  if (rate === undefined || rate === null || rate === '') {
    errors.push('hourly_rate is required');
  } else {
    const num = typeof rate === 'number' ? rate : Number.parseFloat(String(rate));
    if (Number.isNaN(num)) {
      errors.push('hourly_rate must be a number');
    } else if (num < 0 || num > 9999.99) {
      errors.push('hourly_rate must be between 0 and 9999.99');
    } else if (!hasAtMostTwoDecimals(num)) {
      errors.push('hourly_rate must have at most 2 decimal places');
    }
  }

  return { valid: errors.length === 0, errors, employeeId: employeeId || null };
}

function trimString(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function hasAtMostTwoDecimals(num) {
  const str = String(num);
  const dot = str.indexOf('.');
  if (dot === -1) return true;
  return str.length - dot - 1 <= 2;
}

export function detectDuplicates(employees) {
  const seen = new Set();
  const duplicates = new Set();
  for (const emp of employees) {
    const id = trimString(emp?.employee_id);
    if (!id) continue;
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }
  return duplicates;
}
