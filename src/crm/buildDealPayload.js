export function buildDealPayload(record) {
  const employeeName = record.employee_name ?? record.employee_id;
  return {
    dealName: `PTO: ${employeeName} (${record.start_date} – ${record.end_date})`,
    requestId: record.request_id,
    employeeId: record.employee_id,
    employeeName,
    department: record.department ?? null,
    startDate: record.start_date,
    endDate: record.end_date,
    reason: record.reason ?? '',
    approvedAt: record.approved_at,
    approvedBy: record.approved_by,
    stage: 'approved',
  };
}
