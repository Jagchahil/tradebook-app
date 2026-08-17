// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SCOTLAND RATCHET.
//   node test/scotland.test.mjs
//
// Income tax rates and bands above the personal allowance are devolved to the Scottish Parliament.
// lib/taxengine.ts computes at the England, Wales and Northern Ireland figures and holds no
// Scottish bands, so a paying Scottish sole trader is handed a set aside, a quarter pack and a
// lender document worked at rates that are not his.
//
// The decision taken on 8 August 2026 was DISCLOSURE, not arithmetic: no Scottish bands, no new
// rates, no new question in any wizard, no change to the hand written mobile mirror. One sentence,
// defined once in lib/scotland.ts, said on the surfaces where its absence would mislead.
//
// A disclosure with no test rots in two directions and both are bad:
//
//   . SOMEONE ADDS SURFACE N PLUS ONE. A tenth screen starts printing a band derived figure, nobody
//     remembers the sentence, and the product is back to quietly telling a Scot the wrong number.
//     So the list of band derived surfaces is DERIVED FROM THE FILES ON DISK at run time and held
//     BY EQUALITY. A new one fails here until somebody writes down which way it went and why.
//
//   . SOMEONE MODELS SCOTLAND AND THE NOTICE STAYS UP. "Scottish rates are coming to Lekhio" under
//     a figure that already uses them is a worse lie than the one it replaced, because it reads as
//     a caveat and is actually an untruth. So the engine is watched: the day lib/taxengine.ts or
//     the mobile mirror learns a Scottish band, THIS SUITE GOES RED and whoever did it has to
//     delete the line deliberately. That is the ratchet. It is meant to fail one day.
//
// It reads source, never imports it, so it still reports a clean red when lib/scotland.ts is gone
// rather than dying on a module resolution error.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const read = (rel) => { try { return readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const missing = (want, got) => want.filter((x) => !got.includes(x));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SENTENCE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. the sentence, defined once in lib/scotland.ts ===\n');

const SCOTLAND_SRC = read('lib/scotland.ts');
ok('lib/scotland.ts exists', SCOTLAND_SRC.length > 0);

// Pulled off the source rather than imported, so a deleted or renamed constant is a readable red
// line here instead of a stack trace three suites away.
const declared = /export const SCOTLAND_LINE\s*(?::\s*string\s*)?=\s*\n?\s*'([^']*)'/.exec(SCOTLAND_SRC);
ok('it exports SCOTLAND_LINE as a single string literal', Boolean(declared));
const LINE = declared ? declared[1] : '';

ok('the sentence is not empty', LINE.length > 0);
ok('it is ONE sentence, one full stop and it is the last character',
  LINE.split('.').length === 2 && LINE.endsWith('.'));
ok('a man on a ladder can read it, under 140 characters', LINE.length > 0 && LINE.length <= 140);

// WHAT IT MUST SAY.
ok('🔴 it names England, Wales and Northern Ireland',
  /England, Wales and Northern Ireland/.test(LINE));
ok('🔴 it says the figure is INCOME TAX, not tax in general',
  /income tax/i.test(LINE));
ok('🔴 it says Scottish rates are coming', /Scottish rates are coming/i.test(LINE));

// WHAT IT MUST NOT SAY. Each of these is a way an honest caveat turns into a new false claim.
ok('⚠️ it does NOT claim we know where he lives',
  !/\byou(r)? (are|live|address|postcode)\b/i.test(LINE)
  && !/\bwe (see|detect|know|have you)\b/i.test(LINE)
  && !/\bbased on your\b/i.test(LINE));
