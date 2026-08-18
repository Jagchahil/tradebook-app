// SABOTAGE THE THIRD PARTY GATE ON ALL THREE ROUTERS, AND THE SCOPE TABLE THAT WATCHES THEM ALL.
// B19, 17 AUGUST 2026.
//
//   node test/sabotage-b19lanes.mjs
//
// isAboutSomeoneElse is not an answer lane. It is the GATE that stops a lane reading his books to
// answer a question that was not about them, and it has been found three times on three surfaces:
// Run 1 on the chat router (her own set aside figure read out as an answer about the barber next
// door), Run 2 built it and wired it to WhatsApp only, Run 3 found the chat router still had no gate
// of any kind. NOBODY EVER WIRED app/api/ask, so from Run 2 until today a man typing "how much has
// jerome made this year" into the in app accountant reached the model.
//
// THREE suites hold the repair and this pass runs all three, because a sabotage caught by any of
// them is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs  section 9, the GATE on all three routers and both /api/ask bounds,
//                             and section 9b, the derived scope table
//   test/run3fixes.test.mjs   the PREDICATE itself, the named person shape and the refusal's words
//   test/thread.test.mjs      the route RUN, which is the only proof of what a customer receives
//
// ⚠️ AND HALF OF THIS PASS SABOTAGES THE SCOPE TABLE RATHER THAN THE GATE, ON PURPOSE. Section 9b
// is the first thing in this repo that can SEE a lane landing on one router out of three, which is
// the shape of four separate findings. A table nobody has proved bites is a table, not a guard, so
// it is attacked in every direction it claims to hold: a lane widened without a reason, a lane
// narrowed, a new lane left unclassified, a row gone dead, and a reason emptied out.
//
// The scratch tree is <tmp>/tradebook with a link to the real mobile repo beside it, and supabase/
// is copied because test/thread.test.mjs reads APPLY_*.sql off disk. A tree without it does not FAIL
// that suite, it CRASHES it, and then every sabotage scores as caught and every control as broken.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b19lane-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a red CI.
const SUITES = ['test/laneparity.test.mjs', 'test/run3fixes.test.mjs', 'test/thread.test.mjs'];
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
// Lifts a code line out and puts it back somewhere else, so "the gate is in the wrong place" can be
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

const WA_GATE = '          } else if (isAboutSomeoneElse(text)) {\n            await sendText(from, SOMEONE_ELSE_ANSWER);\n';
const TH_GATE = '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;\n';
const ASK_GATE = '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;\n';

