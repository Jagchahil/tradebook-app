// SABOTAGE THE ONE DOOR ONTO HIS FIGURES. B24, 19 August 2026.
//
//   node test/sabotage-b24optimiserdoor.mjs
//
// ═══════════════════════════════════════════════════════════
// B24 is guarded by test/optimiserdoor.test.mjs, and most of that suite is a SOURCE SCAN over a
// derived caller list, which is the easiest kind of guard in this repo to make vacuous. So this
// pass is worth what it proves and nothing else: each sabotage puts ONE thing back the way it
// was at 9b23d259, on a scratch copy, and a suite has to go red.
//
// ⚠️ THE QUIET ONES ARE THE POINT. Deleting the line is the obvious sabotage and the least
// interesting. The ones that matter are the ones a reviewer would wave through: the door that
// still catches the THROW and stops asking about rowsUnreadable, which is the half nobody could
// see and the half that did the damage; the page that shows the line UNDERNEATH its figures
// instead of instead of them; the second copy of the wording typed into a page.
//
// ⚠️ AND TWO OF THE FOUR CONTROLS ARE THE ONES THIS REPO KEEPS EARNING. A RENAME control and a
// COMMENT REWORD control have each caught a real anchor fault here this week, so the guards are
// written to match a shape and these two prove they do.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b24-'));
  // supabase/ is copied because test/thread.test.mjs reads supabase/APPLY_*.sql off disk, and a
  // tree without it does not FAIL that suite, it CRASHES it, which scores every sabotage as
  // caught and every control as broken. Four red controls at once was how that was found.
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

const SUITES = [
  'test/optimiserdoor.test.mjs',
  'test/thread.test.mjs',
];

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

// A pass measures a DIFFERENCE and has no way of knowing whether the red it sees came from the
// sabotage or from a harness that reds on everything. So it proves an untouched tree is green
// first, and says the three things to check if it is not.
function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   1. every directory these suites READ is copied by scratch()');
    console.log('   2. every tally line matches the regex in runSuite');
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

const DOOR = 'lib/supabase.ts';
const COMP = 'app/app/RecordsUnreadable.tsx';
const WAYS = 'app/app/tax/ways-to-save/page.tsx';
const HUB = 'app/app/tax/page.tsx';
const HOME = 'app/app/page.tsx';
const SETUP = 'app/app/setup/page.tsx';
const LEDGER = 'app/api/ledger/route.ts';
const MONEY = 'app/app/money/page.tsx';

const SESSION_LINE = '  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);';

const CATCH_LINE = '  const input = await getOptimiserInput(userId).catch(() => null);';
const UNREADABLE_LINE = '  if (input.rowsUnreadable === true) return null;';
const SIGNED = 'Lekhio could not read your records just now, so this page is not showing figures. Nothing has happened to your books. Refresh in a minute.';
const WAYS_GUARD = '  if (!optimiser) return <RecordsUnreadable current="/app/tax/ways-to-save" title="Ways to save" />;';
const HUB_GUARD = '  if (!optimiser) return <RecordsUnreadable current="/app/tax" title="Where you stand" />;';
const HOME_GUARD = '  if (!optimiser) return <RecordsUnreadable current="/app" title="Your overview" />;';

