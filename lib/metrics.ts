// THE NUMBERS THE BUSINESS IS ACTUALLY RUN ON.
//
// ---------------------------------------------------------------------------------------------
// THE RULE THAT GOVERNS THIS WHOLE FILE, AND IT IS THE SAME ONE KHOJI RUNS ON:
//
//   NOT KNOWING IS NOT THE SAME AS BEING FINE.
//
// A dashboard's job is not to fill every box with a number. It is to tell you what is true, and to
// say so plainly when it does not know. Two things follow from that, and they are the reason this
// file exists rather than a handful of SQL counts.
//
// 1. WE CANNOT KNOW WHAT MRR WAS LAST TUESDAY. Nobody wrote it down. A subscription row holds its
//    CURRENT status and its LAST update, so a man who subscribed in June and cancelled in July looks
//    identical to a man who never subscribed at all. Any "MRR over time" chart drawn from that data
//    would be a reconstruction, and a reconstruction on a founder's revenue chart is a lie with a
//    trend line on it.
//
//    So: we start writing it down TODAY (metrics_daily), and until there is history, the chart says
//    "history starts today" instead of drawing a shape.
//
// 2. TWO CUSTOMERS IS NOT A CONVERSION RATE. With one trial and one conversion, "100%" is not a
//    fact, it is a coin landing heads. Every rate on this page carries a CONFIDENCE, and below the
//    threshold the page prints "too few to mean anything" rather than a confident percentage. A
//    founder who trusts a 100% conversion rate off one data point will spend money he does not have.
// ---------------------------------------------------------------------------------------------

// Below this many observations, a percentage is noise. It is not a hard statistical bound, it is a
// blunt instrument, and a blunt instrument that stops you fooling yourself beats a precise one that
// does not.
export const ENOUGH = 20;

export interface Confidence {
  enough: boolean;
  n: number;
  note: string;
}

export function confidence(n: number): Confidence {
  if (n === 0) return { enough: false, n, note: 'Nothing to measure yet.' };
  if (n < ENOUGH) {
    return {
      enough: false,
      n,
      note: `Only ${n}. Too few to mean anything: one more either way swings this by ${Math.round(100 / n)} points.`,
    };
  }
  return { enough: true, n, note: `Based on ${n}.` };
}

// A rate you may only read if there is enough behind it. Returns null when there is not, so the
// caller has to handle "we do not know" and cannot accidentally render a confident 100%.
export function rate(numerator: number, denominator: number): { pct: number | null; conf: Confidence } {
  const conf = confidence(denominator);
  if (denominator === 0) return { pct: null, conf };
  const pct = Math.round((numerator / denominator) * 1000) / 10; // one decimal
  return { pct: conf.enough ? pct : null, conf };
}

// --- Time series from real rows ---------------------------------------------------------------
//
// These ARE knowable, because a created_at is written once and never changes. A signup that happened
// on 3 July happened on 3 July, and no amount of later cancelling rewrites that. So the signups
// chart is real history, and it is the only historical chart on the page that is.

export interface Point {
  day: string;   // YYYY-MM-DD
  n: number;     // that day
  total: number; // running total
}

export function daily(dates: Array<string | null | undefined>, days = 30, now: Date = new Date()): Point[] {
  const counts = new Map<string, number>();
  let before = 0; // everything older than the window, so the running total starts honest

  const first = new Date(now.getTime() - (days - 1) * 86_400_000);
  const firstDay = first.toISOString().slice(0, 10);

  for (const d of dates) {
    if (!d) continue;
    const day = String(d).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (day < firstDay) { before++; continue; }
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const out: Point[] = [];
  let total = before;
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const n = counts.get(day) ?? 0;
    total += n;
    out.push({ day, n, total });
  }
  return out;
}

// --- The funnel -------------------------------------------------------------------------------
//
// The one number that decides whether there is a business: of the men who START a trial, how many
// PAY. At £12.99 with a fortnight free, 20% is a company and 5% is not, and nothing else you build
// fixes that.

export interface FunnelRow {
  status: string;
  stripeId: string | null;
  internal: boolean;
}

export interface Funnel {
  trialsStarted: number;
  converted: number;
  stillTrialing: number;
  lapsed: number;          // the trial ended and they never paid
  conversion: { pct: number | null; conf: Confidence };
}

export function funnel(rows: FunnelRow[]): Funnel {
  const real = rows.filter((r) => !r.internal);

  // EVERY man who has ever had a trial. A trial he has since converted or abandoned still counts:
  // the denominator of a conversion rate is everybody who ENTERED, not everybody still standing
  // there. Getting this wrong is the classic way to publish a flattering number.
  const trialsStarted = real.length;

  const converted = real.filter((r) => r.status === 'active' || r.status === 'past_due').length;
  const stillTrialing = real.filter((r) => r.status === 'trialing').length;
  const lapsed = real.filter((r) => r.status === 'canceled' || r.status === 'none' || r.status === 'unpaid').length;

  // ⚠️ THE DENOMINATOR EXCLUDES THE MEN STILL DECIDING. A man three days into his trial has not
  // failed to convert. He simply has not finished. Counting him as a failure understates conversion
  // and is the mirror image of the flattering error above: it is still a lie, it just makes us feel
  // worse rather than better.
  const decided = converted + lapsed;

  return {
    trialsStarted,
    converted,
    stillTrialing,
    lapsed,
    conversion: rate(converted, decided),
  };
}

// --- Which channel actually pays ---------------------------------------------------------------
//
// "Where did they come from" is a vanity metric. Meta can bring ten men who all cancel; a referral
// can bring two who stay for years. COST PER ACQUISITION IS VANITY. Cost per RETAINED customer is
// the business.

export interface ChannelRow {
  source: string;
  status: string;
  internal: boolean;
}

export interface Channel {
  source: string;
  came: number;
  paying: number;
  conversion: { pct: number | null; conf: Confidence };
}

export function byChannel(rows: ChannelRow[]): Channel[] {
  const real = rows.filter((r) => !r.internal);
  const groups = new Map<string, ChannelRow[]>();
  for (const r of real) {
    const g = groups.get(r.source) ?? [];
    g.push(r);
    groups.set(r.source, g);
  }

  return [...groups.entries()]
    .map(([source, g]) => {
      const paying = g.filter((r) => r.status === 'active' || r.status === 'past_due').length;
      return { source, came: g.length, paying, conversion: rate(paying, g.length) };
    })
    .sort((a, b) => b.came - a.came);
}

// --- The snapshot we write down every day ------------------------------------------------------
//
// This is the only way MRR gets a history: by us recording it, every day, from today. There is no
// way to recover the past, and the page must say so rather than draw a line it invented.

export interface Snapshot {
  day: string;
  customers: number;
  paying: number;
  trialing: number;
  mrr_pence: number;
}

// A chart of one point is not a chart. Say so.
export function historyNote(snaps: Snapshot[]): string | null {
  if (snaps.length === 0) return 'No history yet. We started writing this down today, and there is no way to recover what came before.';
  if (snaps.length < 3) return `History starts here. ${snaps.length} ${snaps.length === 1 ? 'day' : 'days'} recorded so far. There is no way to recover what came before.`;
  return null;
}
