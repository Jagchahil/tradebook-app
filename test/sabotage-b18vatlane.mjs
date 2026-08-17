// SABOTAGE THE VAT LANE ON ALL THREE ROUTERS. B18, 17 AUGUST 2026.
//
//   node test/sabotage-b18vatlane.mjs
//
// isVatQuestion existed from Run 2 and was dispatched by app/api/whatsapp/route.ts and by nothing
// else, so a VAT question typed into the web chat or the in app accountant was answered by the
// MODEL. Asked "am in glasgow, is vat different up here" by a signed in sole trader with 77
// confirmed entries, the chat returned the statute, correctly, and never mentioned his turnover.
//
// THREE suites hold the repair and this pass runs all three, because a sabotage caught by any of
// them is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs  section 7, the ROUTING on all three routers and the cache bound
//   test/run2fixes.test.mjs   F14, the OWNERSHIP and the order of the sentences
//   test/thread.test.mjs      the route RUN, which is the only proof of what a customer receives
//
// Every sabotage below is a way the finding comes back: a channel losing the lane, a router growing
// its own copy of the sentences, the answer losing the figure it leads with, the card fee note
// flattened or dropped, a failed read answered with a guess, or his own turnover reaching the
// shared cache.
//
// The scratch tree is <tmp>/tradebook with a link to the real mobile repo beside it, the same shape
// test/sabotage-b16scotintercept.mjs needs, because a suite that reads '../tradebook-app' and does
// not find it is red for the wrong reason and every sabotage then looks caught.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b18vat-'));
  const dir = path.join(base, 'tradebook');
  // ⚠️ supabase/ IS COPIED AND IT IS NOT OPTIONAL. Both test/run2fixes.test.mjs and
  // test/thread.test.mjs read APPLY_*.sql off disk, and a scratch tree without them does not fail
  // those suites, it CRASHES them, which this pass would score as every sabotage caught and every
  // control red. The four controls going red at once is the tell, and the corpus rule is that three
  // no op controls red at once is a broken harness rather than broken guards. This one was.
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a red CI.
const SUITES = ['test/laneparity.test.mjs', 'test/run2fixes.test.mjs', 'test/thread.test.mjs'];
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\./.test(out)) return true;
      if (!/\d+ passed, 0 failed\./.test(out)) return true;
    } catch { return true; }
  }
  return false;
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
// Lifts a code line out and puts it back somewhere else, so "the lane is in the wrong place" can be
// sabotaged without quoting the whole router at itself.
const moveLine = (dir, rel, needle, anchor, offset) => {
  const p = path.join(dir, rel);
  const lines = readFileSync(p, 'utf8').split('\n');
  const hit = lines.findIndex((l) => l.includes(needle) && !l.trimStart().startsWith('//'));
  if (hit === -1) throw new Error(`NO CODE LINE in ${rel} carrying: ${needle.slice(0, 50)}`);
  const [moved] = lines.splice(hit, 1);
  const at = lines.findIndex((l) => l.includes(anchor) && !l.trimStart().startsWith('//'));
  if (at === -1) throw new Error(`NO ANCHOR LINE in ${rel} carrying: ${anchor.slice(0, 50)}`);
  lines.splice(at + offset, 0, moved);
  writeFileSync(p, lines.join('\n'));
};

const WA_GATE = '          } else if (isVatQuestion(text)) {\n            await handleVatQuestion(from);\n';
const TH_GATE = '  if (isVatQuestion(q)) return vatAnswerForUser(userId);\n';
const ASK_GATE = '  if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId);\n';