ok('⚠️ it does NOT promise a date',
  !/\b(20\d\d|January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(LINE)
  && !/\b(soon|shortly|next (month|year|quarter)|by the)\b/i.test(LINE));
ok('⚠️ it does NOT send him somewhere else',
  !/(gov\.scot|gov\.uk|https?:|www\.|\baccountant\b|\bcheck with\b|\bsee HMRC\b|\blook up\b)/i.test(LINE));
ok('⚠️ it does NOT put a number on what Scotland would change', !/[£%]|\d/.test(LINE));
ok('⚠️ it makes no filing or endorsement claim',
  !/\b(we file|files your|approved|accredited|endorsed|official)\b/i.test(LINE));
// House style. The dash rule applies to every outgoing word, and this one goes on a document a
// stranger reads. Hyphens inside a word are fine; a dash used as punctuation is not.
ok('⚠️ house style, no em dash, en dash, minus sign or hyphen used as a dash',
  !/[–—−]/.test(LINE) && !/\s-\s/.test(LINE));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SURFACE LIST, DERIVED FROM DISK, HELD BY EQUALITY.
//
// EQUALITY, NOT SUBSET, IN BOTH DIRECTIONS. A subset check passes forever while surfaces quietly
// go missing, which is the exact failure this whole packet exists to fix.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. exactly these surfaces say it, no more and no fewer ===\n');

// The pure engines. They compute a band derived figure and render nothing, so a sentence in them
// would have no reader. Everything else under app/ and lib/ is walked.
const PURE_ENGINES = new Set([
  'taxengine', 'taxoptimiser', 'personalincome', 'propertyengine', 'ltdengine', 'position',
  'taxyears', 'partnership',
]);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', '.expo', 'dist', 'build', 'out', '_to_delete', '_to_delete_scratch']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e) || e.startsWith('.fuse_hidden')) continue;
    const p = path.join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(path.relative(root, p).split(path.sep).join('/'));
  }
  return out;
}
const sources = [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))].sort();

// Every named import in a file, keyed by the module it came from.
function importsOf(src) {
  const out = [];
  const re = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const from = m[2].split('/').pop();
    for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '').trim();
      if (n) out.push({ name: n, from });
    }
  }
  return out;
}

// WHO ACTUALLY SAYS IT. Imported AND used, so a dead import left behind by a deletion does not
// count as a disclosed surface.
const saysIt = sources.filter((rel) => {
  const src = read(rel);
  if (!importsOf(src).some((i) => i.name === 'SCOTLAND_LINE' && i.from === 'scotland')) return false;
  return (src.match(/SCOTLAND_LINE/g) ?? []).length >= 2;
}).sort();

// ─── THE DECIDED LIST ────────────────────────────────────────────────────────────────────────
// The bar: would a Scottish trader be misled by THIS number if the line were absent. Doc 103 is
// the counterweight, every row is a thing he has to read and reject, so this is not every screen
// that mentions tax. It is the money he banks against, everything that leaves the product on paper
// for a lender or an accountant, and the free tools a stranger meets exactly once.
const DISCLOSED = [
  // The money he moves. Both, because /app/tax is a nav destination in its own right and a man can
  // arrive there from the tab bar or a link without ever loading the Overview.
  'app/app/page.tsx',
  'app/app/tax/page.tsx',
  // The lender screen and the paper it prints. The founder's stop item: a wrong figure on a
  // document a customer hands a broker, read by somebody who cannot ask us what it means.
  'app/app/proof-of-income/page.tsx',
  'lib/incomeproof.ts',
  // The quarter pack. Handed to an accountant, and named as its own harm in the decision.
  'lib/quarterpack.ts',
  // The four free tools. A stranger off a search engine gets one screen, one figure and no account
  // to read a caveat on later. /tax-calculator carried a hand written version of this sentence and
  // its three siblings carried nothing, which is what the shared constant exists to stop.
  'app/cis-calculator/Calc.tsx',
  'app/landlord-tax-calculator/Calc.tsx',
  'app/sole-trader-vs-limited/Calc.tsx',
  'app/tax-calculator/Calc.tsx',
  // What the machines read. Not a screen, so it costs no row, and it is where an assistant turns
  // our rates into an answer for somebody in Aberdeen.
  'app/llms.txt/route.ts',
].sort();

ok(`🔴 EQUALITY: exactly ${DISCLOSED.length} surfaces say it, found ${saysIt.length}`, saysIt.length === DISCLOSED.length);
ok('🔴 EQUALITY: and they are exactly the decided list, none missing, none added',
  same(saysIt, DISCLOSED));
if (!same(saysIt, DISCLOSED)) {
  console.log(`        decided but silent: ${JSON.stringify(missing(DISCLOSED, saysIt))}`);
  console.log(`        says it but undecided: ${JSON.stringify(missing(saysIt, DISCLOSED))}`);
}
for (const rel of DISCLOSED) ok(`  ${rel} exists and says it`, saysIt.includes(rel));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. SURFACE N PLUS ONE CANNOT FORGET.
//
// The band derived surfaces are discovered from the imports on disk, not typed out, and every one
// found must be classified. Add a tenth screen that computes a band derived figure and this fails
// until somebody records the decision. That is the whole point: the next person cannot be unaware
// of the question, only of the answer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. every band derived surface on disk is classified, one way or the other ===\n');

