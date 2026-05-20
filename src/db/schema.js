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

CREATE TABLE IF NOT EXISTS time_off_requests (
  request_id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  recipient_email TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS document_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_generated INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  document_id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  run_id INTEGER NOT NULL,
  template_id TEXT NOT NULL,
  template_version TEXT NOT NULL,
  file_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES time_off_requests(request_id),
  FOREIGN KEY (run_id) REFERENCES document_runs(run_id),
  UNIQUE (request_id, template_id, template_version, content_hash)
);

CREATE TABLE IF NOT EXISTS document_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  request_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_context TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES document_runs(run_id)
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  to_email TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(document_id)
);

CREATE TABLE IF NOT EXISTS crm_sync_jobs (
  job_id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  crm_deal_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT,
  FOREIGN KEY (request_id) REFERENCES time_off_requests(request_id)
);

CREATE TABLE IF NOT EXISTS crm_sync_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  records_read INTEGER NOT NULL DEFAULT 0,
  records_synced INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS crm_sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  request_id TEXT,
  job_id INTEGER,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_context TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES crm_sync_runs(run_id),
  FOREIGN KEY (job_id) REFERENCES crm_sync_jobs(job_id)
);

CREATE TABLE IF NOT EXISTS product_catalog (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  list_price REAL NOT NULL,
  cost REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quotes (
  quote_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  deal_notes TEXT,
  status TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  latest_run_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  list_price REAL NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id),
  UNIQUE (quote_id, line_index)
);

CREATE TABLE IF NOT EXISTS ai_quote_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_hash TEXT,
  assumptions_json TEXT,
  risks_json TEXT,
  raw_response TEXT,
  parse_error TEXT,
  FOREIGN KEY (quote_id) REFERENCES quotes(quote_id)
);

CREATE TABLE IF NOT EXISTS ai_quote_validation_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  line_index INTEGER,
  sku TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES ai_quote_runs(run_id)
);
`;

export function migrate(db) {
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
}
