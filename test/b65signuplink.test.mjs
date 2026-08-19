// B65. A PERSON CAN FINISH SIGNING UP AND BE LOCKED OUT BY MORNING, AND NOTHING WATCHED FOR IT.
// 20 August 2026.
//
//   node test/b65signuplink.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE FAILURE. findContactAccount resolves an email ONLY through a signups row carrying a user_id,
// and public.users has no email column to fall back on. That link is written in exactly one place,
// setSignupUserId, from one route, /api/signup/verify, and its patch is scoped `&user_id=is.null`,
// so a miss updates zero rows and SUCCEEDS SILENTLY. lib/supabase.ts has said so in its own comment
// since 6 August 2026, when it was found on a real signup.
//
// ⚠️ THERE IS NO VICTIM TODAY. This is a MISSING WATCHER, not a running incident. The four unlinked
// rows in production predate the user_id column and are Jag's own or named tests. It is built now
// because Jag is about to buy traffic into this funnel.
//
// 🔴 AND THE TELL IS THE WHOLE ITEM. "A signup with no user_id" is the obvious check and it is the
// wrong one: an ABANDONED signup is exactly that, for ever, and on a funnel with real traffic it is
// most of the rows. A watch built on it goes red within an hour of the first pound spent and is
// muted by the end of the week. The tell is a CONSUMED CODE, which is proof a person proved that
// address, and an abandoned signup has none. Section 2's second assertion is that one, and it is
// the reason this watch can exist at all.
//
// 🔴 AND THE JOIN IS ON `email`, NEVER `email_norm`. normaliseEmail strips plus tags and gmail dots,
// so every jagchahil12+persona address collapses to one value. A join on the natural looking key
// would answer confidently and wrongly in both directions. Section 2 proves the difference on two
// addresses that share a base.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};
// Is A written before B? The order matters when a verdict must be formed AFTER a reader has run.
const before = (src, a, b) => src.indexOf(a) !== -1 && src.indexOf(b) !== -1 && src.indexOf(a) < src.indexOf(b);

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-the-test';

