import { createDb } from '../db/client.js';
import { config, validateQuoteConfig } from '../config.js';
import { setLogLevel } from '../utils/logger.js';
import { seedProductCatalog } from './seedCatalog.js';
import { runAiDraftQuote } from './runAiDraft.js';

const command = process.argv[2] ?? 'help';

async function main() {
  validateQuoteConfig();
  setLogLevel(config.logLevel);
  const db = createDb(config.dbPath);

  try {
    if (command === 'seed') {
      seedProductCatalog(db);
      const result = await runAiDraftQuote(db, {
        customer_name: 'Acme Kitchen Group',
        deal_notes:
          '3 kitchens need hood install by June. Include ventilation and 8 hours install labor. 10% discount discussed.',
        catalogPath: config.quoteCatalogPath,
        aiMode: config.quoteAiMode,
        aiModel: config.quoteAiModel,
        promptVersion: config.quotePromptVersion,
        promptPath: config.quotePromptPath,
        openAiApiKey: config.openAiApiKey,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'draft') {
      const notes = process.argv.slice(3).join(' ') || 'Site inspection and one hood';
      const result = await runAiDraftQuote(db, {
        customer_name: 'CLI Customer',
        deal_notes: notes,
        catalogPath: config.quoteCatalogPath,
        aiMode: config.quoteAiMode,
        aiModel: config.quoteAiModel,
        promptVersion: config.quotePromptVersion,
        promptPath: config.quotePromptPath,
        openAiApiKey: config.openAiApiKey,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Usage:
  node src/quotes/cli.js seed    # load catalog + sample AI draft quote
  node src/quotes/cli.js draft [deal notes...]
`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
