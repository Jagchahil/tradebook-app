// Anthropic client. Every Claude call goes through here.
//
// Phase 0 use: read a photo of a receipt and pull out the merchant, the total,
// and a category. Receipts are always an expense.
//
// Env var: ANTHROPIC_API_KEY

import { FACTS } from './taxengine';
import { LTD } from './ltdengine';
import { aiEnabled } from './aicost';
import { storyboardPrompt, parseStoryboardDraft, type DraftInput, type DraftResult } from './studioagent';

const API_URL = 'https://api.anthropic.com/v1/messages';
// Two tiers. The structured extraction tasks (receipt fields, entry parsing,
// invoice lines, schedule times) are simple and high volume, so they run on the
// cheapest capable model. The open ended accountant answers stay on the stronger
// model, because a wrong tax answer costs more than the tokens ever will.
const MODEL_FAST = 'claude-haiku-4-5-20251001';
const MODEL_SMART = 'claude-sonnet-5';

// Per-call timeout for Anthropic. The webhook must ack Meta within 5 seconds and
// does its real work in after(). A slow or hung upstream call must never block a
// worker indefinitely at volume, so every request aborts after this budget and
// the caller degrades to a safe null. Vision and generation get a generous
// budget because image reads and longer answers legitimately take a few seconds.
const ANTHROPIC_TIMEOUT_MS = 20000;

const KEY = process.env.ANTHROPIC_API_KEY;

// The gate every call passes: a key must be configured AND the kill switch must
// be off. AI_KILL_SWITCH=on disables every AI call instantly, no deploy needed,
// so if spend ever runs hot you pull one lever and the whole AI layer goes quiet
// while the deterministic features keep working untouched.
// One definition of the kill switch, shared with the cost governance module, so
// AI_KILL_SWITCH can never mean one thing here and another there.
function ready(): boolean {
  return aiEnabled(process.env);
}

export function hasClaudeConfig(): boolean {
  return ready();
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

// Cost observability. One log line per AI call with the feature name and the
// token counts the API reports, so spend per feature is visible in the logs
// with no schema and no personal data. Never log message content here.
function logUsage(feature: string, data: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } }): void {
  const u = data.usage;
  if (!u) return;
  console.log(
    `[ai] feature=${feature} model=${data.model ?? 'unknown'} in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0} cached=${u.cache_read_input_tokens ?? 0}`,
  );
}

