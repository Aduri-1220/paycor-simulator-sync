import { mapFields, mergeTemplate } from './mapFields.js';

export function renderHtml(template, record, context = {}) {
  const vars = mapFields(record, template.fieldMappings, {
    generatedAt: new Date().toISOString(),
    ...context,
  });
  const html = mergeTemplate(template.html, vars);
  return { html, vars };
}
