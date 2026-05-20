import { createDb } from '../db/client.js';
import { config } from '../config.js';
import { loadCatalogFile, syncCatalogToDb } from './catalog.js';
import { logger } from '../utils/logger.js';

export function seedProductCatalog(db, catalogPath = config.quoteCatalogPath) {
  const catalog = loadCatalogFile(catalogPath);
  syncCatalogToDb(db, catalog);
  logger.info('product catalog seeded', { skus: catalog.products.length });
  return { count: catalog.products.length };
}

if (process.argv[1]?.includes('seedCatalog')) {
  const db = createDb(config.dbPath);
  seedProductCatalog(db);
  db.close();
}
