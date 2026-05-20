import { config, validateCrmConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { setLogLevel, logger } from '../utils/logger.js';
import { enqueueMissingCrmJobs } from './approveRequest.js';
import { getDashboardRows, printDashboard } from './dashboard.js';
import { runCrmSync } from './runCrmSync.js';
import { seedApprovedWithCrmJobs } from './seed.js';

async function main() {
  const command = process.argv[2] ?? 'once';

  validateCrmConfig();
  setLogLevel(config.logLevel);

  if (command === 'seed') {
    const db = createDb(config.dbPath);
    seedApprovedWithCrmJobs(db);
    db.close();
    logger.info('crm seed complete');
    return;
  }

  if (command === 'backfill') {
    const db = createDb(config.dbPath);
    enqueueMissingCrmJobs(db);
    db.close();
    logger.info('crm backfill complete');
    return;
  }

  if (command === 'status') {
    const db = createDb(config.dbPath);
    const rows = getDashboardRows(db);
    printDashboard(rows);
    db.close();
    return;
  }

  if (command !== 'once') {
    throw new Error(`Unknown command: ${command}. Use: once | seed | status | backfill`);
  }

  const result = await runCrmSync({
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

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error('fatal error', { msg: err.message, stack: err.stack });
  process.exit(1);
});
