import fs from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';

export function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

export function parseJsonSource(text) {
  let parsed;
  try {
    parsed = JSON.parse(stripBom(text));
  } catch (err) {
    const error = new Error(`Invalid JSON: ${err.message}`);
    error.code = 'SOURCE_PARSE_ERROR';
    throw error;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const error = new Error('Root JSON must be an object with an employees array');
    error.code = 'SOURCE_SCHEMA_INVALID';
    throw error;
  }

  if (!Array.isArray(parsed.employees)) {
    const error = new Error('Missing or invalid employees array in source file');
    error.code = 'SOURCE_SCHEMA_INVALID';
    throw error;
  }

  return parsed.employees;
}

export function parseCsvSource(text) {
  let records;
  try {
    records = parseCsv(stripBom(text), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    const error = new Error(`Invalid CSV: ${err.message}`);
    error.code = 'SOURCE_PARSE_ERROR';
    throw error;
  }

  return records.map((row) => ({
    ...row,
    hourly_rate: row.hourly_rate === '' || row.hourly_rate === undefined
      ? row.hourly_rate
      : Number.parseFloat(row.hourly_rate),
  }));
}

export function inferFormat(filePath, configuredFormat) {
  if (configuredFormat !== 'auto') return configuredFormat;
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'csv') return 'csv';
  if (ext === 'json') return 'json';
  return 'json';
}

export function readSourceFile(sourcePath, sourceFormat) {
  if (!fs.existsSync(sourcePath)) {
    const error = new Error(`Source file not found: ${sourcePath}`);
    error.code = 'SOURCE_FILE_NOT_FOUND';
    throw error;
  }

  let text;
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
  } catch (err) {
    const error = new Error(`Cannot read source file: ${err.message}`);
    error.code = err.code === 'EACCES' ? 'SOURCE_FILE_NOT_FOUND' : 'SOURCE_PARSE_ERROR';
    throw error;
  }

  if (text.length === 0) {
    const error = new Error('Source file is empty');
    error.code = 'SOURCE_PARSE_ERROR';
    throw error;
  }

  const format = inferFormat(sourcePath, sourceFormat);
  if (format === 'csv') {
    return parseCsvSource(text);
  }
  return parseJsonSource(text);
}
