import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { listCronRuns, readKnowledgeState } from '../../../lib/supabase';
import { cronAlarms } from '../../../lib/cronwatch';
import { knowledgeAlarms, knowledgeStatus } from '../../../lib/knowledgewatch';

// A tiny health check for uptime monitoring. Reports whether the app is up and
// whether the database answers, and nothing else: no counts, no data, no
// configuration details, so it is safe to expose publicly and poll often.
export const runtime = 'nodejs';

// THE SECRETS THAT, IF MISSING, BREAK A FEATURE SILENTLY.
//
// Each of these signs one kind of link. They all fail CLOSED: no secret means no token
// is issued and no token verifies. That is the safe direction, but it is also the QUIET
// one. Quarter packs and confirmation emails would simply stop working, with no error
// anywhere, and the first person to notice would be a customer.
//
// So there is a way to ASK. Behind the cron bearer, because a public endpoint that lists
// which of our secrets are unset is a map drawn for whoever wants to forge a link.
//
//     curl -H "Authorization: Bearer $CRON_SECRET" https://lekhio.app/api/health?config=1
const SIGNING_SECRETS = [
  'SHARE_TOKEN_SECRET',   // the books a man shares with his accountant
  'PACK_TOKEN_SECRET',    // quarter end pack links
  'LEAD_TOKEN_SECRET',    // email confirm and unsubscribe
  'HMRC_STATE_SECRET',    // the OAuth state, i.e. the CSRF guard on tax filing
] as const;

