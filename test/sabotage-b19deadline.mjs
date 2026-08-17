// SABOTAGE THE DEADLINE LANE ON ALL THREE ROUTERS. B19, 17 AUGUST 2026.
//
//   node test/sabotage-b19deadline.mjs
//
// deadlineAnswer() learned WHO IS ASKING on 7 August 2026, because until then it told a limited
// company director his quarterly update was due for a return his company does not file. Two routers
// were taught to hand over the asker that day. THERE ARE THREE. app/api/ask, the in app accountant,
// had no deadline lane of any kind, so a man who typed "when is my tax due" into the box in the app
// was answered by the MODEL, which holds none of the three facts the answer turns on.
//
// AND THE CACHE IS WHY IT WAS WORSE THAN A WORSE REPLY. "when is the self assessment deadline"
// carries no first person word, so /api/ask classes it GENERAL and writes the answer to qa_cache,
// which is keyed on the QUESTION ALONE with no user id. The answer depends on HIS structure. A
// director's reply, cached, is read back to a sole trader as his own.
//
// THREE suites hold the repair and this pass runs all three, because a sabotage caught by any of
// them is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs          section 3, the tie break derived over three routers; section
//                                     10, the lane and all four /api/ask bounds; section 9b, the
//                                     derived scope table that watches every predicate
//   test/wave9_deadlineasker.test.mjs the six positions, and the three call sites passing the asker
//   test/waintents.test.mjs           the predicate and the tie break themselves
//
// The scratch tree is <tmp>/tradebook with a link to the real mobile repo beside it, and supabase/
// is copied even though none of these three suites reads it: the shape of the tree is a property of
// this repo's suites, not of the three named above, and a tree that is right only by luck is the
// bug that scored four controls red at once on 17 August.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b19dl-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a red CI.
const SUITES = [
  'test/laneparity.test.mjs',
  'test/wave9_deadlineasker.test.mjs',
  'test/waintents.test.mjs',
];
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
const moveBlock = (dir, rel, startNeedle, lineCount, anchor, offset) => {
  const p = path.join(dir, rel);
  const lines = readFileSync(p, 'utf8').split('\n');
  const hit = lines.findIndex((l) => l.includes(startNeedle) && !l.trimStart().startsWith('//'));
  if (hit === -1) throw new Error(`NO CODE LINE in ${rel} carrying: ${startNeedle.slice(0, 50)}`);
  const moved = lines.splice(hit, lineCount);
  const at = lines.findIndex((l) => l.includes(anchor) && !l.trimStart().startsWith('//'));
  if (at === -1) throw new Error(`NO ANCHOR LINE in ${rel} carrying: ${anchor.slice(0, 50)}`);
  lines.splice(at + offset, 0, ...moved);
  writeFileSync(p, lines.join('\n'));
};

// The whole /api/ask lane, seven lines, which is what a router loses when a lane is "removed".
const ASK_LANE = `  if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {
    const o = await getOptimiserInput(userId).catch(() => null);
    truth = deadlineAnswer(new Date(), {
      structure: o?.businessType ?? null,
      mtdPosition: null,
    });
  }
`;
const TH_LANE_HEAD = '  if (isDeadlineQuestion(q) && !asksAmount(q)) {';
const WA_LANE_HEAD = '          } else if (isDeadlineQuestion(text) && !asksAmount(text)) {';