// A call to one of these produces a figure that moves when an income tax band moves. National
// Insurance, VAT, student loan and rent a room figures are UK wide and are deliberately not here.
const PRODUCERS = new Set([
  'soleTraderTax', 'soleTraderTaxForYear', 'incomeTaxOnProfit', 'taxPosition', 'marginalRate',
  'findOptimisations', 'totalEstimatedSaving', 'applyDial', 'combinedIncomeTax', 'computePosition',
  'combinedBill', 'aprilDelta', 'compare', 'buildQuarterPack', 'buildIncomeProof',
]);
const ENGINE_MODULES = new Set([...PURE_ENGINES, 'quarterpack', 'incomeproof']);

const discovered = sources.filter((rel) => {
  const base = rel.split('/').pop().replace(/\.tsx?$/, '');
  if (rel.startsWith('lib/') && PURE_ENGINES.has(base)) return false;
  return importsOf(read(rel)).some((i) => ENGINE_MODULES.has(i.from) && PRODUCERS.has(i.name));
}).sort();

// Everything discovered above that is NOT disclosed, with the reason it is not. A reason nobody can
// read is not a decision, so the text is asserted non empty.
const NOT_DISCLOSED = {
  'app/api/income-proof/route.ts':
    'It serves the document lib/incomeproof.ts renders, and the renderer already prints the sentence. A second copy here is a second thing to keep in step.',
  'app/api/quarter-pack/route.ts':
    'Same as the income proof route. lib/quarterpack.ts prints it into the pack this route serves.',
  'app/api/optimise/route.ts':
    'JSON for the lever list behind /app/tax. It renders no money itself, and the levers are not disclosed on their own screen either, for the reason given under ways-to-save.',
  'app/api/thread/route.ts':
    'The in app chat, which repeats the set aside on demand. The honest treatment is to say it once, not on every answer to a question he asks weekly, and the two screens the thread sits inside carry it.',
  'app/api/whatsapp/route.ts':
    'The same figure on the channel he uses most. Saying it every time he asks what he owes is doc 103 inverted, a caveat read fifty times a year is a caveat he stops reading. Saying it once needs a stored flag, which is a change to lib/supabase.ts. That file is reserved to another lane, so this is reported rather than half done.',
  'lib/agent.ts':
    'The nudges. Same reasoning as the thread and WhatsApp: conversational, repeated, and pointed at a figure the app screens already caveat.',
  'app/app/pay-yourself/plan.ts':
    'It quotes the set aside the Overview and the tax hub already show, one tap behind both.',
  'app/app/tax/cis/page.tsx':
    'A refund position one tap behind /app/tax, which carries the line above the same figure.',
  'app/app/tax/vehicle/page.tsx':
    'A lever priced at a marginal rate, one tap behind /app/tax. It answers what a van would save, not what he owes.',
  'app/app/tax/ways-to-save/page.tsx':
    'The lever list. A caveat under every "about £340" chip is exactly the ten helpful additions that make an unhelpful product, and it is one tap behind /app/tax.',
  'lib/whatif.ts':
    'It computes the what-if figures and renders nothing itself; the page that reads it, /app/tax/what-if, shows a difference between two figures that move together, one tap behind /app/tax, which carries the line. The band producers moved here from the page on 10 August so the what-if reads the same taxPosition every other surface does.',
  'app/app/tax/student-loan/page.tsx':
    'It renders the student loan only. Plans, thresholds and rates are the same across the UK, and Plan 4 is already labelled Scotland on the screen.',
  'app/app/tax/summary/page.tsx':
    'It renders income, expenses, net profit, CIS suffered and the Making Tax Digital threshold. Not one of those is band derived. It reads the pack for the mandation test, never for the tax estimate.',
  'lib/ledger.ts':
    'It computes and renders nothing. The surfaces that read it are each classified here.',
  'lib/prepop.ts':
    'It pre populates a return draft from stored figures. No user facing number of its own.',
  'lib/rakhamoves.ts':
    'Internal move generation. It renders no figure to anybody.',
};

