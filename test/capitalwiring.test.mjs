// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A CAR THROUGH THE WHOLE MACHINE. test/capital.test.mjs already proves lib/capital.ts works out
// the right relief; this suite proves the relief REACHES HIS MONEY, which is the part that was
// broken and the part a pure unit test cannot see.
//
// WHAT WENT WRONG, in his own figures. A real 78 row Monzo export, 2 August 2026: AUDI LEEDS,
// £60,000, one line. It went through the pile like a bag of screws, was filed under a category,
// and the whole £60,000 came off his profit in the year he bought it. A £22,800 profit was
// reported as a £37,224 LOSS, his set aside went to zero, and the Overview told him we had saved
// him £5,463 when the honest figure was about £2,809.
//
// 🔴 EVERY TEST HERE RUNS AGAINST A CONTROL. The same input, once with the new field and once
// without, and the assertion is on the DIFFERENCE. A test that only checks the new path passes
// just as happily when the new path is the only path, which is how a wiring change gets shipped
// wired to nothing. It also means every assertion doubles as proof that a customer with no
// vehicle is unchanged to the penny.
//
// 🔴 AND THE PROJECTION TRAP HAS ITS OWN SECTION. A capital allowance is an ANNUAL figure, like
// the trading allowance. Every other number in taxPosition() is a year to date amount multiplied
// by 12/months. Put the allowance on the wrong side of that multiplication and a man three months
// into the year gets FOUR TIMES the relief the law allows. lib/taxoptimiser.ts already carries
// that warning for the trading allowance; this is the test that makes it true rather than hopeful.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stageLib } from './stagelib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");

