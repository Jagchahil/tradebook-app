// SABOTAGE THE CAVEAT ON THE CHANNEL WITH NO SCREEN BEHIND IT.
// B30, 18 AUGUST 2026. THE SENTENCE THAT TRAVELS WITH THE FIGURE.
//
//   node test/sabotage-b30agentscotland.mjs
//   SAB_FROM=0 SAB_TO=5 node test/sabotage-b30agentscotland.mjs      (a slice, for a 45 second shell)
//   SAB_SKIP_CONTROLS=1 node test/sabotage-b30agentscotland.mjs
//
// On 18 August 2026 a Glasgow sole trader was texted a band derived January at 08:00 with no
// caveat, while every chat answer on the same account carried one. What was wrong was NOT that the
// ratchet could not see lib/agent.ts. It saw it, and somebody classified it as not disclosed on the
// reasoning "same as the thread and WhatsApp", and both of those moved to the disclosed list the
// day before. A dead reason, and the only thing the suite could check about it was its length.
//
// TWO suites hold the repair and this pass runs both, because a sabotage caught by either is caught
// and a sabotage caught by NEITHER is the hole:
//   test/scotland.test.mjs   the decision: which surfaces and, in section 3c, which SIGNALS
//   test/agent.test.mjs      the behaviour: what a customer actually receives, driven off the engine
//
// ⚠️ THE TWO TALLY LINES ARE NOT THE SAME. scotland ends "N passed, M failed." and agent ends
// "agent: N passed, M failed" with NO FULL STOP, one of thirty suites in this repo that do. The
// regex below makes the stop optional, which is the whole reason a sibling pass once reported 25 of
// 25 while unable to tell a sabotage from an untouched tree.
//
// SCRATCH TREE: lib, test and app, PLUS a link to the real mobile repo beside it, because
// scotland.test.mjs section 3b reads ../tradebook-app and a missing one is a SKIP rather than a
// failure. A skip is not a pass, and a pass built on one is worth nothing.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b30s-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

const SUITES = ['test/scotland.test.mjs', 'test/agent.test.mjs'];

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

