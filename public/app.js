const statsEl = document.getElementById('stats');
const quoteStatsEl = document.getElementById('quote-stats');
const quotesListEl = document.getElementById('quotes-list');
const quoteDetailEl = document.getElementById('quote-detail');
const quoteForm = document.getElementById('quote-form');
const quotesRefreshBtn = document.getElementById('quotes-refresh-btn');
const quoteAiMetaEl = document.getElementById('quote-ai-meta');
const requestsBody = document.getElementById('requests-body');
const employeeSelect = document.getElementById('employee-select');
const requestForm = document.getElementById('request-form');
const runSyncBtn = document.getElementById('run-sync-btn');
const refreshBtn = document.getElementById('refresh-btn');
const toastEl = document.getElementById('toast');
const crmModeEl = document.getElementById('crm-mode');

let toastTimer;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

function showToast(message, type = '') {
  toastEl.textContent = message;
  toastEl.className = `toast ${type}`.trim();
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 4000);
}

function badgeClass(kind) {
  const map = {
    pending: 'badge-pending',
    approved: 'badge-approved',
    synced: 'badge-synced',
    failed: 'badge-failed',
    processing: 'badge-processing',
    not_enqueued: 'badge-not_enqueued',
    draft: 'badge-draft',
    validation_failed: 'badge-validation_failed',
    parse_failed: 'badge-parse_failed',
  };
  return map[kind] ?? 'badge-muted';
}

let selectedQuoteId = null;

