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
  crmMode: envString('CRM_MODE', 'mock'),
  crmBaseUrl: envString('CRM_BASE_URL', ''),
  crmApiKey: envString('CRM_API_KEY', ''),
  crmMaxJobRetries: envInt('CRM_MAX_JOB_RETRIES', 5),
  crmHubspotPipeline: envString('CRM_HUBSPOT_PIPELINE', ''),
  crmHubspotDealStage: envString('CRM_HUBSPOT_DEALSTAGE', ''),
  crmHubspotPortalId: envString('CRM_HUBSPOT_PORTAL_ID', ''),
  uiPort: envInt('UI_PORT', 3001),
  quoteCatalogPath: path.resolve(rootDir, envString('QUOTE_CATALOG_PATH', './config/catalog.json')),
  quotePromptPath: path.resolve(
    rootDir,
    envString('QUOTE_PROMPT_PATH', './config/prompts/quote-draft-v1.json')
  ),
  quoteAiMode: envString('QUOTE_AI_MODE', 'mock'),
  quoteAiModel: envString('QUOTE_AI_MODEL', 'gpt-4o-mini'),
  quotePromptVersion: envString('QUOTE_PROMPT_VERSION', 'quote-draft-v1'),
  openAiApiKey: envString('OPENAI_API_KEY', ''),
  mcpApiKey: envString('MCP_API_KEY', ''),
  mcpRequireAuth: envBool('MCP_REQUIRE_AUTH', false),
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

export function validateCrmConfig() {
  validateConfig();
  const allowedCrmModes = ['mock', 'http', 'hubspot'];
  if (!allowedCrmModes.includes(config.crmMode)) {
    throw new Error(`CRM_MODE must be one of: ${allowedCrmModes.join(', ')}`);
  }
  if (config.crmMode === 'http' && !config.crmBaseUrl) {
    throw new Error('CRM_BASE_URL is required when CRM_MODE=http');
  }
  if ((config.crmMode === 'hubspot' || isHubSpotHttpMode()) && !config.crmApiKey) {
    throw new Error('CRM_API_KEY is required when CRM_MODE=hubspot');
  }
  if (config.crmMaxJobRetries < 1) {
    throw new Error('CRM_MAX_JOB_RETRIES must be >= 1');
  }
}

function isHubSpotHttpMode() {
  return config.crmMode === 'http' && /hubapi\.com|hubspot\.com/i.test(config.crmBaseUrl);
}

export function validateQuoteConfig() {
  validateConfig();
  const allowedAiModes = ['mock', 'openai'];
  if (!allowedAiModes.includes(config.quoteAiMode)) {
    throw new Error(`QUOTE_AI_MODE must be one of: ${allowedAiModes.join(', ')}`);
  }
  if (config.quoteAiMode === 'openai' && !config.openAiApiKey) {
    throw new Error('OPENAI_API_KEY is required when QUOTE_AI_MODE=openai');
  }
}

export function validateMcpConfig() {
  validateConfig();
  if (config.mcpRequireAuth && !config.mcpApiKey) {
    throw new Error('MCP_API_KEY is required when MCP_REQUIRE_AUTH=true');
  }
}
