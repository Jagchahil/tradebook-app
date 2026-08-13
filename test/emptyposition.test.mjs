// A PROUD ZERO. WHETHER THERE IS A TAX POSITION TO SPEAK AT ALL, AND WHO IS ALLOWED TO SAY £0.00.
//
//   node test/emptyposition.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND ON 9 AUGUST 2026 IN BOTH CHAT LANES AT ONCE.
//
// A man with COSTS CONFIRMED AND NO INCOME asks what he owes. Both lanes have an empty check above
// this branch and neither one catches him, because it tests whether he has logged ANYTHING and he
// has: he has logged the half that is not income. So he falls through to the owed answer, where
// taxPosition() quite correctly returns nothing owed on nothing earned, and the product announced:
//
//   WhatsApp:  "Put by £0.00 for tax. That is what the year so far has built up, too early to call
//               the whole year yet. Full picture in the app under Tax."
//   The chat:  "Put by £0.00 for tax. ... It is the same figure your Tax screen leads with, and
//               Self Assessment collects it in one bill, due by 31 January 2028."
//
// 🔴 AND THE TAX HUB HAS HIDDEN ITS WHOLE POSITION BLOCK ON THIS EXACT TEST SINCE DOC 103. Its own
// comment says why: "A proud £0 for a brand new account teaches him this screen says nothing." So
// the screen the chat CLAIMS TO MIRROR shows him an empty state and a way to fill it, while the
// chat led with a figure of nothing.
//
// ⚠️ AND THE CHAT WAS MADE WORSE THE SAME MORNING. The collection sentence shipped a few hours
// earlier put a JANUARY DATE on that £0.00. A deadline on an empty figure is worse than the empty
// figure: it is a date in a man's calendar for a bill that does not exist.
//
// 🔴 SO THIS RATCHET GUARDS FIVE FAILURES.
//
//   1. THE RULE ITSELF GOES WRONG. It is arithmetic on a man's money and it is asserted here
//      against the real lib/taxoptimiser.ts, case by case, not read off the source.
//
//   2. THE OR IS LOST. A man can owe real tax with no trade and no property income at all, on
//      salary, dividends or savings. Reducing this to "has he invoiced anything" would hide a
//      genuine bill from the man most likely to be surprised by one.
//
//   3. EITHER LANE STOPS ASKING, or grows a second copy of the rule. Two copies is how the hub and
//      the chat came to disagree in the first place.
//
//   4. THE EMPTY SENTENCE QUIETLY GROWS A FIGURE OR A DATE BACK. It is copy, and copy is edited by
//      people who are not thinking about January.
//
//   5. THE HUB LOSES ITS OWN TEST. It is the surface the other two claim to mirror. If it starts
//      leading with £0.00 the two lanes are now correctly mirroring the wrong thing, and every
//      assertion in the world about the chats would still be green.
//
// ⚠️ EVERY ABSENCE ASSERTION BELOW PROVES ITS MARKER EXISTS FIRST, and every "this string is not
// there" is paired with a positive assertion on the other arm. "No figure in the empty answer"
// passes triumphantly on an empty string, on a renamed function and on a file somebody moved.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

// Node's type stripping cannot follow an extensionless relative import, so the modules are staged
// with the rewrite every engine suite in here uses.
//
// ⚠️ THE CLOSURE IS WALKED, NOT TYPED OUT. A hand written list of dependencies is a list that goes
// stale the first time one of these engines grows an import, and it goes stale as a CRASH in a test
// file rather than as anything anyone learns from. This follows the graph from the two entry points
// and stages whatever it finds.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'emptyposition-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};
stageModule('taxoptimiser');
stageModule('waintents');
const { hasTaxPosition } = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const { oweAnswer } = await import(pathToFileURL(path.join(stage, 'waintents.ts')).href);

const hub = src('app/app/tax/page.tsx');
const thread = src('app/api/thread/route.ts');
const wa = src('app/api/whatsapp/route.ts');
const optimiserSrc = src('lib/taxoptimiser.ts');
const intentsSrc = src('lib/waintents.ts');

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

