// B79, B80 AND B81. VAT FROM A REGISTERED STEADY STATE INTO A MID YEAR TRANSITION. 20 August 2026.
//
//   node test/b81vattransition.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Three findings from one walk, and the thread joining them is that this product was written for a
// steady state and nothing in it had ever changed status mid life.
//
// 🔴 B80. THE EFFECTIVE DATE OF REGISTRATION WAS ONE MONTH EARLY, on four surfaces, from one
// constant, from 12 to 20 August 2026. HMRC VATREG25100 and GOV.UK both say the first day of the
// SECOND month after you go over; we said the first day of the month after. Nine files reference
// that constant and every one guards its plumbing. Section 1 guards its TRUTH, by deriving the
// date from the rule rather than quoting the new words.
//
// 🔴 B79. THE UNSENT LINE WAS FED THE GROSS. /app/tax/vat printed "£9,200 of work carrying £1,400
// of VAT" where the £9,200 already contained the £1,400. It survived because the only account with
// drafts had only REVERSE CHARGE drafts, where total equals net by construction. Section 2 runs the
// real getOutputVat over both treatments, because one specimen cannot tell them apart.
//
// 🔴 B81. THE QUARTER WINDOW IGNORED THE DAY HE REGISTERED. Walked: a £600 cost dated 15 July with
// £100 of VAT, on an account registered from 1 August, read "HMRC owes you so far £100". Section 3.
//
// ⚠️ EVERY IDENTIFIER IN SECTION 3 IS CAPTURED FROM THE SOURCE, NEVER TYPED. B74's rule: a guard
// that quotes an expression up to its punctuation is defending the punctuation, and it is green on
// the defect and red on the fix. Seven instances in three days before this one was written.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { BACKWARD_TEST, FORWARD_TEST } from '../lib/vatstanding.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// Section 2 calls the REAL getOutputVat with fetch stubbed, and lib/supabase.ts refuses to load
// without these. Same two lines as test/run4fixes.test.mjs, which drives the same function.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. B80. THE EFFECTIVE DATE, DERIVED FROM THE RULE RATHER THAN QUOTED ===\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// HMRC VAT Registration Manual VATREG25100, read live 20 August 2026: "the date of registration is
// the first day of the second month after his taxable supplies rose above the threshold", worked
// example exceeded 22 April, notification deadline 30 May, EDR 1 June.
//
// ⚠️ TWO SPECIMENS, NOT ONE, AND THE SECOND CROSSES A YEAR END. A test with one specimen cannot
// tell a minimum from a maximum, and a rule about "the second month after" that is only ever
// exercised inside one calendar year has never been asked the only question that is hard.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// The rule, written once, as arithmetic. Month is 1..12.
const edrAfterBreach = (year, month) => {
  const zero = (month - 1) + 2;
  return { year: year + Math.floor(zero / 12), month: (zero % 12) + 1 };
};

const april = edrAfterBreach(2026, 4);
const december = edrAfterBreach(2026, 12);

ok('the rule gives 1 June for an April breach, which is HMRC VATREG25100 own worked example',
  april.year === 2026 && april.month === 6);
ok('🔴 AND THE SECOND SPECIMEN CROSSES THE YEAR END: a December breach gives 1 February the year after',
  december.year === 2027 && december.month === 2);
ok('...and the two specimens are genuinely different, so this pair can tell a rule from a constant',
  !(april.year === december.year && april.month === december.month));

ok('🔴 BACKWARD_TEST NAMES THE SECOND MONTH, which is the word whose absence WAS the defect',
  /first day of the second month/.test(BACKWARD_TEST));
ok('🔴 AND IT NO LONGER CARRIES THE OLD CLAIM, so a revert is caught by name rather than re argued',
  !/first day of the month after that/.test(BACKWARD_TEST));

