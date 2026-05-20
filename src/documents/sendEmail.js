import fs from 'fs';
import { mergeTemplate } from './mapFields.js';
import { logger } from '../utils/logger.js';

function isRetriableStatus(status) {
  return status === 429 || status >= 500;
}

async function sendViaResend({ apiKey, from, to, subject, bodyText, attachmentPath }) {
  const pdf = fs.readFileSync(attachmentPath);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: bodyText,
      attachments: [
        {
          filename: attachmentPath.split('/').pop(),
          content: pdf.toString('base64'),
        },
      ],
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.message ?? `Resend API error (${response.status})`);
    err.status = response.status;
    err.provider = 'resend';
    throw err;
  }

  return { provider: 'resend', messageId: body.id ?? null };
}

async function sendViaSendGrid({ apiKey, from, to, subject, bodyText, attachmentPath }) {
  const pdf = fs.readFileSync(attachmentPath);
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: bodyText }],
      attachments: [
        {
          content: pdf.toString('base64'),
          filename: attachmentPath.split('/').pop(),
          type: 'application/pdf',
          disposition: 'attachment',
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(text || `SendGrid API error (${response.status})`);
    err.status = response.status;
    err.provider = 'sendgrid';
    throw err;
  }

  const messageId = response.headers.get('x-message-id');
  return { provider: 'sendgrid', messageId };
}

export async function sendDocumentEmail({
  provider,
  apiKey,
  from,
  to,
  emailTemplate,
  vars,
  attachmentPath,
  dryRun,
}) {
  const subject = mergeTemplate(emailTemplate.subject, vars);
  const bodyText = mergeTemplate(emailTemplate.bodyText, vars);

  if (dryRun) {
    logger.info('email dry run', { to, subject, attachment: attachmentPath });
    return { provider: 'dry_run', messageId: `dry-run-${Date.now()}`, status: 'delivered' };
  }

  if (!apiKey) {
    throw new Error('EMAIL_API_KEY is required when EMAIL_DRY_RUN=false');
  }

  const sender =
    provider === 'sendgrid'
      ? sendViaSendGrid
      : sendViaResend;

  const result = await sender({ apiKey, from, to, subject, bodyText, attachmentPath });
  return { ...result, status: 'delivered' };
}

export function isRetriableEmailError(err) {
  return isRetriableStatus(err?.status);
}
