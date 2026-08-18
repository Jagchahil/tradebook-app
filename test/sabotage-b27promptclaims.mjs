// SABOTAGE WHAT LEKHIO TELLS THE MODEL IT IS.
// B27, 18 AUGUST 2026. THE CLAIM THAT WAS NEVER IN THE SOURCE.
//
//   node test/sabotage-b27promptclaims.mjs
//
// The role and channel sentences that reached production lived in a PROMPT, so the entire screen
// scanning apparatus in test/compliance.test.mjs was blind to them. test/promptclaims.test.mjs is
// the repair and it captures the assembled request off a stubbed fetch. This pass exists to prove
// that guard can actually bite, on the exact sentences that were live, and that it does NOT bite
// the good sentences sitting next to them.
//
// TWO suites hold the repair and this pass runs both, because a sabotage caught by either is
// caught and a sabotage caught by NEITHER is the hole:
//   test/promptclaims.test.mjs     the new guard: role, professional body, channel, and the true
//                                  alternative asserted in rather than left as silence
//   test/guardrailparity.test.mjs  the four never break rules, which live UNDER the sentence this
//                                  packet edited and could have gone with it
//
// SCRATCH TREE: lib, test and app. Derived by grepping both suites for what they read rather than
// copied from a sibling pass: promptclaims reads lib/ only, guardrailparity reads lib/ and
// app/api/ask/route.ts. supabase/ is NOT read by either, so it is not copied, and if a third suite
// is ever added here that reads it, baseline() below is what will say so.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b27-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return { base, dir };
}

const SUITES = ['test/promptclaims.test.mjs', 'test/guardrailparity.test.mjs'];

// A crashing suite counts as RED. The full stop is optional on purpose: thirty suites in this repo
// end their tally without one, and a sibling pass once reported 25 of 25 while unable to tell a
// sabotage from an untouched repo because its regex required one.
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

