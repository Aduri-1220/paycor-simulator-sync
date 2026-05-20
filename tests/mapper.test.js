import { describe, expect, it } from 'vitest';
import { compareSourceUpdatedAt, mapEmployee, normalizeUtcIso } from '../src/sync/mapper.js';

const mappings = {
  fields: [
    { source: 'employee_id', target: 'employees.employee_id', transform: 'trim' },
    { source: 'first_name', target: 'employees.first_name', transform: 'trim' },
    { source: 'last_name', target: 'employees.last_name', transform: 'trim' },
    { source: 'email', target: 'employees.email', transform: 'trim_nullable' },
    { source: 'department', target: 'employees.department', transform: 'trim_nullable' },
    { source: 'job_title', target: 'employees.job_title', transform: 'trim_nullable' },
    { source: 'employment_status', target: 'employees.employment_status', transform: 'lowercase_enum' },
    { source: 'hire_date', target: 'employees.hire_date', transform: 'iso_date_nullable' },
    { source: 'updated_at', target: 'employees.source_updated_at', transform: 'iso_datetime' },
    { source: 'hourly_rate', target: 'compensation.hourly_rate', transform: 'decimal_2' },
    { source: 'hire_date', target: 'compensation.effective_date', transform: 'iso_date_nullable' },
  ],
};

describe('mapEmployee', () => {
  it('maps source fields to employee and compensation tables', () => {
    const raw = {
      employee_id: 'E1001',
      first_name: 'Jordan',
      last_name: 'Lee',
      email: 'jordan@example.com',
      department: 'Kitchen',
      job_title: 'Line Cook',
      hourly_rate: 18.5,
      employment_status: 'ACTIVE',
      hire_date: '2024-03-15',
      updated_at: '2026-05-18T10:00:00Z',
    };

    const { employee, compensation } = mapEmployee(raw, mappings, {
      runStartedAt: '2026-05-20T12:00:00.000Z',
    });

    expect(employee.employee_id).toBe('E1001');
    expect(employee.employment_status).toBe('active');
    expect(employee.source_updated_at).toBe('2026-05-18T10:00:00.000Z');
    expect(compensation.hourly_rate).toBe(18.5);
    expect(compensation.effective_date).toBe('2024-03-15');
    expect(employee.synced_at).toBeDefined();
  });

  it('defaults updated_at to runStartedAt when missing', () => {
    const raw = {
      employee_id: 'E1002',
      first_name: 'Sam',
      last_name: 'Rivera',
      hourly_rate: 12,
      employment_status: 'active',
    };

    const { employee } = mapEmployee(raw, mappings, {
      runStartedAt: '2026-05-20T12:00:00.000Z',
    });

    expect(employee.source_updated_at).toBe('2026-05-20T12:00:00.000Z');
  });
});

describe('compareSourceUpdatedAt', () => {
  it('returns true when stored is newer or equal', () => {
    expect(
      compareSourceUpdatedAt('2026-05-18T10:00:00.000Z', '2026-05-18T10:00:00Z')
    ).toBe(true);
    expect(
      compareSourceUpdatedAt('2026-05-19T10:00:00.000Z', '2026-05-18T10:00:00Z')
    ).toBe(true);
  });

  it('returns false when incoming is newer', () => {
    expect(
      compareSourceUpdatedAt('2026-05-17T10:00:00.000Z', '2026-05-18T10:00:00Z')
    ).toBe(false);
  });
});

describe('normalizeUtcIso', () => {
  it('normalizes datetimes to UTC ISO', () => {
    expect(normalizeUtcIso('2026-05-18T10:00:00Z')).toBe('2026-05-18T10:00:00.000Z');
  });
});
