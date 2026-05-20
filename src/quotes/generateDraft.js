import { generateMockDraft } from './mockAi.js';
import { generateOpenAiDraft } from './openAiDraft.js';

export async function generateAiDraft(options) {
  const { mode, customer_name, deal_notes, catalog, model, apiKey, promptPath } = options;

  if (mode === 'openai') {
    return generateOpenAiDraft({
      customer_name,
      deal_notes,
      catalog,
      apiKey,
      model,
      promptPath,
    });
  }

  return generateMockDraft({
    customer_name,
    deal_notes,
    catalog,
    model: model ?? 'mock-quote-v1',
  });
}