function renderStats(summary) {
  const cards = [
    { label: 'Pending approval', value: summary.pending_count ?? 0 },
    { label: 'CRM synced', value: summary.synced_count ?? 0 },
    { label: 'Awaiting CRM', value: summary.crm_pending_count ?? 0 },
    { label: 'Sync failed', value: summary.failed_count ?? 0 },
  ];
  statsEl.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <div class="value">${c.value}</div>
        <div class="label">${c.label}</div>
      </div>`
    )
    .join('');
}

function renderRequests(requests) {
  if (requests.length === 0) {
    requestsBody.innerHTML = '<tr><td colspan="6" class="empty">No requests yet.</td></tr>';
    return;
  }

  requestsBody.innerHTML = requests
    .map((r) => {
      const statusBadge = `<span class="badge ${badgeClass(r.requestStatus)}">${r.requestStatus}</span>`;
      let crmCell = '<span class="badge badge-muted">—</span>';
      if (r.requestStatus === 'pending') {
        crmCell = '<span class="badge badge-muted">Approve first</span>';
      } else if (r.requestStatus === 'approved') {
        const crmKind = r.crmSyncStatus ?? 'not_enqueued';
        crmCell = `<span class="badge ${badgeClass(crmKind)}">${r.crmSyncLabel ?? crmKind}</span>`;
        if (r.crmDealId) {
          const dealRef = r.hubspotDealUrl
            ? `<a class="deal-link" href="${r.hubspotDealUrl}" target="_blank" rel="noopener">Deal ${r.crmDealId}</a>`
            : `<span class="meta">Deal ${r.crmDealId}</span>`;
          crmCell += `<div class="meta">${dealRef}</div>`;
        }
        if (r.lastError && (crmKind === 'failed' || r.crmSyncLabel?.includes('failed'))) {
          crmCell += `<div class="error-text">${escapeHtml(r.lastError)}</div>`;
        }
      }

      const action =
        r.requestStatus === 'pending'
          ? `<button type="button" class="btn btn-approve btn-sm" data-approve="${escapeAttr(r.requestId)}">Approve</button>`
          : '';

      return `
      <tr>
        <td>
          <strong>${escapeHtml(r.requestId)}</strong>
          ${r.reason ? `<div class="meta">${escapeHtml(r.reason)}</div>` : ''}
        </td>
        <td>
          ${escapeHtml(r.employeeName)}
          <div class="meta">${escapeHtml(r.employeeId)}${r.department ? ` · ${escapeHtml(r.department)}` : ''}</div>
        </td>
        <td>${escapeHtml(r.startDate)} – ${escapeHtml(r.endDate)}</td>
        <td>${statusBadge}</td>
        <td>${crmCell}</td>
        <td>${action}</td>
      </tr>`;
    })
    .join('');

  requestsBody.querySelectorAll('[data-approve]').forEach((btn) => {
    btn.addEventListener('click', () => approveRequest(btn.dataset.approve, btn));
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

async function loadEmployees() {
  const { employees } = await api('/api/employees');
  employeeSelect.innerHTML =
    '<option value="">Select employee…</option>' +
    employees
      .map(
        (e) =>
          `<option value="${escapeAttr(e.employee_id)}">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)} (${escapeHtml(e.employee_id)})</option>`
      )
      .join('');
}

function renderQuoteStats(summary) {
  const cards = [
    { label: 'Quote drafts (ready)', value: summary.draft_count ?? 0 },
    { label: 'Validation failed', value: summary.validation_failed_count ?? 0 },
    { label: 'Quotes approved', value: summary.approved_count ?? 0 },
    { label: 'Total quotes', value: summary.total_count ?? 0 },
  ];
  quoteStatsEl.innerHTML = cards
    .map(
      (c) => `
      <div class="stat-card">
        <div class="value">${c.value}</div>
        <div class="label">${c.label}</div>
      </div>`
    )
    .join('');
}

function renderQuotesList(quotes) {
  if (quotes.length === 0) {
    quotesListEl.innerHTML = '<p class="empty">No quotes yet — generate a draft above.</p>';
    quoteDetailEl.hidden = true;
    return;
  }

  quotesListEl.innerHTML = quotes
    .map((q) => {
      const selected = q.quoteId === selectedQuoteId ? ' selected' : '';
      return `
      <article class="quote-card${selected}" data-quote-id="${escapeAttr(q.quoteId)}">
        <h4>${escapeHtml(q.customerName)}</h4>
        <div class="meta">${escapeHtml(q.quoteId)} · <span class="badge ${badgeClass(q.status)}">${escapeHtml(q.status)}</span></div>
        ${q.aiModel ? `<div class="meta">${escapeHtml(q.aiModel)} · ${escapeHtml(q.promptVersion ?? '')}</div>` : ''}
      </article>`;
    })
    .join('');

  quotesListEl.querySelectorAll('.quote-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedQuoteId = card.dataset.quoteId;
      renderQuotesList(quotes);
      loadQuoteDetail(selectedQuoteId).catch((err) => showToast(err.message, 'error'));
    });
  });
}

function renderQuoteDetail(quote) {
  quoteDetailEl.hidden = false;
  const canApprove = quote.status === 'draft' && quote.validationErrors.length === 0;
  const linesHtml =
    quote.lines.length === 0
      ? '<p class="empty">No line items</p>'
      : `<table>
        <thead><tr><th>SKU</th><th>Qty</th><th>List</th><th>Disc%</th><th>Total</th></tr></thead>
        <tbody>
        ${quote.lines
          .map(
            (l) => `<tr>
            <td><strong>${escapeHtml(l.sku)}</strong><div class="meta">${escapeHtml(l.description)}</div></td>
            <td>${l.quantity} ${escapeHtml(l.unit)}</td>
            <td>$${l.listPrice.toFixed(2)}</td>
            <td>${l.discountPct}%</td>
            <td>$${l.lineTotal.toFixed(2)}</td>
          </tr>`
          )
          .join('')}
        </tbody></table>`;

  const validationHtml =
    quote.validationErrors.length > 0
      ? `<ul class="validation-list">${quote.validationErrors
          .map(
            (e) =>
              `<li><strong>${escapeHtml(e.errorCode)}</strong>${e.lineIndex != null ? ` (line ${e.lineIndex})` : ''}: ${escapeHtml(e.errorMessage)}</li>`
          )
          .join('')}</ul>`
      : '';

  const assumptionsHtml =
    quote.assumptions?.length > 0
      ? quote.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')
      : '<li class="meta">None recorded</li>';
  const risksHtml =
    quote.risks?.length > 0
      ? quote.risks.map((r) => `<li>${escapeHtml(r)}</li>`).join('')
      : '<li class="meta">None recorded</li>';

  quoteDetailEl.innerHTML = `
    <h3>${escapeHtml(quote.customerName)}</h3>
    <p class="meta">${escapeHtml(quote.quoteId)} · <span class="badge ${badgeClass(quote.status)}">${escapeHtml(quote.status)}</span>
      · Total $${(quote.quoteTotal ?? 0).toFixed(2)}</p>
    <p class="meta"><strong>Deal notes:</strong> ${escapeHtml(quote.dealNotes || '—')}</p>
    <p class="meta"><strong>AI:</strong> ${escapeHtml(quote.aiModel ?? '—')} · prompt ${escapeHtml(quote.promptVersion ?? '—')}</p>
    ${validationHtml}
    <div class="insight-grid">
      <div class="insight-box">
        <h4>AI assumptions</h4>
        <ul>${assumptionsHtml}</ul>
      </div>
      <div class="insight-box risks">
        <h4>Risks</h4>
        <ul>${risksHtml}</ul>
      </div>
    </div>
    ${linesHtml}
    <div class="quote-actions">
      ${
        canApprove
          ? `<button type="button" class="btn btn-approve btn-sm" data-quote-approve="${escapeAttr(quote.quoteId)}">Approve quote</button>`
          : ''
      }
      ${
        quote.status !== 'approved'
          ? `<button type="button" class="btn btn-secondary btn-sm" data-quote-regen="${escapeAttr(quote.quoteId)}">Regenerate draft</button>`
          : ''
      }
    </div>`;

  const approveBtn = quoteDetailEl.querySelector('[data-quote-approve]');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => approveQuote(quote.quoteId, approveBtn));
  }
  const regenBtn = quoteDetailEl.querySelector('[data-quote-regen]');
  if (regenBtn) {
    regenBtn.addEventListener('click', () => regenerateQuote(quote.quoteId, regenBtn));
  }
}

async function loadQuoteDetail(quoteId) {
  const { quote } = await api(`/api/quotes/${encodeURIComponent(quoteId)}`);
  renderQuoteDetail(quote);
}

async function refreshQuotes() {
  const [summary, { quotes }] = await Promise.all([
    api('/api/quotes/summary'),
    api('/api/quotes'),
  ]);
  renderQuoteStats(summary);
  renderQuotesList(quotes);
  if (selectedQuoteId && quotes.some((q) => q.quoteId === selectedQuoteId)) {
    await loadQuoteDetail(selectedQuoteId);
  } else if (quotes.length > 0 && !selectedQuoteId) {
    selectedQuoteId = quotes[0].quoteId;
    renderQuotesList(quotes);
    await loadQuoteDetail(selectedQuoteId);
  }
}

async function refresh() {
  const [summary, { requests }] = await Promise.all([api('/api/summary'), api('/api/requests')]);
  renderStats(summary);
  renderRequests(requests);
  await refreshQuotes();
}

async function approveRequest(requestId, btn) {
  btn.disabled = true;
  try {
    await api(`/api/requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by: 'manager@example.com' }),
    });
    showToast(`${requestId} approved — CRM job enqueued`, 'success');
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

requestForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(requestForm);
  const payload = Object.fromEntries(fd.entries());
  try {
    const { requestId } = await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    showToast(`Request ${requestId} submitted`, 'success');
    requestForm.reset();
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

runSyncBtn.addEventListener('click', async () => {
  runSyncBtn.disabled = true;
  runSyncBtn.textContent = 'Syncing…';
  try {
    const result = await api('/api/crm/sync', { method: 'POST' });
    let message;
    if (result.recordsRead === 0) {
      message = 'Nothing to sync — click Approve on pending requests first';
    } else {
      message = `CRM sync ${result.status}: ${result.recordsSynced} synced, ${result.recordsFailed} failed`;
    }
    showToast(message, result.recordsFailed > 0 ? 'error' : 'success');
    await refresh();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    runSyncBtn.disabled = false;
    runSyncBtn.textContent = 'Run CRM sync';
  }
});

refreshBtn.addEventListener('click', () => refresh().catch((err) => showToast(err.message, 'error')));
quotesRefreshBtn.addEventListener('click', () => refreshQuotes().catch((err) => showToast(err.message, 'error')));

quoteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(quoteForm);
  const payload = Object.fromEntries(fd.entries());
  const btn = quoteForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const result = await api('/api/quotes/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    selectedQuoteId = result.quoteId;
    showToast(`Draft ${result.quoteId} — ${result.status}`, result.status === 'draft' ? 'success' : 'error');
    quoteForm.reset();
    await refreshQuotes();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

async function approveQuote(quoteId, btn) {
  btn.disabled = true;
  try {
    await api(`/api/quotes/${encodeURIComponent(quoteId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by: 'manager@example.com' }),
    });
    showToast(`${quoteId} approved`, 'success');
    await refreshQuotes();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
  }
}

async function regenerateQuote(quoteId, btn) {
  btn.disabled = true;
  try {
    const { quote } = await api(`/api/quotes/${encodeURIComponent(quoteId)}`);
    await api(`/api/quotes/${encodeURIComponent(quoteId)}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({
        customer_name: quote.customerName,
        deal_notes: quote.dealNotes,
      }),
    });
    showToast(`${quoteId} regenerated`, 'success');
    await refreshQuotes();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

crmModeEl.textContent = 'CRM';

async function loadConfig() {
  try {
    const cfg = await api('/api/config');
    crmModeEl.textContent = cfg.crmMode ?? 'CRM';
    quoteAiMetaEl.textContent = `AI: ${cfg.quoteAiMode ?? 'mock'} · ${cfg.quotePromptVersion ?? ''}`;
  } catch {
    /* ignore */
  }
}

loadConfig();
refresh().catch((err) => {
  requestsBody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(err.message)}</td></tr>`;
});
loadEmployees().catch(() => {});

setInterval(() => {
  refresh().catch(() => {});
}, 15000);
