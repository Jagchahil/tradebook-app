// lib/messagecost.ts. What a month of outbound WhatsApp actually costs, per customer, and the
// margin arithmetic that reads it against the floor.
//
// THE SETTLED POLICY THIS FILE ENCODES, in the founder's words:
//
//   WhatsApp stays as the gateway. Total margin must stay above 80 percent. From 1 October 2026
//   Meta charges for free form service replies inside the 24 hour window at roughly the utility
//   rate (UK about 2.2p per message, INFERRED from industry sources, exact per market rates
//   published by 1 September). Template alerts at 4p to 13p a month are approved spend. The answer
//   to a heavy user is routing, never a cap on the customer. Cost per customer must be visible BY
//   NAME on /team before a Meta invoice says it in aggregate.
//
// The file has two halves and the line between them is hard:
//
//   1. PURE. Price constants and arithmetic. No IO, no environment beyond what lib/margin.ts
//      already reads, so every number the console shows is unit testable in isolation.
//   2. IO. One accessor that reads the month's observed per customer counts from Supabase and
//      returns rows the team surface may show. The phone number is used as a join key on the
//      server and DROPPED before anything is returned: the team surface never sees a phone and
//      never sees a customer's own figures. A cost WE spent on him is OUR figure and is allowed.
//      Nothing else of his leaves here. See lib/team.ts and test/messagecost.test.mjs.
//
// ⚠️ WHAT IS OBSERVED AND WHAT IS MODELLED, because the console must not blur them.
//
// Outbound sends are NOT logged per customer anywhere today. The only durable send counter is the
// GLOBAL daily one (public.ai_usage, scope 'wa_send', key 'global', bumped by the cron fan outs),
// and the webhook's free form service replies are not counted at all, because they were free when
// it was written. What IS observed per customer, per day, in public.ai_usage:
//
//   scope 'phone'  one row per phone per day: paid AI calls attempted (the budget bump)
//   scope 'wamsg'  one row per phone per day: inbound WhatsApp messages (the message cap bump)
//
// So this module OBSERVES inbound messages and AI calls, and MODELS service replies as one reply
// per inbound message, which is the floor of what we actually send (several handlers send two).
// The rows say so honestly.
//
// PROPOSED, NOT BUILT HERE (the send path is off limits in this change): count real outbound sends
// per customer by bumping the existing race safe counter at the one place every send already
// passes through, graphSend in lib/whatsapp.ts, via add_ai_usage('wa_out', <phone>, 1) on a
// success. Or, if a kind split is wanted, a dedicated table:
//
//   create table public.wa_outbound (
//     day   date    not null default current_date,
//     phone text    not null,
//     kind  text    not null check (kind in ('service', 'template')),
//     n     integer not null default 0,
//     primary key (day, phone, kind)
//   );  -- service only, no policies, same shape and sweep as ai_usage
//
// The day that lands, readCustomerCostMonth switches to the observed counts and the modelled
// column dies. Diary note: check Meta's published UK per message rate on 1 SEPTEMBER 2026 and set
// WA_COST_PER_MESSAGE_PENCE to the real figure; the 2.2p below is inferred, not from Meta.

import {
  REVENUE_PENCE_PER_USER_MONTH,
  FIXED_COGS_PENCE_PER_USER_MONTH,
  MARGIN_FLOOR_PCT,
  PER_MESSAGE_PRICING_FROM,
  costPerAiCallPence,
  costPerMessagePence,
  outboundCostPence,
  perMessagePricing,
  projectedMarginPct,
} from './margin';

// --- the price constants -----------------------------------------------------------------------

// UK service reply, per message, from 1 October 2026. ⚠️ INFERRED from industry sources; Meta's own
// pricing page still calls service messages free and has promised exact per market rates by
// 1 September 2026. The LIVE dial is lib/margin.ts costPerMessagePence() (env overridable); this
// constant states the policy figure and a test pins the two equal so they cannot drift apart.
export const SERVICE_REPLY_PENCE = 2.2;
export const SERVICE_REPLY_PENCE_INFERRED = true;

// Template alerts (utility templates: reminders, digests, nudges). At UK utility rates a normal
// month of them costs 4p to 13p per customer, and the founder approved that band as spend worth
// making. It is a BAND for the whole template mix, not a per message price.
export const TEMPLATE_ALERTS_APPROVED_PENCE_PER_MONTH = { min: 4, max: 13 } as const;

// Re-exported so a caller of this module can state the policy without importing two files.
export { REVENUE_PENCE_PER_USER_MONTH, MARGIN_FLOOR_PCT, PER_MESSAGE_PRICING_FROM };

// --- the margin arithmetic (pure) --------------------------------------------------------------

