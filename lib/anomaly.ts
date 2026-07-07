// lib/anomaly.ts. The "an accountant would have caught that" layer.
//
// Pure, deterministic, no AI, no network. It scans a user's own confirmed
// entries and flags the handful of things a careful bookkeeper would query:
// a receipt logged twice, an expense with no category, an amount far bigger
// than the norm, a date in the future, a big round figure with no vendor.
//
// Doctrine: it never changes anything. It surfaces a question for the user to
// answer, exactly like the rest of Lekhio. Low false positives are the whole
// point; a checker that cries wolf gets muted, so every rule here is
// conservative and quantified. Unit tested in test/anomaly.test.mjs.

export interface AnomalyTx {
  id?: string; // optional, when the caller selected it, for deep links
  amount: number; // signed: negative is an expense, positive is income
  category: string | null;
  vendor: string | null;
  transaction_date: string; // YYYY-MM-DD
  cis_deduction?: number | null;
  income_type?: string | null;
}

export type AnomalySeverity = 'high' | 'medium' | 'low';

export interface Anomaly {
  key: string; // rule key
  severity: AnomalySeverity;
  title: string;
  detail: string; // plain English, the user's own figures
  when: string; // the entry date it concerns, YYYY-MM-DD
  amount: number; // the absolute pound figure it concerns
  ids: string[]; // the transaction ids involved, when known
}

// Tunables. Conservative on purpose.
const DUP_WINDOW_DAYS = 5; // a repeat within this many days is a likely duplicate
const UNCATEGORISED_MIN = 50; // an uncategorised expense worth asking about
const OUTLIER_MULTIPLE = 4; // this many times the category median is unusual
const OUTLIER_MIN_SAMPLE = 4; // need this many in a category before calling an outlier
const OUTLIER_MIN_ABS = 250; // and it must be at least this big in absolute terms
const NO_VENDOR_MIN = 500; // a big expense with no vendor looks like a placeholder

const UNCATEGORISED = new Set(['', 'other', 'uncategorised', 'uncategorized', 'misc', 'general']);

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