const SABOTAGES = [
  // ── A CHANNEL LOSES THE GATE. This is the finding itself, one channel at a time. ──────────
  {
    name: '🔴 /api/ask loses it, which is EXACTLY the state this packet found and the state of the world until today',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts', ASK_GATE, ''),
  },
  {
    name: '🔴 THE THREAD loses it, which is the state Run 3 found live on the router Run 1 came from',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', TH_GATE, ''),
  },
  {
    name: '🔴 WHATSAPP loses it, which is the state Run 1 found and Run 2 fixed',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts', WA_GATE, ''),
  },

  // ── THE ORDER. A gate below the lanes it guards is not a gate. ─────────────────────────────
  {
    name: '🔴 ask: sunk BELOW the VAT lane, so "whats his vat turnover" is answered from HIS OWN rolling twelve months',
    apply: ({ dir }) => moveLine(dir, 'app/api/ask/route.ts',
      'if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
      'if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId, question);', 1),
  },
  {
    name: '🔴 ask: sunk BELOW the qa_cache key, so an invented answer about a named third party can be SHARED',
    apply: ({ dir }) => moveLine(dir, 'app/api/ask/route.ts',
      'if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
      'const questionNorm = normaliseQuestion(question);', 1),
  },
  {
    name: '🔴 ask: sunk BELOW the read of his books, which is Run 1 on the third surface',
    apply: ({ dir }) => moveLine(dir, 'app/api/ask/route.ts',
      'if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
      'context = await transactionSummaryForUser(userId, 120);', 1),
  },
  {
    name: '🔴 thread: sunk BELOW the totals lane, which is Run 1\'s finding word for word',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
      'const totals = matchTotalsQuestion(q);', 1),
  },
  {
    name: '🔴 thread: sunk BELOW the paid model call, so his ledger is handed over and he is charged for it',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
      'const answer = await answerMoneyQuestion(q, summary, knowledge);', 1),
  },
  {
    name: 'ask: a second call site is added, so no index names one gate any more',
    apply: ({ dir }) => editOnce(dir, 'app/api/ask/route.ts', ASK_GATE, ASK_GATE + ASK_GATE),
  },

  // ── THE GATE FIRES AND NOTHING HAPPENS. The worst kind, because it reads as wired. ─────────
  {
    name: '🔴 ask: the gate is asked about a CONSTANT rather than his question, so it can never fire',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
      "  if (!truth && isAboutSomeoneElse('')) truth = SOMEONE_ELSE_ANSWER;"),
  },
  {
    name: '🔴 ask: the gate fires and assigns nothing, so the question falls through to the model anyway',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
      "  if (!truth && isAboutSomeoneElse(question)) truth = '';"),
  },

  // ── THE PREDICATE ITSELF, which all three routers share. ──────────────────────────────────
  {
    name: '🔴 the gate always says no, so every router is wired to a function that never refuses',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isAboutSomeoneElse(body: string, selfNames: string[] = []): boolean {\n  const b = body.trim();',
      'export function isAboutSomeoneElse(body: string, selfNames: string[] = []): boolean {\n  if (body || selfNames) return false;\n  const b = body.trim();'),
  },
  {
    name: '🔴 the NAMED PERSON branch goes, which is Run 3 exactly: "how much has jerome made this year"',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts', '  if (named) return true;\n', ''),
  },
  {
    name: '🔴 a real first name is swallowed by the stoplist, so one partner is discussable and the rest are not',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  'year', 'month', 'week', 'quarter', 'day', 'today', 'yesterday', 'tomorrow', 'april', 'january',",
      "  'year', 'month', 'week', 'quarter', 'day', 'today', 'yesterday', 'tomorrow', 'april', 'january', 'jerome',"),
  },
  {
    name: '🔴 the refusal stops saying we cannot see his books and becomes a hedge',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  'I can only see your books, so I have no idea and could not tell you if I did. If it is your own '\n  + 'figures you are after, ask me about those and I will give you them straight.';",
      "  'I am not able to help with that one.';"),
  },

  // ── THE SCOPE TABLE. Section 9b is the only thing that can SEE the next lane land on one ──
  // ── router, so it is attacked in every direction it claims to hold. ───────────────────────
  {
    // 🔴 REPOINTED 17 August 2026, AND THE REASON IS THE POINT OF THE SABOTAGE.
    //
    // This sabotage used isNiQuestion, because on the day it was written isNiQuestion was declared
    // WA_ONLY and adding a second router to it was a lane landing somewhere the table did not know
    // about. B19's three lane packet then WIRED isNiQuestion to all three routers and widened the
    // table to match, correctly and deliberately. From that commit this sabotage went on applying
    // cleanly and stopped biting: it added a call the table already declared, so nothing went red
    // and the pass reported it MISSED.
    //
    // ⚠️ SO THE SPECIMEN IS NOW A SETTLED DECISION AND NOT AN OPEN DEBT. isGreeting is WhatsApp
    // only because nobody types hello into an accountant box, which is a reason that does not
    // expire. Picking isSavingsQuestion or isIdentity would have armed the same trap again: both
    // were B19 debts and both were MEANT to gain routers, so both would kill this sabotage the day
    // somebody did the work it exists to protect.
    //
    // 🟢 AND THAT DAY CAME, WHICH IS THE PROOF THE CHOICE WAS RIGHT RATHER THAN AN ANECDOTE ABOUT
    // IT. isSavingsQuestion went to all three routers on 18 August 2026 and isIdentity followed it
    // hours later, closing B19. Had either been the specimen, this sabotage would have died twice
    // in one day. isGreeting and matchStopStart are untouched and still biting. Corrected in place
    // 18 August 2026: the two lanes named above are no longer debts, and the past tense says so.
    name: '🔴 TABLE: a lane is wired to a new router and nobody widens the table, which is the whole shape of B19',
    apply: ({ dir }) => {
      edit(dir, 'app/api/ask/route.ts',
        '  isNiQuestion, isStudentLoanQuestion, isPropertyQuestion,',
        '  isNiQuestion, isStudentLoanQuestion, isPropertyQuestion, isGreeting,');
      edit(dir, 'app/api/ask/route.ts',
        '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
        '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;\n  if (isGreeting(question)) { /* wired, unclassified */ }');
    },
  },
  {
    name: '🔴 TABLE: a brand new predicate is dispatched and never classified at all',
    apply: ({ dir }) => {
      edit(dir, 'lib/waintents.ts',
        'export function isAboutSomeoneElse(',
        'export function isBrandNewLane(b: string): boolean { return b === "x"; }\n\nexport function isAboutSomeoneElse(');
      edit(dir, 'app/api/thread/route.ts',
        '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
        '  if (isBrandNewLane(q)) return SOMEONE_ELSE_ANSWER;\n  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;');
    },
  },
  {
    // 🔴 REPOINTED 17 August 2026. This quoted the isNiQuestion row while that row read WA_ONLY.
    // B19's three lane packet changed the row to ALL3, the anchor stopped existing, and the pass
    // reported ANCHOR MISSING. Same specimen rule as above: matchStopStart is WhatsApp only because
    // STOP and START are a messaging channel obligation, which is a reason that cannot expire.
    name: '🔴 TABLE: the table CLAIMS three routers for a lane that is on one, which is the optimistic lie',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '  matchStopStart: { on: WA_ONLY,',
      '  matchStopStart: { on: ALL3,'),
  },
  {
    // ⚠️ isWeeklySummaryRequest AND NOT isPricing, AND THE FIRST DRAFT IS THE REASON. isPricing has
    // TWO call sites in the webhook, the dispatch and the paywall exemption at alwaysAnswered, so
    // deleting the dispatch left the name still called and the row still alive. This sabotage was
    // MISSED and the table was innocent: a lane with a second caller has not rotted. Picked a lane
    // with exactly one call site, which is what this direction is actually about.
    name: '🔴 TABLE: a row goes dead because the lane it names is unwired, and the table keeps the row',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts',
      '          } else if (isWeeklySummaryRequest(text)) {\n            await handleWeeklySummary(from);\n', ''),
  },
  {
    // 🔴 REPOINTED 17 August 2026, for the same reason and by the same rule. The old anchor quoted
    // the isNiQuestion row's WHOLE B19 DEBT sentence, so it broke the moment the debt was paid.
    name: '🔴 TABLE: an asymmetry keeps its row and loses its reason, so nobody has to argue for it',
    apply: ({ dir }) => editOnce(dir, 'test/laneparity.test.mjs',
      "  matchStopStart: { on: WA_ONLY, why: 'STOP and START are a messaging channel obligation and mean nothing in a web form.' },",
      "  matchStopStart: { on: WA_ONLY, why: '' },"),
  },
];

