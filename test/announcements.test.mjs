// Tests for lib/announcements.ts, THE ONLY THING THAT PUTS KHOJI IN FRONT OF A CUSTOMER.
//
// What this suite defends, in the order it matters:
//
//   1. AN UNAPPROVED ROW CAN NEVER REACH A CUSTOMER. This is the whole reason the file exists and
//      the reason the Brain desk's approve button is worth anything. `reviewed` is an allowlist of
//      one word. Every other status knowledge_items can hold is proven refused BY NAME, and a
//      sweep proves it again over every status the schema mentions plus a pile of near misses,
//      because "reviewed_by_khoji" must not pass a startsWith that somebody wrote in a hurry.
//   2. NO CLAIM WITHOUT ITS SOURCE. A tax sentence with no checkable link is refused outright.
//   3. NO HALF A RULE. A summary is rendered whole or dropped whole. Cutting "the rate rises to
//      60p" away from "for the first 10,000 miles only" is short, readable, and wrong.
//   4. WE ONLY SAY "your figures already reflect this" WHEN WE CAN PROVE IT. Never off
//      engine_impact, which records what somebody INTENDED, not what actually moved.
//   5. NOTHING PERSONAL CAN BE IN AN ANNOUNCEMENT, and it is structural: no input field carries
//      one. Proven by reading the source, so a future field cannot quietly open the door.
//   6. HOUSE STYLE. No em dash, no en dash, no hyphen used as a sentence dash, in any output.
//
// announcements.ts imports housestyle with an extensionless specifier (the Next convention), which
// Node's type stripping cannot resolve, so the files are staged to a temp dir with the import
// rewritten, the same approach as test/weeklyupdate.test.mjs.
//
// Run: node test/announcements.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'announce-'));

const SRC = readFileSync(path.join(lib, 'announcements.ts'), 'utf8');
const fix = (s) => s.replace("from './housestyle'", "from './housestyle.ts'");

writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
writeFileSync(path.join(stage, 'announcements.ts'), fix(SRC));

