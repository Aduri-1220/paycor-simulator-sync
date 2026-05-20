import { logger } from '../utils/logger.js';
import { approveTimeOffRequest } from './approveRequest.js';

const SEED_REQUESTS = [
  {
    request_id: 'PTO-1001',
    employee_id: 'E1001',
    start_date: '2026-06-10',
    end_date: '2026-06-12',
    reason: 'Family event',
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
    approved_at: '2026-05-19T15:30:00Z',
    approved_by: 'manager@example.com',
    recipient_email: 'sam.rivera@example.com',
  },
];

export function seedApprovedWithCrmJobs(db) {
  let approved = 0;
  let jobsEnqueued = 0;

  for (const row of SEED_REQUESTS) {
    const result = approveTimeOffRequest(db, row);
    approved += 1;
    if (result.jobEnqueued) jobsEnqueued += 1;
  }

  logger.info('seeded approved requests with crm jobs', { approved, jobs_enqueued: jobsEnqueued });
  return { approved, jobsEnqueued };
}

export { SEED_REQUESTS };
