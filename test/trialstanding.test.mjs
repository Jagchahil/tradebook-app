// THE RATCHET FOR THE NO ROW TRIAL. Run: node test/trialstanding.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 FOUND 8 AUGUST 2026 ON A BRAND NEW REAL SIGNUP, TWO DAYS BEFORE LAUNCH.
//
// An account made through the real /start flow, Start free trial pressed, /app/you/billing opened
// minutes later. The screen said "There is no subscription on this account yet, and nothing has
// been charged", and under it "No card on file. Nothing is charged during your trial." No date, no
// day count, and no word anywhere that he was on a trial at all.
//
// A real web signup gets NO subscription row. His trial is granted by noRowGrace in lib/gate.ts,
// on the AGE OF HIS ACCOUNT against the trial length. So the page resolved a null row by account
// and a null row by phone, and handed standingFor a null, which rendered the no row branch. The
// trial end date shipped the day before reads current_period_end off a row that does not exist for
// the very customer it was written for: only an account handed a trialing row by
// scripts/demo-account.mjs could ever have rendered it. Correct, tested, and unreachable.
//
// ⚠️ WHAT THIS SUITE HOLDS, AND THE SECOND IS THE ONE THAT MATTERS MOST.
//
//   1. THE FIVE STANDINGS, BY EQUALITY. Every case is driven through the REAL chain: gateFor and
//      noRowTrial out of lib/gate.ts, isEntitled out of lib/entitlement.ts, standingFor out of the
//      words module, with only the two Supabase reads staged. The whole list is pinned by
//      deepStrictEqual, so a sixth cannot be added, and a sentence cannot be reworded, in silence.
//
//   2. 🔴 THE SCREEN AND THE GATE CANNOT DISAGREE. The day printed is noRowGrace's own threshold
//      solved for the day instead of the verdict, so this walks the two together hour by hour
//      across the boundary and fails if the screen ever counts down a trial the gate has ended, or
//      names a day the gate would not act on.
//
//   3. HONESTY OVER A GUESS. An unreadable account age prints no date and says so. An unreadable
//      subscription does not get reported as him having none: those are different facts, which is
//      the whole reason lib/gate.ts's SubscriptionRead has three kinds and not two.
//
//   4. STILL A WORDING AND A READ, NOT A GATE CHANGE. noRowGrace and gateFor are pinned to the
//      verdicts test/gate.test.mjs already holds them to, and the page is pinned to reading only.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deepStrictEqual } from 'node:assert';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');
const mod = (p) => import(pathToFileURL(path.resolve(repo, p)).href);

