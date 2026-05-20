import { listDashboardRows } from './queries.js';

const STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Syncing',
  synced: 'Synced',
  failed: 'Sync failed',
  not_enqueued: 'Not enqueued',
};

export function getDashboardRows(db) {
  return listDashboardRows(db).map((row) => ({
    requestId: row.request_id,
    employeeId: row.employee_id,
    startDate: row.start_date,
    endDate: row.end_date,
    requestStatus: row.request_status,
    crmSyncStatus: row.crm_sync_status,
    crmSyncLabel: formatDashboardLabel(row),
    crmDealId: row.crm_deal_id,
    lastError: row.last_error,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at,
    syncedAt: row.synced_at,
  }));
}

export function formatDashboardLabel(row) {
  if (row.crm_sync_status === 'failed' && row.next_retry_at) {
    return 'Sync failed (retrying)';
  }
  return STATUS_LABELS[row.crm_sync_status] ?? row.crm_sync_status;
}

export function printDashboard(rows) {
  if (rows.length === 0) {
    console.log('No approved time off requests.');
    return;
  }

  console.log('\nCRM Sync Dashboard');
  console.log('─'.repeat(90));
  for (const row of rows) {
    const label = row.crmSyncLabel ?? formatDashboardLabel(row);
    console.log(
      `${row.requestId.padEnd(12)} ${row.employeeId.padEnd(8)} ${label.padEnd(22)} ${row.crmDealId ?? '-'}`
    );
    if (label.includes('Sync failed') && row.lastError) {
      console.log(`             └─ ${row.lastError}`);
    }
  }
  console.log('─'.repeat(90));
}
