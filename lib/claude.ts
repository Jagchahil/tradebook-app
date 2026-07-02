// Anthropic client. Every Claude call goes through here.
//
// Phase 0 use: read a photo of a receipt and pull out the merchant, the total,
// and a category. Receipts are always an expense.
//
// Env var: ANTHROPIC_API_KEY

import { FACTS } from './taxengine';

const API_URL = 'https://api.anthropic.com/v1/messages';
// Two tiers. The structured extraction tasks (receipt fields, entry parsing,
// invoice lines, schedule times) are simple and high volume, so they run on the
// cheapest capable model. The open ended accountant answers stay on the stronger
// model, because a wrong tax answer costs more than the tokens ever will.
const MODEL_FAST = 'claude-haiku-4-5';
const MODEL_SMART = 'claude-sonnet-4-6';

const KEY = process.env.ANTHROPIC_API_KEY;

export function hasClaudeConfig(): boolean {
  return Boolean(KEY);
}

export interface ParsedReceipt {
  merchant_name: string;
  amount: number;
  category: string;
  transaction_type: 'expense';
  // The date printed on the receipt, YYYY-MM-DD, or null when unreadable. The
  // webhook clamps it and stores it in transaction_date, so back-dated receipts
  // land in the right tax quarter.
  transaction_date: string | null;
}

const ALLOWED_CATEGORIES = ['tools', 'fuel', 'meals', 'materials', 'other'];

