// TWO THINGS THE PRODUCT SAID ABOUT VAT THAT WERE NOT TRUE, 31 JULY 2026.
//
//   node test/wave9_vat.test.mjs
//
// 🔴 ONE. WE WERE PUSHING A PAID WHATSAPP MESSAGE AT MEN WHO REGISTERED YEARS AGO.
//
// lib/agent.ts built its VAT threshold signal from turnover alone, because AgentInput had no
// vatRegistered field at all. Above the threshold it fires at ping priority, which is a template
// send, and it reads: "You have crossed the VAT threshold ... You normally have 30 days from the
// end of the month you crossed in to register. Worth acting on now."
//
// That reaches every VAT registered customer over the threshold, which is everyone who had to
// register compulsorily, which is the core of this audience. lib/weeklyupdate.ts had it right all
// along, so two paths disagreed and the wrong one was the one that spends money to send.
//
// 🔴 TWO. WE CLAIMED IN FOUR PLACES THAT WE READ THE VAT OFF A RECEIPT.
//
// lib/claude.ts's vision prompt does not contain the word VAT. ParsedReceipt has no VAT field. The
// transactions table has no VAT column, in the schema or in any of the fifty migrations. There is
// nowhere to put one. The in app capture screen was already honest; the marketing was not, and one
// of the four carried a fabricated demo bubble reading "VAT £7.10".

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// lib/agent.ts imports half a dozen other lib modules, and Node's type stripping cannot resolve an
// extensionless relative import. So stage the whole chain and rewrite every relative import to .ts,
// exactly as test/agent.test.mjs does. Keep this list in step with that one.
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'wave9vat-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'money', 'nistudentloan', 'propertyengine', 'ltdengine', 'personalincome', 'partnership', 'position', 'rakhamoves', 'waintents', 'agent']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const { computeSignals } = A;

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nVAT: what we said, against what we do');

// A man well over the threshold. Twelve full months so the rolling window is real.
function months(perMonth) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    out.push({ month: `2026-${String(m + 1).padStart(2, '0')}`, income: perMonth, expenses: 200, profit: perMonth - 200 });
  }
  return out;
}

const base = {
  today: new Date('2026-07-31T12:00:00Z'),
  months: months(10000),          // £120,000 rolling, comfortably over
  week: { income: 0, expenses: 0 },
  invoices: [],
  categories: {},
  unconfirmedCount: 0,
  equipmentSpendYtd: 0,
  studentLoanPlan: null,
  studentLoanPostgrad: false,
  employmentIncome: 0,
  goals: [],
};

const keysOf = (input) => computeSignals(input).map((s) => s.signalKey);

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SIGNAL, AND WHO IT REACHES.
// ---------------------------------------------------------------------------------------------
{
  const unknown = keysOf({ ...base });
  const notReg = keysOf({ ...base, vatRegistered: false });
  const registered = keysOf({ ...base, vatRegistered: true });

  ok('🔴 A MAN WHO IS ALREADY VAT REGISTERED IS NOT TOLD TO GO AND REGISTER',
    !registered.includes('vat_approach'));
  ok('a man who is not registered and is over the line still IS told, which is the point of the signal',
    notReg.includes('vat_approach'));
  ok('🔴 AND UNKNOWN STILL WARNS HIM. False is the safe default here, because missing the threshold has a date on it',
    unknown.includes('vat_approach'));
  ok('nothing else about him changed: the two lists are otherwise identical',
    notReg.filter((k) => k !== 'vat_approach').join(',') === registered.join(','));

  // The 30 day sentence is the one that does the damage, so pin that it cannot be built at all.
  const sig = computeSignals({ ...base, vatRegistered: false }).find((s) => s.signalKey === 'vat_approach');
  ok('the sentence a registered man was reading really does exist for the unregistered one',
    /30 days/.test(sig.body) && /register/i.test(sig.body));
  ok('🔴 and it is a PING, which is a paid template send, which is why this was worth stopping',
    sig.priority === 'ping');
  ok('no vat_approach signal exists at all for a registered man, at any tier',
    computeSignals({ ...base, vatRegistered: true }).every((s) => s.signalKey !== 'vat_approach'));
}

// The lower tiers too: every one of them talks about registering.
{
  const nearly = { ...base, months: months(7000), vatRegistered: true };   // ~93% of the threshold
  ok('🔴 nor at 90 percent, because that tier is a ping as well and it also talks about registering',
    computeSignals(nearly).every((s) => s.signalKey !== 'vat_approach'));
  ok('...and the unregistered man at 90 percent still gets it',
    computeSignals({ ...nearly, vatRegistered: false }).some((s) => s.signalKey === 'vat_approach'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE FACT REACHES THE ENGINE FROM THE ONE PLACE IT LIVES.
// ---------------------------------------------------------------------------------------------
{
  const agentSrc = read('lib/agent.ts');
  ok('the field is optional, so a caller that never sets it behaves exactly as before',
    /vatRegistered\?: boolean;/.test(agentSrc));
  ok('the guard is on the signal, not scattered over its three tiers',
    /if \(vatTier > 0 && !input\.vatRegistered\)/.test(agentSrc));

  for (const route of ['app/api/cron/agent/route.ts', 'app/api/agent/reassess/route.ts']) {
    const src = read(route);
    ok(`${route} reads the circumstances log`, /readCircumstances\(/.test(src));
    ok(`${route} derives vatRegistered from the vat_registered answer, not from a guess`,
      /vatRegistered: \(circs \?\? \[\]\)\.some\(\(c\) => c\.key === 'vat_registered' && c\.answer === 'yes'\)/.test(src));
    ok(`${route} treats an unreadable read as NOT registered, the safe direction`,
      /circs \?\? \[\]/.test(src));
  }

  // The path that already had it right, kept as the reference.
  ok('lib/weeklyupdate.ts still guards its own threshold line the same way',
    /haveTurnover && !input\.vatRegistered/.test(read('lib/weeklyupdate.ts')));
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. WE DO NOT READ THE VAT OFF A RECEIPT, SO NOTHING MAY SAY WE DO.
// ---------------------------------------------------------------------------------------------
{
  const claude = read('lib/claude.ts');
  ok('🔴 THE GROUND TRUTH: the vision prompt does not ask for VAT, and ParsedReceipt has no field for it',
    !/vat/i.test(claude.slice(claude.indexOf('ParsedReceipt'), claude.indexOf('ParsedReceipt') + 3000)));

  const claims = [
    ['app/api/whatsapp/route.ts', 'the shop, the total and the VAT'],
    ['app/product/page.tsx', 'the total, the VAT and the category'],
    ['app/product/page.tsx', 'the shop, total and VAT'],
    ['app/product/page.tsx', 'VAT £7.10'],
  ];
  for (const [file, claim] of claims) {
    ok(`🔴 gone: "${claim}" in ${file}`, !read(file).includes(claim));
  }

  ok('WhatsApp now promises what the parser actually returns',
    read('app/api/whatsapp/route.ts').includes('I read the shop, the total and the date'));
  ok('and it matches the in app capture screen, which was honest all along',
    read('app/app/money/capture/page.tsx').includes('the shop, the total and the date'));
  ok('no fabricated VAT figure survives anywhere on the product page',
    !/VAT £[\d.]+/.test(read('app/product/page.tsx')));

  // ⚠️ NOT a blanket ban on the word. Rakha genuinely does watch the VAT threshold, and the chat
  // genuinely does answer VAT questions, so those sentences are true and stay.
  ok('⚠️ but the TRUE VAT sentences are untouched: Rakha really does watch the threshold',
    read('app/product/page.tsx').includes('the VAT threshold creeping closer'));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
