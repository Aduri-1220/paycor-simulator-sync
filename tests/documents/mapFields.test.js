import { describe, expect, it } from 'vitest';
import { mapFields, mergeTemplate } from '../../src/documents/mapFields.js';

describe('mapFields', () => {
  const mappings = [
    { target: 'requestId', source: 'request_id' },
    { target: 'employeeName', source: 'employee_name' },
    { target: 'reason', source: 'reason', default: '—' },
  ];

  it('maps record fields to template variables', () => {
    const vars = mapFields(
      { request_id: 'PTO-1', employee_name: 'Jordan Lee', reason: '' },
      mappings
    );
    expect(vars.requestId).toBe('PTO-1');
    expect(vars.employeeName).toBe('Jordan Lee');
    expect(vars.reason).toBe('—');
  });

  it('merges variables into template placeholders', () => {
    const html = '<p>{{requestId}} — {{employeeName}}</p>';
    const out = mergeTemplate(html, { requestId: 'PTO-1', employeeName: 'Jordan' });
    expect(out).toBe('<p>PTO-1 — Jordan</p>');
  });
});
