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
