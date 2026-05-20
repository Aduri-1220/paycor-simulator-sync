import { logger } from '../utils/logger.js';

const SEED_REQUESTS = [
  {
    request_id: 'PTO-1001',
    employee_id: 'E1001',
    start_date: '2026-06-10',
    end_date: '2026-06-12',
    reason: 'Family event',
    status: 'approved',
    approved_at: '2026-05-19T14:00:00Z',
    approved_by: 'manager@example.com',
    recipient_email: null,
  },
  {
    request_id: 'PTO-1002',
    employee_id: 'E1002',
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    reason: 'Vacation',
    status: 'approved',
    approved_at: '2026-05-19T15:30:00Z',
    approved_by: 'manager@example.com',
    recipient_email: 'sam.rivera@example.com',
  },
];

export function seedApprovedTimeOff(db) {
  const stmt = db.prepare(
    `INSERT INTO time_off_requests (
       request_id, employee_id, start_date, end_date, reason,
       status, approved_at, approved_by, recipient_email
     ) VALUES (
       @request_id, @employee_id, @start_date, @end_date, @reason,
       @status, @approved_at, @approved_by, @recipient_email
     )
     ON CONFLICT(request_id) DO UPDATE SET
       status = excluded.status,
       approved_at = excluded.approved_at,
       approved_by = excluded.approved_by,
       recipient_email = excluded.recipient_email`
  );

  let inserted = 0;
  for (const row of SEED_REQUESTS) {
    stmt.run(row);
    inserted += 1;
  }

  logger.info('seeded approved time off requests', { count: inserted });
  return { count: inserted };
}
