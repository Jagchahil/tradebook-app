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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "actually make that 12.60 i read it wrong" LOGGED A SECOND ENTRY. RUN 2, 12 August 2026.
//
// She logged £12.40 for flower food, saw her own mistake, and corrected it in the next message the
// way anybody would. Both regexes below missed it, for two independent reasons:
//
//   the LEAD IN   only "no," was allowed in front of the verb. She said "actually".
//   the TAIL      the amount had to be the last thing in the message. She said why she was
//                 correcting it: "i read it wrong".
//
// So the correction fell through to the entry parser and became a NEW row. Her books ended the
// evening holding £12.40 AND £12.60, both confirmed, £25.00 recorded where £12.60 was meant, and
// the review pile filed the pair under "we are confident about them".
//
// ⚠️ THE BACK REFERENCE IS WHAT MAKES A TRAILING CLAUSE SAFE. "make that 12.60 for the flowers"
// points at something already said and is an edit. "spent 12.60 on flowers" is a new entry and
// must stay one. So the widened form REQUIRES "that / it / the last one", and only then allows
// words after the amount. The original tight form is kept underneath it, unchanged, for the
// phrasings that carry no back reference ("change to 40"), where the amount must still end the
// message or a new entry could be swallowed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The things people say before correcting themselves. Deliberately a small closed set: a wide
// prefix class would let a genuine entry ("just spent 40") reach the edit path.
const EDIT_LEAD_IN = '(?:no,?\\s*|actually,?\\s*|sorry,?\\s*|oh,?\\s*|wait,?\\s*|hang on,?\\s*|hold on,?\\s*)*';
const AMOUNT = '£?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s*(?:quid|pounds?)?';

