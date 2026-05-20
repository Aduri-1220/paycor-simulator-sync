import { approveTimeOffRequest, createPendingTimeOffRequest } from '../crm/approveRequest.js';
import { formatDashboardLabel } from '../crm/dashboard.js';
import {
  getRequestWithEmployee,
  getTimeOffSummary,
  listAllTimeOffRequests,
  listEmployees,
} from '../crm/queries.js';
import { runCrmSync } from '../crm/runCrmSync.js';
import { approveQuote } from '../quotes/approveQuote.js';
import { mapQuoteDetail, mapQuoteListRow } from '../quotes/mapQuote.js';
import { getQuoteDetail, getQuoteSummary, listQuotes } from '../quotes/queries.js';
import { runAiDraftQuote } from '../quotes/runAiDraft.js';

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
    employeeEmail: row.employee_email,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    requestStatus: row.request_status,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    crmSyncStatus,
    crmSyncLabel,
    crmDealId: row.crm_deal_id,
    hubspotDealUrl,
    lastError: row.last_error,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at,
    syncedAt: row.synced_at,
  };
}

export function createApiHandlers({ db, config }) {
  return {
    getSummary() {
      return getTimeOffSummary(db);
    },

    listRequests() {
      return listAllTimeOffRequests(db).map((row) => mapRequestRow(row, config.crmHubspotPortalId));
    },

    listEmployees() {
      return listEmployees(db);
    },

    createRequest(body) {
      const { employee_id, start_date, end_date, reason, recipient_email } = body;
      if (!employee_id || !start_date || !end_date) {
        const err = new Error('employee_id, start_date, and end_date are required');
        err.status = 400;
        throw err;
      }

      const employee = db.prepare('SELECT employee_id FROM employees WHERE employee_id = ?').get(employee_id);
      if (!employee) {
        const err = new Error(`Unknown employee: ${employee_id}`);
        err.status = 400;
        throw err;
      }

      return createPendingTimeOffRequest(db, {
        employee_id,
        start_date,
        end_date,
        reason,
        recipient_email,
      });
    },

    approveRequest(requestId, body) {
      const existing = getRequestWithEmployee(db, requestId);
      if (!existing) {
        const err = new Error(`Request not found: ${requestId}`);
        err.status = 404;
        throw err;
      }
      if (existing.status === 'approved') {
        const err = new Error('Request is already approved');
        err.status = 409;
        throw err;
      }

      return approveTimeOffRequest(db, {
        request_id: requestId,
        employee_id: existing.employee_id,
        start_date: existing.start_date,
        end_date: existing.end_date,
        reason: existing.reason,
        approved_by: body.approved_by ?? 'manager@example.com',
        recipient_email: existing.recipient_email,
      });
    },

    async runCrmSync() {
      return runCrmSync({
        dbPath: config.dbPath,
        crmMode: config.crmMode,
        crmBaseUrl: config.crmBaseUrl,
        crmApiKey: config.crmApiKey,
        hubspotPipeline: config.crmHubspotPipeline || undefined,
        hubspotDealStage: config.crmHubspotDealStage || undefined,
        maxRetries: config.maxRetries,
        retryBaseMs: config.retryBaseMs,
        maxJobRetries: config.crmMaxJobRetries,
      });
    },

    getQuoteSummary() {
      return getQuoteSummary(db);
    },

    listQuotes() {
      return listQuotes(db).map(mapQuoteListRow);
    },

    getQuote(quoteId) {
      const detail = getQuoteDetail(db, quoteId);
      if (!detail) {
        const err = new Error(`Quote not found: ${quoteId}`);
        err.status = 404;
        throw err;
      }
      return mapQuoteDetail(detail);
    },

    async createQuoteDraft(body) {
      const { customer_name, deal_notes, quote_id } = body;
      if (!customer_name) {
        const err = new Error('customer_name is required');
        err.status = 400;
        throw err;
      }

      const result = await runAiDraftQuote(db, {
        customer_name,
        deal_notes,
        quote_id,
        catalogPath: config.quoteCatalogPath,
        aiMode: config.quoteAiMode,
        aiModel: config.quoteAiModel,
        promptVersion: config.quotePromptVersion,
        promptPath: config.quotePromptPath,
        openAiApiKey: config.openAiApiKey,
      });

      return {
        ...result,
        quote: this.getQuote(result.quoteId),
      };
    },

    approveQuote(quoteId, body) {
      return approveQuote(db, quoteId, {
        approved_by: body.approved_by ?? 'manager@example.com',
      });
    },
  };
}
