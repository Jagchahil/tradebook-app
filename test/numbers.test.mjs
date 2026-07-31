// THE NUMBER SWEEP. Every figure a customer can read, over every shape we can put through it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS. It was found on a live screen, not in a test.
//
// On 28 July 2026 the deployed ledger told a customer his mileage was worth
// "55.00000000000001p a mile". The tax was right to the penny. The SENTENCE was wrong, on the one
// line whose job is to show a man our working, on the one screen whose job is to be believed.
//
// Rates are held as fractions and 0.55 * 100 is 55.00000000000001 in IEEE 754. Of every rate this
// product holds, exactly TWO trip it: 0.55 and 0.14. Every other one multiplies out clean. That is
// why nobody caught it by reading the code, and why several suites full of arithmetic assertions
// walked straight past it: they all checked the NUMBER, and the number was right. Nobody checked
// the STRING.
//
// So this suite does not test maths. It renders every customer facing sentence we produce, across
// a wide matrix of inputs, and asserts that none of them ever contains something no human would
// write. It is cheap, it is boring, and it is the only kind of test that would have caught this.
//
// ⚠️ IF YOU ADD A FUNCTION THAT PRODUCES A SENTENCE WITH A NUMBER IN IT, ADD IT HERE.
//
// Run: node test/numbers.test.mjs   Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'numbers-'));

// Stage the whole of lib/ so any module resolves, and rewrite every relative import to .ts, the
// same trick test/agent.test.mjs uses.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (name) => import(pathToFileURL(path.join(stage, name + '.ts')).href);

const L = await load('ledger');
const W = await load('weeklyupdate');
const E = await load('elections');
const I = await load('waintents');
const T = await load('taxengine');
const O = await load('taxoptimiser');

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RULES. Anything a man reads must never contain one of these.
//
// Each is a thing that only ever appears when something has gone wrong upstream, and each one, on
// a screen about a man's tax, reads as a machine that does not know what it is doing.
const FORBIDDEN = [
  // Six or more decimal places. Nothing about tax is quoted to a millionth, so this is always a
  // floating point tail and never a real figure. THIS IS THE ONE THAT SHIPPED.
  { name: 'a floating point tail', re: /\d\.\d{6,}/ },
  // A number that failed to be a number, printed anyway.
  { name: 'NaN', re: /\bNaN\b/ },
  { name: 'Infinity', re: /\bInfinity\b/ },
  { name: 'undefined', re: /\bundefined\b/ },
  { name: 'null', re: /\bnull\b/ },
  { name: 'an object printed as a string', re: /\[object [A-Za-z]+\]/ },
  // Negative zero. Arithmetically fine, and "-£0" on a tax screen is not a thing a person writes.
  { name: 'negative zero', re: /-0(?!\d)/ },
  // Money with the sign in the wrong place. "£-140" is a spreadsheet, not a sentence.
  { name: 'a minus inside the money', re: /£-/ },
  // NOTE: an earlier draft of this list also banned "a digit followed by a full stop", meaning to
  // catch a stray decimal. It fired on every ordinary sentence ending in a figure ("for the first
  // 10,000.") and produced 4,488 false positives on the first run. A rule that cries wolf on
  // correct output is worse than no rule, because the next person turns the whole suite off.
];

const offenders = [];
function clean(label, text) {
  if (typeof text !== 'string') return;
  for (const f of FORBIDDEN) {
    if (f.re.test(text)) offenders.push(`${label}: ${f.name} in "${text.slice(0, 160)}"`);
  }
}

// A deliberately awkward matrix. Zeroes, tiny amounts, huge amounts, exact band boundaries,
// negatives where a caller could pass one, and thirds that do not divide cleanly.
const AMOUNTS = [0, 1, 7, 33.33, 100, 999.99, 1_000, 12_570, 12_571, 50_270, 50_271, 100_000, 125_140, 1_000_000, 3_333_333.33];
const MONTHS = [0, 1, 2, 3, 4, 6, 9, 11, 12];

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE RATES THEMSELVES, THROUGH THE ONE FORMATTER');

