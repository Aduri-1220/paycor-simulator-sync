import { HubSpotCrmClient } from './hubspotCrm.js';
import { MockCrmClient } from './mockCrm.js';

export function isRetriableCrmError(err) {
  const status = err?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504) {
    return true;
  }
  const code = err?.code;
  return code === 'CRM_TIMEOUT' || code === 'CRM_NETWORK_ERROR' || code === 'CRM_TRANSIENT_ERROR';
}

function isHubSpotConfig(mode, baseUrl) {
  if (mode === 'hubspot') return true;
  if (mode !== 'http' || !baseUrl) return false;
  return /hubapi\.com|hubspot\.com/i.test(baseUrl);
}

export function createCrmClient(options = {}) {
  const mode = options.mode ?? 'mock';

  if (mode === 'mock') {
    return options.mockClient ?? new MockCrmClient();
  }

  if (isHubSpotConfig(mode, options.baseUrl)) {
    return new HubSpotCrmClient({
      apiKey: options.apiKey,
      pipeline: options.hubspotPipeline,
      dealStage: options.hubspotDealStage,
    });
  }

  if (mode === 'http') {
    return new HttpCrmClient({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    });
  }

  throw new Error(`Unknown CRM_MODE: ${mode}. Use mock, hubspot, or http.`);
}

class HttpCrmClient {
  constructor({ baseUrl, apiKey }) {
    if (!baseUrl) {
      throw new Error('CRM_BASE_URL is required when CRM_MODE=http');
    }
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async createOrUpdateDeal(idempotencyKey, payload, existingDealId) {
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const url = existingDealId
      ? `${this.baseUrl}/deals/${encodeURIComponent(existingDealId)}`
      : `${this.baseUrl}/deals`;
    const method = existingDealId ? 'PATCH' : 'POST';

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const error = new Error(err.message);
      error.code = 'CRM_NETWORK_ERROR';
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      const err = new Error(`CRM ${method} failed (${response.status}): ${body}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    return {
      dealId: data.dealId ?? data.id ?? existingDealId,
      action: existingDealId ? 'update' : 'create',
    };
  }
}
