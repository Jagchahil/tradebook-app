// SABOTAGE THE MESSAGE THAT ARRIVES AT MIDNIGHT.
// B30, 18 AUGUST 2026. WHAT HE IS SHOWN, WHAT HE IS ASKED, AND WHICH WAY THE MONEY WENT.
//
//   node test/sabotage-b30digest.mjs
//   SAB_FROM=0 SAB_TO=5 node test/sabotage-b30digest.mjs      (a slice, for a 45 second shell)
//   SAB_SKIP_CONTROLS=1 node test/sabotage-b30digest.mjs
//
// Three defects lived in one builder, and the middle one is the serious one:
//
//   1. The money was `£${Math.abs(n).toFixed(2)}`, so "£1034.30" with no thousands separator, and
//      the abs() threw away the SIGN, which schema.sql line 627 says is the only thing in the row
//      saying which way the money went. A £900 sale and a £900 spend printed identically.
//   2. 🔴 THE ASKING LIST WAS SLICED TO EIGHT. A man with twelve unrecognised entries read "12 I do
//      not recognise:", saw eight, and then read "Reply YES to file those too". handleAck's own
//      comment says "He can only approve what he was shown". The cap was what made that false.
//   3. "Nothing here needs you" at 00:01 against the approved template's "You approve everything,
//      nothing sends itself" at 08:00, to the same man, on the same phone.
//
// TWO suites hold the repair and this pass runs both:
//   test/digest.test.mjs           the builder, driven for real
//   test/threadcollection.test.mjs the chat's sameness promise, which now says the figure moves
//
// ⚠️ THE TALLY LINES DIFFER. digest ends "N passed, M failed." and threadcollection ends
// "N passed, M failed" with NO FULL STOP. The regex below makes the stop optional.
//
// SCRATCH TREE: lib, test and app. Derived by grepping both suites for what they read:
// digest reads lib/ only, threadcollection reads lib/ and three files under app/. supabase/ is not
// read by either, so it is not copied, and baseline() is what will say so if that ever changes.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b30d-'));
  const dir = path.join(base, 'tradebook');
  // 🔴 supabase/ IS COPIED SINCE 19 AUGUST 2026 AND IT IS NOT TIDINESS. B35 gave test/digest.test.mjs
  // a section that reads supabase/APPLY_2026-08-19_digest_shown.sql off disk. A tree without that
  // directory does not FAIL the suite, it CRASHES it, which scores every sabotage as caught and
  // every control as broken. This repo has been bitten by exactly that before.
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return { base, dir };
}

const SUITES = ['test/digest.test.mjs', 'test/threadcollection.test.mjs'];

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
    console.log('   2. every suite tally line matches the regex in runSuite (threadcollection has NO full stop)');
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

const DG = 'lib/digest.ts';
const TH = 'app/api/thread/route.ts';
const DT = 'test/digest.test.mjs';
// B35, 19 August 2026. The approval gate's own files.
const SUP = 'lib/supabase.ts';
const CRON = 'app/api/cron/digest/route.ts';
const WA = 'app/api/whatsapp/route.ts';
const SQL = 'supabase/APPLY_2026-08-19_digest_shown.sql';

// ── ANCHORS ON THE WORK. Nothing here quotes a heading, a bullet or the edge of a list. ─────────
const ASK_MAP = "    parts.push(asking.map((e) => `• ${line(e)}`).join('\\n'));";
const DIRECTION = "  const direction = e.amount >= 0 ? ' in' : '';";
const LINE_RETURN = "  return `${name}, ${gbpAbs2(e.amount)}${direction}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;";
const FILED_SLICE = '    const shown = filed.slice(0, MAX_LINES);';
const FILED_MORE = "    parts.push(shown.map((e) => `• ${line(e)}`).join('\\n') + (more > 0 ? `\\n• and ${more} more` : ''));";
const ALL_CLEAR = "    parts.push('Nothing here needs you tonight. Entries land in your books on their own; nothing reaches HMRC without your yes. Reply NO if any of that looks wrong.');";
const MONEY_IMPORT = "import { gbpAbs2 } from './money';";
const IT_MOVES = "  const itMoves = ' It moves as your year does.';";
const MOVES_APPEND = '    collection += itMoves;';
const LTD_ARM = '    collection = `${sameFigure}.${itMoves}`;';
const CODEONLY = "  const codeOnly = (x) => x.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/(^|[^:])\\/\\/[^\\n]*/g, '$1');";