const classified = [...DISCLOSED.filter((f) => discovered.includes(f)), ...Object.keys(NOT_DISCLOSED)].sort();
ok(`🔴 EQUALITY: every band derived surface on disk is classified (${discovered.length} found)`,
  same(discovered, classified));
if (!same(discovered, classified)) {
  console.log(`        found on disk but never decided: ${JSON.stringify(missing(discovered, classified))}`);
  console.log(`        decided but no longer on disk:   ${JSON.stringify(missing(classified, discovered))}`);
}
ok('and every "not disclosed" carries a reason somebody can read',
  Object.values(NOT_DISCLOSED).every((why) => typeof why === 'string' && why.length > 40));
ok('and no surface is on both lists at once',
  DISCLOSED.every((f) => !(f in NOT_DISCLOSED)));

// The two lender artefacts and the pack, named on their own, because they are the founder's stop
// item and a rename must not quietly drop them out of the equality above.
for (const rel of ['app/app/proof-of-income/page.tsx', 'lib/incomeproof.ts', 'lib/quarterpack.ts']) {
  ok(`🔴 STOP ITEM: ${rel} still says it`, saysIt.includes(rel));
}
// And on the document the estimate is the only reason the sentence is there, so it draws with the
// figure. A man with no personal estimate on either artefact must not be handed a caveat about a
// number that is not on the page.
//
// \u26a0\ufe0f THE TEST IS personalTaxShown, NOT companyExcluded, since 9 August 2026. They came
// apart for the director who ALSO LETS A FLAT: his rent is his own income, on his own return, at
// these very rates, so he does get an estimate and he does need the sentence. lib/incomeproof.ts
// decides it once and all three surfaces read the one field.
ok('the printed lender document guards the sentence on there being an estimate at all',
  /personalTaxShown \? esc\(SCOTLAND_LINE\) : ''/.test(read('lib/incomeproof.ts')));
ok('and the lender screen guards it the same way',
  /personalTaxShown \? <>\{' '\}\{SCOTLAND_LINE\}<\/> : null/.test(read('app/app/proof-of-income/page.tsx')));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3b. THE OTHER REPO. THE SAME BAR, APPLIED TO THE PHONE.
//
// 🔴 RUN 7, 17 AUGUST 2026. Everything above this block covered ONE CHECKOUT. Eleven screens in the
// mobile repo import a band derived producer from its hand written mirror lib/tax.ts and NOT ONE
// said anything. The sentence did not exist in that repository at all.
//
// The web decision was already written as a shape rather than as a list of screens, and it was
// still blind here, because a shape is only as wide as the ground it is asked to walk. THE SCOPE OF
// A GUARD IS A PLACE A DEFECT CAN HIDE, and this is the instance that proves it.
//
// Same bar as section 2, quoted from the decision: "would a trader be misled by THIS number if the
// line were absent", which lands it on the money he banks against, and on everything that leaves
// the product for a lender or an accountant. Levers one tap behind a screen that already carries it
// stay quiet, exactly as they do on the web.
//
// ⚠️ TWO SCREENS SHARE A NAME WITH A WEB SCREEN AND HAVE THE OPPOSITE FACTS. Web
// app/app/tax/summary/page.tsx is excused above because it renders nothing band derived, which is
// still true. Mobile app/tax-summary.tsx imports soleTraderTax, planLtd AND setAsideAfterCis.
// Carrying the web reason across by name would be wrong, and this suite would not catch that on
// its own, so it is written down here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3b. the mobile repo says it on exactly the surfaces that need it ===\n');

const MOBILE = path.resolve(root, '..', 'tradebook-app');
const mobileRead = (rel) => { try { return readFileSync(path.join(MOBILE, rel), 'utf8'); } catch { return ''; } };

