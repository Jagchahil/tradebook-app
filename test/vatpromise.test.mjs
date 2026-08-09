// A PROMISE MAY NOT BE PUT IN FRONT OF A MAN IT IS NOT TRUE OF, AND HIS OWN ANSWER CAN MAKE IT
// UNTRUE.
//
//   node test/vatpromise.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND BY WALKING THE LIVE PRODUCT ON 9 AUGUST 2026 AS THE MOST COMMON CUSTOMER THIS
// PRODUCT HAS: A SOLE TRADER WHO IS NOT VAT REGISTERED.
//
// He opens /app/you/circumstances, taps No to "Are you VAT registered?", and the page redraws:
//
//   Are you VAT registered?
//   When you registered you could have reclaimed the VAT on the kit you already owned: goods you
//   still had on the day, going back four years, and services going back six months. Almost nobody
//   does. All of it hangs on the date you registered, so tell us that on your VAT page under You...
//   You said no.
//
// The promise sits DIRECTLY ABOVE HIS OWN NO, and worthOrder 'huge' puts it near the top of what he
// can claim. Reg 111 of the VAT Regulations 1995 reaches a man from the day he registered and
// reaches a man who never registered not at all. So this told him four years of reclaim were
// waiting, and sent him to a screen to enter a registration date he does not have.
//
// 🔴 AND THE PAGE ALREADY KNEW. Its own doctrine block says, in capitals: THE `why` IS A PROMISE,
// AND A PROMISE THAT IS NOT TRUE OF HIM MAY NOT BE PUT IN FRONT OF HIM. That guard was built, and
// it works. It is `mine = appliesTo(q, who)`, and appliesTo() reads HOW HE TRADES and WHETHER HE
// TRADES. It has nothing to read the ANSWER with. The promise escaped down the one axis nobody
// wired up, which is the same shape as the deadline answer and the owed answer before it: a
// mechanism asserted at a man it does not apply to.
//
// The second one, on /app/you/vat, is the same fact wearing a shorter sentence: "how much of what
// you have already spent can come back to you", said to everybody, one line under "One question,
// and it is worth answering", and on the redraw after No it sat directly above "Noted. You are down
// as not VAT registered, so your invoices carry no VAT."
//
// 🔴 SO THIS RATCHET GUARDS FOUR FAILURES, AND THE LAST TWO ARE THE QUIET ONES.
//
//   1. THE RULE STOPS BEING DATA. untrueOn lives on the row in lib/circumstances.ts. The day a
//      surface writes "if (q.key === 'vat_registered')" instead, there are two copies of the rule
//      and one of them will drift.
//
//   2. THE PAGE STOPS APPLYING IT, or reverts to rendering q.why on one arm of a ternary.
//
//   3. THE REPLACEMENT QUIETLY BECOMES A PROMISE AGAIN. A sentence that says "nothing to reclaim
//      right now" is one careless edit away from saying "reclaim it later", and nothing about the
//      shape of the code would change.
//
//   4. THE THREE SURFACES DRIFT APART. WhatsApp sends c.why only after the 'no' branch has already
//      returned, and /app/setup lists it only for questions he answered YES. Both are correct
//      TODAY and neither knows it is load bearing. If either loses its gate the same promise is
//      back in front of the same man through a different door, and the page fix would still be
//      sitting here looking green. So this file asserts BOTH of them too.
//
// ⚠️ EVERY ABSENCE AND EVERY POSITION ASSERTION BELOW PROVES ITS MARKER EXISTS FIRST. A regex that
// does not match returns false, and "the forbidden string is absent" passes triumphantly on a file
// that has been renamed, emptied or moved. indexOf returns -1 for a string that is not there, and
// -1 is less than everything, so an ordering test on a missing marker is a test that cannot fail.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const modPath = path.join(root, 'lib/circumstances.ts');
const C = await import(pathToFileURL(modPath).href);
const { CIRCUMSTANCES } = C;

