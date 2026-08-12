// Deterministic WhatsApp intent logic. Pure functions only: no Next.js, no
// network, no database, so every matcher and parser here is unit tested in
// test/waintents.test.mjs and runs identically in the webhook.
//
// THE INTENT MAP. The webhook tries these deterministic intents first and only
// falls through to AI when nothing matches and AI is switched on. Order matters
// and is enforced in app/api/whatsapp/route.ts:
//   1. Invoice flow, tax guide flow (session based, handled in the route)
//   2. Get started and greetings          -> welcome (no AI)
//   3. Thanks                             -> short ack (no AI)
//   4. Bare yes / no / ok                 -> pointer to confirm in the app (no AI)
//   5. Stop / start nudges                -> reminder_prefs write (no AI)
//   6. Delete or edit the last entry      -> unconfirmed entries only (no AI)
//   7. CIS, mileage, home office, phone share, typed money -> log (no AI)
//   8. Schedule / reminders               -> AI for the time parse only
//   9. Help, tax tips, expense checker    -> knowledge base (no AI)
//  10. Pricing, who are you               -> static answers (no AI)
//  11. Tax deadline questions             -> computed answer (no AI)
//  12. Balance and totals questions       -> computed from own rows (no AI)
//  13. Open ended money or tax questions  -> AI, budget capped
//  14. Anything else                      -> AI entry parse, budget capped
//
// Writing rule: no em dashes, no en dashes anywhere, including replies.

// ⚠️ THE ONLY IMPORT IN THIS FILE IS A TYPE, AND IT HAS TO STAY THAT WAY. Node strips it before
// resolution, so the module still loads on its own: test/invoicesweb.test.mjs stages this file
// alone in a temp directory to put the REAL chaser voice on the bench, and test/numbers.test.mjs
// sweeps every answer it renders. A value import would break both. See deadlineAnswer below for
// why the mandation DECISION stays in lib/taxengine.ts while the type comes here.
import type { MtdPosition } from './taxengine';

