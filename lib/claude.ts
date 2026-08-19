// Anthropic client. Every Claude call goes through here.
//
// Phase 0 use: read a photo of a receipt and pull out the merchant, the total,
// a category, the date, and the VAT the paper prints. Receipts are always an
// expense.
//
// 🔴 THE VAT IS A READING AND NEVER A CLAIM. Nothing in this file, and nothing
// downstream of it, may mark a VAT figure as confirmed. A figure read off a
// photograph that is wrong one time in seven is worse than no figure at all,
// because he will trust it and put it in a reclaim. The only thing that sets
// vat_confirmed is lib/supabase.ts confirmTransactionVat, and the only thing that
// calls that is a form he filled in himself.
//
// Env var: ANTHROPIC_API_KEY

import { FACTS, asPence, asPercent } from './taxengine';
import { LTD } from './ltdengine';
import { aiEnabled } from './aicost';
import { houseCopy } from './housestyle';
import { SCOTLAND_LINE } from './scotland';
// The truncated-reply rescue lives in its own pure module so the test suite can load it
// directly; the story is in that file's header and at RECEIPT_MAX_TOKENS below.
import { rescueTruncatedReceipt } from './receiptrescue';
import type { AmountConfidence } from './receiptconfidence';

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
  // 🔴 THE VAT PRINTED ON THE PAPER, IN POUNDS, OR NULL BECAUSE IT WAS NOT PRINTED.
  //
  // NULL IS NOT ZERO. Null means the receipt did not say, which is the honest
  // answer for a slip carrying only a VAT registration number and a total. Zero
  // means it did say, and said none. supabase/APPLY_2026-08-01_vat.sql draws the
  // same line in the column comment, for the same reason.
  //
  // ⚠️ THE MODEL IS TOLD NOT TO WORK IT OUT. A sixth of the total is a guess
  // wearing a reading's clothes, and on a supplier who was not charging VAT it is
  // not even close. So a receipt that does not print the VAT comes back null and
  // he is never shown a figure nobody wrote down.
  vat: number | null;
  // What was in the basket. Empty when the receipt is not itemised or the lines could not be read,
  // which is the honest answer and is not the same as a receipt with nothing on it. See the block
  // in PROMPT for why this is captured now and read by nothing yet.
  line_items: ReceiptLine[];
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HOW WELL THE TOTAL COULD ACTUALLY BE SEEN. Added 13 August 2026, and it is the half of
  // R2-F3 that was left undone.
  //
  // A deliberately faded receipt was read as £110.55 when the paper says £118.55, and came back
  // through this interface in exactly the shape a crisp printed invoice does. Nothing downstream
  // could treat the two differently because there was nothing to treat differently.
  //
  // ⚠️ UNDEFINED MEANS THE MODEL WAS NOT ASKED, NOT THAT IT SAID CLEAR. The truncation rescue path
  // reads money out of a cut off prefix and never reaches this field, and every row in every book
  // written before today has nothing here. lib/receiptconfidence.ts holds the rule that only an
  // explicit 'unsure' changes anything, so the signal can add caution and never remove it.
  amount_confidence?: AmountConfidence;
}

export interface ReceiptLine {
  description: string;
  amount: number;
}

// ⚠️ A CEILING ON BOTH COUNT AND LENGTH, because this is model output going into a database column
// and the only two ways it goes wrong are a hallucinated wall of lines and one enormous string.
// A till receipt with more than sixty lines is a weekly shop, not a job, and eighty characters is
// longer than any real line on any real receipt.
const MAX_RECEIPT_LINES = 60;
const MAX_LINE_CHARS = 80;

const ALLOWED_CATEGORIES = ['tools', 'fuel', 'meals', 'materials', 'other'];