export async function parseReceipt(base64: string, mediaType: string): Promise<ParsedReceipt | null> {
  if (!ready() || !KEY) return null;

  // A timeout aborts the fetch with an AbortError, so the whole request is
  // wrapped. A hang degrades to null rather than throwing out of the webhook.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Parse request failed or timed out:', message);
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[claude] Parse failed:', res.status, text);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('receipt_vision', data);
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
  if (!ready() || !KEY) return null;

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL_FAST,
        max_tokens: 300,
        messages: [{ role: 'user', content: ENTRY_PROMPT(text) }],
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Entry parse request failed or timed out:', message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Entry parse failed:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('entry_parse', data);
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
  if (!ready() || !KEY) return null;

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL_FAST,
        max_tokens: 500,
        messages: [{ role: 'user', content: INVOICE_PROMPT(description) }],
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Invoice draft request failed or timed out:', message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Invoice draft failed:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('invoice_draft', data);
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

// Answer a plain money question from the user's own figures.
//
// ⚠️ THE BRAIN NOW REACHES WHATSAPP, AND UNTIL 14 JULY 2026 IT DID NOT.
//
// `getRelevantKnowledge` reads the GOV.UK items a human has APPROVED in the console, and it was
// wired into exactly one place: /api/ask, the Ask screen in the app.
//
// WhatsApp is the product. "Text it. It's in your Lekhio." So every night Khoji read GOV.UK, every
// morning a human approved what it found, and the man who TEXTED US a tax question got none of it,
// while the same man opening the app got the answer with the source attached. The brain was growing
// into a channel almost nobody uses.
//
// `knowledge` is optional and defaults to empty, so a caller that does not pass it behaves exactly
// as before and an empty knowledge base changes nothing. That is the safe direction of failure.
export async function answerMoneyQuestion(
  question: string,
  summary: string,
  knowledge = '',
): Promise<string | null> {
  if (!ready() || !KEY) return null;

  const prompt = [
    'You are Lekhio, the accountant for a UK self employed person, answering in WhatsApp. You KNOW UK self employed tax.',
    'Answer their question directly and confidently, in one or two short, friendly sentences. No jargon. Money is in pounds, use the £ sign.',
    'You are their accountant. You never tell them to look it up, check HMRC yourself, or send them off to a GOV.UK link for a standard tax figure. You already hold the figures below, so just tell them the answer and relate it to their own situation.',
    'Only ask them to send a receipt or a detail when the question is about THEIR OWN transactions and you do not have that entry. If a question is genuinely nothing to do with their money or UK self employed tax, say so briefly and kindly.',
    '',
    'Standard UK self employed tax figures for 2026/27 (England, Wales and Northern Ireland). These are your built-in knowledge, use them to answer directly, do not guess beyond them:',
    ...TAX_FACTS_2627,
    '',
    'Their question:',
    `"${question}"`,
    '',
    'Their own figures (confirmed and to-review entries, newest first):',
    summary || '(no entries yet)',
    // THE APPROVED KNOWLEDGE. Every line here was read off GOV.UK by Khoji and approved by a human in
    // the console. Nothing unapproved can reach this string: the query is hard filtered.
    //
    // The instruction to CITE is not decoration. We are not HMRC and we never imply we are. If we are
    // going to tell a man something about the return he is legally responsible for, he gets the link
    // to the page it came from, and he can go and read it himself. That is the difference between an
    // answer and an assertion.
    ...(knowledge
      ? [
          '',
          'Verified GOV.UK updates a human on our team has approved. Use these if they bear on the',
          'question, and when you do, END your reply with the source link on its own line, like:',
          'Source: https://www.gov.uk/...',
          'If none of them are relevant, ignore them completely and do not mention them.',
          knowledge,
        ]
      : []),
  ].join('\n');

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Money question request failed or timed out:', message);
    return null;
  }
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Money question failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('money_question', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// Answer a "can I claim X?" expense question for a UK sole trader. Strictly
// within the law. We never suggest claiming what is not allowable, we are honest
// about the grey areas, and we always close with a short caveat. Used only as a
// fallback when the deterministic knowledge base has no confident match.
export async function answerExpenseQuestion(question: string): Promise<string | null> {
  if (!ready() || !KEY) return null;

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

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Expense question request failed or timed out:', message);
    return null;
  }
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Expense question failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('expense_check', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// --- WhatsApp support draft. When a customer asks for a human or reports a problem in WhatsApp, we open
// a ticket for Jag and pre-draft a warm reply for him to edit before sending. It NEVER invents account
// details, figures, a refund, or a promise Lekhio cannot keep — it acknowledges, reassures, and signals
// a person is on it. Only a starting point; Jag edits and approves every reply.
export async function draftSupportReply(
  customerMessage: string,
  kb?: Array<{ title: string; body: string }>,
  customerName?: string | null,
): Promise<string | null> {
  if (!ready() || !KEY) return null;
  const who = customerName && customerName.trim() ? customerName.trim().split(/\s+/)[0] : '';
  // Ground the draft in Jag's own playbook when a known issue matches, so the reply reflects the real
  // fix (authored in Obsidian), not generic reassurance. Empty when nothing matches — then it degrades
  // to the warm-acknowledgement behaviour it had before.
  const known = (kb || []).slice(0, 3).map((k) => `- ${k.title}: ${k.body}`).join('\n');
  const prompt = [
    'You are the front desk for Lekhio, a UK bookkeeping and tax app for sole traders that runs in WhatsApp.',
    'A customer has messaged asking for help. Draft a SHORT reply for a human on the team to review and send from WhatsApp.',
    'Rules:',
    '- Warm, plain, professional UK English. A few short sentences, like a helpful human on the team, not a bot.',
    '- Acknowledge what they said and reassure them a person is on it. Do NOT invent account details, figures, refunds, dates, or any promise you cannot verify.',
    '- If they report something broken, say the team is looking into it and will get back to them shortly.',
    '- No sign-off name, no subject line, just the message body. No placeholders like [name].',
    who ? `- You may open by first name: ${who}.` : '- You do not know their name; open warmly without one.',
    known
      ? `\nOur playbook for issues like this (use it if it fits, in your own words; do not quote it verbatim, do not mention a playbook):\n${known}`
      : '',
    '',
    'Their message:',
    `"${customerMessage}"`,
  ].join('\n');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL_SMART, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Support draft request failed or timed out:', message);
    return null;
  }
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Support draft failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('support_draft', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// --- Sharpen a playbook answer. Jag writes or pastes a rough answer to a common question in the console
// and taps "improve"; this returns a tighter, warm, customer-ready version he can accept or edit. It only
// rewrites what he gave it — it never invents figures, promises, or facts that were not in his draft.
export async function improveSupportAnswer(question: string, draft: string): Promise<string | null> {
  if (!ready() || !KEY) return null;
  const prompt = [
    'You are the front desk for Lekhio, a UK bookkeeping and tax app for sole traders that runs in WhatsApp.',
    'Below is a common customer question and a rough answer the founder wrote. Rewrite the answer so it is ready to send to a customer.',
    'Rules:',
    '- Warm, plain, professional UK English. A few short sentences. Like a helpful human on the team, not a bot.',
    '- Keep it TRUE to the founder’s draft. Do NOT add figures, prices, dates, promises, or facts that are not in the draft. If the draft is vague, keep it vague rather than inventing specifics.',
    '- No sign-off, no subject line, no placeholders. Just the improved answer text.',
    '',
    `Question: "${question}"`,
    `Rough answer: "${draft}"`,
  ].join('\n');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL_SMART, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
  } catch (err) {
    console.error('[claude] Improve answer failed or timed out:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
  if (!res.ok) {
    console.error('[claude] Improve answer failed:', res.status);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('support_improve', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return textBlock ? textBlock.trim() : null;
}

// --- The in-app accountant. Expert tax and bookkeeping Q&A for the self employed ---
//
// This is the chat box in the app. It answers any UK self employed tax or
// bookkeeping question with a real, accurate answer, grounded in the same 2026/27
// figures the rest of Lekhio uses and the topics the leading tax exams cover.
// It is general guidance, not regulated advice, and it never files anything.

// Shared source of truth for the 2026/27 tax figures. Khoji keeps the underlying FACTS fresh; these
// lines are the accountant's built-in knowledge, spread into BOTH the in-app accountant
// (ACCOUNTANT_SYSTEM) and the WhatsApp money answer (answerMoneyQuestion), so the two channels can
// never drift. The live round-trip on 21 Jul that caught Rakha telling a customer to go fetch a
// GOV.UK link for the VAT threshold is why this exists.
const TAX_FACTS_2627: string[] = [
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
];

const ACCOUNTANT_SYSTEM = [
  'You are Lekhio, the in-app accountant for a UK self employed person (sole traders, subcontractors, freelancers, and small trades).',
  'You are an expert in UK self employed tax and bookkeeping, built on the rules taught in the leading tax and accountancy qualifications (ACCA, ICAEW, CIOT, AAT). Give real, specific, accurate answers, not vague hand-waving.',
  '',
  'Use these 2026/27 figures, England, Wales and Northern Ireland. Do not invent or guess figures.',
  'Scottish income tax bands are different and are not modelled here. If the user says they are in Scotland, say your income tax figures use the England, Wales and Northern Ireland bands, point them to the Scottish bands on gov.scot, and note that National Insurance and VAT are the same UK wide.',
  ...TAX_FACTS_2627,
  '',
  'BUSINESS STRUCTURE matters, and the user profile below tells you which one applies. Answer for THEIR structure, not sole-trader rules by default.',
  '- SOLE TRADER: no separate business return. The trade goes on their own Self Assessment (SA103). Income tax and Class 4 NIC on the profit, as above. One return, one bill.',
  '- LIMITED COMPANY: the company is a separate taxpayer. It files a Corporation Tax return (CT600) and pays corporation tax on its profit (19% up to £50,000 of profit, 25% above £250,000, with marginal relief in between, an effective rate of about 26.5% on the slice between). Salary the company pays a director is a deductible cost; most directors take a small salary around the £' + FACTS.personalAllowance.toLocaleString('en-GB') + ' personal allowance. Dividends are paid from POST-corporation-tax profit and are taxed on the person: a £' + LTD.dividendAllowance.toLocaleString('en-GB') + ' dividend allowance at 0%, then ' + (LTD.dividendBasic * 100) + '% (basic), ' + (LTD.dividendHigher * 100) + '% (higher), ' + (LTD.dividendAdditional * 100) + '% (additional). A dividend can only be paid from distributable profit (Companies Act 2006 s830); taking more is a director\'s loan with a 33.75% s455 charge if unpaid nine months after the year end. So a company owner has TWO returns: the company\'s CT600 and their own SA100. Weigh both together.',
  '- PARTNERSHIP: transparent, pays no tax itself, files an SA800 showing the profit split. EACH partner is taxed on their share exactly like a sole trader (income tax plus Class 4 NIC) through their own Self Assessment. A partner\'s other income stacks on top of their share.',
  '- Trading losses: a loss can be carried forward against future profits of the same trade, or set against your total income of this year or last year (s64), whichever saves the most. It is a choice worth thinking about.',
  '- Capital gains tax, 2026/27: the first £3,000 of gains is tax free, then 18% or 24% on most assets, or 18% with Business Asset Disposal Relief when you sell a qualifying business, up to a £1,000,000 lifetime limit.',
  '- VAT flat rate scheme: instead of tracking input VAT, you pay a single percentage of your VAT-inclusive turnover. The percentage depends on your trade, with 16.5% for limited cost traders, and a 1% discount in your first year.',
  '',
  'Rules:',
  '- The test for an allowable expense is HMRC\'s "wholly and exclusively for the trade". Everyday clothing is not allowable; genuine protective clothing and branded uniform are. Client entertaining and fines are never allowable. For mixed-use items (phone, car, home), only the business proportion. Commuting is not allowable; travel between job sites is.',
  '- If the user gives you their own figures, do the actual sums and show the numbers.',
  '- Be accurate and strictly within the law. Never suggest evasion. Be honest about grey areas.',
  '- The only external updates you may rely on are the ones in a Verified recent updates section, if the message has one. Never claim a tax change, rate or threshold that is not in your built-in figures or that verified section. If unsure whether something changed, give the figure you have and suggest they check the current position on GOV.UK.',
  '- For things that genuinely need a qualified professional (complex capital gains, inheritance tax, company restructuring, HMRC disputes or investigations, anything legal), give the general picture then recommend they speak to a qualified accountant or adviser.',
  '- Never imply HMRC endorses Lekhio. Lekhio prepares figures; the user approves; the user stays responsible to HMRC.',
  '- Do not give personalised investment or pension product advice. You can explain how tax relief works in general.',
  '',
  'Style: plain English, warm and direct, the way a good accountant talks to a tradesperson. Use the £ sign. Short paragraphs or a few steps. Be complete but do not waffle.',
  'Format: plain text only. Do not use any markdown. No bold, no asterisks, no headers, no hash symbols. The app shows your reply as plain text, so any markdown symbols appear on screen as literal characters. A short list may start lines with a simple hyphen and a space.',
  'Never use an em dash or an en dash, and never use a hyphen as a sentence dash. Use a full stop or a comma instead. For a number range use the word to, for example £12,570 to £50,270. For subtraction write minus or less, not a dash. Keep hyphens only for hyphenated words and simple list bullets.',
].join('\n');

// Answer a free-text accountant question. `context` is an optional compact summary
// of the user\'s own figures, so money questions get real numbers. Returns the
// answer text, or null on failure.
export async function answerAccountantQuestion(question: string, context?: string, knowledge?: string, profile?: string, history?: string): Promise<string | null> {
  if (!ready() || !KEY) return null;

  const userContent = [
    knowledge
      // ⚠️ THE OLD INSTRUCTION READ: "Treat these as the latest confirmed position, PREFER them where
      // they are relevant." Over a list that could contain a Budget change not yet in force.
      //
      // So a model doing exactly as it was told would quote a man next April's mileage rate in
      // January, and he would log three months of journeys at a number that is not the law and sign
      // the return himself. The date was in there, as a bare string, and the model was left to do the
      // arithmetic that decides which law applies. That is not a job for a language model.
      //
      // The caller (app/api/ask) now splits the list in TypeScript, against a real clock, and hands
      // over two blocks with the reasoning already done. This instruction must respect that split and
      // must never invite it to prefer whichever item looks newest.
      ? `Verified updates from official sources (GOV.UK and HMRC), reviewed and carrying a primary source link. They are already split for you into what is IN FORCE and what is only ANNOUNCED. Answer his question using ONLY the in-force block. NEVER quote a figure from the announced block as if it were the law today. Name the change and cite the source. Ignore this section if none are relevant:\n${knowledge}\n`
      : '',
    context ? `My recent figures (newest first, pounds):\n${context}\n` : '',
    // Their structure and income mix, so a company director gets company answers, not sole-trader ones.
    profile ? `About me (answer for THIS structure, not sole-trader rules by default):\n${profile}\n` : '',
    // The pocket: how key tax figures have changed over time, so "what was the rate before / when did
    // it change" is answered from Khoji's memory rather than guessed. Each line is old value, new value,
    // and the date it took effect.
    history ? `How key figures have changed over time (only use if the question is about a past or changed figure):\n${history}\n` : '',
    `My question: ${question}`,
  ].filter(Boolean).join('\n');

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL_SMART,
        // claude-sonnet-5 reasons before answering, so the budget must cover the
        // reasoning AND the final text. At 700 the model could exhaust the budget
        // mid-thought and emit no text block, which surfaced to users as
        // "I could not work that out". A roomier ceiling lets a full answer land;
        // real accountant replies are short, so the extra headroom is rarely used.
        // Raised 2000 -> 4000 (19 Jul): a structure-aware "compute my corporation tax
        // AND my personal dividend tax" question is a multi-step calculation that can
        // spend the whole 2000 on reasoning and emit no text. Verified live: the VAT
        // question answered, the two-return calculation returned empty. Headroom fixes it.
        max_tokens: 4000,
        // The system prompt is long and stable, so cache it. Repeat questions then
        // pay a tenth of the input price for it.
        system: [{ type: 'text', text: ACCOUNTANT_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userContent.slice(0, 4000) }],
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Accountant question request failed or timed out:', message);
    return null;
  }
  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Accountant question failed:', res.status, errText);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('accountant', data);
  // Join every text block, not just the first. A reasoning model can return a
  // thinking block before the text, so find-first could miss the answer. Ignore
  // non text blocks and stitch any text together.
  const textBlock = (data.content || [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('')
    .trim();
  return textBlock ? textBlock : null;
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
  if (!ready() || !KEY) return null;

  // Timeout aborts with an AbortError, so the fetch is wrapped to degrade to null.
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: 300, messages: [{ role: 'user', content: SCHEDULE_PROMPT(text, nowIso) }] }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Schedule parse request failed or timed out:', message);
    return null;
  }
  if (!res.ok) {
    console.error('[claude] Schedule parse failed:', res.status);
    return null;
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('schedule_parse', data);
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

// DRAFT A STORYBOARD FROM AN IDEA. The creative half of the content engine (docs 110, 111).
//
// Runs on the SMART model, because this is the brand voice reaching real people, not a field
// extraction, and a clip that sounds like a software company is worse than no clip. The prompt and
// the parser live in lib/studioagent.ts so the rails and the JSON shape can be tested without a
// network. Degrades to null on any failure, exactly like every other call here, so a hung or
// refused draft never throws into the request that asked for it.
export async function draftStoryboard(input: DraftInput): Promise<DraftResult | null> {
  if (!ready() || !KEY) return null;

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL_SMART,
        max_tokens: 1500,
        system: [
          {
            type: 'text',
            text:
              'You are the content writer for Lekhio. You write honest, blunt, British short form ' +
              'marketing for UK tradespeople. You obey the rules given in the user message without ' +
              'exception, and you return only the JSON asked for.',
          },
        ],
        messages: [{ role: 'user', content: storyboardPrompt(input) }],
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[claude] Storyboard draft request failed or timed out:', message);
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[claude] Storyboard draft failed:', res.status, errText);
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }>; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } };
  logUsage('storyboard_draft', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  return parseStoryboardDraft(textBlock, input);
}
