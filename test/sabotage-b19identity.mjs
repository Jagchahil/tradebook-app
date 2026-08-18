// SABOTAGE THE IDENTITY LANE ON ALL THREE ROUTERS, AND THE WORDS IT SAYS ON EACH.
// B19, 18 AUGUST 2026. THE LANE THAT CLOSES B19.
//
//   node test/sabotage-b19identity.mjs
//
// isIdentity has existed since Run 2 and was dispatched by app/api/whatsapp/route.ts and by NOTHING
// ELSE, because its two sentences were assembled INLINE in that file's handleIdentity. So a man
// signed in at /app/thread who typed "who are you" was handed to a paid model call to paraphrase two
// fixed sentences, one of which is the compliance promise that HE approves before anything reaches
// HMRC. The model holds none of that and chose its own words for it.
//
// ⚠️ THIS PASS GUARDS WORDS AS WELL AS WIRING, WHICH IS UNUSUAL HERE AND IS THE POINT. Every other
// lane closed this week answers with a FIGURE out of a reader, so its suite can check arithmetic and
// leave the prose alone. This lane reads nothing. Its words ARE the lane, and a guard on its routing
// alone would pass a build that told a man in a browser to send a text.
//
// THREE suites hold the repair and this pass runs all three, because a sabotage caught by any of
// them is caught and a sabotage caught by NONE is the hole:
//   test/laneparity.test.mjs   section 13, the lane on three routers by index, above the model and
//                              above /api/ask's daily cap; the WhatsApp words word for word; the
//                              web reply naming no capability the web lacks; the channel never
//                              defaulted; the derived walk of every gate above it; and 9b's scope
//                              table row, flipped to ALL3
//   test/thread.test.mjs       the routing walk: a customer typing it into the web chat reaches the
//                              lane and the channel passed is 'web'
//   test/waintents.test.mjs    the matcher itself, against the real file
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
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b19-id-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

const SUITES = [
  'test/laneparity.test.mjs',
  'test/thread.test.mjs',
  'test/waintents.test.mjs',
];

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" counts a suite that
// threw as green, which is how a dead suite once walked all the way into a green CI.
//
// ⚠️ THE FULL STOP IS OPTIONAL IN THE REGEX ON PURPOSE. test/ledger.test.mjs and twenty nine other
// suites end their tally without one, and a sibling pass reported 25 of 25 while unable to tell a
// sabotage from an untouched repo because of it. All three suites here DO end with a full stop, and
// the regex tolerates either so that adding a fourth cannot reintroduce the trap silently.
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

// 🔴 THE BASELINE, FROM DAY ONE ON THIS PASS. A sabotage pass measures a DIFFERENCE and has no way
// of knowing whether the red it sees came from the sabotage or from a harness that reds on
// everything. This repo has been bitten three times: a missing supabase/, a full disk, and a tally
// line. It costs one tree and it is the cheapest guard in the file.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch() (supabase/ is one)');
    console.log('   2. every suite tally line matches the regex in runSuite');
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
const WAI = 'lib/waintents.ts';
const LP = 'test/laneparity.test.mjs';

const TH_LANE = "  if (isIdentity(q)) return identityAnswer('web');";
const ASK_LANE = "  if (!truth && isIdentity(question)) truth = identityAnswer('web');";
const WA_LANE = '          } else if (isIdentity(text)) {\n            await handleIdentity(from);';

// The exact web second paragraph, quoted once here so a sabotage below can replace it.
const WEB_2 = 'I keep your receipts, invoices and mileage straight, and work out what you owe and when. You approve everything before anything goes near HMRC.';
const WA_2 = 'Snap a receipt, say what you spent or got paid, and I log it for tax. You approve everything before anything goes near HMRC. Text "help" to see the lot.';

