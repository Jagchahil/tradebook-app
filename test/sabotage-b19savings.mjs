// SABOTAGE THE SAVINGS LANE ON ALL THREE ROUTERS, AND THE HONEST ROW READ UNDER IT.
// B19, 18 AUGUST 2026.
//
//   node test/sabotage-b19savings.mjs
//
// isSavingsQuestion has existed since Run 2 and was dispatched by app/api/whatsapp/route.ts and by
// NOTHING ELSE, because it was the only money lane with NO pure builder to move: the sentences were
// assembled inline in handleSavingsQuestion. So a man signed in at /app/thread who asked what
// Lekhio had actually saved him, which is the question a man asks the month he decides whether to
// keep paying, was answered by the MODEL.
//
// AND THE READ UNDER IT COULD NOT REPORT A FAILURE. getConfirmedTransactionsForRange answered `[]`
// for BOTH "he has confirmed nothing" and "Supabase replied 500", so ledgerFor saw a gross of zero
// and the lane sent "Nothing confirmed yet. Add your first entry or upload a bank statement, and
// this fills itself in." That is lib/laneanswers.ts's property finding for the second time, one
// layer lower down, and it also left lib/vatanswer.ts's VAT_UNREADABLE unable to fire for an HTTP
// error, because a non ok response does not throw and its `.catch` could never see it.
//
// FOUR suites hold the repair and this pass runs all four, because a sabotage caught by any of them
// is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs   section 12, the lane on three routers by index, above the model, and
//                              on /api/ask above the cache key, the cache read, the cache write and
//                              the daily cap; section 12a, the honest read; section 9b's scope table
//   test/b19savings.test.mjs   the builder on fixtures and the reader run against the real
//                              lib/supabase.ts over a fake transport
//   test/thread.test.mjs       the walk: a customer typing it into the web chat gets his own ledger
//   test/ledger.test.mjs       the ONE assembler pins, repointed here from the webhook
//
// The scratch tree is <tmp>/tradebook with a link to the real mobile repo beside it, and supabase/
// is copied because thread.test.mjs reads supabase/APPLY_*.sql off disk. A tree without it does not
// FAIL that suite, it CRASHES it, and then every sabotage scores as caught.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b19-sav-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a red CI.
const SUITES = [
  'test/laneparity.test.mjs',
  'test/b19savings.test.mjs',
  'test/thread.test.mjs',
  'test/ledger.test.mjs',
];
// 🔴 THE TALLY LINE IS NOT THE SAME IN EVERY SUITE, AND ASSUMING IT WAS COST THIS PASS ITS FIRST
// RESULT. test/ledger.test.mjs ends `${pass} passed, ${fail} failed` with NO FULL STOP; every other
// suite here ends with one. The sibling passes all carry `/\d+ passed, 0 failed\./`, so this suite
// looked RED in every tree, modified or not, and the pass reported 25 of 25 sabotages caught by a
// harness that could not tell them from an untouched repo. The six controls going red together is
// what caught it, which is exactly the tell the operating rules describe. The full stop is optional
// here, and the baseline check below means the next mismatch of this kind cannot be silent at all.
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed\.?/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

// 🔴 THE BASELINE, AND IT IS NEW ON 18 AUGUST 2026 AND BELONGS IN THE OTHER PASSES TOO.
//
// A sabotage pass measures a DIFFERENCE, and it has no way of knowing whether the red it sees came
// from the sabotage or from a harness that reds on everything. This repo has been bitten by that
// twice already, once through a missing supabase/ directory and once through a full disk, and both
// times the tell was "several no op controls red at once", read by a human afterwards. This makes
// it an assertion instead: an UNMODIFIED scratch tree must be GREEN before a single sabotage is
// scored, and the pass exits loudly if it is not. It costs one tree.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch() (supabase/ is one)');
    console.log('   2. every suite\'s tally line matches the regex in runSuite (ledger.test.mjs has no full stop)');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};
const editOnce = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.replace(from, to));
};
// "The lane is in the wrong place", sabotaged without quoting a whole router at itself. Both the
// lane and the anchor are proved present first, so a rename is a MISSED anchor rather than a
// sabotage that silently did nothing.
const demote = (dir, rel, lane, anchor) => {
  const p = path.join(dir, rel);
  let s = readFileSync(p, 'utf8');
  if (!s.includes(lane)) throw new Error(`LANE MISSING in ${rel}: ${lane.slice(0, 60)}`);
  if (!s.includes(anchor)) throw new Error(`ANCHOR MISSING in ${rel}: ${anchor.slice(0, 60)}`);
  s = s.replace(`${lane}\n`, '');
  s = s.replace(anchor, `${anchor}\n${lane}`);
  writeFileSync(p, s);
};

