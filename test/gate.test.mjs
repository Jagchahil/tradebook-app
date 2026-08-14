// WHAT A MAN MAY DO WHEN HE HAS NOT PAID US. See lib/gate.ts.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, AND THE FIRST ONE IS THE WHOLE REASON THE TABLE EXISTS.
//
//   1. 🔴 NO MUTATING ROUTE CAN EXIST WITHOUT A DECISION. The suite walks app/api itself and fails
//      the build on any handler the table has never heard of. Forty `if (!entitled)` lines
//      scattered through routes is forty chances to forget one, and a forgotten one is invisible:
//      the route keeps working, for everybody, for ever, and nothing goes red.
//
//   2. 🔴 THE ROUTES THAT MUST NEVER BE GATED, ARE NOT. Paying to cancel, paying to unsubscribe,
//      paying to sign in, paying to get your own data out. Each of those is a bug somebody could
//      introduce with one word, and two of them are unlawful rather than merely wrong.
//
//   3. EVERY AMBIGUOUS CASE FAILS OPEN. lib/entitlement.ts's own header: locking a man out of his
//      own records is worse than letting him have another fortnight free.
//
//   4. THE COPY NEVER SUGGESTS HIS BOOKS ARE GONE. They are not, and saying so would be a lie
//      about a man's tax records.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const {
  gateFor, noRowGrace, ruleFor, gatedRoutes, GATED_ROUTES, readonlyPayload,
  READONLY_TITLE, READONLY_LINE,
} = await import(`${pathToFileURL(path.resolve(repo, 'lib/gate.ts')).href}`);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\ngate: read only, never dark');

// ── 1. EVERY MUTATING ROUTE HAS A DECISION ────────────────────────────────────────────────────
//
// ⚠️ /team/ AND /cron/ ARE EXCLUDED ON PURPOSE AND THE EXCLUSION IS ASSERTED BELOW. The team
// console is ours and is gated by staff auth; a cron is called by the scheduler with CRON_SECRET
// and has no customer session to read. Neither has a subscription to consult.
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === 'route.ts') out.push(p);
  }
  return out;
}

// 🔴 EVERY ROUTE, NOT ONLY THE ONES THAT LOOK LIKE THEY MUTATE.
//
// The first draft of this walk matched `export async function (POST|PATCH|PUT|DELETE)` and felt
// thorough. It missed twenty six routes, including THREE CUSTOMER OAUTH CALLBACKS THAT WRITE A ROW
// ON A GET: app/api/bank/callback, app/api/hmrc/callback and the connectors one. A provider
// redirects his browser back and we insert a connection.
//
// A completeness guard with a hole in it is worse than no guard, because it reports coverage it
// does not have, which is this codebase's oldest failure written one more time. So the rule is now
// the simplest one that cannot have a hole: every route.ts under app/api needs a line in the table,
// whatever its method, even if the answer is obviously 'always'.
const all = walk(path.join(repo, 'app/api'));
ok('the api tree was actually walked (not vacuous)', all.length > 30);

const rel = (f) => path.relative(repo, f).replace(/\/route\.ts$/, '');
const mutating = all
  .map(rel)
  .filter((r) => !r.startsWith('app/api/team/') && !r.startsWith('app/api/cron/'));

ok('there are customer routes to check', mutating.length > 40);

// The hole that motivated the change, pinned so it cannot come back.
const GET_WRITERS = ['app/api/bank/callback', 'app/api/hmrc/callback', 'app/api/connectors/[platform]/callback'];
ok('🔴 the three callbacks that write on a GET all have a decision',
  GET_WRITERS.every((r) => ruleFor(r) !== null));

const known = new Set(GATED_ROUTES.map((r) => r.route));
const undecided = mutating.filter((r) => !known.has(r));
ok(
  `🔴 every mutating route has a decision in the table${undecided.length ? `\n     ${undecided.join('\n     ')}` : ''}`,
  undecided.length === 0,
);

// And no stale rows: a route that has been deleted must not leave a decision behind pretending to
// guard something. A dead row reads as coverage.
const live = new Set(mutating);
const stale = GATED_ROUTES.map((r) => r.route).filter((r) => !live.has(r));
ok(
  `no row guards a route that no longer exists${stale.length ? `\n     ${stale.join('\n     ')}` : ''}`,
  stale.length === 0,
);

ok('no duplicate rows', new Set(GATED_ROUTES.map((r) => r.route)).size === GATED_ROUTES.length);
ok('every row carries its reasoning', GATED_ROUTES.every((r) => typeof r.why === 'string' && r.why.length > 25));
ok('every rule is one of the two', GATED_ROUTES.every((r) => r.rule === 'always' || r.rule === 'entitled'));