// ── The things we are about to reason about are really there. ────────────────────────────────
ok('🔴 THE RULE IS A REAL EXPORTED FUNCTION, not a string this file matched in a comment',
  typeof hasTaxPosition === 'function');
ok('and the owe sentence is too',
  typeof oweAnswer === 'function');
ok('all five sources read, none of them empty',
  hub.length > 1000 && thread.length > 1000 && wa.length > 1000
  && optimiserSrc.length > 1000 && intentsSrc.length > 1000);

// ── The rule itself, run for real. Shape assertions cannot catch arithmetic. ─────────────────
const input = (trade, property) => ({ ytdTradeIncome: trade, ytdPropertyIncome: property });

ok('🔴 COSTS AND NO INCOME IS NOT A POSITION, which is the man this whole file is about',
  hasTaxPosition(input(0, 0), 0) === false);
ok('a brand new account is not a position either',
  hasTaxPosition(input(0, undefined), 0) === false);
ok('trade income makes a position, even before any tax is due on it',
  hasTaxPosition(input(1, 0), 0) === true);
ok('rent makes a position on its own, because a landlord is a customer and not an afterthought',
  hasTaxPosition(input(0, 1), 0) === true);
ok('🔴 AND SO DOES TAX OWED WITH NO TRADE AND NO RENT AT ALL: salary, dividends, savings',
  hasTaxPosition(input(0, 0), 0.01) === true);
ok('🔴 THE OR IS A REAL OR: neither half alone can be removed without this going red',
  hasTaxPosition(input(5000, 0), 0) === true
  && hasTaxPosition(input(0, 0), 5000) === true
  && hasTaxPosition(input(0, 0), 0) === false);
ok('a negative figure is clamped rather than cancelling a real one out',
  hasTaxPosition(input(-9000, 0), 0) === false
  && hasTaxPosition(input(-9000, 100), 0) === true);
ok('a missing property field is treated as no rent, never as NaN',
  hasTaxPosition({ ytdTradeIncome: 0 }, 0) === false
  && hasTaxPosition({ ytdTradeIncome: 100 }, 0) === true);

// ── The WhatsApp sentence, both arms, composed for real. ─────────────────────────────────────
const spoken = oweAnswer(0, false, false);
const figure = oweAnswer(2450.5, true, true);

ok('🔴 THE ARM WITH A FIGURE STILL LEADS WITH IT, so the absence tests below test a difference',
  figure.startsWith('Put by £2,450.50 for tax.'));
ok('🔴 AND THE EMPTY ARM NAMES NO FIGURE AT ALL',
  !/£/.test(spoken) && !/Put by/.test(spoken));
ok('🔴 NOR A DATE, because a deadline for a bill that does not exist is worse than the bill',
  !/January|July|due by|deadline/i.test(spoken));
ok('it says the honest thing and names the one thing that fills it in',
  /Nothing to work out yet/.test(spoken) && /what you bring in/.test(spoken));
ok('and it keeps the channel\'s standing redirect, so he still has somewhere to look',
  /Full picture in the app under Tax\.$/.test(spoken)
  && /Full picture in the app under Tax\.$/.test(figure));
ok('no forbidden dashes in either arm',
  !/[–—]/.test(spoken) && !/[–—]/.test(figure));

// ── Both lanes ask the one function, and neither writes the rule down again. ─────────────────
ok('the thread still fetches the hub\'s own figure before deciding anything',
  /taxPosition\(optimiser\)/.test(thread) && /taxPosition\(optimiser\)/.test(wa));
