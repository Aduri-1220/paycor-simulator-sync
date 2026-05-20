const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel = LEVELS.info;

export function setLogLevel(level) {
  if (LEVELS[level] !== undefined) {
    minLevel = LEVELS[level];
  }
}

export function log(level, msg, fields = {}) {
  if (LEVELS[level] < minLevel) return;
  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg, fields) => log('debug', msg, fields),
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields),
};
