// Tests for lib/weeklyupdate.ts, THE PERSONAL LINE in the Sunday evening WhatsApp update.
//
// What this suite defends:
//
//   1. EVERY BRANCH FIRES ONLY WHEN ITS FACT IS TRUE. A VAT line for a man at 40% of the
//      threshold, or a deadline that is not his, is worse than silence: he learns the update is
//      guesswork and stops reading it, and then he misses the week it mattered.
//   2. THE QUIET WEEK IS HONEST. When nothing verified applies, QUIET_LINE goes out. Never blank,
//      never a pitch.
//   3. NOTHING SPECIAL CATEGORY CAN EVER REACH THE LINE. This text goes over WhatsApp, where the
//      question alone is a disclosure. The module does not import lib/circumstances.ts, takes no
//      circumstance in its input, and no sensitive() key or wording appears in its source or in
//      any line it produces. Enforced structurally, so a future branch cannot quietly open a door.
//   4. NO INVENTED DATES. The only quarterly update deadline printed is the one this codebase
//      actually holds as a constant. Quarters 2, 3 and 4 print no deadline at all.
//   5. HOUSE STYLE. No em dash, no en dash, no hyphen used as a sentence dash, in any output.
//
// weeklyupdate.ts imports taxengine and quarterpack with extensionless specifiers (the Next
// convention), which Node's type stripping cannot resolve, so we stage the files to a temp dir and
// rewrite the relative imports, the same approach as test/quarterpack.test.mjs.
//
// Run: node test/weeklyupdate.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'weekly-'));

const SRC = readFileSync(path.join(lib, 'weeklyupdate.ts'), 'utf8');
const fix = (s) =>
  s.replace("from './taxengine'", "from './taxengine.ts'").replace("from './quarterpack'", "from './quarterpack.ts'");

writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'quarterpack.ts'), fix(readFileSync(path.join(lib, 'quarterpack.ts'), 'utf8')));
writeFileSync(path.join(stage, 'circumstances.ts'), readFileSync(path.join(lib, 'circumstances.ts'), 'utf8'));
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
writeFileSync(path.join(stage, 'weeklyupdate.ts'), fix(SRC));