// The worked example inside the sentence is checked against the arithmetic above, so the prose and
// the rule cannot drift apart. Every part is CAPTURED from the sentence, never typed beside it.
const example = BACKWARD_TEST.match(/go over in (\w+), you register by (\d+) (\w+) and you are VAT registered from (\d+) (\w+)/);
ok('the sentence carries a worked example and all five parts were captured', !!example && example.length === 6);
if (example) {
  const breachMonth = MONTHS.indexOf(example[1]) + 1;
  const derived = edrAfterBreach(2026, breachMonth);
  ok('🔴 THE WORKED EXAMPLE AGREES WITH THE RULE ABOVE, derived, not read',
    MONTHS.indexOf(example[5]) + 1 === derived.month && Number(example[4]) === 1);
  // The notification deadline is 30 days from the END of the breach month, which for a 30 day
  // month is the same day number of the next month. April has 30 days, so 30 May.
  ok('...and the notification deadline in it is the month after the breach, not the second',
    MONTHS.indexOf(example[3]) === breachMonth);
  ok('...and the deadline is stated as 30 days, which was always right and is untouched',
    /30 days from the end of that month/.test(BACKWARD_TEST));
}

ok('the forward test is NOT touched: it still registers you the day you realised',
  /the day you realised it/.test(FORWARD_TEST) && /immediately/.test(FORWARD_TEST));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. B79. THE UNSENT LINE IS THE NET, RUN AGAINST BOTH TREATMENTS ===\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ TWO SPECIMENS AND THEY MUST BE OF DIFFERENT TREATMENTS. On a reverse charge invoice `total`
// EQUALS the net, because the customer's VAT is deliberately not in the total. So a fixture of
// reverse charge drafts alone reports the same figure whether the code takes the gross or the net,
// which is exactly how this survived: the only production account with drafts had only those.