// The exclusions are real, so the filter above cannot be quietly hiding a customer route.
// The team console is ours and is gated by staff auth, never by a customer's subscription.
const teamRoutes = all.filter((f) => rel(f).startsWith('app/api/team/'));
ok('the team console exists and is excluded', teamRoutes.length >= 3);
// ⚠️ THE CRONS MUTATE ON A GET, every one of them, because Vercel's scheduler issues GET requests.
// They are excluded because they carry CRON_SECRET instead of a session, so there is no customer
// and no subscription to consult. This asserts that shape rather than assuming it: the day a cron
// grows a POST is the day somebody should reread this exclusion.
const crons = all.filter((f) => rel(f).startsWith('app/api/cron/'));
ok('the crons exist and are excluded', crons.length >= 5);
ok('every cron authenticates on CRON_SECRET rather than a session',
  crons.every((f) => /CRON_SECRET/.test(readFileSync(f, 'utf8'))));

// ── 2. THE ONES THAT MUST NEVER BE GATED ──────────────────────────────────────────────────────
//
// 🔴 Written out by hand. Each is a bug somebody could introduce with a single word, and the first
// two are unlawful rather than merely wrong.
const NEVER_GATE = [
  ['app/api/account/delete', 'his right to erasure, behind a paywall, is a UK GDPR problem'],
  ['app/api/unsubscribe', 'paying to stop being emailed'],
  ['app/api/share', 'paying to get his own figures out'],
  ['app/api/bank/disconnect', 'paying to withdraw consent to his bank'],
  ['app/api/billing/checkout', 'paying to be allowed to pay'],
  ['app/api/billing/portal', 'paying to cancel'],
  ['app/api/billing/trial', 'a trial you must already have to start'],
  ['app/api/auth/start', 'paying to sign in'],
  ['app/api/auth/verify', 'paying to sign in'],
  ['app/api/auth/signout', 'paying to sign out'],
  ['app/api/signup/verify', 'paying to create the account that gets the trial'],
  ['app/api/pay/[id]', 'his customer paying his invoice, not him using Lekhio: gating it stops a stranger paying a tradesman money he is owed'],
];
for (const [route, why] of NEVER_GATE) {
  ok(`🔴 ${route} is never gated (${why})`, ruleFor(route) === 'always');
}

// The work IS gated, or the paywall is decorative.
for (const route of ['app/api/pile', 'app/api/ask', 'app/api/elections',
  'app/api/reconcile', 'app/api/learn', 'app/api/voice/complete', 'app/api/bank/connect']) {
  ok(`${route} stops when he stops paying`, ruleFor(route) === 'entitled');
}

// 🔴 draft-invoice IS WORK AND IS NOT GATED, and this asserts the reason rather than the outcome.
//
// It has no session at all: the phone app posts with no token and only an IP rate limit stands
// between a stranger and our AI bill. There is no user to read a subscription for. That is a real
// gap and it is bigger than the paywall, so it is recorded in the table's own reasoning instead of
// being marked 'entitled', which would have read as covered while doing nothing.
//
// The day it learns who is asking, flip the row and delete this.
ok('draft-invoice is marked always, and its row says why it cannot be gated yet',
  ruleFor('app/api/draft-invoice') === 'always'
  && /no session to gate on/i.test(GATED_ROUTES.find((r) => r.route === 'app/api/draft-invoice').why));
ok('and it really does have no session read in it',
  !/sessionUser|userFromSessionCookie/.test(readFileSync(path.join(repo, 'app/api/draft-invoice/route.ts'), 'utf8')));
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND EVERY 'entitled' ROW IS ACTUALLY ENFORCED IN ITS OWN FILE.
//
// This is the assertion that stops the table going the way lib/routing.ts went. That table sat for
// two days describing channels nothing consulted, and nothing anywhere could tell, because a table
// that is merely well formed looks exactly like a table that is obeyed.
//
// A row saying 'entitled' with no gateForUser in the route is a paywall that is switched off for
// that feature, silently, for everybody, for ever.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ AND IT CHECKS WHICH HANDLER, NOT JUST WHICH FILE. The first version of this grepped the whole
// route and was happy. In app/api/learn the guard had landed in the GET, which reads back the vendor
// rules a man already taught us and must NEVER be gated, while the POST that does the actual
// learning was left wide open. The file contained gateForUser, so the test passed, and the paywall
// was off for that feature and on for the wrong one.
//
// It was found by walking the live site: /api/learn answered 400 where every other gated route
// answered 402. Same lesson as always here. A green suite is not evidence.
function handlers(src) {
  const found = [...src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)];
  return found.map((h, i) => ({
    method: h[1],
    body: src.slice(h.index, i + 1 < found.length ? found[i + 1].index : src.length),
  }));
}