const WA = 'app/api/whatsapp/route.ts';
const TH = 'app/api/thread/route.ts';
const ASK = 'app/api/ask/route.ts';
const SAV = 'lib/savingsanswer.ts';
const WAI = 'lib/waintents.ts';
const DB = 'lib/supabase.ts';
const VAT = 'lib/vatanswer.ts';
const LP = 'test/laneparity.test.mjs';

const WA_LANE = '          } else if (isSavingsQuestion(text)) {\n            await handleSavingsQuestion(from);';
const TH_LANE = '  if (isSavingsQuestion(q)) return savingsAnswerForUser(userId);';
const ASK_LANE = '  if (!truth && isSavingsQuestion(question)) truth = await savingsAnswerForUser(userId);';

const SABOTAGES = [
  // ── B25, 18 AUGUST 2026. THE SET ASIDE QUESTION THIS LANE USED TO CLAIM. ────────────────
  {
    name: '🔴 B25: the set aside guard goes, so "am i saving enough for my tax bill" gets the savings ledger again',
    apply: ({ dir }) => edit(dir, WAI,
      "  // 🔴 B25: he is asking whether HE is putting enough by, which belongs to matchTotalsQuestion.\n  if (HE_IS_THE_SAVER.test(b)) return false;\n\n",
      ""),
  },
  {
    name: '🔴 B25: the guard loses its "for tax" arm, which is three of the thirteen straight back',
    apply: ({ dir }) => edit(dir, WAI, "\\b(enough|more|for (my |the )?tax)\\b", "\\b(enough|more)\\b"),
  },
  {
    name: '🔴 B25: the guard is made BLUNT, dropping the sufficiency word, which costs four real savings questions',
    apply: ({ dir }) => edit(dir, WAI,
      "\\bsav(e|es|ing)\\b[\\s\\S]{0,20}?\\b(enough|more|for (my |the )?tax)\\b",
      "\\bsav(e|es|ing)\\b"),
  },
  // ── A ROUTER LOSES THE LANE. The two web rows are the state of the world from Run 2 until today.
  {
    name: '🔴 THE THREAD loses the savings lane, which is exactly where it was until today',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, ''),
  },
  {
    name: '🔴 /api/ask loses the savings lane',
    apply: ({ dir }) => edit(dir, ASK, ASK_LANE, ''),
  },
  {
    name: '🔴 WHATSAPP loses the savings lane, the one channel that always had it',
    apply: ({ dir }) => edit(dir, WA, WA_LANE, ''),
  },
  {
    name: '🔴 the thread dispatches it but answers from the MODEL anyway, the fix wearing the defect',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, '  if (isSavingsQuestion(q)) return null;'),
  },

  // ── THE CACHE BOUNDS ON /api/ask. His saving is the largest personal figure this product prints,
  // ── and "was it worth it" carries no first person word, so it is classed GENERAL and cached.
  {
    name: '🔴 /api/ask answers his saving BELOW the shared cache key, so it can be cached under the question alone',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANE, '  const questionNorm = normaliseQuestion(question);'),
  },
  {
    name: '🔴 /api/ask meters him for asking what we saved him, by dropping the lane below the daily cap',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANE, "  const userCount = await bumpAiUsage('ask', userId);"),
  },
  {
    name: '🔴 /api/ask hands the question to the paid model first',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANE, '  const answer = await answerAccountantQuestion('),
  },

  // ── THE FINDING: A FAILED READ BECOMES A STATEMENT ABOUT HIS RECORDS. ───────────────────────
  {
    name: '🔴 THE ROW READER GOES BACK TO SWALLOWING AN HTTP ERROR AS AN EMPTY ROW SET',
    apply: ({ dir }) => edit(dir, DB, '  if (!res.ok) return null;\n  const rows = (await res.json().catch(() => null)) as (Array<Record<string, unknown>>) | null;\n  if (rows === null) return null;\n  return rows\n    .filter((r) => typeof r.transaction_date',
      '  if (!res.ok) return [];\n  const rows = (await res.json().catch(() => null)) as (Array<Record<string, unknown>>) | null;\n  if (rows === null) return [];\n  return rows\n    .filter((r) => typeof r.transaction_date'),
  },
  {
    name: '🔴 getOptimiserInput goes back to the FORGIVING reader, so nobody downstream can tell',
    apply: ({ dir }) => edit(dir, DB, 'getConfirmedTransactionsForRangeOrNull(userId, taxYearStart, todayISO)',
      'getConfirmedTransactionsForRange(userId, taxYearStart, todayISO)'),
  },
  {
    name: '🔴 getOptimiserInput reads honestly and then throws the fact away',
    apply: ({ dir }) => edit(dir, DB, '  const rowsUnreadable = rowsOrNull === null;', '  const rowsUnreadable = false;'),
  },
  {
    name: '🔴 the failure never reaches the object at all',
    apply: ({ dir }) => editOnce(dir, DB, '    observedDays,\n    rowsUnreadable,', '    observedDays,'),
  },
  {
    name: '🔴 THE BUILDER STOPS REFUSING, so a wobble is described as an empty book again',
    apply: ({ dir }) => edit(dir, WAI, '  if (input.unreadable) return LANE_UNREADABLE;', ''),
  },
  {
    name: '🔴 the reader tells the builder the read was fine whatever happened',
    apply: ({ dir }) => edit(dir, SAV, 'unreadable: input.rowsUnreadable === true,', 'unreadable: false,'),
  },
  {
    name: '🔴 the reader stops catching a THROWN read, the other half of the same failure',
    apply: ({ dir }) => edit(dir, SAV, '  if (input === null) return LANE_UNREADABLE;', '  if (input === null) return \'\';'),
  },
  {
    name: '🔴 THE VAT LANE GOES BACK TO THE HALF BLIND REFUSAL B18 COULD NOT FIRE',
    apply: ({ dir }) => edit(dir, VAT, 'getConfirmedTransactionsForRangeOrNull(userId, fromISO, todayISO)',
      'getConfirmedTransactionsForRange(userId, fromISO, todayISO)'),
  },

  // ── AND THE REFUSAL MUST NOT EAT THE TRUE EMPTY CASE, which is the same defect's other face. ──
  {
    name: '🔴 the refusal goes GREEDY and swallows the man who genuinely has nothing yet',
    apply: ({ dir }) => edit(dir, WAI, '  if (input.unreadable) return LANE_UNREADABLE;',
      '  if (input.unreadable || !input.enough) return LANE_UNREADABLE;'),
  },
  {
    name: '🔴 a young account is told to try again in a minute instead of being told how to start',
    apply: ({ dir }) => edit(dir, WAI, '  if (!input.enough) return input.note ?? \'Too early to say yet.\';',
      '  if (!input.enough) return LANE_UNREADABLE;'),
  },

  // ── THE WORDS HAVE ONE HOME. ────────────────────────────────────────────────────────────────
  {
    name: '🔴 a router grows its own copy of the Tesla screen, which is how two surfaces drift',
    apply: ({ dir }) => edit(dir, TH, TH_LANE,
      '  if (isSavingsQuestion(q)) return `Claiming nothing: £0 of tax\\nWith Lekhio: £0`;'),
  },
  {
    name: '🔴 THE CIS REFUND IS FOLDED INTO THE SAVING, promising a man money that is already his',
    apply: ({ dir }) => edit(dir, WAI, '  if (input.refundDue > 0) {', '  if (false && input.refundDue > 0) {'),
  },
  {
    name: '🔴 the money format goes back to a bare toLocaleString, which prints £4,120.4 at a customer',
    apply: ({ dir }) => edit(dir, WAI,
      'lines.push(`Claiming nothing: ${money(input.withoutLekhio)} of tax`);',
      'lines.push(`Claiming nothing: £${input.withoutLekhio.toLocaleString(\'en-GB\')} of tax`);'),
  },
  {
    name: '🔴 the headline is dropped, so the answer opens on a bare pair of numbers',
    apply: ({ dir }) => edit(dir, WAI, '  lines.push(input.headline);', ''),
  },
  {
    name: '🔴 the where it came from list runs long, so a text becomes a wall',
    apply: ({ dir }) => edit(dir, WAI, 'for (const x of input.lines.slice(0, 4)) {', 'for (const x of input.lines.slice(0, 8)) {'),
  },
  {
    name: '🔴 the reader starts doing its own arithmetic instead of asking the ONE assembler',
    apply: ({ dir }) => edit(dir, SAV, '  const l = ledgerFor(input);',
      '  const l = { enough: true, note: null, withoutLekhio: input.ytdTradeIncome * 0.29, withLekhio: 0, lines: [], refundDue: 0 };'),
  },

  // ── THE SCOPE TABLE IS THE SCOREBOARD AND IT MUST FOLLOW THE WORK. ──────────────────────────
  {
    name: '🔴 the scope table says WhatsApp only again, so 9b\'s tally lies about a wired lane',
    apply: ({ dir }) => edit(dir, LP, "  isSavingsQuestion: { on: ALL3, why: '' },",
      "  isSavingsQuestion: { on: WA_ONLY, why: 'a reason long enough to pass the length check entirely on its own' },"),
  },
  // ── AND THE ORDER AGAINST THE VEHICLE LANE, WHICH WAS WRONG ON THE THREAD FOR ONE COMMIT.
  {
    // ⚠️ THE LANE MOVES, NOT THE VEHICLE BLOCK. The first draft of this sabotage lifted
    // `if (isVehicleQuestion(q)) {` and left its body behind, which is a SYNTAX ERROR, and a suite
    // that dies of a syntax error is red for a reason that has nothing to do with any guard. It
    // scored as caught and proved nothing. Moving the savings lane, which is one whole statement on
    // one line, reproduces the defect exactly as it shipped and compiles cleanly.
    name: '🔴 the thread hoists savings ABOVE the vehicle lane, so "is a van worth it" gets the ledger',
    apply: ({ dir }) => demote(dir, TH, TH_LANE, '  if (totals) return totalsAnswer(userId, totals);'),
  },
  // ── AND THE GATE'S EAR FOR THIS LANE'S VOCABULARY. B23's rule is that the noun list gains a
  // ── lane's words when that lane gains routers, and this lane gained two of them today.
  {
    name: '🔴 the gate stops hearing "saved", so a man can ask about another man at a wired lane',
    apply: ({ dir }) => edit(dir, WAI, 'turned|billed|invoiced|saved|save|saves)', 'turned|billed|invoiced)'),
  },
  {
    name: '🔴 the possessive list loses "savings", so "what is jerome\'s saving" reaches his own figure',
    apply: ({ dir }) => edit(dir, WAI, "|rentals?|rent|savings?|saving)", '|rentals?|rent)'),
  },
  {
    name: '🔴 the unlinked number sentence is copied to the web, where that state cannot exist',
    apply: ({ dir }) => edit(dir, TH, TH_LANE,
      "  if (isSavingsQuestion(q)) return 'Send me a receipt or two first and I will show you exactly what I have saved you.';"),
  },
];

