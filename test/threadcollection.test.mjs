// THE COLLECTION SENTENCE IN THE CHAT'S MONEY ANSWER, AND WHO IT IS ALLOWED TO BE SAID TO.
//
//   node test/threadcollection.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND BY WALKING THE LIVE PRODUCT ON 9 AUGUST 2026.
//
// totalsAnswer() in app/api/thread/route.ts ended its "what do I owe" reply, for every reader
// without exception, with:
//
//   "It is the same figure your Tax screen leads with, and Self Assessment collects it in one
//    bill."
//
// Two things were wrong with that, and this repository already knew both of them.
//
//   1. 🔴 A DIRECTOR IS NOT IN SELF ASSESSMENT FOR HIS COMPANY'S PROFIT. app/app/tax/page.tsx has
//      gated this exact sentence on isCompany since wave 9, and test/wave9_mtdstructure.test.mjs
//      pins it there with the literal `{isCompany ? null : <>{' '}Self Assessment collects it`.
//      The chat surface was simply missed. It is the same defect deadlineAnswer() carried before
//      eeae7d9, wearing the money answer instead of the deadline answer: a Self Assessment
//      mechanism asserted at a man whose company files its own return.
//
//   2. 🔴 IT CLAIMED TO MIRROR A SCREEN IT DID NOT MIRROR. The sentence promises "the same figure
//      your Tax screen leads with" and then says something the Tax screen does not say. The hub
//      prints the January date next to that claim, and over the threshold it prints the two
//      payments on account as a card of their own. Here there was NO DATE AT ALL, so a man who
//      asked when his tax was due got a figure and no day, and a man over the threshold was told
//      "one bill" for a year that asks him for three payments.
//
// Payments on account are TMA 1970 s59A, a Self Assessment mechanism with no counterpart in
// Corporation Tax. There is nothing true to put in their place for a director, so nothing is put.
//
// 🔴 SO THIS RATCHET GUARDS THREE FAILURES, AND THE THIRD IS THE QUIET ONE.
//
//   1. THE COMPANY GATE DISAPPEARS. A refactor flattens the branch and every director is back to
//      being told about a return his company does not file.
//
//   2. THE DATE OR THE PAYMENTS ON ACCOUNT ARM DISAPPEARS, and the chat drifts back to saying
//      something weaker than the screen it claims to be quoting.
//
//   3. THE TWO SURFACES DRIFT APART. The hub and the chat derive the January year separately. If
//      one of them stops going through quarterForDate they can print different Januaries for the
//      same man on the same day, which is the "product that disagrees with itself" failure the
//      owed branch was rewritten to end. So this file also asserts the HUB still holds its gate,
//      and fails if either side loses it.
//
// ⚠️ EVERY POSITION AND EVERY ABSENCE ASSERTION BELOW PROVES ITS MARKER EXISTS FIRST. A regex that
// does not match returns false, and "the forbidden string is absent" passes triumphantly on a file
// that has been renamed, emptied, or moved. That is a guard that guards nothing, and it is the
// exact shape of bug test/thread.test.mjs shipped with before push 2.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const routePath = path.join(root, 'app/api/thread/route.ts');
const hubPath = path.join(root, 'app/app/tax/page.tsx');
const route = readFileSync(routePath, 'utf8');
const hub = readFileSync(hubPath, 'utf8');

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

// ── The file is the file we think it is. Everything below is meaningless otherwise. ──────────
ok('the thread route exists and holds the owed branch',
  route.length > 0 && route.includes('async function totalsAnswer('));
