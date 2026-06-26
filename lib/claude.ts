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

export interface DraftedInvoice {
  customer_name: string | null;
  line_items: Array<{ description: string; amount: number }>;
}

const INVOICE_PROMPT = (description: string): string =>
  [
    'A UK self employed tradesperson described a job they want to invoice for.',
    'Here is what they said:',
    `"${description}"`,
    'Turn it into clean invoice lines. Reply with JSON only, no other text:',
    '{',
    '  "customer_name": the customer name if mentioned, else null,',
    '  "line_items": [ { "description": short line of work or materials, "amount": number in pounds } ]',
    '}',
    'Split labour and materials into separate lines where it makes sense. Keep',
    'descriptions short and clear, the kind a customer expects on an invoice.',
    'Amounts are numbers only, no currency symbol.',
  ].join('\n');

// Turn a plain job description into draft invoice line items.
export async function draftInvoice(description: string): Promise<DraftedInvoice | null> {
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
      max_tokens: 500,
      messages: [{ role: 'user', content: INVOICE_PROMPT(description) }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Invoice draft failed:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  try {
    const parsed = JSON.parse(clean(textBlock)) as Partial<DraftedInvoice>;
    const items = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const line_items = items
      .map((li) => ({
        description: String(li.description ?? '').slice(0, 200),
        amount: Number.isFinite(Number(li.amount)) ? Math.abs(Number(li.amount)) : 0,
      }))
      .filter((li) => li.description && li.amount > 0);

    return {
      customer_name: parsed.customer_name ? String(parsed.customer_name).slice(0, 120) : null,
      line_items,
    };
  } catch {
    console.error('[claude] Could not parse invoice draft JSON.');
    return null;
  }
}

// Answer a plain money question from the user's own figures. We pass a compact
// summary of their transactions and let Claude reply in one or two short lines.
export async function answerMoneyQuestion(question: string, summary: string): Promise<string | null> {
  if (!KEY) return null;

  const prompt = [
    'You are Lekhio, a calm, plain-talking money assistant for a UK self employed person.',
    'Answer their question using ONLY the figures below. Money is in pounds.',
    'Reply in one or two short sentences, friendly and direct. No jargon. Use the £ sign.',
    'If the figures do not cover it, say so plainly and suggest what to send.',
    '',
    'Their question:',
    `"${question}"`,
    '',
    'Their figures (confirmed and to-review entries, newest first):',
    summary || '(no entries yet)',
  ].join('\n');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Money question failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// --- Scheduling: turn "price up a job for Dave tomorrow at 8am" into a diary event ---

export interface ParsedSchedule {
  title: string;
  kind: 'job' | 'quote' | 'reminder' | 'note';
  starts_at: string | null; // ISO 8601
  remind_at: string | null; // ISO 8601, when to send the reminder
}

const SCHEDULE_PROMPT = (text: string, nowIso: string): string =>
  [
    'A UK self employed tradesperson sent a message that might be a diary entry, a job, a quote, or a reminder.',
    `The current date and time is ${nowIso}, in the Europe/London timezone.`,
    'Here is the message:',
    `"${text}"`,
    'If it describes something to do at a time or date, reply with JSON only:',
    '{',
    '  "is_event": true,',
    '  "title": a short title, for example "Price up a job for Dave",',
    '  "kind": one of job, quote, reminder, note,',
    '  "starts_at": ISO 8601 date-time for when it happens, or null if no clear time,',
    '  "remind_at": ISO 8601 date-time for when to remind them. Use the start time, or 30 minutes before for a job or a quote.',
    '}',
    'Resolve relative times like "tomorrow at 8am", "next Tuesday", or "in 2 hours" against the current time.',
    'If the message is NOT about scheduling anything, reply with {"is_event": false}.',
    'Reply with JSON only, no other text.',
  ].join('\n');

export async function parseSchedule(text: string, nowIso: string): Promise<ParsedSchedule | null> {
  if (!KEY) return null;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: SCHEDULE_PROMPT(text, nowIso) }] }),
  });
  if (!res.ok) {
    console.error('[claude] Schedule parse failed:', res.status);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  try {
    const p = JSON.parse(clean(textBlock)) as {
      is_event?: boolean;
      title?: string;
      kind?: string;
      starts_at?: string | null;
      remind_at?: string | null;
    };
    if (!p.is_event) return null;
    const kind = ['job', 'quote', 'reminder', 'note'].includes(p.kind ?? '') ? (p.kind as ParsedSchedule['kind']) : 'reminder';
    return {
      title: (p.title || 'Reminder').toString().slice(0, 140),
      kind,
      starts_at: p.starts_at ?? null,
      remind_at: p.remind_at ?? p.starts_at ?? null,
    };
  } catch {
    console.error('[claude] Could not parse schedule JSON.');
    return null;
  }
}
