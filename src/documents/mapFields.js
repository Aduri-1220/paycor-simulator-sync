export function mapFields(record, mappings, context = {}) {
  const vars = { ...context };

  for (const mapping of mappings) {
    const raw = record[mapping.source];
    const value =
      raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? String(raw).trim()
        : (mapping.default ?? '');
    vars[mapping.target] = value;
  }

  return vars;
}

export function mergeTemplate(html, vars) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (vars[key] === undefined || vars[key] === null) return '';
    return String(vars[key]);
  });
}