const MUTATORS = new Set(['POST', 'PATCH', 'PUT']);
const unenforced = [];
const wronglyGated = [];
for (const r of gatedRoutes()) {
  const src = readFileSync(path.join(repo, `${r}/route.ts`), 'utf8');
  for (const h of handlers(src)) {
    const guarded = /gateForUser/.test(h.body);
    if (MUTATORS.has(h.method) && !guarded) unenforced.push(`${r} ${h.method}`);
    // 🔴 A GUARDED GET IS THE learn BUG. Reading his own records is never the work.
    if (h.method === 'GET' && guarded) wronglyGated.push(`${r} GET`);
  }
}
ok(
  `🔴 every mutating handler on a gated route calls gateForUser${unenforced.length ? `\n     ${unenforced.join('\n     ')}` : ''}`,
  unenforced.length === 0,
);
ok(
  `🔴 and no GET is gated, because reading his own records is never the work${wronglyGated.length ? `\n     ${wronglyGated.join('\n     ')}` : ''}`,
  wronglyGated.length === 0,
);

// And it refuses in a language the caller understands. A form post that got JSON back would show a
// man an error object in the middle of confirming his books.
const formCallers = ['app/api/pile', 'app/api/bank/connect'];
ok('the form posting routes refuse with a redirect, not an error object',
  formCallers.every((r) => /refuseUnentitled\(req, '/.test(readFileSync(path.join(repo, `${r}/route.ts`), 'utf8'))));

// 🔴 AND THE GUARD IS NEVER INSIDE THE UNAUTHENTICATED BRANCH. The first pass at wiring these put
// the check inside `if (!verified) {` in app/api/ask, where it would have read a subscription for a
// man who is not signed in. tsc caught it that time. This catches it next time.
for (const r of gatedRoutes()) {
  const src = readFileSync(path.join(repo, `${r}/route.ts`), 'utf8');
  const at = src.indexOf('gateForUser(');
  const before = src.slice(Math.max(0, at - 600), at);
  const opened = (before.match(/\{/g) || []).length;
  const closed = (before.match(/\}/g) || []).length;
  ok(`${r}: the gate is not nested inside an early return block`, opened <= closed + 1);
}

ok('an unknown route has no rule rather than a default', ruleFor('app/api/nope') === null);
ok('something is actually gated', gatedRoutes().length >= 8);

// ── 3. EVERY AMBIGUOUS CASE FAILS OPEN ────────────────────────────────────────────────────────
const TRIAL_DAYS = 7;
const read = (status, end) => ({ kind: 'read', status, current_period_end: end });

ok('entitled: open', gateFor(read('active'), true, 100, TRIAL_DAYS) === 'open');
ok('not entitled: read only', gateFor(read('canceled'), false, 100, TRIAL_DAYS) === 'readonly');

// 🔴 THE ONE THAT PROTECTS EVERY CUSTOMER AT ONCE. getSubscriptionByUser returns null both when the
// query failed and when there is no row. If a failed read meant "not entitled", one bad minute at
// Supabase would lock out the entire customer base, at exactly the moment we are least able to see
// it happening.
ok('🔴 an unreadable subscription is OPEN, whatever isEntitled says',
  gateFor({ kind: 'unreadable' }, false, 100, TRIAL_DAYS) === 'open');
ok('and an unreadable one is open even for an ancient account',
  gateFor({ kind: 'unreadable' }, false, 9999, TRIAL_DAYS) === 'open');

// No row at all. A repeat identity who has had his week, or a man whose grant failed. We cannot
// tell them apart from the absence, but nobody is in his first week twice.
ok('no row, brand new account: open. Our failed write must not be his problem.',
  gateFor({ kind: 'none' }, false, 0, TRIAL_DAYS) === 'open');
ok('no row, still inside the window: open', gateFor({ kind: 'none' }, false, TRIAL_DAYS, TRIAL_DAYS) === 'open');
ok('no row, past the window: read only', gateFor({ kind: 'none' }, false, TRIAL_DAYS + 1, TRIAL_DAYS) === 'readonly');
ok('🔴 an unknown account age is open, because a thin row of ours is not a fact about him',
  gateFor({ kind: 'none' }, false, null, TRIAL_DAYS) === 'open');
ok('a nonsense age is open too', noRowGrace(Number.NaN, TRIAL_DAYS) === 'open');

// The grace window MOVES WITH THE TRIAL. Hardcoding 7 here would silently stop matching the day
// TRIAL_DAYS changes, which is the exact bug lib/trialnudge.ts shipped with.
ok('the grace window follows the trial length, it is not a second 7',
  noRowGrace(10, 14) === 'open' && noRowGrace(15, 14) === 'readonly');

// ── 3b. THE READ THAT FEEDS ALL OF THIS ───────────────────────────────────────────────────────
//
// 🔴 THIS SECTION EXISTS BECAUSE THE PAYWALL SHIPPED WITH A BUG AND WAS FOUND AN HOUR LATER.
//
// subscriptions.user_id only arrived on 29 July. Every row created before it is keyed to a PHONE,
// and on 30 July three of the four rows in production had no user_id, including a paying active
// one. readGateInputs read by account only, so a legacy customer came back 'none', and 'none' on an
// account older than the trial means READ ONLY.
//
// The paywall would have locked out a man who was paying us, on his first visit to the web app, and
// the only signal would have been him leaving. /api/billing/status has done the two key read since
// web accounts landed; the lock had to learn the same thing.
const supabaseSrc = readFileSync(path.join(repo, 'lib/supabase.ts'), 'utf8');
const gateReader = supabaseSrc.slice(
  supabaseSrc.indexOf('export async function readGateInputs'),
  supabaseSrc.indexOf('export async function getSubscriptionByUser'),
);
ok('the gate reader was found, so these checks are not vacuous', gateReader.length > 500);
ok('🔴 it falls back to the phone keyed subscription, or a legacy paying customer is locked out',
  /getPhoneForUser/.test(gateReader) && /subscriptions\?phone=eq\./.test(gateReader));
// ⚠️ AND ONLY ON 'none'. Retrying after a failed read would turn "we could not see" into a second
// chance to answer wrongly, which is the whole thing the kinds exist to prevent.
ok('🔴 the phone fallback runs only when the account read came back EMPTY, never when it failed',
  /if \(read\.kind === 'none'\) \{[\s\S]{0,200}getPhoneForUser/.test(gateReader));
ok('a failed phone read is unreadable, not empty',
  (gateReader.match(/kind: 'unreadable'/g) || []).length >= 3);

// ── 3c. ONE ANSWER TO "IS HE ENTITLED", NOT THREE ─────────────────────────────────────────────
//
// 🔴 THE MOBILE PAYWALL READS /api/billing/status. app/(tabs)/_layout.tsx redirects to /paywall
// unless `entitled` is true, and every path in that route used to answer false when a read came
// back empty. A failed read is indistinguishable from an empty one through getSubscriptionByUser,
// so one bad minute at Supabase showed a paywall to every mobile customer at once, on their own
// books. That is the same failure the web gate was built to avoid, on the surface that already had
// a paywall.
//
// Both billing endpoints now report the gate, which reads two keys and fails open.
for (const r of ['app/api/billing/status', 'app/api/billing/trial']) {
  const src = readFileSync(path.join(repo, `${r}/route.ts`), 'utf8');
  ok(`🔴 ${r} reports entitlement from the gate, which fails open`,
    /gateForUser/.test(src) && /entitled: gate === 'open'/.test(src));
  ok(`${r} no longer answers entitled: false on an empty read`,
    !/entitled: false/.test(src));
  // ⚠️ COMMENTS STRIPPED FIRST. The route's own header names isEntitled in order to explain why it
  // is NOT used, and a guard that forbids a file from explaining itself is a guard somebody deletes.
  // The same trap caught the fourteen day sweep in test/trialnudge.test.mjs an hour earlier.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(`${r} does not compute a second opinion with isEntitled`, !/isEntitled/.test(code));
}

// ── 4. WHAT HE IS TOLD ────────────────────────────────────────────────────────────────────────
ok('there is a title and a line', READONLY_TITLE.length > 5 && READONLY_LINE.length > 30);
// 🔴 His books are not gone, and saying otherwise would be a lie about a man's tax records.
ok('🔴 the copy never suggests anything has been deleted or lost',
  !/deleted|removed|lost|gone|wiped|no longer have/i.test(READONLY_LINE + ' ' + READONLY_TITLE));
ok('and it says plainly that it is all still his',
  /still here and still yours/i.test(READONLY_LINE));
ok('the api payload says the same words as the screen', readonlyPayload().message === READONLY_LINE);
ok('the api payload is machine readable', readonlyPayload().error === 'not_entitled' && readonlyPayload().entitled === false);
ok('no em dashes or en dashes in the copy', ![READONLY_TITLE, READONLY_LINE, readonlyPayload().message].some((s) => /[–—]/.test(s)));
ok('every reason in the table is dash free', GATED_ROUTES.every((r) => !/[–—]/.test(r.why)));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
