# Paycor Simulator Sync

Sync employee data from **System A** (CSV/JSON file) to **System B** (SQLite payroll tables) on a schedule. Built to mirror TAP-style Paycor integrations: field mapping, idempotent upserts, retry, and audit logging.

## Quick start

```bash
npm install
npm run sync        # single sync run
npm start           # scheduler (every N minutes)
npm test            # run tests
```

Copy `.env.example` to `.env` to customize paths and interval.

## Architecture

```
employees.json  →  Worker  →  payroll.db
                    │
                    ├── validate + map fields
                    ├── upsert (idempotent)
                    ├── retry transient DB errors
                    └── audit (sync_runs, sync_errors)
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SOURCE_PATH` | `./data/employees.json` | System A file path |
| `SOURCE_FORMAT` | `auto` | `json`, `csv`, or `auto` |
| `DB_PATH` | `./data/payroll.db` | SQLite database path |
| `SYNC_INTERVAL_MINUTES` | `10` | Scheduler interval |
| `SKIP_UNCHANGED` | `true` | Skip upsert when `updated_at` ≤ stored |
| `MAX_RETRIES` | `3` | DB retry attempts |
| `RUN_ON_START` | `true` | Run immediately when scheduler starts |

## Source format (JSON)

```json
{
  "employees": [
    {
      "employee_id": "E1001",
      "first_name": "Jordan",
      "last_name": "Lee",
      "email": "jordan@example.com",
      "department": "Kitchen",
      "job_title": "Line Cook",
      "hourly_rate": 18.5,
      "employment_status": "active",
      "hire_date": "2024-03-15",
      "updated_at": "2026-05-18T10:00:00Z"
    }
  ]
}
```

CSV is also supported when `SOURCE_FORMAT=csv` or the file has a `.csv` extension.

## Target tables

- `employees` — identity, department, status
- `compensation` — hourly rate
- `sync_runs` — one row per sync execution
- `sync_errors` — row-level and file-level errors

## Idempotency

Upserts use `employee_id` as the primary key. Re-running with unchanged data skips rows when `SKIP_UNCHANGED=true` (compares `updated_at`).

## Error handling

| Level | Behavior |
|-------|----------|
| File missing / invalid JSON | Entire run fails (`status=failed`) |
| Invalid employee row | Logged to `sync_errors`, batch continues (`status=partial`) |
| Transient SQLite busy/locked | Retried with exponential backoff |

## Manual verification

```bash
npm run sync
sqlite3 data/payroll.db "SELECT employee_id, first_name, employment_status FROM employees;"
sqlite3 data/payroll.db "SELECT * FROM sync_runs ORDER BY run_id DESC LIMIT 1;"
```

## Interview line

> I built a two-system sync with retry and idempotent upserts—similar to TAP's Paycor integrations. A scheduled worker reads employee records, maps fields through a config layer, upserts into SQLite payroll tables, and writes an audit trail for every run and row-level failure.
