// Tests for lib/incomeproof.ts, the branded income summary. Pure, no network.
//   node test/incomeproof.test.mjs
// It imports the canonical taxengine, so we stage and rewrite the relative import.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'ip-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
writeFileSync(path.join(stage, 'incomeproof.ts'), fix(readFileSync(path.join(lib, 'incomeproof.ts'), 'utf8')));
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const TE = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const now = new Date('2026-12-01T00:00:00Z');

console.log('\n=== incomeproof: the maths ===\n');
const txns = [
  { amount: 20000, transaction_date: '2026-05-10' },
  { amount: 8400, transaction_date: '2026-08-10' },
  { amount: -6000, transaction_date: '2026-06-01' },
  { amount: -3140, transaction_date: '2026-09-01' },
];
const p = IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now);
ok('income sums the positives', p.income === 28400);
ok('expenses sum the negatives as positive', p.expenses === 9140);
ok('profit is income minus expenses', p.profit === 19260);
ok('estimated tax matches the canonical engine', p.estimatedTax === TE.soleTraderTax(19260).total);
ok('estimated tax is positive on a real profit', p.estimatedTax > 0);
ok('tax year label is 2026-27', p.taxYear === '2026-27');
ok('period label spans the tax year', /6 April 2026/.test(p.periodLabel) && /5 April 2027/.test(p.periodLabel));
ok('business name carried through', p.businessName === 'A. Sparky Ltd');
ok('entry count is kept', p.txCount === 4);

console.log('\n=== incomeproof: empty and defaults ===\n');
const empty = IP.buildIncomeProof([], '', 2026, now);
ok('no entries means zero everything', empty.income === 0 && empty.expenses === 0 && empty.profit === 0 && empty.estimatedTax === 0);
ok('blank business name falls back', empty.businessName === 'Your business');
ok('label helper works standalone', IP.taxYearLabel(2027) === '2027-28');

console.log('\n=== incomeproof: the document ===\n');
const html = IP.renderIncomeProofHtml(p);
ok('is a full html document', /<!doctype html>/i.test(html) && /<\/html>/i.test(html));
ok('shows the business name', html.includes('A. Sparky Ltd'));
ok('shows the net profit figure', html.includes('£19,260.00'));
ok('has a Save as PDF control', /Save as PDF/.test(html) && /window\.print\(\)/.test(html));
ok('is honest: not an SA302 or a filed return', /SA302/.test(html) && /not a filed tax return|not an HMRC document/i.test(html));
ok('carries a prepared by Lekhio stamp', /Prepared by Lekhio/.test(html));
ok('is noindex', /noindex/.test(html));
ok('document has no em/en/minus dashes', !/[–—−]/.test(html));

console.log('\n=== incomeproof: WHOSE FIGURES ARE THESE ===\n');

// \ud83d\udd34 3 AUGUST 2026. THIS DOCUMENT HANDED A PARTNER THE WHOLE FIRM'S INCOME AS HIS OWN.
//
// Found by setting a live account to "Me and somebody else" at 50%: /app/tax said "These figures
// are your 50% share of the firm's books", and this sheet, headed "for income verification", over
// our name, showed the firm's whole gross and whole net profit with no share applied and nothing
// saying so. At 50% it DOUBLED him, to a mortgage broker.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const base = IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now);

ok('\ud83d\udd34 UNKNOWN IS NEVER AN ANSWER: no structure, null, or an unknown type is the old proof',
  same(IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now, null), base)
  && same(IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now, { type: null }), base));
ok('a known sole trader is the old proof too, to the penny',
  same(IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now, { type: 'sole_trader' }), base));

const half = IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now, { type: 'partnership', sharePercent: 50 });
ok('\ud83d\udd34 A 50% PARTNER GETS HALF THE INCOME, not the firm\'s',
  half.income === 14200 && half.expenses === 4570 && half.profit === 9630);
// \ud83d\udd34 AND THE TAX IS THE TAX *OF* HIS SHARE, NEVER THE FIRM'S BILL HALVED.
//
// The first draft of this assertion said `half.estimatedTax > 0` and FAILED, and the code was
// right. The firm's profit is 19,260 pounds; half of it is 9,630, which is under the personal
// allowance, so a 50% partner here owes nothing at all. A halved bill would have shown him 869
// pounds. The allowance does not halve with the share, which is the whole reason the slice has to
// be taken BEFORE the tax rather than after it.
ok('\ud83d\udd34 HALF A PROFIT IS NOT HALF A BILL: under the allowance, his share owes nothing',
  base.estimatedTax > 0 && half.estimatedTax === 0);

// The same point where there IS tax to pay, so the assertion above cannot pass by both being zero.
const bigTxns = [
  { amount: 120000, transaction_date: '2026-05-10' },
  { amount: -20000, transaction_date: '2026-06-01' },
];
const bigFull = IP.buildIncomeProof(bigTxns, 'X', 2026, now);
const bigHalf = IP.buildIncomeProof(bigTxns, 'X', 2026, now, { type: 'partnership', sharePercent: 50 });
ok('\ud83d\udd34 A 50% PARTNER ON A REAL BILL PAYS LESS THAN HALF THE FIRM\'S, because the rates step',
  bigHalf.profit === 50000 && bigFull.profit === 100000
  && bigHalf.estimatedTax > 0 && bigHalf.estimatedTax < bigFull.estimatedTax / 2);
