// THE TEAM DASHBOARD, AND THE ONE PROMISE IT MUST NOT BREAK.
//
// ---------------------------------------------------------------------------------------------
// READ THIS BEFORE ADDING A SINGLE COLUMN TO THE CUSTOMER LIST
//
// The app's own settings screen says this to every user, in these words:
//
//     "Your records are encrypted and only you can see them."
//
// The moment this dashboard can show a man's receipts, his income, his tax bill, or the figure he
// owes in January, THAT SENTENCE BECOMES A LIE. Not "technically defensible". A lie. And doc 104's
// standing question is: is it true? Not is it defensible. True.
//
// So the team sees WHO the customer is and WHAT HE PAYS US. Never what he earns, never what he
// spends, never a single one of his transactions. Not because it would be hard to build. Because
// we told him we would not.
//
// It is also the only version of this that survives a leaked team login. One stolen password
// exposes a list of names and subscription states, which is bad. The alternative exposes the tax
// affairs of every tradesman who trusted us, which is the end of the company.
//
// THE ALLOWLIST BELOW IS THE ENFORCEMENT. It is not a convention, it is not a habit, and it is not
// a code review. It is a hard list, it is what the SQL select is built from, and there is a test
// (test/team.test.mjs) that fails the build if a financial column ever appears in it.

// EXACTLY the columns the team may see of a customer. Adding to this list is a decision about
// whether we keep our word, not a feature.
export const CUSTOMER_COLUMNS = [
  'id',
  'name',
  'trade_type',
  'created_at',
  'acquisition_source',
  'acquisition_detail',
] as const;

// The columns that must NEVER appear in that list, and the test enforces it. This is deliberately
// a denylist ON TOP OF an allowlist: belt and braces, because the cost of getting it wrong is not
// a bug, it is a broken promise and a UK GDPR problem.
//
// phone_number is on here and that surprises people. It is how a man is identified in this
// product, it is personal data, and the team has no operational need for it: support happens on
// WhatsApp, where he messaged us first. If we ever DO need it, that is a conversation and a
// changed promise, not a quiet extra column.
export const FORBIDDEN_CUSTOMER_COLUMNS = [
  'phone_number',
  'amount',
  'vendor',
  'category',
  'transactions',
  'income',
  'expenses',
  'profit',
  'tax',
  'cis_deduction',
  'receipt_url',
  'raw_input_url',
  'employment_income',
  'bank_token',
  'access_token',
] as const;

export type AcquisitionSource =
  | 'meta'
  | 'organic'
  | 'billboard'
  | 'in_person'
  | 'referral'
  | 'unknown';

export const SOURCES: AcquisitionSource[] = ['meta', 'organic', 'billboard', 'in_person', 'referral', 'unknown'];

const LABELS: Record<AcquisitionSource, string> = {
  meta: 'Meta ads',
  organic: 'Organic post',
  billboard: 'Billboard',
  in_person: 'In person',
  referral: 'Referral',
  unknown: 'Unknown',
};

// A source we did not recognise is 'unknown'. It is NOT dropped and it is NOT guessed at. A man who
// arrived by a route we forgot to name still arrived, and a marketing report that quietly discards
// the rows it cannot classify is a marketing report that will send the budget to the wrong place.
export function normaliseSource(raw: string | null | undefined): AcquisitionSource {
  const s = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (SOURCES as string[]).includes(s) && s !== 'unknown' ? (s as AcquisitionSource) : 'unknown';
}

export function sourceLabel(raw: string | null | undefined): string {
  return LABELS[normaliseSource(raw)];
}

// --- What the team is allowed to know about a customer ----------------------------------------