const CONTROLS = [
  {
    name: 'a comment above the gate on /api/ask is reworded',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  // This is not an answer lane. It is the GATE that stops a lane reading his books to answer a',
      '  // This is not an answer lane at all. It is the GATE that stops a lane reading his books to answer a'),
  },
  {
    name: 'a comment inside section 9 of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '// ⚠️ THE ORDER IS THE WHOLE GUARD. A gate below the lanes it guards is not a gate, it is a second',
      '// ⚠️ THE ORDER IS THE WHOLE GUARD. A gate under the lanes it guards is not a gate, it is a second'),
  },
  {
    name: '⚠️ THE THIRD PARTY EAR IS WIDENED, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '(?:barber|shop|business|bloke|guy|woman|man|lad|fella|neighbour|neighbor|competitor|mate|friend|brother|sister|cousin|landlord|tenant|customer|client)',
      '(?:barber|plumber|sparky|shop|business|bloke|guy|woman|man|lad|fella|neighbour|neighbor|competitor|mate|friend|brother|sister|cousin|landlord|tenant|customer|client)'),
  },
  {
    name: 'a blank line beside the gate on the thread, which changes nothing about what he reads',
    apply: ({ dir }) => editOnce(dir, 'app/api/thread/route.ts',
      '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;\n',
      '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;\n\n'),
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
