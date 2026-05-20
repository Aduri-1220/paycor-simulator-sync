export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  department TEXT,
  job_title TEXT,
  employment_status TEXT NOT NULL,
  hire_date TEXT,
  source_updated_at TEXT,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compensation (
  employee_id TEXT PRIMARY KEY,
  hourly_rate REAL NOT NULL,
  effective_date TEXT,
  synced_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_upserted INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  employee_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_payload TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES sync_runs(run_id)
);
`;

export function migrate(db) {
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
}
