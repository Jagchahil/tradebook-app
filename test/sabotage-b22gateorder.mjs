// SABOTAGE THE THREE WAY ORDER: HIS DATA RIGHTS, THEN THE THIRD PARTY GATE, THEN THE DEADLINE LANE.
// B22, 17 AUGUST 2026.
//
//   node test/sabotage-b22gateorder.mjs
//
// "when is jerome's tax due" is isDeadlineQuestion TRUE and isAboutSomeoneElse TRUE. On WhatsApp and
// on the thread the third party gate sat BELOW the deadline lane, so the deadline lane won and the
// asker was answered about somebody else out of HIS OWN profile. /api/ask was built the right way
// round on the second half of this and was not affected.
//
// AND IT IS A THREE WAY REORDER, NOT A SWAP OF TWO LINES. laneparity section 5's rule is that a man
// asking to be erased must never be refused and never be metered, so the gate cannot go to the top:
// it has to land BELOW the erasure lane and ABOVE the deadline lane, on the most sensitive router in
// the product.
//
// AND THE BEFORE WALK FOUND A SECOND THING BEFORE ANYTHING HAD MOVED. isSupportRequest claims
// "cancel my account and delete my details" and sat ABOVE the erasure lane on WhatsApp, so a man
// asking to close his account and be deleted was handed a support queue. That is RUN 1's finding by
// name, on the one channel it had never been closed on.
//
// FOUR suites hold the repair and this pass runs all four:
//   test/laneparity.test.mjs  section 9c, the order by index on three routers, the derived walk of
//                             every gate above the erasure lane, the reverse walk of the lanes it
//                             was hoisted above, and the "one of four" that stops this being read
//                             as a matcher fix
//   test/thread.test.mjs      the chat surface actually running its chain
//   test/datadoor.test.mjs    the erasure phrase table against the real matcher
//   test/run3fixes.test.mjs   the third party matcher and its false positive set

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b22-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

const SUITES = [
  'test/laneparity.test.mjs',
  'test/thread.test.mjs',
  'test/datadoor.test.mjs',
  'test/run3fixes.test.mjs',
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
// Both the moved branch and its destination are proved present first, so a rename is a MISSED
// anchor rather than a sabotage that silently did nothing.
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

const RIGHTS = {
  whatsapp: '          } else if (isDataRightsRequest(text)) {\n            await sendText(from, DATA_RIGHTS_ANSWER);',
  thread: '  if (isDataRightsRequest(q)) return DATA_RIGHTS_ANSWER;',
  ask: '  if (!truth && isDataRightsRequest(question)) truth = DATA_RIGHTS_ANSWER;',
};
const GATE = {
  whatsapp: '          } else if (isAboutSomeoneElse(text)) {\n            await sendText(from, SOMEONE_ELSE_ANSWER);',
  thread: '  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;',
  ask: '  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;',
};
const DEADLINE = {
  whatsapp: '          } else if (isDeadlineQuestion(text) && !asksAmount(text)) {\n            await handleDeadlineQuestion(from);',
  thread: '  if (isDeadlineQuestion(q) && !asksAmount(q)) {',
  ask: '  if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {',
};

const SABOTAGES = [
  // ── THE FINDING ITSELF: the gate goes back below the deadline lane, one router at a time. ──
  {
    name: '🔴 WHATSAPP: the gate drops back below the deadline lane, which is exactly where B22 found it',
    apply: ({ dir }) => demote(dir, WA, GATE.whatsapp, DEADLINE.whatsapp),
  },
  {
    // ⚠️ THE ANCHOR IS THE END OF THE DEADLINE BLOCK, NOT THE LINE AFTER IT. The first draft
    // anchored on a comment two lines down and could not be applied at all, which the harness
    // reported as MISSED rather than counting it caught. A sabotage that cannot be applied is
    // broken, never caught.
    name: '🔴 THE THREAD: the gate drops back below the deadline lane',
    apply: ({ dir }) => demote(dir, TH, GATE.thread, '      mtdPosition: null,\n    });\n  }'),
  },
  {
    // ⚠️ AND HERE THE FIRST DRAFT ANCHORED ON THE ERASURE LANE, WHICH IS ABOVE THE DEADLINE LANE,
    // so the "demoted" gate landed higher than it started and the sabotage was a NO OP. It applied
    // cleanly and was reported MISSED, which is the harness telling the truth about a bad sabotage.
    name: '🔴 /api/ask: the gate drops below the deadline lane, on the one router that was always right',
    apply: ({ dir }) => demote(dir, ASK, GATE.ask, '      mtdPosition: null,\n    });\n  }'),
  },

  // ── THE TRAP. The gate hoisted ABOVE the erasure lane, which is the cheap wrong fix and the ──
  // ── reason this was never a swap of two lines: a man asking to leave gets refused. ──────────
  {
    name: '🔴 WHATSAPP: the erasure lane drops BELOW the gate, so a man asking to be erased can be refused',
    apply: ({ dir }) => demote(dir, WA, RIGHTS.whatsapp, GATE.whatsapp),
  },
  {
    name: '🔴 THE THREAD: the erasure lane drops BELOW the gate',
    apply: ({ dir }) => demote(dir, TH, RIGHTS.thread, GATE.thread),
  },
  {
    name: '🔴 /api/ask: the erasure lane drops BELOW the gate',
    apply: ({ dir }) => demote(dir, ASK, RIGHTS.ask, GATE.ask),
  },

  // ── THE SECOND FINDING, THE ONE THE BEFORE WALK FOUND. "cancel my account and delete my ─────
  // ── details" is heard by BOTH lanes, and the support lane sat above. ────────────────────────
  {
    name: '🔴 WHATSAPP: the erasure lane drops back below the SUPPORT lane, so a man closing his account gets a queue',
    apply: ({ dir }) => demote(dir, WA, RIGHTS.whatsapp,
      '          } else if (isSupportRequest(text)) {\n            await handleSupportRequest(from, text);'),
  },
  {
    name: '🔴 WHATSAPP: the erasure lane drops below the PRICING lane, the other side of the same walk',
    apply: ({ dir }) => demote(dir, WA, RIGHTS.whatsapp,
      '          } else if (isPricing(text)) {\n            await handlePricing(from);'),
  },

  // ── THE LANE ITSELF, ONE ROUTER AT A TIME. A gate that does not fire is not a gate. ─────────
  {
    name: '🔴 WHATSAPP loses the gate entirely',
    apply: ({ dir }) => edit(dir, WA, GATE.whatsapp, '          } else if (false) {\n            await replyNotLinked(from);'),
  },
  {
    name: '🔴 THE THREAD loses the erasure lane entirely',
    apply: ({ dir }) => edit(dir, TH, RIGHTS.thread, ''),
  },

  // ── THE MATCHERS. Widening either one changes the measured numbers section 9c writes down, ──
  // ── and the point of writing them down is that a change forces a re measurement. ────────────
  {
    // ⚠️ THE FIRST DRAFT OF THIS ONE NARROWED FIRST_PERSON_RE AND WAS A NO OP, because none of the
    // four shapes was being turned away by a first person word in the first place. Measured, then
    // rewritten to widen the money verb list, which is the clause that actually decides three of
    // them. A sabotage that does not bite is broken, not passing.
    name: '🔴 the third party gate is widened, so the "one of four" this fix does NOT close silently becomes two',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  return /\\bowe|owes|owed|earn|earns|made|makes|turnover|profit|tax|takings|books|figures|pay|pays\\b/i.test(b);",
      "  return /\\bowe|owes|owed|earn|earns|made|makes|turnover|profit|tax|takings|books|figures|pay|pays|return\\b/i.test(b);"),
  },
  {
    name: '🔴 the gate starts refusing honest self phrasings, which is the direction that costs a customer his answer',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isAboutSomeoneElse(body: string, selfNames: string[] = []): boolean {\n  const b = body.trim();',
      'export function isAboutSomeoneElse(body: string, selfNames: string[] = []): boolean {\n  if (/\\bdue\\b/i.test(body)) return true;\n  const b = body.trim();'),
  },
  {
    name: '🔴 the erasure ear goes deaf to a plain cancellation, so the hoist above the support lane buys nothing',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  /\\b(delete|erase|remove|wipe|close|cancel|destroy)\\b",
      "  /\\b(delete|erase|remove|wipe|destroy)\\b"),
  },
  {
    name: '🔴 the erasure ear is widened into the support lane, so "cancel my plan" stops reaching a human',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "\\b(data|account|details|records|information|info)\\b/i;",
      "\\b(data|account|details|records|information|info|plan|subscription)\\b/i;"),
  },
  {
    name: '🔴 the refusal stops being the fixed words on WhatsApp, so the gate fires and answers nothing',
    apply: ({ dir }) => edit(dir, WA, GATE.whatsapp,
      "          } else if (isAboutSomeoneElse(text)) {\n            await handleMoneyQuestion(from, text);"),
  },
];

