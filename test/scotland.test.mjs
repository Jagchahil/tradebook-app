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
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  // 🔴 THE CONVERSATIONAL LANES, ADDED 17 August 2026 BY B2. It holds the system prompt
  // block that BOTH the WhatsApp router and the in app accountant spread, so this one file is
  // where the sentence reaches the two channels a man actually asks his questions on. It is not a
  // screen and costs no row. Section 2b below holds what the rule has to say.
  'lib/claude.ts',
  // 🔴 J8, DECIDED 17 August 2026. THE SAME FIGURE CARRIES THE SAME CAVEAT ON EVERY CHANNEL.
  // Both of these print taxPosition() on getOptimiserInput(), the identical call /app/tax leads
  // with, and both say so in their own comments as a promise. /app/tax prints the sentence under
  // that number every time it is opened. These printed the same number and said nothing, so a
  // Scot got a caveated figure on the web and an uncaveated one in the chat he actually uses.
  // The rejected alternative was a stored flag saying it once per customer: a caveat read once in
  // March and forgotten by January is the appearance of disclosure without the function.
  // ⚠️ SET ASIDE ONLY. The made, spent and profit answers are not band derived and stay clean.
  'app/api/thread/route.ts',
  'app/api/whatsapp/route.ts',
  // 🔴 ADDED 17 August 2026 BY B19, AND THIS SECTION FOUND IT RATHER THAN A CUSTOMER.
  // lib/laneanswers.ts is the one reader behind the National Insurance, student loan and property
  // lanes on all three routers. Two of those three are UK wide and are deliberately not disclosed
  // (National Insurance is reserved, student loan plans and thresholds are the same everywhere).
  // The PROPERTY one is band derived: "adding about £2,400 to your tax bill" is his rent stacked on
  // his trade profit at the England, Wales and Northern Ireland rates.
  //
  // ⚠️ AND IT HAD NEVER BEEN DISCLOSED ON ANY CHANNEL. app/api/whatsapp/route.ts produced this
  // figure and said nothing about it, and section 3 could not see the gap because THE SAME FILE says
  // the sentence on the totals lane thirty lines up. One file, two lanes, one of them silent. Moving
  // the read into a file of its own is what let this ratchet ask the question.
  'lib/laneanswers.ts',
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
// 2b. THE CONVERSATIONAL LANES. WHAT THE MODEL IS TOLD, AND WHERE IT IS TOLD IT.
//
// 🔴 B2, 17 AUGUST 2026. WALKED, NOT READ. A Glasgow sole trader with a real statement in his
// account asked the in app chat what to put by for the taxman and was told, in these words, that
// being in Scotland his tax rates are the same as the rest of the UK. Asked again he was given a
// band table with a 41% higher rate, a 46% top rate and no advanced rate, which is no year in
// force. Two answers, one account, minutes apart, contradicting each other and both wrong.
//
// The rule existed. It was a literal inside accountantSystem(), so the in app accountant had it
// and the WhatsApp prompt, which spreads taxFacts2627() and not that literal, HAD NOTHING. One
// channel governed, the other silent, and nothing anywhere asserted either.
//
// So the rule now lives in the shared block and this section holds it there. The bar is not "a
// Scotland rule exists somewhere in the file". It is: the rule is in the block BOTH prompts
// spread, it says the one sentence lib/scotland.ts owns, it forbids the two things the walk
// caught it doing, and there is exactly ONE of it.
//
// ⚠️ EVERY CHECK HERE READS codeOnly(). The fix's own comment quotes the false sentence it
// removed and names gov.scot, which is the trap this corpus has now hit three times: a guard
// asserting a sentence is GONE goes green or red on the comment explaining why it went.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2b. the conversational lanes are governed, once, in the block both prompts spread ===\n');

const CLAUDE_SRC = read('lib/claude.ts');
const CLAUDE_CODE = codeOnly(CLAUDE_SRC);

ok('lib/claude.ts imports SCOTLAND_LINE from lib/scotland',
  importsOf(CLAUDE_SRC).some((i) => i.name === 'SCOTLAND_LINE' && i.from === 'scotland'));