const stage = mkdtempSync(path.join(tmpdir(), 'b81-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

{
  const rows = [
    { status: 'sent', tax: 400, total: 2400, reverse_charge_vat: 0 },
    // Reverse charge: total IS the net. The specimen that CANNOT tell gross from net.
    { status: 'draft', tax: 0, total: 5000, reverse_charge_vat: 1000 },
    // Ordinary charged: total is subtotal plus tax. The specimen that CAN.
    { status: 'draft', tax: 150, total: 900, reverse_charge_vat: 0 },
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(rows), { status: 200 });
  const outv = await SB.getOutputVat('11111111-2222-3333-4444-555555555555', '2026-07-01', '2026-08-20');
  globalThis.fetch = realFetch;

  const drafts = rows.filter((r) => r.status === 'draft');
  const grossOfDrafts = drafts.reduce((s, r) => s + r.total, 0);
  const netOfDrafts = drafts.reduce((s, r) => s + r.total - r.tax, 0);

  ok('the fixture holds one draft of each treatment, which is what makes this readable',
    drafts.length === 2 && drafts.some((r) => r.reverse_charge_vat > 0) && drafts.some((r) => r.tax > 0));
  ok('...and the gross and the net of it genuinely differ, so the assertion below is about something',
    grossOfDrafts !== netOfDrafts && grossOfDrafts - netOfDrafts === 150);
  ok('🔴 unsentNet IS THE NET, derived from the fixture rather than typed beside it',
    outv !== null && outv.unsentNet === netOfDrafts);
  ok('🔴 AND IT IS NOT THE GROSS, which is what it was until 20 August 2026',
    outv !== null && outv.unsentNet !== grossOfDrafts);
  ok('...the reverse charge draft still contributes its whole total, because there it IS the net',
    outv !== null && outv.unsentNet === 5000 + (900 - 150));
  ok('the VAT half is untouched and still counts the reverse charge, which he must account for',
    outv !== null && outv.unsentVat === 1150);
  ok('and the figure that IS a supply is unmoved: a draft is still not counted',
    outv !== null && outv.outputVat === 400 && outv.grossTurnover === 2400);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. B81. THE WINDOW CANNOT OPEN BEFORE THE DAY HE REGISTERED ===\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const vatPage = read('app/app/tax/vat/page.tsx');

// Every name below is CAPTURED. B74: a guard that types an identifier is a guard about that
// identifier, and a rename control walks straight through it.
const quarterLocal = (vatPage.match(/const (\w+) = quarterStartISO\(now\);/) ?? [])[1];
const regLocal = (vatPage.match(/const (\w+) = isRegistered && profile !== null \? profile\.registeredOn : null;/) ?? [])[1];
const clampLocal = (vatPage.match(/const (\w+) = \w+ !== null && \w+ > \w+ && \w+ <= to;/) ?? [])[1];
const fromLocal = (vatPage.match(/const (\w+) = \w+ && \w+ !== null \? \w+ : \w+;\n/) ?? [])[1];

ok('the four locals were CAPTURED from the page rather than typed into this test',
  !!quarterLocal && !!regLocal && !!clampLocal && !!fromLocal);
ok('...and the calendar quarter is no longer the thing the readers are handed',
  quarterLocal !== fromLocal);

const readerCalls = vatPage.match(/get(?:OutputVat|ConfirmedInputVat)\(user\.id, (\w+), to\)/g) ?? [];
ok('🔴 BOTH READERS ARE FOUND, and there are exactly two of them',
  readerCalls.length === 2);
ok('🔴 AND BOTH ARE HANDED THE CLAMPED WINDOW, not the calendar quarter. The costs half is the '
  + 'penalty direction and the invoices half is the flat rate direction, and one clamp closes both',
  readerCalls.every((c) => c.includes(`, ${fromLocal}, to)`)));

const clampAt = vatPage.indexOf(`const ${clampLocal} =`);
const firstReaderAt = vatPage.search(/get(?:OutputVat|ConfirmedInputVat)\(user\.id,/);
ok('...and the clamp is computed BEFORE either reader runs, which is what makes it apply at all',
  clampAt > 0 && firstReaderAt > 0 && clampAt < firstReaderAt);

// ISO date strings compare correctly as strings only if they are zero padded and same length. Two
// specimens, one of which crosses a year end, because that is the comparison the clamp rests on.
ok('the clamp rests on ISO string ordering and that ordering holds inside a year',
  '2026-08-01' > '2026-07-01' && !('2026-06-30' > '2026-07-01'));
ok('🔴 AND ACROSS A YEAR END, which a single specimen inside one year can never ask',
  '2027-01-01' > '2026-10-01' && !('2025-12-31' > '2026-01-01'));

ok('🔴 A NULL registeredOn DOES NOT CLAMP, deliberately: we do not know, and a made up date is '
  + 'worse than the calendar quarter',
  new RegExp(`${regLocal} !== null`).test(vatPage));

ok('🔴 THE WINDOW SENTENCE TELLS HIM WHICH WINDOW HE IS LOOKING AT, because a figure that silently '
  + 'covers 31 fewer days is the same defect wearing a smaller number',
  vatPage.includes('the day you registered') && vatPage.includes('The calendar'));
// 🔴 AND IT IS DRAWN OFF THE CLAMP FLAG ITSELF, WHICH THE LINE ABOVE DOES NOT CHECK.
//
// This assertion exists because test/sabotage-b81vattransition.mjs found a HOLE in the line above
// on its first run, twenty minutes after both were written. Replacing the conditional with
// `{false ? (` leaves every word of the sentence in the file and makes it unreachable, and a
// presence check cannot tell those apart. A man then gets a window narrowed by 31 days with
// nothing on the screen saying so, which is the original defect wearing a smaller number.
//
// ⚠️ THE FLAG NAME IS CAPTURED, NOT TYPED, so the rename control still walks through it.
ok('🔴 ...AND IT IS REACHABLE: the sentence is drawn off the captured clamp flag rather than off a '
  + 'constant, which is the difference between a sentence that exists and a sentence he reads',
  new RegExp(`\\{${clampLocal} \\? \\(`).test(vatPage));
ok('...and it names where the money that fell outside it went, rather than dropping it',
  /could reclaim from before you registered/.test(vatPage));
ok('...and the unclamped sentence is unchanged for everybody else',
  /That is the calendar quarter\. HMRC/.test(vatPage));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