ok('asPence exists and is exported from the file that holds the rates', typeof T.asPence === 'function');
ok('asPercent exists too', typeof T.asPercent === 'function');
ok('🔴 THE RATE THAT SHIPPED WRONG: 0.55 renders as 55', T.asPence(0.55) === '55');
ok('🔴 AND THE OTHER ONE: 0.14 renders as 14', T.asPercent(0.14) === '14');
ok('a real fraction of a penny survives, 0.455 is 45.5', T.asPence(0.455) === '45.5');
ok('a whole percent stays whole, 0.2 is 20', T.asPercent(0.2) === '20');
ok('nine percent is 9, not 9.000000000000002', T.asPercent(0.09) === '9');
ok('zero is zero', T.asPence(0) === '0');
ok('a non number does not print NaN', T.asPence(Number.NaN) === '0');
ok('infinity does not print Infinity', T.asPence(Number.POSITIVE_INFINITY) === '0');

// EVERY rate we hold, not just the two we know about. If a Khoji approved change ever introduces a
// third awkward one, this fails on the day it lands rather than on a customer's screen.
{
  const bad = [];
  const sweep = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v !== 'number' || v <= 0 || v >= 1) continue;
      const raw = String(v * 100);
      if (/\d\.\d{6,}/.test(raw)) {
        // It IS an awkward one. The formatter must tame it.
        if (/\d\.\d{6,}/.test(T.asPercent(v))) bad.push(`${prefix}.${k} = ${v} still renders as ${T.asPercent(v)}`);
      }
    }
  };
  sweep(T.FACTS, 'FACTS');
  if (T.LTD) sweep(T.LTD, 'LTD');
  if (bad.length) bad.forEach((b) => console.log(`        ${b}`));
  ok('🔴 EVERY FRACTIONAL RATE WE HOLD SURVIVES THE FORMATTER', bad.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. THE LEDGER, THE SCREEN THIS BUG SHIPPED ON');

{
  let rendered = 0;
  for (const gross of AMOUNTS) {
    for (const months of MONTHS) {
      for (const mileage of [0, 172, 3_300]) {
        for (const homeOffice of [0, 26, 312]) {
          const l = L.ledger({
            monthsElapsed: months,
            grossIncome: gross,
            expenses: Math.max(0, gross / 3),
            mileage,
            homeOffice,
            capitalAllowances: gross > 1000 ? 1_500 : 0,
            pension: gross > 1000 ? 2_400 : 0,
            cisSuffered: gross / 5,
          });
          clean('ledger.headline', L.headline(l));
          clean('ledger.note', l.note ?? '');
          for (const line of l.lines) {
            clean(`ledger.line.${line.key}.label`, line.label);
            clean(`ledger.line.${line.key}.basis`, line.basis);
          }
          rendered += 1;
        }
      }
    }
  }
  ok(`rendered ${rendered} whole ledgers, every line of every one`, rendered > 1000);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. THE WEEKLY SUMMARY, WHICH WHATSAPP SENDS WORD FOR WORD');

{
  let rendered = 0;
  const DATES = ['2026-04-06', '2026-07-28', '2026-11-07', '2027-01-31', '2026-12-31'];
  for (const iso of DATES) {
    for (const income of AMOUNTS) {
      for (const expenses of [0, 33.33, income, income * 2]) {
        for (const turnover of [null, 0, 89_999, 90_000, 90_001, 1_000_000]) {
          for (const vat of [true, false]) {
            const input = {
              now: new Date(`${iso}T12:00:00Z`),
              income,
              expenses,
              rolling12mTaxableTurnover: turnover,
              vatRegistered: vat,
              ytdGrossQualifyingIncome: turnover,
            };
            clean('weekly.text', W.weeklySummaryText(input));
            clean('weekly.line', W.weeklyLine(input));
            const personal = W.personalLine(input);
            if (personal) clean('weekly.personalLine', personal);
            clean('weekly.gbp', W.gbp(income - expenses));
            rendered += 1;
          }
        }
      }
    }
  }
  ok(`rendered ${rendered} weekly summaries across five points in the tax year`, rendered > 1000);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE USE OF HOME ELECTION, WHICH QUOTES A MONTHLY RATE');

{
  let rendered = 0;
  for (const band of E.HOURS_BANDS) {
    for (const months of MONTHS) {
      clean('elections.confirmation', E.electionConfirmation(band, months));
      clean('elections.bandLabel', E.bandLabel(band));
      rendered += 1;
    }
  }
  for (const o of E.bandOptions()) clean('elections.option', `${o.label} ${o.monthly}`);
  ok(`rendered ${rendered} election confirmations, every band at every month`, rendered === E.HOURS_BANDS.length * MONTHS.length);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. THE WHATSAPP ANSWERS, WHICH ARE THE MOST READ COPY WE HAVE');

{
  let rendered = 0;
  for (const n of AMOUNTS) {
    clean('waintents.formatGbp', I.formatGbp(n));
    clean('waintents.formatGbp.negative', I.formatGbp(-n));
    rendered += 2;
  }
  for (const profit of AMOUNTS) {
    for (const salary of [0, 12_570, 50_270]) {
      clean('waintents.niAnswer', I.niAnswer({
        profit, salary,
        class1: salary / 10, class4: profit / 20, class2Annual: 179.4,
        qualifies: profit > 6_845, voluntarySuggested: profit < 6_845,
      }));
      clean('waintents.studentLoanAnswer', I.studentLoanAnswer({
        hasPlan: true, planLabel: 'Plan 2', annual: profit / 11,
        threshold: 28_470, income: profit + salary,
      }));
      rendered += 2;
    }
  }
  clean('waintents.deadlineAnswer', I.deadlineAnswer(new Date('2026-07-28T12:00:00Z')));
  ok(`rendered ${rendered} WhatsApp answers`, rendered > 60);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. THE OPTIMISER, WHICH TELLS HIM WHAT HE COULD STILL SAVE');

{
  let rendered = 0;
  for (const gross of AMOUNTS) {
    for (const months of MONTHS) {
      let out;
      try {
        out = O.findOptimisations({
          startYear: 2026,
          monthsElapsed: months,
          ytdTradeIncome: gross,
          ytdTradeExpenses: gross / 3,
          ytdCisSuffered: gross / 5,
          employmentIncome: 0,
          categoriesLogged: ['materials', 'travel'],
          homeOfficeClaimed: false,
          mileageClaimed: false,
        });
      } catch { continue; }
      for (const s of out ?? []) {
        for (const [k, v] of Object.entries(s)) {
          if (typeof v === 'string') clean(`optimiser.${k}`, v);
        }
      }
      rendered += 1;
    }
  }
  ok(`ran the optimiser ${rendered} times and read every suggestion`, rendered > 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. THE ONE MONEY FORMATTER');

{
  const M = await load('money');
  ok('a positive is plain', M.gbp0(1204) === '£1,204');
  ok('🔴 A NEGATIVE PUTS THE SIGN OUTSIDE THE POUND, as a person writes it', M.gbp0(-33) === '-£33');
  ok('...and never inside it', !M.gbp0(-33).includes('£-'));
  ok('to the penny keeps its pence', M.gbp2(1204.5) === '£1,204.50');
  ok('a negative to the penny signs outside too', M.gbp2(-1204.5) === '-£1,204.50');
  ok('a non number is zero, never NaN', M.gbp0(Number.NaN) === '£0');
  ok('infinity is zero too', M.gbp2(Number.POSITIVE_INFINITY) === '£0.00');
  ok('negative zero does not print a sign', M.gbp0(-0.4) === '£0');
  ok('the magnitude helpers never carry a sign', M.gbpAbs0(-99) === '£99' && M.gbpAbs2(-99) === '£99.00');
  for (const n of [...AMOUNTS, ...AMOUNTS.map((a) => -a)]) {
    clean('money.gbp0', M.gbp0(n));
    clean('money.gbp2', M.gbp2(n));
    clean('money.gbpAbs0', M.gbpAbs0(n));
    clean('money.gbpAbs2', M.gbpAbs2(n));
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7b. THE COST DESK PENCE FORMATTER (team facing, but the same rules apply)');

{
  const MC = await load('messagecost');
  let rendered = 0;
  for (const n of [
    ...AMOUNTS, ...AMOUNTS.map((a) => -a),
    2.2, 2.2 * 3, 2.2 * 104, 44.00000000000001, 0.52, 166 * 0.52,
    Number.NaN, Number.POSITIVE_INFINITY, -0,
  ]) {
    clean('messagecost.pencePretty', MC.pencePretty(n));
    rendered += 1;
  }
  ok(`rendered ${rendered} cost desk pence labels`, rendered > 30);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n8. THE VERDICT');

if (offenders.length) {
  const seen = new Set();
  for (const o of offenders) {
    const key = o.split(' in "')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`        ${o}`);
  }
  console.log(`        ...and ${offenders.length} occurrences in total`);
}
ok('🔴 NOT ONE CUSTOMER FACING SENTENCE CONTAINS A NUMBER NO HUMAN WOULD WRITE', offenders.length === 0);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
