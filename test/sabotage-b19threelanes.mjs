// SABOTAGE THE NATIONAL INSURANCE, STUDENT LOAN AND PROPERTY LANES ON ALL THREE ROUTERS.
// B19, 17 AUGUST 2026.
//
//   node test/sabotage-b19threelanes.mjs
//
// isNiQuestion, isStudentLoanQuestion and isPropertyQuestion have existed since Run 2. All three
// have a pure builder in lib/waintents.ts, all three are unit tested, all three read his own rows,
// and all three were dispatched by app/api/whatsapp/route.ts and by NOTHING ELSE. A man signed in at
// /app/thread, with his whole ledger one query away, asked "how much national insurance do i pay"
// and was answered by the MODEL.
//
// THE READ NOW LIVES IN lib/laneanswers.ts, one file for three lanes because they are three
// questions about ONE read: the same year start and the same answer to what a failed read says. And
// the property lane's failed read was a LIE: propertyYtdTotals answered an unreachable database with
// { rents: 0 }, and propertyAnswer turns that into "No rental money logged this tax year yet".
//
// FIVE suites hold the repair and this pass runs all five, because a sabotage caught by any of them
// is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs      section 11, the three lanes on three routers by index, the totals
//                                 bound, the /api/ask cache and cap bounds, and 11b's derived walk
//                                 of every gate above each lane; section 9b's scope table
//   test/b19threelanes.test.mjs   the reader itself, run against the real lib/supabase.ts
//   test/thread.test.mjs          the walk: a customer typing one of the three into the web chat
//                                 receives HIS OWN position and the model is never asked
//   test/scotland.test.mjs        section 3, the band derived surface this refactor exposed
//   test/wave9_asking.test.mjs    the profile read that makes the NIM74250 gate run at all
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
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b19-3-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a red CI.
const SUITES = [
  'test/laneparity.test.mjs',
  'test/b19threelanes.test.mjs',
  'test/thread.test.mjs',
  'test/scotland.test.mjs',
  'test/wave9_asking.test.mjs',
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
const LA = 'lib/laneanswers.ts';

const WA_LANES = {
  property: '          } else if (isPropertyQuestion(text)) {\n            await handlePropertyQuestion(from);',
  studentloan: '          } else if (isStudentLoanQuestion(text)) {\n            await handleStudentLoanQuestion(from);',
  ni: '          } else if (isNiQuestion(text)) {\n            await handleNiQuestion(from);',
};
const TH_LANES = {
  property: "  if (isPropertyQuestion(q)) return propertyAnswerForUser(userId, 'web');",
  studentloan: "  if (isStudentLoanQuestion(q)) return studentLoanAnswerForUser(userId, 'web');",
  ni: '  if (isNiQuestion(q)) return niAnswerForUser(userId);',
};
const ASK_LANES = {
  property: "  if (!truth && isPropertyQuestion(question)) truth = await propertyAnswerForUser(userId, 'web');",
  studentloan: "  if (!truth && isStudentLoanQuestion(question)) truth = await studentLoanAnswerForUser(userId, 'web');",
  ni: '  if (!truth && isNiQuestion(question)) truth = await niAnswerForUser(userId);',
};

const SABOTAGES = [
  // ── A ROUTER LOSES A LANE. This is the finding itself, one cell at a time, and the two web ──
  // ── rows are the state of the world from Run 2 until today. ─────────────────────────────────
  ...Object.keys(TH_LANES).flatMap((lane) => ([
    {
      name: `🔴 THE THREAD loses the ${lane} lane, which is exactly where it was until today`,
      apply: ({ dir }) => edit(dir, TH, TH_LANES[lane], ''),
    },
    {
      name: `🔴 /api/ask loses the ${lane} lane`,
      apply: ({ dir }) => edit(dir, ASK, ASK_LANES[lane], ''),
    },
    {
      name: `🔴 WHATSAPP loses the ${lane} lane, the one channel that always had it`,
      apply: ({ dir }) => edit(dir, WA, WA_LANES[lane], '          } else if (false) {\n            await replyNotLinked(from);'),
    },
  ])),

  // ── THE UPPER BOUND. matchTotalsQuestion takes any money word plus "how much", "what" or ────
  // ── "my", so all three phrasings satisfy it and a demoted lane is answered with a whole ─────
  // ── business set aside figure. That is section 2's own defect wearing a different lane. ─────
  {
    name: '🔴 thread: the property lane drops BELOW the totals lane, so a rental question gets a set aside figure',
    apply: ({ dir }) => demote(dir, TH, TH_LANES.property, '  if (totals) return totalsAnswer(userId, totals);'),
  },
  {
    name: '🔴 whatsapp: the student loan lane drops BELOW the totals lane',
    apply: ({ dir }) => demote(dir, WA, WA_LANES.studentloan,
      '          } else if (matchTotalsQuestion(text)) {\n            await handleTotals(from, text);'),
  },

  // ── THE CACHE BOUND ON /api/ask, WHICH IS THE ONE THAT IS NOT OPTIONAL. qa_cache is keyed ───
  // ── on the QUESTION ALONE with no user id. Every one of these answers is nothing but his ────
  // ── own figures, and every one has a phrasing with no first person word in it. ──────────────
  {
    name: '🔴 ask: the NI lane drops BELOW the cache key, so his Class 4 can be written to a shared cache',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANES.ni, '  const questionNorm = normaliseQuestion(question);'),
  },
  {
    name: '🔴 ask: the property lane drops BELOW the cache key, so his rent can be served to a stranger',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANES.property, '  const questionNorm = normaliseQuestion(question);'),
  },
  {
    name: '🔴 ask: the student loan lane drops BELOW the daily cap, so a man is metered for reading his own rows',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANES.studentloan, "  const userCount = await bumpAiUsage('ask', userId);"),
  },

  // ── THE ORDER BETWEEN THE THREE. Their phrasings overlap at the edges, so three routers ─────
  // ── asking them in three orders is three answers to one sentence. ──────────────────────────
  {
    name: '🔴 thread: National Insurance is asked FIRST, so this router runs the three in its own order',
    apply: ({ dir }) => demote(dir, TH, TH_LANES.ni, '  if (isVatQuestion(q)) return vatAnswerForUser(userId, q);'),
  },

  // ── THE FAILED READ. This is the half no routing assertion can see. ────────────────────────
  {
    name: '🔴 propertyYtdTotals goes back to answering a dead database with a ZERO, which reads as an empty stream',
    apply: ({ dir }) => edit(dir, 'lib/supabase.ts',
      '  if (!res.ok) return null;\n  const rows = (await res.json().catch(() => [])) as Array<{ amount: number | string; category: string | null; vendor: string | null }>;',
      '  if (!res.ok) return { rents: 0, expenses: 0, finance: 0 };\n  const rows = (await res.json().catch(() => [])) as Array<{ amount: number | string; category: string | null; vendor: string | null }>;'),
  },
  {
    name: '🔴 the NI lane stops refusing an unreadable ledger, so a man is told no National Insurance is due',
    apply: ({ dir }) => edit(dir, LA,
      '  if (!totals) return LANE_UNREADABLE;\n\n  const salary = settings?.employmentIncome ?? 0;',
      '  const salary = settings?.employmentIncome ?? 0;'),
  },
  {
    name: '🔴 the student loan lane stops refusing an unreadable ledger',
    apply: ({ dir }) => edit(dir, LA,
      '  if (!totals) return LANE_UNREADABLE;\n\n  const profit = Math.max(0, totals.income - totals.expenses);\n  const income',
      '  const profit = Math.max(0, totals!.income - totals!.expenses);\n  const income'),
  },
  {
    name: '🔴 the property lane stops refusing unreadable PROPERTY rows, which is the finding itself',
    apply: ({ dir }) => edit(dir, LA, '  if (totals === null) return LANE_UNREADABLE;', ''),
  },
  {
    name: '🔴 the property lane stops refusing an unreadable TRADE position, so his rent is banded off a guess',
    apply: ({ dir }) => edit(dir, LA, '  if (tradeTotals === null) return LANE_UNREADABLE;', ''),
  },
  {
    name: '🔴 the refusal becomes a comfortable sounding guess with a figure in it',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "export const LANE_UNREADABLE = 'I could not fetch your figures just now. Try again in a minute.';",
      "export const LANE_UNREADABLE = 'Nothing much to report: about £0 so far this tax year.';"),
  },
  {
    name: '🔴 a man with genuinely no rent is REFUSED instead of told how to start, the same defect reversed',
    apply: ({ dir }) => edit(dir, LA,
      '  if (totals === null) return LANE_UNREADABLE;',
      '  if (totals === null || totals.rents <= 0) return LANE_UNREADABLE;'),
  },
  {
    name: '🔴 no plan stored becomes a REFUSAL, so a man is told to try again for a fact we simply do not hold',
    apply: ({ dir }) => edit(dir, LA,
      "    return studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0, channel });",
      '    return LANE_UNREADABLE;'),
  },
  {
    name: '🔴 the student loan lane reads his whole ledger before it checks whether he has a plan at all',
    apply: ({ dir }) => edit(dir, LA,
      '  const settings = await getStudentLoanSettings(userId).catch(() => null);\n'
      + '  const plans: StudentPlan[] = [];',
      '  const [settings] = await Promise.all([\n'
      + '    getStudentLoanSettings(userId).catch(() => null),\n'
      + '    totalsForUser(userId, taxYearSinceISO(now), null),\n'
      + '  ]);\n'
      + '  const plans: StudentPlan[] = [];'),
  },

  // ── THE PROFILE READ, WHICH IS WHAT MAKES NIM74250's GATE RUN AT ALL. ─────────────────────
  {
    name: '🔴 the income shape is no longer read, so a landlord is sold voluntary Class 2 again',
    apply: ({ dir }) => edit(dir, LA, '    incomeShape: biz?.incomeShape ?? null,', '    incomeShape: null,'),
  },

  // ── ONE APRIL. A second boundary is two answers to "what has he made this year". ──────────
  {
    name: '🔴 the tax year boundary moves a day, so 6 April reads back to the year behind it',
    apply: ({ dir }) => edit(dir, LA,
      "d.getUTCMonth() === 3 && d.getUTCDate() >= 6", "d.getUTCMonth() === 3 && d.getUTCDate() >= 7"),
  },
  {
    name: '🔴 the webhook grows its own taxYearSinceISO back, so there are two owners of one boundary',
    apply: ({ dir }) => edit(dir, WA,
      'async function handleNiQuestion(from: string): Promise<void> {',
      'function taxYearSinceISO2(now: Date = new Date()): string {\n'
      + '  const d = new Date(now);\n'
      + '  return `${d.getUTCFullYear()}-04-06`;\n'
      + '}\n'
      + 'function taxYearSinceISO(now: Date = new Date()): string { return taxYearSinceISO2(now); }\n'
      + 'async function handleNiQuestion(from: string): Promise<void> {'),
  },

  // ── THE SCOTLAND CAVEAT ON THE BAND DERIVED FIGURE, WHICH THIS REFACTOR EXPOSED. ──────────
  {
    name: '🔴 the property answer stops saying which rates the tax figure was worked at',
    apply: ({ dir }) => edit(dir, LA,
      'd.extraPerYear, properties.length, SCOTLAND_LINE, channel);', "d.extraPerYear, properties.length, '', channel);"),
  },

  // ── THE CHANNEL. Two of the three lanes offer a door in their empty state and only one ─────
  // ── channel has it. A web surface told to "tell me here" is a promise it cannot keep. ───────
  {
    name: '🔴 the thread claims to be WhatsApp, so a man in a browser is told to text his plan here',
    apply: ({ dir }) => edit(dir, TH,
      "studentLoanAnswerForUser(userId, 'web')", "studentLoanAnswerForUser(userId, 'whatsapp')"),
  },
  {
    name: '🔴 /api/ask claims to be WhatsApp, so a man in the app is told to text his rent as it lands',
    apply: ({ dir }) => edit(dir, ASK,
      "propertyAnswerForUser(userId, 'web')", "propertyAnswerForUser(userId, 'whatsapp')"),
  },
  {
    name: '🔴 the no plan branch stops asking which channel, so one wording is sent to both',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "    return input.channel === 'whatsapp'\n      ? 'I do not know your student loan plan yet. Tell me here",
      "    return true\n      ? 'I do not know your student loan plan yet. Tell me here"),
  },

  // ── TWO OWNERS AGAIN. A router that keeps a copy of the read or the words. ────────────────
  {
    name: '🔴 the thread assembles the property answer itself, so there are two owners of one sentence',
    apply: ({ dir }) => edit(dir, TH, TH_LANES.property,
      "  if (isPropertyQuestion(q)) return propertyAnswer(0, 0, 0, 0, '', 'web');"),
  },
  {
    name: '🔴 lib/laneanswers.ts grows a SECOND reader for the NI lane',
    apply: ({ dir }) => edit(dir, LA,
      'export async function niAnswerForUser(userId: string, now: Date = new Date()): Promise<string> {',
      'export async function niAnswerForUser2(userId: string, now: Date = new Date()): Promise<string> { return niAnswerForUser(userId, now); }\n'
      + 'export async function niAnswerForUser(userId: string, now: Date = new Date()): Promise<string> {'),
  },

  // ── THE PREDICATES. A router wired to a lane that never fires is a lane nobody has. ───────
  {
    name: '🔴 isPropertyQuestion always says no, so all three routers are wired to a lane that never fires',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isPropertyQuestion(body: string): boolean {\n  const b = body.trim().toLowerCase();',
      'export function isPropertyQuestion(body: string): boolean {\n  if (body) return false;\n  const b = body.trim().toLowerCase();'),
  },

  // ── THE SCOPE TABLE. Section 9b is the only thing in this repo that can SEE a lane sitting ─
  // ── on fewer routers than it should, which is the shape of six separate findings. ──────────
  {
    name: '🔴 TABLE: the three rows go back to WhatsApp only, so the table denies the lanes that are now wired',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '  isNiQuestion: { on: ALL3, why: \'\' },',
      "  isNiQuestion: { on: WA_ONLY, why: 'a reason long enough to pass the length check entirely on its own' },"),
  },
];