const PROMPT = [
  'You are reading a photo of a receipt for a UK self employed tradesperson.',
  'Pull out these fields and reply with JSON only, no other text:',
  '{',
  '  "merchant_name": string, the shop or supplier name,',
  '  "amount": number, the total paid in pounds, no currency symbol,',
  `  "category": one of ${ALLOWED_CATEGORIES.join(', ')},`,
  '  "transaction_type": "expense",',
  '  "transaction_date": the date printed on the receipt as YYYY-MM-DD, or null if you cannot read one,',
  '  "vat": number, the VAT amount printed on the receipt in pounds, or null if none is printed,',
  '  "line_items": [ { "description": the item exactly as printed, "amount": number in pounds } ],',
  '  "amount_confidence": "clear" or "unsure", about the TOTAL only',
  '}',
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A QUESTION ABOUT THE PAPER, NOT A PROBABILITY. R2, 13 August 2026.
  //
  // "How confident are you, 0 to 1" produces a number that looks like calibration and is not: it
  // clusters near the top and moves for reasons that have nothing to do with the photograph. So we
  // ask about the IMAGE, which is in front of it, and about the ONE field that matters, and the
  // answer is checkable by a human holding the same receipt.
  //
  // Deliberately biased toward "unsure": the cost of a false unsure is one glance at a receipt he
  // still has. The cost of a false clear is a wrong number in his books that nothing will ever
  // question again.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  'For amount_confidence, judge only how well you could SEE the total, not how likely the number is:',
  '"clear" means every digit of the total is crisply legible and could not be read any other way.',
  '"unsure" means the paper is faded, creased, torn, blurred, in shadow, cut off, or ANY single digit '
  + 'could reasonably be read as a different digit. If you are weighing it up at all, say unsure.',
  'This is about the printing and the photograph, never about whether the amount seems plausible.',
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT WAS IN THE BASKET, NOT JUST WHAT IT COST. Added 10 August 2026, before launch, for
  // products that do not exist yet, because THE DATA IS PERISHABLE AND THE PHOTO IS NOT KEPT.
  //
  // The model is already looking at the paper. Reading the totals and throwing the lines away
  // costs nothing extra today and cannot be recovered later: receipt images go back as 7 day
  // signed links, they are deleted on erasure, and nobody re-processes half a million photographs.
  // A year from now every receipt we hold would say "Screwfix, £47.20" and nothing about what was
  // actually bought.
  //
  // ⚠️ WHAT IT IS FOR, SAID PLAINLY SO IT IS NOT MISTAKEN FOR SCOPE CREEP. Three things, and not
  // one of them can be done from a total:
  //   1. CAPITAL ALLOWANCES. A £340 Screwfix trip holding a £280 SDS drill is a capital purchase
  //      hiding inside a consumables receipt. MTD software's known blind spot is losing exactly
  //      these, and the total can never show it.
  //   2. CATEGORISATION THAT IS ACTUALLY RIGHT. One receipt is very often two categories:
  //      materials and a sandwich, tools and fuel. One-category-per-receipt is an error we have
  //      been living with only because the lines were discarded.
  //   3. WHAT HE ACTUALLY BUYS, which is the only honest basis for ever helping him buy it better.
  //
  // ⚠️ AND WHAT IT IS NOT FOR YET. Nothing reads this today. It is captured, stored, and left
  // alone. Building on it is a later decision. Throwing it away in the meantime is not a decision
  // anybody would take on purpose, which is the whole argument for doing this before launch.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  'For "line_items", list what was actually bought, one entry per line printed on the receipt.',
  'Copy each description as it appears on the paper, including the shop\'s own abbreviations. Do',
  'not tidy them up, expand them, or guess what an abbreviation stands for. A wrong expansion is',
  'worse than an ugly one, because it reads as a fact.',
  'If the receipt is not itemised, or you cannot read the lines, return an empty array. Never',
  'invent a line, and never split the total into lines yourself.',
  'Ignore subtotal, VAT, total, change and card lines. Those are not things he bought.',
  'Pick the closest category. Use "materials" for building supplies, "tools" for',
  'tools and hardware, "fuel" for petrol or diesel, "meals" for food and drink,',
  'and "other" for anything else. If you cannot read the total, set amount to 0.',
  'Most UK till receipts do print the VAT, usually on a line marked VAT, or in a small',
  'table of rate codes at the bottom. Many print only a VAT registration number and a',
  'total, and that is not a VAT amount.',
  'If no VAT amount is printed, return null for vat. Never calculate it from the total.',
  'A calculated figure is a guess dressed up as a reading, and if the shop was not',
  'charging VAT it is simply wrong.',
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A 200 IS NOT A PROMISE OF JSON, AND NINE ENTRY POINTS IN THIS FILE BELIEVED IT WAS.
//
// Every one of them read
//
//     if (!res.ok) { ...return null; }
//     const data = (await res.json()) as { content?: ... };
//
// That guard is correct and it is not the guard that was missing. It catches a 500, a 429 and a
// 401. It does nothing whatever about a TWO HUNDRED CARRYING HTML, which is exactly what an edge,
// a proxy or a captive network hands back when it decides to answer on the origin's behalf:
// status 200, Content-Type text/html, a courteous apology in a <body>. res.json() then THROWS,
// and because none of these calls sat inside a try that expected it, the exception left the
// function, left the caller, and the customer was silently ignored. He asked a question and
// nothing came back. No reply, no apology, no log line naming the cause.
//
// It is the same defect class as a474eb8a, which is why it is worth fixing all nine at once rather
// than the one that happens to be reported.
//
// ⚠️ NEVER THE BODY IN THE LOG. This file's own rule, and lib/email.ts's, and CLAUDE.md's: a
// third party's error body can carry the request it wrapped. What is logged is the LENGTH and one
// word saying whether it opened with a tag. That is enough to tell "somebody's gateway answered
// for Anthropic" from "the stream was cut off half way", and it is not content.
//
// ⚠️ AND IT RETURNS NULL RATHER THAN THROWING. Every caller in this file already handles null as
// "the AI could not help this time", and every one of those paths has an honest sentence ready.
// A thrown error has no sentence.
// ═════════════════════════════════════════════════════════════════════════════════════════════
type ClaudeReply = {
  content?: Array<{ type: string; text?: string }>;
  model?: string;
  // Why the model stopped. 'max_tokens' means the reply was CUT OFF at the ceiling, which is
  // not an error status and not a malformed body: it is a 200 carrying half a JSON object.
  // parseReceipt reads it to tell "the paper was unreadable" from "our own ceiling cut the
  // reading short", because those two deserve opposite log lines and opposite fixes.
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
};

async function readClaudeReply(res: Response, feature: string): Promise<ClaudeReply | null> {
  let raw: string;
  try {
    raw = await res.text();
  } catch (err) {
    console.error(`[claude] ${feature}: the body could not be read:`, err instanceof Error ? err.message : 'unknown');
    return null;
  }
  try {
    return JSON.parse(raw) as ClaudeReply;
  } catch {
    console.error(
      `[claude] ${feature}: a 200 whose body is not JSON (${/^\s*</.test(raw) ? 'html' : 'other'}, ${raw.length} bytes)`,
    );
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B43. THE FLAG THAT NOBODY READ. 19 AUGUST 2026.
//
// The API tells us, on every single reply, whether it finished or whether OUR OWN CEILING cut it
// off: `stop_reason: 'max_tokens'`. Before today that flag was read in exactly ONE place in the
// whole estate, inside parseReceipt, whose ceiling had already been raised to 1,600 so it barely
// needed it. The five calls that still sat at 300 read nothing. The ClaudeReply type's own comment,
// four hundred lines up, has said the whole time that a cut off reply and a failure "deserve
// opposite log lines and opposite fixes". They had the same one, which was none.
//
// PROVED ON PRODUCTION, 18 August: a claim question at /app/thread came back ending
// "Home office. If you work from home", mid sentence, with nothing saying it had been cut.
//
// ⚠️ THE CEILING IS NOT THE FIX AND MUST NEVER BE MISTAKEN FOR IT. Raising a ceiling moves the
// cliff further away, it does not remove it, and the man who falls off the new one gets exactly
// what the man who fell off the old one got. Reading the flag is what closes it. The ceilings move
// as well, below, because 300 was measurably too tight for what these prompts actually produce.
//
// ⚠️ AND THE TWO KINDS OF CALL GET OPPOSITE ANSWERS, WHICH IS THE WHOLE POINT.
//
//   A PARSE that was cut is REFUSED and never written. parseSpokenTransaction, parseSchedule and
//   draftInvoice all turn a man's words into rows or figures, and half a parse is not half an
//   answer, it is a wrong number in a bookkeeping product. Every one of those callers already
//   carries an honest "I could not read that" sentence for a null, so refusing needs NO new copy.
//
//   An ANSWER that was cut is TRIMMED back to its last complete sentence and told on itself, in
//   the one signed line below. Half a sentence about his tax with nothing marking it is the house
//   disease this item is named after.
//
// ⚠️ WHAT THE MEASUREMENT ACTUALLY FOUND, WRITTEN DOWN BECAUSE IT CAME OUT AGAINST THE ITEM.
// The item said a cut parse was already corrupting books. It is not, and it could not have been.
// Both parse prompts specify their entire reply shape, so the worst reply either can produce is
// bounded by the readers' own field caps, and that worst reply fits under the 300 ceiling even
// counted in CHARACTERS. Characters is the conservative reading, because a token is never shorter
// than one character. And cutting that worst reply at EVERY ONE of its characters produces ZERO
// prefixes that JSON.parse accepts, so even a cut one already fell to null.
//
// 🔴 THE FIGURES ARE DELIBERATELY NOT REPEATED HERE, AND THAT IS A CORRECTION MADE ON 19 AUGUST.
// Until today this block stated two character counts that NOTHING computed and NOTHING asserted,
// so the day either prompt gained a field the numbers would have gone on being quoted after they
// stopped being true. test/b43cutoff.test.mjs SECTION 4 now derives both worst replies from these
// readers' own caps, pins their lengths AND the headroom left, and runs the real cleaner over
// every prefix of each. Read the figure there, where it is recomputed on every run, and not here.
//
// ⚠️ AND IT IS TIGHTER THAN THE OLD PROSE READ. On the schedule path the headroom is single
// figures, so the next field added to that reply spends it. Section 4 is the thing that will say
// so, on the run it happens, instead of a comment nobody reruns.
//
// The refusal below is therefore not a rescue, it is the conversion of an ACCIDENTAL guard into a
// designed one: the accidental one is a side effect of JSON.parse throwing, and it disappears the
// day somebody adds a rescue. Somebody already has. rescueTruncatedReceipt, forty lines up,
// deliberately reads money out of a truncated prefix. That is the precedent this guard exists in
// front of.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// The ceiling for the SHORT answering lanes. Deliberately not 4,000, which is the in app
// accountant's: these three prompts ask for one to three short sentences plus, on the money lane,
// a source link on its own line, which is about 120 tokens. 300 was too tight because the model
// answers a broad question with a structured reply rather than two sentences, and production
// proved it. 700 is a little over twice the observed cut point: it fits the answer the model
// really produces, and it stays short enough that a WhatsApp reply is a thing you read on a phone
// rather than scroll. A bigger number here would let a two sentence promise become an essay.
const ANSWER_MAX_TOKENS = 700;

// 🔴 SIGNED COPY. Jag, 19 August 2026, by delegation, in his own words: "yes go with your
// recommendation". NO SESSION MAY SOFTEN, LENGTHEN, SHORTEN OR REWORD THIS LINE. It is typed once,
// here, so there is exactly one of it in the estate and a guard can count it.
export const ANSWER_CUT_NOTE =
  'That is as much as I can fit in one go. Ask me about any part of it and I will go deeper.';

// Did OUR ceiling cut this reply off? The only thing in this file that decides that question.
function wasCutOff(data: ClaudeReply): boolean {
  return data.stop_reason === 'max_tokens';
}

// For the PARSE paths. True means the caller must return null and let its existing honest sentence
// do the talking. The log line names the cause, which is the distinction the ClaudeReply comment
// asked for: "our ceiling cut it short" is not "the model wrote nonsense".
// ⚠️ NEVER THE CONTENT IN THE LOG. The feature name and the cause, nothing else.
function refuseIfCut(data: ClaudeReply, feature: string): boolean {
  if (!wasCutOff(data)) return false;
  console.error(`[claude] ${feature}: cut off at our own token ceiling. Refused rather than guessed.`);
  return true;
}

// Trim to the last COMPLETE sentence. Only ever called on a reply we KNOW was cut.
//
// ⚠️ THREE PROPERTIES IT MUST HAVE, AND EACH ONE IS THERE BECAUSE THE OBVIOUS VERSION LACKS IT.
//
//  1. IT NEVER RETURNS NOTHING. A cut reply with no sentence terminator anywhere keeps every word
//     the man was given. Trimming a fragment to an empty string and appending a note would hand him
//     the note and nothing else, which is worse than the fragment.
//
//  2. A FULL STOP INSIDE A NUMBER IS NOT A SENTENCE END. "£47.20" is not two sentences, because a
//     terminator only counts when whitespace or the end of the string follows it. AND, only on a
//     cut reply, a full stop that both follows a digit and sits at the very end is NOT counted
//     either, because that is the exact shape of a decimal cut in half: "you owe £47." when the
//     model was writing £47.20. Keeping that would turn a truncation into a WRONG FIGURE, which is
//     the one thing this product may never do. The cost is trimming back one sentence further in
//     the rare case where a reply genuinely ends on a number, and that trade is not close.
//
//  3. IT IS NEVER CALLED ON A REPLY THAT WAS NOT CUT. finishAnswer returns an uncut reply byte for
//     byte, so a complete answer that legitimately ends without a full stop, a source URL on its
//     own line for instance, is untouched. That is the guarantee, and it is asserted.
function trimToLastCompleteSentence(text: string): string {
  const CLOSERS = '"’”\')]';
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    let end = i + 1;
    while (end < text.length && CLOSERS.includes(text[end])) end++;
    if (end < text.length && !/\s/.test(text[end])) continue;   // mid word or mid number
    if (ch === '.' && end >= text.length && i > 0 && /[0-9]/.test(text[i - 1])) continue; // half a decimal
    cut = end;
  }
  if (cut < 0) return text;
  const kept = text.slice(0, cut).trim();
  return kept.length > 0 ? kept : text;
}

// The finisher for every ANSWER path. An uncut reply passes through untouched.
// ⚠️ THE SIGNED LINE IS APPENDED LAST, AFTER houseCopy has already run on the model's own words, so
// nothing can rewrite a character of it. That ordering is deliberate.
function finishAnswer(copy: string | null, data: ClaudeReply): string | null {
  if (!copy) return null;
  if (!wasCutOff(data)) return copy;
  console.error('[claude] answer cut off at our own token ceiling. Trimmed and marked.');
  return `${trimToLastCompleteSentence(copy)}\n\n${ANSWER_CUT_NOTE}`;
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CEILING THAT REFUSED EVERY LONG RECEIPT, 12 AUGUST 2026. RUN 2's florist photographed
// a 27 line cash and carry till roll, perfectly printed, and was told "I could not read that
// one. A clearer photograph usually does it." Twice. The photograph was never the problem.
//
// max_tokens sat at 300 from the days when the reply was five fields. On 10 August the prompt
// gained line_items, one entry per printed line, and nobody raised the ceiling to match a field
// that scales with the length of the paper. A weekly-shop receipt needs several hundred tokens
// of lines alone, so the reply was CUT OFF mid array, JSON.parse threw, and the whole reading
// came back null. The doctrine in receiptingest.ts says the lines are the optional part of the
// reading and a man still gets his expense when the basket comes back nonsense. Truncation
// defeated that on the worst possible receipts: the longest ones, which are the itemised ones
// the line capture exists for.
//
// Two fixes, together, because either alone leaves a cliff:
//   1. The ceiling now fits the prompt: sixty capped lines at roughly fifteen tokens each,
//      plus the money fields, sits under 1,200, so 1,600 is headroom rather than hope.
//   2. A reply that still gets cut off gives up its LINES, never its MONEY. The prompt prints
//      the money fields before line_items, so the truncated prefix always carries them, and
//      rescueTruncatedReceipt reads them out of it. Only what the model actually wrote is
//      taken: no amount in the prefix means no rescue, because a guess is worse than a retry.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const RECEIPT_MAX_TOKENS = 1600;

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
        // See RECEIPT_MAX_TOKENS above: 300 here refused every long till roll for two days.
        max_tokens: RECEIPT_MAX_TOKENS,
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

  const data = await readClaudeReply(res, 'receipt_vision');
  if (!data) return null;
  logUsage('receipt_vision', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  // WORST REPLY UNBOUNDED: line_items. What was in the basket grows with the receipt, so no set
  // of field caps bounds this reply and test/b43cutoff.test.mjs section 4 cannot measure a worst
  // case for it. This is the path that already has RECEIPT_MAX_TOKENS and a deliberate rescue
  // below, which is the honest shape for a reply nobody can bound.
  let parsed: Partial<ParsedReceipt>;
  try {
    parsed = JSON.parse(clean(textBlock)) as Partial<ParsedReceipt>;
  } catch {
    // A reply that is not JSON is nearly always a reply that was CUT OFF at the ceiling. The
    // rescue takes the money fields from the prefix and gives up the lines; it never invents.
    // Anything it cannot rescue stays a null, exactly as before.
    const saved = rescueTruncatedReceipt(clean(textBlock));
    if (!saved) {
      console.error(
        `[claude] Could not parse JSON from model reply${data.stop_reason === 'max_tokens' ? ' (cut off at the token ceiling)' : ''}.`,
      );
      return null;
    }
    console.log(`[ai] feature=receipt_vision rescued=1 stop=${data.stop_reason ?? 'unknown'}`);
    parsed = saved;
  }

  try {
    const amount = Number(parsed.amount);
    const category =
      parsed.category && ALLOWED_CATEGORIES.includes(parsed.category)
        ? parsed.category
        : 'other';

    const rawDate = typeof parsed.transaction_date === 'string' ? parsed.transaction_date : null;
    const total = Number.isFinite(amount) ? Math.abs(amount) : 0;

    // 🔴 THE ORDER OF THESE TWO LINES IS WHAT KEEPS NULL AND ZERO APART. Number(null) is 0, so
    // running the value straight through Number() would turn "the paper did not say" into "the
    // paper said none", and a confident zero is the one shape of wrong he cannot spot.
    const rawVat = parsed.vat === null || parsed.vat === undefined ? null : Number(parsed.vat);
    // Clamped both ends. Never negative, and never larger than the money that changed hands: VAT
    // above the total is a misread, not a reading, and the smaller of the two is the only figure
    // that could possibly be true. Confirming it is still his, and it happens nowhere near here.
    const vat = rawVat !== null && Number.isFinite(rawVat) && rawVat >= 0
      ? Math.min(rawVat, total)
      : null;

    // ⚠️ EVERY LINE IS CLEANED, CAPPED AND CHECKED, and a bad one is dropped rather than the whole
    // receipt refused. The lines are the optional part of this reading: a man who photographed his
    // diesel still gets his expense logged if the model returned nonsense for the basket.
    //
    // ⚠️ AND A LINE IS NEVER RECONCILED AGAINST THE TOTAL. It is tempting to check the lines sum to
    // `amount` and reject them if they do not, and it would be wrong: real receipts carry discounts,
    // deposits, multi-buys and rounding, so a mismatch is normal and proves nothing. The total is
    // read from the total line and stays the money. The lines are a description of the basket.
    const rawLines = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const line_items: ReceiptLine[] = rawLines
      .slice(0, MAX_RECEIPT_LINES)
      .map((l) => {
        const desc = typeof l?.description === 'string' ? l.description.trim().slice(0, MAX_LINE_CHARS) : '';
        const amt = Number(l?.amount);
        return { description: desc, amount: Number.isFinite(amt) ? Math.abs(amt) : 0 };
      })
      .filter((l) => l.description.length > 0);

    return {
      merchant_name: (parsed.merchant_name || 'Unknown').toString().slice(0, 120),
      amount: total,
      category,
      transaction_type: 'expense',
      transaction_date: rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null,
      vat,
      line_items,
      // ⚠️ ONLY THE TWO WORDS WE ASKED FOR COUNT. Anything else, including a number, a sentence, a
      // missing field or an older prompt's reply, comes back undefined, which lib/receiptconfidence
      // reads as "not asked" rather than as "clear". A signal that can be produced by accident is
      // not a signal, and this one is only ever allowed to ADD caution.
      amount_confidence:
        parsed.amount_confidence === 'clear' || parsed.amount_confidence === 'unsure'
          ? parsed.amount_confidence
          : undefined,
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

  const data = await readClaudeReply(res, 'entry_parse');
  if (!data) return null;
  logUsage('entry_parse', data);

  // B43. A cut parse is refused, never guessed at. See THE FLAG THAT NOBODY READ above.
  if (refuseIfCut(data, 'entry_parse')) return null;
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

  const data = await readClaudeReply(res, 'invoice_draft');
  if (!data) return null;
  logUsage('invoice_draft', data);

  // B43. A cut invoice draft is refused, never half read. This one was NOT in the item and was
  // found by the shape guard below: 500 tokens against a reply whose line_items array grows with
  // the job, which is the same shape that refused every long till roll on 12 August.
  if (refuseIfCut(data, 'invoice_draft')) return null;
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  if (!textBlock) return null;

  // WORST REPLY UNBOUNDED: line_items. The array grows with the job, so no set of field caps
  // bounds this reply and test/b43cutoff.test.mjs section 4 cannot measure a worst case for it.
  // That is exactly why this call sits at 500 rather than 300, and why the refusal above is the
  // real guard here rather than an arithmetic argument about headroom.

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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B27, 18 AUGUST 2026. THIS PROMPT TOLD THE MODEL IT WAS HIS ACCOUNTANT AND THAT IT WAS IN
// WHATSAPP. app/api/thread/route.ts CALLS THIS FUNCTION, SO BOTH SENTENCES REACHED THE LIVE WEB.
//
// The first line read "You are Lekhio, the accountant for a UK small business owner, answering in
// WhatsApp" and the third read "You are their accountant". Proved on production twice: once by the
// B19 identity walk, which caught it volunteering "Hi, I'm your accountant" to "what can you do for
// me", and once by this packet, which asked "are you an accountant" point blank and was answered
// "I'm Lekhio, your accountant for small business tax in the UK". WE ARE NOT HIS ACCOUNTANT.
// Nobody wrote it and nobody signed it off.
//
// ⚠️ AND UNLIKE EVERY OTHER CLAIM OF THIS KIND, THERE IS NO DETERMINISTIC FIRST LOCK. Twelve
// phrasings of "are you an accountant" were run against the real matchers and ALL TWELVE reach the
// model: isIdentity, matchProductTruth, isSupportRequest, isGreeting, matchTotalsQuestion and
// isPricing return falsy on every one. matchProductTruth is the lock on "are you HMRC approved";
// this question has no lock at all, so the rules below are not the second line of defence, they
// are the only one.
//
// THE ROLE WORD WAS NOT INVENTED HERE. identityAnswer() already says "a bookkeeping assistant for
// the UK self employed" and productTruthAnswer('investment') already says "Lekhio is your
// bookkeeping and tax, not a financial adviser". Both are signed off copy. The prompt now agrees
// with the two places the product had already decided this, rather than adding a third answer.
//
// 🔴 AND "You are their accountant." WAS DELETED RATHER THAN REWORDED, DELIBERATELY. Its job was to
// authorise confidence, and confidence is carried three times over without it: "Answer their
// question directly and confidently" above it, and "State them directly" below it. Deleting was
// the smaller change and it loses nothing, which was proved by walking it rather than asserted.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B27 PART TWO, THE CHANNEL, AND THE ANSWER IS THAT THIS FUNCTION TAKES NO LaneChannel.
// ARGUED HERE RATHER THAN IN A DOCUMENT, BECAUSE THE NEXT PERSON TO ADD A SENTENCE READS THIS.
//
// Every lane builder closed this week takes a LaneChannel, so the obvious move was to give this one
// the same shape. It was measured clause by clause, the way identityAnswer's seven were, and the
// measurement says no.
//
// A LaneChannel earns its keep when a clause has to say a DIFFERENT TRUE THING on each channel. On
// the identity lane three clauses of seven did. HERE THE COUNT IS ZERO. The only channel specific
// fragment was "answering in WhatsApp", and that is a PLACE NAME, not a capability. A place name is
// the one thing in a prompt with no upside: it tells the model where it is standing and nothing
// about what the man in front of it can do, so the model fills the gap by inventing.
//
// ⚠️ AND THE CAPABILITY THAT LOOKED CHANNEL SPECIFIC TURNED OUT NOT TO BE, WHICH IS THE ARGUMENT.
// On the identity lane "Snap a receipt" was WhatsApp only, because /api/ask's caller is the phone's
// text only Ask box. THIS function has two callers, app/api/whatsapp and app/api/thread, and
// app/api/thread takes a receipt photograph through the SAME ingest walk as the capture route (its
// own comment above the multipart branch says so). Receipt capture is TRUE ON BOTH CALLERS, so the
// rule below is one sentence and not two.
//
// WHAT THREADING A CHANNEL WOULD HAVE COST: a fourth parameter, two call sites, and a standing
// question for every future editor about which of two strings a new sentence belongs in. Buying one
// place name with that is copying the shape of the identity lane without the reason for it.
//
// 🔴 accountantSystem() IS THE SAME DECISION WITH A DIFFERENT INPUT, WHICH IS WHY THE TWO PROMPTS
// ARE NOT IDENTICAL. It has one caller, the phone's Ask box, and that box is text only, so it does
// NOT carry the photograph rule. That single clause is the entire measured difference between the
// two prompts, and it is a difference in the FACTS, not in the plumbing.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function answerMoneyQuestion(
  question: string,
  summary: string,
  knowledge = '',
): Promise<string | null> {
  if (!ready() || !KEY) return null;

  const prompt = [
    'You are Lekhio, a bookkeeping assistant for a UK small business owner. Most are sole traders or subcontractors; some run a limited company. You KNOW UK small business tax.',
    'Answer their question directly and confidently, in one or two short, friendly sentences. No jargon. Money is in pounds, use the £ sign. Never use an em dash or an en dash; use a comma or a full stop instead.',
    'You never tell them to look it up, check HMRC yourself, or send them off to a GOV.UK link for a standard tax figure. You already hold the figures below, so just tell them the answer and relate it to their own situation.',
    'The figures below are the current, in force 2026/27 rates. State them directly. Do not show your working or correct yourself in the reply, and never say a rate looks wrong or used to be different. Trust the figures below, they are the ones in force.',
    'Only ask them to send a receipt or a detail when the question is about THEIR OWN transactions and you do not have that entry. If a question is genuinely nothing to do with their money or UK small business tax, say so briefly and kindly. A limited company question is NOT out of scope: answer it from the company figures below.',
    '',
    // 🔴 THE FOUR RULES THAT MUST NEVER BE BROKEN, ON EVERY LANE, NOT JUST THE APP.
    //
    // lib/waintents.ts matchProductTruth catches these questions deterministically and answers them
    // with fixed true words, and that gate runs BEFORE this function. But a matcher is a list of
    // phrasings somebody thought of, and the ones nobody thought of land HERE. Until 6 August 2026
    // this prompt had none of these rules while the in-app accountantSystem() had all four, so an
    // unanticipated phrasing ("can I pay myself cash to avoid tax", "does the app submit to hmrc",
    // "how much tax do you save the average sparky") reached a model told only to answer "directly
    // and confidently". The deterministic gate is the lock; this is the second lock. Both, always,
    // because the cost of one bad screenshot here is the company.
    'Rules you never break, whatever is asked:',
    // 🔴 THE SIXTH RULE. YOU CANNOT CHANGE HIS BOOKS FROM HERE, AND YOU SAID YOU WOULD. Run 3,
    // 13 August 2026. Told "that screwfix one wasnt work mate, take it out", the web chat replied
    // "Got it, I'll remove that £1000 Screwfix entry from 27 July" and removed nothing: the row was
    // still there, still filed as materials, and the customer had been told his books were
    // corrected. WhatsApp failed differently on the same day, asking him to send the receipt back
    // before it would delete a row it had just quoted the amount of. Neither named the control that
    // works, which is one press and has been there the whole time.
    '- You cannot add, change or delete anything in their books. Never say you will remove, take out, delete, recategorise or fix an entry, and never say you have. When they want a cost out, tell them it is one press: open Money, find the line, and press Not business. When a figure was read wrong, tell them to open the entry in Money and correct the amount there. Say what they should press, never what you will do.',
    '- Be accurate and strictly within the law. Never suggest, help with, or soften evasion: leaving income out, keeping cash off the books, not declaring a job. If they ask, say no plainly, then tell them Lekhio works out every legal saving under Ways to save.',
    '- Never say or imply that HMRC approves, endorses, accredits or certifies Lekhio. HMRC approves no software. Never say Lekhio files, submits or sends their tax. Lekhio prepares the figures, they approve, and they stay responsible for their own tax to HMRC.',
    // 🔴 THE SEVENTH RULE, B27, 18 AUGUST 2026, AND IT IS THE ONE THIS PACKET EXISTS FOR. Asked
    // "are you an accountant" point blank on /app/thread, production answered "I'm Lekhio, your
    // accountant for small business tax in the UK". Every one of twelve phrasings of that question
    // was measured against the real matchers and ALL TWELVE reach the model, so unlike every other
    // claim of this kind there is no deterministic first lock. This rule IS the lock.
    '- Never call Lekhio their accountant, their adviser or their agent, because it is none of those things. Lekhio is bookkeeping and tax software: it prepares their figures, they approve them, and they stay responsible to HMRC. If they ask whether they still need an accountant, tell them that is their call, and that plenty of people use both.',
    // 🔴 THE EIGHTH RULE, B27, AND IT IS THE CHANNEL HALF. The old first line said "answering in
    // WhatsApp", so the model was told where it was standing and nothing about what the man in
    // front of it could do. Asked "how do i send you a receipt" on the web chat, production replied
    // "You don't send me receipts, mate" and sent him off to type it in by hand, eleven words above
    // a composer that reads "Or send a receipt photograph and I will read it". It denied the
    // product's own promise and rewarded the manual work the product exists to remove.
    '- They can send you a photograph of a receipt in this conversation and you read it. Never tell them they cannot. And never say which app or messaging service this conversation is happening in, because you cannot see which one it is. Naming a SCREEN inside Lekhio is a different thing and is often the right answer: Money, Ways to save and the Tax screen are all fine to name.',
    '- Never promise or state a number for the tax Lekhio will save them, for them or for anyone else. What anyone saves depends on what they spend and what the rules allow.',
    '- Do not give investment or pension product advice, on shares, crypto, property or anything else. You can explain the tax side of a decision they have already made.',
    // 🔴 THE FIFTH RULE, AND IT WAS NOT HERE. Run 3, 13 August 2026. A half share partner asked
    // "how much has jerome made this year" about his business partner. The figures below are the
    // WHOLE partnership's books, this man is taxed on his slice, and Jerome is not a customer. On
    // both channels the model answered as though Jerome were the account holder, handed over the
    // firm's turnover under his name, and invented an expenses figure to go with it. Nothing in
    // these rules said whose money this is, so it never occurred to it not to.
    '- These figures belong to the person you are talking to and to nobody else. If they ask what another person earned, made, spent or owes, by name or otherwise, say plainly that you only hold their own figures. If they share a business with someone, you may explain that the books cover the whole business and that they are taxed on their own share, but never present any of it as the other person\'s income or profit.',
    '',
    // \u{1f534} B31, 18 AUGUST 2026, AND IT WAS MEASURED ON PRODUCTION BEFORE IT WAS WRITTEN, TWICE, IN
    // TWO DIFFERENT WAYS, BECAUSE THE ITEM SAID EVIDENCE IS NOT PROOF.
    //
    // This prompt had NO markdown rule while accountantSystem() below has had one all along, and it
    // serves BOTH WhatsApp and /app/thread. houseCopy() is sanitiseDashes(text.trim()) and strips no
    // markup at all, so nothing catches it at the boundary either.
    //
    // MEASUREMENT ONE, DERIVED OFF DISK: app/app/thread/chat/page.tsx prints the reply as
    // `<p className="lek-bubble">{m.content}</p>`, a React text child, escaped, under a rule that
    // sets white-space:pre-wrap. There is no markdown renderer on that path, no
    // dangerouslySetInnerHTML, and no markdown dependency in package.json. So the symbols show as
    // LITERAL CHARACTERS, exactly as the rule below claims. WhatsApp is the same: it uses a single
    // asterisk for bold, so a double one is two characters on his screen.
    //
    // MEASUREMENT TWO, WALKED ON PRODUCTION as +callum on 18 August, on the build BEFORE this rule,
    // on questions chosen to INVITE a list rather than to be easy: TWO OF THE THREE model answers
    // came back with markdown, and the first one carried NINE bold headings. What a customer read,
    // screenshotted:
    //
    //     **Clothing.** High-visibility wear and safety boots that are only for work.
    //     **Training and qualifications.** Courses, exam fees, certificates to keep you current.
    //
    // The five answers walked earlier on 18 August carried none because none of them asked for a
    // list. That is what the item meant by evidence rather than proof, and it is why the probe was
    // written to ask for one.
    //
    // \u26a0\ufe0f THE WORDING MIRRORS accountantSystem()'s DELIBERATELY, because the two prompts differ
    // only in FACTS and never in plumbing, and that difference is asserted in
    // test/promptclaims.test.mjs. One clause changes: that prompt says "The app shows your reply as
    // plain text" and has one caller; this one has two, on two channels, and may name neither.
    'Format: plain text only. Do not use any markdown. No bold, no asterisks, no headers, no hash symbols. Your reply is shown as plain text, so any markdown symbols appear on screen as literal characters. A short list may start lines with a simple hyphen and a space.',
    '',
    'Standard UK small business tax figures for 2026/27 (England, Wales and Northern Ireland). These are your built-in knowledge, use them to answer directly, do not guess beyond them:',
    ...taxFacts2627(),
    '',
    'If they run a limited company, these company figures apply too:',
    ...ltdFacts2627(),
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
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: ANSWER_MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
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
  const data = await readClaudeReply(res, 'money_question');
  if (!data) return null;
  logUsage('money_question', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return finishAnswer(houseCopy(textBlock), data);
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
      body: JSON.stringify({ model: MODEL_FAST, max_tokens: ANSWER_MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
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
  const data = await readClaudeReply(res, 'expense_check');
  if (!data) return null;
  logUsage('expense_check', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return finishAnswer(houseCopy(textBlock), data);
}

// --- WhatsApp support draft. When a customer asks for a human or reports a problem in WhatsApp, we open
// a ticket for Jag and pre-draft a warm reply for him to edit before sending. It NEVER invents account
// details, figures, a refund, or a promise Lekhio cannot keep. It acknowledges, reassures, and signals
// a person is on it. Only a starting point; Jag edits and approves every reply.
export async function draftSupportReply(
  customerMessage: string,
  kb?: Array<{ title: string; body: string }>,
  customerName?: string | null,
): Promise<string | null> {
  if (!ready() || !KEY) return null;
  const who = customerName && customerName.trim() ? customerName.trim().split(/\s+/)[0] : '';
  // Ground the draft in Jag's own playbook when a known issue matches, so the reply reflects the real
  // fix (authored in Obsidian), not generic reassurance. Empty when nothing matches, and then it degrades
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
      body: JSON.stringify({ model: MODEL_SMART, max_tokens: ANSWER_MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
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
  const data = await readClaudeReply(res, 'support_draft');
  if (!data) return null;
  logUsage('support_draft', data);
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return finishAnswer(houseCopy(textBlock), data);
}

// --- Sharpen a playbook answer. Jag writes or pastes a rough answer to a common question in the console
// and taps "improve"; this returns a tighter, warm, customer-ready version he can accept or edit. It only
// rewrites what he gave it. It never invents figures, promises, or facts that were not in his draft.
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
  const data = await readClaudeReply(res, 'support_improve');
  if (!data) return null;
  logUsage('support_improve', data);

  // B43. REFUSED rather than trimmed, and this one is deliberately not an answer path. What comes
  // back here is saved into Jag's support playbook, and draftSupportReply then GROUNDS every future
  // customer draft in it. A half rewritten answer saved once is served for ever, so the console
  // gets its existing "could not improve that, try again" and Jag keeps the draft he wrote.
  if (refuseIfCut(data, 'support_improve')) return null;
  const textBlock = data.content?.find((c) => c.type === 'text')?.text;
  return houseCopy(textBlock);
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHICH SELF ASSESSMENT YEAR IS CURRENTLY BEING FILED, FROM THE CLOCK.
//
// A UK tax year ends on 5 April. The return for the year that has just ended is the one people are
// filing now, and it is due the following 31 January. So on any date from 6 April onward the year
// being filed ended THIS calendar year; before 6 April it ended LAST calendar year.
//
// ⚠️ THESE EXIST SO THAT NO DEADLINE IN THIS FILE IS EVER A TYPED YEAR AGAIN. See the block in
// taxFacts2627 for the six months this product spent serving a deadline that had already passed.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function filingYearEnd(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  const beforeApril6 = now.getUTCMonth() < 3 || (now.getUTCMonth() === 3 && now.getUTCDate() < 6);
  return beforeApril6 ? y - 1 : y;
}

function filingYearLabel(now: Date = new Date()): string {
  const end = filingYearEnd(now);
  return `${end - 1}/${String(end % 100).padStart(2, '0')}`;
}

function taxFacts2627(): string[] {
  return [
  `- Personal allowance £${FACTS.personalAllowance.toLocaleString('en-GB')}, tapered by £1 for every £2 of income over £${FACTS.personalAllowanceTaperFloor.toLocaleString('en-GB')}, nil at £${FACTS.personalAllowanceLostAt.toLocaleString('en-GB')}.`,
  `- Income tax on taxable income: ${Math.round(FACTS.basicRate * 100)}% on the first £${FACTS.basicRateBand.toLocaleString('en-GB')}, ${Math.round(FACTS.higherRate * 100)}% to £${FACTS.additionalRateThreshold.toLocaleString('en-GB')}, ${Math.round(FACTS.additionalRate * 100)}% above.`,
  `- Class 4 NIC: ${asPercent(FACTS.class4MainRate)}% on profits £${FACTS.class4LowerLimit.toLocaleString('en-GB')} to £${FACTS.class4UpperLimit.toLocaleString('en-GB')}, ${asPercent(FACTS.class4UpperRate)}% above. Class 2 is voluntary since April 2024 (£${FACTS.class2WeeklyRate} a week if paid).`,
  `- Trading allowance £${FACTS.tradingAllowance.toLocaleString('en-GB')}. Annual Investment Allowance £${FACTS.annualInvestmentAllowance.toLocaleString('en-GB')} (100% relief on qualifying plant).`,
  `- VAT registration at £${FACTS.vatRegistrationThreshold.toLocaleString('en-GB')} rolling 12-month turnover, deregistration £${FACTS.vatDeregistrationThreshold.toLocaleString('en-GB')}.`,
  `- Mileage (simplified): car or van ${asPence(FACTS.mileageCarFirst10k)}p first ${FACTS.mileageFirstBandMiles.toLocaleString('en-GB')} miles then ${asPence(FACTS.mileageCarOver10k)}p, motorcycle ${asPence(FACTS.mileageMotorcycle)}p. Home office flat rate £${FACTS.homeFlatRate25to50}/£${FACTS.homeFlatRate51to100}/£${FACTS.homeFlatRate101plus} a month by hours.`,
  // 🔴 THE TEST YEAR IS PART OF THE FACT, AND ITS ABSENCE MADE THE MODEL CONFIDENTLY WRONG.
  // Without it the sheet reads as a test on the income the model can see, which is this year's,
  // so asked "am I in Making Tax Digital" it answered from the running total in front of it. HMRC
  // decides from a return already filed. The last clause is what stops the model concluding at all:
  // it does not hold the man's 2024/25 return and must say so rather than guess from what it has.
  `- MTD for Income Tax thresholds: over £${FACTS.mtdThreshold2026.toLocaleString('en-GB')} for April 2026, over £${FACTS.mtdThreshold2027.toLocaleString('en-GB')} for April 2027, over £${FACTS.mtdThreshold2028.toLocaleString('en-GB')} for April 2028. Quarterly updates due 7 Aug, 7 Nov, 7 Feb, 7 May.`,
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE DEADLINE THAT EXPIRED SIX MONTHS BEFORE ANYBODY NOTICED. Found 11 August 2026, RUN 1.
  //
  // The line above used to end with the literal string "Self Assessment for 2024/25 due 31 Jan
  // 2026". It was typed in when it was true and it stayed there. On 11 August 2026 a customer
  // asked when his tax was due and was served a deadline that had passed in January, on both
  // channels, because this block is spread into the WhatsApp prompt AND accountantSystem().
  //
  // ⚠️ AND THE MODEL WAS FORBIDDEN FROM NOTICING. The rule further down this file tells it to trust
  // these figures absolutely, never to say a figure looks wrong, and never to correct itself. That
  // rule is right for a RATE and it is lethal for a DATE, because a rate goes stale loudly at the
  // Budget and a date goes stale quietly at midnight.
  //
  // So the deadline is now DERIVED FROM THE CLOCK, once, here, and there is no year literal left
  // in it to rot. The tax year that is currently being filed is the one that ended on the last 5
  // April, and its online return and payment are due on the 31 January that follows.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  `- Self Assessment deadlines, worked out from today's date and not typed in: the ${filingYearLabel()} return, for the year that ended 5 April ${filingYearEnd()}, is due online and paid by 31 January ${filingYearEnd() + 1}. Registering for the first time is due by 5 October ${filingYearEnd()}. NEVER state a Self Assessment deadline that is not in this line.`,
  // ⚠️ CIS IS THE PRODUCT'S OWN CUSTOMER AND IT HAD ONE LINE. RUN 1 asked four CIS questions and
  // got four wrong answers: the 20 and 30 garbled, arithmetic invented on a deposit that was
  // already net, "claim it ALL back", and an offer to file a registered subbie as unregistered.
  // The single line it had said 20, 30, labour only. It did not say gross status exists, it did
  // not say the deduction is TAX rather than a fee, and above all it did not say that the money
  // in his bank is NET, which is the trap every one of those answers fell into.
  `- CIS, in full, because most of our customers are in it. The contractor takes ${asPercent(FACTS.cisRegisteredRate)}% from a REGISTERED subcontractor, ${asPercent(FACTS.cisUnregisteredRate)}% from an unregistered one, and NOTHING from one with gross payment status. There are three answers, not two. The deduction comes off LABOUR ONLY, after materials, plant hire, and VAT are taken out.`,
  '- 🔴 WHAT CIS ACTUALLY IS: it is INCOME TAX, PAID EARLY, by his contractor, on his behalf. It is not a fee, not a charge, and NEVER an expense or a deduction from profit. It goes against his January bill and anything left over is repaid to him.',
  '- 🔴 THE TRAP, AND IT IS THE ONE TO GET RIGHT: THE MONEY IN HIS BANK IS ALREADY NET. A payment of £490 in his account on a job with no materials was £612.50 of labour with £122.50 taken. His TURNOVER is the gross figure, not the deposit. So NEVER work out a deduction by taking 20% off a figure he read off his bank statement: that money has already been taken once and you would be taking it twice. If you are not certain whether a figure he gives you is gross or net, ASK HIM. His contractor must give him a payment and deduction statement within 14 days of the end of each tax month, and that statement is the document that settles it.',
  '- 🔴 NEVER PROMISE A CIS REFUND, AND NEVER SAY HE GETS IT ALL BACK. Whether there is a repayment depends on his profit for the whole year against everything taken at source, so it is only ever an estimate before the return is filed, and it can be nil. And his registration status is a fact about him, not a setting: never offer to record a registered subcontractor as unregistered, or the other way round, to change a figure.',
  '- Payments on account have a SECOND test and it is the one that matters to a subcontractor: they are dropped altogether when more than 80% of the tax for the year was already deducted at source. On an ordinary CIS year that is usually met, so a subcontractor is usually excused them.',
  '- WHICH TAX RETURN DECIDES IT: HMRC tests qualifying income on a return ALREADY FILED, not the year you are in. April 2026 is decided by the 2024/25 return, April 2027 by 2025/26, April 2028 by 2026/27. HMRC then WRITES to the people it has assessed. So this year\'s figures never settle it: if he has not told us whether that letter came, say what his figures show, say HMRC decides it from the earlier return and writes to him, and ask him. Never conclude that he is or is not mandated from the running total.',
  '- No late submission penalties apply to quarterly updates for 2026/27 (HMRC transitional easement). Points based penalties start 2027/28: 4 points then £200. Never imply a fine for a missed 2026/27 update.',
  '- Profits are taxed on the tax-year basis from 2024/25. The cash basis (money in and out when it moves) is the default for small businesses; accruals counts income and costs when invoiced or incurred. Opening and closing years can create overlap, so the first and last year need care.',
  '- Payments on account: once a Self Assessment bill is over £1,000, you also make two payments on account towards next year, each half this year\'s bill, due 31 January and 31 July, on top of the balancing payment. This is the bill that surprises people.',
  `- Capital allowances: the Annual Investment Allowance gives 100% relief on most plant and machinery up to £${FACTS.annualInvestmentAllowance.toLocaleString('en-GB')}. Above that, or for cars, you claim a writing down allowance each year, ${asPercent(FACTS.wdaMainRate)}% on the main pool (reduced from 18% from April 2026), ${asPercent(FACTS.wdaSpecialRate)}% on the special rate pool (most cars, integral features).`,
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SCOTLAND, AND IT SITS IN THIS SHARED BLOCK ON PURPOSE. B2, 17 August 2026.
  //
  // This rule used to be a literal inside accountantSystem() and nowhere else. The in app
  // accountant had it and WHATSAPP, the channel he uses most, had nothing at all. Walked live on
  // a Glasgow sole trader with money in the account: asked what to put by for the taxman, the
  // thread replied that being in Scotland his rates are the same as the rest of the UK, which is
  // false. Asked the same thing again it quoted a band table with a 41% higher rate, a 46% top
  // rate and no advanced rate, which matches no year in force.
  //
  // It is the same drift the note above the WhatsApp prompt already records for the CIS rules:
  // one prompt gains a rule and the other never hears about it. The cure is the same one. Put it
  // in the block BOTH prompts spread, so there is one rule and it cannot go missing from a
  // channel.
  //
  // ⚠️ IT QUOTES SCOTLAND_LINE RATHER THAN WORDING ITS OWN. lib/scotland.ts owns what this
  // product is willing to claim about a man's tax, and its four written rules bind this sentence
  // too. The wording this replaced broke one of them outright: it sent him off to read the bands
  // on gov.scot himself, and that file says the sentence must not send him elsewhere, because
  // that is handing back the job he bought.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  `- 🔴 SCOTLAND. Income tax rates and bands above the personal allowance are devolved to the Scottish Parliament, and every income tax figure above is the England, Wales and Northern Ireland one. If he tells you he is in Scotland, or asks about Scottish rates, say exactly this about the rates and nothing further: "${SCOTLAND_LINE}" NEVER state a Scottish rate, band, threshold or percentage, not even to compare it with these ones, and NEVER say that Scotland is the same as the rest of the UK, because it is not. National Insurance, VAT and student loan plans ARE the same across the UK, so answer those normally.`,
  ];
}

// The limited-company figures, taken from the LTD engine so they track it, spread into the WhatsApp
// money answer alongside TAX_FACTS_2627 so a company director gets a real answer instead of "that is
// outside my wheelhouse" (caught live on the 21 Jul flood).
function ltdFacts2627(): string[] {
  return [
  '- Limited company: the company pays Corporation Tax on its profit, 19% up to £50,000, 25% above £250,000, with marginal relief between (about 26.5% on the slice). A director usually takes a small salary plus dividends.',
  `- Dividends are paid from post-Corporation-Tax profit and taxed on the person: a £${LTD.dividendAllowance.toLocaleString('en-GB')} allowance at 0%, then ${asPercent(LTD.dividendBasic)}% basic, ${asPercent(LTD.dividendHigher)}% higher, ${asPercent(LTD.dividendAdditional)}% additional. A dividend needs distributable profit; taking more is a director's loan with a 33.75% charge if it is unpaid nine months after the year end.`,
  ];
}

function accountantSystem(): string {
  return [
  'You are Lekhio, a bookkeeping assistant for a UK self employed person (sole traders, subcontractors, freelancers, and small trades).',
  // 🔴 B27's SWEEP, 18 AUGUST 2026. THIS LINE NAMED FOUR REGULATED BODIES WE ARE NOT MEMBERS OF.
  // It read "built on the rules taught in the leading tax and accountancy qualifications (ACCA,
  // ICAEW, CIOT, AAT)". A model told that can paraphrase it into "I am trained to ACCA standard"
  // on a customer's screen, which reads as affiliation, and it sat three words under a line that
  // called this prompt "the in-app accountant". Same family, same fix. Nothing is lost: the job of
  // the sentence was "be specific", and the half that says so is still here.
  // ⚠️ MEASURED, AND IT IS WHY THIS WAS NEVER A LIVE INCIDENT: /api/ask has exactly ONE caller in
  // the whole estate, the phone's Ask box, and the phone channel is blocked by J1. Zero customers.
  'You know UK self employed tax and bookkeeping thoroughly. Give real, specific, accurate answers, not vague hand-waving.',
  '',
  'Use these 2026/27 figures, England, Wales and Northern Ireland. Do not invent or guess figures.',
  ...taxFacts2627(),
  '',
  'BUSINESS STRUCTURE matters, and the user profile below tells you which one applies. Answer for THEIR structure, not sole-trader rules by default.',
  '- SOLE TRADER: no separate business return. The trade goes on their own Self Assessment (SA103). Income tax and Class 4 NIC on the profit, as above. One return, one bill.',
  '- LIMITED COMPANY: the company is a separate taxpayer. It files a Corporation Tax return (CT600) and pays corporation tax on its profit (19% up to £50,000 of profit, 25% above £250,000, with marginal relief in between, an effective rate of about 26.5% on the slice between). Salary the company pays a director is a deductible cost; most directors take a small salary around the £' + FACTS.personalAllowance.toLocaleString('en-GB') + ' personal allowance. Dividends are paid from POST-corporation-tax profit and are taxed on the person: a £' + LTD.dividendAllowance.toLocaleString('en-GB') + ' dividend allowance at 0%, then ' + (asPercent(LTD.dividendBasic)) + '% (basic), ' + (asPercent(LTD.dividendHigher)) + '% (higher), ' + (asPercent(LTD.dividendAdditional)) + '% (additional). A dividend can only be paid from distributable profit (Companies Act 2006 s830); taking more is a director\'s loan with a 33.75% s455 charge if unpaid nine months after the year end. So a company owner has TWO returns: the company\'s CT600 and their own SA100. Weigh both together.',
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
  '- The figures above are the current, in force 2026/27 rates. State each one directly as the present figure. Do NOT show your working, do NOT correct yourself in the reply, and never say a rate looks wrong, is being redone, used to be different, or reference an older value. If a figure differs from one you half remember, trust the figure above: it is the one in force. Give the final answer plainly and confidently.',
  '- For things that genuinely need a qualified professional (complex capital gains, inheritance tax, company restructuring, HMRC disputes or investigations, anything legal), give the general picture then recommend they speak to a qualified accountant or adviser.',
  '- Never imply HMRC endorses Lekhio, and never say Lekhio files or submits their tax. HMRC approves no software. Lekhio prepares figures; the user approves; the user stays responsible to HMRC.',
  // 🔴 B27, 18 AUGUST 2026. The same rule as the seventh on the WhatsApp lane, and it belongs here
  // for the same reason: this prompt opened by calling itself "the in-app accountant". It carries
  // NO photograph sentence, and that is measured rather than forgotten. Its only caller in the
  // whole estate is tradebook-app/app/accountant.tsx, the phone's Ask box, which is text only.
  // That one clause is the entire difference between this prompt and the WhatsApp one.
  '- Never call Lekhio their accountant, their adviser or their agent, because it is none of those things. Lekhio is bookkeeping and tax software: it prepares their figures, they approve them, and they stay responsible to HMRC.',
  '- Never promise or state a number for the tax Lekhio has saved or will save them, theirs or anyone else\'s. What anyone saves depends on what they spend and what the rules allow. Their Tax screen already shows what their own confirmed figures have added up to.',
  '- Do not give personalised investment or pension product advice. You can explain how tax relief works in general.',
  '',
  'Style: plain English, warm and direct, the way a good bookkeeper talks to a tradesperson. Use the £ sign. Short paragraphs or a few steps. Be complete but do not waffle.',
  'Format: plain text only. Do not use any markdown. No bold, no asterisks, no headers, no hash symbols. The app shows your reply as plain text, so any markdown symbols appear on screen as literal characters. A short list may start lines with a simple hyphen and a space.',
  'Never use an em dash or an en dash, and never use a hyphen as a sentence dash. Use a full stop or a comma instead. For a number range use the word to, for example £12,570 to £50,270. For subtraction write minus or less, not a dash. Keep hyphens only for hyphenated words and simple list bullets.',
  ].join('\n');
}

// Answer a free-text accountant question. `context` is an optional compact summary
// of the user\'s own figures, so money questions get real numbers. Returns the
// answer text, or null on failure.
export async function answerAccountantQuestion(question: string, context?: string, knowledge?: string, profile?: string, history?: string): Promise<string | null> {
  if (!ready() || !KEY) return null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE QUESTION WAS THE FIRST THING THE CAP THREW AWAY. Fixed 6 August 2026.
  //
  // The turn used to be assembled knowledge, then figures, then profile, then history, and only
  // then "My question: ...", and the whole thing was sent as userContent.slice(0, 4000). slice
  // cuts from the END. So the last section was the one that went, and the last section was the
  // customer's actual question.
  //
  // It held while accounts were small. At roughly ninety transactions the figures block alone
  // spends the budget, and past that the model receives a wall of numbers with nothing asked of
  // it. It does the only thing it can and reads the numbers back. On screen that is not an error
  // anybody can see: he asked what mileage he can claim, he got a list of his own spending, and
  // there is nothing to tell him his question was never delivered.
  //
  // So the question goes FIRST and is never trimmed. The context sections are then fitted into
  // what is left, in priority order, and the figures block is put LAST because it is the only one
  // that grows without limit, so it is the one that should absorb the shortfall. Putting it back
  // where it used to sit would starve the profile block, which is three lines long and decides
  // whether he is answered as a company director or a sole trader. It is cut on whole lines so the
  // model never reads half a number. The total stays bounded exactly as before.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const MAX_USER_CHARS = 4000;
  // The question is capped too, so the bound holds even if somebody pastes an essay, but the cap
  // is generous enough that every real question survives whole and there is always room left for
  // the figures underneath it.
  const MAX_QUESTION_CHARS = 2000;
  const questionBlock = `My question: ${String(question || '').slice(0, MAX_QUESTION_CHARS)}`;

  const sections = [
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
    // Their structure and income mix, so a company director gets company answers, not sole-trader ones.
    profile ? `About me (answer for THIS structure, not sole-trader rules by default):\n${profile}\n` : '',
    // The pocket: how key tax figures have changed over time, so "what was the rate before / when did
    // it change" is answered from Khoji's memory rather than guessed. Each line is old value, new value,
    // and the date it took effect.
    history ? `How key figures have changed over time (only use if the question is about a past or changed figure):\n${history}\n` : '',
    // Last on purpose: see the note above. This is the block that has no ceiling, so this is the
    // block that gives way when an account has years of rows behind it.
    context ? `My recent figures (newest first, pounds):\n${context}\n` : '',
  ].filter((s): s is string => Boolean(s));

  // Fit what is left. A section that does not fit whole is cut back to whole lines, and once the
  // room is gone the rest is dropped rather than half sent.
  const parts = [questionBlock];
  let room = MAX_USER_CHARS - questionBlock.length;
  for (const section of sections) {
    if (section.length + 1 <= room) {
      parts.push(section);
      room -= section.length + 1;
      continue;
    }
    const kept: string[] = [];
    let used = 1; // the newline that joins this section to the one before it
    for (const line of section.split('\n')) {
      if (used + line.length + 1 > room) break;
      kept.push(line);
      used += line.length + 1;
    }
    if (kept.length > 0) {
      parts.push(kept.join('\n'));
      room -= used;
    }
    break;
  }
  const userContent = parts.join('\n');

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
        system: [{ type: 'text', text: accountantSystem(), cache_control: { type: 'ephemeral' } }],
        // Already bounded by construction above, with the question at the front. The slice stays
        // as a belt and braces on the total and must never be the thing that decides what is cut.
        messages: [{ role: 'user', content: userContent.slice(0, MAX_USER_CHARS) }],
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
  const data = await readClaudeReply(res, 'accountant');
  if (!data) return null;
  logUsage('accountant', data);
  // Join every text block, not just the first. A reasoning model can return a
  // thinking block before the text, so find-first could miss the answer. Ignore
  // non text blocks and stitch any text together.
  const textBlock = (data.content || [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('')
    .trim();
  return finishAnswer(textBlock ? textBlock : null, data);
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
    // 🔴 RUN 2, 12 August 2026: "half 7 in the morning" came back as 06:30. British English means
    // half PAST, so half seven is 07:30. lib/waintents.ts normaliseBritishTime rewrites these
    // before this prompt is built and is the real guard; this line is the second lock.
    'This is British English. "half seven" means 07:30, never 06:30. "quarter past eight" is 08:15 and "quarter to nine" is 08:45.',
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
  const data = await readClaudeReply(res, 'schedule_parse');
  if (!data) return null;
  logUsage('schedule_parse', data);

  // B43. A cut parse is refused, never guessed at. See THE FLAG THAT NOBODY READ above.
  if (refuseIfCut(data, 'schedule_parse')) return null;
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
