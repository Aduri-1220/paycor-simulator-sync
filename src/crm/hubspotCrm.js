const HUBSPOT_API = 'https://api.hubapi.com';

export class HubSpotCrmClient {
  constructor({ apiKey, pipeline, dealStage }) {
    if (!apiKey) {
      throw new Error('CRM_API_KEY is required when CRM_MODE=hubspot');
    }
    this.apiKey = apiKey;
    this.pipeline = pipeline || null;
    this.dealStage = dealStage || null;
    this.stagePromise = null;
  }

  async request(method, path, body) {
    let response;
    try {
      response = await fetch(`${HUBSPOT_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const error = new Error(err.message);
      error.code = 'CRM_NETWORK_ERROR';
      throw error;
    }

    const text = await response.text();
    if (!response.ok) {
      const err = new Error(`HubSpot ${method} ${path} failed (${response.status}): ${text}`);
      err.status = response.status;
      err.code = response.status >= 500 || response.status === 429 ? 'CRM_TRANSIENT_ERROR' : 'CRM_CLIENT_ERROR';
      throw err;
    }

    return text ? JSON.parse(text) : {};
  }

  async resolvePipelineStage() {
    if (this.pipeline && this.dealStage) {
      return { pipeline: this.pipeline, dealStage: this.dealStage };
    }

    if (!this.stagePromise) {
      this.stagePromise = this.fetchDefaultPipelineStage();
    }
    return this.stagePromise;
  }

  async fetchDefaultPipelineStage() {
    const data = await this.request('GET', '/crm/v3/pipelines/deals');
    const pipeline = data.results?.[0];
    if (!pipeline) {
      throw new Error('No HubSpot deal pipeline found on account');
    }
    const stage = pipeline.stages?.[0];
    if (!stage) {
      throw new Error(`HubSpot pipeline ${pipeline.id} has no stages`);
    }
    return { pipeline: pipeline.id, dealStage: stage.id };
  }

  toDealName(requestId, payload) {
    return `[${requestId}] ${payload.dealName}`;
  }

  toProperties(requestId, payload) {
    return {
      dealname: this.toDealName(requestId, payload),
      description: [
        `Request: ${requestId}`,
        `Employee: ${payload.employeeName} (${payload.employeeId})`,
        `Dates: ${payload.startDate} – ${payload.endDate}`,
        payload.reason ? `Reason: ${payload.reason}` : null,
        payload.approvedBy ? `Approved by: ${payload.approvedBy}` : null,
        payload.approvedAt ? `Approved at: ${payload.approvedAt}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  async findDealByName(dealname) {
    const data = await this.request('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'dealname',
              operator: 'EQ',
              value: dealname,
            },
          ],
        },
      ],
      properties: ['dealname'],
      limit: 1,
    });

    return data.results?.[0]?.id ?? null;
  }

  async createOrUpdateDeal(requestId, payload, existingDealId) {
    const properties = this.toProperties(requestId, payload);
    let dealId = existingDealId ?? (await this.findDealByName(properties.dealname));

    if (dealId) {
      await this.request('PATCH', `/crm/v3/objects/deals/${dealId}`, { properties });
      return { dealId, action: 'update' };
    }

    const { pipeline, dealStage } = await this.resolvePipelineStage();
    const created = await this.request('POST', '/crm/v3/objects/deals', {
      properties: {
        ...properties,
        pipeline,
        dealstage: dealStage,
      },
    });

    return { dealId: created.id, action: 'create' };
  }
}
