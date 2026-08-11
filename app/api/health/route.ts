import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { listCronRuns, readKnowledgeState, getReminderBacklog } from '../../../lib/supabase';
import { cronAlarms, blockingAlarms, unseenAlarms, cronsServing, reminderAlarm, remindersServing } from '../../../lib/cronwatch';
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
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A WRONG BEARER USED TO GET THE PUBLIC BODY AND A CHEERFUL 200. 11 AUGUST 2026.
  //
  // The condition here was `if (config && authorised(req))`, so an operator asking the strict
  // question with a bad secret fell straight through to the public answer. Nothing leaked. What
  // he got instead was WORSE THAN A LEAK: `crons: "ok"` when he had asked for the alarm list, and
  // no way at all to tell "my secret is wrong" from "there is nothing to report".
  //
  // Found by walking it: a quoted value in .env.local meant `cut` handed the header the quotes as
  // well, the bearer did not match, and the reply looked like a clean bill of health for a
  // question that had never been asked. Two of us read it as good news for a minute.
  //
  // That is the house disease exactly, on the endpoint whose entire job is to not have it. So the
  // strict question now gets a strict answer or a 401, and never somebody else's answer.
  //
  // ⚠️ THE 401 CARRIES NOTHING. Not whether CRON_SECRET is set, not how long it should be. A
  // public endpoint that helps you tune a guess is a public endpoint that helps the wrong person.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (req.nextUrl.searchParams.get('config') && !authorised(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get('config')) {
    // Presence only. Never the value, not even a prefix.
    const missing = SIGNING_SECRETS.filter((k) => !process.env[k]);
    const runs = await listCronRuns();
    const alarms = runs ? cronAlarms(runs) : [];
    const brain = await readKnowledgeState();
    const brainAlarms = brain ? knowledgeAlarms(brain) : [];
    // Is the PROMISE being kept, not just the job running. See lib/cronwatch.ts, reminderAlarm.
    const backlog = await getReminderBacklog();
    const lateReminders = reminderAlarm(backlog);
    // ⚠️ THE OPERATOR VIEW IS STRICT ON PURPOSE, and differs from the public one. This body is a
    // to-do list for whoever is holding the pager, so a cron that has never run belongs in its
    // `ok: false`. The PUBLIC body answers a different question, "is the site serving", and a job
    // nobody has seen yet is not an answer of no to that. Both are right; they are asked by
    // different people. unseen is broken out below so the difference is readable rather than
    // something to work out from two numbers.
    //
    // 🔴 AND runs !== null IS PART OF THAT STRICTNESS. Without it a null read gives alarms = [] and
    // this ok stayed true when the cron history was UNREADABLE, the same "no is not nothing" blind
    // spot the public path had. brain !== null was already here; the crons half was missing it. An
    // operator who cannot read the history has a problem, and the strict view is where it belongs.
    const ok = missing.length === 0 && runs !== null && alarms.length === 0 && brain !== null && brainAlarms.length === 0
      && lateReminders === null;
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
        alarms: [...blockingAlarms(alarms), ...(lateReminders ? [lateReminders] : [])],
        // WHAT IS ACTUALLY WAITING. The operator side names it because naming it is the whole use
        // of the row: a count and an age tell whoever holds the pager whether this is a gate that
        // shut a minute ago or an engine that stopped in the night.
        reminders: backlog === null ? 'unreadable' : { overdue: backlog.overdue, oldestDue: backlog.oldestDue },
        // Registered, never seen. Not an outage; a wiring question. Named here because this side
        // is behind the bearer and naming it is the entire use of the row.
        unseen: unseenAlarms(alarms),
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
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A NEVER-RUN CRON IS VISIBLE HERE AND IT DOES NOT TAKE THE SITE DOWN. lib/cronwatch.ts has
  // the full account. Short version: this endpoint answers 503 on any alarm and UptimeRobot polls
  // it, so when never_run was added at 21:00 on 9 August the site reported itself DOWN within two
  // minutes, on launch eve, because a cron added ninety minutes earlier had not yet reached its
  // first dispatch slot. Nothing was wrong and nobody was affected.
  //
  // Something that WAS working and has stopped is an outage. Something never seen is a question.
  // Only the first is a 503.
  //
  // ⚠️ THE COUNT IS PUBLIC AND THE NAMES ARE NOT, the same rule the block above sets for staleness:
  // which job is late is useful to a stranger and no use to you. A bare count leaks nothing and
  // stops `crons: "ok"` from being a flat lie while one is genuinely pending.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const unseen = unseenAlarms(alarms);
  // 🔴 A NULL READ IS NOT A PASS HERE EITHER, AND FOR A WHILE IT WAS. listCronRuns() returns null
  // on any failed read (a non-ok response, a timeout, a shape that is not an array). runs ? ... : []
  // above then handed a null read an EMPTY alarm list, blocking came back empty, and cronsOk was
  // true: the watchdog reported the crons healthy precisely when it could not see them. That is the
  // house disease, a signal that cannot tell "no" from "nothing", four lines from the brain check
  // below that gets it right (brain !== null). The db probe answers on its own, so this only bit
  // when cron_runs was unreadable in isolation, but that is exactly the silent blind spot a launch
  // pager must not have. An unreadable history is a question: `crons: "unknown"` in the body, not ok.
  const cronsOk = cronsServing(runs);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE JOB RUNNING IS NOT THE PROMISE BEING KEPT. Added 11 August 2026, RUN 0 of the customer
  // week. On 10 August `due` ran on the hour, finished, reported ok, and sent nothing, because the
  // WhatsApp template gate was shut. A reminder promised for 08:00 landed at 12:43 and every
  // signal in this file was green throughout. lib/cronwatch.ts, reminderAlarm, has the argument.
  //
  // ⚠️ THIS IS AN OUTAGE AND IT IS A 503, BY THIS FILE'S OWN TAXONOMY. Something that WAS working
  // has stopped and users are being missed right now. That is the line between a 503 and a row
  // nobody is woken for, and an unsent reminder is on the wrong side of it: he asked us to
  // remember so that HE could stop, and he finds out on the morning it mattered.
  //
  // ⚠️ AND THE COUNT IS NOT PUBLIC. How many of our customers are waiting on a text is our
  // business, not a stranger's. One word, the same rule the cron and brain rows follow.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const backlog = await getReminderBacklog();
  const remindersOk = remindersServing(backlog);

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

  const healthy = db && cronsOk && brainOk && remindersOk;
  return NextResponse.json(
    {
      ok: healthy,
      db,
      // Told apart on purpose. `db: false, key: "not-privileged"` says the database is answering
      // and we have LOST OUR PRIVILEGES, which is a completely different emergency from the
      // database being down, and used to be indistinguishable from perfect health.
      key: privileged ? 'ok' : 'not-privileged',
      crons: runs === null ? 'unknown' : cronsOk ? 'ok' : 'stale',
      // One word, never a count. See the block above remindersOk.
      reminders: backlog === null ? 'unknown' : remindersOk ? 'ok' : 'late',
      // A count, never a name. Zero is omitted rather than printed, so this row appears only when
      // there is genuinely something not yet seen. See the block above.
      ...(unseen.length ? { cronsUnseen: unseen.length } : {}),
      // One word. Never which constant is wrong: that is a map for someone who wants to file
      // against a figure we have not corrected yet. The detail is behind the bearer, above.
      knowledge: brain === null ? 'unknown' : knowledgeStatus(brainAlarms),
    },
    { status: healthy ? 200 : 503 },
  );
}