export function matchEditLast(body: string): { amount: number } | null {
  const t = body.trim();
  const m =
    // Widened form: a back reference is present, so anything may follow the amount.
    t.match(new RegExp(`^${EDIT_LEAD_IN}(?:change|make|edit|correct)\\s+(?:that|it|the last one)\\s*(?:to|was)?\\s*${AMOUNT}\\b.*$`, 'i'))
    // "sorry i meant 12.60", "no i meant 12.60 not 12.40"
    || t.match(new RegExp(`^${EDIT_LEAD_IN}i\\s+meant\\s+${AMOUNT}\\b.*$`, 'i'))
    // Original tight forms, unchanged: no back reference, so the amount must end the message.
    || t.match(new RegExp(`^${EDIT_LEAD_IN}(?:change|make|edit|correct)\\s+(?:that|it|the last one)?\\s*(?:to|was)?\\s*${AMOUNT}\\s*[.!]?$`, 'i'))
    || t.match(new RegExp(`^(?:that|it)\\s+(?:was|should be)\\s+${AMOUNT}\\s*[.!]?$`, 'i'));
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

// ══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHO LEKHIO IS, IN WORDS THAT ARE TRUE OF THE CHANNEL HE IS STANDING IN. B19, 18 August 2026,
// AND IT IS THE LANE THAT CLOSES B19.
//
// THE FINDING IS THE SAME ONE AGAIN. isIdentity has existed since Run 2 and was dispatched by
// app/api/whatsapp/route.ts and by NOTHING ELSE, so a man signed in at /app/thread who typed "who
// are you" was answered by the MODEL. This lane reads NOTHING: no findUserIdByPhone, no rows, no
// position, no database call of any kind. It is two sentences, and a paid model call was being
// spent paraphrasing them into whatever words it chose.
//
// ⚠️ AND THE WORDS ARE WHY IT WAS LEFT UNTIL LAST, NOT THE CODE. Copying the WhatsApp reply to a
// browser would tell a man in a browser to send a text. MEASURED CLAUSE BY CLAUSE rather than
// assumed, the way savingsAnswer's header below says to. It is SEVEN clauses and THREE are channel
// specific:
//
//   "I am Lekhio, a bookkeeping assistant for the UK self employed"  true everywhere
//   "right here in WhatsApp"                                         WhatsApp only
//   "Yes, I am software, with real people behind me"                 true everywhere
//   "Snap a receipt ... and I log it for tax"                        true on WhatsApp AND in the
//                                                                    web chat, whose composer takes
//                                                                    an image file, and FALSE in
//                                                                    the phone Ask box, text only
//   "say what you spent or got paid, and I log it"                   WhatsApp only, because
//                                                                    looksLikeMoneyEntry is
//                                                                    WhatsApp only by the written
//                                                                    decision in laneparity 9b
//   "You approve everything before anything goes near HMRC"          true everywhere
//   'Text "help" to see the lot'                                     WhatsApp only, and isHelp is
//                                                                    not even exported from this
//                                                                    file: it is private to the
//                                                                    webhook
//
// So the FOUR neutral clauses survive WORD FOR WORD and only the three channel specific ones are
// replaced. test/laneparity.test.mjs section 13 asserts both halves, because a later tidy that
// collapsed these into one string would be the exact failure this lane exists to prevent.
//
// ⚠️ ONE WEB WORDING, NOT TWO, AND THAT IS A MEASURED CHOICE RATHER THAN A SHORTCUT.
// app/api/thread/route.ts and app/api/ask/route.ts both pass 'web', and the ONLY capability that
// splits them is the receipt photograph in the box itself. Naming it would be true in a browser and
// false on the phone, so it is not named and the web wording claims nothing either surface lacks.
// The web chat's composer already carries the label "Or send a receipt photograph and I will read
// it" one line under the box, so an answer repeating it would be a row he has already read.
//
// ⚠️ NO DOOR AND NO OFFER, DELIBERATELY. Both web surfaces carry their own navigation on the screen
// and neither needs this reply to be a menu. The best button is no button.
//
// ⚠️ AND ONE THING THIS LANE DOES NOT FIX, RECORDED SO IT IS NOT MISTAKEN FOR SETTLED. On the phone
// the box this answer lands in is titled "Puchio", not Lekhio, in five customer facing places in
// the mobile repo. Saying "I am Lekhio" there is a brand mismatch, not a lie, and the phone channel
// cannot reach a customer at all until the EAS variables are set. It is a mobile item and it is in
// the backlog, not a thing to fix from inside a web lane packet.
// ══════════════════════════════════════════════════════════════════════════════════════════
export function identityAnswer(channel: LaneChannel): string {
  if (channel === 'whatsapp') {
    return [
      'I am Lekhio, a bookkeeping assistant for the UK self employed, right here in WhatsApp. Yes, I am software, with real people behind me.',
      '',
      'Snap a receipt, say what you spent or got paid, and I log it for tax. You approve everything before anything goes near HMRC. Text "help" to see the lot.',
    ].join('\n');
  }
  return [
    'I am Lekhio, a bookkeeping assistant for the UK self employed. Yes, I am software, with real people behind me.',
    '',
    'I keep your receipts, invoices and mileage straight, and work out what you owe and when. You approve everything before anything goes near HMRC.',
  ].join('\n');
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B44, 19 AUGUST 2026. B34's SHAPE, ONE FUNCTION OVER, AND THE NAIVE FIX WOULD HAVE BROKEN A
// LANE THAT WAS ALREADY RIGHT.
//
// `\bwhat\b` does not match "whats", because the word boundary fails on the s. So "what is my tax
// bill due" reached the TOTALS lane and "whats my tax bill due" reached the DEADLINE lane: two
// spellings of one word, two lanes, on a question about a figure. MEASURED across 18 tails in
// three spellings each ("what is X", "what's X", "whats X"): 15 of the 18 had the spellings
// DISAGREEING before this edit, and 0 of 18 disagree after it.
//
// ⚠️ AND THE CLAUSE BELOW IT HAD TO LEARN THE COPULA IN THE SAME EDIT, WHICH IS THE HALF A
// CHARACTER CLASS WOULD HAVE MISSED. Widening only the gate moves "whats the date my tax is due"
// out of the deadline lane and into the totals lane, because the date exception is written
// `\bwhat\s+(date|day|time|month)\b` and "whats the date" does not match it. That is a date
// question answered with a figure: a REGRESSION bought with a consistency.
//
// 🔴 SO THE DATE EXCEPTION NOW HEARS THE COPULA AND THE ARTICLE, AND THAT MOVES FOUR "what is"
// SHAPES TOO. "what is the date my tax is due", "what is the day it is due", and the same for
// month and time, have been classed as AMOUNT questions since this function was written, because
// only the bare "what date" form was excepted. They now reach the deadline lane. **Four shapes
// change on a spelling this item said would not change, they all move INTO the deadline lane
// rather than out of it, and they are all date questions. It is on the copy sign off sheet.**
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function asksAmount(body: string): boolean {
  const b = body.trim().toLowerCase();
  // A named quantity settles it, whatever else is in the sentence.
  if (/\b(how much|how many)\b/.test(b)) return true;
  if (!/\bwhats?\b/.test(b)) return false;
  // The "what" shapes that are after a date rather than a figure. The copula and the article are
  // both optional, because "what date", "what is the date" and "whats the date" are one question.
  if (/\bwhat(?:s|'s| is| are)?\s+(?:the\s+)?(date|day|time|month)\b/.test(b)) return false;
  if (/\bwhats?\b.{0,30}\bdeadline\b/.test(b)) return false;
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
  sinceISO: string | null; // null = since his first entry here
  periodLabel: string;
  // 🔴 A FLAG, BECAUSE FOUR CALL SITES WERE DECIDING CONTROL FLOW BY COMPARING DISPLAY TEXT.
  // Both routers carried `q.periodLabel === 'all time'` to choose between "Nothing logged yet" and
  // "Nothing logged <period>", and between "All time:" and "For <period>:". Rewording the label on
  // 12 August would have shipped "Nothing logged since your first entry here" and "For since your
  // first entry here:" to a customer, from four places, in two routers. A label is for reading. A
  // boolean is for branching.
  allTime: boolean;
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
  // The UK tax year starts 6 April.
  const taxYear = () => {
    const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6)
      ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return { sinceISO: `${y}-04-06`, label: 'this tax year' };
  };
  if (/\bthis (tax )?year\b|\bso far\b|\byear to date\b/.test(b)) return taxYear();

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SINCE EVER IS A THING HE HAS TO ASK FOR. IT IS NOT WHAT SILENCE MEANS.
  //
  // Found 12 August 2026 on the live WhatsApp number. A man typed "how much have i made this yeat"
  // and Lekhio replied "You have brought in £70,000.00 all time." He asked about a YEAR, the typo
  // missed this function's year test by one letter, and the fall through handed him a different
  // period without ever noticing the two did not match.
  //
  // ⚠️ AND THE FALL THROUGH WAS THE REAL FAULT, NOT THE TYPO. matchTotalsQuestion below has forced
  // the tax year for a TAX question since it was written, with the reason in its own comment: "the
  // only period that makes sense". That reason does not stop at tax. What he made, what he spent
  // and his profit are all numbers with a bill attached, and the bill is drawn on the tax year.
  // A man on a ladder asking what he has made means the year he is going to be taxed on.
  //
  // 🔴 AND "ALL TIME" IS NOT TRUE ANYWAY. It means since Lekhio started counting, which for a
  // customer who joined in June is eleven weeks, printed under a phrase that sounds like a career.
  // A man who has traded twelve years reads "all time" and sees a number that is missing most of
  // his life. So it is only ever reached deliberately now, and when it is reached it says what it
  // actually covers.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (/\ball ?time\b|\bever\b|\bsince i (started|joined|signed up)\b|\baltogether\b|\bin total\b/.test(b)) {
    return { sinceISO: null, label: 'since your first entry here' };
  }
  return taxYear();
}

export function matchTotalsQuestion(body: string, now: Date = new Date()): TotalsQuestion | null {
  const b = body.trim().toLowerCase();
  // It must read like a question about their own figures.
  const asksSpent = /\b(how much (have i|did i|i've)? ?spen[dt]|what (have|did) i spen[dt]|total spen[dt]|my (spending|expenses|outgoings)\b)/.test(b) || (/\bspent\b/.test(b) && b.endsWith('?') && !/\d/.test(b));
  const asksMade = /\b(how much (have i|did i) (made|earned|earnt|taken|took|billed|invoiced)|how much did i make|what (have|did) i (make|made|earn|earned)|my (income|earnings|takings)\b|how much money (have i|did i) (made|earned))/.test(b);
  const asksProfit = /\bprofit\b/.test(b) && /\b(what|how much|my)\b/.test(b);
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE PRODUCT SPOKE A PHRASE IT COULD NOT HEAR. B2-F3, 17 August 2026.
  //
  // This lane answers with "Put by £10,618 for tax." It did not recognise "put by" as a question.
  // Walked live on a Glasgow sole trader with 77 confirmed entries and £10,618 on his Tax page:
  //
  //   him: how much should i be putting by for the taxman
  //   it:  are you a sole trader registered for CIS, or do you run a limited company?
  //
  // He had answered that at signup step 2 and again at setup step 2, and production SQL says
  // business_type is sole_trader. Nothing was broken downstream. THE MATCHER NEVER FIRED, so the
  // question fell through to the model, which asked him what it had already been handed and gave
  // him no figure at all, on a surface that promises "I answer from your own figures, straight
  // away".
  //
  // TWO MISSES, BOTH OF THEM ORDINARY BRITISH:
  //   . "taxman" does not match \btax\b. The word boundary fails on the m, and this is the word a
  //     tradesman actually uses.
  //   . "putting by" was in none of the phrases, while "Put by" is how THIS FUNCTION'S OWN ANSWER
  //     opens.
  //
  // ⚠️ SO THE RULE IS NOT A LONGER LIST, IT IS A PAIRING: every phrase the product uses to ANSWER
  // a set aside question must be a phrase it hears when he ASKS it. test/waintents.test.mjs
  // derives the answer wording from the route source and asserts this lane hears it, so changing
  // the answer and not the matcher fails there rather than in front of a customer.
  //
  // ⚠️ AND IT IS ONE FUNCTION FOR TWO CHANNELS. app/api/whatsapp/route.ts calls this at lines 645
  // and 2148 and app/api/thread/route.ts at 259, which is why the fix belongs here and not in a
  // route. Same reason the Scotland rule moved into taxFacts2627() the same afternoon.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B34, 18 AUGUST 2026. TWO SPELLINGS OF ONE WORD WERE GETTING TWO DIFFERENT LANES, AND THE
  // ITEM WAS WRONG ABOUT WHY ON THE FIRST OF ITS THREE.
  //
  // The item says the three set aside phrasings it measured "each have no money noun and no how
  // much". Re derived at head, that is true of two of them and FALSE of the first:
  // "whats the taxman going to want" carries the money noun "taxman" and fails on the
  // INTERROGATIVE clause alone, because \bwhat\b does not match "whats". The word boundary fails
  // on the s, which is B2-F3's own defect ("taxman" not matching \btax\b) one clause over.
  //
  // ⚠️ SO THE FIX IS NOT A WIDENING, IT IS A CONSISTENCY. "what is the taxman going to want"
  // already reaches this lane today. Only the apostrophe free spelling a man actually types on a
  // phone did not. MEASURED, and it costs nothing: 10 of laneparity's corpora and its 37 lane
  // phrasing sweep are IDENTICAL before and after, and so are 31 shapes written for this edit.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const asksTax = /\b(taxman|tax man|tax|owe|set(?:ting|tin)? aside|put(?:ting|tin)? (?:by|aside|away))\b/.test(b)
    && /\b(how much|whats?|my|should i)\b/.test(b)
    && !/\bcan i\b|\bclaim\b/.test(b);
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B34's OTHER TWO, AND THEY NEEDED A COMPANION RATHER THAN A WIDER CLAUSE. THE WIDER CLAUSE
  // WAS BUILT, MEASURED AND REJECTED, TWICE, AND THE NUMBERS ARE WHY.
  //
  // "am i going to get stung in january" and "what will january cost me" carry no money noun at
  // all, so each needs BOTH of asksTax's first two clauses relaxed. Both relaxations were built
  // and run against every corpus:
  //
  //   "january" added to the MONEY NOUN list      hijacks EIGHT ordinary period questions.
  //                                               "how much did i spend in january" becomes a set
  //                                               aside answer, and so do make, earn, profit and
  //                                               fuel since january. asksTax is tested FIRST, so
  //                                               a month in that list outranks the kind he asked.
  //   "am i" added to the INTERROGATIVE clause    hands FOUR questions that are not the set aside
  //                                               question a set aside figure: "am i paying too
  //                                               much tax", "am i on the right tax code", "am i
  //                                               registered for tax", "am i due a tax refund".
  //                                               That is B25's defect exactly: a precise answer to
  //                                               a question he did not ask.
  //   "cost" added to the money noun list         eats two isPricing phrasings, and buys nothing
  //                                               the clause below does not buy for free.
  //
  // ⚠️ SO THE COMPANION IS NARROW ON PURPOSE AND EVERY ALTERNATIVE IN IT IS WALKED BY A PHRASING
  // IN laneparity, or it is not in it. January is the Self Assessment payment date, which is why
  // this file already knows the word: it is in NOT_A_PERSON, and lib/waintents.ts builds a January
  // deadline. What is NOT allowed is January standing next to any cost word at all: measured, that
  // takes "how much did the van cost me in january" and four more like it. January has to be the
  // SUBJECT of the cost, which is the difference between asking what the month will do to him and
  // asking what a thing cost him during it.
  //
  // MEASURED, both directions, on every corpus laneparity holds plus 31 shapes written for this
  // edit: 3 of 3 closed, 0 of 61 self phrasings lost, 0 of 37 lanes eaten, 0 at risk shapes moved.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const asksJanuaryBill = /\b(?:will|is)\s+january\s+(?:going to\s+)?cost\b/.test(b)
    || /\bget(?:ting)?\s+stung\b[^?]{0,24}\bjanuary\b/.test(b);
  if (/£\s*\d/.test(b)) return null; // an amount means it is probably an entry
  let kind: TotalsKind | null = null;
  if (asksTax) kind = 'tax';
  else if (asksProfit) kind = 'profit';
  else if (asksMade) kind = 'made';
  else if (asksSpent) kind = 'spent';
  // 🔴 B34's COMPANION IS TRIED LAST, WHICH IS HALF OF ITS SAFETY. A sentence naming January that
  // any other kind can claim keeps that kind. Only a sentence nothing else wanted reaches here.
  else if (asksJanuaryBill) kind = 'tax';
  if (!kind) return null;
  const period = periodFrom(b, now);
  // For a tax estimate the only period that makes sense is the tax year.
  if (kind === 'tax') {
    const d = new Date(now);
    const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return { kind, sinceISO: `${y}-04-06`, periodLabel: 'this tax year', allTime: false, category: null };
  }
  const catM = b.match(/\bon\s+([a-z][a-z ]{2,19})/);
  let category: string | null = null;
  if (catM) {
    const word = catM[1].trim();
    const mapped = expenseCategory(word);
    if (mapped !== 'other') category = mapped;
    else if (KNOWN_CATEGORIES.includes(word)) category = word;
  }
  return { kind, sinceISO: period.sinceISO, periodLabel: period.label, allTime: period.sinceISO === null, category };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS MODULE'S TWO MONEY FORMATTERS, AND THEY ARE lib/money.ts's gbpAbs2 AND gbpAbs0 UNDER
// OTHER NAMES. B41, 19 August 2026, MEASURED RATHER THAN REMOVED.
//
// They are copies, and copies are what lib/money.ts exists to stop. They stay because this module
// is IMPORT FREE ON PURPOSE and four suites depend on that property: test/invoicesweb.test.mjs,
// test/moneyweb.test.mjs and test/receiptvat.test.mjs each stage this file ALONE so the real voice
// and the real arithmetic go on the bench with no bundler, and the vatAnswer family takes its
// formatter as an ARGUMENT for the same reason (see the note above vatAnswer). One runtime import
// of ./money would end that, and the cost would land on the suites rather than on a customer.
//
// ⚠️ SO THE DRIFT IS GUARDED INSTEAD OF PREVENTED. test/moneyone.test.mjs asserts these two agree
// with lib/money.ts character for character across a table that includes a negative, a zero, a
// thousands boundary and a fraction. If somebody edits one of the four, that suite goes red and
// names which. A copy nobody checks is the risk; a copy checked every gate run is a copy.
//
// AND THEY SIT TOGETHER ON PURPOSE. gbpShort used to live 320 lines further down beside the
// property matcher it was written for, which is how a reader concluded there was one formatter here
// and not two.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function formatGbp(n: number): string {
  // ⚠️ THE NON NUMBER GUARD IS NOT DECORATION, AND THIS COPY WAS MISSING IT UNTIL 19 AUGUST 2026.
  // lib/money.ts safe() turns a NaN into a zero because a man whose figure failed to compute should
  // see a quiet screen, not evidence that something broke. Without it this printed "£NaN" into a
  // WhatsApp reply. Found by test/moneyone.test.mjs on its first run, never by a customer.
  const v = Number.isFinite(n) ? n : 0;
  return `£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ⚠️ STATUTORY FIGURES ONLY, SINCE B39 ON 19 AUGUST 2026, AND IT HAS EXACTLY ONE CALLER.
// The law writes a student loan threshold as £26,065, never £26,065.00, and B26's carve out keeps
// it that way on every surface. Everything that is the CUSTOMER'S OWN money goes through formatGbp
// above and prints pence, which is what the other four callers of this were doing wrongly: an
// invoice total in a chaser sent to his customer, and his rent.
const gbpShort = (n: number) => `£${Math.round(Math.abs(Number.isFinite(n) ? n : 0)).toLocaleString('en-GB')}`;

// A DEMAND FOR PAYMENT. lib/money.ts gbpOwed, and the argument for it is written out there.
//
// 🔴 THIS IS THE THIRD COPY IN THIS MODULE AND IT IS THE ONE THAT WAS MISSING. The web chaser in
// app/app/invoices/words.ts has printed pence when there are pence since 1 August 2026; this one
// went on printing gbpShort, so the same £152.40 invoice was chased from the web for £152.40 and
// from WhatsApp for £152, which is a payment 40p short and an invoice that stays late. The parity
// test pinned the two voices at £450, the one figure where the difference cannot show.
const gbpOwed = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  if (Math.round(v * 100) % 100 !== 0) {
    const abs2 = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v < 0 ? `-£${abs2}` : `£${abs2}`;
  }
  // `|| 0` because Math.round(-0.4) is -0 and that prints "£-0". lib/money.ts gbp0 normalises it
  // away for the same reason, and the two must agree on every input or the two chaser voices part.
  const r = Math.round(v) || 0;
  const abs = Math.abs(r).toLocaleString('en-GB');
  return r < 0 ? `-£${abs}` : `£${abs}`;
};

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

// ══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A FAILED READ IS SAID OUT LOUD ON ALL THREE OF THESE LANES, AND IT IS NEVER A FIGURE.
//
// The same decision lib/vatstanding.ts made for VAT_UNREADABLE, made once for National Insurance,
// the student loan and the property stream. These are the webhook's own words, moved here so three
// channels refuse in ONE sentence rather than three sentences that drift.
//
// ⚠️ AND THE PROPERTY LANE HAD NO REFUSAL AT ALL. propertyYtdTotals answered a failed read with
// { rents: 0 }, and propertyAnswer's empty branch then told a landlord with a full year of rent in
// his books "No rental money logged this tax year yet". A guessed zero wearing the words of a read
// one. lib/laneanswers.ts is where that is unpicked and its header carries the argument.
//
// ⚠️ NOT KNOWING HIS PLAN IS NOT A FAILED READ, and nor is not knowing his income shape. Those
// are answered, not refused. Only a failure of a read the FIGURE turns on says this.
// ══════════════════════════════════════════════════════════════════════════════════════════
export const LANE_UNREADABLE = 'I could not fetch your figures just now. Try again in a minute.';

// ══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE EMPTY STATES OF THESE LANES ARE CHANNEL SPECIFIC, AND NOBODY KNEW BECAUSE THE LANES HAD
// NEVER LEFT WHATSAPP. Found 17 August 2026 by B19 typing the adjacent questions into the surface
// it had just wired, which is where every recent finding in this repo has come from.
//
// B19 records isIdentity as the lane whose WORDS are channel specific ("right here in WhatsApp",
// 'text "help" to see the lot'), and says the other lanes merely need a move. TWO OF THESE THREE
// ARE THE SAME PROBLEM and it is invisible until you wire them:
//
//   studentLoanAnswer, no plan stored:  'Tell me here, like "plan 2"'
//   propertyAnswer, no rent logged:     'Text it as it lands, like "rent 950 in from flat 2"'
//
// Both are instructions to do a thing THE WEB CANNOT DO. matchStudentLoanPlanSet and matchRentIn
// are WhatsApp only, correctly and by written decision (the web has the settings screen and the
// money form), so a man in a browser told to "tell me here" types "plan 2", nothing happens, and
// the same reply comes back. A promise the channel cannot keep is worse than no offer at all.
//
// ⚠️ THE CHANNEL IS REQUIRED, NOT DEFAULTED. A default is how a fourth caller silently gets the
// wrong one, and there are only ever two answers, so a caller that cannot say which it is has not
// finished thinking. Both builders take it and test/laneparity.test.mjs section 11 asserts each
// router passes its own.
// ══════════════════════════════════════════════════════════════════════════════════════════
export type LaneChannel = 'whatsapp' | 'web';

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
  // Which channel is asking. See LaneChannel above: the no plan branch offers a door, and only one
  // of the two channels has it.
  channel: LaneChannel;
}): string {
  if (!input.hasPlan) {
    // 🔴 THE OFFER IS ONLY MADE WHERE IT CAN BE TAKEN. matchStudentLoanPlanSet is dispatched by
    // app/api/whatsapp/route.ts alone, by written decision, because the web has the settings screen
    // this would write to. So a man in a browser is sent to that screen and is never told to say
    // "plan 2" at a box that will not hear it.
    return input.channel === 'whatsapp'
      ? 'I do not know your student loan plan yet. Tell me here, like "plan 2", or set it in the app under Money, Student loan, and I will track the repayment on your real numbers.'
      : 'I do not know your student loan plan yet. Set it under Money, Student loan, and I will track the repayment on your real numbers.';
  }
  if (input.annual <= 0) {
    return `Nothing due so far: your income this tax year (${formatGbp(input.income)}) is under the ${input.planLabel} threshold of ${gbpShort(input.threshold)}. If income grows past it, I will have the figure ready.`;
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
// ⚠️ THE SCOTLAND CAVEAT ARRIVES AS A STRING, IT IS NOT IMPORTED, AND IT IS NOT OPTIONAL
// BECAUSE THE FIGURE IS BAND DERIVED. Found 17 August 2026 by B19 moving this lane's read into
// lib/laneanswers.ts: test/scotland.test.mjs section 3 discovers band derived surfaces from the
// imports on disk, and the moment aprilDelta moved into a file of its own the ratchet asked the
// question nobody had been able to ask. app/api/whatsapp/route.ts produced this figure, said
// nothing about it, and passed the ratchet anyway, because the SAME FILE says the sentence on the
// totals lane thirty lines up. One file, two lanes, and only one of them disclosed.
//
// "adding about £2,400 to your tax bill" is his rent stacked on his trade profit and taxed at the
// England, Wales and Northern Ireland rates. A Scottish landlord is misled by it exactly as he is
// misled by the set aside, which is lib/scotland.ts's own bar.
//
// ⚠️ AND IT GOES ON THE BRANCH THAT CARRIES A FIGURE, NOWHERE ELSE. A man with no rent logged
// is given no number, so a caveat about a number he has not been given is a row he has to read and
// reject for nothing. Same guard the thread's set aside answer applies after its early return.
//
// ⚠️ THE STRING IS PASSED because this module has no imports and must keep none. See the note
// above IncomeShape. lib/scotland.ts owns the words and lib/laneanswers.ts hands them over, so
// there is still exactly one wording of the caveat in the product.
export function propertyAnswer(
  rents: number,
  taxAdded: number,
  extra2027: number,
  propertyCount: number,
  scotlandLine: string,
  channel: LaneChannel,
): string {
  if (rents <= 0) {
    // 🔴 THE OFFER IS ONLY MADE WHERE IT CAN BE TAKEN, for the reason written above LaneChannel.
    // matchRentIn is WhatsApp only by written decision, so "text it as it lands" on the web is an
    // instruction to a man in a browser to send a text, at a box that would not log it if he did.
    return channel === 'whatsapp'
      ? 'No rental money logged this tax year yet. Text it as it lands, like "rent 950 in from flat 2", and I will keep your property stream separate from your work money, ready for tax.'
      : 'No rental money logged this tax year yet. Add it under Money as it lands and I will keep your property stream separate from your work money, ready for tax.';
  }
  const where = propertyCount > 0 ? ` across ${propertyCount} ${propertyCount === 1 ? 'property' : 'properties'}` : '';
  const april = extra2027 > 0
    ? ` Heads up: the new property rates from April 2027 would add about ${formatGbp(extra2027)} a year on these numbers. You will hear it from me first, not from a January surprise.`
    : '';
  const scot = scotlandLine ? ` ${scotlandLine}` : '';
  return `Property this tax year${where}: ${formatGbp(rents)} of rent in, adding about ${formatGbp(taxAdded)} to your tax bill (rent carries no National Insurance).${april}${scot}`;
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
    return `Hi ${name}, invoice ${number} for ${gbpOwed(total)} is now ${daysOver} days outstanding. I would appreciate payment this week so I can keep things straight on my side. Here it is again: ${link}. Thanks for sorting it.`;
  }
  return `Hi ${name}, hope all is well. Just a friendly nudge on invoice ${number} for ${gbpOwed(total)}, sent ${daysOver} days ago. Here it is again in case it is handy: ${link}. Cheers.`;
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B25, 18 August 2026. "AM I SAVING ENOUGH FOR MY TAX BILL" IS A SET ASIDE QUESTION AND THIS
// LANE WAS ANSWERING IT WITH THE LEDGER OF WHAT LEKHIO HAS SAVED HIM.
//
// It has been true on WhatsApp since Run 2 and the savings packet spread it to /api/ask. A man
// asking whether he is putting enough by was handed "The costs you have logged are keeping £1,374
// off your tax bill this year", which is a confident, exact answer to a question he did not ask.
//
// 🔴 AND THE BACKLOG SAID THE NARROWING WAS IN SAVED_ME_SUBJECT. IT IS MEASURED AND IT IS WRONG.
// Dropping "my tax" and "this year" from that list was BUILT and measured on a corpus of 26 real
// savings phrasings and 13 set aside ones: it LOSES FOUR genuine savings questions ("how much have
// you saved this year", "how much has lekhio saved this year", "what have you saved on my tax",
// "what has this saved on my tax bill") and still lets two set aside ones through. Worse in both
// directions, and it would have broken the anchor a control in test/sabotage-b19savings.mjs holds
// on that exact line.
//
// ⚠️ THE SIGNAL IS NOT WHAT IS BEING SAVED. IT IS WHO IS DOING THE SAVING.
//
//   "have you saved me anything"   ->  US. This lane.
//   "am i saving enough for tax"   ->  HIM. matchTotalsQuestion.
//
// So the guard is a first person subject governing the save verb, AND a sufficiency word after it.
// The auxiliary alone is too blunt: "am i saving anything with lekhio" is this lane's question with
// his own subject, and it was measured and kept.
//
// MEASURED, both directions, on the same two corpora: SET ASIDE refused went 1 of 13 to 13 of 13,
// and SAVINGS kept stayed at 26 of 26. THE TRADE IS FREE. Every alternative earns its place, dropped
// one at a time: without "am" 7 of 13, without "are" 11, without "should" 9, without "do" 12;
// without "enough" 10, without "more" 12, without "for tax" 8. Nothing here is decoration.
//
// ⚠️ AND WHAT IT DOES NOT CLOSE, MEASURED RATHER THAN HOPED FOR. Of the 13, EIGHT reach
// matchTotalsQuestion and get the set aside answer. The other five carry no tax word at all
// ("am i saving enough this year") and fall through to the model. That is still better than a
// precise answer to a different question, and test/laneparity.test.mjs section 12b asserts the
// eight so a later change cannot move it in the dark.
// ══════════════════════════════════════════════════════════════════════════════════════════════
const HE_IS_THE_SAVER = /\b(am|are|should|do)\s+(i|we)\b[\s\S]{0,24}?\bsav(e|es|ing)\b[\s\S]{0,20}?\b(enough|more|for (my |the )?tax)\b/i;

export function isSavingsQuestion(body: string): boolean {
  const b = (body || '').toLowerCase().trim();
  if (!b || b.length > 90) return false;

  // 🔴 B25: he is asking whether HE is putting enough by, which belongs to matchTotalsQuestion.
  if (HE_IS_THE_SAVER.test(b)) return false;

  // "what have you saved me", "how much have you saved me", "have you saved me anything",
  // "how much has lekhio saved me this year", "how much have you saved this year"
  //
  // ⚠️ AND THE TWO THIS COMMENT USED TO CLAIM AND NEVER CAUGHT, CORRECTED IN PLACE 18 August 2026.
  // It listed "what am I saving" and "is this worth 12.99" as examples it catches. It catches
  // NEITHER, and it has said so since Run 2. "what am I saving" carries no subject from the list
  // above, and the second arm below is the literal words "worth it", not an amount. The widening to
  // hear `worth <amount>` was BUILT and MEASURED at 3 gained against 3 purchase questions lost
  // ("is this drill worth 129", "is that tool worth 300 quid", "is the ladder worth 89.99") and
  // REJECTED, which is B23's apostrophe trade exactly. The comment is fixed rather than the code,
  // because the code is right and the comment was the thing telling the lie.
  if (SAVED_ME.test(b) && SAVED_ME_SUBJECT.test(b)) return true;

  // "was it worth it", "is this worth it", the same question, asked by a man about to cancel.
  if (/\bworth it\b/.test(b)) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT LEKHIO HAS SAVED HIM, IN WORDS, FOR EVERY DOOR THAT ASKS. B19, 18 August 2026.
//
// 🔴 THE FINDING, AND IT IS THE SAME ONE FOR THE SEVENTH TIME. isSavingsQuestion has existed since
// Run 2 and was dispatched by app/api/whatsapp/route.ts and by NOTHING ELSE, because unlike every
// other lane closed this week it had no pure builder to move: handleSavingsQuestion assembled the
// whole reply inline, the Tesla screen, the CIS line and the fact note with it. So a man signed in
// at /app/thread who asked what this thing has actually saved him, which is the question a man asks
// the month before he decides whether to keep paying, was answered by the MODEL. The model holds
// none of his rows, cannot run the engine twice, and would paraphrase the one figure in this
// product that must never be paraphrased.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IT DOES NOT TAKE A LaneChannel, AND THAT IS A MEASURED CORRECTION TO THE ITEM THAT SIZED IT.
//
// The backlog says to assume this lane's empty state has channel specific words, because the last
// three lanes all turned out to have them. Measured rather than assumed: every sentence this lane
// can emit was pulled out and read, and there is exactly ONE with a channel in it,
//
//   'Send me a receipt or two first and I will show you exactly what I have saved you.'
//
// and it is not a channel specific WORDING of a shared state. It is the branch for a phone number
// with no account behind it, and it has no web equivalent AT ALL, because a caller on the thread or
// the in app accountant is authenticated before he can type. It stays in the webhook, where the
// state it describes is the only place that state exists. Everything below is neutral already, and
// the "Nothing confirmed yet" note was deliberately de-WhatsApped once before (see lib/ledger.ts:
// it used to say "send a receipt or connect the bank"). So this builder is niAnswer's case, not
// studentLoanAnswer's: one set of words, true wherever he is standing.
//
// ⚠️ THE MONEY FORMATTER IS PASSED IN, like vatAnswer's, because this module stays import free so
// the node runner can drive it with no bundler.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function savingsAnswer(
  input: {
    // Whether the read behind these figures actually reached the database. See LANE_UNREADABLE.
    unreadable: boolean;
    // The ledger, already assembled by lib/ledger.ts. This builder does no arithmetic of its own
    // and must not start: two readers over one money figure drift, and the one that drifts is the
    // one he is looking at.
    enough: boolean;
    note: string | null;
    headline: string;
    withoutLekhio: number;
    withLekhio: number;
    lines: Array<{ label: string; saved: number }>;
    refundDue: number;
    // The Khoji fact update note, or '' when nothing has moved. Silent by design.
    factNote: string;
  },
  money: (n: number) => string,
): string {
  // 🔴 FIRST, ALWAYS, AND IT IS THE WHOLE REASON THIS BUILDER EXISTS RATHER THAN A MOVE.
  // A failed read used to arrive here as a row set of zero length, which ledgerFor correctly turns
  // into "Nothing confirmed yet. Add your first entry or upload a bank statement, and this fills
  // itself in." That sentence is true of an empty account and a lie about a full one, and nothing
  // could tell the two apart. It never says a figure and it never says a thing about his records.
  if (input.unreadable) return LANE_UNREADABLE;

  // NOT ENOUGH IS NOT ZERO. Two weeks in we do not proudly announce that we saved him £14.
  // The words are lib/ledger.ts's, unchanged, and the fallback is the webhook's own.
  if (!input.enough) return input.note ?? 'Too early to say yet.';

  const lines: string[] = [];
  lines.push(input.headline);
  lines.push('');
  // THE TESLA SCREEN. Two numbers, side by side. The gap is the product.
  lines.push(`Claiming nothing: ${money(input.withoutLekhio)} of tax`);
  lines.push(`With Lekhio: ${money(input.withLekhio)}`);

  if (input.lines.length) {
    lines.push('');
    lines.push('Where it came from:');
    for (const x of input.lines.slice(0, 4)) {
      lines.push(`  ${x.label}: ${money(x.saved)}`);
    }
  }

  // HIS OWN MONEY. Separate, always, and never added to the saving. This product has already once
  // quoted a man a CIS refund that did not exist.
  if (input.refundDue > 0) {
    lines.push('');
    lines.push(`And ${money(input.refundDue)} of CIS is sitting with HMRC. That is your money, not a saving. You get it back when you file.`);
  }

  // THE FINAL-CHECK LINE. When Khoji has learned of a change and you have approved it, the figures
  // above were worked on that latest law, and we say so, so the number a man files is provably the
  // current one. Silent when nothing has changed, so an ordinary answer is unchanged.
  if (input.factNote) {
    lines.push('');
    lines.push(`These are worked on the current tax rules, ${input.factNote}. Nothing goes to HMRC without you.`);
  }

  return lines.join('\n');
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RUN 2 REPAIRS, 12 August 2026. Six intents this file could not recognise, each of which sent a
// real customer's real question to the money entry parser, which answered every one of them with
// "Tell me what you spent or got paid and how much, for example spent £40 on diesel".
//
// A florist got that sentence for: hello, five tulip emojis, gibberish, "did my payment go
// through" (three times), and the single most consequential tax question she will ever ask.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// --- VAT: the question this product exists to answer well --------------------------------
//
// 🔴 THERE WAS NO VAT MATCHER AT ALL. Every VAT question fell to the entry parser, which is why
// "should i be registered for vat? im scared im getting close" came back as diesel and Dave.
//
// ⚠️ IT MUST NOT SWALLOW A VAT AMOUNT ON A RECEIPT. "vat was £4.83" is a figure being logged, not
// a question, so any message carrying a money amount is left to the entry path, exactly as
// isPricing does above and for the same reason.
export function isVatQuestion(body: string): boolean {
  const b = body.trim();
  if (/£\s*\d/.test(b)) return false;
  if (!/\bvat\b|\bvalue added tax\b/i.test(b)) return false;
  // A statement of fact about his own registration is not a question for us to answer.
  if (/^\s*(i am|i'm|im)\s+(now\s+)?vat\s+registered/i.test(b)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 isVatThresholdQuestion WAS DELETED HERE ON 17 August 2026, B16, AND THE ARGUMENT IS THE POINT.
//
// It existed, exported, called by nothing in either repo and asserted by no test, and its own
// comment said it was there "so a surface can lead with the figure rather than the rules. Anything
// else VAT shaped still gets the VAT answer, just rules first."
//
// Run 7 looked at it on 16 August, declined to delete it, and wrote down why: "a man near the line
// who asks WhatsApp about the threshold gets the same rules first answer as anybody else... the
// right answer may well be to start calling it." That caution was correct in spirit and its premise
// was false, which is why this is a deletion and not a wiring.
//
// 🔴 THE FIGURE ALREADY LEADS, FOR EVERY VAT QUESTION, UNCONDITIONALLY. handleVatQuestion in
// app/api/whatsapp/route.ts opens with `const parts = [standingSentence(standing, formatGbp)]` and
// pushes BACKWARD_TEST and FORWARD_TEST after it. standingSentence carries his own rolling twelve
// month figure. So there is no rules first answer for this predicate to rescue anybody from, there
// is no second behaviour for it to select, and no surface has ever wanted one.
//
// A predicate whose comment describes a behaviour the product already has everywhere is not a
// capability being held in reserve. It is a claim. Doc 103's honesty test is written about buttons
// and it reads the same about exports: a thing whose only function is to describe a feature is an
// advert for the feature, not the feature.
//
// ⚠️ SO THE BEHAVIOUR IT DESCRIBED IS NOW ASSERTED INSTEAD OF IMPLIED. test/run2fixes.test.mjs holds
// that the VAT answer leads with his figure and puts the statutory tests after it. That was a
// customer visible promise held by nothing at all while a dead function stood next to it looking
// like the thing that held it. If a surface ever genuinely needs to branch on the threshold, write
// it then, against a caller.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// --- Somebody else's money ----------------------------------------------------------------
//
// 🔴 RUN 1 FOUND THIS AND IT WAS STILL LIVE ON THIS ROUTER. "what does the barber next door owe
// you lot then" was answered with HER OWN set aside figure, £1,200, read out as though it were an
// answer to the question asked.
//
// Nothing escaped: it was her number, on her account. But a product that answers a question about
// a third party by reciting the asker's own private figure has confused whose books it is holding,
// and the day the wording is slightly different it is a disclosure rather than a non sequitur.
//
// ⚠️ THE POSSESSIVE IS THE SIGNAL, NOT THE NOUN. "my mate", "the barber next door", "her", "their"
// carry it; "the barber" alone might be his own trade. So a third party word must appear WITH a
// question about money, and first person words anywhere in the message call it off.
const THIRD_PARTY_RE =
  /\b(?:the\s+)?(?:barber|shop|business|bloke|guy|woman|man|lad|fella|neighbour|neighbor|competitor|mate|friend|brother|sister|cousin|landlord|tenant|customer|client)\s+(?:next door|down the road|over the road|opposite|upstairs|across)\b|\b(?:my (?:mate|friend|brother|sister|cousin|neighbour|neighbor))\b|\b(?:his|her|their|someone else'?s?|somebody else'?s?|anyone else'?s?)\s+(?:books|tax|figures|takings|profit|income|account|bill|turnover|vat)\b/i;

const FIRST_PERSON_RE = /\b(?:my own|i|me|mine)\b/i;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND A PERSON WITH A NAME MATCHED NONE OF IT. Run 3, 13 August 2026.
//
// The rule above needs a trade noun WITH a location ("the barber next door"), or "my mate", or a
// possessive pronoun WITH a money noun. That is the right shape for the stranger it was written
// for. It has no shape at all for the person a partner actually asks about, which is his partner,
// by his first name.
//
// Marcus Whitfield asked "how much has jerome made this year" on BOTH channels. WhatsApp answered
// "Jerome's made £96,000 gross income so far this year, with £34,401.52 in expenses, leaving him
// £61,598.48 profit". The web chat answered the same question with £40,600 and £55,400. £96,000 is
// the WHOLE FIRM'S turnover, Jerome's share is half of it, and neither expenses figure is a number
// this product has ever computed: the true one is £44,701.52. Two channels, two inventions, one
// man's name on both.
//
// ⚠️ AND THE GATE WAS ON ONE CHANNEL. app/api/thread/route.ts never called this function at all,
// so the web chat had no gate of any kind. Run 1 found this shape on the chat router, Run 2 fixed
// it on WhatsApp, and the router it was found on was never wired. Fixed in the same packet.
//
// ⚠️ A NAME IS RECOGNISED BY ITS SHAPE, NOT BY A LIST OF NAMES, because we cannot have a list of
// every partner, spouse and subbie our customers will ever mention. The shape is "how much has
// <word> made" and "<word>'s profit", with a stoplist of the words that are not people and the
// customer's own name passed in where the caller knows it. A stoplist is the safe direction: a
// word we have not thought of is treated as a person and the question is politely declined, which
// costs one re-ask. The other direction costs a disclosure.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const NOT_A_PERSON = new Set([
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'it', 'that', 'this', 'the', 'a', 'an',
  'he', 'she', 'they', 'them', 'everyone', 'anyone', 'someone', 'somebody', 'nobody',
  'tax', 'vat', 'hmrc', 'lekhio', 'business', 'company', 'firm', 'shop', 'partnership', 'trade',
  'account', 'invoice', 'client', 'customer', 'job', 'work', 'van', 'yard', 'site',
  'profit', 'income', 'turnover', 'takings', 'money', 'everything', 'something', 'anything',
  'year', 'month', 'week', 'quarter', 'day', 'today', 'yesterday', 'tomorrow', 'april', 'january',
  // 🔴 B23, 17 August 2026, AND BOTH WERE FOUND BY MEASURING RATHER THAN BY READING. A landlord's
  // tenant is a ROLE, not a name, and this list already knew that about his client, his customer
  // and his firm. "how much is the tenant's rent" and "how much rent do the tenants pay" are both
  // a man asking about his OWN income, and both started being refused the moment the property
  // nouns went into the possessive pattern below.
  'tenant', 'landlord',
  // 🔴 B23 SHAPE 3, 18 AUGUST 2026, AND THIS ONE IS PRE EXISTING RATHER THAN NEW. Measured at
  // head with no widening applied at all: "what is the garage's turnover", "what is the garage's
  // rent" and "how much is the garage's vat" were ALL refused already, because a garage is a place
  // a tradesman owns and this list had every one of its siblings ('shop', 'yard', 'site', 'van')
  // and not it. The possessive run above only made it easier to notice. Same family, same fix, and
  // it costs no third party shape: measured, all four of the corpus's named person phrasings are
  // unchanged.
  'garage', 'unit',
]);

// ═══════════════════════════════════════════════════════════════════════════════════════
// 🔴 B23. AND THE EAR COULD NOT HEAR AN ORDINARY QUESTION ABOUT SOMEBODY ELSE'S NATIONAL
// INSURANCE, STUDENT LOAN OR PROPERTY. 17 August 2026, on production, signed in as a real account.
//
//   "how much national insurance does jerome pay"
//     -> "National Insurance this tax year: £303.24 Class 4 on your profit so far. Your State
//         Pension year looks covered."
//   "whats jerome's student loan"
//     -> "Nothing due so far: your income this tax year (£17,624.00) is under the Plan 4
//         (Scotland) threshold of £33,795.00."
//
// Word for word the answer to his own question, about a man who is not him, and the second one
// reads his income out loud. Run 1's finding shape with a POUNDS payload rather than B22's dates.
//
// ⚠️ B22 FIXED THE ORDER. THIS IS THE EAR, AND THE ORDER WAS NEVER THE WHOLE OF IT. The gate now
// runs above the deadline lane on all three routers, which does nothing at all for a sentence the
// gate cannot hear. A routing fix and a matcher fix are two different jobs on one defect.
//
// TWO SHAPES, MEASURED AGAINST THE NINE MISSES WRITTEN DOWN IN THE BACKLOG.
//
//   1. THE POSSESSIVE NOUN LIST WAS TOO SHORT. It ended at "share" and carried no noun for any of
//      the three lanes B19 had just wired to three routers, so "whats jerome's student loan" was
//      not a possessive this file recognised. Adding them closes THREE of the nine.
//   2. AN OBJECT NOUN BETWEEN "how much" AND THE AUXILIARY BROKE THE VERB SHAPE. It required
//      "how much <aux> <name> <verb>", so "how much NATIONAL INSURANCE does jerome pay" never
//      matched: after "how much" comes a noun, not an auxiliary. A bounded optional run of words
//      between them closes THREE more.
//
// ⚠️ THE RUN IS FIVE WORDS AND DIGITS COUNT, AND BOTH NUMBERS WERE MEASURED RATHER THAN CHOSEN.
// The backlog sized this run at three words of letters, which was a guess and is too short for
// what people type: "how much tax and national insurance does dave pay" is four, and "how much
// income tax and class 4 does jerome pay" is five AND contains a digit, so a letters only class
// could never match it however long the run was. Five with digits hears all three of those, three
// hears none of them, and every widening step from three to eight costs the SAME on all four
// corpora in section 9d: nothing. FIVE IS THE SMALLEST RUN THAT HEARS EVERYTHING MEASURED, which
// is the bound worth writing down rather than the largest that happens to be free.
//
// 🔴 AND THE RUN REFUSES PREPOSITIONS, WHICH IS THE WHOLE OF ITS SAFETY. Without that, "how much
// OF MY INCOME does the taxman take" captures "taxman" and refuses a man asking about his own tax
// bill. The object of "how much X does Y pay" is a noun phrase; the moment a preposition appears,
// the sentence has stopped being that shape and the word after the auxiliary is not a name.
//
// 🔴 WHAT THIS DOES NOT CLOSE, AND IT IS THREE OF THE NINE, ASSERTED SO IT CANNOT BE READ AS MORE.
// "does jerome pay class 4" and "what national insurance is priya on" carry no "how much" at all.
// "how are daves rentals doing" is a possessive with NO APOSTROPHE, and the optional apostrophe was
// built, measured and REJECTED: it buys four third party shapes and costs SIX false positives
// ("how much is this month's rent", "what is the business's turnover", "how much is the garages
// rent"). Without the apostrophe, every plural noun in the language becomes a named person and the
// stoplist has to carry the whole dictionary to stay safe. THE APOSTROPHE IS THE SIGNAL THAT A
// PERSON IS BEING NAMED. test/laneparity.test.mjs section 9d holds the 6 of 9 and the 3 left open.
//
// ⚠️ AND EVERY NOUN IN THAT LIST IS EXERCISED BY A PHRASING IN 9d, OR IT IS NOT IN THE LIST. An
// alternative nothing walks can be deleted in silence, which is this repo's oldest lesson wearing
// a regex. "position" was drafted into it and taken back out on the same argument: the one miss it
// was added for ("what is dave's property position") is already closed by propert(y|ies), so it
// earned nothing, and it reached into questions that are not about money at all.
// ═══════════════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════════════
// 🔴 B19, 18 AUGUST 2026: THE SAVINGS LANE'S VOCABULARY, ADDED BECAUSE THE LANE WAS WIRED TODAY.
//
// B23's own rule is that the possessive noun list gains a lane's nouns WHEN THAT LANE GAINS
// ROUTERS, which is why it holds "national insurance", "student loan", "property" and "rent". The
// savings lane was WhatsApp only when B23 ran, so its words were correctly absent. It is on all
// three routers as of this packet, so "how much tax has priya saved" and "what is jerome's saving"
// are now questions a live web customer can type at a lane that answers from HIS rows.
//
// MEASURED IN BOTH DIRECTIONS BEFORE IT WAS TAKEN, on section 9d's own four corpora plus a fifth
// written for this lane, and the trade is free:
//
//   savings third party shapes    0 of 5  ->  4 of 5     the gain
//   the nine B23 measured         6 of 9  ->  6 of 9     unchanged
//   third party shapes already heard 6/6  ->  6 of 6     nothing traded away
//   ordinary self phrasings       0 of 61 ->  0 of 61    NOTHING taken from a customer
//   every dispatched lane's phrasings 0/60 -> 0 of 60    no lane eaten
//   bare s possessives            0 of 4  ->  0 of 4     that decision is untouched
//
// ⚠️ THE FIFTH SHAPE IS NOT CLOSED AND IS NOT MEANT TO BE. "how much has lekhio saved jerome" names
// OUR OWN PRODUCT as the subject, so the word the gate captures is "lekhio" and the stoplist
// correctly refuses to read it as a man. Asserted at 4 of 5 in 9d with a re measure comment, for the
// same reason the 1 of 4 and the 6 of 9 are asserted: a number nobody wrote down is a number that
// moves in the dark.
// ═══════════════════════════════════════════════════════════════════════════════════════
const NAMED_PERSON_VERB_RE =
  /\bhow much (?:(?!of\b|from\b|to\b|in\b|on\b|for\b|with\b|off\b|out\b|at\b|by\b|as\b)[a-z0-9'\u2019-]+\s+){0,5}?(?:has|have|had|did|does|do|is|was)\s+(?:the\s+)?([a-z][a-z'\u2019-]{1,20})\s+(?:made|make|makes|earn|earned|earns|owe|owes|owed|spent|spend|spends|paid|pay|pays|taken|take|takes|turned|billed|invoiced|saved|save|saves)\b/i;

// ══════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE LIST, THREE PATTERNS. B23 SHAPE 3, 18 AUGUST 2026.
//
// The nouns below were a literal inside the possessive pattern until tonight. Shape 3's pattern
// needs the SAME nouns, and a second copy of them is the failure this file keeps deleting: the
// list is DESIGNED to grow (B23's own rule is that the gate gains the nouns of every lane we
// wire, and three lanes have been wired since it was written), so two copies would drift on the
// next lane rather than eventually.
//
// ⚠️ THE TEXT OF THE LIST IS UNCHANGED, CHARACTER FOR CHARACTER, AND THAT IS DELIBERATE RATHER
// THAN INCIDENTAL. test/sabotage-b23gateear.mjs anchors seven sabotages and one control on the
// INTERIOR of this list, which is the repair B23 made after all three died on an append. Keeping
// the text identical is what keeps every one of them alive across this move. ONE anchor did not
// survive, because it quoted the list's OPENING bracket (`(?:'s|’s)\s+(?:books`), which is the
// same edge bug B23 repaired at the closing bracket, wearing the other end. It is repaired in the
// same commit and now quotes the apostrophe alternation alone.
// ══════════════════════════════════════════════════════════════════════════════════
const MONEY_NOUN = 'books|tax|figures|takings|profit|income|account|bill|turnover|vat|earnings|wages|money|share|national insurance|ni|class ?[24]|student loan|propert(?:y|ies)|rentals?|rent|savings?|saving';

// ⚠️ AND ONE WORD MAY SIT BETWEEN THE NAME AND THE NOUN, WHICH IS THE SHAPE B23 FOUND WHILE
// CHECKING ITS OWN WORK AND SIZED WITHOUT CLOSING. "what is murphy's ltd turnover" fell through
// where "what is murphy's turnover" was refused, because the noun had to follow the apostrophe
// immediately. MEASURED at {0,1} and {0,2}: both buy the same THREE third party shapes
// ("murphy's ltd turnover", "jerome's total tax", "dave's ltd profit") and both cost the same
// nothing on every corpus, so it is one word, which is the smallest run that hears everything
// measured. The same bound rule B23 wrote for the object noun run.
const NAMED_PERSON_POSSESSIVE_RE = new RegExp(
  String.raw`\b([a-z][a-z'\u2019-]{1,20})(?:'s|\u2019s)\s+(?:[a-z]+\s+){0,1}?(?:${MONEY_NOUN})\b`, 'i');

// ══════════════════════════════════════════════════════════════════════════════════
// 🔴 B23 SHAPE 3. THE TWO THAT CARRY NO "how much" AT ALL, AND ONE OF THEM WAS TYPED ON
// PRODUCTION AFTER B23 SHIPPED AND CAME BACK WITH HIS OWN £303.24.
//
//   "does jerome pay class 4"            -> "National Insurance this tax year: £303.24 Class 4 ..."
//   "what national insurance is priya on"
//
// Neither the possessive pattern nor the object noun run reaches them: both need either an
// apostrophe or the words "how much". The item that sized this called it highest risk and lowest
// value, and the risk half is right, which is why this is TWO narrow shapes rather than one wide
// one.
//
// ⚠️ THE WIDE ONE WAS BUILT AND MEASURED FIRST, AND IT FAILED IN THE DIRECTION THAT MATTERS.
// Making "how much" optional on NAMED_PERSON_VERB_RE closes shape 3a and REFUSES
// "how much of my income does the taxman take", which is a man asking about his own tax bill and
// is the exact phrasing the run's preposition guard exists for. It also refused "does the taxman
// take much", "do subcontractors pay cis" and "did anybody pay". FOUR false positives for one
// gain. The preposition guard only ever protected the run AFTER "how much", so removing the
// prefix removes the guard with it.
//
// SO EACH SHAPE CARRIES ITS OWN SECOND SIGNAL, AND IN BOTH CASES IT IS THE MONEY NOUN:
//
//   3a  <aux> <name> <money verb> <MONEY NOUN>    "does jerome pay class 4"
//   3b  <MONEY NOUN> is <name> <preposition>      "what national insurance is priya on"
//
// 🔴 AND 3b's NOUN MUST BE ADJACENT TO THE AUXILIARY, WHICH IS THE WHOLE OF ITS SAFETY. A
// window of even a few characters between them matches "what is the vat rate the shop is charging
// on" and captures "charging". Adjacency is the bound, it was measured, and it is the reason this
// shape reads as narrow rather than as careless.
//
// MEASURED IN BOTH DIRECTIONS, in the same packet, on every corpus in laneparity section 9d plus
// 28 shapes written for this widening:
//
//   the nine B23 measured             6 of 9  ->  8 of 9     the gain
//   third party shapes already heard  6 of 6  ->  6 of 6     nothing traded away
//   the savings lane's own            4 of 5  ->  4 of 5     unchanged
//   ordinary self phrasings           0 of 61 ->  0 of 61    NOTHING taken from a customer
//   every dispatched lane's phrasings 0 of 61 ->  0 of 61    no lane eaten
//   bare s possessives                0 of 4  ->  0 of 4     that decision is untouched
//   28 shapes written for this edit   0       ->  0          "does the taxman take much" and 27 more
//
// ⚠️ THE NINTH IS STILL OPEN AND IS STILL THE BARE S POSSESSIVE. "how are daves rentals doing"
// is unchanged by this packet in either direction, and the apostrophe doctrine above is why.
// ══════════════════════════════════════════════════════════════════════════════════
const NAMED_PERSON_BARE_RE = new RegExp(
  String.raw`\b(?:does|do|did|has|have|is|was)\s+(?:the\s+)?([a-z][a-z'\u2019-]{1,20})\s+(?:pay|pays|paid|owe|owes|owed|earn|earns|earned|make|makes|made|claim|claims|claimed)\s+(?:the\s+|any\s+)?(?:${MONEY_NOUN})\b`
  + String.raw`|\b(?:${MONEY_NOUN})\s+(?:is|was)\s+(?:the\s+)?([a-z][a-z'\u2019-]{1,20})\s+(?:on|paying)\b`, 'i');

// The customer's own name is not somebody else. Split on whitespace so "Marcus Whitfield" excuses
// both "marcus" and "whitfield", and lower cased because nobody capitalises their partner on
// WhatsApp.
export function selfNameTokens(fullName: string | null | undefined): string[] {
  return String(fullName ?? '')
    .toLowerCase()
    .split(/[^a-z'\u2019-]+/)
    .filter((w) => w.length > 1);
}

function namesAPerson(b: string, selfNames: string[]): boolean {
  for (const re of [NAMED_PERSON_VERB_RE, NAMED_PERSON_POSSESSIVE_RE, NAMED_PERSON_BARE_RE]) {
    const m = b.match(re);
    if (!m) continue;
    // 🔴 THE SECOND GROUP IS SHAPE 3b's, AND IT IS READ HERE RATHER THAN IN A SECOND LOOP. 3a
    // captures in group 1 like the two patterns above it; 3b's name sits AFTER the money noun, so
    // it is group 2. A pattern whose capture the stoplist never sees is a pattern with no stoplist.
    const word = (m[1] ?? m[2] ?? '').toLowerCase();
    if (!word || NOT_A_PERSON.has(word)) continue;
    // 🔴 B23. THE STOPLIST WAS SINGULAR ONLY AND NOBODY HAD NOTICED, because until the object noun
    // shape above existed nothing could capture a plural. "customer", "client", "shop", "year" and
    // "month" are all in it and NONE of them worked in the plural, so "how much rent do the tenants
    // pay" read "tenants" as a person. A word that is not a person is not a person in either number.
    if (word.endsWith('s') && NOT_A_PERSON.has(word.slice(0, -1))) continue;
    if (selfNames.includes(word)) continue;
    return true;
  }
  return false;
}

export function isAboutSomeoneElse(body: string, selfNames: string[] = []): boolean {
  const b = body.trim();
  const named = namesAPerson(b, selfNames);
  if (!THIRD_PARTY_RE.test(b) && !named) return false;
  // "what do i owe compared to my mate" is still fundamentally about him. Only refuse when the
  // question is squarely about the other party.
  if (/\bcompared to\b|\bvs\b|\bversus\b/i.test(b)) return false;
  if (FIRST_PERSON_RE.test(b) && !/\byou lot\b|\byou\b/i.test(b)) return false;
  // A named person carries its own money verb inside the pattern, so it does not have to prove one
  // twice. The original shape still does, exactly as before.
  if (named) return true;
  return /\bowe|owes|owed|earn|earns|made|makes|turnover|profit|tax|takings|books|figures|pay|pays\b/i.test(b);
}

export const SOMEONE_ELSE_ANSWER =
  'I can only see your books, so I have no idea and could not tell you if I did. If it is your own '
  + 'figures you are after, ask me about those and I will give you them straight.';

// --- A draft invoice is not income ---------------------------------------------------------
//
// 🔴 "draft an invoice for the fennel wedding balance, 380" WAS LOGGED AS £380 OF INCOME RECEIVED.
//
// A balance she is OWED became money she HAS, waiting in the pile for one press that would
// overstate her income by exactly the sum she still has to chase. isInvoiceThis above only ever
// matched the two words "invoice this", so every other way of asking for an invoice fell to the
// entry parser, which saw a number and a customer name and did what it does.
//
// ⚠️ ASKING FOR AN INVOICE IS NEVER AN ENTRY, WHATEVER ELSE IS IN THE SENTENCE. That is the whole
// rule and it has to sit ABOVE the money parse in the dispatch chain, because the message
// deliberately contains an amount.
export interface InvoiceDraftRequest {
  amount: number | null;
  // What it is for, as they said it, so the draft can be read back in their own words.
  subject: string | null;
}

export function matchInvoiceDraft(body: string): InvoiceDraftRequest | null {
  const b = body.trim();
  const asks = /\b(?:draft|make|create|raise|write|do|send|prepare|knock up)\s+(?:me\s+)?(?:an?\s+)?invoice\b/i.test(b)
    || /\binvoice\s+(?:for|to)\b/i.test(b)
    || /\bcan you invoice\b/i.test(b);
  if (!asks) return null;
  const amount = extractMoneyAmount(b);
  // "invoice for the Fennel wedding balance" -> subject is what sits between "for" and the amount.
  const subj = b.match(/\bfor\s+(?:the\s+)?([a-z0-9''\s]{3,60}?)(?:\s*,|\s+\d|$)/i);
  const subject = subj ? subj[1].trim().replace(/\s+/g, ' ') : null;
  return { amount, subject: subject && subject.length > 2 ? subject : null };
}

// What a draft request gets back. It NEVER writes a row, and it never sends anything.
export function invoiceDraftAnswer(req: InvoiceDraftRequest, gbp: (n: number) => string): string {
  const bits: string[] = [];
  const what = req.subject ? ` for ${req.subject}` : '';
  bits.push(
    req.amount !== null
      ? `Right, an invoice${what} for ${gbp(req.amount)}.`
      : `Right, an invoice${what}.`,
  );
  // 🔴 THE SENTENCE THAT WAS MISSING AND IS THE WHOLE POINT.
  bits.push(
    'That is money you are owed, not money you have, so nothing has gone into your figures and '
    + 'nothing will until it is actually paid.',
  );
  bits.push(
    'Open Lekhio and go to Make an invoice: your details and their details go on it, you read it '
    + 'over, and you decide whether it goes. I do not send anything on your behalf.',
  );
  return bits.join(' ');
}

// --- A language we cannot write back in ---------------------------------------------------
//
// 🔴 A PUNJABI TAX QUESTION WAS RECOGNISED AS PUNJABI AND THEN REFUSED AS OFF TOPIC.
//
// "ਮੈਨੂੰ ਦੱਸੋ ਮੈਂ ਇਸ ਮਹੀਨੇ ਟੈਕਸ ਵਾਸਤੇ ਕਿੰਨੇ ਪੈਸੇ ਰੱਖਾਂ?" is "tell me how much to put aside for tax this month",
// which is the question this same router had answered in English twelve minutes earlier. The reply
// was "That question is in Punjabi and is not about your UK tax or business accounts", which is
// wrong on the only fact it asserts, and it asked her to come back in English.
//
// For a product whose stated audience is substantially South Asian, that is a brand failure sitting
// on top of a classification bug.
//
// ⚠️ THE FIX IS NOT TO TRANSLATE. We cannot yet write a tax answer in Punjabi we would stand
// behind, and a machine translated one about somebody's tax bill is worse than none. The fix is to
// ANSWER THE QUESTION, in English, and to apologise for the language rather than refuse the
// person. Detection here is script based and deliberately crude: it only decides which apology to
// attach, never whether to help.
const NON_LATIN_SCRIPTS: Array<[RegExp, string]> = [
  [/[਀-੿]/, 'Punjabi'],
  [/[ऀ-ॿ]/, 'Hindi'],
  [/[؀-ۿݐ-ݿ]/, 'Urdu or Arabic'],
  [/[ঀ-৿]/, 'Bengali'],
  [/[஀-௿]/, 'Tamil'],
  [/[Ѐ-ӿ]/, 'Russian'],
  [/[一-鿿]/, 'Chinese'],
];

export function detectScript(body: string): string | null {
  for (const [re, name] of NON_LATIN_SCRIPTS) {
    if (re.test(body)) return name;
  }
  return null;
}

// Prefixed to the real answer, never sent on its own.
export function languageApology(language: string): string {
  return `I can read your ${language} but I cannot write you a tax answer in it yet, and I am not `
    + 'going to guess at one in a language I cannot check. Here it is in English, and I am sorry '
    + 'about that.';
}

// --- The conversational floor -------------------------------------------------------------
//
// 🔴 EVERY UNRECOGNISED MESSAGE WAS TREATED AS A FAILED ATTEMPT TO LOG MONEY.
//
// That is what produced diesel and Dave for a greeting, for five tulips, for gibberish, and for a
// two thousand character rant about the council taking her loading bay. Each individual reply is
// defensible. The pattern is a product that cannot say hello to a florist.
//
// ⚠️ THE TEST IS WHETHER IT LOOKS LIKE AN ENTRY AT ALL, and that question was never asked. A
// message with no digits in it has not failed to be a money entry, because it was never trying.
export function looksLikeMoneyEntry(body: string): boolean {
  const b = body.trim();
  if (!/\d/.test(b)) return false;
  if (b.length > 400) return false; // nobody logs a receipt in four hundred characters
  return true;
}

export function isGreeting(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.?\s]+$/, '');
  if (t.length > 80) return false;
  return /^(hi|hey|hiya|hello|yo|alright|all ?right|morning|good morning|afternoon|good afternoon|evening|good evening|hi there|hey there)\b/.test(t)
    // "hiya is this the flower shop thing? my mate set me up on it"
    || /^(hi|hey|hiya|hello)\b.*\b(is this|what is this|who is this|set me up|signed me up)\b/.test(t);
}

// Emoji, punctuation, or a handful of characters with no words in them.
export function isNonWords(body: string): boolean {
  const t = body.trim();
  if (t.length === 0) return true;
  // Strip everything that is a letter or a digit in any script. What remains is decoration.
  const words = t.replace(/[^\p{L}\p{N}]/gu, '');
  return words.length === 0;
}

// ⚠️ A VENT IS NOT A REQUEST AND MUST NOT BE PARSED FOR ANYTHING. Long, no question mark, and no
// obvious ask. The rant that broke this was routed to the REMINDER parser, because it happened to
// contain "at half five" and "tuesday", and came back asking her to phrase her reminder better.
export function isVent(body: string): boolean {
  const b = body.trim();
  if (b.length < 300) return false;
  if (b.includes('?')) return false;
  return true;
}

export const VENT_REPLY =
  'That sounds like a rotten morning, and I am sorry. I am only your books, so I cannot do anything '
  + 'about the council, but if the ticket or anything else costs you money, send me the paperwork '
  + 'and I will keep it where you can find it.';

export function greetingReply(businessName: string | null): string {
  const who = businessName ? ` I have you as ${businessName}.` : '';
  return `Hello.${who} I keep your books: send me a photo of a receipt, tell me what you spent or `
    + 'took, or ask me anything about your tax and I will answer from your own figures.';
}

// --- British clock time -------------------------------------------------------------------
//
// 🔴 "half 7 in the morning" WAS CONFIRMED BACK AS 06:30.
//
// In British English "half seven" is half PAST seven, 07:30. The half-TO reading, 06:30, is the
// German and Dutch convention, and it is what a model reaches for when nothing tells it otherwise.
// The confirmation line said "I will remind you on Thu 13 Aug, 06:30" in its own words, so the
// product told her, in writing, that it had understood her and would wake her an hour early.
//
// ⚠️ NORMALISED BEFORE THE MODEL SEES IT, NOT FIXED AFTERWARDS. A deterministic rewrite is free,
// testable and cannot regress with a prompt change. The prompt gains a line too, as belt and
// braces, but this function is the guard.
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function hourFrom(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^\d{1,2}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 12 ? n : null;
  }
  return NUMBER_WORDS[t] ?? null;
}

export function normaliseBritishTime(body: string): string {
  let out = String(body ?? '');

  // "half seven", "half 7", "half past seven" -> "7:30". The "past" form is already unambiguous
  // and is rewritten too so both reach the model identically.
  out = out.replace(
    /\bhalf\s+(?:past\s+)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (whole, tok: string) => {
      const h = hourFrom(tok);
      return h === null ? whole : `${h}:30`;
    },
  );

  // "quarter past eight" -> "8:15"
  out = out.replace(
    /\bquarter\s+past\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (whole, tok: string) => {
      const h = hourFrom(tok);
      return h === null ? whole : `${h}:15`;
    },
  );

  // "quarter to nine" -> "8:45". Twelve wraps to eleven.
  out = out.replace(
    /\bquarter\s+to\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    (whole, tok: string) => {
      const h = hourFrom(tok);
      if (h === null) return whole;
      const prev = h === 1 ? 12 : h - 1;
      return `${prev}:45`;
    },
  );

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A COMPOUND QUESTION IS ANSWERED IN HALF, SILENTLY. RUN 6 finding F7, 16 August 2026.
//
// Maureen asked, in one message:
//
//   "can I claim a new carpet cleaning machine and what mileage rate do I get for the van"
//
// She got a long, correct and genuinely good answer about the vehicle: the two ways to run one,
// that it is one irreversible decision per vehicle for as long as she owns it, and a route to the
// screen that can price it on her own miles. AND NOT ONE WORD ABOUT THE MACHINE. No answer, and
// no acknowledgement that half the question had gone.
//
// BOTH LANES WORK. Asked on its own a minute later, the machine got the tools and equipment card,
// correct and honestly caveated. So this is not a broken lane. It is a first match router that
// takes ONE intent and discards the rest of the sentence without saying so.
//
// ⚠️ THE ORDERING BLOCK FIFTY LINES ABOVE THIS FILE'S DEADLINE LANE IS ABOUT SOMETHING ELSE, and
// that is why none of it caught this. Every word of it is about which of two OVERLAPPING lanes
// should win for ONE question: "when is my tax due" claimed by both the date lane and the money
// lane. Here the loser is not a rival reading of the same question. It is a SECOND QUESTION, and
// it simply vanishes.
//
// 🔴 THE FIX IS NOT "ANSWER BOTH". That puts a model where a deterministic lane is, and it turns
// one wrong answer into two. Doc 103's honesty test is the one being failed: the screen answered
// half of what she asked and let her believe it had answered all of it. She had no way to know the
// machine question was never heard.
//
// So this names what was not answered and nothing more. An unanswered question named is a customer
// who asks again. An unanswered question hidden is a customer who thinks she has her answer.
//
// ⚠️ AND IT IS DELIBERATELY DEAF TO WHICH LANE WON. Working that out would mean a second copy of
// the router's own order, in a file that is not the router, and a copy IS the defect this codebase
// keeps deleting. So the note never claims WHICH of the two is answered. It says one of them is,
// lists both in her own words, and asks for the other on its own. That sentence is true whichever
// lane the chain happened to take, today and after the next reordering.
//
// ⚠️ IT LIVES HERE, IN THE PURE MODULE, FOR THE REASON THE DEADLINE TIE BREAK DOES. Both channels
// gate on it: app/api/whatsapp/route.ts and app/api/thread/route.ts. A copy of these patterns in a
// route would be the second definition that goes stale.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// A part is an ASK if it names a question word, or leads with a modal aimed at the person asking.
// Deliberately narrow: a false positive here puts a puzzled note on an ordinary message, which is
// a worse trade than staying quiet on an odd phrasing.
const INTERROGATIVE = /\b(what|whats|which|how|when|why|who|where)\b/i;
const MODAL_ASK = /\b(can|could|should|do|does|did|am|is|are|will|would)\s+(i|it|we|my|this|that|a|an|the|they|you)\b/i;

function looksLikeAsk(part: string): boolean {
  const words = part.trim().split(/\s+/).filter(Boolean);
  // Under three words is a fragment, not a question. "and gloves" is not a second ask.
  if (words.length < 3) return false;
  return INTERROGATIVE.test(part) || MODAL_ASK.test(part);
}

/**
 * Split a message where a person would hear a join. Four: " and ", " also ", a question mark, and
 * a semicolon.
 *
 * ⚠️ " also " IS HERE BECAUSE I TESTED IT, AND THE FIRST DRAFT OF THIS COMMENT SAID THE OPPOSITE.
 *
 * It read: " also " and " plus " join clauses inside ONE thought far more often than they start a
 * second question, so leaving them out is the safe choice. That is a reasonable sentence and it is
 * not true. Run the seven realistic messages that carry the word through both versions and exactly
 * ONE changes: "can i claim boots also can i claim gloves", which is two questions and was being
 * answered in half. Every other one, including the message the old comment named as its evidence,
 * comes out identical, because the three word floor and the question word test in looksLikeAsk are
 * what hold the false positives back, not the shortness of this list.
 *
 * The sabotage pass is what caught it: a sabotage that ADDED " also " could not make anything go
 * red, and a sabotage that cannot bite means either the guard has a hole or the claim is wrong.
 * Here the claim was wrong.
 *
 * ⚠️ " plus " IS STILL OUT, AND NOW FOR A REASON I CAN STATE: no message in six customer weeks has
 * used it to join two questions, so there is nothing to test it against. A splitter deserves a
 * real message behind it, and that one has not turned up yet.
 */
export function splitAsks(body: string): string[] {
  return String(body ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .split(/\?|;|\s+and\s+|\s+also\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * The distinct asks in one message, or null if there is at most one. Null is the ordinary case and
 * the router carries on exactly as it always has.
 */
export function compoundAsk(body: string): string[] | null {
  const asks = splitAsks(body).filter(looksLikeAsk);
  if (asks.length < 2) return null;
  // Three is as many as anybody types and as many as is useful to read back.
  return asks.slice(0, 3).map((a) => (a.length > 90 ? `${a.slice(0, 87).trimEnd()}...` : a));
}

const COUNT_WORD: Record<number, string> = { 2: 'Two', 3: 'Three' };

/**
 * The note itself. Her own words back, and NO CLAIM ABOUT WHICH ONE GOT ANSWERED.
 *
 * ⚠️ "IF ONLY ONE OF THOSE IS ANSWERED" IS HEDGED ON PURPOSE AND THE HEDGE IS THE HONEST PART.
 * A flat "only one of those is answered" would be a statement this function cannot back. Most
 * lanes are deterministic and take exactly one reading, but the last lane on both channels is a
 * model, and a model given two questions sometimes answers both. Telling her one was dropped when
 * it was not is the same class of fault as saying nothing when it was: a sentence about her
 * message that is not true of her message. This wording is true either way, and it still does the
 * one job the finding asks of it, which is to make her look.
 */
export function compoundAskNote(asks: string[]): string {
  const listed = asks.map((a, i) => `${i + 1}. ${a}`).join('\n');
  return [
    `${COUNT_WORD[asks.length] ?? 'Several'} questions in one there, and I take them one at a time:`,
    '',
    listed,
    '',
    'If only one of those is answered, send me the other on its own and I will answer that one properly.',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 SCOTTISH RATES. B16 AND THE B2 INTERCEPT, 17 August 2026. THE FIRST LANE IN THIS FILE
// WRITTEN BECAUSE THE MODEL WAS WATCHED DISOBEYING AN INSTRUCTION, RATHER THAN LACKING ONE.
//
// B2 asked a live Glasgow sole trader's questions and got, minutes apart on one account: "you're in
// Scotland so your tax rates are the same as the rest of the UK", and then a band table with a 41%
// higher rate and no advanced rate. The first is false. The second matches no year in force.
//
// The rule that should have governed both was moved into the shared prompt block the same day, so
// both channels now carry it. That is mitigation and this is the gate. A question whose only correct
// answer is one fixed sentence should never reach a model, and every other question in this file
// that reads that way is already answered from code: the deadline, the totals, somebody else's
// money, his data rights, the van. This is the same shape, and it was the one left to a guess.
//
// ⚠️ TWO SIGNALS ARE REQUIRED, AND THAT IS THE WHOLE MATCHER. A nation word and a tax-or-rate word.
// Anything less takes messages that are not about this, and a stack of extra conditions is how a
// matcher stops hearing the man it was written for. See B2-F3: the product answered "Put by £X for
// tax" and could not hear "put by", because the list of phrasings was typed rather than derived.
//
// ⚠️ A FALSE POSITIVE HERE IS CHEAP AND A FALSE NEGATIVE IS NOT, WHICH SETS THE DIRECTION. Read it
// again: SCOTLAND_LINE is TRUE OF EVERY CUSTOMER, in Cardiff or Carlisle or Coatbridge, because it
// is a statement about what this product computes with and not about where he lives. So a Londoner
// who somehow trips this lane is told something accurate about his own product. A Scot who does not
// trip it is handed an invented band table. That asymmetry is why the nation list below is generous
// and why nothing is added to narrow it.
//
// ⚠️ THE CITY NAMES ARE A LIST AND A LIST ROTS, AND THEY ARE HERE ANYWAY. The corpus rule is that a
// person is recognised by SHAPE and not by a list of names, and it is the right rule for names of
// people, of which our customers will mention an unbounded number. A nation is not that: there are
// four, they do not change, and the real customer B2 walked opened with "am in glasgow mate". He
// never typed the word Scotland. A matcher that only hears the formal noun does not hear him.
//
// ⚠️ AND IT REFUSES THE THREE TAXES THAT ARE NOT DEVOLVED, WHICH IS THE ONE CONDITION THAT IS NOT
// OPTIONAL. Income tax rates and bands above the personal allowance are devolved. National
// Insurance, VAT and student loan repayment are NOT. Handing SCOTLAND_LINE to "is vat different in
// scotland" would answer a VAT question with an income tax caveat and imply his VAT figures are
// somebody else's, which is a new false statement in the place of the old one.
//
// It is deliberately NOT left to router order. On app/api/whatsapp/route.ts the VAT, National
// Insurance and student loan lanes all sit above this one and would claim those messages anyway.
// app/api/thread/route.ts HAS NO SUCH LANES, so order protects one channel and not the other, and
// one phrase getting two answers on two channels is the defect test/laneparity.test.mjs exists for.
// The refusal lives in the predicate, so it is true wherever the predicate is called.
//
// ⚠️ A MONEY AMOUNT CALLS IT OFF, exactly as isVatQuestion and isPricing do above and for the same
// reason: "paid 40 quid tax in glasgow" is a figure being logged, not a question about the bands.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The nation, as a Scot refers to it. Not a postcode: nothing in this product reads his postcode
// and lib/scotland.ts says so in terms, so the only signal is the word he chose to type.
const SCOTTISH_NATION_RE =
  /\b(?:scotland|scottish|scot(?:s|sman|smen)?|glasgow|edinburgh|aberdeen|dundee|inverness|stirling|paisley)\b/i;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE OTHER THREE NATIONS, FOR THE ANSWERS THAT ARE TRUE OF ALL FOUR. B20, 17 August 2026.
//
// SCOTTISH_NATION_RE above is deliberately Scotland only and must stay that way: income tax rates
// and bands above the personal allowance are devolved to SCOTLAND, Wales sets its rates equal to
// England's, and Northern Ireland does not set them at all. A matcher that heard "cardiff" and
// handed back SCOTLAND_LINE would be telling a Welshman his income tax is computed at somebody
// else's rates, which is false.
//
// VAT IS THE OPPOSITE CASE. It is reserved, it is identical in all four nations, and the sentence
// saying so is true of every customer who asks. So the VAT answer needs a wider ear than the income
// tax caveat does, and the two must not share one list or the next person to widen this widens the
// wrong one.
//
// ⚠️ A FALSE POSITIVE IS CHEAP HERE, WHICH SETS THE DIRECTION, exactly as it does for the Scottish
// list. Being told that VAT is the same wherever you are in the UK is true whether or not you asked
// from a nation, so a generous list can only ever add a true sentence to an answer. Being NOT heard
// is the expensive side: the real customer asked "am in glasgow, is vat different up here" and got
// three paragraphs that never said no.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const OTHER_NATION_RE =
  /\b(?:wales|welsh|cymru|cardiff|swansea|newport|northern ireland|belfast|londonderry|ulster|england|english|london)\b/i;

/**
 * He named a nation, any of the four, or a city that stands for one.
 *
 * For answers that are TRUE UK WIDE and are therefore worth saying to anyone who asked from a
 * nation. Never for the Scottish income tax caveat, which has its own narrower ear above.
 */
export function namesNation(body: string): boolean {
  return SCOTTISH_NATION_RE.test(body) || OTHER_NATION_RE.test(body);
}

// The subject. Broad on purpose, per the asymmetry above.
const TAX_RATE_RE =
  /\b(?:income tax|tax|taxed|rate|rates|band|bands|bracket|brackets|percent|per cent|threshold|thresholds)\b/i;

// The three that are reserved and not devolved. Any of these and this lane declines, so the
// question keeps going to the lane that owns it, or to the model, which has the correct rule.
const UK_WIDE_TAX_RE =
  /\b(?:national insurance|nics?|class\s*[24]|vat|value added tax|student loan|postgraduate)\b|\bni\b/i;

export function isScottishRatesQuestion(body: string): boolean {
  const b = body.trim();
  if (/£\s*\d/.test(b)) return false;
  if (UK_WIDE_TAX_RE.test(b)) return false;
  if (!SCOTTISH_NATION_RE.test(b)) return false;
  return TAX_RATE_RE.test(b);
}
