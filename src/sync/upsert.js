const UPSERT_EMPLOYEE = `
INSERT INTO employees (
  employee_id, first_name, last_name, email, department, job_title,
  employment_status, hire_date, source_updated_at, synced_at
) VALUES (
  @employee_id, @first_name, @last_name, @email, @department, @job_title,
  @employment_status, @hire_date, @source_updated_at, @synced_at
)
ON CONFLICT(employee_id) DO UPDATE SET
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  department = excluded.department,
  job_title = excluded.job_title,
  employment_status = excluded.employment_status,
  hire_date = excluded.hire_date,
  source_updated_at = excluded.source_updated_at,
  synced_at = excluded.synced_at
`;

const UPSERT_COMPENSATION = `
INSERT INTO compensation (
  employee_id, hourly_rate, effective_date, synced_at
) VALUES (
  @employee_id, @hourly_rate, @effective_date, @synced_at
)
ON CONFLICT(employee_id) DO UPDATE SET
  hourly_rate = excluded.hourly_rate,
  effective_date = excluded.effective_date,
  synced_at = excluded.synced_at
`;

export function upsertEmployee(db, { employee, compensation }) {
  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT employee_id FROM employees WHERE employee_id = ?')
      .get(employee.employee_id);

    db.prepare(UPSERT_EMPLOYEE).run(employee);
    db.prepare(UPSERT_COMPENSATION).run(compensation);

    return existing ? 'update' : 'insert';
  });

  return tx();
}

export function prepareUpsertStatements(db) {
  return {
    upsertEmployee: db.prepare(UPSERT_EMPLOYEE),
    upsertCompensation: db.prepare(UPSERT_COMPENSATION),
    findExisting: db.prepare('SELECT employee_id FROM employees WHERE employee_id = ?'),
  };
}

export function upsertEmployeeWithStatements(statements, { employee, compensation }) {
  const existing = statements.findExisting.get(employee.employee_id);
  statements.upsertEmployee.run(employee);
  statements.upsertCompensation.run(compensation);
  return existing ? 'update' : 'insert';
}
