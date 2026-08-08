// THE /start DRAFT, PROBLEM ONE OF TWO ON LANE L7.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Jag's words: "/start loses all six answers on a refresh, with no draft and no warning... this
// is exactly the interrupted between jobs case the product exists for." /app/setup never loses
// an answer because every screen posts to the server before the next one draws. /start runs
// before an account exists, so it holds the six answers in sessionStorage instead, in
// app/start/draft.ts, and page.tsx restores from it once after mount.
//
// THIS SUITE HAS TWO HALVES.
//
//   1. EXECUTABLE. app/start/draft.ts has no JSX and no relative import needing an extension, so
//      it loads directly under bare node exactly like a lib/*.ts guard test. A fake
//      window.sessionStorage stands in for the browser, and a "reload" is simulated the only way
//      that is actually faithful to what a reload is: draft.ts holds no state of its own between
//      calls, so writing a draft and then calling readDraft() again, with nothing carried over in
//      JS, IS the reload. If this suite is ever run against a version of draft.ts that keeps a
//      module level cache instead of re-reading storage, that faithfulness breaks and case 1
//      below stops proving anything, which is why it is asserted on its own first.
//
//   2. STRUCTURAL, on page.tsx, for the two guarantees an executable test of draft.ts alone
//      cannot reach because they are about REACT WIRING, not storage: that restoring a draft can
//      never itself cause a submit, and that the draft is cleared the moment the flow completes.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

// ── A minimal, faithful sessionStorage, in memory, so this file can stand in for a browser tab. ──
class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (this.throwOnWrite) throw new Error('QuotaExceededError (simulated)');
    this.map.set(k, String(v));
  }
  removeItem(k) { this.map.delete(k); }
}

globalThis.window = { sessionStorage: new FakeStorage() };
const D = await import(pathToFileURL(path.join(root, 'app/start/draft.ts')).href);
const { DRAFT_KEY, TOTAL, readDraft, writeDraft, clearDraft } = D;

const sampleAnswers = {
  v: 1,
  t0: 1_754_000_000_000,
  step: 4,
  phone: '+447700900123',
  email: 'sam@example.com',
  tradeType: 'partnership',
  share: '50',
  name: 'Smith & Jones',
  personName: 'Sam Smith',
  trade: 'Electrician',
  customTrade: '',
  postcode: 'LS1 4AB',
  address: 'Unit 4, Mill Road, Leeds',
  vat: true,
  streams: ['property', 'loan'],
};

console.log('\n=== 1. EXECUTABLE: the six answers survive a simulated reload ===\n');

ok('a fresh tab, no draft ever written, restores to nothing', readDraft() === null);

writeDraft(sampleAnswers);
// THE RELOAD. Nothing above this line is carried forward by hand: draft.ts keeps no state of
// its own between calls, so this second, independent call to readDraft() is exactly what a real
// page load does after a refresh, a crashed tab restored by the browser, or a call that
// backgrounded the tab and was returned to. If this test ever needs to pass any variable from
// the write above into the read below, the simulation has stopped being honest.
const restored = readDraft();

ok('🔴 THE SIX ANSWERS SURVIVE THE RELOAD, all of them, not a subset',
  restored !== null
  && restored.step === sampleAnswers.step
  && restored.phone === sampleAnswers.phone
  && restored.email === sampleAnswers.email
  && restored.tradeType === sampleAnswers.tradeType
  && restored.share === sampleAnswers.share
  && restored.name === sampleAnswers.name
  && restored.personName === sampleAnswers.personName
  && restored.trade === sampleAnswers.trade
  && restored.postcode === sampleAnswers.postcode
  && restored.address === sampleAnswers.address
  && restored.vat === sampleAnswers.vat
  && JSON.stringify(restored.streams) === JSON.stringify(sampleAnswers.streams));

ok('the original start time survives too, so the bot trap in /api/onboard reads the true elapsed time',
  restored.t0 === sampleAnswers.t0);