const SABOTAGES = [
  // ── A ROUTER LOSES THE LANE. This is the finding itself, one surface at a time. ────────────
  {
    name: '🔴 /api/ask LOSES THE LANE, which is exactly the state of the world from 7 August until today',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts', ASK_LANE, ''),
  },
  {
    name: '🔴 THE THREAD loses it, so "when is my tax due" goes back to the model on the web chat',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', TH_LANE_HEAD, '  if (false) {'),
  },
  {
    name: '🔴 WHATSAPP loses it, which is the channel the lane was built for',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts', WA_LANE_HEAD, '          } else if (false) {'),
  },

  // ── THE TIE BREAK. Drop it and a man asking for a FIGURE is handed a DATE, which is the ────
  // ── same defect with the hands changed over, per laneparity section 2. ─────────────────────
  {
    name: '🔴 ask: the tie break goes, so "how much tax is due on 31 January" is answered with a date',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      'isDeadlineQuestion(question) && !asksAmount(question)', 'isDeadlineQuestion(question)'),
  },
  {
    name: '🔴 thread: the tie break goes',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      'isDeadlineQuestion(q) && !asksAmount(q)', 'isDeadlineQuestion(q)'),
  },
  {
    name: '🔴 whatsapp: the tie break goes',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts',
      'isDeadlineQuestion(text) && !asksAmount(text)', 'isDeadlineQuestion(text)'),
  },
  {
    name: '🔴 asksAmount always says no, so every router widens its deadline lane at once',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function asksAmount(body: string): boolean {\n  const b = body.trim().toLowerCase();',
      'export function asksAmount(body: string): boolean {\n  if (body) return false;\n  const b = body.trim().toLowerCase();'),
  },
  {
    name: '🔴 asksAmount always says yes, so every deadline lane is dead and nobody notices',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function asksAmount(body: string): boolean {\n  const b = body.trim().toLowerCase();',
      'export function asksAmount(body: string): boolean {\n  if (body) return true;\n  const b = body.trim().toLowerCase();'),
  },
  {
    name: 'a router keeps a PRIVATE copy of the tie break, so the three surfaces can drift word by word',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {',
      '  const wantsFigure = /\\bwhat\\b/.test(question) && !/\\bwhat\\s+(date|day|time|month)\\b/.test(question);\n'
      + '  if (!truth && isDeadlineQuestion(question) && !wantsFigure) {'),
  },

  // ── THE ORDER ON /api/ask. Four bounds, and the cache one is the reason this is not merely ─
  // ── a worse reply on one surface. ──────────────────────────────────────────────────────────
  {
    name: '🔴 ask: sunk BELOW the qa_cache key, so a DIRECTOR\'s answer is cached and read back to a sole trader',
    apply: ({ dir }) => moveBlock(dir, 'app/api/ask/route.ts',
      'if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {', 7,
      'const questionNorm = normaliseQuestion(question);', 1),
  },
  {
    name: '🔴 ask: sunk BELOW the daily cap, so a penalty date is withheld from a man who used up his six',
    apply: ({ dir }) => moveBlock(dir, 'app/api/ask/route.ts',
      'if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {', 7,
      "const userCount = await bumpAiUsage('ask', userId);", 1),
  },
  {
    name: '🔴 ask: sunk BELOW the paid model call, so the deterministic answer never runs',
    apply: ({ dir }) => moveBlock(dir, 'app/api/ask/route.ts',
      'if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {', 7,
      'const answer = await answerAccountantQuestion(question, context, knowledge, profile, history);', 1),
  },
  {
    name: '🔴 ask: sunk BELOW the VAT lane, so one router orders two lanes differently from the other two',
    apply: ({ dir }) => moveBlock(dir, 'app/api/ask/route.ts',
      'if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {', 7,
      'if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId, question);', 1),
  },
  {
    name: 'ask: a second call site is added, so no index names one lane any more',
    apply: ({ dir }) => editOnce(dir, 'app/api/ask/route.ts', ASK_LANE, ASK_LANE + ASK_LANE),
  },

  // ── THE LANE FIRES AND NOTHING HAPPENS. The worst kind, because it reads as wired. ─────────
  {
    name: '🔴 ask: the lane is asked about a CONSTANT rather than his question, so it can never fire',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      'isDeadlineQuestion(question) && !asksAmount(question)', "isDeadlineQuestion('') && !asksAmount('')"),
  },
  {
    name: '🔴 ask: the builder is called EMPTY, which is the 7 August defect arriving on the third surface',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      `    truth = deadlineAnswer(new Date(), {
      structure: o?.businessType ?? null,
      mtdPosition: null,
    });`,
      '    truth = deadlineAnswer();'),
  },
  {
    name: '🔴 ask: the STRUCTURE is dropped, so a director is answered as a sole trader again',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '      structure: o?.businessType ?? null,', '      structure: null,'),
  },
  {
    name: '🔴 ask: the failed read becomes a NO rather than an unknown',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      "    const o = await getOptimiserInput(userId).catch(() => null);\n"
      + "    truth = deadlineAnswer(new Date(), {\n      structure: o?.businessType ?? null,",
      "    const o = await getOptimiserInput(userId).catch(() => null);\n"
      + "    truth = deadlineAnswer(new Date(), {\n      structure: o?.businessType ?? 'sole_trader',"),
  },

  // ── ARTICLE 9. The web surfaces pass null because the chain carries one special category ───
  // ── row and a surface with no business reading it must not be able to reach it. ────────────
  {
    name: '🔴 ask: the position is filled in from the CIRCUMSTANCES chain, which article 9 keeps off this surface',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '      mtdPosition: null,',
      '      mtdPosition: (await readCircumstances(userId).catch(() => null)) ? null : null,'),
  },
  {
    name: '🔴 thread: the same, on the surface whose ban is the older of the two',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      '      mtdPosition: null,',
      '      mtdPosition: (await readCircumstances(userId).catch(() => null)) ? null : null,'),
  },

  // ── THE WORDS HAVE ONE HOME. A second copy is how one question gets two answers. ───────────
  {
    // ⚠️ IN CODE, NOT IN A COMMENT. The first draft of this sabotage pasted the sentence in as a
    // comment and was NOT caught, correctly: the guard reads the router with comments stripped, so a
    // comment is a no op and a no op belongs in the controls. A private copy is only a private copy
    // when a customer could read it.
    name: '🔴 a router assembles its own dates in CODE, which is the second definition this codebase keeps deleting',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      `    truth = deadlineAnswer(new Date(), {
      structure: o?.businessType ?? null,
      mtdPosition: null,
    });`,
      `    truth = deadlineAnswer(new Date(), {
      structure: o?.businessType ?? null,
      mtdPosition: null,
    });
    truth += ' The four dates each year are 7 August, 7 November, 7 February and 7 May.';`),
  },
  {
    name: '🔴 deadlineAnswer is given a SECOND home in the shared module',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function deadlineAnswer(now: Date, asker: DeadlineAsker): string {',
      'export function deadlineAnswer2(now: Date, asker: DeadlineAsker): string { return deadlineAnswer(now, asker); }\n'
      + 'export function deadlineAnswer(now: Date, asker: DeadlineAsker): string {'),
  },
  {
    name: '🔴 isDeadlineQuestion always says no, so all three routers are wired to a lane that never fires',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isDeadlineQuestion(body: string): boolean {\n  const b = body.trim().toLowerCase();',
      'export function isDeadlineQuestion(body: string): boolean {\n  if (body) return false;\n  const b = body.trim().toLowerCase();'),
  },

  // ── THE SCOPE TABLE. Section 9b is the only thing in this repo that can SEE a lane sitting ─
  // ── on fewer routers than it should, which is the shape of five separate findings. ─────────
  {
    name: '🔴 TABLE: the row is put back to two routers, so the table denies the lane that is now wired',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '  isDeadlineQuestion: { on: ALL3, why: \'\' },',
      "  isDeadlineQuestion: { on: WA_THREAD, why: 'a reason long enough to pass the length check on its own' },"),
  },
];