ok('the tax hub exists and still leads with taxPosition',
  hub.length > 0 && /taxPosition\(/.test(hub));

// ── The pieces the answer is built from are imported by name, not re-derived here. ───────────
ok('paymentsOnAccount and FACTS come from the engine, never reimplemented in the route',
  /import \{ paymentsOnAccount, FACTS \} from '\.\.\/\.\.\/\.\.\/lib\/taxengine'/.test(route));
// ⚠️ THE CALL GREW A THIRD ARGUMENT ON 11 AUGUST 2026 AND BOTH SURFACES HAD TO GROW IT TOGETHER,
// which is exactly what this pair of assertions exists to force. paymentsOnAccount now takes the
// tax already deducted at source, because payments on account are dropped when that clears 80
// percent, and a chat that kept passing two arguments would have gone on offering a subcontractor
// two payments the Tax screen had already excused him. The regex is deliberately exact on the
// third argument: a default would have let this drift silently, which is the whole failure mode.
const POA_CALL = /paymentsOnAccount\(tax\.selfAssessmentTax, startYear \+ 1, tax\.cisSuffered\)/;
ok('🔴 THE YEAR IS DERIVED THE WAY THE HUB DERIVES IT, so the two cannot print different Januaries',
  /import \{ quarterForDate \} from '\.\.\/\.\.\/\.\.\/lib\/quarterpack'/.test(route)
  && /quarterForDate\(new Date\(\)\)/.test(route)
  && POA_CALL.test(route));
ok('and the hub still derives it the same way, so this parity is real rather than asserted once',
  POA_CALL.test(hub));
// 🔴 AND THE FIGURE ITSELF. The sentence promises "the same figure your Tax screen leads with", so
// the two must lead with the same field. Both now lead with what is left to find.
// ⚠️ REWRITTEN 13 AUGUST 2026, RUN 3, AND IT IS STRONGER AGAIN. It pinned the shared EXPRESSION,
// on the reasoning that a shared expression cannot drift. It can, and it did: test/waintents.test.mjs
// pinned WhatsApp to `oweAnswer(tax.setAside, ...)` in a DIFFERENT suite, so when the CIS credit
// moved the web surfaces to setAsideAfterCis on 11 August, that other guard held WhatsApp still and
// stayed green. On 13 August WhatsApp said "Put by £37,457.00" while every web surface said £28,250.
// A regex can only pin the two places it is pointed at. So the rule is a FUNCTION now,
// billFromPosition() in lib/taxoptimiser.ts, and what is pinned is that every surface CALLS it.
const LEAD = /billFromPosition\(tax\)/;
ok('🔴 THE CHAT LEADS WITH THE FIGURE THE TAX SCREEN LEADS WITH, CIS AND ALL',
  LEAD.test(route) && LEAD.test(hub));
ok('🔴 AND SO DOES WHATSAPP, WHICH IS THE ONE THAT DRIFTED',
  /billFromPosition\(tax\)/.test(readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8')));

// ── The gate itself. The company arm and the everyone else arm, both proved to exist. ────────
// ⚠️ THE TAIL OF THIS PATTERN WAS `\n  }\n  return `Put by`, WHICH PINNED THE RETURN TO THE LINE
// IMMEDIATELY AFTER THE BRANCH. On 11 August the CIS credit put a comment block and two consts
// between them and this went null, which reads as "there is no structure branch at all" when the
// branch was untouched three lines up. The two arms are what this suite is about, so the pattern
// now ends at the closing brace and the return is proved on its own below.
const gate = /if \(optimiser\.businessType === 'limited_company'\) \{([\s\S]*?)\n  \} else \{([\s\S]*?)\n  \}\n/.exec(route);
ok('and the branch still feeds the one sentence that is returned',
  /return `Put by \$\{formatGbp\(leadFigure\)\} for tax\./.test(route)
  && route.indexOf('collection = `${sameFigure}') < route.indexOf('return `Put by'));
ok('🔴 THE COLLECTION SENTENCE IS BRANCHED ON THE STRUCTURE AT ALL',
  gate !== null);

if (gate) {
  const companyArm = gate[1];
  const otherArm = gate[2];

  ok('the company arm exists and still names the figure',
    companyArm.includes('sameFigure'));
  ok('🔴 A DIRECTOR IS NOT TOLD SELF ASSESSMENT COLLECTS ANYTHING',
    !/Self Assessment collects/.test(companyArm));
  ok('🔴 AND NOTHING IS INVENTED IN ITS PLACE: no Corporation Tax date, no company deadline',
    !/Corporation Tax|payments on account/i.test(companyArm));

  ok('everyone else is still told Self Assessment collects it in one bill',
    /Self Assessment collects it in one bill/.test(otherArm));
  ok('🔴 AND IS GIVEN THE DATE, which is the whole difference between an amount and an answer',
    /due by \$\{poa\.firstDue\}/.test(otherArm));
  ok('🔴 THE PAYMENTS ON ACCOUNT ARM IS DRAWN ONLY WHEN THE ENGINE SAYS THEY APPLY',
    /if \(poa\.required\)/.test(otherArm)
    && /two payments on account/.test(otherArm));
  ok('and it names both dates and the threshold from FACTS, never a typed number',
    /poa\.firstDue\} and \$\{poa\.secondDue\}/.test(otherArm)
    && /gbp0\(FACTS\.poaThreshold\)/.test(otherArm)
    && !/£1,000|£1000/.test(otherArm));
}

// ── Nowhere else. The sentence may live in exactly one place in the CODE of this file. ───────
// ⚠️ COMMENTS ARE STRIPPED FIRST, and that is not a convenience. The block above the gate quotes
// the old ungated sentence verbatim, because a defect note that will not name the defect is worth
// nothing to the next reader. Counting raw text would score that quotation as a second live copy
// and this guard would fail for a reason that has nothing to do with what a customer is told.
const codeOnly = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const routeCode = codeOnly(route);
ok('the comment stripper left the code behind rather than eating the file',
  routeCode.includes('async function totalsAnswer(') && routeCode.length > 1000);
const collectsHits = (routeCode.match(/Self Assessment collects/g) || []).length;
ok('🔴 THE SENTENCE APPEARS EXACTLY ONCE IN THE ROUTE CODE, so no second ungated copy can survive',
  collectsHits === 1);

// ── The hub's own gate, which this file refuses to let anyone quietly remove. ────────────────
ok('🔴 THE HUB STILL GATES THE SAME SENTENCE, so the chat is not the only surface holding the line',
  /\{isCompany \? null : <>\{' '\}Self Assessment collects it/.test(hub));

// ── The arithmetic the sentence interpolates, run for real. ──────────────────────────────────
// 🔴 EVERY ASSERTION ABOVE IS ABOUT SHAPE. A branch can be perfectly gated and still print the
// wrong January, or call a bill of nine hundred pounds three payments. These are dates and money
// in a sentence a man acts on, so the real engine runs here and the values are named.
// ⚠️ quarterpack.ts imports the engine and the Scotland line with EXTENSIONLESS specifiers, which
// Node's native type stripping will not resolve from disk. Staged and rewritten the same way
// test/quarterpack.test.mjs stages them, so this file reads the real modules rather than a copy
// that has drifted.
const stage = mkdtempSync(path.join(tmpdir(), 'threadcollection-'));
const lib = path.join(root, 'lib');
for (const f of ['taxengine.ts', 'scotland.ts']) {
  writeFileSync(path.join(stage, f), readFileSync(path.join(lib, f), 'utf8'));
}
writeFileSync(path.join(stage, 'quarterpack.ts'), readFileSync(path.join(lib, 'quarterpack.ts'), 'utf8')
  .replace("from './taxengine'", "from './taxengine.ts'")
  .replace("from './scotland'", "from './scotland.ts'"));
const { paymentsOnAccount, FACTS } = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const { quarterForDate } = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);

ok('the threshold is a thousand pounds and it lives in FACTS, not in the route',
  FACTS.poaThreshold === 1000);

// A day inside the 2026 to 2027 tax year. The route passes startYear + 1, so the engine is asked
// for the year ENDING 2027 and must print the January and July that follow it.
const midYear = new Date(Date.UTC(2026, 7, 9));
const { startYear } = quarterForDate(midYear);
ok('9 August 2026 resolves to the tax year opening in 2026',
  startYear === 2026);

const over = paymentsOnAccount(1500, startYear + 1);
ok('🔴 A BILL OVER THE THRESHOLD IS THREE PAYMENTS, NOT ONE, and both dates are named',
  over.required === true && over.eachPayment === 750
  && over.firstDue === '31 January 2028' && over.secondDue === '31 July 2028');

const under = paymentsOnAccount(900, startYear + 1);
ok('a bill under the threshold really is one bill, so the extra sentence stays away',
  under.required === false && under.eachPayment === 0);
ok('and the January date is still printed for him, because a figure with no day is half an answer',
  typeof under.firstDue === 'string' && /^31 January \d{4}$/.test(under.firstDue));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
// No dashes. The rule covers copy, comments and tests alike, so the two characters are named by
// their code points rather than typed, or this line would be the file's only breach of it.
ok('no en dash or em dash anywhere in the owed branch',
  !/[\u2013\u2014]/.test(route.slice(route.indexOf('async function totalsAnswer('))));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// B30, 18 AUGUST 2026. THE SAMENESS PROMISE HAS A CLOCK IN IT, AND NOW IT SAYS SO.
//
// "It is the same figure your Tax screen leads with" is true at the moment it is said and false the
// next morning, because projectionFactor() divides the year by daysElapsed from 6 April. The B30
// item recorded this as two engines disagreeing by £126.00. It is one engine, one day apart:
// £10,618 at 133 days elapsed, £10,492 at 134, on identical books. test/f23bill.test.mjs section E
// holds the reconciliation to the penny.
//
// ⚠️ THE CLAUSE GOES LAST, NOT INSIDE THE SAMENESS SENTENCE. Splicing it into sameFigure gives a
// sentence carrying three "and"s once the January date and the two instalments arrive. Both arms
// of the structure gate carry it, because a director's figure moves for exactly the same reason.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  // ⚠️ \w+ RATHER THAN THE NAME itMoves, AND A NO OP CONTROL IS WHAT FOUND IT. This pinned the
  // identifier, so renaming the local, consistently, went RED. That is this repo's oldest anchor
  // rule stated backwards: a guard anchored on a variable NAME is guarding the name. Second time
  // in one day. The identifier is DERIVED from the declaration and then used, so both arms are
  // still held by the same one thing.
  const decl = /const (\w+) = ' It moves as your year does\.';/.exec(route);
  ok('🔴 the chat says the figure moves as his year does', Boolean(decl));
  const movesName = decl ? decl[1] : '\u0000none';
  const both = gate ? gate[1].includes(movesName) && gate[2].includes(movesName) : false;
  ok('🔴 and BOTH arms of the structure gate carry it, the company one included', both);
  // Anchored on the WORK: the clause is appended after the payments on account sentence, never
  // folded into the constant that promises sameness. A guard on the constant would go green on a
  // rewrite that put the two claims in one breath, which is the sentence this rejected.
  const SAME = "const sameFigure = 'It is the same figure your Tax screen leads with';";
  ok('the sameness promise itself is unchanged, so its own guards still point at something',
    route.includes(SAME));
  ok('and the movement clause is not spliced into it', !/leads with, and it moves/.test(route));
}

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