// 🔴 BASELINE, FROM DAY ONE. A pass measures a DIFFERENCE and cannot otherwise tell a caught
// sabotage from a harness that reds on everything. Three times now in this repo: a missing
// supabase/, a full disk, and a tally line.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch()');
    console.log('   2. every suite tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};
const append = (dir, rel, text) => {
  const p = path.join(dir, rel);
  writeFileSync(p, `${readFileSync(p, 'utf8')}\n${text}\n`);
};

const CL = 'lib/claude.ts';
const PC = 'test/promptclaims.test.mjs';

// ⚠️ ANCHORS QUOTE THE INTERIOR OF EACH SENTENCE, NEVER THE EDGE OF THE RULE LIST. The list of
// never break rules is DESIGNED to grow: it went from four to six to eight in twelve days, and on
// 17 August three sabotages in another pass died at once because they quoted a growing list's
// closing bracket. Nothing here quotes a bracket or a neighbouring rule.
const ROLE_605 = "'You are Lekhio, a bookkeeping assistant for a UK small business owner. Most are sole traders";
const LINE_607 = "    'You never tell them to look it up, check HMRC yourself,";
const RULE_ROLE_WA = "    '- Never call Lekhio their accountant, their adviser or their agent, because it is none of those things. Lekhio is bookkeeping and tax software: it prepares their figures, they approve them, and they stay responsible to HMRC. If they ask whether they still need an accountant, tell them that is their call, and that plenty of people use both.',\n";
const RULE_PHOTO = "    '- They can send you a photograph of a receipt in this conversation and you read it. Never tell them they cannot. And never say which app or messaging service this conversation is happening in, because you cannot see which one it is. Naming a SCREEN inside Lekhio is a different thing and is often the right answer: Money, Ways to save and the Tax screen are all fine to name.',\n";
const RULE_INVEST = "    '- Do not give investment or pension product advice, on shares, crypto, property or anything else.";
const RULE_EVASION = "    '- Be accurate and strictly within the law. Never suggest, help with, or soften evasion:";
const ROLE_958 = "'You are Lekhio, a bookkeeping assistant for a UK self employed person";
const LINE_959 = "  'You know UK self employed tax and bookkeeping thoroughly. Give real, specific, accurate answers";
const RULE_ROLE_ASK = "  '- Never call Lekhio their accountant, their adviser or their agent, because it is none of those things. Lekhio is bookkeeping and tax software: it prepares their figures, they approve them, and they stay responsible to HMRC.',\n";

const SABOTAGES = [
  // ── THE EXACT SENTENCES THAT WERE LIVE ON 18 AUGUST 2026, PUT BACK ONE HALF AT A TIME. ────
  {
    name: '🔴 the role word goes back to "the accountant", which is what production said',
    apply: ({ dir }) => edit(dir, CL, ROLE_605, "'You are Lekhio, the accountant for a UK small business owner. Most are sole traders"),
  },
  {
    name: '🔴 the CHANNEL half goes back, and it names WhatsApp to a man in a browser',
    apply: ({ dir }) => edit(dir, CL, 'a UK small business owner. Most are sole traders', 'a UK small business owner, answering in WhatsApp. Most are sole traders'),
  },
  {
    name: '🔴 "You are their accountant." is restored three lines down, where it also was',
    apply: ({ dir }) => edit(dir, CL, LINE_607, "    'You are their accountant. You never tell them to look it up, check HMRC yourself,"),
  },
  {
    name: '🔴 the role word becomes a DIFFERENT regulated title nobody has typed yet',
    apply: ({ dir }) => edit(dir, CL, ROLE_605, "'You are Lekhio, a tax adviser for a UK small business owner. Most are sole traders"),
  },
  {
    name: '🔴 the model is told it acts for HMRC',
    apply: ({ dir }) => edit(dir, CL, LINE_607, "    'You are acting for HMRC. You never tell them to look it up, check HMRC yourself,"),
  },
  // ── SILENCE IS NOT HONESTY: THE TRUE ALTERNATIVE IS DELETED AND NOTHING PUT BACK. ──────────
  {
    name: '🔴 the standing instruction never to claim the role is DELETED from the WhatsApp lane',
    apply: ({ dir }) => edit(dir, CL, RULE_ROLE_WA, ''),
  },
  {
    name: '🔴 the same instruction is DELETED from the /api/ask prompt',
    apply: ({ dir }) => edit(dir, CL, RULE_ROLE_ASK, ''),
  },
  {
    name: '🔴 the photograph rule is DELETED, which is the state that told a man he cannot send one',
    apply: ({ dir }) => edit(dir, CL, RULE_PHOTO, ''),
  },
  {
    name: '🔴 the photograph promise is ADDED to /api/ask, where it is FALSE: that box is text only',
    apply: ({ dir }) => edit(dir, CL, RULE_ROLE_ASK, `${RULE_ROLE_ASK}  '- They can send you a photograph of a receipt in this conversation and you read it.',\n`),
  },
  // ── THE OTHER PROMPTS, AND THE R5 SWEEP'S OWN FINDING. ─────────────────────────────────────
  {
    name: '🔴 /api/ask goes back to calling itself "the in-app accountant"',
    apply: ({ dir }) => edit(dir, CL, ROLE_958, "'You are Lekhio, the in-app accountant for a UK self employed person"),
  },
  {
    name: '🔴 the four professional bodies go back into the qualification claim',
    apply: ({ dir }) => edit(dir, CL, LINE_959, "  'You are an expert in UK self employed tax and bookkeeping, built on the rules taught in the leading tax and accountancy qualifications (ACCA, ICAEW, CIOT, AAT). Give real, specific, accurate answers"),
  },
  {
    name: '🔴 a NEW prompt is added to the module and nobody covers it, which is how the next one gets in',
    apply: ({ dir }) => append(dir, CL, 'export async function answerBrandNewThing(q: string): Promise<string | null> {\n  return q;\n}'),
  },
  // ── THE FOUR NEVER BREAK RULES LIVE UNDER THE SENTENCE THIS PACKET EDITED. ─────────────────
  {
    name: '🔴 the evasion rule goes with the edit, which is the risk of touching this block at all',
    apply: ({ dir }) => edit(dir, CL, RULE_EVASION, "    '- Be accurate. Never mention"),
  },
  // ── AND THE GUARD ITSELF, BECAUSE A GUARD NOBODY GUARDS IS A COMMENT. ─────────────────────
  {
    name: '🔴 the role matcher is neutered so it can never match anything',
    apply: ({ dir }) => edit(dir, PC, 'const SELF = String.raw`(?:you\\s+are', 'const SELF = String.raw`(?:zzzznevermatches'),
  },
  {
    name: '🔴 the capture is neutered and every prompt arrives empty, which would pass every negative',
    apply: ({ dir }) => edit(dir, PC, "  if (!body) return '';", "  if (body || !body) return '';"),
  },
];

const CONTROLS = [
  {
    name: 'a GOOD sentence recommending a real professional is added, and must NOT be caught',
    apply: ({ dir }) => edit(dir, CL, RULE_INVEST, `    '- For anything genuinely complex, recommend they speak to a qualified accountant or adviser.',\n${RULE_INVEST}`),
  },
  {
    name: 'the role word is widened to "a bookkeeping and tax assistant": the guard pins the family, not the phrase',
    apply: ({ dir }) => edit(dir, CL, ROLE_605, "'You are Lekhio, a bookkeeping and tax assistant for a UK small business owner. Most are sole traders"),
  },
  {
    name: 'an ordinary sentence about HMRC is added, and HMRC is not a role claim',
    apply: ({ dir }) => edit(dir, CL, RULE_INVEST, `    '- HMRC publishes these rates each year and they change in April.',\n${RULE_INVEST}`),
  },
  {
    name: 'the tail of the role rule is reworded, because the words are meant to be free to improve',
    apply: ({ dir }) => edit(dir, CL, 'that is their call, and that plenty of people use both.', 'that is their decision, and that many people use both.'),
  },
  {
    name: 'a comment is added inside the prompt block, which changes nothing the model reads',
    apply: ({ dir }) => edit(dir, CL, RULE_INVEST, `    // a comment, and comments are not prompt text\n${RULE_INVEST}`),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL: every call is capped at 45
// seconds in a fresh sandbox and a detached process does not survive between calls. SAB_FROM and
// SAB_TO are indices into the sabotage list; unset means all of it, which is what the Mac runs.
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