const stage = mkdtempSync(path.join(tmpdir(), 'b65-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
// 🔴 THE COPY IS THE ORIGINAL. If this drifts the suite is testing a file that does not ship.
ok('🔴 the staged lib/cronwatch.ts differs from the real one in nothing at all',
  readFileSync(path.join(stage, 'cronwatch.ts'), 'utf8') === read('lib/cronwatch.ts'));

const W = await import(pathToFileURL(path.join(stage, 'cronwatch.ts')).href);
const DB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

console.log('\n=== 1. the policy. Pure, no I/O, and it decides what wakes somebody up ===\n');

const H = (over = {}) => ({
  proved: 10, unlinked: 0, oldestProvedAt: null,
  graceMinutes: W.SIGNUP_LINK_GRACE_MINUTES, lookbackDays: W.SIGNUP_LINK_LOOKBACK_DAYS,
  capped: false, ...over,
});
const NOW = new Date('2026-08-20T09:00:00.000Z');

// 🔴 VACUITY FIRST. The policy must SEE a stranded person before a silence below means anything.
{
  const a = W.signupLinkAlarm(H({ unlinked: 1, oldestProvedAt: '2026-08-20T06:00:00.000Z' }), NOW);
  ok('🔴 ONE STRANDED PERSON IS AN ALARM, and it is not softened by the nine who are fine',
    a !== null && a.job === 'signups' && a.reason === 'failed');
  ok('...and it says how long he has been waiting, so a minute can be told from a day',
    a.hoursQuiet === 3);
  ok('...and it names no address, on either side of the bearer', !/@/.test(a.detail ?? ''));
  ok('...and it says what it means for him rather than reporting a field',
    /sign in door will not find them/.test(a.detail ?? ''));
  ok('and signupLinksServing agrees with the alarm rather than deciding again',
    W.signupLinksServing(H({ unlinked: 1, oldestProvedAt: '2026-08-20T06:00:00.000Z' }), NOW) === false);
}

ok('a clean read of ten proved and none unlinked is silent', W.signupLinkAlarm(H(), NOW) === null);
ok('...and serving says so', W.signupLinksServing(H(), NOW) === true);
ok('a window with nobody in it at all is silent, not an alarm about emptiness',
  W.signupLinkAlarm(H({ proved: 0 }), NOW) === null);

// 🔴 null IN, ALARM OUT. The rule cronsServing, reminderAlarm and authSendAlarm all follow.
{
  const a = W.signupLinkAlarm(null, NOW);
  ok('🔴 A CHECK THAT COULD NOT RUN IS NOT A PASS', a !== null && a.reason === 'unreadable');
  ok('...and it says plainly what it could not answer', /can get back in/.test(a.detail ?? ''));
  ok('...and serving says no', W.signupLinksServing(null, NOW) === false);
}

// 🔴 A CAPPED READ IS THE ANSWER THAT LOOKS LIKE GOOD NEWS AND IS NOT ONE.
{
  const a = W.signupLinkAlarm(H({ capped: true, unlinked: 0 }), NOW);
  ok('🔴 A READ THAT RAN OUT OF ROOM IS UNREADABLE EVEN WITH ZERO UNLINKED',
    a !== null && a.reason === 'unreadable' && /row limit/.test(a.detail ?? ''));
  ok('...and the cap is reported before the count, so it cannot be read past',
    W.signupLinkAlarm(H({ capped: true, unlinked: 4 }), NOW).reason === 'unreadable');
}

// The alarm rides the cron taxonomy, so it must be a reason blockingAlarms does not filter out.
ok('🔴 THE ALARM BLOCKS: its reason is not never_run, which is the one blockingAlarms drops',
  W.blockingAlarms([W.signupLinkAlarm(H({ unlinked: 1 }), NOW)]).length === 1
  && W.blockingAlarms([W.signupLinkAlarm(null, NOW)]).length === 1);

// FLOORS, NOT FIGURES. The numbers may be tuned; these are the properties that must survive it.
ok('the grace is generous enough not to fire on one slow request (at least five minutes)',
  W.SIGNUP_LINK_GRACE_MINUTES >= 5);
ok('...and short enough to find a locked out person the same working day (under two hours)',
  W.SIGNUP_LINK_GRACE_MINUTES <= 120);
ok('the lookback outlives a weekend and a bank holiday of nobody looking (at least seven days)',
  W.SIGNUP_LINK_LOOKBACK_DAYS >= 7);

console.log('\n=== 2. the reader, run for real against a stubbed transport ===\n');

const realFetch = globalThis.fetch;
let seen = [];
let plan = {};
globalThis.fetch = async (url) => {
  const u = String(url);
  seen.push(u);
  const pick = () => {
    if (u.includes('/signup_codes?')) return plan.codes;
    if (u.includes('/signups?')) return plan.links;
    return { status: 200, json: [] };
  };
  const r = pick() ?? { status: 200, json: [] };
  if (r.status && r.status !== 200) return new Response('no', { status: r.status });
  return new Response(typeof r.json === 'string' ? r.json : JSON.stringify(r.json ?? []), { status: 200 });
};
const OK = (json) => ({ status: 200, json });
const runReader = async (p, now = NOW) => {
  plan = p; seen = [];
  return DB.getSignupLinkHealth(W.SIGNUP_LINK_GRACE_MINUTES, W.SIGNUP_LINK_LOOKBACK_DAYS, now);
};
const code = (email, consumedAt) => ({ email, consumed_at: consumedAt });
const HOURS_AGO = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// 🔴 VACUITY FIRST, AGAIN AND FOR THE READER. It must SEE a locked out person.
{
  const h = await runReader({ codes: OK([code('stranded@example.com', HOURS_AGO(3))]), links: OK([]) });
  ok('🔴 A PROVED ADDRESS WITH NO ACCOUNT LINK IS SEEN, WHICH IS THE WHOLE ITEM',
    h !== null && h.proved === 1 && h.unlinked === 1 && h.oldestProvedAt === HOURS_AGO(3));
}

// 🔴 AND THE ONE THAT DECIDES WHETHER THIS WATCH CAN EXIST AT ALL.
{
  // An abandoned signup: a signups row with no user_id and NO consumed code anywhere. The codes
  // read comes back empty because nothing was ever proved. This is most of a real funnel.
  const h = await runReader({ codes: OK([]), links: OK([]) });
  ok('🔴 AN ABANDONED SIGNUP IS INVISIBLE TO THIS WATCH, so ordinary funnel drop off can never turn'
    + ' the site red', h !== null && h.proved === 0 && h.unlinked === 0 && h.oldestProvedAt === null);
  ok('...and it does not even ask the second question when nobody proved anything',
    seen.filter((u) => u.includes('/signups?')).length === 0);
}

{
  const h = await runReader({
    codes: OK([code('in@example.com', HOURS_AGO(2))]),
    links: OK([{ email: 'in@example.com' }]),
  });
  ok('a proved address that IS linked is silent', h.proved === 1 && h.unlinked === 0);
}

// 🔴 THE JOIN. Two addresses that share a normalised form, one linked and one not.
{
  const h = await runReader({
    codes: OK([code('jag+one@gmail.com', HOURS_AGO(5)), code('jag+two@gmail.com', HOURS_AGO(4))]),
    links: OK([{ email: 'jag+one@gmail.com' }]),
  });
  ok('🔴 THE JOIN IS ON THE ADDRESS AS TYPED: two plus tagged addresses on one base are TWO people',
    h.proved === 2 && h.unlinked === 1 && h.oldestProvedAt === HOURS_AGO(4));
  ok('🔴 AND THE READER NEVER ASKS ABOUT email_norm, which would collapse the whole persona fleet'
    + ' into one row', seen.every((u) => !u.includes('email_norm')));
}

{
  const h = await runReader({
    codes: OK([code('  MiXeD@Example.COM ', HOURS_AGO(6))]),
    links: OK([{ email: 'mixed@example.com' }]),
  });
  ok('case and whitespace are settled on both sides, so a capital letter is not a locked door',
    h.proved === 1 && h.unlinked === 0);
}

{
  const h = await runReader({
    codes: OK([code('twice@example.com', HOURS_AGO(1)), code('twice@example.com', HOURS_AGO(9))]),
    links: OK([]),
  });
  ok('one address that proved twice is ONE person, counted once',
    h.proved === 1 && h.unlinked === 1);
  ok('...and the age is his OLDEST proof, because that is how long he has been waiting',
    h.oldestProvedAt === HOURS_AGO(9));
}

// TWO stranded people, not one. The single address case above cannot tell the oldest from the
// newest, because with one of them they are the same value, and a sabotage of exactly that line
// walked straight through this section until it was written.
{
  const h = await runReader({
    codes: OK([code('recent@example.com', HOURS_AGO(2)), code('ancient@example.com', HOURS_AGO(9))]),
    links: OK([]),
  });
  ok('🔴 TWO STRANDED PEOPLE ARE TWO, and the age reported is the one who has waited LONGEST',
    h.unlinked === 2 && h.oldestProvedAt === HOURS_AGO(9));
}

// THE WINDOW IS ASKED FOR IN THE REQUEST, so the grace and the lookback are real rather than
// documented. A stub cannot enforce a filter the reader never sent.
{
  await runReader({ codes: OK([]), links: OK([]) });
  const first = seen.find((u) => u.includes('/signup_codes?')) ?? '';
  const youngest = new Date(NOW.getTime() - W.SIGNUP_LINK_GRACE_MINUTES * 60_000).toISOString();
  const oldest = new Date(NOW.getTime() - W.SIGNUP_LINK_LOOKBACK_DAYS * 24 * 3_600_000).toISOString();
  ok('🔴 it asks only for CONSUMED codes, which is the proof a person proved the address',
    first.includes('consumed_at=not.is.null'));
  ok('🔴 the grace is in the request, to the millisecond',
    first.includes(`consumed_at=lte.${encodeURIComponent(youngest)}`));
  ok('🔴 and so is the lookback', first.includes(`consumed_at=gte.${encodeURIComponent(oldest)}`));
  ok('newest first, so a capped read keeps the ones that can still be acted on',
    first.includes('order=consumed_at.desc'));
  ok('and it selects the address and the timestamp and nothing else',
    first.includes('select=email,consumed_at') && !first.includes('code_hash'));
}
{
  await runReader({ codes: OK([code('a@b.com', HOURS_AGO(2))]), links: OK([]) });
  const second = seen.find((u) => u.includes('/signups?')) ?? '';
  ok('the second question asks which of them carry a link, and nothing else',
    second.includes('user_id=not.is.null') && second.includes('select=email')
    && second.includes(encodeURIComponent('in.("a@b.com")')));
}

// THE CAP. Driven off the reader's own exported limit rather than a number typed here.
{
  const many = [];
  for (let i = 0; i < DB.SIGNUP_LINK_READ_LIMIT; i += 1) many.push(code(`p${i}@example.com`, HOURS_AGO(2)));
  const h = await runReader({ codes: OK(many), links: OK(many.map((c) => ({ email: c.email }))) });
  ok('🔴 A READ THAT FILLED ITS LIMIT SAYS SO, even when every row it did see is fine',
    h.capped === true && h.unlinked === 0);
  const h2 = await runReader({ codes: OK(many.slice(0, -1)), links: OK(many.map((c) => ({ email: c.email }))) });
  ok('...and one row short of the limit is not capped', h2.capped === false);
}

// A FAILED READ IS null, NEVER A CLEAN ANSWER. Both requests, separately.
{
  ok('the codes read failing gives null, not zero unlinked',
    (await runReader({ codes: { status: 500 }, links: OK([]) })) === null);
  ok('🔴 THE SECOND READ FAILING GIVES null TOO, which is the half a hurried version would miss',
    (await runReader({ codes: OK([code('a@b.com', HOURS_AGO(2))]), links: { status: 500 } })) === null);
  ok('a body that is not an array is null rather than an empty count',
    (await runReader({ codes: OK('{"message":"boom"}'), links: OK([]) })) === null);
  ok('...on the second read as well',
    (await runReader({ codes: OK([code('a@b.com', HOURS_AGO(2))]), links: OK('{"message":"boom"}') })) === null);
}

// The shape carries its own window, so no reader downstream has to assume either number.
{
  const h = await runReader({ codes: OK([]), links: OK([]) });
  ok('the answer carries the grace and the lookback it was taken under',
    h.graceMinutes === W.SIGNUP_LINK_GRACE_MINUTES && h.lookbackDays === W.SIGNUP_LINK_LOOKBACK_DAYS);
}
globalThis.fetch = realFetch;

console.log('\n=== 3. the wiring. A watcher nothing reads is a diary, not a watchdog ===\n');

const health = read('app/api/health/route.ts');

ok('/api/health imports the reader', health.includes('getSignupLinkHealth'));
ok('/api/health imports the policy',
  health.includes('signupLinksServing') && health.includes('signupLinkAlarm'));
ok('and the window is wired from the policy rather than typed at the call site',
  /getSignupLinkHealth\(SIGNUP_LINK_GRACE_MINUTES, SIGNUP_LINK_LOOKBACK_DAYS\)/.test(health));

ok('🔴 THE PUBLIC VERDICT ACTUALLY DEPENDS ON IT', /const healthy = [^;]*\bsignupsOk\b/.test(health));
ok('🔴 AND THE OPERATOR VERDICT DOES TOO', /const ok = [\s\S]{0,400}?strandedSignups === null/.test(health));
ok('the operator alarm list carries it, so whoever holds the pager is told what it is',
  /alarms: \[[\s\S]{0,320}?strandedSignups \? \[strandedSignups\]/.test(health));

ok('the link is read before the verdict is formed',
  before(health, 'const signupLinks = await getSignupLinkHealth', 'const healthy ='));

ok('the public body reports it in one word', /signups: signupLinks === null \? 'unknown'/.test(health));
ok('...and that word is stranded, which says what happened rather than naming a field',
  /signupsOk \? 'ok' : 'stranded'/.test(health));
ok('🔴 and never the counts, which are our business and not a stranger\'s',
  !/signups: \{[\s\S]{0,400}status: healthy/.test(health));
ok('the operator body gets the counts, because that is the whole use of the row',
  /signups: signupLinks === null \? 'unreadable' : \{[\s\S]{0,300}unlinked: signupLinks\.unlinked/.test(health));
ok('🔴 and the operator body carries capped, so a partial read cannot be read as a clean one',
  /capped: signupLinks\.capped/.test(health));

// 🔴 NEVER AN ADDRESS, ON EITHER SIDE OF THE BEARER. The signin row's rule, and the same reason.
ok('🔴 NEITHER BODY EVER CARRIES AN ADDRESS',
  !/signups:[\s\S]{0,400}\bemail\b/.test(health));

// The reader itself must not widen. A health endpoint that selected the address would undo the
// whole rule one line upstream of where it is enforced.
const sb = read('lib/supabase.ts');
ok('🔴 THE READER SELECTS THE ADDRESS AND THE TIMESTAMP AND NOTHING ELSE',
  /signup_codes\?select=email,consumed_at/.test(sb) && !/signup_codes\?select=[^`'"]*code_hash/.test(sb));
ok('and the second read asks only for the address of a LINKED row',
  /signups\?select=email&user_id=not\.is\.null/.test(sb));

// 🔴 THE STAGEABLE TAIL. Three suites stage the end of lib/supabase.ts on its own with config() and
// headers() hand written above it, so a VALUE import added down there breaks five suites that have
// nothing to do with it. This session did exactly that and the gate caught it. Pinned so the next
// one does not have to find out the same way.
{
  const tail = sb.slice(sb.indexOf('export interface DiaryJobDbRow'));
  ok('the signup link reader lives in that stageable tail', tail.includes('getSignupLinkHealth'));
  ok('🔴 AND THE TAIL IMPORTS NO VALUES AT ALL, only types, which is what makes it stageable',
    !/^import (?!type )/m.test(tail));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
