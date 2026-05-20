import { config, validateConfig } from './config.js';
import { runSync } from './sync/runSync.js';
import { logger, setLogLevel } from './utils/logger.js';

let runInProgress = false;
let shutdownRequested = false;

async function executeSync() {
  if (runInProgress) {
    logger.warn('skipping sync tick; previous run still in progress');
    return null;
  }

  runInProgress = true;
  try {
    return await runSync({
      sourcePath: config.sourcePath,
      sourceFormat: config.sourceFormat,
      dbPath: config.dbPath,
      mappingsPath: config.mappingsPath,
      maxRetries: config.maxRetries,
      retryBaseMs: config.retryBaseMs,
      skipUnchanged: config.skipUnchanged,
    });
  } finally {
    runInProgress = false;
  }
}

async function runOnceMode() {
  const result = await executeSync();
  if (!result) {
    process.exit(1);
  }
  const exitCode = result.status === 'failed' ? 1 : 0;
  process.exit(exitCode);
}

async function runSchedulerMode() {
  const intervalMs = config.syncIntervalMinutes * 60 * 1000;

  logger.info('scheduler started', {
    interval_minutes: config.syncIntervalMinutes,
    source_path: config.sourcePath,
    db_path: config.dbPath,
  });

  if (config.runOnStart) {
    await executeSync();
  }

  const timer = setInterval(async () => {
    if (shutdownRequested) return;
    await executeSync();
  }, intervalMs);

  const shutdown = async (signal) => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    logger.info('shutdown requested', { signal });
    clearInterval(timer);

    while (runInProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main() {
  validateConfig();
  setLogLevel(config.logLevel);

  const mode = process.argv[2] === 'once' ? 'once' : 'scheduler';

  if (mode === 'once') {
    await runOnceMode();
  } else {
    await runSchedulerMode();
  }
}

main().catch((err) => {
  logger.error('fatal error', { msg: err.message, stack: err.stack });
  process.exit(1);
});
