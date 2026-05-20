import fs from 'fs';

export async function generateOpenAiDraft({
  customer_name,
  deal_notes,
  catalog,
  apiKey,
  model,
  promptPath,
}) {
  const promptConfig = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
  const catalogSummary = catalog.products
    .filter((p) => p.active)
    .map(
      (p) =>
        `${p.sku}: ${p.name} (${p.unit}) list=$${p.list_price} cost=$${p.cost}`
    )
    .join('\n');

  const userContent = [
    'Catalog (active SKUs only):',
    catalogSummary,
    '',
    `Customer: ${customer_name}`,
    'Deal notes:',
    deal_notes || '(none)',
    '',
    'Return JSON with keys: customer_name, line_items (sku, description, quantity, unit, list_price, discount_pct), assumptions (string[]), risks (string[]).',
  ].join('\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: promptConfig.system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty content');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI response was not valid JSON');
  }

  return {
    raw: content,
    draft: parsed,
    model: data.model ?? model,
  };
}
