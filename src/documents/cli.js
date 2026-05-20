import { config, validateDocumentConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { setLogLevel, logger } from '../utils/logger.js';
import { runDocumentPipeline } from './runDocumentPipeline.js';
import { seedApprovedTimeOff } from './seed.js';

async function main() {
  const command = process.argv[2] ?? 'once';

  validateDocumentConfig();
  setLogLevel(config.logLevel);

  if (command === 'seed') {
    const db = createDb(config.dbPath);
    seedApprovedTimeOff(db);
    db.close();
    logger.info('seed complete');
    return;
  }

  if (command !== 'once') {
    throw new Error(`Unknown command: ${command}. Use: once | seed`);
  }

  const result = await runDocumentPipeline({
    dbPath: config.dbPath,
    templatesRoot: config.templatesRoot,
    templateId: config.templateId,
    documentsDir: config.documentsDir,
    emailProvider: config.emailProvider,
    emailApiKey: config.emailApiKey,
    emailFrom: config.emailFrom,
    emailDryRun: config.emailDryRun,
    maxRetries: config.maxRetries,
    retryBaseMs: config.retryBaseMs,
  });

  if (result.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error('fatal error', { msg: err.message, stack: err.stack });
  process.exit(1);
});