if (!existsSync(MOBILE)) {
  console.log('  note  ../tradebook-app is not checked out beside this repo, the mobile disclosure block is skipped.');
  console.log('  note  ⚠️ A SKIP IS NOT A PASS. Run 5 lost about 600 assertions to exactly this and did not notice.');
} else {
  // The sentence, mirrored. Two slightly different caveats across two repos is worse than within
  // one, because nobody ever reads them side by side.
  const MOBILE_SRC = mobileRead('lib/scotland.ts');
  ok('🔴 the mobile repo has lib/scotland.ts at all', MOBILE_SRC.length > 0);
  const mDecl = /export const SCOTLAND_LINE\s*(?::\s*string\s*)?=\s*\n?\s*'([^']*)'/.exec(MOBILE_SRC);
  ok('and it exports SCOTLAND_LINE as a single string literal', Boolean(mDecl));
  ok('🔴 BYTE IDENTICAL to the web sentence, no second caveat',
    Boolean(mDecl) && mDecl[1] === LINE);

  // Discovered from disk, never typed: anything importing a band derived producer from the mirror.
  const MOBILE_PRODUCERS = new Set([
    'soleTraderTax', 'planLtd', 'businessTaxOnProfit', 'businessTaxSaved', 'setAsideAfterCis',
    'incomeTaxOnProfit', 'salaryIncomeTax', 'dividendTax', 'corporationTax', 'class4NIC',
  ]);
  const mWalk = [];
  (function collect(dir) {
    let entries; try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e)) continue;
      const p = path.join(dir, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) collect(p);
      else if (/\.(ts|tsx)$/.test(e)) mWalk.push(path.relative(MOBILE, p).split(path.sep).join('/'));
    }
  })(path.join(MOBILE, 'app'));

  const mobileBandDerived = mWalk.filter((rel) =>
    importsOf(mobileRead(rel)).some((i) => i.from === 'tax' && MOBILE_PRODUCERS.has(i.name))).sort();

  const mSaysIt = mobileBandDerived.filter((rel) => {
    const src = mobileRead(rel);
    if (!importsOf(src).some((i) => i.name === 'SCOTLAND_LINE' && i.from === 'scotland')) return false;
    return (src.match(/SCOTLAND_LINE/g) ?? []).length >= 2;
  }).sort();

  // ─── THE DECIDED LIST, PHONE SIDE ──────────────────────────────────────────────────────────
  const M_DISCLOSED = [
    // The tax destination in its own right. A man arrives here from the tab bar without ever
    // opening Home, which is the same argument app/app/tax/page.tsx makes on the web.
    'app/(tabs)/tax.tsx',
    // The set aside again, on the screen he opens most. setAsideAfterCis IS what he puts by.
    'app/(tabs)/you.tsx',
    // 🔴 THE STOP ITEM, and on this repo it is worse than on the web: as well as the screen it
    // builds a share() text document AND a pdf(), both printing an estimated tax figure, and both
    // are handed to a broker by a customer who cannot ask us what it means.
    'app/proof-of-income.tsx',
    // Band derived, unlike the web screen of the same name. See the warning above.
    'app/tax-summary.tsx',
    // estimateTax() is commented "for the export", and the two Share.share calls send the JSON and
    // the CSV a man hands his accountant. A computed tax figure leaving the building on paper is
    // the founder's own stop reasoning, so it carries the line even though the web export does not
    // compute one at all.
    'app/(tabs)/settings.tsx',
  ].sort();

  const M_NOT_DISCLOSED = {
    'app/(tabs)/index.tsx':
      'Home, and it was on the disclosed list until the render was actually read. Its ONLY band derived output is `pot`, which feeds the goal widget: profit minus tax, meaning what is left to save towards a van. That is an affordability figure, not a statement of what he owes and not something he banks against, so it takes the same reasoning as app/goals.tsx below. The set aside he acts on is on the You tab, which does carry the line.',
    'app/pay-yourself.tsx':
      'A lever. It answers what to take as salary against dividends, one tap behind the tax tab which carries the line. Its web sibling app/app/pay-yourself/plan.ts is excused above for exactly this reason.',
    'app/what-if.tsx':
      'A difference between two figures that move together. Both move the same way under Scottish bands, so the answer it gives is less wrong than either figure alone, and it sits one tap behind a screen that carries the line. Same reasoning as lib/whatif.ts above.',
    'app/cis.tsx':
      'A refund position one tap behind the tax tab, which carries the line above the same figure. Same reasoning as app/app/tax/cis/page.tsx above.',
    'app/goals.tsx':
      'profit minus businessTaxOnProfit is an affordability pot for a thing he is saving for, not a statement of what he owes. Doc 103: a caveat under every goal is the ten helpful additions that make an unhelpful product.',
    'app/wrapped.tsx':
      'The closest call on this list, and it is recorded as a call rather than an oversight. It shares a year in review out of the product, so something does leave the building, but the figure is what his logged expenses SAVED him, not what he owes, and the destination is a social share rather than a lender or an accountant. The founder\'s bar names those two readers. If a Scot ever reports being misled by the wrapped figure, this is the entry to change.',
  };

  const mClassified = [...M_DISCLOSED, ...Object.keys(M_NOT_DISCLOSED)].sort();
  ok(`🔴 EQUALITY: every band derived mobile surface is classified (${mobileBandDerived.length} found)`,
    same(mobileBandDerived, mClassified));
  if (!same(mobileBandDerived, mClassified)) {
    console.log(`        found on disk but never decided: ${JSON.stringify(missing(mobileBandDerived, mClassified))}`);
    console.log(`        decided but no longer on disk:   ${JSON.stringify(missing(mClassified, mobileBandDerived))}`);
  }
  ok('🔴 EQUALITY: exactly the decided mobile surfaces say it, none missing, none added',
    same(mSaysIt, M_DISCLOSED));
  if (!same(mSaysIt, M_DISCLOSED)) {
    console.log(`        decided but silent: ${JSON.stringify(missing(M_DISCLOSED, mSaysIt))}`);
    console.log(`        says it but undecided: ${JSON.stringify(missing(mSaysIt, M_DISCLOSED))}`);
  }
  for (const rel of M_DISCLOSED) ok(`  mobile ${rel} exists and says it`, mSaysIt.includes(rel));
  ok('and every mobile "not disclosed" carries a reason somebody can read',
    Object.values(M_NOT_DISCLOSED).every((why) => typeof why === 'string' && why.length > 40));
  ok('and no mobile surface is on both lists at once',
    M_DISCLOSED.every((f) => !(f in M_NOT_DISCLOSED)));

  // 🔴 THE STOP ITEM, NAMED ON ITS OWN so a rename cannot quietly drop it out of the equality.
  ok('🔴 STOP ITEM: the phone lender screen says it', mSaysIt.includes('app/proof-of-income.tsx'));
  const poi = mobileRead('app/proof-of-income.tsx');
  ok('🔴 STOP ITEM: and the SHARED document carries it, not just the screen',
    /SCOTLAND_LINE/.test(poi.split('async function share()')[1]?.split('async function pdf()')[0] ?? ''));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE RATCHET ITSELF. THIS IS THE ASSERTION THAT IS MEANT TO FAIL ONE DAY.