const CONTROLS = [
  {
    name: 'a comment inside the moved WhatsApp branch is reworded',
    apply: ({ dir }) => edit(dir, WA,
      '          // 🔴 SOMEBODY ELSE\'S MONEY, AND IT MOVED ABOVE THE DEADLINE LANE ON 17 AUGUST. B22.',
      '          // 🔴 SOMEBODY ELSE\'S MONEY, AND IT ROSE ABOVE THE DEADLINE LANE ON 17 AUGUST. B22.'),
  },
  {
    name: 'a comment inside section 9c of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '// 🔴 FOUND 17 August 2026 BY THE DEADLINE LANE SESSION CHECKING ITS OWN WORK',
      '// 🔴 FOUND ON 17 August 2026 BY THE DEADLINE LANE SESSION CHECKING ITS OWN WORK'),
  },
  {
    name: 'the new order is written into a COMMENT beside the thread chain, where no customer can read it',
    apply: ({ dir }) => edit(dir, TH, RIGHTS.thread,
      `${RIGHTS.thread}\n  // erasure, then the third party gate, then the deadline lane`),
  },
  {
    name: 'a blank line between the erasure lane and the gate on /api/ask',
    apply: ({ dir }) => editOnce(dir, ASK, RIGHTS.ask, `${RIGHTS.ask}\n`),
  },
  {
    name: '⚠️ THE ERASURE EAR IS WIDENED TO HEAR "scrub", which is somebody being MORE careful',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  /\\b(delete|erase|remove|wipe|close|cancel|destroy)\\b",
      "  /\\b(delete|erase|remove|wipe|close|cancel|destroy|scrub)\\b"),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL. Every call is capped at
// 45 seconds in a fresh sandbox and a detached process does not survive between calls. SAB_FROM and
// SAB_TO are indices into the sabotage list; unset means all of it, which is what CI and the Mac
// run. SAB_SKIP_CONTROLS skips the controls for the same reason.
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