const modSrc = readFileSync(modPath, 'utf8');
const circPage = readFileSync(path.join(root, 'app/app/you/circumstances/page.tsx'), 'utf8');
const vatPage = readFileSync(path.join(root, 'app/app/you/vat/page.tsx'), 'utf8');
const waRoute = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const setupPage = readFileSync(path.join(root, 'app/app/setup/page.tsx'), 'utf8');

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
ok('the circumstances module loads and carries rows',
  Array.isArray(CIRCUMSTANCES) && CIRCUMSTANCES.length > 0);
ok('all four surfaces read as source, none of them empty',
  modSrc.length > 1000 && circPage.length > 1000 && vatPage.length > 1000
  && waRoute.length > 1000 && setupPage.length > 1000);

const vat = CIRCUMSTANCES.find((c) => c.key === 'vat_registered');
ok('🔴 THE vat_registered ROW EXISTS, without which every assertion below is meaningless',
  vat !== undefined);

// ── The rule is DATA on the row, and it is one field so it cannot be half set. ────────────────
if (vat) {
  ok('🔴 THE ROW DECLARES THE ANSWER THAT MAKES ITS PROMISE UNTRUE',
    vat.untrueOn !== undefined && vat.untrueOn !== null);
  ok('🔴 AND THAT ANSWER IS NO, which is the ordinary position for a sole trader',
    vat.untrueOn?.answer === 'no');
  ok('the replacement is a real sentence rather than an empty string',
    typeof vat.untrueOn?.instead === 'string' && vat.untrueOn.instead.length > 40);

  // The whole point, and the one an edit can undo without changing a line of logic.
  const instead = vat.untrueOn?.instead ?? '';
  ok('🔴 THE REPLACEMENT PROMISES HIM NOTHING BACK: no reclaim, no four years, nothing coming to him',
    !/reclaim(ed)? the VAT|come back to you|going back four years|four years back/i.test(instead));
  ok('and it still tells him what changes if he ever does register, so the question keeps its point',
    /register/i.test(instead));

  // ⚠️ PROVING THE ASSERTION ABOVE TESTS A REAL DIFFERENCE. If the `why` itself had been gutted
  // rather than withheld, the absence test would pass on two identical harmless sentences and this
  // file would be guarding nothing at all.
  ok('🔴 AND THE PROMISE ITSELF IS INTACT, withheld from him rather than deleted from the product',
    /reclaimed the VAT on the kit you already owned/.test(vat.why)
    && /going back four years/.test(vat.why));

  ok('the row still carries its source, so the promise it withholds is still a cited one',
    typeof vat.source === 'string' && /Reg 111/.test(vat.source));
}

// Every untrueOn anywhere is well formed. A second one is a decision somebody is allowed to make;
// a malformed one is not, and 'skip' is not an answer that can make a promise false.
const withRule = CIRCUMSTANCES.filter((c) => c.untrueOn !== undefined);
ok('🔴 AT LEAST ONE ROW USES THE MECHANISM, so this whole file is not asserting an empty set',
  withRule.length >= 1);
ok('every untrueOn names a yes or a no and carries its replacement with it',
  withRule.every((c) => (c.untrueOn.answer === 'yes' || c.untrueOn.answer === 'no')
    && typeof c.untrueOn.instead === 'string' && c.untrueOn.instead.length > 40));
ok('and no replacement anywhere promises money back',
  withRule.every((c) => !/come back to you|reclaim(ed)? the VAT/i.test(c.untrueOn.instead)));

// ── The type carries it as ONE object, which is what makes the half set state unwritable. ────
ok('🔴 THE TYPE PAIRS THE ANSWER AND THE REPLACEMENT IN A SINGLE FIELD',
  /untrueOn\?: \{ answer: Answer; instead: string \}/.test(modSrc));

// ── The circumstances page applies the rule, and holds no copy of it. ────────────────────────
ok('the page still has the card that draws a question',
  circPage.includes('function QuestionCard('));
ok('🔴 THE PAGE READS THE RULE OFF THE ROW AND COMPARES IT TO WHAT HE ANSWERED',
  /q\.untrueOn && current === q\.untrueOn\.answer \? q\.untrueOn\.instead : null/.test(circPage));
ok('🔴 AND THE PROMISE IS WITHHELD RATHER THAN THE ROW BEING HIDDEN',
  /withheld \? <p style=\{S\.notHis\}>\{withheld\}<\/p> : <p style=\{S\.why\}>\{q\.why\}<\/p>/.test(circPage));
