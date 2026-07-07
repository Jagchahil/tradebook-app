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

export function matchAck(body: string): 'yes' | 'no' | null {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  if (/^(yes|yep|yeah|ok|okay|k|sure|fine|done|will do|👍|sounds good)$/.test(t)) return 'yes';
  if (/^(no|nope|nah|not yet|dont|don't)$/.test(t)) return 'no';
  return null;
}

// --- Opting out of and back into the nudge texts ------------------------------
export function matchStopStart(body: string): 'stop' | 'start' | null {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  if (/^(stop|unsubscribe|opt out|stop texting me|stop messaging me|stop the reminders|stop reminders|no more reminders|leave me alone|mute)$/.test(t)) return 'stop';
  if (/^(start|resume|opt in|start reminders|turn reminders (back )?on|unmute)$/.test(t)) return 'start';
  return null;
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

// --- Deadline questions -----------------------------------------------------------
export function isDeadlineQuestion(body: string): boolean {
  const b = body.trim().toLowerCase();
  if (!/\b(when|deadline|due|by when)\b/.test(b)) return false;
  return /\b(tax|return|quarter|quarterly|update|mtd|self assessment|file|filing|submit|payment on account)\b/.test(b);
}

// The MTD quarterly update deadlines: 7 Aug, 7 Nov, 7 Feb, 7 May. Returns the
// next one after `now` plus the standard Self Assessment date, as reply text.
export function deadlineAnswer(now: Date = new Date()): string {
  const y = now.getFullYear();
  const candidates = [
    new Date(Date.UTC(y, 1, 7)), // 7 Feb
    new Date(Date.UTC(y, 4, 7)), // 7 May
    new Date(Date.UTC(y, 7, 7)), // 7 Aug
    new Date(Date.UTC(y, 10, 7)), // 7 Nov
    new Date(Date.UTC(y + 1, 1, 7)),
  ];
  const next = candidates.find((d) => d.getTime() > now.getTime()) ?? candidates[candidates.length - 1];
  const nextStr = next.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  return [
    `Your next quarterly update is due by ${nextStr}. The quarterly dates are 7 August, 7 November, 7 February and 7 May.`,
    'Keep sending me your receipts and income as you go and the summary prepares itself. You approve everything before anything is sent to HMRC.',
  ].join('\n\n');
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

// Reply for an NI question, from the year to date profit and optional salary.
export function niAnswer(input: {
  profit: number;
  salary: number;
  class1: number;
  class4: number;
  class2Annual: number;
  qualifies: boolean;
  voluntarySuggested: boolean;
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
  if (input.voluntarySuggested) {
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

export function matchGoalSet(body: string): GoalSet | null {
  const low = body.trim().toLowerCase();
  if (!/\b(my goal is|new goal|goal:|i am saving (for|up)|i'm saving (for|up)|saving up for)\b/.test(low)) return null;
  const amount = extractMoneyAmount(low);
  if (!amount) return null;
  const kind: GoalSet['kind'] = /\b(earn|make|turnover|income)\b/.test(low)
    ? 'income'
    : /\b(save|savings|buffer|rainy)\b/.test(low)
      ? 'savings'
      : 'purchase';
  // The title is what remains once the trigger phrase, the amount and filler
  // words are stripped: "my goal is a van for 24k" leaves "van".
  const title = low
    .replace(/\b(my goal is|new goal|goal:|i am saving (for|up)|i'm saving (for|up)|saving up for)\b/g, ' ')
    .replace(/£?\s*\d+(?:[,.]\d+)?\s*k?\b/g, ' ')
    .replace(/\b(for|of|a|an|to|buy|get|save|the|new)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { kind, title: title || 'my goal', amount };
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