const SABOTAGES = [
  // ── 🔴 THE APPROVAL GATE. He is asked about twelve and shown eight. ─────────────────────────
  {
    name: '🔴 the asking list is sliced to eight again, which is the exact 18 August state',
    apply: ({ dir }) => edit(dir, DG, ASK_MAP, "    parts.push(asking.slice(0, MAX_LINES).map((e) => `• ${line(e)}`).join('\\n'));"),
  },
  {
    name: '🔴 sliced, but with an "and N more" bolted on: he still approves what he cannot see',
    apply: ({ dir }) => edit(dir, DG, ASK_MAP,
      "    parts.push(asking.slice(0, MAX_LINES).map((e) => `• ${line(e)}`).join('\\n') + (asking.length > MAX_LINES ? `\\n• and ${asking.length - MAX_LINES} more` : ''));"),
  },
  {
    name: 'the asking list is capped at one, which is the same defect made obvious',
    apply: ({ dir }) => edit(dir, DG, ASK_MAP, "    parts.push(asking.slice(0, 1).map((e) => `• ${line(e)}`).join('\\n'));"),
  },
  // ── WHICH WAY THE MONEY WENT. ───────────────────────────────────────────────────────────────
  {
    name: '🔴 the direction is dropped, so a £900 sale reads exactly like a £900 spend',
    apply: ({ dir }) => edit(dir, DG, DIRECTION, "  const direction = '';"),
  },
  {
    name: 'the direction is inverted, so spending is labelled money in',
    apply: ({ dir }) => edit(dir, DG, DIRECTION, "  const direction = e.amount < 0 ? ' in' : '';"),
  },
  {
    name: 'the boundary moves off the schema\'s own >= 0, so a zero row loses its branch',
    apply: ({ dir }) => edit(dir, DG, DIRECTION, "  const direction = e.amount > 0 ? ' in' : '';"),
  },
  // ── ONE MONEY FORMATTER. ────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the local toFixed formatter comes back, and "£1034.30" with it',
    apply: ({ dir }) => {
      edit(dir, DG, MONEY_IMPORT, '');
      edit(dir, DG, LINE_RETURN,
        "  return `${name}, £${Math.abs(e.amount).toFixed(2)}${direction}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;");
    },
  },
  {
    name: 'whole pounds instead of pence, which is the wrong family for a logged amount',
    apply: ({ dir }) => {
      edit(dir, DG, MONEY_IMPORT, "import { gbpAbs0 } from './money';");
      edit(dir, DG, LINE_RETURN,
        "  return `${name}, ${gbpAbs0(e.amount)}${direction}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;");
    },
  },
  // ── THE FILED LIST KEEPS ITS CAP AND ITS ARITHMETIC. ────────────────────────────────────────
  {
    name: 'the filed cap is removed, so a busy day is a wall of text after all',
    apply: ({ dir }) => edit(dir, DG, FILED_SLICE, '    const shown = filed;'),
  },
  {
    name: 'the "and N more" line goes, so eight of twenty are told as if they were twenty',
    apply: ({ dir }) => edit(dir, DG, FILED_MORE, "    parts.push(shown.map((e) => `• ${line(e)}`).join('\\n'));"),
  },
  {
    name: 'the "and N more" arithmetic is off by one',
    apply: ({ dir }) => edit(dir, DG, FILED_MORE, "    parts.push(shown.map((e) => `• ${line(e)}`).join('\\n') + (more > 0 ? `\\n• and ${more - 1} more` : ''));"),
  },
  // ── THE TWO MESSAGES TELL THE SAME TRUTH. ───────────────────────────────────────────────────
  {
    name: '🔴 the all clear reverts to the sentence that contradicted the 08:00 text',
    apply: ({ dir }) => edit(dir, DG, ALL_CLEAR, "    parts.push('Nothing here needs you. Reply NO if any of that looks wrong.');"),
  },
  {
    name: 'the word "here" is dropped, which is R2-F22\'s scope admission going with it',
    apply: ({ dir }) => edit(dir, DG, ALL_CLEAR, "    parts.push('Nothing needs you tonight. Entries land in your books on their own; nothing reaches HMRC without your yes. Reply NO if any of that looks wrong.');"),
  },
  {
    name: 'the irreversible half is dropped, so it is an all clear about nothing again',
    apply: ({ dir }) => edit(dir, DG, ALL_CLEAR, "    parts.push('Nothing here needs you tonight. Entries land in your books on their own. Reply NO if any of that looks wrong.');"),
  },
  // ── THE CHAT'S SAMENESS PROMISE. ────────────────────────────────────────────────────────────
  {
    name: '🔴 the chat stops saying the figure moves, so the promise goes stale overnight again',
    apply: ({ dir }) => {
      edit(dir, TH, MOVES_APPEND, '');
      edit(dir, TH, LTD_ARM, '    collection = `${sameFigure}.`;');
    },
  },
  {
    name: 'only the company arm loses it: one file, one branch silent',
    apply: ({ dir }) => edit(dir, TH, LTD_ARM, '    collection = `${sameFigure}.`;'),
  },
  {
    name: 'the movement clause is spliced into the sameness sentence, giving three ands',
    apply: ({ dir }) => {
      edit(dir, TH, IT_MOVES, "  const itMoves = '';");
      edit(dir, TH, "const sameFigure = 'It is the same figure your Tax screen leads with';",
        "const sameFigure = 'It is the same figure your Tax screen leads with, and it moves as your year does';");
    },
  },
  // ── AND THE GUARD'S OWN EYES. ───────────────────────────────────────────────────────────────
  {
    name: 'the digest suite\'s comment stripper is made a no op, blinding its own formatter guard',
    apply: ({ dir }) => edit(dir, DT, CODEONLY, '  const codeOnly = (x) => x;'),
  },
  // ── B35, 19 AUGUST 2026. THE APPROVAL GATE THAT REACHED PAST WHAT IT SHOWED HIM. ──────────
  //
  // Section 6 of test/digest.test.mjs says the confirm is bounded by the ids that were PRINTED,
  // that a null falls back to the window so either deploy order is safe, that the send path records
  // the asking list and only for messages that went, and that the comment and the code agree.
  {
    name: '🔴 THE CONFIRM GOES BACK TO THE WINDOW ALONE, so a man told 20 and shown 20 has his YES'
      + ' file 35 again',
    apply: ({ dir }) => edit(dir, SUP, '      idFilter +\n', ''),
  },
  {
    name: '🔴 THE IDS REPLACE THE WINDOW INSTEAD OF NARROWING IT, which is a widening wearing a'
      + ' bound: a stale id list would reach outside the digest it came from',
    apply: ({ dir }) => edit(dir, SUP, "      `&created_at=gte.${encodeURIComponent(sinceISO)}` +\n      idFilter +", '      idFilter +'),
  },
  {
    name: '🔴 A NON UUID IS PASTED STRAIGHT INTO THE FILTER, which is the rule every other in list'
      + ' in this file follows and the one place a caller controls the value',
    apply: ({ dir }) => edit(dir, SUP, '  const only = Array.isArray(shownIds) ? shownIds.filter((i) => UUID.test(i)) : [];',
      '  const only = Array.isArray(shownIds) ? shownIds : [];'),
  },
  {
    name: '🔴 A MISSING TABLE COMES BACK AS AN EMPTY LIST RATHER THAN AS A NULL, so a migration that'
      + ' has not been run reads as "he was shown nothing"',
    apply: ({ dir }) => edit(dir, SUP, "      { headers: headers() },\n    );\n    if (!res.ok) return null;\n    const rows = (await res.json().catch(() => null)) as (Array<{ transaction_ids: string[] | null }>) | null;",
      "      { headers: headers() },\n    );\n    if (!res.ok) return [];\n    const rows = (await res.json().catch(() => null)) as (Array<{ transaction_ids: string[] | null }>) | null;"),
  },
  {
    name: '🔴 THE SEND PATH RECORDS THE FILED LIST INSTEAD OF THE ASKING LIST, so YES is bounded by'
      + ' rows that were already confirmed and the ones he was actually asked about are unbounded',
    apply: ({ dir }) => edit(dir, CRON, 'askedIds: split.asking.map((e) => e.id),', 'askedIds: split.filed.map((e) => e.id),'),
  },
  {
    name: '🔴 THE RECORD IS WRITTEN FOR EVERY PLANNED MESSAGE RATHER THAN FOR THE ONES THAT WENT, so'
      + ' a failed send leaves a row claiming we asked him something he never received',
    apply: ({ dir }) => edit(dir, CRON, '        done.push(job.id);\n        if (job.askedIds.length > 0) shown.push({ userId: job.id, transactionIds: job.askedIds });',
      '        done.push(job.id);'),
  },
  {
    name: '🔴 handleAck STOPS READING WHAT HE WAS SHOWN AND KEEPS THE CLAIM IN ITS COMMENT, which is'
      + ' the exact shape B35 was filed as: a comment claiming a property the code does not have',
    apply: ({ dir }) => edit(dir, WA, '  const shownIds = await lastDigestShownIds(userId);\n  const filed = await confirmDigestEntries(userId, from24h, shownIds);',
      '  const filed = await confirmDigestEntries(userId, from24h);'),
  },
  {
    name: '🔴 THE MIGRATION LEAVES RLS OFF, so a record of what we texted somebody is readable by'
      + ' anon and authenticated',
    apply: ({ dir }) => edit(dir, SQL, 'alter table public.digest_shown enable row level security;', ''),
  },
];

