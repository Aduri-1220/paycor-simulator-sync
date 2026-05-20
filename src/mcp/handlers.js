import { buildDealPayload } from '../crm/buildDealPayload.js';
import { formatDashboardLabel } from '../crm/dashboard.js';
import {
  getCrmSyncJob,
  getRequestWithEmployee,
  insertCrmSyncJob,
} from '../crm/queries.js';
import { loadCatalog } from '../quotes/catalog.js';
import { mapQuoteDetail } from '../quotes/mapQuote.js';
import { getQuoteDetail } from '../quotes/queries.js';

function mapRequestRow(row, hubspotPortalId) {
  const crmSyncStatus = row.crm_sync_status ?? null;
  const crmSyncLabel =
    row.request_status === 'approved' && crmSyncStatus
      ? formatDashboardLabel({
          crm_sync_status: crmSyncStatus,
          next_retry_at: row.next_retry_at,
        })
      : null;

  let hubspotDealUrl = null;
  if (row.crm_deal_id && hubspotPortalId && /^\d+$/.test(String(row.crm_deal_id))) {
    hubspotDealUrl = `https://app.hubspot.com/contacts/${hubspotPortalId}/deal/${row.crm_deal_id}`;
  }

  return {
    requestId: row.request_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? row.employee_id,
    department: row.department,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    requestStatus: row.request_status,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    crmSyncStatus,
    crmSyncLabel,
    crmDealId: row.crm_deal_id ?? null,
    hubspotDealUrl,
    lastError: row.last_error ?? null,
    attemptCount: row.attempt_count ?? null,
    nextRetryAt: row.next_retry_at ?? null,
    syncedAt: row.synced_at ?? null,
  };
}

function getRequestRow(db, requestId) {
  return db
    .prepare(
      `SELECT
         r.request_id,
         r.employee_id,
         r.start_date,
         r.end_date,
         r.reason,
         r.status AS request_status,
         r.approved_at,
         r.approved_by,
         e.first_name || ' ' || e.last_name AS employee_name,
         e.department,
         COALESCE(j.status, CASE WHEN r.status = 'approved' THEN 'not_enqueued' ELSE NULL END) AS crm_sync_status,
         j.crm_deal_id,
         j.last_error,
         j.attempt_count,
         j.next_retry_at,
         j.synced_at
       FROM time_off_requests r
       LEFT JOIN employees e ON e.employee_id = r.employee_id
       LEFT JOIN crm_sync_jobs j ON j.request_id = r.request_id
       WHERE r.request_id = ?`
    )
    .get(requestId);
}

export function getRequest(db, requestId, { hubspotPortalId = '' } = {}) {
  const row = getRequestRow(db, requestId);
  if (!row) {
    const err = new Error(`Request not found: ${requestId}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return mapRequestRow(
    {
      ...row,
      request_status: row.request_status,
    },
    hubspotPortalId
  );
}

export function getQuoteDraft(db, quoteId) {
  const detail = getQuoteDetail(db, quoteId);
  if (!detail) {
    const err = new Error(`Quote not found: ${quoteId}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return mapQuoteDetail(detail);
}

export function searchPriceCatalog(db, query, catalogPath) {
  const catalog = loadCatalog(db, catalogPath);
  const normalized = String(query ?? '').trim().toLowerCase();
  if (!normalized) {
    const err = new Error('query is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const products = catalog.products.filter((product) => {
    if (product.active === false) return false;
    const haystack = [product.sku, product.name, product.description ?? '']
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });

  return {
    query,
    matchCount: products.length,
    policy: catalog.policy,
    products: products.map((product) => ({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      unit: product.unit,
      listPrice: product.list_price,
      cost: product.cost,
      active: product.active !== false,
    })),
  };
}

export function createCrmSyncJob(db, requestId) {
  const record = getRequestWithEmployee(db, requestId);
  if (!record) {
    const err = new Error(`Request not found: ${requestId}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (record.status !== 'approved') {
    const err = new Error(
      `Request ${requestId} is ${record.status}; CRM jobs can only be created for approved requests`
    );
    err.code = 'NOT_APPROVED';
    throw err;
  }

  const existing = getCrmSyncJob(db, requestId);
  if (existing) {
    return {
      requestId,
      created: false,
      jobId: existing.job_id,
      status: existing.status,
      message: 'CRM sync job already exists for this request',
    };
  }

  const now = new Date().toISOString();
  const payload = buildDealPayload(record);
  const inserted = insertCrmSyncJob(db, {
    requestId,
    payload,
    createdAt: now,
  });

  if (inserted === 0) {
    const job = getCrmSyncJob(db, requestId);
    return {
      requestId,
      created: false,
      jobId: job?.job_id ?? null,
      status: job?.status ?? 'unknown',
      message: 'CRM sync job already exists for this request',
    };
  }

  const job = getCrmSyncJob(db, requestId);
  return {
    requestId,
    created: true,
    jobId: job.job_id,
    status: job.status,
    message: 'CRM sync job enqueued; run the CRM worker to push the deal',
  };
}

export function createPortalHandlers({ db, config }) {
  return {
    getRequest: (requestId) =>
      getRequest(db, requestId, { hubspotPortalId: config.crmHubspotPortalId }),
    getQuoteDraft: (quoteId) => getQuoteDraft(db, quoteId),
    searchPriceCatalog: (query) => searchPriceCatalog(db, query, config.quoteCatalogPath),
    createCrmSyncJob: (requestId) => createCrmSyncJob(db, requestId),
  };
}