const stage = stageLib('capwire-');
const C = await import(pathToFileURL(path.join(stage, 'capital.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const L = await import(pathToFileURL(path.join(stage, 'ledger.ts')).href);
const RP = await import(pathToFileURL(path.join(stage, 'reviewpile.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. WHEN THE QUESTION GETS ASKED, AND WHEN IT STAYS OUT OF HIS WAY.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. Which rows the pile asks about');
{
  ok('🔴 a £60,000 single payment is asked about', C.shouldAskCapital(60000, 1));
  ok('so is a £1,500 banger, which is a real car and a real over claim', C.shouldAskCapital(1500, 1));
  ok('the threshold itself is included, not excluded', C.shouldAskCapital(C.CAPITAL_QUESTION_FROM, 1));
  ok('a pound under it is not', !C.shouldAskCapital(C.CAPITAL_QUESTION_FROM - 1, 1));
  ok('⚠️ FOURTEEN PAYMENTS ADDING TO £4,000 IS A TRADE ACCOUNT, NOT A CAR. Never asked.',
    !C.shouldAskCapital(4000, 14));
  ok('and two payments are not a car either, however big', !C.shouldAskCapital(60000, 2));
  ok('the sign does not matter: a statement export gives money out as a negative',
    C.shouldAskCapital(-60000, 1) === C.shouldAskCapital(60000, 1));
  ok('a NaN amount is never asked about rather than throwing', !C.shouldAskCapital(NaN, 1));

  // The migration's read-only survey selects the same population the code asks about. Two numbers
  // in two artefacts that must agree, and nothing else can check that they do.
  const sql = read('supabase/APPLY_2026-08-02_capital_kind.sql');
  const m = sql.match(/where amount <= -(\d+)/);
  ok('🔴 the migration surveys the SAME threshold the code asks at',
    Boolean(m) && Number(m[1]) === C.CAPITAL_QUESTION_FROM);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. IT NEVER GETS SWEPT UP IN THE ONE TAP CONFIRM.
//
// canBulkConfirm's own comment: "It fails towards asking. Always." A car is the case that proved
// it. Recognising the merchant does not settle whether the thing was a car, because a man can buy
// a car from anybody, and one tap over a screenful is the fastest way to file £60,000 wrongly.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The fast path lets a vehicle-sized payment through to be asked about');
{
  const settles = RP.MERCHANT_SETTLES[0];
  const group = (total, count) => ({
    key: 'somemerchant', vendor: 'SOME MERCHANT', kind: 'ask', count, total,
    suggested: settles, ids: Array.from({ length: count }, (_, i) => `id-${i}`),
  });

  ok('CONTROL: an ordinary payment to a merchant we know still goes down the fast path',
    RP.canBulkConfirm(group(48, 1)) === true);
  ok('🔴 the SAME merchant at £60,000 does not', RP.canBulkConfirm(group(60000, 1)) === false);
  ok('nor at the threshold', RP.canBulkConfirm(group(C.CAPITAL_QUESTION_FROM, 1)) === false);
  ok('⚠️ but a run of small payments adding past it still does, because that is not a car',
    RP.canBulkConfirm(group(4000, 14)) === true);
  ok('and it is a detour, not a refusal: the group is still a normal ask group',
    RP.partitionPile([group(60000, 1)]).unknown.length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE MONEY. JAG'S OWN FIGURES, BEFORE AND AFTER.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n3. The £60,000 Audi, in his own numbers");

// £82,800 in, £60,000 of ordinary costs. That is a £22,800 profit before the car.
const BASE = {
  startYear: 2026,
  monthsElapsed: 12, daysElapsed: 365,
  ytdTradeIncome: 82800,
  ytdTradeExpenses: 60000,
  ytdCisSuffered: 0,
  employmentIncome: 0,
  categoriesLogged: ['materials'],
  homeOfficeClaimed: false,
  mileageClaimed: false,
};

{
  // WHAT USED TO HAPPEN: the car landed inside ytdTradeExpenses like any other cost.
  const broken = O.taxPosition({ ...BASE, ytdTradeExpenses: 60000 + 60000 });
  ok('🔴 THE DEFECT, REPRODUCED: a £60,000 car inside expenses wipes his set aside out',
    broken.setAside === 0);

  // WHAT HAPPENS NOW: the cost is out, and the year one writing down allowance is in its place.
  const relief = C.capitalRelief(60000, 'car_other', 100);
  const fixed = O.taxPosition({ ...BASE, ytdCapitalAllowances: relief.thisYear });

  ok('the year one allowance on an ordinary car is about £3,600, not £60,000',
    near(relief.thisYear, 3600, 1));
  ok('🔴 SO HE HAS A SET ASIDE AGAIN, because he made a profit and he did', fixed.setAside > 0);

  // The exact property, with no need to know what is inside taxPosition: a £3,600 allowance has to
  // move his tax by exactly as much as £3,600 less income does. Nothing else can be true of a
  // deduction. CONTROL first, so a run where neither field does anything cannot pass this.
  const control = O.taxPosition({ ...BASE });
  const byAllowance = O.taxPosition({ ...BASE, ytdCapitalAllowances: 3600 });
  const byIncome = O.taxPosition({ ...BASE, ytdTradeIncome: BASE.ytdTradeIncome - 3600 });

  ok('CONTROL: with no allowance the field changes nothing at all',
    O.taxPosition({ ...BASE, ytdCapitalAllowances: 0 }).setAside === control.setAside);
  ok('the allowance reduces what he sets aside', byAllowance.setAside < control.setAside);
  ok('🔴 and by EXACTLY what £3,600 less profit would have', near(byAllowance.setAside, byIncome.setAside));
  ok('a negative or nonsense allowance is ignored rather than adding tax',
    O.taxPosition({ ...BASE, ytdCapitalAllowances: -5000 }).setAside === control.setAside
    && O.taxPosition({ ...BASE, ytdCapitalAllowances: NaN }).setAside === control.setAside);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. 🔴 THE PROJECTION TRAP. The one that would have shipped quietly.
//
// At three months the factor is 4. An allowance of £3,600 must still be £3,600. If it is applied
// before the multiplication it becomes £14,400, and a man is handed four times the relief the law
// allows on the strength of a number the app printed in its largest type.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. The allowance is annual, and the projection must not multiply it');
{
  const THREE = { ...BASE, monthsElapsed: 3, daysElapsed: 92, ytdTradeIncome: 20700, ytdTradeExpenses: 15000 };
  // ⚠️ ASK THE ENGINE FOR THE FACTOR, DO NOT KEEP A SECOND COPY OF IT. This read `12 / 3`, which
  // was the engine's own rule written out a second time, so when the projection moved to days on
  // 2 August this test failed for being right about the OLD engine. A test that hardcodes the
  // rule it is checking cannot catch the rule changing under it.
  const factor = O.projectionFactor(THREE).factor;

  const allowance = O.taxPosition({ ...THREE, ytdCapitalAllowances: 3600 });
  // £3,600 off the ANNUAL figure is £900 off the year-to-date figure once it is projected.
  const equivalent = O.taxPosition({ ...THREE, ytdTradeIncome: THREE.ytdTradeIncome - 3600 / factor });
  // What it would look like if somebody put the allowance inside tradeNetOf, where the use of
  // home already sits. This is the wrong answer, and it must NOT match.
  const trap = O.taxPosition({ ...THREE, ytdTradeIncome: THREE.ytdTradeIncome - 3600 });

  ok('🔴 a £3,600 allowance at month three is worth £3,600, not £14,400',
    near(allowance.setAside, equivalent.setAside));
  ok('🔴 and it is NOT the same as taking £3,600 off his year to date income',
    !near(allowance.setAside, trap.setAside, 1));
  ok('the trap answer really would have been the bigger relief, which is why it is the tempting one',
    trap.setAside < allowance.setAside);
  ok('at twelve months in, where the factor is 1, the two agree again',
    near(
      O.taxPosition({ ...BASE, ytdCapitalAllowances: 3600 }).setAside,
      O.taxPosition({ ...BASE, ytdTradeIncome: BASE.ytdTradeIncome - 3600 }).setAside,
    ));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE TRADING ALLOWANCE TAKES IT AWAY, BECAUSE THAT IS WHAT ELECTING MEANS.
//
// GOV.UK: "You cannot deduct any other expenses or allowances if you claim the allowances." A
// capital allowance is an allowance. A man claiming both would be claiming twice.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5. Elect the trading allowance and the vehicle allowance goes with the rest');
{
  const elected = { ...BASE, tradingAllowanceElected: true };
  ok('CONTROL: without the election the allowance moves his tax',
    O.taxPosition({ ...BASE, ytdCapitalAllowances: 3600 }).setAside !== O.taxPosition(BASE).setAside);
  ok('🔴 with the election it does not, because he cannot have both',
    O.taxPosition({ ...elected, ytdCapitalAllowances: 3600 }).setAside === O.taxPosition(elected).setAside);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 6. THE TWO FUNCTIONS IN lib/taxoptimiser.ts NOW AGREE ABOUT ONE MAN'S PROFIT.
//
// tradeNetOf's own comment says two functions in one file that disagree about one man's profit is
// how this file's bugs get written. It was already true when it was written: taxPosition applied
// the trading allowance to its projection and findOptimisations did not. Both go through
// projectedTradeNetOf now, and the incorporation lever is the visible proof, because it only
// speaks above £50,000 of projected profit.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n6. The levers are priced off the same profit as the set aside');
{
  const hasIncorporation = (input) =>
    O.findOptimisations(input).some((o) => o.key === 'incorporation');

  // Just over the line, so a few thousand pounds of allowance takes it under.
  const RICH = { ...BASE, ytdTradeIncome: 112000, ytdTradeExpenses: 60000 };
  ok('CONTROL: at a £52,000 projected profit the incorporation question is live',
    hasIncorporation(RICH));
  ok('🔴 a £5,000 vehicle allowance takes him under the line and it goes quiet',
    !hasIncorporation({ ...RICH, ytdCapitalAllowances: 5000 }));
  ok('🔴 and so does the trading allowance, which findOptimisations used to ignore entirely',
    !hasIncorporation({ ...RICH, ytdTradeIncome: 50400, ytdTradeExpenses: 0, tradingAllowanceElected: true })
    && hasIncorporation({ ...RICH, ytdTradeIncome: 50400, ytdTradeExpenses: 0 }));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 7. THE LEDGER SAYS WHERE IT CAME FROM.
//
// The screen whose whole job is to tell him what we saved him. capitalAllowances used to be a
// hard zero here with a comment explaining that tools are already inside the expenses line. That
// is still true of tools. A vehicle is not a tool, and its cost is no longer in that line at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n7. The vehicle allowance shows on the ledger, by name');
{
  const src = { ...BASE, ytdMileage: 0, ytdCisSuffered: 0 };
  const line = (l) => l.lines.find((d) => d.key === 'capital');

  ok('CONTROL: a man with no vehicle has no vehicle line at all', !line(L.ledgerFor(src)));

  // ⚠️ NULL SAFE ON PURPOSE. Sabotaging lib/ledger.ts back to its hard zero made this section
  // THROW rather than report, and a suite that crashes tells you less than one that says which
  // assertion went. A missing line is a FAIL, which is what it is.
  const car = line(L.ledgerFor({ ...src, ytdCapitalAllowances: 3600 })) ?? null;
  ok('🔴 with one, the line is there and it is his figure', car !== null && near(car.deducted, 3600));
  ok('and it is a line that SAVED him something, not a row of decoration', (car?.saved ?? 0) > 0);
  ok('it does not claim the Annual Investment Allowance covers a car, because it does not',
    car !== null && !/annual investment allowance takes/i.test(car.basis));
  ok('⚠️ and it is gone again under the trading allowance, exactly like expenses and mileage',
    !line(L.ledgerFor({ ...src, ytdCapitalAllowances: 3600, tradingAllowanceElected: true })));
  const spend = (l) => l.lines.find((d) => d.key === 'expenses')?.deducted ?? null;
  ok('the cost is NOT double counted: expenses are untouched by the new field',
    spend(L.ledgerFor({ ...src, ytdCapitalAllowances: 3600 })) === spend(L.ledgerFor(src)));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 8. 🔴 THE ORDER THE TWO WRITES HAPPEN IN, WHICH IS THE WHOLE SAFETY OF THIS FEATURE.
//
// confirm_pile flips confirmed=true, and the moment it does the row is inside every total in the
// product. So what he SAID a purchase was has to be stored FIRST. If the answer is stored second
// and that write fails, a £60,000 car sits in his books as a £60,000 deduction with his answer
// lost, which is the exact defect this whole push exists to remove.
//
// The route is run for real against stubs, so these are assertions about what it DOES, not about
// what it says. lib/capital.ts goes in whole rather than stubbed: the route asks it which strings
// are kinds and which numbers are bands, and a stub would have to restate both lists.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n8. Nothing is filed until we have stored what it was');
{
  const rStage = mkdtempSync(path.join(tmpdir(), 'capwire-route-'));
  const put = (name, body) => writeFileSync(path.join(rStage, name), body);
  for (const f of ['capital', 'taxengine', 'money', 'vat', 'circumstances', 'receiptconfidence', 'reviewpile', 'personal', 'propertylanes']) {
    put(`${f}.ts`, fix(readFileSync(path.join(lib, `${f}.ts`), 'utf8')));
  }
  put('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
  put('webauth.ts', "export async function sessionUser() { return { id: 'u-1' }; }\n");
  put('ratelimit.ts', 'export async function rateLimitedShared() { return false; }\n');
  put('gateserver.ts', `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
  put('reviewpile.ts', `
// Added 11 August 2026. The pile route's CIS branch imports cisCapture. The real one lives in
// lib/reviewpile.ts and is proved by test/ciscapture.test.mjs; this stub only has to exist and to
// keep the two columns the right way round, because a stub that swapped them would let a suite go
// green over the exact defect the real function was written to stop.
export function cisCapture(net, typed) {
  const taken = Number(String(typed ?? '').replace(/[£,\s]/g, ''));
  if (!Number.isFinite(taken) || taken < 0) return null;
  return { amount: Math.round((net + taken) * 100) / 100, cis_deduction: taken };
}

export function buildPile() { return []; }
export function summarisePile() { return { entries: 0 }; }
export function canBulkConfirm() { return false; }
export function bulkConfirmPlan() { return []; }
`);
  put('memory.ts', 'export function normaliseVendor(v) { return String(v || "").toLowerCase(); }\n');
  put('personal.ts', 'export function looksPersonal() { return null; }\n');
  put('categories.ts', "export const CATEGORIES = ['vehicle'];\nexport function categoriseBankLine() { return 'vehicle'; }\n");
  put('supabase.ts', `
export const state = { calls: [], capitalWriteOk: true };
export async function pileEntries() { return []; }
export async function readOwnNames() { return []; }
export async function readAccountUse() { return 'mixed'; }
export async function confirmPile(userId, ids, category) {
  state.calls.push({ fn: 'confirmPile', ids, category });
  return ids.length;
}
// RUN 2: the property stream door. Stubbed alongside confirmPile so the route imports.
export async function confirmPileProperty(userId, ids, category) {
  state.calls.push({ fn: 'confirmPileProperty', ids, category });
  return ids.length;
}
export async function setCapitalKind(userId, ids, kind, pct) {
  state.calls.push({ fn: 'setCapitalKind', ids, kind, pct });
  return state.capitalWriteOk;
}
export async function confirmIncome() { return 0; }
export async function setManyPersonal() { return 0; }
export async function learnVendor() { return true; }
export async function readVatProfile() { return null; }
// Added 11 August 2026: the pile route's CIS branch imports these two, so a suite that stages
// the route must stage them or the module fails to link.
export async function readCircumstances() { return [{ key: 'cis', answer: 'yes' }]; }
export async function recordCisOnIncome() { return 1; }
export async function confirmTransactionVat() { return true; }
`);
  put('route.ts', read('app/api/pile/route.ts')
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"));

  const RT = await import(pathToFileURL(path.join(rStage, 'route.ts')).href);
  const DB = await import(pathToFileURL(path.join(rStage, 'supabase.ts')).href);

  const ID = '11111111-2222-4333-8444-555555555555';
  const post = async (fields, { capitalWriteOk = true } = {}) => {
    DB.state.calls.length = 0;
    DB.state.capitalWriteOk = capitalWriteOk;
    const body = new URLSearchParams({ ids: ID, vendor: 'AUDI LEEDS', verdict: 'business', ...fields });
    return RT.POST({
      url: 'https://lekhio.app/api/pile',
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/x-www-form-urlencoded' : null) },
      formData: async () => body,
    });
  };
  const called = (fn) => DB.state.calls.filter((c) => c.fn === fn);

  // CONTROL. Nothing about cars, and the route behaves exactly as it did before any of this.
  {
    const res = await post({ category: 'materials' });
    ok('CONTROL: an ordinary cost still files, and nothing is stored about vehicles',
      called('confirmPile').length === 1 && called('setCapitalKind').length === 0 && res.status === 303);
  }

  // He said it was a car and nobody has asked him how much of the driving is work.
  {
    const res = await post({ category: 'vehicle', capital_kind: 'car_other' });
    ok('🔴 A CAR WITH NO BUSINESS USE SHARE FILES NOTHING AT ALL',
      called('confirmPile').length === 0 && called('setCapitalKind').length === 0);
    ok('it sends him to the screen that asks, carrying his row and his answer',
      res.kind === 'redirect' && res.status === 303
      && res.location.includes('/app/pile/car') && res.location.includes(`id=${ID}`)
      && res.location.includes('kind=car_other'));
  }

  // The answer complete. Both writes, in the order that keeps him safe.
  {
    await post({ category: 'vehicle', capital_kind: 'car_other', business_use_pct: '75' });
    const order = DB.state.calls.map((c) => c.fn);
    ok('🔴 THE ANSWER IS STORED BEFORE THE ROW IS CONFIRMED, never after',
      order.indexOf('setCapitalKind') === 0 && order.indexOf('confirmPile') === 1);
    ok('and his band goes with it', called('setCapitalKind')[0].pct === 75);
  }

  // THE ONE THAT MATTERS. The write fails, so nothing is filed.
  {
    const res = await post(
      { category: 'vehicle', capital_kind: 'car_other', business_use_pct: '75' },
      { capitalWriteOk: false },
    );
    ok('🔴 IF WE CANNOT STORE THAT IT WAS A CAR, WE DO NOT FILE IT',
      called('setCapitalKind').length === 1 && called('confirmPile').length === 0);
    ok('and he is told, on the pile, rather than shown a success he did not get',
      res.kind === 'redirect' && String(res.location).includes('carfailed'));
  }

  // "Not a car" is an answer, and a failure to store it changes no arithmetic.
  {
    await post({ category: 'materials', capital_kind: 'not_a_car' }, { capitalWriteOk: false });
    ok('⚠️ but a failed "not a car" still files, because it is an ordinary cost either way',
      called('confirmPile').length === 1);
    ok('and no business use share is sent on something that is not a vehicle',
      called('setCapitalKind')[0].pct === null);
  }

  // Nothing the browser sends is trusted.
  {
    await post({ category: 'vehicle', capital_kind: 'a_spaceship', business_use_pct: '99' });
    ok('a made up kind is ignored and the row files as an ordinary cost',
      called('setCapitalKind').length === 0 && called('confirmPile').length === 1);
  }
  {
    const res = await post({ category: 'vehicle', capital_kind: 'car_other', business_use_pct: '99' });
    ok('🔴 and a band we never offered is not a band: he is sent to be asked properly',
      called('confirmPile').length === 0 && res.kind === 'redirect'
      && String(res.location).includes('/app/pile/car'));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 9. 🔴 THE CAR HE HAD ALREADY FILED. The half of the fix the pile cannot reach.
//
// The pile asks BEFORE a row is confirmed. Walking the live site an hour after it learned to ask:
// AUDI LEEDS, £60,000, filed under 'van', confirmed, capital_kind null, and no route in the whole
// product that could change it. Everything typed into /app/money/add lands confirmed. So does
// everything from WhatsApp. None of them are ever asked. /api/money/capital is the one door that
// covers all of them, and this section is what makes sure it cannot be pushed open.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n9. Correcting a payment already in his books');
{
  // ⚠️ SET BEFORE THE IMPORT. app/app/entryref.ts reads WEB_SESSION_SECRET at module load, so a
  // secret set afterwards would leave every reference unmintable and every assertion below would
  // pass for the wrong reason: nothing written, because nothing could be addressed.
  process.env.WEB_SESSION_SECRET = 'a'.repeat(48);

  const cStage = mkdtempSync(path.join(tmpdir(), 'capwire-correct-'));
  const put = (name, body) => writeFileSync(path.join(cStage, name), body);
  for (const f of ['capital', 'taxengine', 'money', 'moneylog']) {
    put(`${f}.ts`, fix(readFileSync(path.join(lib, `${f}.ts`), 'utf8')));
  }
  // The REAL reference module, sealing and opening for real. A stub would make this section a
  // test of the stub, and the reference is the only thing standing between a hand rolled post and
  // another man's row.
  put('entryref.ts', read('app/app/entryref.ts').replace("from '../../lib/moneylog'", "from './moneylog.ts'"));
  put('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
  put('webauth.ts', "export const who = { id: 'u-1' };\nexport async function sessionUser() { return who.id ? who : null; }\n");
  put('ratelimit.ts', 'export async function rateLimitedShared() { return false; }\n');
  put('gateserver.ts', `
export const gate = { rule: 'ok' };
export async function gateForUser() { return gate.rule; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
  put('supabase.ts', `
export const state = { calls: [], ok: true };
export async function setCapitalKind(userId, ids, kind, pct) {
  state.calls.push({ userId, ids, kind, pct });
  return state.ok;
}
`);
  put('route.ts', read('app/api/money/capital/route.ts')
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+app\/entryref'/g, "from './entryref.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"));

  const RT = await import(pathToFileURL(path.join(cStage, 'route.ts')).href);
  const DB = await import(pathToFileURL(path.join(cStage, 'supabase.ts')).href);
  const REF = await import(pathToFileURL(path.join(cStage, 'entryref.ts')).href);

  const ROW = '11111111-2222-4333-8444-555555555555';
  const mine = REF.entryRef('u-1', ROW, '2026-06');
  const someoneElses = REF.entryRef('u-2', ROW, '2026-06');

  const post = async (fields, { ok = true } = {}) => {
    DB.state.calls.length = 0;
    DB.state.ok = ok;
    const body = new URLSearchParams(fields);
    return RT.POST({
      url: 'https://lekhio.app/api/money/capital',
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/x-www-form-urlencoded' : null) },
      formData: async () => body,
    });
  };

  ok('the reference module is actually configured, so the rest of this section means something',
    REF.entryRefsConfigured() && mine.length > 20);

  // THE WRITE, AND WHAT IT IS ALLOWED TO TOUCH.
  {
    const res = await post({ ref: mine, capital_kind: 'car_other', business_use_pct: '50' });
    ok('🔴 a car with a band writes his answer against HIS row',
      DB.state.calls.length === 1 && DB.state.calls[0].userId === 'u-1'
      && DB.state.calls[0].ids[0] === ROW && DB.state.calls[0].kind === 'car_other'
      && DB.state.calls[0].pct === 50);
    ok('and he is sent back to the same line, told it saved',
      res.kind === 'redirect' && res.status === 303 && String(res.location).includes('saved=1'));
  }
  {
    await post({ ref: mine, capital_kind: 'not_a_car' });
    ok('"not a car" needs no band and sends none', DB.state.calls[0].kind === 'not_a_car' && DB.state.calls[0].pct === null);
  }

  // THE FOUR WAYS IN THAT MUST NOT WORK.
  {
    await post({ ref: someoneElses, capital_kind: 'car_other', business_use_pct: '50' });
    ok("🔴 A VALID REFERENCE MINTED FOR ANOTHER MAN WRITES NOTHING", DB.state.calls.length === 0);
  }
  {
    await post({ ref: `${mine}x`, capital_kind: 'car_other', business_use_pct: '50' });
    ok('a tampered reference writes nothing', DB.state.calls.length === 0);
  }
  {
    await post({ ref: '', capital_kind: 'car_other', business_use_pct: '50' });
    ok('no reference at all writes nothing', DB.state.calls.length === 0);
  }
  {
    await post({ ref: mine, capital_kind: 'a_spaceship', business_use_pct: '50' });
    ok('a kind we never offered writes nothing', DB.state.calls.length === 0);
  }

  // 🔴 THE ONE THAT WOULD HAVE BEEN EASY TO GET WRONG. CAA 2001 s205: a car's allowance is
  // restricted to the business share. Taking 100% because the field was empty is the same over
  // claim this feature exists to stop, in a quieter voice.
  {
    const res = await post({ ref: mine, capital_kind: 'car_other' });
    ok('🔴 A CAR WITH NO BAND WRITES NOTHING AND IS SENT BACK TO BE ASKED',
      DB.state.calls.length === 0 && res.kind === 'redirect'
      && String(res.location).includes('kind=car_other') && !String(res.location).includes('saved=1'));
  }
  {
    const res = await post({ ref: mine, capital_kind: 'car_other', business_use_pct: '99' });
    ok('and a band we never offered is not a band either',
      DB.state.calls.length === 0 && String(res.location).includes('kind=car_other'));
  }

  // The failure is told, never dressed up.
  {
    const res = await post({ ref: mine, capital_kind: 'car_other', business_use_pct: '50' }, { ok: false });
    ok('a failed write says so rather than reporting a save that did not happen',
      String(res.location).includes('problem=capital') && !String(res.location).includes('saved=1'));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 10. 🔴 THE YEARS AFTER THE FIRST ONE, WHICH PRODUCED NOTHING AT ALL.
//
// capitalRelief printed "The rest is not lost. It keeps coming, a bit smaller each year" and then
// getOptimiserInput read only the current tax year, so a car bought last April earned exactly
// nothing. The product was contradicting its own sentence and the man losing by it would never
// have known, because the number he was owed simply was not there.
//
// A single asset pool needs no table: balance after n years = cost x (1-rate)^n. These assertions
// are what make that arithmetic true rather than plausible.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n10. The allowance keeps coming, and it shrinks');
{
  const y = (n) => C.capitalRelief(60000, 'car_other', 100, n).thisYear;

  ok('CONTROL: year one is unchanged by the new argument',
    near(y(0), C.capitalRelief(60000, 'car_other', 100).thisYear));
  ok('🔴 year two is NOT zero, which is what the product actually produced', y(1) > 0);
  ok('year two is 6% of what is left, not 6% of the price',
    near(y(1), (60000 - 3600) * 0.06, 1));
  ok('and it shrinks every year rather than repeating', y(0) > y(1) && y(1) > y(2) && y(2) > y(3));
  ok('it never goes negative however long he keeps it', y(40) >= 0);

  // 🔴 THE ONES THAT MUST NOT REPEAT. A van and a new electric car both take the WHOLE cost in
  // year one. Handing it over again every year would be the plainest over claim in the codebase.
  ok('🔴 a van gives nothing from year two, because it was all taken in year one',
    C.capitalRelief(20000, 'not_a_car', 100, 1).thisYear === 0
    && C.capitalRelief(20000, 'not_a_car', 100, 5).thisYear === 0);
  ok('🔴 and so does a new electric car',
    C.capitalRelief(45000, 'car_zero_new', 100, 1).thisYear === 0);
  ok('CONTROL: both still give the lot in the year of purchase',
    near(C.capitalRelief(20000, 'not_a_car', 100, 0).thisYear, 20000)
    && near(C.capitalRelief(45000, 'car_zero_new', 100, 0).thisYear, 45000));

  // ⚠️ CAA 2001 s205 reduces the CLAIM, not the expenditure. The pool falls by the whole writing
  // down allowance either way, so the private share of each year is lost rather than saved up.
  // Modelling it the other way hands him back relief the law has already taken off him.
  const half = C.capitalRelief(60000, 'car_other', 50, 1).thisYear;
  const whole = C.capitalRelief(60000, 'car_other', 100, 1).thisYear;
  ok('🔴 the private share comes off the claim, and it does NOT come back later',
    near(half, whole / 2, 1));
  ok('the pool written down at 50% use is the same as at 100%, because s205 reduces the claim only',
    near(C.capitalRelief(60000, 'car_other', 50, 0).carriedForward,
         C.capitalRelief(60000, 'car_other', 100, 0).carriedForward));

  // The words follow the money. "On £60,000 that is £3,384" is arithmetic he can check and find
  // wrong, on the one screen whose job is that he can check our working.
  const y2 = C.capitalRelief(60000, 'car_other', 100, 1);
  ok('🔴 year two quotes what is LEFT, not the price he paid',
    y2.says.includes('56,400') && !y2.says.includes('On £60,000'));
  ok('and it says which year of claiming he is on', /year 2 of claiming/i.test(y2.says));
  ok('a van in a later year says its relief is spent rather than quoting a rate',
    /nothing left to claim/i.test(C.capitalRelief(20000, 'not_a_car', 100, 2).says));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 11. 🔴 THE ADVICE THAT WOULD HAVE PUT A CLAIM ON HIS RETURN HE IS NOT ENTITLED TO MAKE.
//
// GOV.UK, simplified expenses, vehicles: "You cannot claim simplified expenses for a vehicle
// you've already claimed capital allowances for, or you've included as an expense when you worked
// out your business profits." BIM75005 gives the reason: "the rate already contains an element to
// allow for depreciation."
//
// Ways to save was telling a man who had put a van through his books that he "could often claim
// more by logging miles at 55p a mile instead". Note the second half of the GOV.UK sentence: this
// is not only cars with a writing down allowance, it is a van taken in full under the AIA too.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n11. Never the mileage rate on a vehicle he bought through the books');
{
  const FUEL = { ...BASE, categoriesLogged: ['fuel'], mileageClaimed: false };
  const card = (input) => O.findOptimisations(input).find((o) => o.key === 'mileage');

  const control = card(FUEL);
  ok('CONTROL: a man logging fuel and no mileage is still told about the flat rate',
    Boolean(control) && /55p a mile/.test(control.detail));

  const bought = card({ ...FUEL, vehicleBoughtThroughBooks: true });
  // ⚠️ NOT "the rate is not mentioned". The correction sentence names the rate on purpose, because
  // "the flat rate is not open to you" means nothing to a man who does not know which rate. What
  // must be gone is the RECOMMENDATION, and an assertion that only checks for the number would
  // have failed on copy that is exactly right.
  ok('🔴 BUT NOT ONE WHO HAS PUT A VEHICLE THROUGH HIS BOOKS',
    Boolean(bought) && !/claim more by logging miles/i.test(bought.detail));
  ok('and it is stated as closed to him, not offered', /not open to you/i.test(bought.detail));
  ok('he is told WHY it is closed to him rather than the card just vanishing',
    /never both|one or the other/i.test(bought.detail));
  ok('and pointed at what he CAN claim, which is the same helpfulness aimed somewhere legal',
    /insurance/i.test(bought.detail) && /servicing/i.test(bought.detail));
  ok('it claims no saving, because it is a correction and not a lever', bought.estSaving === 0);

  // It must not quietly become an instruction either.
  ok('🔴 the word "instead" is gone, so nothing reads as a suggestion to switch',
    !/instead/i.test(bought.detail));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 12. THREE NOUGHTS AND A CONFIDENT RECOMMENDATION BETWEEN THEM.
//
// Walking /app/tax/vehicle on 2 August with a real account carrying a loss: "A brand new electric
// car £0", "A hybrid £0", "A petrol or diesel car £0", and underneath, in red, "ON YOUR NUMBERS: A
// HYBRID... That is about £0 of tax in the first year."
//
// Not an arithmetic bug. Every figure on that screen is a deduction times his marginal rate, and a
// man with no taxable profit has a rate of nought. The screen was RIGHT and unreadable, which on a
// screen whose whole job is to be believed is the same as being wrong.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n12. The vehicle screen when there is no tax to save');
{
  const ask = (rate) => C.recommendVehicle({
    want: 'car', budget: 40000, businessMilesPerYear: 9000, businessUsePct: 75,
    runningCostsPerYear: 3000, charging: 'home', marginalRate: rate, spendable: 50000,
  });

  const normal = ask(0.29);
  const broke = ask(0);

  ok('CONTROL: at a real marginal rate nothing changes', normal.noTaxToSaveYet === false);
  ok('🔴 at a rate of nought the screen knows it', broke.noTaxToSaveYet === true);

  const said = (r) => r.lines.join(' ');
  ok('CONTROL: the normal answer still quotes a tax figure',
    /of tax in the first year/.test(said(normal)));
  ok('🔴 AND THE £0 ONE DOES NOT, because "about £0 of tax" tells him nothing',
    !/of tax in the first year/.test(said(broke)));
  ok('it says plainly that he has no tax to pay this year',
    /no tax\s+to pay this year/.test(said(broke)));
  // ⚠️ AND IT DOES NOT LEAVE HIM THINKING THE RELIEF IS WASTED. Claimed against no profit it makes
  // a loss, and a loss is carried forward. Saying "worth nothing" would be the wrong lesson.
  ok('🔴 and that the relief is carried forward rather than lost',
    /carried forward|carries forward/.test(said(broke)));

  // The RECOMMENDATION itself must survive: which vehicle is best does not depend on his rate,
  // because the deduction it earns is the same either way.
  ok('the recommendation is still made, and it is the same one',
    Boolean(broke.best) && broke.best.kind === normal.best.kind);
  ok('and the options still differ from each other on the deduction',
    new Set(broke.options.map((o) => o.firstYear)).size > 1);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 ONE PLACE DECIDES WHETHER A COST COMES OFF NOW OR OVER YEARS');
//
// The 2 August fix put the test inside the ledger loop in lib/supabase.ts, written out by hand as
// `if (kind && kind !== 'not_a_car') continue`. It was correct and it was INVISIBLE. On 4 August
// the same account read, on three screens of one product, on one day, for one tax year:
//
//   /app/tax/summary      In £33,580   Out £72,088   Profit MINUS £38,508
//   /app/tax/what-if      "Your confirmed profit since 6 April is £22,776"
//   /app/tax              "£16,626 ... due by 31 January 2028"
//
// £61,284 apart, and £61,284 is a £60,000 Audi plus a £1,284 tester, to the pound. The engine was
// right. Every screen that printed a profit was wrong, because none of them could see the rule.
// It is isWrittenDown() in lib/capital.ts now, and the screens ask it what the engine asks it.

ok('CONTROL: an unanswered row is an ordinary cost, exactly as it always was',
  C.isWrittenDown(null) === false && C.isWrittenDown(undefined) === false);
ok('CONTROL: so is anything that is not one of the four answers',
  C.isWrittenDown('') === false && C.isWrittenDown('car') === false
  && C.isWrittenDown(7) === false && C.isWrittenDown({}) === false);
ok('a van he has told us about comes off in full', C.isWrittenDown('not_a_car') === false);
for (const kind of ['car_zero_new', 'car_low_or_used_electric', 'car_other']) {
  ok(`🔴 ${kind} is written down`, C.isWrittenDown(kind) === true);
}
ok('and every kind the product knows is covered by that answer either way',
  C.CAPITAL_KINDS.every((k) => typeof C.isWrittenDown(k) === 'boolean')
  && C.CAPITAL_KINDS.filter((k) => C.isWrittenDown(k)).length === C.CAPITAL_KINDS.length - 1);

{
  // The wiring, on source, because the arithmetic above passes just as happily when nothing calls
  // it. A comment stripper first: this asserts what the code does, not what it says about itself.
  const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const supa = codeOnly(read('lib/supabase.ts'));
  // The row loop moved whole into lib/yeartodate.ts on 6 August 2026 so the guard suite can
  // drive the exact function production runs. The pins on the loop move with it; the pins on
  // the row mapping stay on lib/supabase.ts, which still owns the database read.
  const ytd = codeOnly(read('lib/yeartodate.ts'));
  const pack = codeOnly(read('lib/quarterpack.ts'));
  const summary = read('app/app/tax/summary/page.tsx');

  // ⚠️ THE NEGATIVE RAN ON THE WHOLE FILE FIRST AND IT WAS WRONG TWICE OVER. It fired on the
  // assets loop and on setCapitalKind, both of which were asking the SAME question in their own
  // words, which is the defect rather than an exception to it. So all three call isWrittenDown now
  // and lib/supabase.ts holds no hand written copy of the rule at all. The one place the string
  // still appears is a comment explaining what the answer means, which codeOnly strips.
  // 🔴 THIS QUOTED THE STATEMENT UP TO ITS PUNCTUATION AND B72 REDDENED IT. 20 August 2026.
  //
  // It read `\) continue;` and so was pinned to the one line body. B72 turned that body into a
  // block, purely so the purchase price could be COUNTED on the way past, and kept both halves of
  // what this assertion is actually about: the loop still ASKS lib/capital.ts, and the row is still
  // SKIPPED. It went red on a brace. That is the FIFTH assertion in three days to red on an
  // expression being extended rather than broken (landlord B62, dayone B67, moneyweb B69,
  // b67financeline B72, this). The shape is always the same and so is the fix: assert the CALL and
  // the BEHAVIOUR, never the punctuation between them.
  //
  // ⚠️ THE WINDOW IS BOUNDED BY THE BRANCH RATHER THAN BY A CHARACTER COUNT, so it cannot drift on
  // to a `continue` belonging to some later branch and quietly stop meaning anything.
  const wdBranch = (ytd.match(/if \(isWrittenDown\(r\.capital_kind\)\)[\s\S]*?\n\s*(?:ytdTradeExpenses|\})/) ?? [''])[0];
  ok('🔴 the ledger loop calls it rather than spelling it out',
    /if \(isWrittenDown\(r\.capital_kind\)\)/.test(ytd));
  ok('🔴 AND THE ROW IS SKIPPED, whether that body is one statement or a block',
    /\bcontinue;/.test(wdBranch));
  ok('🔴 AND NO PART OF lib/supabase.ts DECIDES IT BY HAND ANY MORE',
    !/not_a_car/.test(supa));
  ok('🔴 ...AND NEITHER DOES lib/yeartodate.ts, WHERE THE LOOP LIVES NOW',
    !/not_a_car/.test(ytd));
  ok('🔴 and every row handed to the pack carries the decided answer',
    /writtenDown: isWrittenDown\(r\.capital_kind\)/.test(supa));
  ok('lib/quarterpack.ts obeys it and never re-decides it',
    /t\.writtenDown === true/.test(pack) && !/not_a_car/.test(pack));
  // 🔴 TWO, AND THE SECOND ONE WAS PAID FOR. This pin is not a ban on imports, it is a tripwire:
  // six suites stage lib/quarterpack.ts with a fixed dependency list, and an unnoticed new import
  // kills all six on a module resolution error rather than on anything they are about. It went from
  // one to two on 8 August 2026 when the pack started printing lib/scotland.ts's sentence, which
  // says which country's income tax rates the estimate is worked at. Every one of those suites now
  // stages scotland.ts alongside. The names are asserted, not just the count, so swapping an import
  // for a different one still fails here.
  const packImports = (pack.match(/from '\.\/([a-zA-Z0-9._-]+)'/g) ?? []).sort();
  ok('🔴 and quarterpack holds exactly its two known relative imports, which six suites depend on',
    packImports.length === 2
    && packImports.join('|') === "from './scotland'|from './taxengine'");

  ok('🔴 the summary page names the money it is no longer counting',
    /sub\.trade\.capitalCost > 0/.test(codeOnly(summary))
    && /gbp2\(sub\.trade\.capitalCost\)/.test(codeOnly(summary)));
  ok('...and says why, rather than leaving a hole',
    /not in Out above/.test(summary) && /never in one/.test(summary));
  // ⚠️ AND IT QUOTES THE COST, NEVER THE ALLOWANCE. This page reads one tax year of rows, so a car
  // bought last year is invisible to it and any allowance it worked out here would be short.
  ok('🔴 and it never works out an allowance from one year of rows',
    !/capitalRelief|thisYear/.test(codeOnly(summary)));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