const SABOTAGES = [
  // ── UNWIRED: THE LANE GOES, ONE ROUTER AT A TIME. This is the state at e5a6e1e9. ─────────
  {
    name: '🔴 the lane is torn out of the THREAD, which is the state a signed in customer was in',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, '  if (isIdentity(q)) return null;'),
  },
  {
    name: '🔴 the lane is torn out of /api/ask, the in app accountant',
    apply: ({ dir }) => edit(dir, ASK, ASK_LANE, '  if (!truth && isIdentity(question)) truth = truth;'),
  },
  {
    name: '🔴 the lane is torn out of WHATSAPP, the one channel that has always had it',
    apply: ({ dir }) => edit(dir, WA, WA_LANE, '          } else if (isIdentity(text) && false) {\n            await handleIdentity(from);'),
  },

  // ── THE CHANNEL: THE HALF THAT MAKES THIS LANE DIFFERENT FROM THE OTHER FIVE. ────────────
  {
    name: '🔴 the THREAD says it is WhatsApp, so a man in a browser is told to send a text',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, "  if (isIdentity(q)) return identityAnswer('whatsapp');"),
  },
  {
    name: '🔴 /api/ask says it is WhatsApp, the same lie on the phone',
    apply: ({ dir }) => edit(dir, ASK, ASK_LANE, "  if (!truth && isIdentity(question)) truth = identityAnswer('whatsapp');"),
  },
  {
    name: '🔴 WHATSAPP says it is the web, so a texter loses the two things he really can do',
    apply: ({ dir }) => edit(dir, WA, "await sendText(from, identityAnswer('whatsapp'));", "await sendText(from, identityAnswer('web'));"),
  },
  {
    name: '🔴 the builder DEFAULTS the channel, which is how a fourth caller silently gets the wrong door',
    apply: ({ dir }) => edit(dir, WAI,
      'export function identityAnswer(channel: LaneChannel): string {',
      "export function identityAnswer(channel: LaneChannel = 'whatsapp'): string {"),
  },

  // ── THE ORDER. ───────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the thread lane is demoted BELOW the model, so a paid call answers what Lekhio is',
    apply: ({ dir }) => demote(dir, TH, TH_LANE, '  const answer = await answerMoneyQuestion(q, summary, knowledge);'),
  },
  {
    name: '🔴 /api/ask is demoted below the daily cap, so a man is metered for asking what he is talking to',
    apply: ({ dir }) => demote(dir, ASK, ASK_LANE, "  const userCount = await bumpAiUsage('ask', userId);"),
  },
  {
    name: '🔴 the scope table is put back to WhatsApp only, which is the row this packet paid off',
    apply: ({ dir }) => edit(dir, LP, "  isIdentity: { on: ALL3, why: '' },", "  isIdentity: { on: WA_ONLY, why: 'a reason long enough to satisfy the length check above' },"),
  },

  // ── THE WORDS. THE HALF NO OTHER LANE IN THIS REPO NEEDS. ────────────────────────────────
  {
    name: '🔴 the WhatsApp first paragraph is reworded, on the one channel with live customers',
    apply: ({ dir }) => edit(dir, WAI,
      'I am Lekhio, a bookkeeping assistant for the UK self employed, right here in WhatsApp.',
      'I am Lekhio, a bookkeeping assistant for the UK self employed, right here on WhatsApp.'),
  },
  {
    name: '🔴 the WhatsApp second paragraph is reworded',
    apply: ({ dir }) => edit(dir, WAI, WA_2, WA_2.replace('Snap a receipt', 'Send a receipt')),
  },
  {
    name: '🔴 THE TIDY: the web reply is collapsed into the WhatsApp one, which is the whole defect',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, WA_2),
  },
  {
    name: '🔴 the web reply gains "right here in WhatsApp", at a box that is not WhatsApp',
    apply: ({ dir }) => edit(dir, WAI,
      'I am Lekhio, a bookkeeping assistant for the UK self employed. Yes, I am software',
      'I am Lekhio, a bookkeeping assistant for the UK self employed, right here in WhatsApp. Yes, I am software'),
  },
  {
    name: '🔴 the web reply gains the help keyword, which only the webhook dispatches',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, `${WEB_2} Text "help" to see the lot.`),
  },
  {
    name: '🔴 the web reply tells him to snap a receipt, which the phone Ask box cannot take',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, `Snap a receipt and I log it for tax. ${WEB_2}`),
  },
  {
    name: '🔴 the web reply tells him to say what he spent, which looksLikeMoneyEntry hears on WhatsApp alone',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, `${WEB_2} Or say what you spent and I log it.`),
  },
  {
    name: '🔴 THE COMPLIANCE SENTENCE IS DROPPED FROM THE WEB REPLY. We prepare, he approves.',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, 'I keep your receipts, invoices and mileage straight, and work out what you owe and when.'),
  },
  {
    name: '🔴 THE COMPLIANCE SENTENCE IS DROPPED FROM THE WHATSAPP REPLY',
    apply: ({ dir }) => edit(dir, WAI, WA_2, WA_2.replace(' You approve everything before anything goes near HMRC.', '')),
  },
  {
    name: '🔴 the web reply stops admitting it is software, which is the question he actually asked',
    apply: ({ dir }) => edit(dir, WAI,
      'I am Lekhio, a bookkeeping assistant for the UK self employed. Yes, I am software, with real people behind me.',
      'I am Lekhio, a bookkeeping assistant for the UK self employed.'),
  },
  {
    name: '🔴 the thread keeps a PRIVATE COPY of the words, which is the shape this packet removed',
    apply: ({ dir }) => edit(dir, TH, TH_LANE,
      "  if (isIdentity(q)) return 'I am Lekhio, a bookkeeping assistant for the UK self employed.';"),
  },

  // ── THE MATCHER, AND THE ONE OVERLAP THIS PACKET RECORDED RATHER THAN FIXED. ─────────────
  {
    name: '🔴 the matcher goes deaf to "who are you", the phrase the lane is named for',
    apply: ({ dir }) => edit(dir, WAI, '^(who are you|who is this|', '^(who is this|'),
  },
  {
    name: '🔴 the support ear is widened to swallow "are you a bot", which would move the KNOWN overlap',
    apply: ({ dir }) => edit(dir, WAI,
      "const SUPPORT_COMPLAINT = /\\b(complain|complaint|",
      "const SUPPORT_COMPLAINT = /\\b(are you a bot|complain|complaint|"),
  },
];