// Everything COGS may spend per customer per month at the 80 percent floor: 1075p net revenue
// leaves 215p. This is the floor's budget, not the 82 percent target's (lib/margin.ts holds that).
export function cogsBudgetAtFloorPence(): number {
  return REVENUE_PENCE_PER_USER_MONTH * (1 - MARGIN_FLOOR_PCT / 100);
}

// What is left for WhatsApp and AI once the fixed 49p (Stripe, OTP, infra) is paid: 166p.
export function variableBudgetAtFloorPence(): number {
  return Math.max(cogsBudgetAtFloorPence() - FIXED_COGS_PENCE_PER_USER_MONTH, 0);
}

// What N service replies cost in the regime in force. Zero before 1 October 2026; N x 2.2p after,
// which is how a twenty message conversation becomes roughly 44p.
export function repliesCostPence(n: number, now: Date = new Date()): number {
  return Math.max(0, n) * outboundCostPence('service', now);
}

// A month's outbound message cost: service replies plus template alerts, each at its own rate.
export interface OutboundMonth {
  serviceReplies: number;
  templateAlerts: number;
}
export function messageCostPence(m: OutboundMonth, now: Date = new Date()): number {
  return repliesCostPence(m.serviceReplies, now) + Math.max(0, m.templateAlerts) * outboundCostPence('proactive', now);
}

// The margin one customer's month actually ran at, given what we spent on him. Same arithmetic as
// lib/margin.ts projectedMarginPct, reused rather than restated so the two can never disagree.
export function customerMarginPct(aiPence: number, messagePence: number): number {
  return projectedMarginPct(messagePence, aiPence);
}

// Read against the FLOOR, which is the promise, not against the 82 target, which is the headroom.
export function floorBreached(aiPence: number, messagePence: number): boolean {
  return customerMarginPct(aiPence, messagePence) < MARGIN_FLOOR_PCT;
}

// How many service replies a month one customer can have before HE ALONE breaches the 80 floor,
// after his AI and template spend. Infinity before 1 October (replies are free). NOT a cap to
// enforce on him: the settled policy is that the answer to a heavy user is routing, never a cap on
// the customer. It is the number that says when the channel is the wrong shape.
export function repliesWithinFloor(aiPence: number, templatePence = 0, now: Date = new Date()): number {
  const per = outboundCostPence('service', now);
  if (per <= 0) return Number.POSITIVE_INFINITY;
  const left = variableBudgetAtFloorPence() - Math.max(0, aiPence) - Math.max(0, templatePence);
  return Math.max(0, Math.floor(left / per));
}

// Pence for a human. Under a pound it stays in pence ("2.2p", "44p"); from a pound up it turns
// into pounds ("£2.29"). Rounded so IEEE 754 tails (2.2 x 3 is 6.6000000000000005) never reach a
// screen. In the numbers sweep (test/numbers.test.mjs) like every sentence bearing a figure.
export function pencePretty(pence: number): string {
  if (!Number.isFinite(pence) || pence <= 0) return '0p';
  if (pence < 100) {
    const p = Math.round(pence * 10) / 10;
    return `${p}p`;
  }
  return `£${(pence / 100).toFixed(2)}`;
}

// --- the per customer month (IO) ---------------------------------------------------------------

// EXACTLY the fields a cost row may carry to the team surface. The discipline is lib/team.ts's:
// an allowlist the test checks against FORBIDDEN_CUSTOMER_COLUMNS, so a phone number or a
// customer's own figure cannot drift in one busy afternoon. id and name are already team visible
// (CUSTOMER_COLUMNS); every other field is OUR spend on him, which is OUR figure.
export const COST_ROW_FIELDS = [
  'id',
  'name',
  'aiCalls',
  'inboundMessages',
  'serviceRepliesModelled',
  'aiPence',
  'messagePenceNow',
  'messagePenceFromOct',
  'marginNowPct',
  'marginFromOctPct',
  'repliesWithinFloor',
] as const;

export interface CustomerCostRow {
  id: string;                      // the user id, or 'unmatched' for strangers texting the number
  name: string | null;
  aiCalls: number;                 // OBSERVED: ai_usage scope 'phone', summed over the month
  inboundMessages: number;         // OBSERVED: ai_usage scope 'wamsg', summed over the month
  serviceRepliesModelled: number;  // MODELLED: one reply per inbound message, the floor of reality
  aiPence: number;                 // observed calls x the blended per call cost from the price book
  messagePenceNow: number;         // the month under the regime in force today
  messagePenceFromOct: number;     // the SAME month under per message pricing
  marginNowPct: number;
  marginFromOctPct: number;
  repliesWithinFloor: number;      // headroom after his AI spend, per message regime
}