ok('restoring twice in a row (two refreshes back to back) gives the identical answers both times',
  JSON.stringify(readDraft()) === JSON.stringify(restored));

console.log('\n=== 2. EXECUTABLE: cleared the moment the flow completes ===\n');

clearDraft();
ok('after clearDraft(), the tab has nothing left to restore', readDraft() === null);
ok('clearDraft() actually removed the key rather than blanking it',
  window.sessionStorage.getItem(DRAFT_KEY) === null);

console.log('\n=== 3. EXECUTABLE: never trusts what comes back ===\n');

window.sessionStorage.setItem(DRAFT_KEY, 'not json at all {{{');
ok('corrupted JSON restores to nothing rather than throwing', readDraft() === null);

window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, step: 3 }));
ok('a future or unrecognised version restores to nothing rather than guessing at its shape',
  readDraft() === null);

window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
  v: 1, step: 999, tradeType: 'sole_proprietor_of_the_moon', vat: 'yes', streams: 'not an array',
  phone: 12345, t0: -1,
}));
{
  const d = readDraft();
  ok('a step outside 1..TOTAL clamps back to step 1 rather than opening a screen that does not exist',
    d.step === 1);
  ok('an unrecognised tradeType clamps to null rather than inventing a structure he never picked',
    d.tradeType === null);
  ok('vat that is not literally true/false clamps to false, the same default the field starts at',
    d.vat === false);
  ok('streams that is not an array becomes an empty one, never a crash',
    Array.isArray(d.streams) && d.streams.length === 0);
  ok('a non string phone becomes an empty string, never the raw number',
    d.phone === '');
  ok('a nonsense t0 in the past is replaced with now, not trusted as the true start time',
    d.t0 > 1_700_000_000_000);
}

ok('TOTAL really is 6, the six answers Jag counted, not a stray number this test invented',
  TOTAL === 6);

console.log('\n=== 4. EXECUTABLE: a bad connection or a full tab never breaks the page ===\n');

window.sessionStorage.throwOnWrite = true;
try {
  writeDraft(sampleAnswers);
  ok('writeDraft() swallows a storage failure rather than throwing through the page', true);
} catch {
  ok('writeDraft() swallows a storage failure rather than throwing through the page', false);
}
window.sessionStorage.throwOnWrite = false;

console.log('\n=== 5. EXECUTABLE: honesty about what SSR sees ===\n');

{
  const savedWindow = globalThis.window;
  delete globalThis.window;
  let threw = false;
  let readResult;
  try {
    readResult = D.readDraft();
    D.writeDraft(sampleAnswers);
    D.clearDraft();
  } catch {
    threw = true;
  }
  globalThis.window = savedWindow;
  ok('with no window at all (server rendering), readDraft/writeDraft/clearDraft do nothing and never throw',
    !threw && readResult === null);
}

console.log('\n=== 6. STRUCTURAL, on page.tsx: restoring can never itself cause a submit ===\n');

const pageSrc = read('app/start/page.tsx');
const draftSrc = read('app/start/draft.ts');
// Comments stripped before asking what the CODE does, same discipline test/signupsic.test.mjs
// and friends use: a comment can describe an old bug without being mistaken for a live one.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const pageCode = codeOnly(pageSrc);

// Find the restore effect: the useEffect whose dependency array is [] and whose body calls
// readDraft(). Isolated by braces so the checks below cannot accidentally credit the SAVE effect
// (which never restores anything) or next()/submitSignup (which are function declarations, not
// effects) with having been checked.
const restoreEffectMatch = pageCode.match(/useEffect\(\(\) => \{[\s\S]*?readDraft\(\)[\s\S]*?\n {2}\}, \[\]\);/);
ok('the restore effect exists, keyed on calling readDraft() inside a mount only effect',
  restoreEffectMatch !== null);
const restoreEffect = restoreEffectMatch ? restoreEffectMatch[0] : '';