function normVendor(v: string | null): string {
  return (v ?? '').trim().toLowerCase();
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
  return Math.round(ms / 86400000);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Find every anomaly, most important first. Pure: same input, same list.
// `todayISO` makes the future-date check and the window deterministic.
export function findAnomalies(txns: AnomalyTx[], todayISO: string): Anomaly[] {
  const out: Anomaly[] = [];
  const expenses = txns.filter((t) => t.amount < 0);
  const idOf = (t: AnomalyTx): string[] => (t.id ? [t.id] : []);

  // 1. Duplicate: same vendor and same rounded amount within a few days. The
  //    single most common real bookkeeping error, a receipt sent twice.
  const seen = new Map<string, AnomalyTx>();
  for (const t of expenses) {
    const v = normVendor(t.vendor);
    if (!v) continue; // need a vendor to be confident it is the same spend
    const key = `${v}|${Math.abs(round(t.amount))}`;
    const prior = seen.get(key);
    if (prior && daysBetween(prior.transaction_date, t.transaction_date) <= DUP_WINDOW_DAYS) {
      const amt = Math.abs(round(t.amount));
      out.push({
        key: 'duplicate',
        severity: 'high',
        title: 'Looks like the same receipt twice',
        detail: `Two expenses of £${amt.toLocaleString('en-GB')} at ${t.vendor} within ${DUP_WINDOW_DAYS} days. If that is one purchase logged twice, it is inflating your costs. Worth a quick look.`,
        when: t.transaction_date,
        amount: amt,
        ids: [...idOf(prior), ...idOf(t)],
      });
    }
    seen.set(key, t);
  }

  // 2. Uncategorised expense over the floor. Category drives the tax treatment,
  //    so an uncategorised cost is a cost that may not be claimed correctly.
  for (const t of expenses) {
    const cat = (t.category ?? '').trim().toLowerCase();
    if (UNCATEGORISED.has(cat) && Math.abs(t.amount) >= UNCATEGORISED_MIN) {
      const amt = Math.abs(round(t.amount));
      out.push({
        key: 'uncategorised',
        severity: 'medium',
        title: 'An expense with no category',
        detail: `£${amt.toLocaleString('en-GB')}${t.vendor ? ` at ${t.vendor}` : ''} on ${t.transaction_date} has no category. Categorising it makes sure it lands in the right place on your return. Reply with what it was for and Lekhio sorts it.`,
        when: t.transaction_date,
        amount: amt,
        ids: idOf(t),
      });
    }
  }

  // 3. Outlier: an expense far above the norm for its own category. Often a
  //    capital item (a tool, a van) that is claimed differently, or a typo.
  const byCat = new Map<string, AnomalyTx[]>();
  for (const t of expenses) {
    const cat = (t.category ?? '').trim().toLowerCase();
    if (!cat || UNCATEGORISED.has(cat)) continue;
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(t);
  }
  for (const [cat, list] of byCat) {
    if (list.length < OUTLIER_MIN_SAMPLE) continue;
    const amounts = list.map((t) => Math.abs(t.amount));
    const med = median(amounts);
    if (med <= 0) continue;
    for (const t of list) {
      const amt = Math.abs(t.amount);
      if (amt >= OUTLIER_MIN_ABS && amt >= med * OUTLIER_MULTIPLE) {
        out.push({
          key: 'outlier',
          severity: 'medium',
          title: 'An unusually large entry',
          detail: `£${round(amt).toLocaleString('en-GB')} on ${t.transaction_date} is well above your usual ${cat} spend (about £${round(med).toLocaleString('en-GB')}). If it is a bigger piece of kit like a tool or a van, it may be claimed differently and could save you more. Worth checking.`,
          when: t.transaction_date,
          amount: round(amt),
          ids: idOf(t),
        });
      }
    }
  }

  // 4. Future dated. A date in the future is almost always a slip of the finger
  //    and can push a cost into the wrong tax year.
  for (const t of txns) {
    if (t.transaction_date > todayISO) {
      const amt = Math.abs(round(t.amount));
      out.push({
        key: 'future_dated',
        severity: 'medium',
        title: 'An entry dated in the future',
        detail: `An entry of £${amt.toLocaleString('en-GB')}${t.vendor ? ` at ${t.vendor}` : ''} is dated ${t.transaction_date}, which is in the future. If that is a typo it belongs in a different period. Worth fixing.`,
        when: t.transaction_date,
        amount: amt,
        ids: idOf(t),
      });
    }
  }

  // 5. A big expense with no vendor. Usually a placeholder or an estimate that
  //    never got the real detail, and it will not stand up if HMRC asks.
  for (const t of expenses) {
    if (!normVendor(t.vendor) && Math.abs(t.amount) >= NO_VENDOR_MIN) {
      const amt = Math.abs(round(t.amount));
      out.push({
        key: 'no_vendor',
        severity: 'low',
        title: 'A large expense with no supplier',
        detail: `£${amt.toLocaleString('en-GB')} on ${t.transaction_date} has no supplier name. For a cost this size it is worth having the receipt and the who, so it holds up if it is ever queried.`,
        when: t.transaction_date,
        amount: amt,
        ids: idOf(t),
      });
    }
  }

  // Most serious first, then most recent first.
  const rank: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.when < b.when ? 1 : -1));
}

// A one line headline for the app card and the WhatsApp nudge.
export function summariseAnomalies(list: Anomaly[]): string {
  if (list.length === 0) return 'Your books look clean. Nothing needs a second look.';
  const n = list.length;
  const high = list.filter((a) => a.severity === 'high').length;
  const lead = high > 0 ? `${high} worth a proper look` : `${n} worth a quick look`;
  return `${n} ${n === 1 ? 'thing' : 'things'} to check, ${lead}.`;
}