const A = await import(pathToFileURL(path.join(stage, 'announcements.ts')).href);
const H = await import(pathToFileURL(path.join(stage, 'housestyle.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const NOW = new Date('2026-07-27T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const GOOD_URL = 'https://www.gov.uk/government/publications/rates-and-allowances';

const kRow = (over = {}) => ({
  id: 'k1',
  status: 'reviewed',
  title: 'The mileage rate has changed',
  summary: 'HMRC has published a new approved mileage rate for cars and vans.',
  source_url: GOOD_URL,
  effective_date: '2026-04-06',
  created_at: daysAgo(2),
  engine_impact: true,
  ...over,
});

const mRow = (over = {}) => ({
  id: 'm1',
  title: 'You can now upload receipts from the web',
  body: 'Open Lekhio in a browser and drop a photo straight in. Nothing to install.',
  source_url: null,
  knowledge_item_id: null,
  published_at: daysAgo(1),
  expires_at: null,
  ...over,
});

const select = (over = {}) =>
  A.selectAnnouncements({ knowledge: [], manual: [], now: NOW, ...over });

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE GATE: only an approved row reaches a customer');

ok('a reviewed row with a source and a title is allowed', A.refuseKnowledge(kRow(), NOW) === null);
ok('APPROVED_STATUS is exactly "reviewed"', A.APPROVED_STATUS === 'reviewed');

// Every status the schema names, refused BY NAME. If a status is ever added to knowledge_items and
// somebody wants it customer facing, they have to come here and say so out loud.
for (const status of A.NEVER_CUSTOMER_FACING) {
  const reason = A.refuseKnowledge(kRow({ status }), NOW);
  ok(`status "${status}" is refused`, reason === `status_not_approved:${status}`);
  ok(`status "${status}" never appears in the output`, select({ knowledge: [kRow({ status })] }).length === 0);
}

// The near misses. A gate written with startsWith, includes, or a truthy check would let these
// through, and each one is a real shape a careless refactor produces.
const NEAR_MISSES = [
  'reviewed_by_khoji', 'unreviewed', 'not_reviewed', 'reviewing', 'review', 'reviewedx',
  'pending_review', 'auto_reviewed', 'REVIEWED_PENDING', '', ' ', null, undefined, 'approved', 'ok',
];
for (const status of NEAR_MISSES) {
  const shown = select({ knowledge: [kRow({ status })] });
  ok(`near miss status ${JSON.stringify(status)} is refused`, shown.length === 0);
}

// And the ones that MUST pass, because a database returns what a database returns.
for (const status of ['reviewed', 'Reviewed', 'REVIEWED', ' reviewed ']) {
  ok(`status ${JSON.stringify(status)} is accepted`, select({ knowledge: [kRow({ status })] }).length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. NO CLAIM WITHOUT ITS SOURCE');

const BAD_URLS = [
  null, '', '   ', 'gov.uk/rates', '/rates', 'http://www.gov.uk/rates', 'mailto:hmrc@gov.uk',
  'javascript:alert(1)', 'https://', 'https://a', 'https://gov.uk/a b',
];
for (const source_url of BAD_URLS) {
  ok(`source ${JSON.stringify(source_url)} is refused`, A.refuseKnowledge(kRow({ source_url }), NOW) === 'no_source_link');
  ok(`source ${JSON.stringify(source_url)} never reaches the output`, select({ knowledge: [kRow({ source_url })] }).length === 0);
}
ok('a good https source is citable', A.isCitable(GOOD_URL) === true);
ok('every khoji announcement carries a source link', select({ knowledge: [kRow()] })[0].sourceUrl === GOOD_URL);
ok('a row with no title is refused', A.refuseKnowledge(kRow({ title: '   ' }), NOW) === 'no_title');

// A human writing a product note needs no citation. A human LINKING something needs a real link.
ok('a manual note with no link is allowed', A.refuseManual(mRow(), NOW) === null);
ok('a manual note with a bad link is refused', A.refuseManual(mRow({ source_url: 'gov.uk/x' }), NOW) === 'bad_source_link');

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. FRESHNESS: we do not guess at a date');

ok('a row from 2 days ago is fresh', A.refuseKnowledge(kRow({ created_at: daysAgo(2) }), NOW) === null);
ok(`a row from ${A.MAX_AGE_DAYS + 5} days ago is too old`, A.refuseKnowledge(kRow({ created_at: daysAgo(A.MAX_AGE_DAYS + 5) }), NOW) === 'too_old');
ok('an undated row is refused, not assumed fresh', A.refuseKnowledge(kRow({ created_at: null }), NOW) === 'undated');
ok('an unparseable date is refused', A.refuseKnowledge(kRow({ created_at: 'last tuesday' }), NOW) === 'undated');
ok('a row dated a week in the future is refused', A.refuseKnowledge(kRow({ created_at: daysAgo(-7) }), NOW) === 'dated_in_future');
ok('an expired manual note is refused', A.refuseManual(mRow({ expires_at: daysAgo(1) }), NOW) === 'expired');
ok('a manual note expiring tomorrow is allowed', A.refuseManual(mRow({ expires_at: daysAgo(-1) }), NOW) === null);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. NO HALF A RULE: whole summary or none');

const SHORT = 'HMRC has published a new approved mileage rate.';
const LONG = 'The rate rises to 60p. '.repeat(20);
ok('a short summary is rendered whole', A.bodyOrNothing(SHORT) === SHORT);
ok('a long summary is dropped, not cut', A.bodyOrNothing(LONG) === '');
ok('an empty summary is empty', A.bodyOrNothing(null) === '');
ok('no output body is ever longer than the cap', select({ knowledge: [kRow({ summary: LONG })] })[0].body.length <= A.MAX_BODY_CHARS);
ok('a dropped body still leaves a headline and a link', (() => {
  const a = select({ knowledge: [kRow({ summary: LONG })] })[0];
  return a.body === '' && a.title.length > 0 && a.sourceUrl === GOOD_URL;
})());
ok('nothing in the output ends in an ellipsis', (() => {
  const all = select({ knowledge: [kRow({ summary: LONG }), kRow({ id: 'k2', summary: SHORT })] });
  return all.every((a) => !/[.]{3}$|…/.test(a.body) && !/[.]{3}$|…/.test(a.title));
})());

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. "your figures already reflect this" needs PROOF, not intent');

ok('engine_impact alone does NOT mark an item applied', select({ knowledge: [kRow({ engine_impact: true })] })[0].applied === false);
ok('an item in appliedItemIds IS applied', select({ knowledge: [kRow()], appliedItemIds: ['k1'] })[0].applied === true);
ok('appliedLineFor refuses an unapplied item', A.appliedLineFor({ applied: false }) === null);
ok('appliedLineFor gives the one line for an applied item', A.appliedLineFor({ applied: true }) === A.APPLIED_LINE);
ok('the applied line promises no action', /do not need to do anything/.test(A.APPLIED_LINE));
ok('a manual note is never applied on its own', select({ manual: [mRow()], appliedItemIds: ['m1'] })[0].applied === false);
ok('a manual note tied to a proven item IS applied', select({
  manual: [mRow({ knowledge_item_id: 'k1' })], appliedItemIds: ['k1'],
})[0].applied === true);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. DISMISSAL: per item, stable, and it sticks');

ok('the khoji key is stable and namespaced', A.khojiKey('abc') === 'khoji:abc');
ok('the manual key is stable and namespaced', A.manualKey('abc') === 'lekhio:abc');
ok('keys from the two sources can never collide', A.khojiKey('x') !== A.manualKey('x'));
ok('a dismissed khoji item disappears', select({ knowledge: [kRow()], dismissedKeys: ['khoji:k1'] }).length === 0);
ok('a dismissed manual item disappears', select({ manual: [mRow()], dismissedKeys: ['lekhio:m1'] }).length === 0);
ok('dismissing one leaves the other', (() => {
  const shown = select({ knowledge: [kRow(), kRow({ id: 'k2' })], dismissedKeys: ['khoji:k1'] });
  return shown.length === 1 && shown[0].key === 'khoji:k2';
})());
ok('an edited announcement stays dismissed (the key is the id, not the text)', (() => {
  const edited = kRow({ title: 'A completely different headline', summary: 'And a different summary.' });
  return select({ knowledge: [edited], dismissedKeys: ['khoji:k1'] }).length === 0;
})());

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. THE SHAPE OF THE BANNER: a few things, in a defensible order');

ok('the banner never holds more than the cap', (() => {
  const many = Array.from({ length: 12 }, (_, i) => kRow({ id: `k${i}`, created_at: daysAgo(i + 1) }));
  return select({ knowledge: many }).length === A.MAX_ITEMS;
})());
ok('the cap is a small number', A.MAX_ITEMS <= 5);
ok('what moved his figures comes first', (() => {
  const shown = select({
    knowledge: [kRow({ id: 'old', created_at: daysAgo(9) }), kRow({ id: 'new', created_at: daysAgo(1) })],
    appliedItemIds: ['old'],
  });
  return shown[0].key === 'khoji:old';
})());
ok('a human note outranks an ordinary khoji card', (() => {
  const shown = select({ knowledge: [kRow({ created_at: daysAgo(1) })], manual: [mRow({ published_at: daysAgo(5) })] });
  return shown[0].source === 'lekhio';
})());
ok('otherwise, newest first', (() => {
  const shown = select({
    knowledge: [kRow({ id: 'a', created_at: daysAgo(9) }), kRow({ id: 'b', created_at: daysAgo(1) })],
  });
  return shown[0].key === 'khoji:b' && shown[1].key === 'khoji:a';
})());
ok('the order is stable for identical timestamps', (() => {
  const rows = [kRow({ id: 'b' }), kRow({ id: 'a' })];
  const one = select({ knowledge: rows }).map((a) => a.key).join(',');
  const two = select({ knowledge: [...rows].reverse() }).map((a) => a.key).join(',');
  return one === two;
})());
ok('a human wording supersedes the automatic card for the same finding', (() => {
  const shown = select({ knowledge: [kRow()], manual: [mRow({ knowledge_item_id: 'k1' })] });
  return shown.length === 1 && shown[0].source === 'lekhio';
})());
ok('a refused human wording does NOT suppress the real card', (() => {
  // An expired note must not silently take the Khoji card down with it. That would be a change we
  // told nobody about, which is worse than telling them twice.
  const shown = select({ knowledge: [kRow()], manual: [mRow({ knowledge_item_id: 'k1', expires_at: daysAgo(1) })] });
  return shown.length === 1 && shown[0].source === 'khoji';
})());
ok('an empty input gives an empty banner, never a placeholder', select().length === 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n8. HOUSE STYLE, on every word that reaches a screen');

ok('an em dash in a title is sanitised away', (() => {
  const a = select({ knowledge: [kRow({ title: 'The rate changed — again' })] })[0];
  return a && !H.hasForbiddenDash(a.title);
})());
ok('an en dash in a summary is sanitised away', (() => {
  const a = select({ knowledge: [kRow({ summary: 'Bands run £12,570 – £50,270 this year.' })] })[0];
  return a && !H.hasForbiddenDash(a.body);
})());
ok('the applied line is house style clean', !H.hasForbiddenDash(A.APPLIED_LINE));
ok('no output anywhere carries a forbidden dash', (() => {
  const shown = select({
    knowledge: [kRow({ title: 'A — B', summary: 'C – D' })],
    manual: [mRow({ title: 'E — F', body: 'G - H' })],
  });
  return shown.length === 2 && shown.every((a) => !H.hasForbiddenDash(a.title) && !H.hasForbiddenDash(a.body));
})());
// The source file is checked for the DASH CHARACTERS only, not hasForbiddenDash's spaced-hyphen
// rule: that rule is about prose, and it correctly fires on ordinary arithmetic like
// `rank(a) - rank(b)`. An em or en dash in a source file is always a copy or comment slip, so that
// is the half worth pinning here. Every string this file actually EMITS is checked in full above.
ok('the source file contains no em dash or en dash', !/[–—]/.test(SRC));
ok('no string literal in the source carries a forbidden dash', (() => {
  // Comments are stripped FIRST. An apostrophe in prose ("a human's own wording") reads as an
  // opening quote to any naive literal scanner, and the span it then swallows is not a string.
  const code = SRC.replace(/^\s*\/\/.*$/gm, '');
  const literals = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]);
  return literals.length > 5 && literals.every((s) => !H.hasForbiddenDash(s));
})());

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n9. STRUCTURAL: nothing personal can be in an announcement');

// The strongest available guarantee is not a filter, it is an absent field. An announcement is a
// fact about the law, identical for every reader. If the input ever grows a way to carry a
// circumstance, a name or a figure of his, this test fails and somebody has to justify it.
const FORBIDDEN_INPUT = [
  'circumstance', 'answers', 'specialCategory', 'special_category', 'userId', 'user_id',
  'phone', 'email', 'transaction', 'income', 'expenses', 'turnover', 'receipt',
];
for (const word of FORBIDDEN_INPUT) {
  ok(`the module never mentions "${word}"`, !new RegExp(word, 'i').test(SRC.replace(/^\s*\/\/.*$/gm, '')));
}
ok('the module imports nothing but housestyle', (() => {
  const imports = [...SRC.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  return imports.length === 1 && imports[0] === './housestyle';
})());
ok('every announcement for one customer is identical to every other customer\'s', (() => {
  // Same rows, different dismissals only. The TEXT can never differ between two readers, because
  // nothing in the selection reads anything about a reader.
  const rows = { knowledge: [kRow(), kRow({ id: 'k2' })] };
  const a = select(rows);
  const b = select({ ...rows, dismissedKeys: ['khoji:k2'] });
  return b.length === 1 && b[0].title === a.find((x) => x.key === 'khoji:k1').title;
})());

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n10. THE SWEEP: no shape of row gets an unapproved item onto a screen');

// Brute force over the cross product of every status against every field combination that could
// plausibly confuse a gate. The count is the point: if ONE of these ever renders, the approve
// button on the Brain desk stopped meaning anything and nobody would have noticed.
let leaked = 0;
let checked = 0;
const STATUSES = [...A.NEVER_CUSTOMER_FACING, ...NEAR_MISSES];
for (const status of STATUSES) {
  for (const source_url of [GOOD_URL, null, 'http://gov.uk/x']) {
    for (const created_at of [daysAgo(1), daysAgo(200), null]) {
      for (const engine_impact of [true, false]) {
        for (const appliedItemIds of [[], ['k1']]) {
          checked += 1;
          const shown = A.selectAnnouncements({
            knowledge: [kRow({ status, source_url, created_at, engine_impact })],
            manual: [],
            appliedItemIds,
            now: NOW,
          });
          if (shown.length !== 0) leaked += 1;
        }
      }
    }
  }
}
ok(`${checked} unapproved row shapes, ${leaked} reached a customer`, leaked === 0 && checked > 400);

// And the mirror: an approved row DOES render, so the sweep above is not passing by accident on a
// function that returns nothing at all.
ok('an approved row does render (the sweep is not vacuous)', select({ knowledge: [kRow()] }).length === 1);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