//
// While no Scottish band is modelled, "Scottish rates are coming to Lekhio" is true. The moment one
// is, it is a false statement sitting under a correct figure. So the engine and its hand written
// mobile mirror are watched, and whoever models Scotland is stopped here and made to delete the
// notice on purpose rather than leave it up by accident.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. the ratchet: no Scottish band is modelled yet, so the line is still true ===\n');

const SCOTTISH_BAND = /scot|starterRate|intermediateRate|advancedRate|topRate/i;
const engineCode = codeOnly(read('lib/taxengine.ts'));
ok('🔴 RATCHET: lib/taxengine.ts models NO Scottish band. When this goes red, Scotland has arrived: delete lib/scotland.ts, delete SCOTLAND_LINE from every surface listed above, and delete this suite.',
  read('lib/taxengine.ts').length > 0 && !SCOTTISH_BAND.test(engineCode));

// The mobile mirror, hand written and parity guarded. It is a sibling checkout, so an absent one is
// not a failure, it is simply not there to check. See the parity warning in lib/taxengine.ts.
const MIRROR = path.resolve(root, '..', 'tradebook-app', 'lib', 'tax.ts');
if (existsSync(MIRROR)) {
  ok('🔴 RATCHET: the hand written mobile mirror models no Scottish band either',
    !SCOTTISH_BAND.test(codeOnly(readFileSync(MIRROR, 'utf8'))));
} else {
  console.log('  note  tradebook-app/lib/tax.ts is not checked out beside this repo, mirror ratchet skipped');
}

// And the decision holds in the other direction too: this packet was disclosure only. If a wizard
// ever starts asking him where he lives, the sentence is no longer the honest answer and this list
// has to be reopened.
ok('🔴 and nothing asks him where in the UK he lives, so the sentence stays honest',
  !sources.some((rel) => /where (in the UK )?(do you|are you)|which (country|nation)|are you in Scotland/i.test(codeOnly(read(rel)))));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
