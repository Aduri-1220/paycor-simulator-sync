import { config } from '../config.js';
import { createDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { seedPendingTimeOff } from './seed.js';

const db = createDb(config.dbPath);
seedPendingTimeOff(db);
db.close();
logger.info('ui seed complete');