// The shared block, sliced to its own end rather than open ended to the end of the file, so a rule
// that drifts down into a single prompt cannot pass by sitting anywhere below.
const sharedStart = CLAUDE_CODE.indexOf('function taxFacts2627()');
const sharedEnd = CLAUDE_CODE.indexOf('function ltdFacts2627()');
ok('taxFacts2627() and ltdFacts2627() are both still there to slice between',
  sharedStart !== -1 && sharedEnd !== -1 && sharedEnd > sharedStart);
const SHARED = sharedStart === -1 ? '' : CLAUDE_CODE.slice(sharedStart, sharedEnd);

ok('\u{1F534} the Scotland rule is INSIDE the shared block, not in one prompt',
  SHARED.includes('SCOTLAND_LINE'));
ok('\u{1F534} and the shared block is spread into more than one prompt',
  (CLAUDE_CODE.match(/\.\.\.taxFacts2627\(\)/g) ?? []).length >= 2);

// EXACTLY ONE. A second copy is how the two channels came apart in the first place.
const scottishLines = CLAUDE_CODE.split('\n').filter((l) => /Scottish/.test(l));
ok(`\u{1F534} exactly ONE line of code mentions Scottish, found ${scottishLines.length}`,
  scottishLines.length === 1);

const RULE = scottishLines[0] ?? '';
ok('\u26a0\ufe0f the rule forbids stating a Scottish rate, band, threshold or percentage',
  /NEVER state a Scottish rate, band, threshold or percentage/.test(RULE));
ok('\u26a0\ufe0f the rule forbids saying Scotland is the same as the rest of the UK',
  /NEVER say that Scotland is the same as the rest of the UK/.test(RULE));
ok('\u26a0\ufe0f the rule says National Insurance, VAT and student loans ARE UK wide',
  /National Insurance, VAT and student loan plans ARE the same across the UK/.test(RULE));

// lib/scotland.ts rule three, applied to the channel it was written for. The wording this replaced
// broke it: it told a paying customer to go and read the bands on gov.scot himself.
ok('\u{1F534} no prompt in lib/claude.ts sends him somewhere else to read the rates',
  !/gov\.scot|gov\.uk\/scottish/i.test(CLAUDE_CODE));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2c. J8. THE SET ASIDE FIGURE CARRIES THE SENTENCE ON EVERY CHANNEL, AND ONLY THAT FIGURE.
//
// Decided 17 August 2026 after B2 walked it. The number these two print is taxPosition() on
// getOptimiserInput(), the identical call /app/tax leads with, which both files already promise in
// their own comments. /app/tax caveats it every time. These did not.
//
// The bar is unchanged and is lib/scotland.ts's own: would a Scot be misled by THIS number if the
// line were absent. So it rides the set aside answer and nothing else. The made, spent and profit
// answers are turnover and costs, true in every nation, and a caveat under them is the ten helpful
// additions that make an unhelpful product.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2c. the set aside answer says it on both channels, and only that answer ===\n');

const THREAD = read('app/api/thread/route.ts');
const WA = read('app/api/whatsapp/route.ts');
const THREAD_CODE = codeOnly(THREAD);
const WA_CODE = codeOnly(WA);

// ⚠️ SLICED TO THE END OF THE STATEMENT, NOT MATCHED BY ONE REGEX. The answer is a template
// literal containing NESTED template literals, so a [^`]* span cannot cross it. The first draft of
// this check used one and went red against correct code.
const setAsideStmt = (() => {
  const i = THREAD_CODE.indexOf('Put by ${formatGbp(');
  if (i === -1) return '';
  const end = THREAD_CODE.indexOf(';', i);
  return end === -1 ? THREAD_CODE.slice(i) : THREAD_CODE.slice(i, end);
})();
ok('🔴 the thread set aside answer carries the sentence',
  setAsideStmt.length > 0 && setAsideStmt.includes('${SCOTLAND_LINE}'));
ok('🔴 the WhatsApp set aside answer carries it too, so the two channels cannot drift',
  /SCOTLAND_LINE/.test(WA_CODE) && /hasPosition \? ` \$\{SCOTLAND_LINE\}` : ''/.test(WA_CODE));