const CONTROLS = [
  {
    name: 'CONTROL: a COMMENT INSIDE lastDigestShownIds IS REWORDED AND STILL CONTAINS THE WORD'
      + ' "as". The lift strips comments before it strips casts, and this is the control that says'
      + ' so: the first draft did not, and it swallowed the return statement under this very line',
    apply: ({ dir }) => edit(dir, SUP, '    // An EMPTY array is not a bound of nothing, it is a row that recorded nothing, and treating it',
      '    // Reworded. An empty array reads as unknown rather than as an instruction, and treating it'),
  },
  {
    name: 'CONTROL: the id filter local is RENAMED consistently in the confirm, and a guard that'
      + ' reds here is a guard about a name',
    apply: ({ dir }) => {
      edit(dir, SUP, '  const only = Array.isArray(shownIds) ? shownIds.filter((i) => UUID.test(i)) : [];',
        '  const bounded = Array.isArray(shownIds) ? shownIds.filter((i) => UUID.test(i)) : [];');
      edit(dir, SUP, "  const idFilter = only.length > 0\n    ? `&id=in.(${encodeURIComponent(only.map((i) => `\"${i}\"`).join(','))})`\n    : '';",
        "  const inList = bounded.length > 0\n    ? `&id=in.(${encodeURIComponent(bounded.map((i) => `\"${i}\"`).join(','))})`\n    : '';");
      edit(dir, SUP, '      idFilter +', '      inList +');
    },
  },

  {
    name: 'a comment is added inside line()',
    apply: ({ dir }) => edit(dir, DG, DIRECTION, `  // a comment, and comments are not sentences\n${DIRECTION}`),
  },
  {
    name: 'the direction local is renamed, consistently, and nothing reads its name',
    apply: ({ dir }) => {
      edit(dir, DG, DIRECTION, "  const inward = e.amount >= 0 ? ' in' : '';");
      edit(dir, DG, LINE_RETURN,
        "  return `${name}, ${gbpAbs2(e.amount)}${inward}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;");
    },
  },
  {
    name: 'the ternary is written as an if, same two outcomes',
    apply: ({ dir }) => edit(dir, DG, DIRECTION, "  let direction = '';\n  if (e.amount >= 0) direction = ' in';"),
  },
  {
    name: 'a comment block in lib/digest.ts is reworded',
    apply: ({ dir }) => edit(dir, DG, '// "Screwfix, £84.30, materials", and "Wickes, £900.00 in, labour"',
      '// One line per entry, with the direction on it.'),
  },
  {
    name: 'the movement clause local is renamed in the thread route, consistently',
    apply: ({ dir }) => {
      edit(dir, TH, IT_MOVES, "  const movesClause = ' It moves as your year does.';");
      edit(dir, TH, LTD_ARM, '    collection = `${sameFigure}.${movesClause}`;');
      edit(dir, TH, MOVES_APPEND, '    collection += movesClause;');
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