ok('🔴 THE THREAD ASKS THE RULE AND RETURNS BEFORE IT BUILDS A SENTENCE',
  /if \(!hasTaxPosition\(optimiser, tax\.setAside\)\) \{/.test(thread));
// ⚠️ THE GATE READS setAside AND THE SENTENCE READS billFromPosition, AND THAT IS DELIBERATE.
// hasTaxPosition asks "is there a position at all", which is a question about the LIABILITY: a man
// whose whole bill is covered by CIS still has a position and still gets told about it. What he is
// asked to PUT BY is what is left to find. Run 3 separated the two; before it, both were setAside
// and WhatsApp quoted the liability under the words "put by".
ok('🔴 WHATSAPP ASKS THE SAME FUNCTION AND HANDS THE ANSWER TO oweAnswer',
  /const hasPosition = hasTaxPosition\(optimiser, tax\.setAside\);/.test(wa)
  && /oweAnswer\(billFromPosition\(tax\), tax\.projected, hasPosition\)/.test(wa));
ok('🔴 AND WHATSAPP DROPS THE BASIS LINE ON AN EMPTY POSITION: there is no make up of nothing',
  /hasPosition && basis \?/.test(wa));
ok('🔴 NEITHER LANE KEEPS A SECOND COPY OF THE RULE',
  !/moneyIn > 0 \|\| tax\.setAside > 0/.test(thread)
  && !/moneyIn > 0 \|\| tax\.setAside > 0/.test(wa));
// ⚠️ THE LIST GREW BY ONE NAME IN RUN 3, billFromPosition, and it is named here rather than
// loosened to a wildcard: "reaching for it some other way" is exactly what this line forbids, and a
// wildcard would stop forbidding it.
const IMPORTS_BY_NAME =
  /import \{ taxPosition, setAsideBasisLine, hasTaxPosition, billFromPosition \} from '\.\.\/\.\.\/\.\.\/lib\/taxoptimiser'/;
ok('both import it by name rather than reaching for it some other way',
  IMPORTS_BY_NAME.test(thread) && IMPORTS_BY_NAME.test(wa));

// ── The thread's own empty sentence, read out of the source it is written in. ─────────────────
const threadEmpty = /return 'Nothing to work out yet\.([^']*)';/.exec(thread);
ok('the thread\'s empty sentence is where this file thinks it is',
  threadEmpty !== null);
if (threadEmpty) {
  ok('🔴 AND IT CARRIES NO FIGURE AND NO JANUARY EITHER',
    !/£/.test(threadEmpty[1]) && !/January|due by/i.test(threadEmpty[1]));
  ok('it names the door that works on the web, which is not the door WhatsApp names',
    /Money pages/.test(threadEmpty[1]) && !/Send me/.test(threadEmpty[1]));
}

// ── The hub, which is the surface the other two claim to mirror. ─────────────────────────────
// ⚠️ IF THIS GOES, the two lanes are correctly mirroring a screen that is now wrong, and every
// assertion above stays green. It is the quiet failure, so it is asserted here.
ok('🔴 THE HUB STILL COMPUTES THE SAME TEST FROM THE SAME TWO FIELDS',
  /const moneyIn = Math\.max\(0, optimiser\.ytdTradeIncome\) \+ Math\.max\(0, optimiser\.ytdPropertyIncome \?\? 0\);/.test(hub)
  && /const showPosition = moneyIn > 0 \|\| tax\.setAside > 0;/.test(hub));
ok('🔴 AND STILL HIDES ITS WHOLE POSITION BLOCK ON IT, rather than leading with a proud zero',
  /\{showPosition \? \(/.test(hub));
ok('and still says something true in the empty state instead',
  /Nothing to work out yet\./.test(hub));

// The helper and the hub have to agree, so the claim "it is the same figure your Tax screen leads
// with" survives. The hub's expression is read out of its own source and evaluated here, against
// the same cases the real function was given above.
const hubAgrees = [[0, 0, 0, false], [1, 0, 0, true], [0, 1, 0, true], [0, 0, 1, true], [-5, 0, 0, false]]
  .every(([t, p, s, want]) => {
    const moneyIn = Math.max(0, t) + Math.max(0, p ?? 0);
    return (moneyIn > 0 || s > 0) === want && hasTaxPosition(input(t, p), s) === want;
  });
ok('🔴 THE HUB\'S RULE AND THE SHARED FUNCTION GIVE THE SAME ANSWER ON EVERY CASE',
  hubAgrees);

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