ok('🔴 RESTORING NEVER CALLS next(), so a restored draft cannot walk itself to the final step and submit',
  restoreEffect.length > 0 && !/\bnext\(\)/.test(restoreEffect));
ok('🔴 RESTORING NEVER CALLS submitSignup OR sendCode directly',
  restoreEffect.length > 0 && !/submitSignup\(|sendCode\(/.test(restoreEffect));
ok('🔴 RESTORING NEVER FETCHES ANYTHING. It only ever reads sessionStorage and calls React setters',
  restoreEffect.length > 0 && !/\bfetch\(/.test(restoreEffect));
ok('🔴 RESTORING NEVER TOUCHES THE HONEYPOT. `hp`/setHp do not appear in the restore effect at all',
  restoreEffect.length > 0 && !/\bhp\b|\bsetHp\b/.test(restoreEffect));
ok('applyDraft, which the restore effect delegates to, is equally silent: no next, no submit, no fetch',
  /function applyDraft\([\s\S]*?\n {2}\}/.test(pageCode)
  && !/function applyDraft\([\s\S]*?\n {2}\}/.exec(pageCode)[0].match(/next\(\)|submitSignup\(|sendCode\(|fetch\(/));

console.log('\n=== 7. STRUCTURAL: cleared the instant the six questions are behind him ===\n');

// next() is the only place the flow can complete from. clearDraft() has to run before setDone
// becomes true in it, or a reload on the code entry screen would resurrect answers that have
// already been posted.
const nextFnMatch = pageCode.match(/async function next\(\) \{[\s\S]*?\n {2}\}/);
ok('next() exists and is where the six question flow ends', nextFnMatch !== null);
const nextFn = nextFnMatch ? nextFnMatch[0] : '';
ok('🔴 clearDraft() RUNS INSIDE next(), BEFORE setDone(true), not after and not never',
  /clearDraft\(\)[\s\S]*?setDone\(true\)/.test(nextFn));

console.log('\n=== 8. STRUCTURAL: session, not local, and the honeypot never joins the draft ===\n');

// Checks actual property access (window.localStorage), not the bare word: draft.ts's own
// doctrine comment says "never localStorage" and "REJECTED: localStorage" in prose, explaining
// the decision, and that honest sentence should not fail the very check it is documenting.
ok('🔴 draft.ts reads and writes sessionStorage, never localStorage',
  /window\.sessionStorage/.test(draftSrc) && !/window\.localStorage/.test(draftSrc));
ok('page.tsx itself never touches storage directly either; every read and write goes through ./draft',
  !/\bsessionStorage\b/.test(pageCode) && !/\blocalStorage\b/.test(pageCode));
ok('the honeypot field has no place in the draft shape at all',
  !/\bhp\s*:/.test(draftSrc) && !/\bwebsite\s*:/.test(draftSrc));
ok('the bot trap itself is untouched: ts is still measured as Date.now() minus t0, on submit',
  /ts: Date\.now\(\) - t0,/.test(pageCode));
ok('t0 is restorable (has a real setter), which is what keeps a fast resumed submission honest',
  /const \[t0, setT0\] = useState/.test(pageCode));

console.log('\n=== 9. STRUCTURAL: the best button is no button (doc 103), with one honest way out ===\n');

ok('no dialogue asks whether to restore; it just happens, then says so',
  !/Continue where you left off\?|Restore your answers\?|Would you like to/.test(pageSrc));
ok('the notice is worded as a statement of fact, not a question with only one sensible answer',
  /We kept your answers from before\./.test(pageSrc));
ok('there is a real, working way out for the rare case it is not him: it wipes the draft and every field',
  /function startOver\(\): void \{[\s\S]*?clearDraft\(\)/.test(pageCode));
ok('the notice only shows him something worth saying: it is gated on there having been real progress (step > 1)',
  /if \(found\.step > 1\) setRestoredNotice\(true\)/.test(pageCode));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
