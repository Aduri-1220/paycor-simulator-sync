import { logger } from '../utils/logger.js';
import { createPendingTimeOffRequest } from '../crm/approveRequest.js';

const PENDING_REQUESTS = [
  {
    request_id: 'PTO-2001',
    employee_id: 'E1001',
    start_date: '2026-08-15',
    end_date: '2026-08-16',
    reason: 'Personal day',
  },
  {
    request_id: 'PTO-2002',
    employee_id: 'E1002',
    start_date: '2026-09-02',
    end_date: '2026-09-06',
    reason: 'Summer break',
  },
];

export function seedPendingTimeOff(db) {
  let created = 0;
  for (const row of PENDING_REQUESTS) {
    const existing = db
      .prepare('SELECT request_id FROM time_off_requests WHERE request_id = ?')
      .get(row.request_id);
    if (existing) continue;
    createPendingTimeOffRequest(db, row);
    created += 1;
  }
  logger.info('seeded pending time off requests', { count: created });
  return { count: created };
}