const W = await import(pathToFileURL(path.join(stage, 'weeklyupdate.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const C = await import(pathToFileURL(path.join(stage, 'circumstances.ts')).href);
const H = await import(pathToFileURL(path.join(stage, 'housestyle.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// A Sunday with nothing else going on: the 2026/27 Q2 end (5 October) is 29 days away and the one
// deadline we hold (7 August 2026) is behind us. Any line produced on this date came from VAT.
const QUIET_SUNDAY = new Date('2026-09-06T18:00:00Z');
// Twelve days before the first MTD quarterly update deadline.
const BEFORE_DEADLINE = new Date('2026-07-26T18:00:00Z');
// Eight days before the 2026/27 Q2 end (5 October 2026).
const QUARTER_CLOSING = new Date('2026-09-27T18:00:00Z');

const base = {
  now: QUIET_SUNDAY,
  rolling12mTaxableTurnover: null,
  vatRegistered: false,
  ytdGrossQualifyingIncome: null,
};
const line = (over) => W.personalLine({ ...base, ...over });

// Everything this suite ever produces, collected for the blanket checks at the end.
const produced = [];
const say = (over) => { const s = line(over); if (s) produced.push(s); return s; };

console.log('\n=== gbp: whole pounds, en-GB grouping (matches lib/agent.ts) ===\n');
ok('formats thousands with a comma', W.gbp(90000) === '£90,000');
ok('rounds to whole pounds', W.gbp(92400.49) === '£92,400');
ok('rounds up at the half', W.gbp(1234.5) === '£1,235');
ok('zero is £0', W.gbp(0) === '£0');
ok('a garbage number is £0, never NaN', W.gbp(Number.NaN) === '£0');

console.log('\n=== branch 1: over the VAT registration threshold ===\n');
{
  const s = say({ rolling12mTaxableTurnover: 92400 });
  ok('fires when rolling 12 month turnover is over the threshold', typeof s === 'string');
  ok('states his own turnover', s.includes('£92,400'));
  ok('states the threshold from FACTS, not a literal', s.includes(W.gbp(E.FACTS.vatRegistrationThreshold)));
  ok('is information, not advice (never tells him to register)', !/\byou (should|must|need to)\b/i.test(s));
}
ok('exactly AT the threshold is not over it (taxengine decides, not us)',
  !/above the/.test(String(line({ rolling12mTaxableTurnover: E.FACTS.vatRegistrationThreshold }))));

console.log('\n=== branch 3: approaching the VAT registration threshold ===\n');
{
  const s = say({ rolling12mTaxableTurnover: 76500 });
  ok('fires at 85% of the threshold', typeof s === 'string' && s.includes('85%'));
  ok('states his own turnover', s.includes('£76,500'));
  ok('does not claim he is over it', !s.includes('above the'));
}
ok('fires exactly at 80%', /80%/.test(String(line({ rolling12mTaxableTurnover: 72000 }))));
ok('silent below 80% (79% is not news, it is noise)', line({ rolling12mTaxableTurnover: 71000 }) === null);

console.log('\n=== the VAT branch stays shut when it should ===\n');
ok('silent for a man who is already VAT registered',
  line({ rolling12mTaxableTurnover: 92400, vatRegistered: true }) === null);
ok('silent when turnover is unknown (a new user, under 12 months of history)',
  line({ rolling12mTaxableTurnover: null }) === null);
ok('silent on a NaN turnover rather than printing £0', line({ rolling12mTaxableTurnover: Number.NaN }) === null);
ok('silent on a negative turnover', line({ rolling12mTaxableTurnover: -5000 }) === null);

console.log('\n=== branch 2: the FIRST MTD quarterly update deadline (the only one we hold) ===\n');
{
  const s = say({ now: BEFORE_DEADLINE, ytdGrossQualifyingIncome: 60000 });
  ok('fires in the run up, for a mandated user', typeof s === 'string');
  ok('prints the date held in lib/taxengine.ts, not an invented one',
    s.includes('7 August 2026') && E.concept('mtd_first_quarter_deadline') === '2026-08-07');
  ok('names the period the update covers', s.includes('6 April 2026 to 5 July 2026'));
  ok('never says we file it for him', !/\bwe (will )?(file|submit)\b/i.test(s));
}
ok('silent for income under the MTD threshold (a deadline that is not his is just anxiety)',
  line({ now: BEFORE_DEADLINE, ytdGrossQualifyingIncome: E.FACTS.mtdThreshold2026 }) === null);
ok('silent when qualifying income is unknown',
  line({ now: BEFORE_DEADLINE, ytdGrossQualifyingIncome: null }) === null);
ok('silent well outside the window (54 days out, and no quarter closing either)',
  line({ now: new Date('2026-06-14T18:00:00Z'), ytdGrossQualifyingIncome: 60000 }) === null);
ok('silent once the deadline has passed',
  line({ now: QUIET_SUNDAY, ytdGrossQualifyingIncome: 60000 }) === null);

console.log('\n=== no invented deadlines for quarters 2, 3 and 4 ===\n');
for (const [label, when] of [
  ['before the Q2 end', new Date('2026-09-27T18:00:00Z')],
  ['before the Q3 end', new Date('2026-12-28T18:00:00Z')],
  ['before the Q4 end', new Date('2027-03-28T18:00:00Z')],
]) {
  const s = String(line({ now: when, ytdGrossQualifyingIncome: 60000 }));
  ok(`${label}: says when the quarter ENDS and never when an update is DUE`, !/\bdue by\b/.test(s));
}
// Comments may discuss dates. CODE may not contain one: every date the man reads has to have come
// from lib/taxengine.ts or lib/quarterpack.ts, never from a literal typed in this file.
const CODE = SRC.replace(/^\s*\/\/.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
ok('no ISO date literal is hardcoded in the module code',
  !/['"`]\s*\d{4}-\d{2}-\d{2}/.test(CODE));
ok('no written out date is hardcoded in the module code',
  !/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(CODE));
ok('no threshold or rate literal is hardcoded in the module code (FACTS owns them)',
  !/\b(90000|90,000|50000|50,000|30000|20000)\b/.test(CODE));

console.log('\n=== branch 4: the current quarter is about to close ===\n');
{
  const s = say({ now: QUARTER_CLOSING, ytdGrossQualifyingIncome: 60000 });
  ok('fires 8 days before the quarter end', typeof s === 'string' && s.includes('8 days'));
  ok('names the quarter period from lib/quarterpack.ts', s.includes('6 July 2026 to 5 October 2026'));
}
ok('fires on the quarter end day itself',
  /ends today/.test(String(line({ now: new Date('2026-10-05T18:00:00Z'), ytdGrossQualifyingIncome: 60000 }))));
ok('singular day, one day out',
  /ends in 1 day\b/.test(String(line({ now: new Date('2026-10-04T18:00:00Z'), ytdGrossQualifyingIncome: 60000 }))));
ok('silent 15 days out (a line every week is a line he stops reading)',
  line({ now: new Date('2026-09-20T18:00:00Z'), ytdGrossQualifyingIncome: 60000 }) === null);
ok('needs no income figure at all (the quarter end is his either way)',
  typeof line({ now: QUARTER_CLOSING }) === 'string');

console.log('\n=== one line only, most useful first ===\n');
{
  const s = say({ now: BEFORE_DEADLINE, rolling12mTaxableTurnover: 92400, ytdGrossQualifyingIncome: 60000 });
  ok('crossing the VAT threshold beats a deadline three weeks out', s.includes('VAT'));
  ok('and it really is ONE sentence', (s.match(/\./g) ?? []).length === 1);
}
ok('a deadline beats a quarter end that is further away',
  /due by/.test(String(line({ now: BEFORE_DEADLINE, rolling12mTaxableTurnover: 40000, ytdGrossQualifyingIncome: 60000 }))));

console.log('\n=== the quiet week: honest, never blank, never a pitch ===\n');
ok('personalLine returns null when nothing verified applies', line({}) === null);
ok('weeklyLine falls back to QUIET_LINE', W.weeklyLine({ ...base }) === W.QUIET_LINE);
ok('weeklyLine passes a real line straight through',
  W.weeklyLine({ ...base, rolling12mTaxableTurnover: 92400 }).includes('VAT'));
ok('QUIET_LINE is not empty', typeof W.QUIET_LINE === 'string' && W.QUIET_LINE.length > 0);
ok('QUIET_LINE sells nothing',
  !/\b(upgrade|subscribe|premium|try |offer|free trial|invite|refer)\b/i.test(W.QUIET_LINE));
ok('a broken clock produces nothing rather than nonsense', W.personalLine({ ...base, now: new Date('nope') }) === null);
ok('a missing input object shape still returns the quiet line',
  W.weeklyLine({ now: QUIET_SUNDAY, rolling12mTaxableTurnover: null, vatRegistered: false, ytdGrossQualifyingIncome: null }) === W.QUIET_LINE);

console.log('\n=== 🔴 nothing special category can reach a WhatsApp message ===\n');
const sensitive = C.sensitive();
ok('there IS at least one special category circumstance to defend against', sensitive.length > 0);
ok('the module never imports lib/circumstances.ts', !/from '\.\/circumstances'/.test(SRC));
ok('the input shape carries no circumstances field', !/^\s*circumstances\??\s*:/m.test(SRC));
ok('the input shape carries no answers field', !/^\s*answers\??\s*:/m.test(SRC));
for (const c of sensitive) {
  ok(`no reference to the '${c.key}' circumstance key in the module`,
    !new RegExp(`\\b${c.key}\\b`, 'i').test(SRC));
  ok(`the '${c.key}' question wording never appears in the module`, !SRC.includes(c.ask));
  ok(`the '${c.key}' reason wording never appears in the module`, !SRC.includes(c.why));
}
ok('every line this suite produced is free of any special category wording',
  produced.every((s) => sensitive.every((c) => !new RegExp(`\\b${c.key}\\b`, 'i').test(s) && !s.includes(c.ask))));
ok('unanswered() still refuses to queue a special category question (the rule we depend on)',
  C.unanswered([]).every((c) => !c.specialCategory));

console.log('\n=== house style: no forbidden dashes anywhere we speak ===\n');
ok('QUIET_LINE is clean', H.hasForbiddenDash(W.QUIET_LINE) === false);
ok(`every produced line is clean (${produced.length} checked)`, produced.every((s) => !H.hasForbiddenDash(s)));
// CLAUDE.md: the rule applies to UI, WhatsApp messages, docs AND comments. Only the em, en and
// minus characters are checked against source: hasForbiddenDash() also flags "a - b", which is
// subtraction in TypeScript and prose only in a sentence, so running it over code is a false alarm.
ok('the module source contains no em dash, en dash or minus sign, comments included',
  !/[–—−]/.test(SRC));


// ═══════════════════════════════════════════════════════════════════════════════════════════
// weeklySummaryText: THE WHOLE SUMMARY, now that it is pulled rather than pushed (27 July 2026).
//
// The same function renders in the app, on the web, and in the WhatsApp reply when he asks. Three
// renderers over one set of figures is three chances to disagree, and the one that disagrees is the
// one he believes, so what is asserted here is asserted for every surface at once.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the whole summary (pull) ===\n');

const sum = (over) => W.weeklySummaryText({ ...base, income: 0, expenses: 0, ...over });

ok('the figures are printed in whole pounds', sum({ income: 1200, expenses: 340 }).startsWith('Your week: £1,200 in, £340 out.'));
ok('a profitable week says what it leaves', sum({ income: 1200, expenses: 340 }).includes('That leaves £860.'));
ok('a losing week is not dressed up as profit', sum({ income: 100, expenses: 400 }).includes('£300 more out than in.'));
ok('a losing week never prints a minus sign', !/[-−]\d/.test(sum({ income: 100, expenses: 400 })));
ok('an empty week says nothing was logged, not zero profit', sum().startsWith('Your week: nothing logged.'));
ok('an empty week prints no profit line', !sum().includes('That leaves'));
ok('a week with only costs still reports them', sum({ expenses: 55 }).includes('£0 in, £55 out'));

// The personal line is the same sentence the push used, so moving channel changed no reasoning.
ok('a quiet week carries the honest quiet line', sum({ income: 10, expenses: 1 }).includes(W.QUIET_LINE));
ok('the VAT line reaches the summary', sum({ income: 10, expenses: 1, rolling12mTaxableTurnover: E.FACTS.vatRegistrationThreshold + 1 }).includes('VAT registration threshold'));
ok('the summary is exactly three lines when there are figures', sum({ income: 5, expenses: 2 }).split('\n').length === 3);
ok('the summary is two lines on an empty week', sum().split('\n').length === 2);

ok('weeklyFigures agrees with the text', (() => {
  const f = W.weeklyFigures({ ...base, income: 900, expenses: 250 });
  return f.income === 900 && f.expenses === 250 && f.profit === 650;
})());
ok('weeklyFigures treats a non finite figure as zero rather than NaN', (() => {
  const f = W.weeklyFigures({ ...base, income: Number.NaN, expenses: 10 });
  return f.income === 0 && f.profit === -10;
})());

ok('the same input always gives the same words', sum({ income: 77, expenses: 3 }) === sum({ income: 77, expenses: 3 }));
ok('no forbidden dash anywhere in the summary', !H.hasForbiddenDash([
  sum(), sum({ income: 1200, expenses: 340 }), sum({ income: 1, expenses: 900 }),
  sum({ income: 10, expenses: 1, rolling12mTaxableTurnover: E.FACTS.vatRegistrationThreshold + 1 }),
].join('\n')));

// It still cannot carry anything personal beyond his own money, because the input shape has no
// field for one. Same structural guarantee as the line it wraps.
ok('the summary input still carries no circumstance', !/circumstance|answers|specialCategory/i.test(SRC.replace(/^\s*\/\/.*$/gm, '')));
console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