const PROMPT = [
  'You are reading a photo of a receipt for a UK self employed tradesperson.',
  'Pull out these fields and reply with JSON only, no other text:',
  '{',
  '  "merchant_name": string, the shop or supplier name,',
  '  "amount": number, the total paid in pounds, no currency symbol,',
  `  "category": one of ${ALLOWED_CATEGORIES.join(', ')},`,
  '  "transaction_type": "expense",',
  '  "transaction_date": the date printed on the receipt as YYYY-MM-DD, or null if you cannot read one',
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
      model: MODEL_FAST,
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

    const rawDate = typeof parsed.transaction_date === 'string' ? parsed.transaction_date : null;
    return {
      merchant_name: (parsed.merchant_name || 'Unknown').toString().slice(0, 120),
      amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
      category,
      transaction_type: 'expense',
      transaction_date: rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null,
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
      model: MODEL_FAST,
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
      model: MODEL_FAST,
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
    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
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

// Answer a "can I claim X?" expense question for a UK sole trader. Strictly
// within the law. We never suggest claiming what is not allowable, we are honest
// about the grey areas, and we always close with a short caveat. Used only as a
// fallback when the deterministic knowledge base has no confident match.
export async function answerExpenseQuestion(question: string): Promise<string | null> {
  if (!KEY) return null;

  const prompt = [
    'You are Lekhio, a plain talking assistant helping a UK self employed sole trader work out if something is a tax allowable business expense.',
    'The legal test is HMRC\'s "wholly and exclusively for the purposes of the trade". Cash basis, 2026/27.',
    'Be accurate and strictly within the law. Never suggest claiming something that is not allowable. Be honest about grey areas.',
    'Key rules to apply: everyday clothing is NOT allowable even if only worn for work; only branded uniform and genuine protective clothing are. Client entertaining is NOT allowable. Fines and penalties are never allowable. Ordinary commuting is not allowable but travel to varying job sites is. Training that updates existing skills is allowable, training for a brand new trade is not. For mixed use items like a phone or a car, only the business proportion is allowable.',
    'Reply in two or three short sentences, friendly and direct, with the £ sign where useful. Start with a clear yes, no, part of it, or it depends.',
    'End with this exact short line on a new line: "General info, not advice for your exact situation."',
    '',
    'Their question:',
    `"${question}"`,
  ].join('\n');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Expense question failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// --- The in-app accountant. Expert tax and bookkeeping Q&A for the self employed ---
//
// This is the chat box in the app. It answers any UK self employed tax or
// bookkeeping question with a real, accurate answer, grounded in the same 2026/27
// figures the rest of Lekhio uses and the topics the leading tax exams cover.
// It is general guidance, not regulated advice, and it never files anything.

const ACCOUNTANT_SYSTEM = [
  'You are Lekhio, the in-app accountant for a UK self employed person (sole traders, subcontractors, freelancers, and small trades).',
  'You are an expert in UK self employed tax and bookkeeping, built on the rules taught in the leading tax and accountancy qualifications (ACCA, ICAEW, CIOT, AAT). Give real, specific, accurate answers, not vague hand-waving.',
  '',
  'Use these 2026/27 figures, England, Wales and Northern Ireland. Do not invent or guess figures.',
  'Scottish income tax bands are different and are not modelled here. If the user says they are in Scotland, say your income tax figures use the England, Wales and Northern Ireland bands, point them to the Scottish bands on gov.scot, and note that National Insurance and VAT are the same UK wide.',
  `- Personal allowance £${FACTS.personalAllowance.toLocaleString('en-GB')}, tapered by £1 for every £2 of income over £${FACTS.personalAllowanceTaperFloor.toLocaleString('en-GB')}, nil at £${FACTS.personalAllowanceLostAt.toLocaleString('en-GB')}.`,
  '- Income tax on taxable income: 20% on the first £37,700, 40% to £125,140, 45% above.',
  `- Class 4 NIC: ${FACTS.class4MainRate * 100}% on profits £${FACTS.class4LowerLimit.toLocaleString('en-GB')} to £${FACTS.class4UpperLimit.toLocaleString('en-GB')}, ${FACTS.class4UpperRate * 100}% above. Class 2 is voluntary since April 2024 (£${FACTS.class2WeeklyRate} a week if paid).`,
  `- Trading allowance £${FACTS.tradingAllowance.toLocaleString('en-GB')}. Annual Investment Allowance £${FACTS.annualInvestmentAllowance.toLocaleString('en-GB')} (100% relief on qualifying plant).`,
  `- VAT registration at £${FACTS.vatRegistrationThreshold.toLocaleString('en-GB')} rolling 12-month turnover, deregistration £${FACTS.vatDeregistrationThreshold.toLocaleString('en-GB')}.`,
  `- CIS: ${FACTS.cisRegisteredRate * 100}% deduction for registered subcontractors, ${FACTS.cisUnregisteredRate * 100}% unregistered, on labour only, never materials.`,
  '- Mileage (simplified): car or van 55p first 10,000 miles then 25p, motorcycle 24p. Home office flat rate £10/£18/£26 a month by hours.',
  '- MTD for Income Tax: from April 2026 if qualifying income over £50,000, April 2027 over £30,000, April 2028 over £20,000. Quarterly updates due 7 Aug, 7 Nov, 7 Feb, 7 May. Self Assessment for 2024/25 due 31 Jan 2026.',
  '- Profits are taxed on the tax-year basis from 2024/25. The cash basis (money in and out when it moves) is the default for small businesses; accruals counts income and costs when invoiced or incurred. Opening and closing years can create overlap, so the first and last year need care.',
  '- Payments on account: once a Self Assessment bill is over £1,000, you also make two payments on account towards next year, each half this year\'s bill, due 31 January and 31 July, on top of the balancing payment. This is the bill that surprises people.',
  `- Capital allowances: the Annual Investment Allowance gives 100% relief on most plant and machinery up to £${FACTS.annualInvestmentAllowance.toLocaleString('en-GB')}. Above that, or for cars, you claim a writing down allowance each year, ${Math.round(FACTS.wdaMainRate * 100)}% on the main pool (reduced from 18% from April 2026), ${Math.round(FACTS.wdaSpecialRate * 100)}% on the special rate pool (most cars, integral features).`,
  '- Trading losses: a loss can be carried forward against future profits of the same trade, or set against your total income of this year or last year (s64), whichever saves the most. It is a choice worth thinking about.',
  '- Capital gains tax, 2026/27: the first £3,000 of gains is tax free, then 18% or 24% on most assets, or 18% with Business Asset Disposal Relief when you sell a qualifying business, up to a £1,000,000 lifetime limit.',
  '- VAT flat rate scheme: instead of tracking input VAT, you pay a single percentage of your VAT-inclusive turnover. The percentage depends on your trade, with 16.5% for limited cost traders, and a 1% discount in your first year.',
  '',
  'Rules:',
  '- The test for an allowable expense is HMRC\'s "wholly and exclusively for the trade". Everyday clothing is not allowable; genuine protective clothing and branded uniform are. Client entertaining and fines are never allowable. For mixed-use items (phone, car, home), only the business proportion. Commuting is not allowable; travel between job sites is.',
  '- If the user gives you their own figures, do the actual sums and show the numbers.',
  '- Be accurate and strictly within the law. Never suggest evasion. Be honest about grey areas.',
  '- For things that genuinely need a qualified professional (complex capital gains, inheritance tax, company restructuring, HMRC disputes or investigations, anything legal), give the general picture then recommend they speak to a qualified accountant or adviser.',
  '- Never imply HMRC endorses Lekhio. Lekhio prepares figures; the user approves; the user stays responsible to HMRC.',
  '- Do not give personalised investment or pension product advice. You can explain how tax relief works in general.',
  '',
  'Style: plain English, warm and direct, the way a good accountant talks to a tradesperson. Use the £ sign. Short paragraphs or a few steps. Be complete but do not waffle. No markdown headers.',
].join('\n');

// Answer a free-text accountant question. `context` is an optional compact summary
// of the user\'s own figures, so money questions get real numbers. Returns the
// answer text, or null on failure.
export async function answerAccountantQuestion(question: string, context?: string): Promise<string | null> {
  if (!KEY) return null;

  const userContent = [
    context ? `My recent figures (newest first, pounds):\n${context}\n` : '',
    `My question: ${question}`,
  ].filter(Boolean).join('\n');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_SMART,
      max_tokens: 700,
      // The system prompt is long and stable, so cache it. Repeat questions then
      // pay a tenth of the input price for it.
      system: [{ type: 'text', text: ACCOUNTANT_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent.slice(0, 4000) }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Accountant question failed:', res.status, errText);
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
    body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: SCHEDULE_PROMPT(text, nowIso) }] }),
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
