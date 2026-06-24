// Anthropic client. Every Claude call goes through here.
//
// Phase 0 use: read a photo of a receipt and pull out the merchant, the total,
// and a category. Receipts are always an expense.
//
// Env var: ANTHROPIC_API_KEY

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const KEY = process.env.ANTHROPIC_API_KEY;

export function hasClaudeConfig(): boolean {
  return Boolean(KEY);
}

export interface ParsedReceipt {
  merchant_name: string;
  amount: number;
  category: string;
  transaction_type: 'expense';
}

const ALLOWED_CATEGORIES = ['tools', 'fuel', 'meals', 'materials', 'other'];

const PROMPT = [
  'You are reading a photo of a receipt for a UK self employed tradesperson.',
  'Pull out these fields and reply with JSON only, no other text:',
  '{',
  '  "merchant_name": string, the shop or supplier name,',
  '  "amount": number, the total paid in pounds, no currency symbol,',
  `  "category": one of ${ALLOWED_CATEGORIES.join(', ')},`,
  '  "transaction_type": "expense"',
  '}',
  'Pick the closest category. Use "materials" for building supplies, "tools" for',
  'tools and hardware, "fuel" for petrol or diesel, "meals" for food and drink,',
  'and "other" for anything else. If you cannot read the total, set amount to 0.',
].join('\n');

function clean(raw: string): string {
  // Strip code fences if the model wrapped the JSON.
  return raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
}

export async function parseReceipt(base64: string, mediaType: string): Promise<ParsedReceipt | null> {
  if (!KEY) return null;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[claude] Parse failed:', res.status, text);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  try {
    const parsed = JSON.parse(clean(textBlock)) as Partial<ParsedReceipt>;
    const amount = Number(parsed.amount);
    const category =
      parsed.category && ALLOWED_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : 'other';

    return {
      merchant_name: (parsed.merchant_name || 'Unknown').toString().slice(0, 120),
      amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
      category,
      transaction_type: 'expense',
    };
  } catch {
    console.error('[claude] Could not parse JSON from model reply.');
    return null;
  }
}

export interface ParsedEntry {
  merchant_name: string;
  amount: number;
  category: string;
  direction: 'income' | 'expense';
}

const ENTRY_PROMPT = (text: string): string =>
  [
    'A UK self employed tradesperson sent a note about their money, by voice or text.',
    'Here is what they said:',
    `"${text}"`,
    'Work out if this is money they SPENT (an expense) or money they RECEIVED (income).',
    'Phrases like "got paid", "customer paid", "invoice", "received", "earned" mean income.',
    'Phrases like "bought", "spent", "paid for", "fuel", "materials" mean an expense.',
    'Reply with JSON only, no other text:',
    '{',
    '  "direction": "income" or "expense",',
    '  "merchant_name": string, the customer or the shop or supplier, or "Unknown",',
    '  "amount": number, the amount in pounds, no currency symbol,',
    `  "category": for an expense one of ${ALLOWED_CATEGORIES.join(', ')}; for income use "income"`,
    '}',
    'Examples. "forty quid of diesel at the BP" is expense, amount 40, category fuel, BP.',
    '"got paid 500 by Dave for the bathroom" is income, amount 500, category income, Dave.',
    'If no amount is clear, set amount to 0.',
  ].join('\n');

// Turn a spoken or typed sentence into a structured entry, income or expense.
export async function parseSpokenTransaction(text: string): Promise<ParsedEntry | null> {
  if (!KEY) return null;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: ENTRY_PROMPT(text) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Entry parse failed:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  try {
    const parsed = JSON.parse(clean(textBlock)) as Partial<ParsedEntry>;
    const amount = Number(parsed.amount);
    const direction: 'income' | 'expense' = parsed.direction === 'income' ? 'income' : 'expense';
    let category: string;
    if (direction === 'income') {
      category = 'income';
    } else {
      category =
        parsed.category && ALLOWED_CATEGORIES.includes(parsed.category) ? parsed.category : 'other';
    }

    return {
      merchant_name: (parsed.merchant_name || 'Unknown').toString().slice(0, 120),
      amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
      category,
      direction,
    };
  } catch {
    console.error('[claude] Could not parse JSON from entry reply.');
    return null;
  }
}