ok('\ud83d\udd34 AND THE SHEET SAYS SO, in a sentence a lender cannot skim past',
  /50% of the firm/.test(half.shareNote) && /share of the partnership/.test(half.shareNote));
ok('...a sole trader is told nothing about a share he does not have', base.shareNote === null);
ok('a share of 100 is a full share and still says so, because he told us he shares a business',
  IP.buildIncomeProof(txns, 'X', 2026, now, { type: 'partnership', sharePercent: 100 }).income === 28400);
ok('\u26a0\ufe0f A MISSING, ZERO OR ABSURD SHARE FALLS BACK TO THE WHOLE, never to nothing',
  IP.buildIncomeProof(txns, 'X', 2026, now, { type: 'partnership' }).income === 28400
  && IP.buildIncomeProof(txns, 'X', 2026, now, { type: 'partnership', sharePercent: 0 }).income === 28400
  && IP.buildIncomeProof(txns, 'X', 2026, now, { type: 'partnership', sharePercent: 900 }).income === 28400);

const ltd = IP.buildIncomeProof(txns, 'A. Sparky Ltd', 2026, now, { type: 'limited_company' });
ok('\ud83d\udd34 A DIRECTOR IS OFFERED NO PERSONAL TAX ESTIMATE ON HIS COMPANY\'S PROFIT',
  ltd.estimatedTax === 0 && ltd.nationalInsurance === 0 && ltd.companyExcluded === true);
ok('...his money itself is untouched: the figures a lender asked for are all still there',
  ltd.income === 28400 && ltd.expenses === 9140 && ltd.profit === 19260);

const halfHtml = IP.renderIncomeProofHtml(half);
ok('\ud83d\udd34 THE PRINTED SHEET CARRIES THE SHARE SENTENCE, or the screen and the paper disagree',
  /50% of the firm/.test(halfHtml));
ok('...and it prints his half, never the firm\'s whole', /£9,630\.00/.test(halfHtml) && !/£19,260\.00/.test(halfHtml));
const ltdHtml = IP.renderIncomeProofHtml(ltd);
ok('\ud83d\udd34 AND THE DIRECTOR\'S SHEET NAMES NO TAX HE DOES NOT OWE',
  !/Estimated Income Tax/.test(ltdHtml) && /not this person's personal income/.test(ltdHtml));
ok('no em, en or minus dash reached either of the new sentences',
  !/[\u2013\u2014\u2212]/.test(halfHtml) && !/[\u2013\u2014\u2212]/.test(ltdHtml));

console.log('\n=== incomeproof: A CAPITAL CAR NEVER FLOWS INTO ALLOWABLE EXPENSES ===\n');

// 🔴 THE LIVE DEFECT, Vasey Electrical, 2026/27. This page summed every money out row into
// expenses, a £60,000 capital car included, and drove net profit to a floored £0 and estimated tax
// to £0 on a document handed to a mortgage lender, while /app/tax/summary read In £33,580, Out
// £12,088, profit £21,492 off the same books. A car is not an allowable expense in the year: GOV.UK,
// business cars, "Cars do not qualify for: annual investment allowance (AIA)". writtenDown arrives
// already decided from lib/supabase.ts, which asks lib/capital.ts, the same way the quarter pack does.
const vasey = [
  { amount: 33580, transaction_date: '2026-05-10' },
  { amount: -12088, transaction_date: '2026-06-01' },
  { amount: -60000, transaction_date: '2026-06-20', writtenDown: true },
];
const vp = IP.buildIncomeProof(vasey, 'Vasey Electrical', 2026, now);
ok('🔴 the £60,000 car is NOT in allowable expenses', vp.expenses === 12088);
ok('🔴 net profit is the trade profit, never a floored zero', vp.profit === 21492 && vp.tradeProfit === 21492);
ok('🔴 estimated tax is on the real profit, not zero', vp.estimatedTax === TE.soleTraderTax(21492).total && vp.estimatedTax > 0);
ok('the capital car is reported apart, not silently dropped', vp.capitalCost === 60000 && vp.capitalCount === 1);

const vhtml = IP.renderIncomeProofHtml(vp);
ok('the printed sheet shows the real net profit', vhtml.includes('£21,492.00'));
ok('the printed sheet never states the £72,088 car inclusive expense', !vhtml.includes('£72,088'));
ok('the printed sheet names where the £60,000 went', vhtml.includes('£60,000.00') && /not an allowable expense/.test(vhtml));
ok('no em, en or minus dash reached the capital sentence', !/[–—−]/.test(vhtml));

// A row with no writtenDown flag is still an ordinary cost, so nothing written before anybody was
// asked moves: the old arithmetic is preserved to the penny for an unflagged row.
const vaseyFlat = vasey.map((r) => ({ ...r, writtenDown: undefined }));
const vpFlat = IP.buildIncomeProof(vaseyFlat, 'Vasey Electrical', 2026, now);
ok('undefined writtenDown reads as an ordinary cost, identical to before', vpFlat.expenses === 72088 && vpFlat.capitalCost === 0 && vpFlat.profit === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