const CONTROLS = [
  {
    name: 'the argument above identityAnswer is reworded, which changes nothing anybody reads',
    apply: ({ dir }) => edit(dir, WAI,
      '// 🔴 WHO LEKHIO IS, IN WORDS THAT ARE TRUE OF THE CHANNEL HE IS STANDING IN.',
      '// 🔴 WHO LEKHIO IS, IN WORDS THAT ARE TRUE OF THE CHANNEL HE IS STOOD IN.'),
  },
  {
    name: 'a comment inside section 13 of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, LP,
      '// 🔴 WHO LEKHIO IS, ON ALL THREE ROUTERS, AND IT CLOSES B19.',
      '// 🔴 WHO LEKHIO IS, ON ALL THREE ROUTERS, AND IT SHUTS B19.'),
  },
  {
    name: 'a blank line beside the lane on the thread, which changes nothing about what he reads',
    apply: ({ dir }) => edit(dir, TH, TH_LANE, `${TH_LANE}\n`),
  },
  {
    // ⚠️ THIS IS THE CONTROL THAT PROVES THE GUARD PINS THE SHAPE AND NOT THE WORDS, which is the
    // sharpest operating rule in this repo. The web reply may say MORE, in web words, and nothing
    // here freezes it. What it may never do is name a capability this channel has not got, and every
    // one of those is a sabotage above.
    name: '⚠️ THE WEB REPLY GAINS A SENTENCE IN WEB WORDS, which is somebody being MORE helpful and must not be frozen',
    apply: ({ dir }) => edit(dir, WAI, WEB_2, `${WEB_2} Your figures are on the Tax screen whenever you want them.`),
  },
  {
    name: '⚠️ A ROLE WORD IS ADDED TO THE SUPPORT STOPLIST, which returns an honest question and must not be frozen',
    apply: ({ dir }) => edit(dir, WAI, "  'tenant', 'landlord',", "  'tenant', 'landlord', 'lodger',"),
  },
  {
    name: 'a blank line inside identityAnswer, which changes nothing about what it returns',
    apply: ({ dir }) => edit(dir, WAI,
      'export function identityAnswer(channel: LaneChannel): string {\n  if (channel',
      'export function identityAnswer(channel: LaneChannel): string {\n\n  if (channel'),
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