export interface TeamCustomer {
  id: string;
  name: string | null;
  trade: string | null;
  joined: string | null;
  source: AcquisitionSource;
  sourceDetail: string | null;
  // From the subscription, which is OUR money, not his.
  status: string;            // trialing | active | past_due | canceled | none
  plan: string | null;
  renews: string | null;
  cancelRequested: boolean;
  // WHAT HE IS ACTUALLY BEING CHARGED, IN PENCE. Not what his plan is called.
  //
  // ⚠️ THE DASHBOARD LIED ABOUT MRR ON ITS FIRST DAY, and this field is why it will not again.
  //
  // overview() used to look the price up from a table keyed on the plan NAME: plan 'monthly' meant
  // £12.99, always. So the demo account we created for Apple, which is a LOCAL GRANT with
  // amount_pence = 0 and can never be billed by anyone, was counted as £12.99 of monthly recurring
  // revenue. Zero real customers, and the dashboard said £13 MRR.
  //
  // A founder reading his own MRR off a screen that is inventing it is the worst possible version
  // of a green light with nothing behind it. Now we read what Stripe says we are charging, and a
  // comp is worth exactly what it is worth: nothing.
  amountPence: number;
  // A local grant with no Stripe id: the demo account, or a comp. Real to us, not revenue.
  internal: boolean;
}

export interface TeamMember {
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
}

export function isTeam(m: TeamMember | null | undefined): boolean {
  return Boolean(m && m.is_active);
}

// --- The numbers the team actually runs the business on ---------------------------------------
//
// These are OUR figures: how many customers, what they pay us, where they came from. Not one of
// them is a fact about any individual's money.

export interface TeamOverview {
  customers: number;        // real customers. The demo account and comps are NOT customers.
  internal: number;         // us. Shown, but never counted as a customer or as revenue.
  trialing: number;
  active: number;
  pastDue: number;
  canceled: number;
  cancelRequested: number;
  mrrPence: number;
  bySource: Record<AcquisitionSource, number>;
}

const PAYING = new Set(['active', 'past_due']);

// The annual plan is paid once but earned over twelve months. So an annual subscriber's amount_pence
// is the YEARLY figure, and putting it straight into a MONTHLY recurring revenue total would
// overstate him by a factor of twelve. Divide it, the way every honest SaaS dashboard does.
export function monthlyValue(c: TeamCustomer): number {
  if (!PAYING.has(c.status)) return 0;   // a trial is not revenue. A cancelled man is not revenue.
  if (c.internal) return 0;              // a comp is worth what a comp is worth.
  if (!c.amountPence) return 0;          // nothing is being charged. Say so.
  return c.plan === 'annual' ? Math.round(c.amountPence / 12) : c.amountPence;
}

export function overview(customers: TeamCustomer[]): TeamOverview {
  const bySource = Object.fromEntries(SOURCES.map((s) => [s, 0])) as Record<AcquisitionSource, number>;

  let real = 0, internal = 0;
  let trialing = 0, active = 0, pastDue = 0, canceled = 0, cancelRequested = 0, mrrPence = 0;

  for (const c of customers) {
    // US, NOT THEM. The demo account we built for Apple is a person in the database and it is not a
    // customer. Counting it as one is how "2 customers" appears on a screen on a day when nobody has
    // ever paid us. Every number below skips it, and the dashboard shows it separately so nobody
    // wonders where it went.
    if (c.internal) { internal++; continue; }
    real++;

    // NORMALISE AGAIN, even though readTeamCustomers already did.
    //
    // This function is pure and it trusts nobody. It used to do `bySource[c.source]++` straight off
    // the row, and a source string it did not recognise would QUIETLY CREATE A NEW BUCKET named
    // after itself. The totals still rendered. They just no longer added up to the customer count,
    // and a marketing report that silently loses rows is how an advertising budget ends up being
    // spent on the wrong channel. Caught by the "sources add up" test, which is why that test exists.
    const src = normaliseSource(c.source);
    bySource[src] = (bySource[src] ?? 0) + 1;

    switch (c.status) {
      case 'trialing': trialing++; break;
      case 'active': active++; break;
      case 'past_due': pastDue++; break;
      case 'canceled': canceled++; break;
      default: break;
    }
    if (c.cancelRequested) cancelRequested++;

    // WHAT WE ARE ACTUALLY BEING PAID. Read off the subscription, not looked up from the plan's name.
    mrrPence += monthlyValue(c);
  }

  return {
    customers: real,
    internal,
    trialing, active, pastDue, canceled, cancelRequested,
    mrrPence,
    bySource,
  };
}