// 🔴 BASELINE, FROM DAY ONE. And here it does one extra job: it proves the mobile link landed, since
// scotland.test.mjs prints a skip note rather than failing without it.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  const mobileSeen = existsSync(path.join(t.base, 'tradebook-app', 'lib', 'scotland.ts'));
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch()');
    console.log('   2. every suite tally line matches the regex in runSuite (agent has NO full stop)');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  if (!mobileSeen) {
    console.log('⚠️  NOTE: the mobile repo is not linked into the scratch tree, so section 3b SKIPPED.');
    console.log('   A skip is not a pass. Every sabotage below is web side, so the pass still means');
    console.log('   what it says, but the mobile half of scotland.test.mjs decided nothing here.');
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const AG = 'lib/agent.ts';
const SC = 'test/scotland.test.mjs';

// ── ANCHORS. Interiors, never the edge of a list: SCOTLAND_SIGNALS is DESIGNED to grow, exactly
// like the possessive noun list that killed three sabotages at once on 17 August. Nothing here
// quotes its opening or closing bracket. ────────────────────────────────────────────────────────
const MAP_CALL = '  return out.map(discloseScotland);';
const BODY_LINE = '    body: `${s.body} ${SCOTLAND_LINE}`,';
const WA_LINE = "    waText: `${s.waText}. ${SCOTLAND_LINE.replace(/\\.$/, '')}`,";
const GUARD = '  if (!SCOTLAND_SIGNALS.has(s.signalKey)) return s;';
const SET_INTERIOR_OWED = "  'poa_cliff', 'january_rehearsal',";
const SET_INTERIOR_RATES = "  'higher_rate_approach', 'pa_taper', 'goal_threshold_combo', 's24_exposure',";
const DECIDED_INTERIOR = "  'higher_rate_approach', 'pa_taper', 'goal_threshold_combo', 's24_exposure',\n  'cis_refund_milestone', 'property_rates_2027',";
const NOT_DISCLOSED_VAT = "  vat_approach:\n    'VAT is reserved, not devolved. The threshold and the rate are the same in Coatbridge as in Carlisle.',";
const AGENT_IN_DISCLOSED = "  'lib/agent.ts',\n].sort();";
const SL_IMPORT = "import { SCOTLAND_LINE } from './scotland';";

const SABOTAGES = [
  {
    name: '🔴 the disclosure map comes off the return, so the caveat vanishes from every signal',
    apply: ({ dir }) => edit(dir, AG, MAP_CALL, '  return out;'),
  },
  {
    name: '🔴 poa_cliff is quietly dropped from the disclosed set, which is the exact 18 August state',
    apply: ({ dir }) => edit(dir, AG, SET_INTERIOR_OWED, "  'january_rehearsal',"),
  },
  {
    name: 'a lever is added to the disclosed set without anybody deciding it',
    apply: ({ dir }) => edit(dir, AG, SET_INTERIOR_RATES, `${SET_INTERIOR_RATES}\n  'home_office_saving',`),
  },
  {
    name: '🔴 monday_brief is added, which would put an income tax caveat under a Corporation Tax figure',
    apply: ({ dir }) => edit(dir, AG, SET_INTERIOR_RATES, `${SET_INTERIOR_RATES}\n  'monday_brief',`),
  },
  {
    name: '🔴 the card gets the sentence and the WhatsApp text does not: one file, one channel silent',
    apply: ({ dir }) => edit(dir, AG, WA_LINE, '    waText: s.waText,'),
  },
  {
    name: 'the WhatsApp text gets it and the in app card does not',
    apply: ({ dir }) => edit(dir, AG, BODY_LINE, '    body: s.body,'),
  },
  {
    name: '🔴 the trailing full stop is left on, so the phone reads "coming to Lekhio.. You approve"',
    apply: ({ dir }) => edit(dir, AG, WA_LINE, '    waText: `${s.waText}. ${SCOTLAND_LINE}`,'),
  },
  {
    name: 'a second caveat is written out by hand instead of quoting lib/scotland.ts',
    apply: ({ dir }) => {
      edit(dir, AG, SL_IMPORT, "const SCOTLAND_LINE = 'Income tax uses the England, Wales and Northern Ireland rates for now.';");
    },
  },
  {
    name: 'the guard is inverted, so every signal that was decided clean starts saying it',
    apply: ({ dir }) => edit(dir, AG, GUARD, '  if (SCOTLAND_SIGNALS.has(s.signalKey)) return s;'),
  },
  {
    name: '🔴 lib/agent.ts goes back on the not disclosed list under the reason that had rotted',
    apply: ({ dir }) => {
      edit(dir, SC, AGENT_IN_DISCLOSED, '].sort();');
      edit(dir, SC, "  'lib/prepop.ts':", "  'lib/agent.ts':\n    'The nudges. Same reasoning as the thread and WhatsApp: conversational, repeated, and pointed at a figure the app screens already caveat.',\n  'lib/prepop.ts':");
    },
  },
  {
    name: 'a twenty sixth signal is added to the engine and nobody classifies it',
    apply: ({ dir }) => edit(dir, AG, "      signalKey: 'poa_cliff',",
      "      signalKey: 'poa_cliff_v2',\n      // the same push, renamed, which nobody has decided about"),
  },
  {
    name: 'one signal loses its written reason, so the class is no longer fully decided',
    apply: ({ dir }) => edit(dir, SC, NOT_DISCLOSED_VAT, ''),
  },
  {
    name: 'a reason is emptied out to something nobody can read',
    apply: ({ dir }) => edit(dir, SC, NOT_DISCLOSED_VAT, "  vat_approach: 'no',"),
  },
  {
    name: 'the decided list and the code disagree: one key moves in the TEST only',
    apply: ({ dir }) => edit(dir, SC, DECIDED_INTERIOR,
      "  'higher_rate_approach', 'pa_taper', 'goal_threshold_combo', 's24_exposure',\n  'cis_refund_milestone',"),
  },
  {
    name: '🔴 the caveat is made conditional on where he lives, which we do not ask and cannot know',
    apply: ({ dir }) => {
      edit(dir, AG, '  selfAssessmentPoa: { tax: number; deductedAtSource: number } | null;',
        '  selfAssessmentPoa: { tax: number; deductedAtSource: number } | null;\n  nation?: string | null;');
      edit(dir, AG, MAP_CALL, "  return out.map((s) => (input.nation === 'scotland' ? discloseScotland(s) : s));");
    },
  },
  {
    name: 'the import is left in place but the sentence is used once, so the ratchet stops counting it',
    apply: ({ dir }) => edit(dir, AG, BODY_LINE, "    body: `${s.body} Income tax is worked out at the England, Wales and Northern Ireland rates, and Scottish rates are coming to Lekhio.`,"),
  },
];

const CONTROLS = [
  {
    name: 'a comment is added inside the disclosure function',
    apply: ({ dir }) => edit(dir, AG, GUARD, `  // a comment, and comments say nothing to a customer\n${GUARD}`),
  },
  {
    name: 'the two owed keys are written on separate lines, same keys, same order',
    apply: ({ dir }) => edit(dir, AG, SET_INTERIOR_OWED, "  'poa_cliff',\n  'january_rehearsal',"),
  },
  {
    name: 'a not disclosed reason is reworded and stays readable',
    apply: ({ dir }) => edit(dir, SC, NOT_DISCLOSED_VAT,
      "  vat_approach:\n    'VAT is reserved to Westminster rather than devolved, so the registration threshold and the rate are identical in Coatbridge and in Carlisle. Nothing here moves under a Scottish band.',"),
  },
  {
    name: 'the decided disclosed list is re sorted, same eight keys',
    apply: ({ dir }) => edit(dir, SC, "  'poa_cliff', 'january_rehearsal',\n  'higher_rate_approach', 'pa_taper', 'goal_threshold_combo', 's24_exposure',\n  'cis_refund_milestone', 'property_rates_2027',",
      "  's24_exposure', 'property_rates_2027', 'pa_taper', 'poa_cliff',\n  'january_rehearsal', 'higher_rate_approach', 'goal_threshold_combo', 'cis_refund_milestone',"),
  },
  {
    name: 'the disclosure function\'s parameter is renamed, consistently',
    apply: ({ dir }) => {
      edit(dir, AG, 'function discloseScotland(s: AgentSignal): AgentSignal {', 'function discloseScotland(sig: AgentSignal): AgentSignal {');
      edit(dir, AG, GUARD, '  if (!SCOTLAND_SIGNALS.has(sig.signalKey)) return sig;');
      edit(dir, AG, '    ...s,\n' + BODY_LINE + '\n' + WA_LINE,
        "    ...sig,\n    body: `${sig.body} ${SCOTLAND_LINE}`,\n    waText: `${sig.waText}. ${SCOTLAND_LINE.replace(/\\.$/, '')}`,");
    },
  },
];

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