// Own fetch, deliberately. lib/margin.ts is the pure economics and lib/supabase.ts is the general
// data layer; this accessor lives with its arithmetic so the whole cost story is one file. It
// follows lib/supabase.ts's conventions exactly: service role headers, REST, null on any failure
// so the console says "could not read" rather than drawing a confident zero.
function config(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// The calendar month to read, as 'YYYY-MM'. ai_usage keeps 60 days (the cleanup sweep), so the
// current and previous month are always fully there.
function monthBounds(month?: string): { first: string; next: string } | null {
  const m = month ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split('-').map(Number);
  const first = `${m}-01`;
  const nextDate = new Date(Date.UTC(y, mo, 1)); // month is 1 based here, so this IS the next month
  const next = nextDate.toISOString().slice(0, 10);
  return { first, next };
}

export async function readCustomerCostMonth(month?: string): Promise<CustomerCostRow[] | null> {
  const cfg = config();
  const bounds = monthBounds(month);
  if (!cfg || !bounds) return null;
  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
  };

  try {
    // The month's observed per phone counters, and the join table. The phone is a KEY here and it
    // never leaves this function: the allowlist governs what leaves, not what we may touch inside
    // (the same rule readTeamCustomers already follows in lib/supabase.ts).
    const [usageRes, usersRes] = await Promise.all([
      fetch(
        `${cfg.url}/rest/v1/ai_usage?select=scope,key,count&scope=in.(phone,wamsg)` +
          `&day=gte.${bounds.first}&day=lt.${bounds.next}&limit=10000`,
        { headers },
      ),
      fetch(`${cfg.url}/rest/v1/users?select=id,name,phone_number&limit=2000`, { headers }),
    ]);
    if (!usageRes.ok || !usersRes.ok) return null;

    const usage = (await usageRes.json()) as Array<{ scope: string; key: string; count: number }>;
    const users = (await usersRes.json()) as Array<{ id: string; name: string | null; phone_number: string | null }>;

    // Sum the month per phone.
    const byPhone = new Map<string, { ai: number; inbound: number }>();
    for (const row of usage) {
      const n = Math.max(0, Number(row.count) || 0);
      const agg = byPhone.get(row.key) ?? { ai: 0, inbound: 0 };
      if (row.scope === 'phone') agg.ai += n;
      else if (row.scope === 'wamsg') agg.inbound += n;
      byPhone.set(row.key, agg);
    }

    const nameByPhone = new Map<string, { id: string; name: string | null }>();
    for (const u of users) {
      if (u.phone_number) nameByPhone.set(u.phone_number, { id: u.id, name: u.name });
    }

    const now = new Date();
    const perCall = costPerAiCallPence();
    const perMessage = costPerMessagePence();

    // A phone with usage and no user row is a stranger texting the number (or a user who deleted
    // his account mid month). Real spend, not a customer, and we cannot and must not name him by
    // his number, so all of them pool into one honest bucket.
    let strangerAi = 0;
    let strangerInbound = 0;

    const rows: CustomerCostRow[] = [];
    const build = (id: string, name: string | null, ai: number, inbound: number): CustomerCostRow => {
      const aiPence = ai * perCall;
      const messagePenceNow = repliesCostPence(inbound, now);
      const messagePenceFromOct = inbound * perMessage;
      return {
        id,
        name,
        aiCalls: ai,
        inboundMessages: inbound,
        serviceRepliesModelled: inbound,
        aiPence,
        messagePenceNow,
        messagePenceFromOct,
        marginNowPct: customerMarginPct(aiPence, messagePenceNow),
        marginFromOctPct: customerMarginPct(aiPence, messagePenceFromOct),
        repliesWithinFloor: Math.min(
          repliesWithinFloor(aiPence, 0, new Date(`${PER_MESSAGE_PRICING_FROM}T12:00:00Z`)),
          Number.MAX_SAFE_INTEGER,
        ),
      };
    };

    for (const [phone, agg] of byPhone) {
      if (agg.ai === 0 && agg.inbound === 0) continue;
      const who = nameByPhone.get(phone);
      if (!who) {
        strangerAi += agg.ai;
        strangerInbound += agg.inbound;
        continue;
      }
      rows.push(build(who.id, who.name, agg.ai, agg.inbound));
    }
    if (strangerAi > 0 || strangerInbound > 0) {
      rows.push(build('unmatched', 'Not customers (strangers texting the number)', strangerAi, strangerInbound));
    }

    // Heaviest first: the lowest margin under the regime that is coming is the row to look at.
    rows.sort((a, b) => a.marginFromOctPct - b.marginFromOctPct || b.aiPence - a.aiPence);
    return rows;
  } catch {
    return null;
  }
}

// Whether the per message regime is live yet, for the surface's honesty note.
export function perMessageRegimeLive(now: Date = new Date()): boolean {
  return perMessagePricing(now);
}