// CAN WE ACTUALLY TAKE MONEY, AND ARE WE ACTUALLY ENCRYPTING?
//
// Added 13 July 2026, after I told Jag the signing secrets were missing. They were not. I had read
// it in a doc. The system said `missing: []` the moment anyone bothered to ask it.
//
// So stop asking .env.local, which describes ONE LAPTOP, and ask PRODUCTION, which is the only
// machine that takes anyone's money. `echo $STRIPE_SECRET_KEY` on a developer's mac proves nothing
// at all about whether a tradesman can pay us.
//
// PRESENCE AND MODE ONLY. Never the value, and never a prefix long enough to be a clue. The mode is
// the load-bearing bit: a key that is present but says `sk_test_` means the checkout works, the
// webhook fires, the subscription row appears, and NO MONEY EVER ARRIVES. Which is the house
// failure mode wearing a bow tie: everything succeeds and nothing happened.
function stripeMode(): 'live' | 'test' | 'missing' {
  const k = process.env.STRIPE_SECRET_KEY || '';
  if (!k) return 'missing';
  if (k.startsWith('sk_live_') || k.startsWith('rk_live_')) return 'live';
  if (k.startsWith('sk_test_') || k.startsWith('rk_test_')) return 'test';
  return 'missing';
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('config') && authorised(req)) {
    // Presence only. Never the value, not even a prefix.
    const missing = SIGNING_SECRETS.filter((k) => !process.env[k]);
    const runs = await listCronRuns();
    const alarms = runs ? cronAlarms(runs) : [];
    const brain = await readKnowledgeState();
    const brainAlarms = brain ? knowledgeAlarms(brain) : [];
    const ok = missing.length === 0 && alarms.length === 0 && brain !== null && brainAlarms.length === 0;
    return NextResponse.json(
      {
        ok,
        missing,
        // Presence and mode. Never a value. See the note above stripeMode().
        money: {
          stripe: stripeMode(),                                  // live | test | missing
          webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),   // no secret, no verified webhook
        },
        encryption: {
          // Unset means bank and HMRC tokens sit unencrypted in OUR layer. Supabase still encrypts
          // the disk, so this is not a catastrophe, but we told HMRC on the production credentials
          // form: "Do you encrypt all customer data that you handle? Yes." Setting this makes that
          // answer unambiguously true rather than merely arguable, and we do not want to be
          // arguing that point with HMRC.
          bankTokenKey: Boolean(process.env.BANK_TOKEN_KEY),
        },
        crons: runs ?? 'unreadable',
        alarms,
        // The detail on WHICH of our tax constants is currently wrong, and what GOV.UK says it
        // should be. Behind the bearer, because it is a to-do list for anyone who wants to file a
        // return against a number we have not fixed yet.
        knowledge: brain === null ? 'unreadable' : knowledgeStatus(brainAlarms),
        knowledgeAlarms: brainAlarms,
      },
      { status: ok ? 200 : 503 },
    );
  }

  // DOES THE DATABASE ANSWER, AND ARE WE ACTUALLY PRIVILEGED WHEN IT DOES?
  //
  // ⚠️ THIS USED TO BE A GREEN LIGHT THAT COULD MEAN NOTHING. It fetched /rest/v1/users?limit=1 and
  // tested `res.ok`. But PostgREST answers an UNAUTHORISED read of an RLS-protected table with
  // `200 []`, a perfectly successful HTTP response containing nothing at all.
  //
  // So if SUPABASE_SERVICE_ROLE_KEY were ever swapped for a publishable key, every server route
  // would silently drop to anon privileges, every query would return empty instead of erroring, and
  // THIS CHECK WOULD STAY GREEN. On 13 July we found exactly that key mix-up in the local .env, and
  // the only reason we caught it was a script that tried to do something a publishable key cannot.
  //
  // A health check that cannot tell "the database said no" from "the database said nothing" is the
  // same bug as the AIA differ passing by reading GOV.UK's JSON-LD. So we ask a question only a
  // privileged key can answer: the Auth admin endpoint returns 401 to anything less.
  let db = false;
  let privileged = false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const [rest, adminOnly] = await Promise.all([
        fetch(`${url}/rest/v1/users?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(4000),
        }),
        // 200 only for a service key. An anon or publishable key gets 401. There is no way to fake
        // this one by returning an empty list.
        fetch(`${url}/auth/v1/admin/users?per_page=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(4000),
        }),
      ]);
      privileged = adminOnly.ok;
      db = rest.ok && privileged;
    }
  } catch {
    db = false;
    privileged = false;
  }

  // THE ALARM HAS TO BE WIRED TO SOMETHING THAT WAKES SOMEBODY UP.
  //
  // A watchdog that writes a row nobody reads is a diary, not a watchdog. UptimeRobot
  // already polls THIS endpoint, so a stopped cron has to change THIS status code, or the
  // whole thing is theatre.
  //
  // The PUBLIC body says only whether the crons are healthy, never which one is late or how
  // late. "The digest has not run for two days" is a useful thing for a stranger to know and
  // no use at all to you, who will get an email either way. The detail lives behind the
  // bearer, above.
  const runs = await listCronRuns();
  const alarms = runs ? cronAlarms(runs) : [];
  const cronsOk = alarms.length === 0;

  // THE BRAIN (docs/105). Three ways this goes red, and the first one is why Khoji exists at all.
  //
  //   drift   a constant in lib/taxengine.ts DISAGREES WITH GOV.UK right now. Our tax engine is
  //           wrong, for every user, today. This is worse than the site being down: a site that
  //           is down tells a man nothing, and a site that is wrong tells him a number he then
  //           signs his name to. It goes RED and it wakes somebody up.
  //   blind   the differ could not read a figure off its page. We are not right, we are BLIND,
  //           and not knowing is not the same as being fine. This is the exact shape of every
  //           other bug in this codebase, so it is an alarm, not a shrug.
  //   stale   the watcher has stopped, or nobody has approved anything in a fortnight.
  //
  // WHY RED AND NOT "AMBER", WHICH IS WHAT docs/105 ASKED FOR. Amber was written to stop us crying
  // wolf, and that fear was well founded WHEN engine_impact WAS A LANGUAGE MODEL'S GUESS: it fired
  // at 0.95 on three pages we already had right, and stayed silent on the one we had wrong. It is
  // not a guess any more. It is arithmetic, it clears itself the moment the engine is fixed, and
  // 18 tests pin it, including the decoy on the live GOV.UK mileage page that fooled two human
  // audits. An alarm that only fires when we are actually wrong has earned the right to be red.
  //
  // A NULL READ IS NOT A PASS. If we cannot reach the brain we do not claim it is healthy.
  const brain = await readKnowledgeState();
  const brainAlarms = brain ? knowledgeAlarms(brain) : [];
  const brainOk = brain !== null && brainAlarms.length === 0;

  const healthy = db && cronsOk && brainOk;
  return NextResponse.json(
    {
      ok: healthy,
      db,
      // Told apart on purpose. `db: false, key: "not-privileged"` says the database is answering
      // and we have LOST OUR PRIVILEGES, which is a completely different emergency from the
      // database being down, and used to be indistinguishable from perfect health.
      key: privileged ? 'ok' : 'not-privileged',
      crons: runs === null ? 'unknown' : cronsOk ? 'ok' : 'stale',
      // One word. Never which constant is wrong: that is a map for someone who wants to file
      // against a figure we have not corrected yet. The detail is behind the bearer, above.
      knowledge: brain === null ? 'unknown' : knowledgeStatus(brainAlarms),
    },
    { status: healthy ? 200 : 503 },
  );
}
