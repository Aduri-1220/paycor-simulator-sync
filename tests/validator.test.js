import { describe, expect, it } from 'vitest';
import { validateEmployee, detectDuplicates } from '../src/sync/validator.js';

describe('validateEmployee', () => {
  const valid = {
    employee_id: 'E1001',
    first_name: 'Jordan',
    last_name: 'Lee',
    hourly_rate: 18.5,
    employment_status: 'active',
  };

  it('accepts a valid employee', () => {
    const result = validateEmployee(valid, 0);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing employee_id', () => {
    const result = validateEmployee({ ...valid, employee_id: '  ' }, 0);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('employee_id');
  });

  it('rejects invalid employment_status', () => {
    const result = validateEmployee({ ...valid, employment_status: 'fired' }, 0);
    expect(result.valid).toBe(false);
  });

  it('accepts case-insensitive employment_status', () => {
    const result = validateEmployee({ ...valid, employment_status: 'ACTIVE' }, 0);
    expect(result.valid).toBe(true);
  });

  it('rejects negative hourly_rate', () => {
    const result = validateEmployee({ ...valid, hourly_rate: -1 }, 0);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = validateEmployee({ ...valid, email: 'not-an-email' }, 0);
    expect(result.valid).toBe(false);
  });
});

describe('detectDuplicates', () => {
  it('finds duplicate employee_ids', () => {
    const dups = detectDuplicates([
      { employee_id: 'E1' },
      { employee_id: 'E2' },
      { employee_id: 'E1' },
    ]);
    expect(dups.has('E1')).toBe(true);
    expect(dups.has('E2')).toBe(false);
  });
});