// --- Amounts ----------------------------------------------------------------
// Accepts "£1,200.50", "1200", "£1.2k", "2k". Rejects zero, negatives and
// anything over a million (fat finger guard).
export function extractMoneyAmount(b: string): number | null {
  const k = b.match(/£?\s*(\d+(?:\.\d{1,2})?)\s*k\b/i);
  if (k) {
    const n = parseFloat(k[1]) * 1000;
    return Number.isFinite(n) && n > 0 && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
  }
  const m = b.match(/£\s*(\d[\d,]*(?:\.\d{1,2})?)/) || b.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/);
  if (!m) return null;
  const n = parseFloat((m[1] || '').replace(/,/g, ''));
  if (!isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

// Amounts written with a pound sign, commas allowed. Used by the CIS and phone
// share handlers, which previously dropped thousands separators ("£1,200" read
// as £1).
export function poundAmounts(b: string): number[] {
  return [...b.matchAll(/£\s*(\d[\d,]*(?:\.\d{1,2})?)/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// Money amounts with the pound sign OPTIONAL, because people rarely type it,
// and our own examples omit it ("Dave paid 500, 100 CIS held"). It skips a
// number that is a percentage (the "20" in "20%") and never matches mid number,
// so "500, 100" gives [500, 100] and "20%" gives nothing.
export function moneyAmounts(b: string): number[] {
  return [...b.matchAll(/(?<![\d.])£?\s*(\d[\d,]*(?:\.\d{1,2})?)\b(?!\s*%)/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// --- Typed money entries -----------------------------------------------------
export type ParsedEntry = {
  merchant_name: string;
  amount: number;
  category: string;
  direction: 'income' | 'expense';
};

const MONEY_INCOME_RE = /\b(got\s+paid|getting\s+paid|paid\s+me|earned|earnt|invoiced?|takings?|took|made|charged?)\b/i;
const MONEY_EXPENSE_RE = /\b(spent|spend|bought|buy|buying|paid\s+for|paying\s+for|refunded?)\b/i;

function tidyName(s: string): string {
  return s
    .replace(/\b(today|yesterday|this morning|this afternoon|just now|earlier|please|thanks|ta|mate)\b.*$/i, '')
    .trim()
    // 🔴 THE NAME ENDS WHERE THE NEXT CLAUSE BEGINS.
    //
    // The capture class in parseMoneyEntryRegex INCLUDES SPACES on purpose, because real merchants
    // have them: "travis perkins", "b & q", "screwfix direct". The price of that is a greedy match
    // that runs straight through the next preposition and keeps going.
    //
    // "bought a drill from screwfix for £129" was filed under the merchant name "screwfix for", and
    // the reply to the customer read "screwfix for for £129.00". Chasing that one turned up the
    // bigger version of the same fault: "spent £80 at travis perkins for cement" was being filed
    // under "travis perkins for cement". Not cosmetic. The merchant name is what he searches his own
    // books by at year end, and what an inspector reads back to him.
    //
    // So the name is cut at the FIRST preposition, not just a trailing one.
    //
    // ⚠️ "and" IS DELIBERATELY NOT IN THIS LIST. Cutting on it would turn "bath and body works" into
    // "bath", and "b and q" into "b". A fix that mangles real shop names to tidy up a parse is a
    // worse bug than the one it replaces.
    //
    // Found on 27 Jul 2026 by the WhatsApp end to end test, on a live number, sending the messages a
    // real customer would actually send. No unit test caught it because every fixture in
    // test/waintents.test.mjs used a SINGLE WORD merchant. That gap is the lesson, not the regex.
    .replace(/\s+\b(?:for|on|at|in|from|to|with)\b.*$/i, '')
    .replace(/[.,!]+$/, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .slice(0, 40);
}

const EXPENSE_CATEGORY: Array<[RegExp, string]> = [
  [/\b(diesel|petrol|fuel|unleaded)\b/i, 'fuel'],
  [/\b(screwfix|toolstation|wickes|b ?& ?q|jewson|travis perkins|selco|materials?|cement|timber|cable|paint|tiles?|pipe|fittings|adhesive|plaster|sand|aggregate|screws?)\b/i, 'materials'],
  [/\b(drill|tool|tools|saw|grinder|impact|battery|blade|disc)\b/i, 'tools'],
  [/\b(insurance|liability)\b/i, 'insurance'],
  [/\b(phone|mobile|airtime|sim)\b/i, 'phone'],
  [/\b(parking|congestion|toll|train|bus)\b/i, 'travel'],
  [/\b(van|vehicle|mot|tyres?)\b/i, 'van'],
  [/\b(food|lunch|dinner|meal|coffee)\b/i, 'meals'],
];

export function expenseCategory(b: string): string {
  for (const [re, cat] of EXPENSE_CATEGORY) if (re.test(b)) return cat;
  return 'other';
}

export function parseMoneyEntryRegex(body: string): ParsedEntry | null {
  const b = body.trim();
  if (!b || b.endsWith('?')) return null;
  // Looks like a question, not an entry.
  if (/^(how|what|whats|when|where|why|who|show|list|total|do i|did i|am i|have i|can i|could i|is it|are )/i.test(b)) return null;

  // "<name> paid [me] £X" = someone paid the user = income. Exclude first person
  // ("I paid", "we paid") which is an expense. Captures the payer's name too.
  const subjectPaid = b.match(/\b([a-z][a-z'&.\- ]{1,30}?)\s+paid\b(?!\s+for)/i);
  const subjectIsPayer = !!subjectPaid && !/^(i|we|you|ive|weve|i ve|we ve)$/i.test(subjectPaid[1].trim());

  // "refund" language: a refund received is money back in, but it corrects an
  // expense, so we book it as a negative expense... which is income shaped. Keep
  // it simple and honest: "got a refund" logs as income named refund.
  const refundIn = /\b(got|received|had)\b.*\brefund/i.test(b);

  const incomeVerb =
    refundIn || MONEY_INCOME_RE.test(b) || /\bpaid\b[^?]*\b(by|from)\b/i.test(b) || subjectIsPayer;
  const expenseVerb = !incomeVerb && (MONEY_EXPENSE_RE.test(b) || /\bpaid\b/i.test(b));
  if (!incomeVerb && !expenseVerb) return null;

  const amount = extractMoneyAmount(b);
  if (amount == null) return null;

  if (incomeVerb) {
    const byFrom = b.match(/\b(?:by|from)\s+([a-z0-9'&\- ]{2,40})/i);
    const who =
      (byFrom ? tidyName(byFrom[1]) : subjectIsPayer ? tidyName(subjectPaid![1]) : '') ||
      (refundIn ? 'Refund' : 'a customer');
    return { merchant_name: who, amount, category: 'income', direction: 'income' };
  }
  const m = b.match(/\b(?:on|at|in|for|from)\s+([a-z0-9'&\- ]{2,40})/i);
  const what = m ? tidyName(m[1]) : '';
  const category = expenseCategory(b);
  const name = what || (category !== 'other' ? category : 'an expense');
  return { merchant_name: name, amount, category, direction: 'expense' };
}

// The date a typed or spoken entry belongs to. "yesterday" is the one relative
// day people actually text; everything else defaults to today. Returns YYYY-MM-DD.
export function entryDate(rawText: string, now: Date = new Date()): string {
  const d = new Date(now);
  if (/\byesterday\b/i.test(rawText)) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Clamp a receipt date parsed by vision: not in the future, not older than two
// years. Anything outside that range is almost certainly a misread, so fall back
// to today rather than filing income or an expense into the wrong year.
export function clampReceiptDate(dateStr: string | null | undefined, now: Date = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return today;
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return today;
  const min = new Date(now);
  min.setFullYear(min.getFullYear() - 2);
  if (d.getTime() > now.getTime() || d.getTime() < min.getTime()) return today;
  return dateStr;
}

// --- Small talk and acks ------------------------------------------------------
export function isThanks(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  return /^(thanks|thank you|thanks a lot|thanks mate|cheers|nice one|ta|perfect|brilliant|great|lovely|sorted|good stuff|top man|legend)$/.test(t);
}

// A bare yes, a bare no, or a friendly noise.
//
// THE THREE ARE NOT THE SAME THING, AND TREATING THEM AS THE SAME WAS A REAL BUG.
//
// "yes" used to include ok, k, sure, fine, done, will do, sounds good and 👍. All of
// those were then routed into confirming the user's books. So a man who replied 👍 to
// "Logged. Screwfix, £84.30" was silently approving every unconfirmed entry in his
// account, including months of bank lines he had never laid eyes on.
//
// Approving things you were never shown is not an approval gate. It is the opposite
// of one.
//
// So a friendly noise is now its own thing. It gets a friendly answer and changes
// NOTHING. Only an explicit, unambiguous yes files anything.
export function matchAck(body: string): 'yes' | 'no' | 'ack' | null {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');

  // Explicit. He means it.
  if (/^(yes|y|yep|yeah|yea|confirm|confirmed|correct|aye|thats right|all good)$/.test(t)) return 'yes';
  if (/^(no|n|nope|nah|not yet|dont|don't|wrong)$/.test(t)) return 'no';

  // A noise, not a decision. "ok", "cheers", "👍". Answer him. Change nothing.
  if (/^(ok|okay|k|kk|sure|fine|done|will do|👍|👌|ta|cheers|nice|sound|sounds good|lovely|great)$/.test(t)) return 'ack';

  return null;
}

// --- Opting out of and back into the nudge texts ------------------------------
export function matchStopStart(body: string): 'stop' | 'start' | null {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  if (/^(stop|unsubscribe|opt out|stop texting me|stop messaging me|stop the reminders|stop reminders|no more reminders|leave me alone|mute)$/.test(t)) return 'stop';
  if (/^(start|resume|opt in|start reminders|turn reminders (back )?on|unmute)$/.test(t)) return 'start';
  return null;
}

// --- The words the product itself hands out ------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A WORD WE TELL A CUSTOMER TO SEND BACK, WITH NOBODY OWNING IT INBOUND, IS A DEAD END. WE
// SHIPPED ONE, AND IT WAS THE ONE ROAD OUT OF A REFUSAL.
//
// 11 August 2026, found by walking production. A customer tried to connect his WhatsApp number. It
// was already bound to another and by then abandoned account, so bindingVerdict() returned 'taken'
// and lib/walink.ts answered him in our own words:
//
//   "This number is already connected to a Lekhio account, so we have not changed anything. If that
//    is not you, reply SUPPORT and a person will look at it."
//
// He replied SUPPORT.
//
// isSupportRequest() below did not match it. Its five regexes are deliberately specific and every
// one of them wants a SENTENCE: "let me speak to a human", "this is broken", "I want a refund".
// None of them covers the single token the product had just put in his hand. So SUPPORT fell
// through roughly forty text branches in app/api/whatsapp/route.ts and landed on handleTextEntry,
// THE RECEIPT AND EXPENSE PARSER, which set about booking the word as a transaction. The only road
// out of the refusal was a dead end, and there were no words at all he could have sent to free his
// own number.
//
// The same walk found the hole open in three more places, all of them the same shape:
//
//   . alwaysAnswered() in the webhook asks isSupportRequest(), so a read only or lapsed customer
//     who texted SUPPORT failed the always answered list and got the paywall line back. A paywall
//     may never be the thing that answers a cry for help.
//   . Bare START was tested by isGetStarted() four branches ABOVE matchStopStart(), and its regex
//     carried the word, so the exact token the STOP reply promises ("you can text START any time to
//     switch them back on") reached the welcome card and never re-enabled a single nudge.
//   . handleInvoiceFlow() and handleTaxGuideFlow() both run above matchStopStart() and both read a
//     bare "stop" as "cancel this flow". A man who texted STOP in the middle of an invoice believed
//     he had opted out, and his reminder_prefs row was never touched. Meta requires STOP to mean
//     STOP, so that one is not merely rude.
//
// ⚠️ AND test/waintents.test.mjs WAS GREEN THROUGH ALL OF IT, because it asserts
// matchStopStart('start reminders'), the two word form, which the predicate has always got right.
// A predicate returning the correct answer proves nothing about whether the router ever calls it.
//
// SO THE WORDS ARE A REGISTRY, AND THE REGISTRY IS THE SINGLE SOURCE OF TRUTH. Each entry names the
// handler that owns the word inbound and quotes the copy that hands it out, so a word cannot be put
// in front of a customer without somebody's name against it. test/reservedwords.test.mjs reads the
// outbound copy off disk, pulls out every word we tell him to reply with, and goes red on any one
// of them this matcher does not recognise. That is the guard that would have caught 11 August.
//
// ⚠️ THE MATCH IS ANCHORED, AND THAT IS THE WHOLE JUDGEMENT IN IT. A BARE WORD IS AN INSTRUCTION
// AND A SENTENCE IS NOT. "stop" is a man opting out. "stop the invoice" is a man cancelling one
// step of one flow, and dispatching that as an opt out would turn a flow he abandoned into
// reminders he never asked us to switch off. So the whole message has to BE the word, allowing for
// the spaces and the full stop his keyboard adds and for any case he shouts it in.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type ReservedWord = 'SUPPORT' | 'STOP' | 'START';

export interface ReservedWordRule {
  // Printed in capitals, because that is how the copy hands it to him and how he sends it back.
  word: ReservedWord;
  // The handler in app/api/whatsapp/route.ts that must receive it. A word with no owner is the bug.
  owner: string;
  // The sentence of ours that puts the word in his hand, so the reason it is reserved is readable.
  handedOutBy: string;
}

export const RESERVED_WORDS: ReadonlyArray<ReservedWordRule> = [
  {
    word: 'SUPPORT',
    owner: 'handleSupportRequest',
    handedOutBy: "linkMessage('taken') in lib/walink.ts: reply SUPPORT and a person will look at it",
  },
  {
    word: 'STOP',
    owner: 'handleStopStart',
    // Nothing of ours prints STOP today, and it stays reserved anyway. It is the one word every
    // customer on earth already knows, Meta requires it to work on this channel, and the day
    // somebody writes it into a nudge the owner is already here.
    handedOutBy: 'the word every customer already knows, and the one Meta obliges us to honour',
  },
  {
    word: 'START',
    owner: 'handleStopStart',
    handedOutBy: 'handleStopStart in the webhook: you can text START any time to switch them back on',
  },
];

// ⚠️ THE WORDS THAT ARE ONLY OFFERED INSIDE A FLOW, AND ARE OWNED BY THAT FLOW RATHER THAN GLOBALLY.
//
// SEND, CHANGE, SKIP and NEXT are also words we tell a customer to reply with, and they are NOT
// reserved, because they only mean anything while the question that offered them is still open.
// Reserving SEND would take the word out of the invoice approval step, which is the one place in
// the product where a customer's reply puts a document in front of another human being.
//
// They are written down anyway, and test/reservedwords.test.mjs holds each of them to a real
// anchored regex in the router that actually matches the bare word. So this list cannot be used as
// a quiet exemption for a word nothing on earth handles: it is a second kind of owner, not a
// second kind of nobody.
export interface FlowWordRule {
  word: string;
  flow: string;
  owner: string;
}

export const FLOW_WORDS: ReadonlyArray<FlowWordRule> = [
  { word: 'SEND', flow: 'invoice', owner: "the confirm step of handleInvoiceFlow" },
  { word: 'CHANGE', flow: 'invoice', owner: "the confirm step of handleInvoiceFlow" },
  { word: 'SKIP', flow: 'taxguide', owner: 'TAXGUIDE_SKIP' },
  { word: 'NEXT', flow: 'taxguide', owner: 'TAXGUIDE_NEXT' },
];

// Anchored. The whole message is the word, or it is not a reserved word at all. Trailing punctuation
// goes because a phone adds it, and the case goes because he is shouting it, which is the point.
export function matchReservedWord(body: string): ReservedWord | null {
  const t = String(body || '').trim().toLowerCase().replace(/[.,!?;:\s]+$/, '');
  if (!t) return null;
  const hit = RESERVED_WORDS.find((r) => r.word.toLowerCase() === t);
  return hit ? hit.word : null;
}

export function isReservedWord(body: string): boolean {
  return matchReservedWord(body) !== null;
}

// --- Fixing the last entry -----------------------------------------------------
export function isDeleteLast(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.?\s]+$/, '');
  return /^(delete( that| it| the last one| last)?|undo( that| it)?|remove (that|it|the last one)|scrap (that|it)|that('?s| is) wrong|wrong,? delete( it| that)?|cancel that entry)$/.test(t);
}

export function matchEditLast(body: string): { amount: number } | null {
  const t = body.trim();
  const m = t.match(/^(?:no,?\s*)?(?:change|make|edit|correct)\s+(?:that|it|the last one)?\s*(?:to|was)?\s*£?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:quid|pounds?)?\s*[.!]?$/i)
    || t.match(/^(?:that|it)\s+(?:was|should be)\s+£?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:quid|pounds?)?\s*[.!]?$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return { amount: n };
}

// --- Static answers -------------------------------------------------------------
export function isPricing(body: string): boolean {
  const b = body.trim();
  if (/£\s*\d/.test(b)) return false;
  return /\b(how much (do|does|is) (you|it|this|lekhio|the app|the service)|what (do|does) (you|it|lekhio) cost|price|pricing|subscription|monthly fee|is (it|this|lekhio) free|cost of (the app|lekhio))\b/i.test(b)
    && !/\b(spen[dt]|owe|tax|made|earn)/i.test(b);
}

export function isIdentity(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.?\s]+$/, '');
  return /^(who are you|who is this|what are you|what is this|are you a (bot|robot|person|human)|is this a bot|am i talking to a (bot|robot|human|person)|what is lekhio|who('?s| is) lekhio)$/.test(t);
}


// --- Questions about Lekhio itself: filing, approval, promised savings --------------------------
//
// Found live on 6 August 2026, the final launch walk. "Are you HMRC approved software or not?"
// hit the claim rulebook on the word "software" and came back "\u2705 ... Yes", which reads, in a
// screenshot, like a yes to the approval question. "Do you file my tax return for me?" carried
// "tax" and "my", hit the totals lane, and was answered with the set aside figure. "How much tax
// will you save me?" did the same. Three questions about LEKHIO answered as questions about HIS
// BOOKS, and two of them are questions the compliance docs oblige us to answer plainly.
//
// So questions about the product are matched FIRST, deterministically, and answered with fixed
// words that are true: we prepare, he approves, HMRC approves nobody, and nobody can promise a
// saving. The matcher requires the product to be the subject ("you", "lekhio", "this app"), so
// "can I claim software" still reaches the claim rulebook and "what do I owe" still reaches the
// totals lane. Timing questions ("when is it due") are left for deadlineAnswer, which knows.
export type ProductTruthKind = 'approved' | 'files' | 'savings' | 'concealment' | 'investment';

const PRODUCT_SUBJECT = /\b(you|your|lekhio|this app|this software|the app)\b/;

export function matchProductTruth(body: string): ProductTruthKind | null {
  const b = (body || '').toLowerCase().trim();
  if (!b || b.length > 220) return null;
  // "can you keep that income out of the books", "hide this from hmrc", "don't declare the cash
  // job". An ask to CONCEAL, refused before the totals lane can answer it with a figure (found
  // live, 6 August 2026). "how do I declare cash in hand" and a logged "cash in hand £200 from
  // dave" carry no concealment verb and stay in their own lanes.
  //
  // ⚠️ AND THE STRONG SIGNAL IS NOT HOW A REAL CUSTOMER ASKS. Widened 6 August 2026, on the launch
  // walk. Nobody types "conceal my income". A man testing the water types "can I just not put the
  // cash jobs through", "can I pay myself cash to avoid tax", "do I really need to declare cash
  // jobs", "is it ok to leave a small job off". All four are the same question wearing a polite
  // face, all four returned null, and null meant the totals lane answered a question about evasion
  // with his set aside figure. So the shy phrasings are matched too, each one kept tight enough that
  // the honest neighbour it sits next to still reaches its own lane: "how do I declare cash in hand"
  // is a how, not a whether, and "do I need to declare my rental income" names income rather than a
  // cash job, so neither is caught here.
  const CONCEALING: RegExp[] = [
    /\b(hide|hiding|conceal)\b[^.?!]{0,40}\b(income|cash|money|earnings|job|jobs|it|this|that)\b/,
    /\b(keep|leave|leaving)\b[^.?!]{0,30}\b(out of|off)\b[^.?!]{0,20}\b(books|records|return|figures)\b/,
    /\boff the books\b/,
    /\bunder the table\b/,
    /\b(not|don'?t|never)\s+(declare|report|tell)\b[^.?!]{0,30}\b(hmrc|income|cash|taxman|tax man)\b/,
    // "can I just not put the cash jobs through", "don't run it through the books".
    /\b(not|never|avoid|without)\b[^.?!]{0,15}\b(put|putting|run|running|push|pushing)\b[^.?!]{0,30}\b(through|in the books|on the books)\b/,
    // "can I pay myself cash to avoid tax", "how do I get around the vat".
    /\b(avoid|avoiding|dodge|dodging|get out of|get around|getting around|skip|skipping|duck)\b[^.?!]{0,20}\b(tax|taxes|vat|the taxman|the tax man|hmrc)\b/,
    // "do I really need to declare cash jobs". A whether, not a how, and about a cash job rather
    // than a named source of income, so the ordinary "how do I declare cash in hand" stays put.
    /\bi\s+(really\s+|actually\s+|even\s+)?(need|have)\s+to\s+(declare|report|put|include|show)\b[^.?!]{0,30}\b(cash|job|jobs|it|that|this|everything|small|little)\b/,
    // "is it ok to leave a small job off", where the thing left off is named but the books are not.
    /\b(keep|keeping|leave|leaving)\b[^.?!]{0,25}\b(job|jobs|income|cash|money|earnings|takings|invoice|payment|it|that|this|one|some)\b[^.?!]{0,15}\b(off|out)\b/,
  ];
  if (CONCEALING.some((re) => re.test(b))) return 'concealment';

  // A request to be told what to invest in. Lekhio is not a financial adviser, and until 6 August
  // 2026 "should I put my refund into Bitcoin, which stock should I buy" carried the word tax, hit
  // the totals lane, and was answered with the set aside figure. An asset word plus a buy or a
  // "should I" is the ask; a plain "how is my tax refund worked out" carries neither and stays a
  // real question.
  const assetWord = /\b(bitcoin|crypto|cryptocurrency|ethereum|shares?|stocks?|equit(y|ies)|forex|gold|an? isa|premium bonds?|invest\w*|portfolio)\b/;
  const adviceShape = /\b(should i|shall i|which|worth (it|buying|holding)|good (idea|investment|buy|bet|time)|is \w+ (a )?good|buy|sell|invest\w*|put (my|the|it|some)|move (my|it|the)|recommend)\b/;
  if (assetWord.test(b) && adviceShape.test(b)) return 'investment';

  if (!PRODUCT_SUBJECT.test(b)) return null;
  // A timing question is a deadline question, and deadlineAnswer knows the actual dates.
  if (/\b(when|deadline|due|by what date)\b/.test(b)) return null;

  // "are you hmrc approved", "is lekhio endorsed by the government", "are you government
  // software". Not "hmrc approved my refund": that is his refund, not us.
  const officialdom = /\b(hmrc|government|govuk|gov uk|taxman|tax man|tax office)\b/;
  // ⚠️ THE BARE VERB WAS MISSING. "did hmrc approve you" is the shortest way anybody asks this and
  // it returned null, because the list held approved, approval and approves but not "approve"
  // itself. Adding it is safe: hisOwn below still keeps "hmrc approved my refund" out, and the
  // PRODUCT_SUBJECT gate above means the word only counts when the product is who is being asked
  // about.
  const blessing = /\b(approve|approved|approval|approves|endorse|endorsed|endorses|endorsement|accredited|accreditation|certified|certification|recognised|recognized|recognition|authorised|authorized|licensed|licenced|vetted|official)\b/;
  const hisOwn = /\b(approv|endors|recognis|recogniz|authoris|authoriz)\w*\s+(my|our)\b/;
  if (officialdom.test(b) && !hisOwn.test(b)) {
    if (blessing.test(b)) return 'approved';
    if (/\b(government|official|hmrc('s)?)\b[^.?!]{0,30}\b(software|app|tool|service|scheme|system)\b/.test(b)) return 'approved';
  }

  // "do you file my tax return", "will lekhio submit my vat", "will you do my tax return".
  // Not "how much tax do you reckon I owe": no filing verb, so the totals lane keeps it.
  // ⚠️ TWO WAYS OF ASKING WERE MISSING, AND BOTH ARE ORDINARY ENGLISH.
  //
  // The subject list read you|lekhio|it|this while PRODUCT_SUBJECT above already counted "the app",
  // so "does the app submit to hmrc" and "will the app do my tax return" passed the subject gate and
  // then failed the question gate. And a man who thinks he already knows the answer does not ask a
  // question at all: "so you file everything with hmrc for me right" has no head verb, so the whole
  // shape missed it. Both now match, and the answer is the same fixed No either way.
  const asksTheProduct = /\b(do|does|will|would|can|could|are|is)\s+(you|lekhio|it|this|the app|this app|the software|this software)\b/;
  // The declarative form: subject then verb, no question word in front of it.
  const productDoes = /\b(you|lekhio|it|the app|this app|the software|this software)\s+(file|files|submit|submits|send|sends|lodge|lodges|do|does|sort|sorts|handle|handles)\b/;
  if (asksTheProduct.test(b) || productDoes.test(b)) {
    const filingVerb = /\b(file|files|filed|filing|submit|submits|submitted|submitting|send|sends|sending|lodge|lodges|lodging)\b/;
    const filingObject = /\b(tax|return|returns|self assessment|assessment|mtd|vat|update|updates|hmrc)\b/;
    if (filingVerb.test(b) && filingObject.test(b)) return 'files';
    if (/\b(do|doing|sort|sorts|handle|handles)\b[^.?!]{0,20}\b(my|our)\b[^.?!]{0,20}\b(tax|return|self assessment|vat)\b/.test(b)) return 'files';
  }

  // "how much will you save me", "can you save me money", "guarantee me a saving". Never the
  // past: "what have you saved me" is arithmetic on his own figures and isSavingsQuestion owns
  // it. And never "save this receipt", which is a man asking us to keep a record.

  const promising = /\b(will|would|can|could|gonna|going to)\b[^.?!]{0,40}\b(you|lekhio)\b[^.?!]{0,40}\bsav(e|ing)\b[^.?!]{0,12}\b(me|us|money|tax)\b|\b(you|lekhio)\b[^.?!]{0,20}\b(will|would|can|could|gonna|going to)\b[^.?!]{0,40}\bsav(e|ing)\b[^.?!]{0,12}\b(me|us|money|tax)\b/;
  const guaranteeing = /\b(guarantee|guaranteed|promise|promised)\b[^.?!]{0,40}\bsav\w*\b|\bsav\w*\b[^.?!]{0,40}\b(guarantee|guaranteed|promise|promised)\b/;
  // ⚠️ THE SAVING DOES NOT HAVE TO BE HIS. "how much tax do you save the average sparky" asks for
  // exactly the number we are never allowed to state, and it slipped through because the promise
  // was only read when the person saved was me, us, my money or my tax. A quoted figure is a
  // promise whoever it is quoted about, so the "how much do you save" shape is matched on its own.
  // It stays clear of the two neighbours on purpose: the past tense ("what have you saved me") is
  // arithmetic on his own figures and isSavingsQuestion owns it, and "can you save this receipt"
  // carries no how much at all.
  const quantifying = /\bhow much\b[^.?!]{0,25}\b(do|does|can|will|would)\s+(you|lekhio|it|the app|this app)\s+sav(e|ing)\b/;
  if (promising.test(b) || guaranteeing.test(b) || quantifying.test(b)) return 'savings';

  return null;
}

// The fixed, true words. No number is ever promised, no approval is ever claimed, and the
// prepare then approve order is stated every time. filingLive is lib/features.ts
// hmrcFilingLive(): the same sentence must never claim a live pipe before HMRC grants
// production access.
export function productTruthAnswer(kind: ProductTruthKind, opts: { filingLive: boolean }): string {
  if (kind === 'approved') {
    const recognition = opts.filingLive
      ? 'What exists is HMRC recognition for Making Tax Digital, and Lekhio is recognised.'
      : 'What exists is HMRC recognition for Making Tax Digital, and Lekhio is going through that process now.';
    return [
      'No, and no bookkeeping software is. HMRC does not approve or endorse software, and we will never claim it.',
      recognition,
      'The way it works: Lekhio prepares your figures, you approve anything before it goes to HMRC, and you stay responsible for your own tax.',
    ].join(' ');
  }
  if (kind === 'files') {
    return opts.filingLive
      ? 'No. Your tax return is yours, and Lekhio never sends anything without you. Lekhio prepares your figures and gets your updates ready, and once you have reviewed and approved them it sends them to HMRC through the recognised route. You approve first, every time, and you stay responsible for your own tax.'
      : 'No. Your tax return is yours, and Lekhio never sends anything without you. Lekhio prepares your figures and keeps your updates ready for Making Tax Digital. Sending to HMRC from Lekhio is not switched on yet. When it is, you will see the figures first and approve them before anything goes, and you stay responsible for your own tax.';
  }
  if (kind === 'concealment') {
    return 'No. Lekhio will never help hide income, and it would not be doing you a favour if it did: leaving income out of your return is evasion, and the penalties come on top of the tax and the interest. Every pound belongs in your books, cash jobs included. What Lekhio will do is make sure you never pay more than the law asks: log every cost, and every legal saving is worked out for you under Ways to save.';
  }
  if (kind === 'investment') {
    return 'That is not something I can advise on. Lekhio is your bookkeeping and tax, not a financial adviser, so what to do with your money, shares, crypto, a pension or anything else, is a question for a regulated adviser who knows your whole position. What I can tell you is the tax side of a decision once you have made it.';
  }
  return 'I cannot promise you a number, and it is worth doubting anyone who does: what you save depends on what you spend and what the rules let you claim. What Lekhio does is capture every cost you send it and prepare every claim you are entitled to. Your Tax screen shows what that has added up to so far, worked out from your own confirmed figures.';
}

// --- Deadline questions -----------------------------------------------------------
export function isDeadlineQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (!/\b(when|deadline|due|by when)\b/.test(b)) return false;
  return /\b(tax|return|quarter|quarterly|update|mtd|self assessment|file|filing|submit|payment on account)\b/.test(b);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TIE BREAK BETWEEN "WHEN" AND "HOW MUCH", BECAUSE BOTH MATCHERS CLAIM THE SAME WORDS.
//
// isDeadlineQuestion() and matchTotalsQuestion() overlap, and the overlap is not small. A message
// only has to carry a money word plus one of "how much", "what" or "my" for the totals matcher to
// take it, and "when is my tax due" supplies a money word ("tax") and the bare possessive ("my").
// Whichever matcher a router runs FIRST therefore decides the answer, which is how one sentence
// came to get a date on WhatsApp and a figure in the chat. Found live on /app/thread, 8 August
// 2026: a sole trader typed "when is my tax due" and was told "Put by £0.00 for tax", with no date
// anywhere in the reply. He asked WHEN and was told HOW MUCH.
//
// ⚠️ SO WHY NOT SIMPLY PUT THE DEADLINE LANE FIRST EVERYWHERE. Because the overlap runs BOTH ways
// and the other direction is just as wrong. "how much tax is due", "how much tax is due on 31
// January", "how much did I make before the tax return deadline" and "how much profit before the
// tax deadline" are every one of them deadline questions by isDeadlineQuestion(), and every one of
// them is a man asking for a NUMBER. Handing him 31 January 2027 is the same defect wearing the
// other hat, and on WhatsApp, where the deadline lane already runs first, it is what he gets today.
//
// ⚠️ THE RULE, AND IT IS THE ONE A READER WOULD USE. "how much" and "how many" name a quantity, so
// they are money questions whatever date words ride along. A "what" is a quantity ask too, EXCEPT
// in the shapes where it is plainly after a date: "what date", "what day", "what time", "what
// month", and any "what" leading into the word deadline. A bare "my" names nothing at all, and
// never decides this on its own again, because being the only evidence there was IS the bug.
//
// ⚠️ IT LIVES HERE, IN THE PURE MODULE, BECAUSE BOTH CHANNELS GATE ON IT. app/api/whatsapp/route.ts
// and app/api/thread/route.ts both read `isDeadlineQuestion(x) && !asksAmount(x)`, immediately
// above their totals lane, so the two surfaces cannot drift into two answers again. A copy of this
// regex in a route, or in a test, would be the second definition this codebase keeps deleting.
// test/laneparity.test.mjs walks both routers over the same phrases and requires one lane each.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function asksAmount(body: string): boolean {
  const b = body.trim().toLowerCase();
  // A named quantity settles it, whatever else is in the sentence.
  if (/\b(how much|how many)\b/.test(b)) return true;
  if (!/\bwhat\b/.test(b)) return false;
  // The "what" shapes that are after a date rather than a figure.
  if (/\bwhat\s+(date|day|time|month)\b/.test(b)) return false;
  if (/\bwhat\b.{0,30}\bdeadline\b/.test(b)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHO IS ASKING, BECAUSE THIS FUNCTION USED TO ANSWER EVERYONE THE SAME WAY AND IT WAS WRONG.
//
// Until 7 August 2026 deadlineAnswer() took a clock and nothing else. Whoever asked "when is my
// tax due", it replied "Your next quarterly update is due by 7 November 2026". That sentence is a
// claim about the man, not about the rule, and this module held no fact about the man at all, so:
//
//   . a LIMITED COMPANY DIRECTOR was handed a quarterly update deadline for a return his company
//     does not file, which is wave nine's own defect arriving by WhatsApp,
//   . a PARTNER was handed one for a regime GOV.UK has announced no date for,
//   . a SOLE TRADER HMRC HAS NEVER WRITTEN TO was handed one for an update he does not have to
//     make, and isDeadlineQuestion() also matches "when is my tax due" and "when do I have to
//     file", so a plain Self Assessment question was answered with a quarterly deadline first.
//
// ⚠️ THE DOCTRINE, WHICH EVERY BRANCH BELOW OBEYS. HMRC decides Making Tax Digital from a Self
// Assessment return ALREADY FILED and writes to the people it has assessed. We hold this year's
// running figures, which is a PROXY and never the test. So this module states a quarterly deadline
// as HIS only when HE has told us the letter came (stated_in, which mtdPosition() makes reachable
// from his answer alone and never from arithmetic). Everywhere else it names the date CONDITIONALLY
// and asks him, the way lib/weeklyupdate.ts words a surface that cannot know and lib/agent.ts's
// mtd signals ask rather than conclude.
//
// ⚠️ THE POSITION IS COMPUTED BY THE CALLER, NOT HERE, AND THAT IS NOT LAZINESS. This module is
// pure and import free (test/invoicesweb.test.mjs stages it alone to put the real voice on the
// bench, and test/numbers.test.mjs sweeps it for dashes), so it cannot reach mtdPosition() at
// runtime. Re-deriving the threshold test here would be a SECOND COPY of the one rule, which is
// the failure lib/quarterpack.ts already removed once. The type comes across, the decision does
// not.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface DeadlineAsker {
  // What his business IS, from getBusinessProfile()/getOptimiserInput(). A director and a partner
  // are both outside Making Tax Digital for Income Tax, for two different reasons, and one
  // sentence cannot serve both. null means we do not know, which is answered as unknown.
  structure: 'sole_trader' | 'partnership' | 'limited_company' | null;
  // Where he stands, from mtdPosition() in lib/taxengine.ts, which is the ONE definition.
  //
  // ⚠️ REQUIRED, NOT OPTIONAL WITH A FALLBACK, for the reason MtdPositionInput.stated gives: an
  // optional field keeps the old behaviour alive for every caller that did not get the memo, and
  // the old behaviour here is the bug. Required means tsc names every call site.
  //
  // ⚠️ null IS A REAL VALUE AND MEANS "THIS CALLER COULD NOT WORK IT OUT". It is never a no, and
  // it is never a yes. app/api/thread/route.ts passes null on purpose: test/thread.test.mjs pins
  // that nothing from the circumstances chain may reach the chat (article 9), so that route cannot
  // read whether HMRC's letter came and must not pretend to.
  mtdPosition: MtdPosition | null;
}

const DEADLINE_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-08-07" as a man writes it. ISO in, prose out, no second calendar.
function prettyDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${DEADLINE_MONTHS[m - 1]} ${y}`;
}

// The day it is where he is standing. ISO day strings compare correctly with < and >, which is how
// app/app/tax/due.ts does its own bounds checks, and comparing DAYS rather than instants is the
// whole point: see nextQuarterlyDeadline below.
function londonDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ⚠️ THE DEADLINE DUE TODAY IS STILL DUE TODAY. The old code compared instants with `>`, so from
// midnight on 7 August 2026 it skipped straight to 7 November and told a man his update was three
// months away on the morning it was due. app/app/tax/due.ts's outstandingUpdate() correctly
// reports it still open on the day (`todayIso > dueISO`), and app/free-mtd-filing compares whole
// days for the same stated reason: a man reading it on the morning of 7 August is not late yet.
// Two surfaces, one fact, two answers. This one now agrees with those.
function nextQuarterlyDeadline(todayIso: string): string {
  const y = Number(todayIso.slice(0, 4));
  const dates = [`${y}-02-07`, `${y}-05-07`, `${y}-08-07`, `${y}-11-07`, `${y + 1}-02-07`];
  return dates.find((d) => d >= todayIso) ?? dates[dates.length - 1];
}

// The next 31 January, which is when a Self Assessment return (or a Making Tax Digital final
// declaration) is due online. Same whole day rule: on 31 January itself it is today.
function nextJanuaryDeadline(todayIso: string): string {
  const y = Number(todayIso.slice(0, 4));
  return todayIso <= `${y}-01-31` ? `${y}-01-31` : `${y + 1}-01-31`;
}

export function deadlineAnswer(now: Date, asker: DeadlineAsker): string {
  const todayIso = londonDay(now);
  const update = prettyDay(nextQuarterlyDeadline(todayIso));
  const january = prettyDay(nextJanuaryDeadline(todayIso));
  // A caller that hands us nothing knows nothing, so it gets the answer for a man we cannot
  // place. The types are required above; this is the runtime floor under a bad call, and it lands
  // on the honest branch rather than on the old confident one.
  const structure = asker?.structure ?? null;
  const position = asker?.mtdPosition ?? null;

  const readyLine = 'Keep sending me your receipts and income as you go. You approve everything before anything goes to HMRC.';
  // The conditional pair, true for every reader without this module ever learning his answer.
  // lib/weeklyupdate.ts's shape, and its opening six words are load bearing: delete them and the
  // sentence becomes a claim we have no standing to make.
  const ifWritten = `Your Self Assessment return is due online by ${january}. If HMRC has written to tell you Making Tax Digital applies to you, your next quarterly update is due by ${update}, and the four dates each year are 7 August, 7 November, 7 February and 7 May.`;
  const hmrcDecides = 'HMRC decides it from a tax return you have already filed, not from this year, and writes to you to say so. Has that letter come?';

  if (structure === 'limited_company') {
    return [
      `Your company files its own return, so there is no quarterly update here for you to make. Making Tax Digital for Income Tax covers self employment and rent on a personal return, and a company's trade is neither.`,
      `If you file a Self Assessment return of your own, that one is due online by ${january}. Your company's Corporation Tax runs on its own dates, counted from your accounting year end.`,
      'Keep sending me what you spend and what you take and your figures stay ready. Nothing goes to HMRC unless you approve it first.',
    ].join('\n\n');
  }

  if (structure === 'partnership') {
    return [
      'Making Tax Digital for Income Tax has not reached partnerships yet. GOV.UK says it will in the future and that the timeline comes at a later date, so there is nothing quarterly for you to send and no date to keep.',
      `Your share goes on your own Self Assessment return, due online by ${january}, and the partnership files its own alongside it.`,
      'Keep sending me what you spend and what you take and your figures stay ready. Nothing goes to HMRC unless you approve it first.',
    ].join('\n\n');
  }

  if (position === 'stated_in') {
    return [
      `You have told me HMRC has confirmed you for Making Tax Digital, so your next quarterly update is due by ${update}. The four dates each year are 7 August, 7 November, 7 February and 7 May. Your final declaration for the year is due online by ${january}.`,
      'Keep sending me your receipts and income as you go and the update prepares itself. You approve everything before anything goes to HMRC.',
    ].join('\n\n');
  }

  if (position === 'stated_out') {
    return [
      `You have told me HMRC has not confirmed you for Making Tax Digital, so there is nothing quarterly for you to send. Your Self Assessment return is due online by ${january}.`,
      'HMRC decides it from a tax return you have already filed, not from this year, and writes to you to say so. If that letter has come since you told me, say so and I will change it.',
      'Keep sending me your receipts and income as you go and the return prepares itself. You approve everything before anything goes to HMRC.',
    ].join('\n\n');
  }

  // ⚠️ BOTH UNSTATED BRANCHES ASK, AND NEITHER GIVES AN ALL CLEAR. Over the line is not the test,
  // and under the line does not settle it either: the man whose 2024/25 was big and whose deadlines
  // are passing now is sitting in unstated_under, which is why that branch names the same date.
  if (position === 'unstated_over') {
    return [
      `Your figures so far this year are over the Making Tax Digital line, and that is not the test, so I am not going to call it for you. ${hmrcDecides}`,
      ifWritten,
      readyLine,
    ].join('\n\n');
  }

  if (position === 'unstated_under') {
    return [
      `Your figures so far this year are under the Making Tax Digital line, and that does not settle it either way. ${hmrcDecides}`,
      ifWritten,
      readyLine,
    ].join('\n\n');
  }

  // We could not place him, or he is excluded for a reason we were not told. Name both dates,
  // claim neither as his, and ask.
  return [ifWritten, hmrcDecides, readyLine].join('\n\n');
}

// --- Balance and totals questions ---------------------------------------------------
export type TotalsKind = 'spent' | 'made' | 'profit' | 'tax';
export interface TotalsQuestion {
  kind: TotalsKind;
  sinceISO: string | null; // null = all time (tax year to date for tax)
  periodLabel: string;
  category: string | null; // e.g. fuel, when they ask "on fuel"
}

const KNOWN_CATEGORIES = ['fuel', 'materials', 'tools', 'insurance', 'phone', 'travel', 'van', 'meals'];

function periodFrom(b: string, now: Date): { sinceISO: string | null; label: string } {
  const d = new Date(now);
  if (/\btoday\b/.test(b)) return { sinceISO: d.toISOString().slice(0, 10), label: 'today' };
  if (/\bthis week\b/.test(b)) {
    const dow = (d.getUTCDay() + 6) % 7; // Monday start
    d.setDate(d.getDate() - dow);
    return { sinceISO: d.toISOString().slice(0, 10), label: 'this week' };
  }
  if (/\bthis month\b/.test(b)) {
    return { sinceISO: d.toISOString().slice(0, 8) + '01', label: 'this month' };
  }
  if (/\bthis quarter\b/.test(b)) {
    const q = Math.floor(d.getUTCMonth() / 3) * 3;
    const s = new Date(Date.UTC(d.getUTCFullYear(), q, 1));
    return { sinceISO: s.toISOString().slice(0, 10), label: 'this quarter' };
  }
  if (/\bthis (tax )?year\b|\bso far\b|\byear to date\b/.test(b)) {
    // The UK tax year starts 6 April.
    const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return { sinceISO: `${y}-04-06`, label: 'this tax year' };
  }
  return { sinceISO: null, label: 'all time' };
}

export function matchTotalsQuestion(body: string, now: Date = new Date()): TotalsQuestion | null {
  const b = body.trim().toLowerCase();
  // It must read like a question about their own figures.
  const asksSpent = /\b(how much (have i|did i|i've)? ?spen[dt]|what (have|did) i spen[dt]|total spen[dt]|my (spending|expenses|outgoings)\b)/.test(b) || (/\bspent\b/.test(b) && b.endsWith('?') && !/\d/.test(b));
  const asksMade = /\b(how much (have i|did i) (made|earned|earnt|taken|took|billed|invoiced)|how much did i make|what (have|did) i (make|made|earn|earned)|my (income|earnings|takings)\b|how much money (have i|did i) (made|earned))/.test(b);
  const asksProfit = /\bprofit\b/.test(b) && /\b(what|how much|my)\b/.test(b);
  const asksTax = /\b(tax|owe|set aside|put aside|put away)\b/.test(b) && /\b(how much|what|my)\b/.test(b) && !/\bcan i\b|\bclaim\b/.test(b);
  if (/£\s*\d/.test(b)) return null; // an amount means it is probably an entry
  let kind: TotalsKind | null = null;
  if (asksTax) kind = 'tax';
  else if (asksProfit) kind = 'profit';
  else if (asksMade) kind = 'made';
  else if (asksSpent) kind = 'spent';
  if (!kind) return null;
  const period = periodFrom(b, now);
  // For a tax estimate the only period that makes sense is the tax year.
  if (kind === 'tax') {
    const d = new Date(now);
    const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return { kind, sinceISO: `${y}-04-06`, periodLabel: 'this tax year', category: null };
  }
  const catM = b.match(/\bon\s+([a-z][a-z ]{2,19})/);
  let category: string | null = null;
  if (catM) {
    const word = catM[1].trim();
    const mapped = expenseCategory(word);
    if (mapped !== 'other') category = mapped;
    else if (KNOWN_CATEGORIES.includes(word)) category = word;
  }
  return { kind, sinceISO: period.sinceISO, periodLabel: period.label, category };
}

export function formatGbp(n: number): string {
  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --- "What do I owe", the WhatsApp sentence around the tax hub's own figure ----
//
// 🔴 THE FIGURE IS PASSED IN, NEVER WORKED OUT HERE, AND IT IS THE TAX HUB'S OWN NUMBER.
//
// What arrives is taxPosition() on getOptimiserInput(): the same call /app/tax leads with, the
// Overview makes and the web chats at /app/thread answer with. The webhook used to run a little
// January of its own for this question (soleTraderTax on the asked about rows, the student loan
// added, CIS taken off, with company and partnership variants), and every figure in it was real
// while the total still disagreed with the Tax screen. A man who asks two of our surfaces what he
// owes and hears two numbers stops believing both. One question, one figure, on every channel.
//
// The projection notes are the thread's own sentences word for word, so the channels cannot say
// two different things about one number. Only the tail is WhatsApp's: the channel keeps its
// replies short, and the standing redirect shape ("Full picture in the app under...") is the same
// one studentLoanAnswer already uses. Deterministic, never an AI paraphrase: a paraphrased money
// figure is a different money figure.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND WHETHER THERE IS A POSITION TO SPEAK AT ALL, WHICH THIS SENTENCE DID NOT ASK. 9 Aug 2026.
//
// The webhook's "nothing logged yet" check catches a man with an empty account. It does not catch
// the man with COSTS CONFIRMED AND NO INCOME: he has logged something, so he falls through to here,
// taxPosition() correctly returns nothing owed on nothing earned, and WhatsApp announced
//
//   "Put by £0.00 for tax. That is what the year so far has built up..."
//
// A proud zero teaches him this product says nothing. app/app/tax/page.tsx has hidden its whole
// position block on exactly this test since doc 103, and the web chat at /api/thread was caught
// with the same hole on the same day, wearing a January date on top of the zero.
//
// ⚠️ THE RULE IS NOT DECIDED HERE. hasTaxPosition() in lib/taxoptimiser.ts owns it and the caller
// passes the answer in, for the same reason the FIGURE is passed in rather than worked out here:
// this module writes the sentence, never the sum. Both lanes ask the one function, so they cannot
// come to different views about whether the same man has a position at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function oweAnswer(setAside: number, projected: boolean, hasPosition: boolean): string {
  if (!hasPosition) {
    return 'Nothing to work out yet. Tax is worked out on what you bring in, and this tax year has no confirmed income on it. Send me what you have earned and your position builds itself. Full picture in the app under Tax.';
  }
  const note = projected
    ? 'That is what the year is heading for, on everything you have confirmed so far.'
    : 'That is what the year so far has built up, too early to call the whole year yet.';
  return `Put by ${formatGbp(setAside)} for tax. ${note} Full picture in the app under Tax.`;
}

// --- National Insurance and student loan questions ---------------------------
// Answered deterministically from the user's own rows plus the plan stored on
// their account, no AI. These run BEFORE matchTotalsQuestion in the webhook,
// because "how much student loan do i owe" would otherwise be caught by the
// generic tax totals matcher. The maths comes from lib/nistudentloan.ts, the
// same engine as the app hub and the free website tools.

export function isNiQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (/£\s*\d/.test(b)) return false; // an amount means it is probably an entry
  if (/\b(national insurance|class ?2|class ?4|state pension)\b/.test(b)) {
    return /\b(how much|what|do i|am i|my|pay|paying|owe)\b/.test(b);
  }
  // Bare "ni" only with a clear question shape, to avoid false hits.
  return /\bni\b/.test(b) && /\b(how much|what|do i pay|am i paying)\b/.test(b);
}

export function isStudentLoanQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (/£\s*\d/.test(b)) return false;
  return /\b(student loan|uni loan|postgrad(uate)? loan|slc)\b/.test(b);
}

// "I'm on plan 2", "student loan plan 2", "my student loan is plan 5".
// Stores the plan from chat so the user never has to open a form. Plan 3 does
// not exist (postgrad is set in the app), and bare "plan 2" without student
// loan context is accepted only because HMRC plan numbers are unambiguous.
export function matchStudentLoanPlanSet(body: string): 'plan1' | 'plan2' | 'plan4' | 'plan5' | null {
  const b = body.trim().toLowerCase();
  const m = b.match(/\b(?:i'?m on |my student loan is |student loan(?: is)? )?plan ?([1245])\b/);
  if (!m) return null;
  // Require student loan context somewhere in the message unless it is the
  // whole message ("plan 2").
  if (!/\b(student|uni|loan)\b/.test(b) && !/^plan ?[1245]$/.test(b)) return null;
  return (`plan${m[1]}`) as 'plan1' | 'plan2' | 'plan4' | 'plan5';
}

// WHAT HIS BUSINESS INCOME ACTUALLY IS, re-declared here rather than imported from lib/persona.ts.
//
// ⚠️ THIS MODULE HAS NO IMPORTS AND MUST KEEP NONE. test/waintents.test.mjs loads it bare, and
// Node's type stripping cannot resolve an extensionless relative import. lib/circumstances.ts,
// lib/persona.ts, lib/elections.ts and lib/taxoptimiser.ts all re-declare the same literal union for
// the same reason, and test/wave9_nudges.test.mjs pins this copy against lib/persona.ts so the two
// cannot drift apart in silence.
export type IncomeShape = 'trade' | 'property_only';

// Reply for an NI question, from the year to date profit and optional salary.
export function niAnswer(input: {
  profit: number;
  salary: number;
  class1: number;
  class4: number;
  class2Annual: number;
  qualifies: boolean;
  voluntarySuggested: boolean;
  // Optional, and undefined means UNKNOWN, which answers exactly as this function always has. Only
  // a KNOWN 'property_only' is ever told something different. See the Class 2 block below.
  incomeShape?: IncomeShape | null;
}): string {
  const lines: string[] = [];
  if (input.class4 > 0 || input.class1 > 0) {
    const parts: string[] = [];
    if (input.class4 > 0) parts.push(`${formatGbp(input.class4)} Class 4 on your profit so far`);
    if (input.class1 > 0) parts.push(`about ${formatGbp(input.class1)} Class 1 through your payslip`);
    lines.push(`National Insurance this tax year: ${parts.join(', plus ')}.`);
  } else {
    lines.push('No National Insurance is due on your figures so far this tax year.');
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE VOLUNTARY CLASS 2 PROMISE A LANDLORD CANNOT USE. Gated 31 July.
  //
  // HMRC NIM74250: "A person whose activities in managing the property are those generally
  // associated with being a landlord would not meet the definition of gainful employment for
  // self-employed NICs purposes." A man whose only business is letting therefore has no relevant
  // profits, no small profits threshold to fall under, and NO voluntary Class 2 to buy a qualifying
  // year with. Telling him a lean year is cheap to protect is worse than saying nothing: he plans
  // around a price that is not on offer, and finds out when he tries to pay it.
  //
  // The "covered" branch is gated for the SAME reason and it is the same defect wearing the other
  // face. qualifies arrives as qualifiesViaEmployment OR qualifiesViaProfits (lib/nistudentloan.ts
  // niPosition), and a landlord's rent profits are not a qualifying route, so a man with no job at
  // all would be reassured his year was covered by the very income NIM74250 says does not count.
  // With no salary the only route that could have set the flag is the profits one, which is why the
  // salary test is the discriminator here. A landlord who also has a payslip keeps the true answer.
  //
  // ⚠️ AND ONLY A KNOWN 'property_only'. NIM74250 also says a guest house or a hotel IS a trade, so
  // an unknown shape keeps the old answer exactly, which is the safe direction: a landlord can
  // ignore a sentence that does not fit him, while a sparky silently never told about his pension
  // year loses a qualifying year he cannot get back cheaply.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const lettingOnly = input.incomeShape === 'property_only';
  if (lettingOnly && (input.voluntarySuggested || (input.qualifies && input.salary <= 0))) {
    // No figure is quoted, on purpose. The Class 3 rate is not one this codebase holds, and a price
    // invented here would be a fourth reader of a number no engine owns. GOV.UK, Voluntary National
    // Insurance: Class 3 is the voluntary class for people not eligible for Class 2, and it has
    // always been several times the Class 2 rate.
    lines.push('One thing worth knowing: letting property is not treated as self employed work for National Insurance, so the rent does not build a State Pension year on its own and voluntary Class 2 is not open to you. The voluntary route for you is Class 3, at several times the price. Your National Insurance record on GOV.UK shows which years are short.');
  } else if (input.voluntarySuggested) {
    lines.push(`One thing worth knowing: profits under the small profits threshold with no job covering you means this year may not count for your State Pension. Voluntary Class 2 protects it for about ${formatGbp(input.class2Annual)} for the whole year. Worth a look near year end.`);
  } else if (input.qualifies) {
    lines.push('Your State Pension year looks covered.');
  }
  lines.push('Full breakdown is in your app under Money, National Insurance.');
  return lines.join(' ');
}

// Reply for a student loan question, from the stored plan and year to date income.
export function studentLoanAnswer(input: {
  hasPlan: boolean;
  planLabel: string | null;
  annual: number;
  threshold: number;
  income: number;
}): string {
  if (!input.hasPlan) {
    return 'I do not know your student loan plan yet. Tell me here, like "plan 2", or set it in the app under Money, Student loan, and I will track the repayment on your real numbers.';
  }
  if (input.annual <= 0) {
    return `Nothing due so far: your income this tax year (${formatGbp(input.income)}) is under the ${input.planLabel} threshold of ${formatGbp(input.threshold)}. If income grows past it, I will have the figure ready.`;
  }
  return `On your income so far this tax year, about ${formatGbp(input.annual)} of student loan (${input.planLabel}) is building up. It lands in one lump on your January Self Assessment bill, so put about ${formatGbp(input.annual / 12)} a month aside and it will never bite. Full picture in the app under Money, Student loan.`;
}

// --- Goals from chat (doc 82 section 5b) --------------------------------------
// "my goal is a van for 24k" creates a goal in the user's own words, no form.
// These run BEFORE the student loan and totals matchers in the webhook.

export interface GoalSet {
  kind: 'purchase' | 'income' | 'savings';
  title: string;
  amount: number;
}

// 🔴 A GOAL'S AMOUNT IS NOT A TRANSACTION'S AMOUNT, AND THIS FUNCTION EXISTS BECAUSE THEY DIVERGED.
//
// A live test set the goal "earn 1 million" and it saved as £1.00, then "make a million pounds" was
// logged as £1,000,000 of INCOME. Two failures, one root cause: extractMoneyAmount understands "k"
// but not "million", so "1 million" grabbed the 1, and "a million" (no digit) parsed to nothing and
// fell through to the transaction parser.
//
// Goals are also bigger than transactions by nature. "Turn over a million" is a normal ambition; a
// single £1,000,000 receipt is almost always a typo. So the transaction parser keeps its tight cap,
// and goals get their own parser that understands "million"/"m", "a million", "half a million", and
// allows up to £10m.
export function extractGoalAmount(body: string): number | null {
  const s = body.toLowerCase();
  const cap = (n: number): number | null =>
    Number.isFinite(n) && n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;

  if (/\bhalf a million\b/.test(s)) return 500_000;
  const mil = s.match(/£?\s*(\d+(?:\.\d+)?)\s*(?:m|mil|million)\b/);
  if (mil) return cap(parseFloat(mil[1]) * 1_000_000);
  if (/\ba million\b/.test(s)) return 1_000_000;

  const k = s.match(/£?\s*(\d+(?:\.\d+)?)\s*k\b/);
  if (k) return cap(parseFloat(k[1]) * 1000);

  const m = s.match(/£\s*(\d[\d,]*(?:\.\d{1,2})?)/) || s.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/);
  if (!m) return null;
  return cap(parseFloat((m[1] || '').replace(/,/g, '')));
}

// Build a goal from free text WITHOUT requiring a trigger phrase. Used when we ALREADY know the
// message is a goal, because the setup flow just asked for one and is holding a session open. In
// that state "1 million" or "a van for 24k" is a goal, full stop, and must never be read as a
// payment received.
export function buildGoal(body: string): GoalSet | null {
  const low = body.trim().toLowerCase();
  const amount = extractGoalAmount(low);
  if (!amount) return null;
  const kind: GoalSet['kind'] = /\b(earn|make|turnover|income)\b/.test(low)
    ? 'income'
    : /\b(save|savings|buffer|rainy)\b/.test(low)
      ? 'savings'
      : 'purchase';
  // The title is what remains once the trigger phrase, the amount (in any of its forms) and filler
  // words are stripped: "my goal is a van for 24k" leaves "van".
  const title = low
    .replace(/\b(my goal is|new goal|goal:|i am saving (for|up)|i'm saving (for|up)|saving up for)\b/g, ' ')
    .replace(/\bhalf a million\b|\ba million\b/g, ' ')
    .replace(/£?\s*\d+(?:[,.]\d+)?\s*(?:k|m|mil|million)?\b/g, ' ')
    .replace(/\b(for|of|a|an|to|buy|get|save|the|new|pound|pounds|quid)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { kind, title: title || 'my goal', amount };
}

export function matchGoalSet(body: string): GoalSet | null {
  // The trigger is required OUTSIDE setup, so a stray "a van for 24k" is not mistaken for a goal.
  // Inside setup the caller uses buildGoal() directly, because it has already asked.
  if (!/\b(my goal is|new goal|goal:|i am saving (for|up)|i'm saving (for|up)|saving up for)\b/.test(body.toLowerCase())) return null;
  return buildGoal(body);
}

export function isGoalQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (/£\s*\d/.test(b)) return false;
  return /\bgoals?\b/.test(b) && /\b(how|what|where|am i|progress|looking|going|close)\b/.test(b);
}

export function isGoalDone(body: string): boolean {
  const b = body.trim().toLowerCase();
  return /\bgoal (done|complete|completed|finished|sorted|reached|smashed)\b/.test(b);
}

// Progress reply for one or more goals: the pot is what the business has
// cleared after tax this year, the same figure the app and Rakha use.
export function goalAnswer(goals: { title: string; amount: number }[], pot: number): string {
  if (goals.length === 0) {
    return 'No goals set yet. Tell me one here, like "my goal is a van for 24k", and I will keep it in mind: progress, tax timing, the lot.';
  }
  const lines = goals.slice(0, 3).map((g) => {
    const covered = Math.min(pot, g.amount);
    const pct = Math.min(100, Math.floor((covered / g.amount) * 100));
    return `"${g.title}": ${formatGbp(covered)} of ${formatGbp(g.amount)} covered (${pct}%)`;
  });
  return `${lines.join('. ')}. That is measured against what your business has cleared after tax this year. Rakha keeps these in mind and will tell you when timing or tax works in your favour.`;
}

// --- Property (doc 82 s4, Phase E) --------------------------------------------
// Rent arriving is a logging action, so the matcher is deliberately strict:
// the word rent plus an amount plus a clearly incoming direction. "Paid 950
// rent for the yard" is the user PAYING rent (a trade expense) and must not
// match; a question must not match either.

const gbpShort = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString('en-GB')}`;

export interface RentIn {
  amount: number;
  property: string | null; // nickname text after "from", if any
}

export function matchRentIn(body: string): RentIn | null {
  const low = body.trim().toLowerCase();
  if (!/\brent(al)?\b/.test(low)) return null;
  if (low.includes('?')) return null;
  // Paying rent out, unless it was paid TO the user.
  if (/\b(paid|paying|pay)\b/.test(low) && !/\b(paid me|paid in)\b/.test(low)) return null;
  // The amount must sit before any "from": otherwise "flat 2" reads as 2.
  const amount = extractMoneyAmount(low.split(/\bfrom\b/)[0]);
  if (!amount) return null;
  const incoming = /\b(in|came|received|got|landed)\b/.test(low) || /\bfrom\b/.test(low);
  if (!incoming) return null;
  const m = low.match(/\bfrom\s+(.+)$/);
  let property: string | null = null;
  if (m) {
    property = m[1]
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(the|my)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || null;
  }
  return { amount, property };
}

export function isPropertyQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (extractMoneyAmount(b)) return false;
  return /\b(propert(y|ies)|rentals?|landlord)\b/.test(b) && /\b(how|what|doing|going|position|tax|owe)\b/.test(b);
}

// The property position in one message: this year's stream plus the April
// 2027 line, the same engine as the app and the website tool.
export function propertyAnswer(
  rents: number,
  taxAdded: number,
  extra2027: number,
  propertyCount: number,
): string {
  if (rents <= 0) {
    return 'No rental money logged this tax year yet. Text it as it lands, like "rent 950 in from flat 2", and I will keep your property stream separate from your work money, ready for tax.';
  }
  const where = propertyCount > 0 ? ` across ${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'}` : '';
  const april = extra2027 > 0
    ? ` Heads up: the new property rates from April 2027 would add about ${gbpShort(extra2027)} a year on these numbers. You will hear it from me first, not from a January surprise.`
    : '';
  return `Property this tax year${where}: ${gbpShort(rents)} of rent in, adding about ${gbpShort(taxAdded)} to your tax bill (rent carries no National Insurance).${april}`;
}

// --- Instant invoice from a logged sale (the Tyms mechanic) ---------------------
// "invoice this", "make that an invoice", "turn it into an invoice". Turns the
// last logged income into a draft invoice the user then sends. Kept tight so it
// never collides with the multi step "create invoice" flow (which starts with the
// word invoice), which is why the route checks this FIRST.
const INVOICE_THIS_RE = /^\s*(invoice\s+(this|that|it|the\s+last\s+(one|payment|job))|make\s+(this|that|it)\s+(an\s+)?invoice|turn\s+(this|that|it)\s+into\s+an\s+invoice)\s*$/i;
export function isInvoiceThis(body: string): boolean {
  return INVOICE_THIS_RE.test((body || '').trim());
}

// --- The invoice chaser (doc 82 s5e item 3) -------------------------------------
// Rakha DRAFTS the chase in the user's own voice; the user forwards it. The
// approval gate is the product: we never message a customer ourselves.

export function chaseMessage(
  customer: string,
  number: string,
  total: number,
  daysOver: number,
  link: string,
): string {
  const name = customer.trim() || 'there';
  if (daysOver >= 30) {
    return `Hi ${name}, invoice ${number} for ${gbpShort(total)} is now ${daysOver} days outstanding. I would appreciate payment this week so I can keep things straight on my side. Here it is again: ${link}. Thanks for sorting it.`;
  }
  return `Hi ${name}, hope all is well. Just a friendly nudge on invoice ${number} for ${gbpShort(total)}, sent ${daysOver} days ago. Here it is again in case it is handy: ${link}. Cheers.`;
}

// "chase invoice 12", "chase INV-0012", "chase up dave's invoice", "who owes me".
export interface ChaseRequest {
  number: string | null;
}

export function matchChaseRequest(body: string): ChaseRequest | null {
  const low = body.trim().toLowerCase();
  const owes = /\bwho owes me\b|\bunpaid invoices?\b|\boverdue invoices?\b/.test(low);
  const chase = /\bchase\b/.test(low) && /\binvoice|\binv\b|\bowes|\bpayment\b/.test(low);
  if (!owes && !chase) return null;
  // The token must carry a digit: otherwise "inv" backtracks inside the word
  // "invoice" and captures "oice" as a number.
  const m = low.match(/\b(?:invoice|inv)[\s#-]*([a-z0-9-]*\d[a-z0-9-]*)\b/);
  const raw = m ? m[1].replace(/^0+(?=\d)/, '') : null;
  return { number: raw };
}


// --- The guided setup (the complete system run, 6 July) --------------------------
// Stateless on purpose: each button leads to the next question, and the free
// text setters (plan 2, salary 32000) already exist as intents, so there is no
// conversation state to store or lose.

export function isSetupRequest(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (b.includes('?')) return false;
  return /^(set ?up|setup|set me up|get set up|onboard me?)$/.test(b) || /\b(set me up|run setup|start setup)\b/.test(b);
}

// "salary 32000", "my salary is 32k", "i earn 28,500". Strict: the word and an
// amount, and never anything that smells like rent or an expense.
export function matchSalarySet(body: string): number | null {
  const low = body.trim().toLowerCase();
  if (!/\b(salary|i earn|my wage)\b/.test(low)) return null;
  if (/\b(rent|spent|paid for|invoice)\b/.test(low)) return null;
  if (low.includes('?')) return null;
  const amount = extractMoneyAmount(low);
  if (!amount || amount < 1000 || amount > 1000000) return null;
  return amount;
}

// --- "What have you actually saved me?" ---------------------------------------------------------
//
// ⚠️ THIS IS THE MOST IMPORTANT QUESTION A CUSTOMER WILL EVER ASK US, and it is the one that decides
// whether he keeps paying.
//
// "£12.99 saves you £2,000" is not a slogan. It is a SPECIFICATION (doc 108). If he texts us this
// question and we cannot answer it with a number, the sentence was a lie and he cancels.
//
// It goes through an INTENT, not an AI call, for two reasons. It is arithmetic on his own confirmed
// figures, so a model has nothing to add and everything to get wrong. And the answer to "what have
// you saved me" must be the SAME number he sees in the app, every single time. A model would
// paraphrase it, and a paraphrased money figure is a different money figure.
const SAVED_ME = /\b(saved?|saving|savings)\b/i;
const SAVED_ME_SUBJECT = /\b(me|us|my tax|so far|this year|anything)\b/i;

export function isSavingsQuestion(body: string): boolean {
  const b = (body || '').toLowerCase().trim();
  if (!b || b.length > 90) return false;

  // "what have you saved me", "how much have you saved me", "have you saved me anything",
  // "what am I saving", "how much has lekhio saved me this year"
  if (SAVED_ME.test(b) && SAVED_ME_SUBJECT.test(b)) return true;

  // "was it worth it", "is this worth 12.99", the same question, asked by a man about to cancel.
  if (/\bworth it\b/.test(b)) return true;

  return false;
}

// --- Support escalation -------------------------------------------------------------------------
// When a customer asks for a human, complains, or reports something broken, we lift them out of the
// automated flow and open a support ticket for Jag to answer. DELIBERATELY SPECIFIC: a false positive
// drags a paying customer onto the desk for nothing, so these require a real cry for help, not an
// ordinary question or a logged entry. Bare "help" is NOT here. That is the help menu (isHelp), and
// this is checked before it so an explicit escalation wins over the generic menu.
const SUPPORT_HUMAN =
  /(speak|talk|chat|connect|put me through|through to)[^.?!]{0,25}(human|person|someone|agent|advisor|adviser|representative|\brep\b|real person)|(human|real person|a person)[^.?!]{0,25}(talk|speak|chat)/;
const SUPPORT_COMPLAINT = /\b(complain|complaint|terrible|awful|disgusting|rubbish|useless|joke|scam|furious|unacceptable)\b/;
const SUPPORT_BILLING =
  /\b(refund|money back|overcharged|double[- ]?charged|wrong charge|billing (issue|problem|error))\b|charged? me (twice|again)|cancel( my)? (account|subscription|plan|membership)/;
const SUPPORT_PROBLEM =
  /\b(not working|isn'?t working|does ?n'?t work|won'?t work|is broken|broken|stopped working|not syncing|isn'?t syncing|can'?t (log ?in|login|access)|glitch|frozen|crash)\b|\b(there'?s|i have|i'?ve got|having) a problem\b|\bproblem with\b/;
const SUPPORT_WRONG = /\b(made a mistake|you'?re wrong|that'?s wrong|this (is|figure is|amount is) wrong|incorrect)\b/;

export function isSupportRequest(body: string): boolean {
  const t = String(body || '').trim().toLowerCase();
  if (!t) return false;
  // 🔴 THE BARE WORD FIRST, AND IT COMES FROM THE REGISTRY RATHER THAN FROM A SIXTH REGEX HERE.
  //
  // This is the 11 August defect itself. lib/walink.ts tells a refused customer to reply SUPPORT and
  // the five patterns below all want a sentence, so the one token we handed out was the one token
  // this function refused. Adding /^support$/ to the list would have fixed the day and left the
  // disease: the words we hand out would still be scattered through the copy with nothing tying
  // them to an inbound owner. Asking RESERVED_WORDS is what makes the registry load bearing, and it
  // is what test/reservedwords.test.mjs derives its guard from.
  if (matchReservedWord(t) === 'SUPPORT') return true;
  return (
    SUPPORT_HUMAN.test(t) ||
    SUPPORT_COMPLAINT.test(t) ||
    SUPPORT_BILLING.test(t) ||
    SUPPORT_PROBLEM.test(t) ||
    SUPPORT_WRONG.test(t)
  );
}

export type SupportReason = 'human' | 'complaint' | 'problem' | 'billing' | 'other';

// The lane label for the ticket. Order is deliberate: a request to reach a human is classified as
// 'human' even if it also mentions a problem, because that is what they actually asked for.
export function supportReason(body: string): SupportReason {
  const t = String(body || '').trim().toLowerCase();
  // The bare word is the most explicit ask for a person there is: we printed it, he sent it back and
  // nothing else. It lands in the 'human' lane rather than 'other', because 'other' is where the
  // desk puts a message it cannot classify, and this one is not unclassifiable, it is an answer to
  // our own sentence.
  if (matchReservedWord(t) === 'SUPPORT') return 'human';
  if (SUPPORT_HUMAN.test(t)) return 'human';
  if (SUPPORT_BILLING.test(t)) return 'billing';
  if (SUPPORT_COMPLAINT.test(t)) return 'complaint';
  if (SUPPORT_PROBLEM.test(t) || SUPPORT_WRONG.test(t)) return 'problem';
  return 'other';
}

// --- The weekly summary, asked for rather than pushed --------------------------------------
//
// Added 27 July 2026, when the weekly summary stopped being a paid business-initiated template and
// became something he pulls. Asking is free: a reply inside the 24 hour inbound window needs no
// template and costs nothing, so the man who actually wants it on WhatsApp still gets it, and the
// eight who never read it stop being billed for.
//
// ⚠️ THIS MUST BE CHECKED BEFORE matchTotalsQuestion IN THE ROUTER, and the reason is the overlap.
// "How much did I make this week" is a TOTALS question and must stay one. "Send me my weekly
// summary" is this. The matcher below is deliberately narrow so the two cannot both fire: it wants
// the word summary, update, figures, numbers or round up sitting next to the word week, or one of
// two fixed phrasings. A bare "this week" never reaches it.
export function isWeeklySummaryRequest(body: string): boolean {
  const b = (body || '').trim().toLowerCase();
  if (!b) return false;
  // An amount means he is logging something, not asking for a report.
  if (/£\s*\d/.test(b)) return false;

  // "weekly summary", "week summary", "weekly update", "weekly numbers", "weekly round up"
  if (/\bweek(ly)?\s+(summary|update|figures|numbers|round\s?up)\b/.test(b)) return true;
  // "summary for this week", "update for the week", "numbers for last week"
  if (/\b(summary|update|figures|numbers)\s+for\s+(the|this|last)\s+week\b/.test(b)) return true;
  // "how was my week", "how did my week go"
  if (/\bhow (was|did) my week\b/.test(b)) return true;
  // "my weekly", as in "send me my weekly"
  if (/\bmy weekly\b/.test(b)) return true;

  return false;
}

// --- Claiming use of home, by text --------------------------------------------------------
//
// Added 27 July 2026 with the election itself. lib/taxoptimiser.ts rule 4 has been telling every
// customer to claim use of home since it was written, and there was no way to say yes. WhatsApp is
// the surface that exists today, so this is where a man can actually take the money.
//
// ⚠️ A QUESTION IS NOT AN INSTRUCTION, AND THIS IS THE WHOLE SUBTLETY.
//
// "Can I claim working from home?" is a claim CHECK. It has an answer in lib/claimrules.data.ts and
// it must keep going there, because the man is asking what the rules are, not telling us to act.
// "Claim use of home" is an INSTRUCTION. Acting on the first would be us electing something on his
// behalf off the back of a question, which is exactly the conduct the whole product is built to
// avoid. So anything phrased as a question is refused here and falls through to the checker.
export interface UseOfHomeElection {
  // The hours a month he told us, or null when he said none and has to be asked.
  hoursPerMonth: number | null;
}

const HOME_WORDS = /\b(use of home|working from home|work from home|home office|home as office|wfh)\b/;
const ASKING = /^(can|could|could i|am i|is it|do i|would|should|what|how|does)\b|\?\s*$/;

export function matchUseOfHomeElection(body: string): UseOfHomeElection | null {
  const b = (body || '').trim().toLowerCase();
  if (!b) return null;
  // He is asking, not instructing. Let the claim checker answer it.
  if (ASKING.test(b)) return null;
  if (!HOME_WORDS.test(b)) return null;

  // It has to read like he wants it claimed, or like he is stating his hours. Bare "home office"
  // on its own is not an instruction to elect anything.
  const instructs = /\b(claim|start claiming|add|apply|yes|do it|sort it|set up)\b/.test(b);

  // "30 hours a month", "30 hrs per month", "i do 30 hours a month at home". A number of hours is
  // only read when it is EXPLICITLY monthly: a weekly figure would land him in the wrong band, and
  // the wrong band is a wrong figure on a return he is legally responsible for.
  const m = b.match(/(\d{1,3}(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:a|per|each)\s*month\b/);
  const hours = m ? Number(m[1]) : null;

  if (hours === null && !instructs) return null;
  return { hoursPerMonth: Number.isFinite(hours) ? hours : null };
}

// What we ask when he has not told us the hours. THREE real answers, so asking is right: doc 103
// forbids a question with only one sensible answer, not a question with a real choice behind it.
// The rates are NOT written here, the caller fills them from lib/elections.ts bandOptions(), which
// reads them from the watched engine.
export function useOfHomeHoursQuestion(options: Array<{ band: number; label: string; monthly: number }>): string {
  const lines = options.map((o) => `${o.label}: £${Math.round(o.monthly)} a month`);
  return [
    'Happy to claim that. HMRC sets the amount by how many hours a month you work at home.',
    ...lines,
    'Roughly how many hours a month is it? Just tell me the number.',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HIS DATA, AND THE DOOR THAT NOW EXISTS FOR IT.
//
// 🔴 FOUND TWICE, THE SECOND TIME BY WALKING THE FIX. 11 August 2026.
//
// RUN 1 asked the chat "delete all my data" and got a card about phone and broadband, because the
// claim corpus carries the alias 'data' for mobile allowances and the guard in front of it was one
// third of the one WhatsApp uses. That was finding F8, and fixing it let the question reach the
// model, which answered:
//
//   "That's a data protection question, not a tax one, so it's outside what I do here. You'd need
//    to contact Lekhio's support team directly about deleting your account and data."
//
// Which was true in the morning and false by the evening. /app/you/data shipped the same day: he
// can take a copy or close the account himself, in two taps, without asking anybody. Sending a man
// to a support queue for something he can do himself is the same failure as having no door at all,
// wearing better manners.
//
// ⚠️ SO THIS IS A DETERMINISTIC LANE AND NOT A PROMPT. A model told about a door will mention it
// most of the time. The right answer to "delete everything you hold on me" does not get to be
// probabilistic, and it must never be spent on an AI call either: a man at his cap still has the
// right to leave. See lib/gate.ts, which exempts the erasure route from the paywall for the same
// reason.
//
// ⚠️ AND IT NEVER DELETES ANYTHING. It points at the door. Erasure is irreversible and it asks for
// the word DELETE on a page of its own, which is where that decision belongs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const DATA_RIGHTS =
  /\b(delete|erase|remove|wipe|close|cancel|destroy)\b[^.?!]{0,30}\b(my|all|everything|the)\b[^.?!]{0,30}\b(data|account|details|records|information|info)\b/i;
// "delete everything you have on me" names no noun at all, which is exactly how a person says it
// when he is angry. Kept narrow: the verb has to be a destroying one and the object has to be
// EVERYTHING, so "delete the last entry" and "remove that receipt" are untouched.
const DATA_RIGHTS_ALL = /\b(delete|erase|wipe|destroy|remove)\b[^.?!]{0,20}\beverything\b/i;
const DATA_RIGHTS_COPY =
  /\b(gdpr|right to be forgotten|subject access|data protection)\b|\b(export|download|copy)\b[^.?!]{0,25}\b(my|all)\b[^.?!]{0,25}\bdata\b/i;

export function isDataRightsRequest(body: string): boolean {
  const t = String(body ?? '');
  return DATA_RIGHTS.test(t) || DATA_RIGHTS_ALL.test(t) || DATA_RIGHTS_COPY.test(t);
}

/** Where to send him. One sentence per right, and no promise that anything has happened yet. */
export const DATA_RIGHTS_ANSWER =
  'That one is yours to do yourself, and you do not need us to agree to it. Go to You, then Your '
  + 'data. You can take a copy of everything we hold in one file, and you can tell us to delete '
  + 'your account and what is in it. Deleting cannot be undone, so take the copy first if you want '
  + 'your records. Some things we may have to keep where UK tax rules require it, and the page says '
  + 'which. If you would rather a person did it, email info@lekhio.app.';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE VAN QUESTION. RUN 1 finding F7, and the last of the thirteen.
//
// 🔴 WHAT HE ASKED, AND WHAT HE GOT. 11 August 2026, live:
//
//   "i bought the transit in november, 9800. do i claim that or do the mileage thing, whats
//    better. i do about 200 miles a week"
//
//   "✅ A van. Yes. A van used for the business is allowable. You can claim the full cost the year
//    you buy it, or run it on simplified mileage..."
//
// A card. It knew nothing of the £9,800 sitting in his own books, nothing of November, nothing of
// the 200 miles he had just typed, and it did not mention the one fact that decides the answer for
// the rest of that van's life.
//
// ⚠️ AND THE PRODUCT CANNOT COMPUTE THE ANSWER, WHICH IS WHY THIS IS NOT A CALCULATION. vehicleAdvice()
// in lib/capital.ts does the whole comparison properly, and it needs his ANNUAL BUSINESS MILES.
// Nothing in his books holds that: a bank statement shows diesel, not distance. /app/tax/vehicle
// asks him for it, and that is the honest place for the sum to happen.
//
// So this lane does the three things a canned card did not, and refuses the fourth:
//   1. names the vehicle already in HIS books, with the figure and the year it landed,
//   2. states the LOCK IN, which is the decision that actually matters and is irreversible,
//   3. sends him to the screen that can finish it with the one number only he has,
//   4. and NEVER says which is better, because on 200 miles a week that answer is worth about
//      £1,400 of tax and this product does not guess at money.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const VEHICLE_ASK =
  /\b(van|transit|pickup|pick[- ]?up|truck|car|vehicle|motor)\b[^.?!]{0,60}\b(claim|mileage|miles|capital|allowance|better|worth|write off|writeoff)\b|\b(claim|mileage|miles|better)\b[^.?!]{0,60}\b(van|transit|pickup|truck|car|vehicle)\b/i;

export function isVehicleQuestion(body: string): boolean {
  return VEHICLE_ASK.test(String(body ?? ''));
}

/**
 * The answer, built from what his own books hold. Every figure is passed in by the caller from the
 * engine, never re-derived here, so this file states facts and never computes tax.
 */
export function vehicleAnswer(input: {
  /** A vehicle bought through the books, if there is one. */
  boughtThroughBooks: boolean;
  /** The capital allowance already taken off his profit this year, if any. */
  allowanceThisYear: number;
}): string {
  const parts: string[] = [];

  if (input.boughtThroughBooks) {
    parts.push(
      'You have a vehicle in your books already, so the choice below has probably been made: '
      + (input.allowanceThisYear > 0
        ? `£${Math.round(input.allowanceThisYear).toLocaleString('en-GB')} of allowance on it is already taken off your profit this year.`
        : 'its cost has already gone through as a claim.'),
    );
  }

  parts.push(
    'There are two ways to run a vehicle and you can only pick one for a given vehicle. Claim the '
    + 'vehicle itself, which for a van is usually the whole cost in the year you bought it, and then '
    + 'its running costs. Or leave it in your own name and claim a flat rate per business mile, which '
    + 'covers everything: the fuel, the insurance, the servicing and the tyres, so nothing goes on top.',
  );

  // 🔴 THE ONE SENTENCE THE CARD DID NOT HAVE, AND THE ONLY IRREVERSIBLE THING IN THE ANSWER.
  parts.push(
    'The part worth getting right: once you have claimed the vehicle itself you cannot switch that '
    + 'vehicle to mileage later, and once you have used mileage on it you cannot start claiming the '
    + 'vehicle. It is one decision per vehicle, for as long as you own it.',
  );

  // ⚠️ NO VERDICT. Which one wins turns on his annual business miles, and no row in his books holds
  // a distance. Naming a winner without that number is the guess this whole run was spent removing.
  parts.push(
    'Which one comes out ahead depends on how many business miles you actually do in a year, and '
    + 'that is the one thing your bank statement cannot tell me. Open Tax, then Vehicle, put your '
    + 'miles in, and it works both ways out on your own figures and shows you the difference in tax.',
  );

  return parts.join(' ');
}