const G = await mod('lib/gate.ts');
const W = await mod('app/app/you/billing/words.ts');
const E = await mod('lib/entitlement.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const equal = (a, b) => { try { deepStrictEqual(a, b); return true; } catch { return false; } };

// ⚠️ EXISTENCE BEFORE ANYTHING ELSE. Every check below reaches for one of these, and a check that
// silently does nothing because the thing it tests is absent is worse than no check: it reports
// coverage it does not have. If one of these fails, read no further up the file than this block.
console.log('\n0. THE PIECES EXIST AT ALL, BEFORE ANYTHING IS ASSERTED ABOUT THEM');
const TRIAL = E.TRIAL_DAYS;
ok('lib/entitlement.ts exports a trial length, and it is a real number of days',
  Number.isFinite(TRIAL) && TRIAL > 0);
ok('lib/gate.ts exports noRowGrace, the rule this whole suite is about',
  typeof G.noRowGrace === 'function');
ok('lib/gate.ts exports gateFor', typeof G.gateFor === 'function');
ok('🔴 lib/gate.ts exports noRowGraceEndsAt, that rule solved for the day it ends',
  typeof G.noRowGraceEndsAt === 'function');
ok('🔴 lib/gate.ts exports noRowTrial, the gate inputs turned into what a screen may say',
  typeof G.noRowTrial === 'function');
ok('the words module exports standingFor', typeof W.standingFor === 'function');
ok('and trialLine, the one place a trial sentence is built', typeof W.trialLine === 'function');

// Absent pieces must fail this suite loudly rather than throw a stack trace at whoever ran it, so
// every call below goes through these. A missing export becomes a standing nobody can mistake for
// a real one, and the equality pin prints it beside what was expected.
const MISSING = { kind: 'MISSING EXPORT', lines: [] };
const noRowTrialOf = (readKind, ageDays, now) =>
  (typeof G.noRowTrial === 'function' ? G.noRowTrial(readKind, ageDays, TRIAL, now) : { kind: 'off' });

// ── THE FIVE CASES, EACH DRIVEN THROUGH THE REAL CHAIN ────────────────────────────────────────
//
// Staged: what readGateInputs would have returned (the subscription read and the account age), and
// what the page's own account-then-phone row read would have resolved. Everything after that is
// the shipping code, in the order the page runs it.
const NOW = new Date('2026-08-10T09:00:00Z'); // launch morning, the hour this matters
const row = (over = {}) => ({
  status: null, plan: null, current_period_end: null, cancel_at_period_end: null, ...over,
});

const standingOf = ({ gateRead, ageDays, pageRow }) => {
  if (typeof G.gateFor !== 'function' || typeof W.standingFor !== 'function') return MISSING;
  const entitled = gateRead.kind === 'read'
    ? E.isEntitled({ status: gateRead.status, current_period_end: gateRead.current_period_end })
    : false;
  const gate = G.gateFor(gateRead, entitled, ageDays, TRIAL);
  const trial = noRowTrialOf(gateRead, ageDays, NOW);
  return W.standingFor(pageRow, gate, NOW, trial);
};

const CASES = [
  {
    // 🔴 THE DEFECT ITSELF. A real web signup, two days in: no row anywhere, a trial granted on
    // account age alone. Created 8 August, so a 7 day trial has 5 days left and ends 15 August.
    name: 'a null row on a fresh account, the real web signup',
    gateRead: { kind: 'none' },
    ageDays: 2,
    pageRow: null,
  },
  {
    // The other side of the same grace: no row, and the account is older than the trial, so the
    // gate has already closed. He must be told his trial ENDED, never counted down.
    name: 'a null row on an account older than the trial',
    gateRead: { kind: 'none' },
    ageDays: TRIAL + 2,
    pageRow: null,
  },
  {
    // 🔴 HONESTY. We could not read how old his account is. The gate fails open on that, so he
    // keeps everything, and the screen says it cannot show the date rather than inventing one.
    name: 'a null row with an unreadable account age',
    gateRead: { kind: 'none' },
    ageDays: null,
    pageRow: null,
  },
  {
    // ⚠️ THE EXISTING GRANTED CASE, WHICH MUST NOT REGRESS. A trialing row, the shape
    // scripts/demo-account.mjs writes and Stripe sends, still reads its date off the row.
    name: 'a trialing row, the granted trial that already worked',
    gateRead: { kind: 'read', status: 'trialing', current_period_end: '2026-08-13T00:00:00Z' },
    ageDays: 2,
    pageRow: row({ status: 'trialing', current_period_end: '2026-08-13T00:00:00Z' }),
  },
  {
    // A paying man. Nothing about the no row grace may reach him.
    name: 'an active paying row',
    gateRead: { kind: 'read', status: 'active', current_period_end: '2026-09-10T00:00:00Z' },
    ageDays: 40,
    pageRow: row({
      status: 'active', plan: 'monthly', current_period_end: '2026-09-10T00:00:00Z',
      cancel_at_period_end: false,
    }),
  },
];

console.log('\n1. THE FIVE STANDINGS, PINNED AS A WHOLE LIST BY EQUALITY');

const ACTUAL = CASES.map(standingOf);
const EXPECTED = [
  {
    kind: 'trial',
    lines: ['You are on the free trial, with 5 days left. It ends 15 August 2026.'],
  },
  {
    kind: 'lapsed',
    lines: [
      'Your trial has ended, so Lekhio is reading only just now.',
      'Everything you have is still here and still yours to look at.',
    ],
  },
  {
    kind: 'trial',
    lines: ['You are on the free trial. We cannot show the date it ends.'],
  },
  {
    kind: 'trial',
    lines: ['You are on the free trial, with 3 days left. It ends 13 August 2026.'],
  },
  {
    kind: 'paying',
    lines: ['You are paying monthly.', 'The next renewal is 10 September 2026.'],
  },
];

// 🔴 THE LIST IS HELD AS A LIST. Case by case assertions let a sixth standing be added, or a case
// quietly dropped, without a single line going red. This is the whole list against the whole list.
ok('there are exactly five cases and five expected standings, so a sixth cannot be added silently',
  CASES.length === 5 && ACTUAL.length === 5 && EXPECTED.length === 5);
if (!equal(ACTUAL, EXPECTED)) {
  console.log('\n        ACTUAL:');
  ACTUAL.forEach((s, i) => console.log(`          ${i}. ${CASES[i]?.name ?? '?'}\n             ${JSON.stringify(s)}`));
  console.log('        EXPECTED:');
  EXPECTED.forEach((s, i) => console.log(`          ${i}. ${JSON.stringify(s)}`));
  console.log('');
}
ok('🔴 EVERY STANDING IS EXACTLY WHAT IT SHOULD BE, WORD FOR WORD, AS ONE LIST',
  equal(ACTUAL, EXPECTED));

// And the named case that started all this, said again on its own so a reader of a red run knows
// which sentence the customer actually saw.
ok('🔴 A MAN ON DAY TWO OF HIS TRIAL IS TOLD HE IS ON A TRIAL, not that he has no subscription',
  ACTUAL[0] !== undefined
  && /You are on the free trial/.test(ACTUAL[0].lines.join(' '))
  && !/no subscription/.test(ACTUAL[0].lines.join(' ')));
ok('🔴 AND HE IS TOLD THE DAY IT ENDS',
  ACTUAL[0] !== undefined && /It ends 15 August 2026\./.test(ACTUAL[0].lines.join(' ')));

// The kinds themselves are a closed list. A sixth kind is a sixth thing the page must draw.
console.log('\n2. THE STANDING KINDS ARE A CLOSED LIST TOO');
{
  const words = read('app/app/you/billing/words.ts');
  const m = words.match(/export interface Standing \{[\s\S]*?kind:\s*([^;]+);/);
  ok('the Standing kinds were found in the source, so this check is not vacuous', m !== null);
  const kinds = m ? m[1].split('|').map((s) => s.trim().replace(/'/g, '')) : [];
  ok('the kinds are exactly these five, so a sixth cannot be added silently',
    equal(kinds, ['trial', 'paying', 'lapsed', 'ended', 'none']));
}

// ── 3. THE SCREEN AND THE GATE CANNOT DISAGREE ────────────────────────────────────────────────
console.log('\n3. 🔴 THE DAY ON THE SCREEN IS THE DAY THE GATE ACTS ON');
{
  // Hour by hour from a new account to two days past the window. The screen may count down a
  // trial exactly when the gate is holding the door open on it, and never once otherwise.
  let disagreements = 0;
  let checked = 0;
  let first = null;
  for (let hour = 0; hour <= (TRIAL + 2) * 24; hour += 1) {
    const ageDays = hour / 24;
    const gate = typeof G.noRowGrace === 'function' ? G.noRowGrace(ageDays, TRIAL) : 'open';
    const window = noRowTrialOf({ kind: 'none' }, ageDays, NOW);
    checked += 1;
    const counting = window.kind === 'grace';
    if (counting !== (gate === 'open')) {
      disagreements += 1;
      if (first === null) first = `age ${ageDays} days: gate ${gate}, screen ${window.kind}`;
    }
  }
  ok('the walk actually ran over the whole window and past it', checked === (TRIAL + 2) * 24 + 1);
  if (first) console.log(`        first disagreement: ${first}`);
  ok('🔴 THE SCREEN COUNTS DOWN A TRIAL EXACTLY WHEN THE GATE IS OPEN ON ONE, NEVER OTHERWISE',
    disagreements === 0);
}
{
  // Stronger than agreement: the exact instant printed is the instant the verdict turns over. An
  // account of that age is still open, and a minute older is not.
  const ageDays = 2;
  const end = typeof G.noRowGraceEndsAt === 'function'
    ? G.noRowGraceEndsAt(ageDays, TRIAL, NOW) : null;
  ok('the end instant exists before anything is asserted about it', end instanceof Date);
  const ageAtEnd = end ? ageDays + (end.getTime() - NOW.getTime()) / 86400000 : NaN;
  ok('🔴 AT THE PRINTED INSTANT THE GATE IS STILL OPEN',
    typeof G.noRowGrace === 'function' && G.noRowGrace(ageAtEnd, TRIAL) === 'open');
  ok('🔴 AND A MINUTE PAST IT THE GATE IS READ ONLY, so the day named is the day it turns',
    typeof G.noRowGrace === 'function' && G.noRowGrace(ageAtEnd + 1 / 1440, TRIAL) === 'readonly');
  ok('the printed instant is one trial length after the account was made, nothing else',
    Math.abs(ageAtEnd - TRIAL) < 1e-9);
}
{
  // The window moves when the trial moves. A screen holding its own 7 is a screen that goes wrong
  // silently the day TRIAL_DAYS changes, which is the exact bug lib/trialnudge.ts shipped with.
  const w14 = typeof G.noRowTrial === 'function'
    ? G.noRowTrial({ kind: 'none' }, 10, 14, NOW) : { kind: 'off' };
  ok('a fourteen day trial at ten days old is still counting down', w14.kind === 'grace');
  const s14 = typeof W.standingFor === 'function' ? W.standingFor(null, 'open', NOW, w14) : MISSING;
  ok('and it says four days left, not a number borrowed from a seven day trial',
    /with 4 days left/.test(s14.lines.join(' ')));
}

// ── 4. HONESTY, IN BOTH DIRECTIONS ────────────────────────────────────────────────────────────
console.log('\n4. 🔴 WHAT IS NOT KNOWN IS SAID, NEVER GUESSED AND NEVER DRESSED UP');
{
  const w = noRowTrialOf({ kind: 'none' }, null, NOW);
  ok('an unreadable account age yields a trial with no date at all, rather than a date',
    w.kind === 'grace' && w.endsIso === null);
  const s = typeof W.standingFor === 'function' ? W.standingFor(null, 'open', NOW, w) : MISSING;
  const text = s.lines.join(' ');
  ok('🔴 AND THE SCREEN PRINTS NO FIGURE OF ANY KIND', !/\d/.test(text));
  ok('🔴 AND IT SAYS SO OUT LOUD RATHER THAN GOING QUIET', /cannot show/i.test(text));
  ok('while still telling him he is on a trial, which is the thing the gate is acting on',
    /You are on the free trial/.test(text));
}
{
  // 🔴 'unreadable' AND 'none' ARE DIFFERENT FACTS. A failed read reported as "you have no
  // subscription" is the conflation lib/gate.ts's three kinds exist to prevent, said to a man.
  const w = noRowTrialOf({ kind: 'unreadable' }, 2, NOW);
  ok('an unreadable subscription is its own answer, never a trial and never a nothing',
    w.kind === 'unknown');
  const s = typeof W.standingFor === 'function' ? W.standingFor(null, 'open', NOW, w) : MISSING;
  const text = s.lines.join(' ');
  ok('🔴 A MAN WHOSE SUBSCRIPTION WE COULD NOT READ IS NOT TOLD HE HAS NONE',
    !/no subscription on this account/.test(text) && /cannot show/i.test(text));
  ok('and he is told nothing of his is locked, which is what the gate actually did',
    /nothing is locked/i.test(text));
  ok('nor is he told a trial ends on a day we cannot stand behind', !/It ends/.test(text));
}
{
  // A caller that knows nothing keeps the old plain sentence. Nothing was invented for it.
  const s = typeof W.standingFor === 'function' ? W.standingFor(null, 'open', NOW) : MISSING;
  ok('with no trial information at all the page still says the plain thing, and no date',
    s.kind === 'none' && /no subscription on this account yet/.test(s.lines[0]) && !/It ends/.test(s.lines[0]));
}
{
  // The trialing row keeps its own honesty line, and it is the SAME sentence, from one builder.
  const noDate = typeof W.standingFor === 'function'
    ? W.standingFor(row({ status: 'trialing' }), 'open', NOW) : MISSING;
  const noAge = typeof W.standingFor === 'function'
    ? W.standingFor(null, 'open', NOW, { kind: 'grace', endsIso: null }) : MISSING;
  ok('a granted trial with no date and a grace trial with no date say the identical sentence',
    equal(noDate.lines, noAge.lines));
}

// ── 5. THE COPY OBEYS THE HOUSE RULES ─────────────────────────────────────────────────────────
console.log('\n5. THE SENTENCES THEMSELVES');
{
  const everything = [
    ...ACTUAL.flatMap((s) => s.lines),
    ...(typeof W.standingFor === 'function'
      ? W.standingFor(null, 'open', NOW, { kind: 'unknown' }).lines : []),
    ...(typeof W.trialLine === 'function'
      ? [W.trialLine(null, null), W.trialLine(0, '15 August 2026'), W.trialLine(1, '15 August 2026')] : []),
  ].join(' ');
  // ⚠️ THE FORBIDDEN CHARACTERS ARE WRITTEN AS ESCAPES, the discipline test/housestyle.test.mjs
  // already keeps: a file that checks for a character it may not contain must not contain it.
  ok('no em dash and no en dash in any of it', !/[\u2013\u2014]/.test(everything));
  ok('no hyphen standing in for a dash either', !/ - /.test(everything));
  // No host name of any kind, which is a stronger thing than the right host name, and it needs no
  // wrong domain written down anywhere to check it.
  ok('nothing names a domain, so nothing can name the wrong one', !/\w\.[a-z]{2,}/i.test(everything));
  ok('no sentence claims his books are gone', !/deleted|removed|lost|gone|wiped|no longer have/i.test(everything));
  ok('the day left case reads as a day, never as 1 days',
    typeof W.trialLine === 'function' && W.trialLine(1, '15 August 2026') === 'You are on the free trial, with a day left. It ends 15 August 2026.');
}

// ── 6. WHERE THE DATE COMES FROM, IN THE SOURCE ───────────────────────────────────────────────
console.log('\n6. ONE DEFINITION OF A TRIAL, AND THE SCREEN IS NOT A SECOND ONE');
{
  const gate = read('lib/gate.ts');
  const gateServer = read('lib/gateserver.ts');
  const words = read('app/app/you/billing/words.ts');
  const page = read('app/app/you/billing/page.tsx');

  // 🔴 THE ARITHMETIC LIVES BESIDE THE RULE IT IS THE THRESHOLD OF. Its position is asserted only
  // after both ends are known to be there at all.
  const iGrace = gate.indexOf('export function noRowGrace(');
  const iEnds = gate.indexOf('export function noRowGraceEndsAt(');
  ok('noRowGrace and noRowGraceEndsAt are both present in lib/gate.ts', iGrace > -1 && iEnds > -1);
  ok('and the day is worked out in the same file as the verdict, next to it', iGrace > -1 && iEnds > iGrace);
  ok('🔴 noRowTrial ASKS noRowGrace ITSELF whether there is a trial to describe',
    /noRowTrial\([\s\S]{0,600}noRowGrace\(accountAgeDays, trialDays\)/.test(gate));
  ok('and it reads the trial length it is given, never a number of its own',
    !/noRowGraceEndsAt\([^)]*\b7\b/.test(gate) && /noRowGraceEndsAt\(accountAgeDays, trialDays, now\)/.test(gate));

  // ⚠️ THE SIBLING RATCHET, RE-ASSERTED SO THE TWO CANNOT DRIFT. test/trialdate.test.mjs holds the
  // words module to having no second clock of its own. This fix must not have quietly bought its
  // way past that line: the module still receives an instant and only formats it.
  ok('🔴 THE WORDS MODULE STILL COMPUTES NO DATE FROM AN ACCOUNT AGE OR A CREATION TIME',
    !/created_at|accountAge|noRowGrace/.test(words));
  ok('it still performs no I/O and imports nothing',
    !/fetch\(/.test(words) && !/^import /m.test(words));
  ok('the trial sentence is built in one place, used by both the row branch and the no row branch',
    (words.match(/trialLine\(/g) || []).length >= 3);

  // The server read: the gate's own inputs, the gate's own rule file, and no decision of its own.
  ok('lib/gateserver.ts asks readGateInputs, the same reader gateForUser asks',
    /noRowTrialForUser[\s\S]{0,600}readGateInputs\(userId\)/.test(gateServer));
  ok('and hands them straight to lib/gate.ts with the one trial length',
    /noRowTrial\(read, accountAgeDays, TRIAL_DAYS, now\)/.test(gateServer));
  ok('🔴 IT NEVER THROWS: our failure answers unknown, it does not become his problem',
    /noRowTrialForUser[\s\S]{0,600}catch \{[\s\S]{0,120}kind: 'unknown'/.test(gateServer));
  ok('gateForUser is untouched and is still the only thing that returns a gate',
    /export async function gateForUser\(userId: string\): Promise<Gate>/.test(gateServer)
    && /return gateFor\(read, entitled, accountAgeDays, TRIAL_DAYS\);/.test(gateServer));

  // The page: one clock, the window passed in, and still nothing but reads.
  ok('the page takes one clock and gives it to both the read and the sentences',
    /const now = new Date\(\);/.test(page) && /noRowTrialForUser\(user\.id, now\)/.test(page)
    && /standingFor\(row, gate, now, trial\)/.test(page));
  ok('the gate itself is still read by gateForUser, unchanged', /gateForUser\(user\.id\)/.test(page));
}

// ── 7. THIS LANE CHANGED NOTHING ABOUT WHAT ANY MAN MAY DO ────────────────────────────────────
console.log('\n7. A WORDING AND A READ, NOT A GATE CHANGE');
{
  // The verdicts test/gate.test.mjs holds, asserted again here, so a change to the display cannot
  // reach the decision without two suites going red at once.
  ok('no row on a brand new account is still open',
    G.noRowGrace(0, TRIAL) === 'open');
  ok('no row at exactly the trial length is still open',
    G.noRowGrace(TRIAL, TRIAL) === 'open');
  ok('no row past the window is still read only',
    G.noRowGrace(TRIAL + 1, TRIAL) === 'readonly');
  ok('an unreadable age is still open, and a nonsense one too',
    G.noRowGrace(null, TRIAL) === 'open' && G.noRowGrace(Number.NaN, TRIAL) === 'open');
  ok('an unreadable subscription is still open whatever isEntitled says',
    G.gateFor({ kind: 'unreadable' }, false, 9999, TRIAL) === 'open');
  ok('and the grace window still follows the trial length rather than a second 7',
    G.noRowGrace(10, 14) === 'open' && G.noRowGrace(15, 14) === 'readonly');

  const page = read('app/app/you/billing/page.tsx');
  // 🔴 THE READ ONLY LIST test/trialdate.test.mjs HOLDS, RE-ASSERTED. A subscription row is never
  // written from this page, and the new read did not arrive by widening that import.
  const READ_ONLY = ['getPhoneForUser', 'getStripeCustomerForAccount', 'getSubscriptionByPhone', 'getSubscriptionByUser'];
  const fromIdx = page.indexOf("from '../../../../lib/supabase'");
  const openIdx = fromIdx === -1 ? -1 : page.lastIndexOf('import {', fromIdx);
  const named = openIdx === -1 ? [] : page.slice(openIdx + 'import {'.length, fromIdx)
    .replace(/\s/g, '').split(',').filter((s) => s && s !== '}');
  ok('the supabase import block was found, so this check is not vacuous', named.length > 0);
  ok('🔴 THE PAGE STILL ASKS lib/supabase.ts FOR NOTHING BUT THOSE FOUR READS',
    named.every((n) => READ_ONLY.includes(n)) && READ_ONLY.every((n) => named.includes(n)));
  ok('🔴 AND IT STILL NEVER WRITES A SUBSCRIPTION ROW', !/rest\/v1\/subscriptions/.test(page));
  ok('the page still refuses nobody: the gate only chooses sentences here',
    !/redirect\([^)]*locked/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
