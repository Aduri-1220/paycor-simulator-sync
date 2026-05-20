import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function envString(key, defaultValue) {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : defaultValue;
}

function envInt(key, defaultValue) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${key}: ${raw}`);
  }
  return parsed;
}

function envBool(key, defaultValue) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  return ['true', '1', 'yes'].includes(raw.toLowerCase());
}

export const config = {
  sourcePath: path.resolve(rootDir, envString('SOURCE_PATH', './data/employees.json')),
  sourceFormat: envString('SOURCE_FORMAT', 'auto'),
  dbPath: path.resolve(rootDir, envString('DB_PATH', './data/payroll.db')),
  syncIntervalMinutes: envInt('SYNC_INTERVAL_MINUTES', 10),
  maxRetries: envInt('MAX_RETRIES', 3),
  retryBaseMs: envInt('RETRY_BASE_MS', 500),
  skipUnchanged: envBool('SKIP_UNCHANGED', true),
  runOnStart: envBool('RUN_ON_START', true),
  logLevel: envString('LOG_LEVEL', 'info'),
  mappingsPath: path.resolve(rootDir, 'config/mappings.json'),
  documentsDir: path.resolve(rootDir, envString('DOCUMENTS_DIR', './data/documents')),
  templateId: envString('TEMPLATE_ID', 'time-off-approval'),
  templatesRoot: path.resolve(rootDir, 'config/templates'),
  emailProvider: envString('EMAIL_PROVIDER', 'resend'),
  emailApiKey: envString('EMAIL_API_KEY', ''),
  emailFrom: envString('EMAIL_FROM', 'onboarding@resend.dev'),
  emailDryRun: envBool('EMAIL_DRY_RUN', true),
  pdfEngine: envString('PDF_ENGINE', 'playwright'),
};

export function validateConfig() {
  if (config.syncIntervalMinutes < 1) {
    throw new Error('SYNC_INTERVAL_MINUTES must be >= 1');
  }
  if (config.maxRetries < 1) {
    throw new Error('MAX_RETRIES must be >= 1');
  }
  const allowedFormats = ['auto', 'json', 'csv'];
  if (!allowedFormats.includes(config.sourceFormat)) {
    throw new Error(`SOURCE_FORMAT must be one of: ${allowedFormats.join(', ')}`);
  }
  const allowedPdfEngines = ['playwright'];
  if (!allowedPdfEngines.includes(config.pdfEngine)) {
    throw new Error(`PDF_ENGINE must be one of: ${allowedPdfEngines.join(', ')}`);
  }
  const allowedEmailProviders = ['resend', 'sendgrid'];
  if (!allowedEmailProviders.includes(config.emailProvider)) {
    throw new Error(`EMAIL_PROVIDER must be one of: ${allowedEmailProviders.join(', ')}`);
  }
}

export function validateDocumentConfig() {
  validateConfig();
  if (!config.emailDryRun && !config.emailApiKey) {
    throw new Error('EMAIL_API_KEY is required when EMAIL_DRY_RUN=false');
  }
}
