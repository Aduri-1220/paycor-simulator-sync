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

## Document pipeline (Level 3 — Bendito / TAP)

When a **time off request** is `approved`, the document worker generates a client-facing PDF and sends email (Resend or SendGrid sandbox).

```bash
npm run sync              # load employees (needed for names/emails)
npm run documents:seed    # insert sample approved PTO requests
npm run documents         # HTML → PDF → store path + SHA256 → email
```

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENTS_DIR` | `./data/documents` | PDF output root |
| `TEMPLATE_ID` | `time-off-approval` | Template under `config/templates/` |
| `EMAIL_PROVIDER` | `resend` | `resend` or `sendgrid` |
| `EMAIL_DRY_RUN` | `true` | Log email only; set `false` + API key to send |
| `EMAIL_FROM` | `onboarding@resend.dev` | Verified sandbox sender |

Templates live in `config/templates/<id>/` (`template.html`, `fields.json`, `email.json`).

Audit tables: `document_runs`, `documents` (file path + SHA256), `document_errors`, `email_deliveries`.

Idempotency: same approved payload (`content_hash`) skips PDF regeneration; delivered emails are not resent.

## CRM sync (Level 4 — transactional outbox)

When a time off request is **approved**, the app writes a `crm_sync_job` row in the **same transaction** (transactional outbox). A worker pushes deals to a mock CRM or HubSpot-compatible HTTP API using `request_id` as the idempotency key.

```bash
npm run sync              # employees (for deal payload names)
npm run crm:seed          # approve sample PTO + enqueue CRM jobs
npm run crm               # worker: pending/failed jobs → CRM deal upsert
npm run crm:status        # dashboard: pending / synced / sync failed
npm run crm:backfill      # enqueue jobs for approved requests missing a job
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CRM_MODE` | `mock` | `mock`, `hubspot`, or `http` (generic REST) |
| `CRM_API_KEY` | — | HubSpot private app token when `CRM_MODE=hubspot` |
| `CRM_BASE_URL` | — | Required only for generic `CRM_MODE=http` |
| `CRM_HUBSPOT_PIPELINE` | auto | Optional HubSpot pipeline id |
| `CRM_HUBSPOT_DEALSTAGE` | auto | Optional HubSpot deal stage id |
| `CRM_MAX_JOB_RETRIES` | `5` | Max worker attempts before permanent sync failed |

Outbox tables: `crm_sync_jobs`, `crm_sync_runs`, `crm_sync_errors`.

Idempotency: CRM upsert uses `request_id` as `Idempotency-Key`; re-running the worker does not create duplicate deals.

Failed CRM calls retry with exponential backoff; exhausted retries set job status to `failed` and the dashboard shows **Sync failed**.

## Web UI

Manager dashboard for submitting PTO requests, approving them (outbox write), and running CRM sync.

```bash
npm run sync              # employees for the request form
npm run ui:seed           # sample pending PTO requests
npm run ui                # http://localhost:3001
```

| Variable | Default | Description |
|----------|---------|-------------|
| `UI_PORT` | `3001` | Dashboard server port |
| `CRM_HUBSPOT_PORTAL_ID` | — | Optional — enables HubSpot deal links in the UI |

**UI actions:** submit request → **Approve** (enqueues `crm_sync_job`) → **Run CRM sync** → status badges update (Pending / Synced / Sync failed).

## AI draft quotes (Level 5 — AI-accelerated)

The model proposes structured line items from deal notes; **deterministic validation** enforces catalog SKUs, margin floor, and discount cap. Managers review **assumptions** and **risks** before approve. Every AI run is audited (`model`, `prompt_version`, validation errors).

```bash
npm run quotes:seed          # load catalog + sample draft quote
npm run ui                   # scroll to "AI draft quotes" section
npm run quotes:draft -- "hood install 8 hours labor"   # CLI draft
```

| Variable | Default | Description |
|----------|---------|-------------|
| `QUOTE_AI_MODE` | `mock` | `mock` (keyword draft, no API key) or `openai` |
| `QUOTE_AI_MODEL` | `gpt-4o-mini` | Model when `QUOTE_AI_MODE=openai` |
| `QUOTE_PROMPT_VERSION` | `quote-draft-v1` | Logged on every `ai_quote_runs` row |
| `OPENAI_API_KEY` | — | Required when `QUOTE_AI_MODE=openai` |
| `QUOTE_CATALOG_PATH` | `./config/catalog.json` | SKU list + margin/discount policy |

Catalog: `config/catalog.json`. Prompt: `config/prompts/quote-draft-v1.json`.

Tables: `product_catalog`, `quotes`, `quote_line_items`, `ai_quote_runs`, `ai_quote_validation_errors`.

Quote statuses: `draft` (validation passed), `validation_failed`, `parse_failed`, `approved`.

## Portal MCP server (Level 6 — agent bridge)

Expose read-only and safe portal actions to AI agents via [Model Context Protocol](https://modelcontextprotocol.io/). Tools reuse the same SQLite query layers as the UI — agents cannot approve requests or quotes.

```bash
npm run sync              # employees
npm run ui:seed           # sample PTO requests
npm run quotes:seed       # catalog + sample quote
npm run mcp               # stdio MCP server (for Cursor / Claude Desktop)
```

| Tool | Type | Description |
|------|------|-------------|
| `get_request` | read | Time-off request + CRM sync status |
| `get_quote_draft` | read | AI quote with lines, validation errors, assumptions |
| `search_price_catalog` | read | Search SKUs by name, description, or SKU |
| `create_crm_sync_job` | safe write | Enqueue CRM job for **approved** request only |

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_API_KEY` | — | Optional API key (set with `MCP_REQUIRE_AUTH=true`) |
| `MCP_REQUIRE_AUTH` | `false` | Fail startup if auth required but key missing |

Register in Cursor: copy `config/mcp.example.json` into your MCP settings and set `cwd` to this project path.

Guardrails: `create_crm_sync_job` rejects pending requests, does not call the CRM worker, and is idempotent when a job already exists.

## Interview line

> I built a two-system sync with retry and idempotent upserts—similar to TAP's Paycor integrations. A scheduled worker reads employee records, maps fields through a config layer, upserts into SQLite payroll tables, and writes an audit trail for every run and row-level failure.

> For client-facing document generation, when a record is approved I map fields into HTML, render PDF with Playwright, persist the file path and SHA256, and send the attachment through a sandboxed email provider with full delivery audit.

> For CRM integration I use the transactional outbox pattern: on approve I insert a `crm_sync_job` in the same DB transaction, then a worker upserts the deal with `request_id` as the idempotency key, retries transient failures with backoff, and surfaces sync status on a dashboard.

> For AI-accelerated quoting, the LLM drafts structured line items from deal notes, but validators enforce catalog SKUs, margin floors, and discount caps before a manager approves. We log model and prompt version on every run and surface assumptions and risks in the UI—AI-first for speed, not AI-only for authority.

> For agent access, I exposed the portal through an MCP server with typed tools and optional auth. Agents can read requests and quote drafts, search the price catalog, and safely enqueue CRM sync jobs for already-approved records—they cannot bypass approval workflows.
