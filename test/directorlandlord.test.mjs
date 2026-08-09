// THE DIRECTOR WHO ALSO LETS A FLAT, ON THE ONE PAGE A STRANGER LENDS AGAINST.
//
//   node test/directorlandlord.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND 9 AUGUST 2026.
//
// buildIncomeProof gated EVERY personal rate on isCompany, which was right for a company's trading
// profit and wrong for the man who also owns a flat. His rent is his own income, on his own return,
// taxable whatever his trade happens to be wrapped in. The document already folded it into `income`
// and `profit`, printed it in his totals, and then:
//
//   1. 🔴 SHOWED NO PERSONAL TAX ON IT. estimatedTax was hard zero for every director, so a page
//      showing £24,000 of rent said the tax on it was nothing.
//
//   2. 🔴 AND CAPTIONED IT AS THE COMPANY'S. "These are the company's figures, not this person's
//      personal income", written out as a LITERAL in two places, sitting under a total containing
//      his personal rent. A mortgage broker read that page and was told, over our name, that the
//      director's rental income belonged to his company.
//
// ⚠️ AND THE PARTNERSHIP CASE HAD ALREADY BEEN DECIDED THE OTHER WAY. shareNote has said since 3
// August: "The property figures are their own, in full: rent is personal income, not the firm's."
// A firm and a company are different things and the reasoning is word for word the same. The
// company arm was simply never walked.
//
// 🔴 SO THIS RATCHET GUARDS FIVE FAILURES.
//
//   1. THE DIRECTOR WITH NO RENT CHANGES AT ALL. He is the common case, his figures really are
//      entirely the company's, and every one of them must be what it was to the penny.
//   2. THE COMPANY'S TRADE PROFIT PICKS UP PERSONAL TAX. That was the original sin this whole
//      area was built to end, and widening the personal base is exactly how it would come back.
//   3. CLASS 4 APPEARS ON RENT. SSCBA 1992 s15 charges the profits of a TRADE. Letting is not one.
//   4. THE SENTENCE GOES BACK TO BEING A LITERAL. It was a literal in two files, which is how the
//      two of them said the same wrong thing.
//   5. A SURFACE STOPS DRAWING THE FIGURE, or draws it for the man who has no personal position.
//      The row, the caption and the Scotland caveat all follow one field.
//
// ⚠️ THE ARITHMETIC IS SWEPT ELSEWHERE. test/lenderdirector.test.mjs runs sixty seeded company
// accounts and, for each, rebuilds the SAME document from the rent row alone and demands the two
// personal figures agree, so any leak of turnover into a director's personal estimate is caught
// there against every band. This file owns the shape, the words and the surfaces.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'directorlandlord-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};
stageModule('incomeproof');
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);