ok('🔴 THE OLD UNGATED LINE IS GONE: q.why is never drawn on the strength of the persona alone',
  !/\{mine \? <p style=\{S\.why\}>\{q\.why\}<\/p>/.test(circPage));
ok('the persona axis was not traded away for the answer axis: NOT_HIS is still defined and still used',
  /const NOT_HIS =/.test(circPage) && /withheld = mine \? untrue : NOT_HIS/.test(circPage));
ok('and the claimant line goes with the promise, never stranded above a withheld one',
  /\{!withheld && whose \?/.test(circPage));

// The doctrine: THE ROW STAYS, DRAWN AND CHANGEABLE AND COUNTED. A fix that hid the question would
// have removed the promise and the man's ability to correct us in the same stroke.
ok('🔴 THE ROW IS STILL DRAWN, STILL ANSWERABLE AND STILL SHOWS WHAT HE SAID',
  /saidLine\(current, asked\)/.test(circPage)
  && /aria-pressed=\{on\}/.test(circPage)
  && /name="answer"/.test(circPage));

// ── /app/you/vat, the second sentence, branched in the same shape as the lede above it. ──────
ok('the VAT page still leads with the branch this one was missed beside',
  /profile\.registered \? 'You are VAT registered\.'/.test(vatPage));
ok('🔴 THE BLURB BRANCHES ON REGISTRATION TOO',
  /\{profile\.registered\s*\n?\s*\? 'What you tell us here decides/.test(vatPage));
// ⚠️ ANCHORED ON THE BLURB'S OWN OPENING WORDS. The lede one line above is the same
// `{profile.registered ? ... : ...}` shape and comes first in the file, so an unanchored match
// reads the lede, tests the lede, and reports on a line nobody changed.
const blurbArms = /\{profile\.registered\s*\n?\s*\? '(What you tell us here decides[^']*)'\s*\n?\s*: '([^']*)'\}/.exec(vatPage);
ok('both arms of the blurb are readable, so the two assertions below are about real strings',
  blurbArms !== null);
if (blurbArms) {
  ok('the registered arm still tells him what can come back to him, because it is true of him',
    /come back to you/.test(blurbArms[1]));
  ok('🔴 AND THE UNREGISTERED ARM DOES NOT, because nothing he has spent can',
    !/come back to you/.test(blurbArms[2]) && /carry none/.test(blurbArms[2]));
}

// ── The two surfaces that were already right, and do not know they are load bearing. ─────────
// ⚠️ EACH ONE PROVES ITS MARKERS EXIST BEFORE ANY ORDERING IS ASSERTED.
const waNo = waRoute.indexOf("if (answer === 'no') {");
const waWhy = waRoute.indexOf('`Good. ${c.why}`');
ok('both WhatsApp markers exist, so the ordering assertion below can actually fail',
  waNo >= 0 && waWhy >= 0);
ok('🔴 WHATSAPP STILL SENDS THE PROMISE ONLY AFTER THE NO BRANCH HAS RETURNED',
  waNo >= 0 && waWhy >= 0 && waNo < waWhy
  && /if \(answer === 'no'\) \{[\s\S]{0,400}?return true;\n  \}/.test(waRoute));

const setupSaid = /r\.answer === 'yes'/.test(setupPage);
const setupOpened = /const opened = askingOrder\(\)\.filter\(\(c\) => said\.has\(c\.key\)/.test(setupPage);
const setupDraws = /<div style=\{S\.openedWhy\}>\{c\.why\}<\/div>/.test(setupPage);
ok('all three setup markers exist, so the chain below is a real chain',
  setupSaid && setupOpened && setupDraws);
ok('🔴 AND /app/setup STILL LISTS THE PROMISE ONLY FOR A QUESTION HE ANSWERED YES',
  setupSaid && setupOpened && setupDraws
  && /\{opened\.map\(\(c\) => \(/.test(setupPage));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
ok('no en dash or em dash in the replacement or in the new page logic',
  !/[–—]/.test(vat?.untrueOn?.instead ?? '')
  && !/[–—]/.test(circPage.slice(circPage.indexOf('function QuestionCard('))));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