const CONTROLS = [
  {
    name: 'the local read of his profile is RENAMED, which changes nothing a customer reads',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      "    const o = await getOptimiserInput(userId).catch(() => null);\n"
      + "    truth = deadlineAnswer(new Date(), {\n      structure: o?.businessType ?? null,",
      "    const optimiser = await getOptimiserInput(userId).catch(() => null);\n"
      + "    truth = deadlineAnswer(new Date(), {\n      structure: optimiser?.businessType ?? null,"),
  },
  {
    name: 'a comment inside the new /api/ask lane is reworded',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '  // ⚠️ A FAILED READ IS UNKNOWN, NEVER A NO. The catch lands on null, which asks him.',
      '  // ⚠️ A FAILED READ IS UNKNOWN, AND NEVER A NO. The catch lands on null, which asks him.'),
  },
  {
    name: 'a comment inside section 10 of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '// 🔴 WHY THIS SECTION EXISTS. Sections 1 to 3 of this file are about the deadline lane and have',
      '// 🔴 WHY THIS SECTION IS HERE. Sections 1 to 3 of this file are about the deadline lane and have'),
  },
  {
    name: 'the four dates are named in a COMMENT beside the lane, which no customer can read',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts',
      '      mtdPosition: null,',
      '      mtdPosition: null,\n      // the four are 7 August, 7 November, 7 February and 7 May'),
  },
  {
    name: 'a blank line beside the lane on /api/ask, which changes nothing about what he reads',
    apply: ({ dir }) => editOnce(dir, 'app/api/ask/route.ts', ASK_LANE, `${ASK_LANE}\n`),
  },
  {
    name: '⚠️ THE DEADLINE EAR IS WIDENED, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "return /\\b(tax|return|quarter|quarterly|update|mtd|self assessment|file|filing|submit|payment on account)\\b/.test(b);",
      "return /\\b(tax|return|quarter|quarterly|update|mtd|self assessment|file|filing|submit|payment on account|balancing payment)\\b/.test(b);"),
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
