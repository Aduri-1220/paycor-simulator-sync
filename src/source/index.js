import fs from 'fs';
import { readSourceFile } from './reader.js';

export { readSourceFile, parseJsonSource, parseCsvSource } from './reader.js';

export function loadEmployees(sourcePath, sourceFormat) {
  return readSourceFile(sourcePath, sourceFormat);
}

export function loadMappings(mappingsPath) {
  const raw = fs.readFileSync(mappingsPath, 'utf8');
  return JSON.parse(raw);
}