const CONTROLS = [
  {
    name: 'a comment inside lib/savingsanswer.ts is reworded',
    apply: ({ dir }) => edit(dir, SAV,
      '// 🔴 WHY ITS OWN FILE AND NOT lib/laneanswers.ts, ARGUED RATHER THAN ASSUMED.',
      '// 🔴 WHY ITS OWN FILE RATHER THAN lib/laneanswers.ts, ARGUED RATHER THAN ASSUMED.'),
  },
  {
    // ⚠️ RENAMED CONSISTENTLY, BOTH SITES. A control that cannot be applied cleanly is a broken
    // control, not a strict guard, and the sibling pass wrote that lesson down first.
    name: 'a local in the reader is RENAMED, which changes nothing a customer reads',
    apply: ({ dir }) => {
      edit(dir, SAV, '  const factNote = await factUpdateNote();', '  const note = await factUpdateNote();');
      edit(dir, SAV, '      factNote,\n', '      factNote: note,\n');
    },
  },
  {
    name: 'the lane name is pasted into a COMMENT beside the thread chain, where no customer can read it',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, `${TH_LANE}\n  // isSavingsQuestion`),
  },
  {
    name: 'a blank line beside the savings lane on /api/ask',
    apply: ({ dir }) => editOnce(dir, ASK, ASK_LANE, `${ASK_LANE}\n`),
  },
  {
    name: '⚠️ THE SAVINGS EAR IS WIDENED, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, WAI,
      "const SAVED_ME_SUBJECT = /\\b(me|us|my tax|so far|this year|anything)\\b/i;",
      "const SAVED_ME_SUBJECT = /\\b(me|us|my tax|so far|this year|anything|to date)\\b/i;"),
  },
  {
    name: 'a comment inside section 12 of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, LP,
      '// 12. B19: WHAT LEKHIO HAS SAVED HIM, ON ALL THREE ROUTERS, AND WHAT A FAILED READ SAYS.',
      '// 12. B19: WHAT LEKHIO HAS SAVED HIM, ON ALL THREE ROUTERS, AND WHAT A FAILED READ REPLIES.'),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL. Every call is capped at
// 45 seconds in a fresh sandbox and a detached process does not survive between calls, so a session
// that cannot run the whole pass has to be able to run it in pieces and say which pieces it ran.
// SAB_FROM and SAB_TO are indices into the sabotage list; unset means all of it, which is what CI
// and the Mac run. SAB_SKIP_CONTROLS skips the controls for the same reason.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
const RUNNING_C = process.env.SAB_SKIP_CONTROLS ? [] : CONTROLS;
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of RUNNING_C) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${cOk}/${RUNNING_C.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);