const proofSrc = src('lib/incomeproof.ts');
const pageSrc = src('app/app/proof-of-income/page.tsx');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── Three men, one document. ─────────────────────────────────────────────────────────────────
const rows = (rent) => {
  const r = [
    { amount: 90000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
    { amount: -20000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
  ];
  if (rent) r.push({ amount: rent, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' });
  return r;
};
const build = (rent, type) =>
  IP.buildIncomeProof(rows(rent), 'A. Sparky Ltd', 2026, new Date('2027-04-05'), { type });

const plainDirector = build(0, 'limited_company');
const landlordDirector = build(24000, 'limited_company');
const soleTrader = build(24000, 'sole_trader');

ok('🔴 THE BUILDER RAN FOR ALL THREE, without which nothing below means anything',
  plainDirector !== null && landlordDirector !== null && soleTrader !== null
  && typeof IP.renderIncomeProofHtml === 'function');

// ── 1. The common director is untouched. ─────────────────────────────────────────────────────
ok('🔴 A DIRECTOR WITH NO RENT IS EXACTLY WHAT HE WAS: no personal tax, no National Insurance',
  plainDirector.estimatedTax === 0 && plainDirector.nationalInsurance === 0);
ok('and his page still offers no personal estimate at all',
  plainDirector.personalTaxShown === false && plainDirector.companyExcluded === true);
ok('🔴 AND HIS CAPTION IS THE ONE HE ALWAYS READ, to the character',
  plainDirector.companyNote === "These are the company's figures, not this person's personal income. A company pays Corporation Tax on its own return, and the director is paid in salary and dividends, which are not shown here.");

// ── 2. The director who also lets a flat. ────────────────────────────────────────────────────
ok('🔴 HIS RENT IS TAXED, because it is his own income on his own return',
  landlordDirector.estimatedTax > 0);
ok('🔴 AND IT IS TAXED ON THE RENT ALONE: the personal allowance and the basic rate, and nothing else',
  landlordDirector.propertyProfit === 23000
  && landlordDirector.estimatedTax === 2086);
// 🔴 THE INVARIANT, STATED AS AN EXPERIMENT RATHER THAN AS A BOUND. Quadruple the company's
// turnover, leave the rent alone, and his personal tax MUST NOT MOVE. A bound like "less than two
// percent of the trade profit" would pass on a formula that had quietly folded a slice of the
// company in; this cannot.
const richerCompany = IP.buildIncomeProof(
  [
    { amount: 400000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
    { amount: -20000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
    { amount: 24000, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' },
  ],
  'A. Sparky Ltd', 2026, new Date('2027-04-05'), { type: 'limited_company' },
);
ok('🔴 NOT ONE PENNY OF THE COMPANY\'S TRADE IS IN IT: quadruple the turnover, his tax does not move',
  landlordDirector.tradeProfit === 70000
  && richerCompany.tradeProfit === 380000
  && richerCompany.estimatedTax === landlordDirector.estimatedTax
  && richerCompany.nationalInsurance === 0);
ok('🔴 NO CLASS 4 ON RENT: SSCBA 1992 s15 charges the profits of a trade, and letting is not one',
  landlordDirector.nationalInsurance === 0
  && landlordDirector.estimatedTaxLabel === 'Estimated Income Tax');
ok('and his page does offer an estimate, unlike the plain director\'s',
  landlordDirector.personalTaxShown === true && landlordDirector.companyExcluded === true);

// The caption, which is the half a broker actually reads.
const note = landlordDirector.companyNote ?? '';
ok('🔴 THE CAPTION NO LONGER HANDS HIS RENT TO HIS COMPANY',
  !/^These are the company's figures/.test(note));
ok('🔴 IT NAMES THE TRADE AS THE COMPANY\'S and the rent as his own',
  /trade figures are the company's/.test(note)
  && /this person's own income on their own return/.test(note));
ok('and it says what the estimate below actually covers, so the figure is not read as the whole',
  /estimated tax below is on the rent alone/.test(note));
ok('no forbidden dashes in either caption',
  !/[–—]/.test(note) && !/[–—]/.test(plainDirector.companyNote ?? ''));

// ── 3. The sole trader is untouched, which is most customers. ────────────────────────────────
ok('🔴 A SOLE TRADER IS IDENTICAL: same profit, Class 4 present, no company caption',
  soleTrader.tradeProfit === 70000 && soleTrader.propertyProfit === 23000
  && soleTrader.nationalInsurance > 0
  && soleTrader.companyNote === null
  && soleTrader.companyExcluded === false
  && soleTrader.personalTaxShown === true);
ok('and he is taxed on both streams together, which is the whole difference from the director',
  soleTrader.estimatedTax > landlordDirector.estimatedTax * 5);

// ── 4. The printed document follows the field, not a literal. ────────────────────────────────
const htmlPlain = IP.renderIncomeProofHtml(plainDirector);
const htmlLandlord = IP.renderIncomeProofHtml(landlordDirector);
ok('both documents rendered, so the assertions below are about real markup',
  htmlPlain.length > 500 && htmlLandlord.length > 500);
ok('🔴 THE PLAIN DIRECTOR\'S PAGE CARRIES NO ESTIMATED TAX ROW AND NO RATES CAVEAT',
  !/Estimated Income Tax/.test(htmlPlain) && !/England, Wales/.test(htmlPlain));
ok('🔴 AND THE LANDLORD DIRECTOR\'S CARRIES BOTH, because there is a figure for them to be about',
  /Estimated Income Tax/.test(htmlLandlord) && /England, Wales/.test(htmlLandlord));
ok('the landlord director\'s caption is on the printed page, in his own words',
  /trade figures are the company&#39;s|trade figures are the company's/.test(htmlLandlord));
ok('🔴 NO SURFACE KEEPS ITS OWN COPY OF THE SENTENCE ANY MORE',
  !/`<div class="whose">These are the company/.test(proofSrc)
  && !/These are the company&apos;s figures/.test(pageSrc));
ok('both surfaces read the one field instead',
  /\$\{p\.companyNote \? `<div class="whose">\$\{esc\(p\.companyNote\)\}<\/div>` : ''\}/.test(proofSrc)
  && /\{proof\.companyNote \? <p style=\{S\.shareNote\}>\{proof\.companyNote\}<\/p> : null\}/.test(pageSrc));

// ── 5. The three surfaces gate on the one field. ─────────────────────────────────────────────
ok('🔴 THE ROW, THE CAVEAT AND THE SCREEN ALL FOLLOW personalTaxShown',
  /\$\{p\.personalTaxShown \? row\(p\.estimatedTaxLabel/.test(proofSrc)
  && /\$\{p\.personalTaxShown \? esc\(SCOTLAND_LINE\) : ''\}/.test(proofSrc)
  && /\{proof\.personalTaxShown \? \(/.test(pageSrc)
  && /\{proof\.personalTaxShown \? <>\{' '\}\{SCOTLAND_LINE\}<\/> : null\}/.test(pageSrc));
ok('and the rule itself is decided once, in the builder',
  /personalTaxShown: !isCompany \|\| propertyProfit > 0/.test(proofSrc));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