// ⚠️ NO CAVEAT ABOUT A FIGURE HE HAS NOT BEEN GIVEN. Same guard lib/incomeproof.ts applies with
// personalTaxShown: a man with nothing confirmed gets the empty sentence and nothing else.
ok('⚠️ WhatsApp guards it on there being a position at all',
  /const scot = hasPosition \? ` \$\{SCOTLAND_LINE\}` : '';/.test(WA_CODE));
ok('⚠️ and the thread guards it by sitting after the empty return',
  THREAD_CODE.indexOf('hasTaxPosition(optimiser, tax.setAside)') < THREAD_CODE.indexOf('${SCOTLAND_LINE}'));

// SET ASIDE ONLY. If the sentence ever appears in the same statement as a turnover or costs answer,
// somebody has widened it past the decision without writing down why.
for (const [name, line] of [
  ['made', 'You have brought in'],
  ['spent', 'You have spent'],
]) {
  const idx = THREAD_CODE.indexOf(line);
  const stmtEnd = idx === -1 ? -1 : THREAD_CODE.indexOf('`;', idx);
  const stmt = idx === -1 ? '' : THREAD_CODE.slice(idx, stmtEnd === -1 ? idx : stmtEnd);
  ok(`⚠️ the ${name} answer stays clean, it is not band derived`,
    idx !== -1 && !stmt.includes('SCOTLAND_LINE'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2d. B16. THE DETERMINISTIC ANSWER, AND THE ONE THING IT MUST NEVER CONTAIN.
//
// Section 2b holds what the MODEL IS TOLD about Scotland. It is a good guard and it cannot be the
// only one, because B2 watched the model be told and disobey: "you're in Scotland so your tax rates
// are the same as the rest of the UK", then a band table with a 41% higher rate and no advanced
// rate. Section 2b would have passed all the way through both of those answers, and did.
//
// So there is now a lane that answers a Scottish rates question from lib/scotland.ts and never asks
// the model. This section holds the WORDS. test/laneparity.test.mjs holds the ROUTING, because that
// is a fact about the two route files and this suite has no business deriving their order.
//
// ⚠️ THE CENTRAL ASSERTION IS THAT THE ANSWER PRICES NOTHING, AND IT IS HELD BY SHAPE. lib/scotland
// .ts's fourth written rule is that the sentence must not price what Scotland would change, because
// that is a number we cannot compute and the reason the sentence exists. A list of the six Scottish
// rates would be a list somebody has to maintain, and the day Scotland adds a seventh the guard
// still passes. So: no percent sign, no pound sign, and no number of two digits or more. Every
// Scottish band (19, 20, 21, 42, 45, 48), every rUK band and every threshold is excluded by that,
// and so is the 41 and 46 the walk actually caught. The one digit allowed through is "plan 4",
// which is the name of a student loan plan and not a rate.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2d. the deterministic Scottish rates answer prices nothing ===\n');

const RATES_DECL = (() => {
  const i = SCOTLAND_SRC.indexOf('export const SCOTTISH_RATES_ANSWER');
  if (i === -1) return '';
  const end = SCOTLAND_SRC.indexOf(';', i);
  return end === -1 ? SCOTLAND_SRC.slice(i) : SCOTLAND_SRC.slice(i, end);
})();
ok('🔴 lib/scotland.ts exports SCOTTISH_RATES_ANSWER', RATES_DECL.length > 0);

// It is BUILT FROM the sentence, never a second wording of it. One caveat becoming two slightly
// different caveats is the exact failure this file's header was written about.
ok('🔴 and it is built from SCOTLAND_LINE rather than wording its own caveat',
  RATES_DECL.includes('${SCOTLAND_LINE}'));

// The answer as the routers will actually send it, resolved through the module rather than read off
// the source, so a constant that no longer interpolates is caught here and not by a customer.
const RATES_ANSWER = (await import(
  pathToFileURL(path.join(root, 'lib/scotland.ts')).href
)).SCOTTISH_RATES_ANSWER ?? '';
ok('and it resolves to a non empty string that contains the sentence verbatim',
  typeof RATES_ANSWER === 'string' && declared !== null && RATES_ANSWER.includes(declared[1]));

// 🔴 THE ONE THAT MATTERS. Three separate shapes, so a sabotage has to defeat all three.
ok('🔴 IT PRICES NOTHING: no percent sign anywhere in it',
  RATES_ANSWER.length > 0 && !/%|\bper ?cent\b/i.test(RATES_ANSWER));
ok('🔴 IT PRICES NOTHING: no pound sign, so no threshold and no allowance',
  RATES_ANSWER.length > 0 && !/£/.test(RATES_ANSWER));
ok('🔴 IT PRICES NOTHING: no number of two digits or more, so no band can be in it',
  RATES_ANSWER.length > 0 && !/\d{2,}/.test(RATES_ANSWER));

// The other three written rules of this file, applied to the new sentence.
ok('⚠️ it does not claim we know where he lives',
  !/\b(?:since|because|as) you(?:'re| are)? in scotland\b/i.test(RATES_ANSWER)
  && !/\byour postcode\b/i.test(RATES_ANSWER));
ok('⚠️ it puts no date on the Scottish rates',
  !/\b(?:20\d\d|january|february|march|april|may|june|july|august|september|october|november|december)\b/i
    .test(RATES_ANSWER));
ok('⚠️ it sends him nowhere: no gov.scot, no gov.uk, no link of any kind',
  !/gov\.scot|gov\.uk|https?:|www\./i.test(RATES_ANSWER));

// And it never says the thing the walk caught, in either direction.
ok('🔴 it never says Scotland is the same as the rest of the UK',
  !/\b(?:same|identical|no different)\b[^.]{0,40}\b(?:rest of the uk|england|ruk)\b/i
    .test(RATES_ANSWER.replace(/National Insurance and VAT[^.]*\./i, '')));

// ⚠️ BOTH ROUTERS SEND THE SHARED CONSTANT, NOT A COPY OF IT. A hand written Scotland sentence in a
// route file is how this product ended up with one caveat in app/tax-calculator and none anywhere
// else, which is the story in lib/scotland.ts's own header.
for (const [name, code] of [['thread', THREAD_CODE], ['whatsapp', WA_CODE]]) {
  ok(`🔴 the ${name} router sends SCOTTISH_RATES_ANSWER, the shared constant`,
    /SCOTTISH_RATES_ANSWER/.test(code));
  ok(`⚠️ and the ${name} router prices nothing Scottish of its own either`,
    !/scottish[^\n]{0,60}\d{2,}\s*%/i.test(code));
}

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
  // 🔴 FOUR MORE, ADDED 18 August 2026 BY B30, AND THE MEASUREMENT IS THE POINT. Until this
  // morning lib/supabase.ts imported selfAssessmentBill and NOTHING ELSE band derived, so a file
  // holding the number the 08:00 text quotes was invisible to this discovery. It only appeared
  // when the import changed to taxPosition. These four are the doors into a band derived figure
  // that were not producers: selfAssessmentBill and billFromPosition ARE the bill, paymentsOnAccount
  // halves it, and setAsideBasisLine writes the sentence under it.
  // ⚠️ MEASURED BEFORE ADDING, NOT ASSUMED: with these four in, the discovery finds the SAME 27
  // files it found without them, because every file importing one of these already imports a
  // producer above. So this costs nothing today and closes a door that was open an hour ago.
  'selfAssessmentBill', 'billFromPosition', 'paymentsOnAccount', 'setAsideBasisLine',
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
  // 🔴 ADDED 18 August 2026 BY B30, AND THIS RATCHET FOUND IT THE MOMENT THE IMPORT CHANGED.
  // selfAssessmentJanuaryFor() now calls taxPosition() directly, so the data layer became a
  // discovered surface within one edit and this suite refused to go green until somebody decided.
  // That is the ratchet doing its job on a file nobody thought of as a screen.
  'lib/supabase.ts':
    'The data layer. Its one taxPosition() call exists so that the agent and the two routes quote the SAME position the tax page draws, and it renders no sentence to anybody: it returns numbers. Every surface that reads those numbers is classified in this file, and app/api/cron/agent and lib/agent.ts are both on that list. A caveat here would have no reader.',
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
