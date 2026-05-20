export class MockCrmClient {
  constructor() {
    this.deals = new Map();
    this.failures = new Map();
  }

  setFailureForKey(idempotencyKey, { failUntilAttempt = 1, status = 503, message = 'CRM unavailable' } = {}) {
    this.failures.set(idempotencyKey, { failUntilAttempt, status, message, attempts: 0 });
  }

  clearFailures() {
    this.failures.clear();
  }

  getDeal(idempotencyKey) {
    return this.deals.get(idempotencyKey) ?? null;
  }

  async createOrUpdateDeal(idempotencyKey, payload, existingDealId) {
    const failure = this.failures.get(idempotencyKey);
    if (failure) {
      failure.attempts += 1;
      if (failure.attempts <= failure.failUntilAttempt) {
        const err = new Error(failure.message);
        err.status = failure.status;
        err.code =
          failure.status >= 500 || failure.status === 429
            ? 'CRM_TRANSIENT_ERROR'
            : 'CRM_CLIENT_ERROR';
        throw err;
      }
    }

    const existing = this.deals.get(idempotencyKey);
    if (existing) {
      const deal = {
        ...existing,
        payload: { ...payload },
        updatedAt: new Date().toISOString(),
      };
      this.deals.set(idempotencyKey, deal);
      return { dealId: deal.dealId, action: 'update' };
    }

    const dealId = existingDealId ?? `deal-${idempotencyKey}`;
    const deal = {
      dealId,
      idempotencyKey,
      payload: { ...payload },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.deals.set(idempotencyKey, deal);
    return { dealId, action: 'create' };
  }
}