const CONTROLS = [
  {
    // ⚠️ RENAMED CONSISTENTLY, BOTH SITES. The first draft of this control renamed the
    // destructured local and left the four uses of it below, which does not compile and went red
    // for a reason that had nothing to do with any guard. A control that cannot be applied cleanly
    // is a broken control, not a strict guard, and the same lesson has been written down here once
    // already about anchors.
    name: 'a local in the reader is RENAMED, which changes nothing a customer reads',
    apply: ({ dir }) => {
      edit(dir, LA, '  const d = aprilDelta({', '  const delta = aprilDelta({');
      edit(dir, LA, 'd.now.taxCausedByProperty, d.extraPerYear,', 'delta.now.taxCausedByProperty, delta.extraPerYear,');
    },
  },
  {
    name: 'a comment inside lib/laneanswers.ts is reworded',
    apply: ({ dir }) => edit(dir, LA,
      '// 🔴 WHY ONE FILE AND NOT THREE, ARGUED RATHER THAN ASSUMED.',
      '// 🔴 WHY ONE FILE RATHER THAN THREE, ARGUED RATHER THAN ASSUMED.'),
  },
  {
    name: 'a comment inside section 11 of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '// 🔴 WHY THIS SECTION EXISTS, AND IT IS THE SIXTH TIME.',
      '// 🔴 WHY THIS SECTION IS HERE, AND IT IS THE SIXTH TIME.'),
  },
  {
    name: 'the three lane names are pasted into a COMMENT beside the thread chain, where no customer can read them',
    apply: ({ dir }) => edit(dir, TH, TH_LANES.ni,
      `${TH_LANES.ni}\n  // isNiQuestion, isStudentLoanQuestion, isPropertyQuestion`),
  },
  {
    name: 'a blank line beside the three lanes on /api/ask',
    apply: ({ dir }) => editOnce(dir, ASK, ASK_LANES.property, `${ASK_LANES.property}\n`),
  },
  {
    name: '⚠️ THE PROPERTY EAR IS WIDENED, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "return /\\b(propert(y|ies)|rentals?|landlord)\\b/.test(b) && /\\b(how|what|doing|going|position|tax|owe)\\b/.test(b);",
      "return /\\b(propert(y|ies)|rentals?|landlord|lettings?)\\b/.test(b) && /\\b(how|what|doing|going|position|tax|owe)\\b/.test(b);"),
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