const SABOTAGES = [
  // ── THE DOOR ITSELF ────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the door stops catching the THROWN read, so a rejected fetch is an error boundary again',
    apply: (d) => edit(d, DOOR, CATCH_LINE, '  const input = await getOptimiserInput(userId);'),
  },
  {
    name: '🔴 THE QUIET ONE: the door still catches the throw and stops asking about rowsUnreadable',
    apply: (d) => edit(d, DOOR, UNREADABLE_LINE, '  // the unreadable rows shape is no longer asked about'),
  },
  {
    name: '🔴 rowsUnreadable is asked about and the zeros are handed back anyway',
    apply: (d) => edit(d, DOOR, UNREADABLE_LINE, '  if (input.rowsUnreadable === true) return input;'),
  },
  {
    name: '🔴 the test is loosened to truthiness, so an unreadable read reported as a string walks through',
    apply: (d) => edit(d, DOOR, UNREADABLE_LINE, '  if (input.rowsUnreadable === 1) return null;'),
  },
  {
    name: '🔴 the door refuses EVERYTHING, which passes both failure checks and is useless',
    apply: (d) => edit(d, DOOR, '  return input;\n}', '  return null;\n}'),
  },
  {
    name: '🔴 the door is a second reader rather than the one the thread calls',
    apply: (d) => edit(d, DOOR, CATCH_LINE, '  const input = await Promise.resolve(null);'),
  },

  // ── THE SENTENCE ───────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the signed line is softened into an apology that says nothing',
    apply: (d) => edit(d, COMP, SIGNED, 'We are having trouble right now. Please try again.'),
  },
  {
    name: '🔴 the half that stops him panicking is dropped: nothing has happened to your books',
    apply: (d) => edit(d, COMP, ' Nothing has happened to your books.', ''),
  },
  {
    name: '🔴 he is told what went wrong and never told when to come back',
    apply: (d) => edit(d, COMP, ' Refresh in a minute.', ''),
  },
  {
    name: '🔴 a button is added, so the screen with nothing to decide hands him a decision',
    apply: (d) => edit(d, COMP, '        <p style={S.line}>{RECORDS_UNREADABLE_LINE}</p>',
      '        <p style={S.line}>{RECORDS_UNREADABLE_LINE}</p>\n        <button type="button">Try again</button>'),
  },
  {
    name: '🔴 the component hardcodes the words instead of rendering the one constant',
    apply: (d) => edit(d, COMP, '{RECORDS_UNREADABLE_LINE}', `{'${SIGNED}'}`),
  },
  {
    name: '🔴 a SECOND wording is typed into a page, which is how one sentence becomes two',
    apply: (d) => edit(d, WAYS, WAYS_GUARD,
      `  if (!optimiser) return <p>${SIGNED}</p>;`),
  },
  {
    name: '🔴 the nav is dropped, stranding him on the one screen already telling him something broke',
    apply: (d) => edit(d, COMP, "      <AppNav current={current ?? '/app'} />", ''),
  },

  // ── THE DOORS THAT USE IT ──────────────────────────────────────────────────────────────────
  {
    name: '🔴 the tax hub loses its guard and draws a year of zeros off a failed read again',
    apply: (d) => edit(d, HUB, HUB_GUARD, '  // the hub trusts whatever came back'),
  },
  {
    name: '🔴 the Overview loses its guard, which is the screen he opens to find out what he owes',
    apply: (d) => edit(d, HOME, HOME_GUARD, '  // the overview trusts whatever came back'),
  },
  {
    name: '🔴 /app/setup goes back to blaming him for our failed read',
    apply: (d) => edit(d, SETUP, '        {optimiser === null ? (\n          <RecordsUnreadable inline />\n        ) : foundMoney && l ? (', '        {foundMoney && l ? ('),
  },
  {
    name: '🔴 THE QUIET ONE: the line moves BELOW the figures, so it apologises under a screen of zeros',
    apply: (d) => {
      edit(d, WAYS, WAYS_GUARD, '  // the line moved to the bottom of the page');
      edit(d, WAYS, '      <AppNav current="/app/tax/ways-to-save" />',
        '      <AppNav current="/app/tax/ways-to-save" />\n      {optimiser ? null : <RecordsUnreadable inline />}');
    },
  },
  {
    name: '🔴 a page goes back to the raw getOptimiserInput, which is how the eleven got here',
    apply: (d) => {
      edit(d, WAYS, 'readOptimiserOrNull(user.id)', 'getOptimiserInput(user.id)');
      edit(d, WAYS, 'readOptimiserOrNull }', 'getOptimiserInput }');
    },
  },
  {
    // ⚠️ THIS SABOTAGE OPENS A TWELFTH DOOR ON A PAGE THAT REALLY EXISTS, rather than writing a
    // new file. A pass that creates its target at run time has anchors scripts/check-sabotage
    // -anchors.mjs cannot resolve, and it reports them as a missing target, which is
    // indistinguishable from a dead anchor to the next person reading the loop.
    name: '🔴 a twelfth page door is opened on an existing screen and never taught the line',
    apply: (d) => edit(d, MONEY, SESSION_LINE,
      `${SESSION_LINE}\n  const optimiser = await readOptimiserOrNull(user?.id ?? '');\n  void optimiser;`),
  },
  {
    name: '🔴 a FOURTEENTH route call arrives, and the count that forces the decision goes unwatched',
    apply: (d) => edit(d, LEDGER, '  const input = await getOptimiserInput(user.id);',
      '  const input = await getOptimiserInput(user.id);\n  const again = await getOptimiserInput(user.id);\n  void again;'),
  },
  {
    name: '🔴 the tax hub and the thread stop reading the same optimiser, which is the drift pin',
    apply: (d) => edit(d, HUB, 'readOptimiserOrNull(user.id),', 'Promise.resolve(null),'),
  },
];

// ── NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about, and each
// MUST stay green, or the guard above it is a guard about a name rather than about a shape. ─────
const CONTROLS = [
  {
    name: 'CONTROL: the local is RENAMED on a page, and a guard that reds on this is about a name',
    apply: (d) => {
      edit(d, WAYS, 'const optimiser = await readOptimiserOrNull(user.id);', 'const figures = await readOptimiserOrNull(user.id);');
      edit(d, WAYS, 'if (!optimiser) return <RecordsUnreadable', 'if (!figures) return <RecordsUnreadable');
      edit(d, WAYS, 'findOptimisations(optimiser)', 'findOptimisations(figures)');
    },
  },
  {
    name: 'CONTROL: a COMMENT is reworded in the component, and a guard hanging off prose reds here',
    apply: (d) => edit(d, COMP, '// WHAT A PAGE SAYS WHEN IT COULD NOT READ HIS RECORDS. B24, 19 August 2026.',
      '// The failed read screen. Reworded comment, same code.'),
  },
  {
    name: 'CONTROL: a COMMENT is reworded on the tax hub, beside its guard',
    apply: (d) => edit(d, HUB, '  // TWO APART. readOptimiserOrNull folds the thrown read and the unreadable rows into ONE null, and',
      '  // reworded, and the code below is untouched.'),
  },
  {
    name: 'CONTROL: whitespace is added inside the door body in lib/supabase.ts',
    apply: (d) => edit(d, DOOR, '  if (!input) return null;', '  if (!input) return null;\n'),
  },
];

const only = process.env.SAB_ONLY ? Number(process.env.SAB_ONLY) : null;
const from = process.env.SAB_FROM ? Number(process.env.SAB_FROM) : 0;
const to = process.env.SAB_TO ? Number(process.env.SAB_TO) : SABOTAGES.length;
const sliced = from !== 0 || to !== SABOTAGES.length || only !== null;

baseline();

let caught = 0;
const holes = [];
const list = only !== null ? [SABOTAGES[only]] : SABOTAGES.slice(from, to);
for (const s of list) {
  const dir = scratch();
  let applied = true;
  try { s.apply(dir); } catch (e) { applied = false; console.log(`  🔴 MISSED ANCHOR  ${s.name}\n     ${e.message}`); }
  if (applied) {
    if (runSuite(dir)) { caught += 1; console.log(`  CAUGHT  ${s.name}`); }
    else { holes.push(s.name); console.log(`  🔴 HOLE    ${s.name}`); }
  }
  rmSync(dir, { recursive: true, force: true });
}

let controlsGreen = 0;
const badControls = [];
const runControls = !process.env.SAB_SKIP_CONTROLS;
if (runControls) {
  for (const c of CONTROLS) {
    const dir = scratch();
    try {
      c.apply(dir);
      if (runSuite(dir)) { badControls.push(c.name); console.log(`  🔴 CONTROL RED  ${c.name}`); }
      else { controlsGreen += 1; console.log(`  control green  ${c.name}`); }
    } catch (e) { badControls.push(`${c.name} (anchor: ${e.message})`); }
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${caught}/${list.length} sabotages caught, ${controlsGreen}/${runControls ? CONTROLS.length : 0} controls green.`);
if (sliced) console.log('NOT THE WHOLE PASS: run with no SAB_FROM, SAB_TO or SAB_ONLY for the full figure.');
if (holes.length) { console.log('\nHOLES:'); for (const h of holes) console.log(`  ${h}`); }
if (badControls.length) { console.log('\nBAD CONTROLS:'); for (const b of badControls) console.log(`  ${b}`); }
process.exitCode = holes.length || badControls.length || caught !== list.length ? 1 : 0;
