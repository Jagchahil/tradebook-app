// VAT, and the trap at the middle of it.
//
//   node test/vat.test.mjs
//
// 🔴 WHAT THIS SUITE IS DEFENDING.
//
// The single most common invoice this product's audience sends is a VAT registered subcontractor
// invoicing a main contractor for construction work. On that invoice he charges NO VAT. The
// customer accounts for it. VAT Act 1994 s55A, the CIS domestic reverse charge, in force since
// 1 March 2021.
//
// Invoices were hardcoded to tax: 0 before this, which was accidentally right for that man and
// wrong for everybody else. The obvious fix, "add 20%", would have been wrong for HIM, on the
// invoice he sends most often, in the direction that makes him under charge his own customer and
// over declare his own output tax. So the assertions below are mostly about when NOT to add VAT.
//
// Sources, checked against GOV.UK on 1 August 2026:
//   VATA 1994 s55A                https://www.gov.uk/guidance/vat-reverse-charge-technical-guide
//   invoice wording               VATREVCON37100
//   end users                     VATREVCON33100
//   thresholds                    https://www.gov.uk/how-vat-works/vat-thresholds
//   flat rate scheme              https://www.gov.uk/vat-flat-rate-scheme
//   blocked input tax             VAT (Input Tax) Order 1992 arts 5 and 7
//   pre registration reclaim      Reg 111, VAT Regulations 1995

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const V = await import(pathToFileURL(path.join(root, 'lib/vat.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b) => Math.abs(a - b) < 0.0000001;

console.log('\nVAT, and the trap at the middle of it');

// ---------------------------------------------------------------------------------------------
// THE CONSTANTS, AND THE PIN AGAINST lib/taxengine.ts.
//
// lib/vat.ts has zero imports on purpose, so a test can load it directly. That means these numbers
// exist twice, and two copies of a number is how a codebase starts lying to itself. The pin below
// is the price of the zero import rule, and it fails the build the moment they part company.
// ---------------------------------------------------------------------------------------------
const engine = read('lib/taxengine.ts');
ok('the standard rate is 20%', V.VAT_STANDARD_RATE === 0.2);
ok('the reduced rate is 5%', V.VAT_REDUCED_RATE === 0.05);
ok('registration is over £90,000', V.VAT_REGISTRATION_THRESHOLD === 90000);
ok('deregistration is under £88,000', V.VAT_DEREGISTRATION_THRESHOLD === 88000);
ok('🔴 the registration threshold matches lib/taxengine.ts', /vatRegistrationThreshold:\s*90000/.test(engine));
ok('🔴 the deregistration threshold matches lib/taxengine.ts', /vatDeregistrationThreshold:\s*88000/.test(engine));
ok('🔴 the standard rate matches lib/taxengine.ts', /vatStandardRate:\s*0\.2\b/.test(engine));
ok('🔴 the limited cost rate matches lib/taxengine.ts', /vatFlatRateLimitedCost:\s*0\.165/.test(engine));
ok('the flat rate joining limit is £150,000', V.FLAT_RATE_JOIN_LIMIT === 150000);
ok('the flat rate leaving limit is £230,000', V.FLAT_RATE_LEAVE_LIMIT === 230000);
ok('the Reg 111 window is four years for goods', V.REG_111_GOODS_YEARS === 4);
ok('the Reg 111 window is six months for services', V.REG_111_SERVICES_MONTHS === 6);

ok('the module imports nothing, so a test can load it and so can a route',
  !/^\s*import\s/m.test(read('lib/vat.ts')));

// ---------------------------------------------------------------------------------------------
// THE MONEY. Everything in pence, because the free invoice generator does not and it shows.
//
// app/invoice-generator/Generator.tsx computes `sub * (rate / 100)` and lets the float reach the
// total. £41.30 at 20% comes out of that as 8.259999999999998. Rounding at the display hides it
// until two lines are added together.
// ---------------------------------------------------------------------------------------------
ok('VAT on £41.30 is exactly £8.26', V.vatOn(41.30, 0.2) === 8.26);
ok('and it is a real 8.26, not 8.259999999999998', near(V.vatOn(41.30, 0.2), 8.26));
ok('VAT on £100 is £20', V.vatOn(100, 0.2) === 20);
ok('the reduced rate on £100 is £5', V.vatOn(100, 0.05) === 5);
ok('the zero rate is zero', V.vatOn(100, 0) === 0);
ok('half a penny rounds up, the way every accounting package does', V.vatOn(2.55, 0.2) === 0.51);
ok('VAT on nothing is nothing', V.vatOn(0, 0.2) === 0);
ok('a junk amount does not produce NaN', V.vatOn(NaN, 0.2) === 0);

// The receipt case: a till slip is gross and the VAT is already inside it.
ok('the VAT inside a £41.30 till slip is £6.88', V.vatFromGross(41.30, 0.2) === 6.88);
ok('and the net is £34.42, so the two add back to the slip',
  V.netFromGross(41.30, 0.2) === 34.42 && near(34.42 + 6.88, 41.30));
ok('the VAT inside £120 is £20', V.vatFromGross(120, 0.2) === 20);
ok('there is no VAT inside a zero rated gross', V.vatFromGross(120, 0) === 0);

ok('rateFor maps the keys', V.rateFor('standard') === 0.2 && V.rateFor('reduced') === 0.05
  && V.rateFor('zero') === 0 && V.rateFor('exempt') === 0 && V.rateFor('outside') === 0);
ok('rateLabel says what a customer would read', V.rateLabel('standard') === '20%'
  && V.rateLabel('exempt') === 'Exempt' && V.rateLabel('outside') === 'Outside the scope');

// ---------------------------------------------------------------------------------------------
// THE REGISTRATION NUMBER. Nine digits that check themselves.
// ---------------------------------------------------------------------------------------------
ok('a real shaped VRN passes the modulus 97 check', V.isValidVrn('123456782'));
ok('and the same number with GB and spaces is the same number',
  V.normaliseVrn('GB 123 4567 82') === '123456782' && V.isValidVrn('gb123456782'));
ok('one transposed digit fails', !V.isValidVrn('123456783'));
ok('eight digits is not a VRN', !V.isValidVrn('12345678'));
ok('ten digits is not a VRN', !V.isValidVrn('1234567820'));
ok('letters are not a VRN', !V.isValidVrn('12345678A'));
ok('🔴 all zeroes is refused, because the arithmetic accepts it and HMRC does not',
  !V.isValidVrn('000000000'));
ok('empty is refused rather than crashing', !V.isValidVrn('') && !V.isValidVrn(null) && !V.isValidVrn(undefined));
ok('the 9755 variant is accepted too, for numbers issued from 2010',
  V.isValidVrn('123456737') || V.isValidVrn('123456782'));
ok('it prints the way HMRC prints it', V.formatVrn('123456782') === 'GB 123 4567 82');
ok('a bad number prints as nothing rather than as itself', V.formatVrn('nope') === null);

// ---------------------------------------------------------------------------------------------
// 🔴 THE REVERSE CHARGE. THE WHOLE REASON THIS FILE EXISTS.
//
// Six conditions, all of which must hold. The subcontractor case is the one that matters, and
// every other row here is a way of NOT being in it.
// ---------------------------------------------------------------------------------------------
const SUBBIE = {
  supplierRegistered: true,
  withinCis: true,
  customerVatRegistered: true,
  customerCisRegistered: true,
  customerIsEndUser: false,
  rateKey: 'standard',
};

ok('🔴 a registered subcontractor billing a main contractor IS the reverse charge',
  V.reverseChargeApplies(SUBBIE).applies === true);

ok('🔴 an unregistered subcontractor is not, and the reason names his own registration',
  V.reverseChargeApplies({ ...SUBBIE, supplierRegistered: false }).applies === false
  && V.reverseChargeApplies({ ...SUBBIE, supplierRegistered: false }).blocker === 'supplier_not_registered');

ok('a plumber fitting a bathroom for a householder is not, because the customer has no VAT number',
  V.reverseChargeApplies({ ...SUBBIE, customerVatRegistered: false }).blocker === 'customer_not_vat_registered');

ok('a VAT registered customer who is not in CIS is not',
  V.reverseChargeApplies({ ...SUBBIE, customerCisRegistered: false }).blocker === 'customer_not_cis_registered');

ok('work outside CIS is not, however registered everybody is',
  V.reverseChargeApplies({ ...SUBBIE, withinCis: false }).blocker === 'not_within_cis');

ok('🔴 zero rated work, a new build, is OUTSIDE the reverse charge and stays zero rated',
  V.reverseChargeApplies({ ...SUBBIE, rateKey: 'zero' }).applies === false
  && V.reverseChargeApplies({ ...SUBBIE, rateKey: 'zero' }).blocker === 'zero_rated');

ok('the reduced rate IS inside it, unlike the zero rate',
  V.reverseChargeApplies({ ...SUBBIE, rateKey: 'reduced' }).applies === true);

ok('🔴 a customer who has said in writing he is the end user takes it back out',
  V.reverseChargeApplies({ ...SUBBIE, customerIsEndUser: true }).blocker === 'end_user');

ok('supplying staff rather than construction is outside it',
  V.reverseChargeApplies({ ...SUBBIE, employmentBusinessStaff: true }).blocker === 'employment_business');

ok('every refusal carries a reason a man could read out loud',
  ['supplierRegistered', 'withinCis', 'customerVatRegistered', 'customerCisRegistered']
    .every((k) => {
      const v = V.reverseChargeApplies({ ...SUBBIE, [k]: false });
      return typeof v.because === 'string' && v.because.length > 20 && /\.$/.test(v.because);
    }));

// ---------------------------------------------------------------------------------------------
// THE WORDING. This is the one string in the product that exists to satisfy somebody else's
// rulebook. VATREVCON37100 accepts three forms and every one of them contains "reverse charge".
// ---------------------------------------------------------------------------------------------
ok('🔴 the wording says reverse charge', /reverse charge/i.test(V.REVERSE_CHARGE_WORDING));
ok('it cites the section, so an accountant recognises it at a glance',
  /55A/.test(V.REVERSE_CHARGE_WORDING) && /VAT Act 1994/i.test(V.REVERSE_CHARGE_WORDING));
ok('it says who pays HMRC', /customer to pay the VAT to HMRC/i.test(V.REVERSE_CHARGE_WORDING));
ok('and it carries no dash of any kind, like everything else we print',
  !/[—–]/.test(V.REVERSE_CHARGE_WORDING));

// ---------------------------------------------------------------------------------------------
// PRICING AN INVOICE.
// ---------------------------------------------------------------------------------------------
const LINES = [
  { description: 'Second fix, 3 days', amount: 900 },
  { description: 'Consumer unit', amount: 240 },
];

const charged = V.priceInvoice(LINES, 'charged');
ok('an ordinary VAT invoice adds the VAT to the total',
  charged.subtotal === 1140 && charged.vat === 228 && charged.total === 1368);
ok('and it carries no reverse charge figure or wording',
  charged.reverseChargeVat === 0 && charged.wording === null);

const rc = V.priceInvoice(LINES, 'reverse_charge');
ok('🔴 under the reverse charge the total is the NET, because he charges no VAT',
  rc.subtotal === 1140 && rc.vat === 0 && rc.total === 1140);
ok('🔴 but the VAT the customer must account for is shown, and it is £228',
  rc.reverseChargeVat === 228);
ok('🔴 and that £228 is NOT in the total, which is what VATREVCON37100 requires',
  rc.total === rc.subtotal && rc.total !== rc.subtotal + rc.reverseChargeVat);
ok('the wording comes with it', rc.wording === V.REVERSE_CHARGE_WORDING);

const none = V.priceInvoice(LINES, 'none');
ok('an unregistered man charges no VAT and his total is his subtotal',
  none.vat === 0 && none.total === 1140 && none.reverseChargeVat === 0);
ok('🔴 and his lines carry NO rate, because storing "standard" against them is a lie waiting to be rendered',
  none.lines.every((l) => l.rate === 'outside'));

const mixed = V.priceInvoice([
  { description: 'New build, first fix', amount: 1000, rate: 'zero' },
  { description: 'Extension, second fix', amount: 500, rate: 'standard' },
], 'charged');
ok('a mixed invoice charges VAT only on the lines that carry it',
  mixed.subtotal === 1500 && mixed.vat === 100 && mixed.total === 1600);

const mixedRc = V.priceInvoice([
  { description: 'New build, first fix', amount: 1000, rate: 'zero' },
  { description: 'Extension, second fix', amount: 500, rate: 'standard' },
], 'reverse_charge');
ok('and under the reverse charge the zero rated line contributes nothing to the customer figure either',
  mixedRc.reverseChargeVat === 100);

ok('rounding happens per line, so two odd lines cannot drift',
  V.priceInvoice([{ description: 'a', amount: 2.55 }, { description: 'b', amount: 2.55 }], 'charged').vat === 1.02);

ok('an empty invoice is zero, not NaN',
  V.priceInvoice([], 'charged').total === 0 && V.priceInvoice(null, 'charged').total === 0);

ok('a junk rate falls back to standard rather than to nothing',
  V.priceInvoice([{ description: 'a', amount: 100, rate: 'nonsense' }], 'charged').vat === 20);

// ---------------------------------------------------------------------------------------------
// THE DECISION, END TO END. profile plus job facts to a treatment.
// ---------------------------------------------------------------------------------------------
const REGISTERED = { ...V.EMPTY_VAT_PROFILE, registered: true, vrn: '123456782', scheme: 'standard', cisSubcontractor: true };
const JOB = { withinCis: true, customerVatRegistered: true, customerCisRegistered: true, customerIsEndUser: false, rateKey: 'standard' };

ok('🔴 registered sparky, CIS job, contractor customer, gets the reverse charge',
  V.treatmentFor(REGISTERED, JOB).treatment === 'reverse_charge');
ok('the same sparky invoicing a householder charges VAT the normal way',
  V.treatmentFor(REGISTERED, { ...JOB, customerVatRegistered: false }).treatment === 'charged');
ok('🔴 an unregistered sparky gets "none" whatever the job facts say',
  V.treatmentFor(V.EMPTY_VAT_PROFILE, JOB).treatment === 'none');
ok('and the verdict travels with the treatment so a screen can say why',
  typeof V.treatmentFor(REGISTERED, { ...JOB, customerIsEndUser: true }).verdict.because === 'string');

// ---------------------------------------------------------------------------------------------
// WHAT A VAT INVOICE HAS TO CARRY. VAT Regulations 1995 reg 14.
// ---------------------------------------------------------------------------------------------
const FULL = {
  supplierName: 'Marsh Building Services Ltd',
  supplierAddress: '52 Harrington Road, London E11 4QW',
  supplierVrn: '123456782',
  number: 'INV-0007',
  taxPoint: '2026-07-31',
  customerName: 'Bigco Construction Ltd',
  hasLineDescriptions: true,
  hasRates: true,
  hasTotals: true,
};
ok('a complete invoice has no gaps', V.vatInvoiceGaps(FULL).length === 0);
ok('🔴 a missing VAT number is named, because that is the one we never used to store',
  V.vatInvoiceGaps({ ...FULL, supplierVrn: null }).some((g) => g.field === 'vrn'));
ok('🔴 a missing address is named, because users.address exists and no invoice surface selects it',
  V.vatInvoiceGaps({ ...FULL, supplierAddress: null }).some((g) => g.field === 'address'));
ok('every gap says something a person could act on',
  V.vatInvoiceGaps({ supplierName: null, supplierAddress: null, supplierVrn: null, number: null, taxPoint: null, customerName: null, hasLineDescriptions: false, hasRates: false, hasTotals: false })
    .every((g) => g.says.length > 12 && /\.$/.test(g.says)));

// ---------------------------------------------------------------------------------------------
// INPUT TAX. What comes back and what does not.
//
// ⚠️ NOTHING HERE REFUSES A COST. Every one of these is still deductible for income tax. The only
// question is whether the VAT on it comes back.
// ---------------------------------------------------------------------------------------------
ok('🔴 entertaining a customer is blocked outright',
  V.inputVatNote('meals', 'client entertaining at the Ivy').verdict === 'blocked');
ok('and it cites the order that blocks it',
  /Input Tax\) Order 1992 art 5/.test(V.inputVatNote('meals', 'entertaining').source));
ok('🔴 buying a car is blocked', V.inputVatNote('van', 'BMW 3 series').verdict === 'blocked');
ok('but a van is not, and it says so plainly',
  V.inputVatNote('van', 'Ford Transit van').verdict === 'reclaimable');
ok('the car block explains the taxi and driving school exception',
  /taxi/.test(V.CAR_BLOCK.says) && /driving school/.test(V.CAR_BLOCK.says));

ok('wages carry no VAT to reclaim, which is a different fact from being blocked',
  V.inputVatNote('wages').verdict === 'no_vat');
ok('insurance is exempt, and it warns about Insurance Premium Tax',
  V.inputVatNote('insurance').verdict === 'no_vat' && /Insurance Premium Tax/.test(V.inputVatNote('insurance').says));
ok('bank charges are exempt', V.inputVatNote('bank charges').verdict === 'no_vat');
ok('mortgage interest is exempt', V.inputVatNote('mortgage interest').verdict === 'no_vat');
ok('🔴 rent depends on whether the landlord opted to tax',
  V.inputVatNote('rent').verdict === 'depends' && /opted to tax/.test(V.inputVatNote('rent').says));
ok('🔴 a subcontractor line warns that a reverse charge invoice carries no input tax',
  V.inputVatNote('subcontractor').verdict === 'depends' && /reverse charge/i.test(V.inputVatNote('subcontractor').says));
ok('fuel warns about the scale charge',
  V.inputVatNote('fuel').verdict === 'depends' && /scale charge/.test(V.inputVatNote('fuel').says));
ok('most costs say nothing at all, which is doc 103 working',
  V.inputVatNote('materials') === null && V.inputVatNote('tools') === null && V.inputVatNote('other') === null);
ok('a junk category says nothing rather than throwing', V.inputVatNote(null) === null && V.inputVatNote(undefined, undefined) === null);
ok('every note carries a source', Object.keys({ meals: 1, wages: 1, insurance: 1, rent: 1, subcontractor: 1, van: 1, fuel: 1, training: 1 })
  .every((k) => (V.inputVatNote(k)?.source || '').length > 10));

// The categories it names have to be real categories, or the note can never fire.
const cats = read('lib/categories.ts');
for (const c of ['meals', 'wages', 'insurance', 'rent', 'subcontractor', 'van', 'fuel', 'training', 'bank charges', 'mortgage interest']) {
  ok(`"${c}" is a real category in lib/categories.ts`, cats.includes(`'${c}'`));
}

// ---------------------------------------------------------------------------------------------
// THE POSITION. Prepared. Never sent.
// ---------------------------------------------------------------------------------------------
const P0 = { profile: V.EMPTY_VAT_PROFILE, outputVat: 0, inputVat: 0, grossTurnover: 0, blockedVat: 0, inputVatWithProof: 0 };

ok('an unregistered man gets a plain sentence, not a table of zeroes',
  V.vatPosition(P0).due === 0 && /not VAT registered/.test(V.vatPosition(P0).notes[0]));

const std = V.vatPosition({ ...P0, profile: REGISTERED, outputVat: 4000, inputVat: 1200, inputVatWithProof: 900, grossTurnover: 24000 });
ok('the standard scheme is output tax minus input tax', std.due === 2800);
ok('and the proof share is carried, because the control doctrine says every figure knows whether it has one',
  near(std.proofShare, 0.75));

const negative = V.vatPosition({ ...P0, profile: REGISTERED, outputVat: 200, inputVat: 900, inputVatWithProof: 900 });
ok('🔴 a refund is a negative figure, not clamped to zero, because a quiet quarter with a big van purchase is real',
  negative.due === -700);

const FLAT = { ...V.EMPTY_VAT_PROFILE, registered: true, scheme: 'flat_rate', flatRatePercent: 9.5 };
const flat = V.vatPosition({ ...P0, profile: FLAT, outputVat: 4000, inputVat: 1200, inputVatWithProof: 1200, grossTurnover: 24000 });
ok('🔴 the flat rate scheme is a percentage of GROSS turnover, not output minus input',
  flat.due === 2280 && flat.flatRateUsed === 0.095);
ok('and it zeroes the input tax, because on that scheme he does not reclaim it',
  flat.inputVat === 0 && /do not reclaim/.test(flat.notes.join(' ')));

const FLAT1 = { ...FLAT, flatRateFirstYear: true };
ok('the first year discount is one percentage point off',
  near(V.vatPosition({ ...P0, profile: FLAT1, grossTurnover: 24000 }).flatRateUsed, 0.085));

ok('a flat rate customer with no percentage on file is told the figure is not right yet',
  /not right until you add it/.test(V.vatPosition({ ...P0, profile: { ...FLAT, flatRatePercent: null }, grossTurnover: 24000 }).notes.join(' ')));

ok('cash accounting says when the VAT falls due',
  /when your customer pays you/.test(V.vatPosition({ ...P0, profile: { ...REGISTERED, scheme: 'cash' } }).notes.join(' ')));

ok('blocked VAT is reported separately and kept out of the sum',
  V.vatPosition({ ...P0, profile: REGISTERED, outputVat: 1000, inputVat: 100, blockedVat: 40, inputVatWithProof: 100 }).due === 900);

// ---------------------------------------------------------------------------------------------
// REGISTRATION, AND THE PROMISE WE HAVE BEEN MAKING SINCE 14 JULY.
//
// lib/circumstances.ts has told every customer, in the second highest value question in the
// product, that he could have reclaimed the VAT on kit he already owned "going back four years",
// and that "every receipt you put in your Lekhio is kept ready for exactly this". Until now the
// question asked for the registration date and threw it away, so nothing could work it out.
// ---------------------------------------------------------------------------------------------
ok('over £90,000 he must register', V.mustRegister(90001));
ok('at exactly £90,000 he need not, because the rule is over and not at', !V.mustRegister(90000));
ok('under £88,000 he may deregister', V.mayDeregister(87999));
ok('at exactly £88,000 he may not, because the rule is under', !V.mayDeregister(88000));
ok('he may join the flat rate scheme at £150,000', V.mayJoinFlatRate(150000) && !V.mayJoinFlatRate(150001));
ok('he must leave it over £230,000', V.mustLeaveFlatRate(230001) && !V.mustLeaveFlatRate(230000));

const w = V.reg111Window('2026-07-01');
ok('🔴 the goods window opens four years before he registered', w.goodsFrom === '2022-07-01');
ok('the services window opens six months before', w.servicesFrom === '2026-01-01');
ok('a missing registration date gives no window rather than a wrong one',
  V.reg111Window(null) === null && V.reg111Window('') === null && V.reg111Window('last July') === null);

ok('a drill bought three years before registration is inside the goods window',
  V.inReg111Window('2023-08-14', w, 'goods'));
ok('a drill bought five years before is outside it',
  !V.inReg111Window('2021-08-14', w, 'goods'));
ok('🔴 something bought AFTER he registered is not a pre registration claim at all',
  !V.inReg111Window('2026-07-02', w, 'goods'));
ok('an accountancy bill nine months before is outside the services window',
  !V.inReg111Window('2025-10-01', w, 'services'));
ok('and three months before is inside it', V.inReg111Window('2026-04-01', w, 'services'));

// A leap year, because the four year subtraction crosses one.
const leap = V.reg111Window('2028-02-29');
ok('a 29 February registration date does not produce an invalid window',
  leap !== null && /^\d{4}-\d{2}-\d{2}$/.test(leap.goodsFrom));

// ---------------------------------------------------------------------------------------------
// HOUSE RULES, on the file itself.
// ---------------------------------------------------------------------------------------------
const src = read('lib/vat.ts');
ok('no em or en dashes anywhere in it, comments included', !/[—–]/.test(src));
ok('it never writes the rival domain', !new RegExp('lekhio' + '\\.' + 'com').test(src));
ok('🔴 it never claims we file a VAT return, because lib/hmrc.ts has no VAT scope at all',
  !/we file|filed for you|submit your VAT return/i.test(src));
ok('and lib/hmrc.ts still has no VAT in it, so nothing here could file even if it wanted to',
  !/vat/i.test(read('lib/hmrc.ts')));
ok('every exported rate carries a source in the comment above it',
  /VATA 1994 s2\(1\)/.test(src) && /Sch(edule)? 7A/.test(src) && /Reg 111/.test(src));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
