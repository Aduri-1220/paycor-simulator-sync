import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config, validateMcpConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { setLogLevel, logger } from '../utils/logger.js';
import { createPortalMcpServer } from './server.js';

async function main() {
  validateMcpConfig();
  setLogLevel(config.logLevel);

  const db = createDb(config.dbPath);
  const server = createPortalMcpServer({ db, config });
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await server.close();
    db.close();
    process.exit(0);
  });

  await server.connect(transport);
  logger.info('portal-mcp server running on stdio', {
    dbPath: config.dbPath,
    authRequired: config.mcpRequireAuth,
  });
}

main().catch((err) => {
  logger.error('portal-mcp failed to start', { msg: err.message, stack: err.stack });
  process.exit(1);
});