const SABOTAGES = [
  // ── A CHANNEL LOSES THE LANE. This is the finding itself, one channel at a time. ──────────
  {
    name: '🔴 THE THREAD loses it, which is exactly the state the walk found live',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', TH_GATE, ''),
  },
  {
    name: '🔴 /api/ask loses it, the in app accountant, and the man is metered for the model answer',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts', ASK_GATE, ''),
  },
  {
    name: '🔴 WHATSAPP loses it, the channel a near line customer uses from a van',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts', WA_GATE, ''),
  },
  // ── THE ORDER. Each bound is a real defect in its own direction. ──────────────────────────
  {
    name: '🔴 sunk BELOW the totals lane, so "should i register for vat" is answered with a set aside figure',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isVatQuestion(q)) return vatAnswerForUser(userId);',
      'if (isDataRightsRequest(q)) return DATA_RIGHTS_ANSWER;', 1),
  },
  {
    name: '🔴 sunk BELOW the paid model call, so it answers correctly and charges him for it',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isVatQuestion(q)) return vatAnswerForUser(userId);',
      'const answer = await answerMoneyQuestion(q, summary, knowledge);', 1),
  },
  {
    name: '🔴 sunk BELOW the qa_cache key on /api/ask, so his own turnover can reach a SHARED cache',
    apply: ({ dir }) => moveLine(dir, 'app/api/ask/route.ts',
      'if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId);',
      'const questionNorm = normaliseQuestion(question);', 1),
  },
  {
    name: 'a second call site is added to the thread, so no index names one lane any more',
    apply: ({ dir }) => editOnce(dir, 'app/api/thread/route.ts', TH_GATE, TH_GATE + TH_GATE),
  },
  // ── THE ANSWER ITSELF. The routing can be perfect and the words still wrong. ──────────────
  {
    name: '🔴 THE FIGURE STOPS LEADING: the statutory tests are pushed ahead of his standing',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts',
      "  const parts: string[] = [standingSentence(s, gbp)];",
      "  const parts: string[] = [BACKWARD_TEST];\n  parts.push(standingSentence(s, gbp));"),
  },
  {
    name: '🔴 the backward test goes, so a man is told the forward look and not the rolling one',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts', '  parts.push(BACKWARD_TEST);\n', ''),
  },
  {
    name: '🔴 the forward test goes, and it is the one that registers you the same day',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts', '  parts.push(FORWARD_TEST);\n', ''),
  },
  {
    name: "🔴 THE CARD FEE NOTE IS DROPPED, so a near line customer is warned on one channel and not the others",
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts',
      "  if ('nearLine' in s && s.nearLine) parts.push(CARD_FEE_NOTE);\n", ''),
  },
  {
    name: '⚠️ the card fee note is FLATTENED to always, which is noise on a man nowhere near the line',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts',
      "  if ('nearLine' in s && s.nearLine) parts.push(CARD_FEE_NOTE);",
      '  parts.push(CARD_FEE_NOTE);'),
  },
  {
    name: 'the gov.uk source stops travelling, so a statutory claim cannot be checked',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts', '  parts.push(VAT_SOURCE);\n', ''),
  },
  // ── THE READ. A guess is the one answer a man near the line must never be given. ──────────
  {
    name: '🔴 A FAILED READ IS ANSWERED ANYWAY, so an unreadable account is told it is under the line',
    apply: ({ dir }) => edit(dir, 'lib/vatanswer.ts',
      '  if (rows === null) return VAT_UNREADABLE;',
      '  if (rows === undefined) return VAT_UNREADABLE;'),
  },
  {
    name: '🔴 the refusal sentence loses its words, so three channels stop refusing alike',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts',
      "  'I could not read your figures just now, and I am not going to answer a VAT question with a '\n  + 'guess. Try me again in a minute.'",
      "  'Sorry, something went wrong. Try again.'"),
  },
  // ── OWNERSHIP. Three callers and one owner, or it is Run 2's evening again. ───────────────
  {
    name: '🔴 THE THREAD GROWS ITS OWN COPY of the assembly, so there are two owners with one wearing the fix',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      '  if (isVatQuestion(q)) return vatAnswerForUser(userId);',
      '  if (isVatQuestion(q)) return [BACKWARD_TEST, FORWARD_TEST].join(String.fromCharCode(10));'),
  },
  {
    name: '🔴 a router reads the rows for itself, which is how three doors answered three ways',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId);',
      '  if (!truth && isVatQuestion(question)) truth = String(vatStanding([], "2026-08-17", 90000).kind);'),
  },
  {
    name: 'a second reader appears, so lib/vatanswer.ts is no longer the ONE reader',
    apply: ({ dir }) => edit(dir, 'lib/vatanswer.ts',
      'export async function vatAnswerForUser(userId: string): Promise<string> {',
      'export async function vatAnswerForUserLegacy(): Promise<string> { return VAT_UNREADABLE; }\nexport async function vatAnswerForUser(userId: string): Promise<string> {'),
  },
  {
    name: 'a second definition of the matcher appears, so there is no longer ONE rule',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isVatQuestion(body: string): boolean {',
      'export function isVatQuestionOld(body: string): boolean { return false; }\nexport function isVatQuestion(body: string): boolean {'),
  },
  {
    name: '🔴 THE READER IS CALLED WITH SOMEBODY ELSE, which reads as wired and answers about the wrong man',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      '  if (isVatQuestion(q)) return vatAnswerForUser(userId);',
      "  if (isVatQuestion(q)) return vatAnswerForUser('u-2');"),
  },
];

const CONTROLS = [
  {
    name: 'a comment above the shared builder is reworded',
    apply: ({ dir }) => edit(dir, 'lib/vatstanding.ts',
      '// The source travels with the answer, on every channel.',
      '// The source travels with the answer, on every channel and every surface.'),
  },
  {
    name: 'a comment inside the reader is reworded',
    apply: ({ dir }) => edit(dir, 'lib/vatanswer.ts',
      '// Twelve months back plus a margin, so the window is closed by vatStanding rather than by the',
      '// Twelve months back plus a margin. The window is closed by vatStanding rather than by the'),
  },
  {
    name: '⚠️ THE LOOKBACK IS WIDENED, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, 'lib/vatanswer.ts', 'const LOOKBACK_DAYS = 400;', 'const LOOKBACK_DAYS = 460;'),
  },
  {
    name: 'a blank line inside the builder, which changes nothing about what he reads',
    apply: ({ dir }) => editOnce(dir, 'lib/vatstanding.ts',
      'export function vatAnswer(s: VatStanding, gbp: (n: number) => string): string {\n',
      'export function vatAnswer(s: VatStanding, gbp: (n: number) => string): string {\n\n'),
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
