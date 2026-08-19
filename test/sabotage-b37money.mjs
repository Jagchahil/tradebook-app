// SABOTAGE THE MONEY TAIL. B37, B39 AND B41, 19 August 2026.
//
//   node test/sabotage-b37money.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// B26 settled two figures. This packet settled the rest of them, and it added a suite whose whole
// job is to notice when one of them changes costume again. A suite like that is worth exactly what
// its sabotages prove, because the failure mode is silence: every assertion here is a positive
// match on a source string, and a positive match is the easiest kind of guard to make vacuous.
//
// Each sabotage below puts ONE thing back the way it was before tonight, on a scratch copy, and a
// suite has to go red. A sabotage that stays green is a hole and is reported as one.
//
// The disciplines, all learned here the expensive way:
//   1. ANCHOR ON THE WORK, never on an identifier a rename would move.
//   2. PROVE AN UNMODIFIED TREE IS GREEN FIRST, or a broken harness scores every sabotage caught.
//   3. NO-OP CONTROLS. Edits that change nothing must stay GREEN.
//   4. THE ANCHOR MUST EXIST. edit() throws rather than quietly doing nothing.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b37-'));
  // supabase/ is copied because suites in this list read APPLY_*.sql off disk. A tree without it
  // does not FAIL those suites, it CRASHES them, and then every sabotage scores as caught.
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

// The suites that hold this repair. A sabotage caught by ANY of them is caught; one caught by none
// is the hole.
const SUITES = [
  'test/moneyone.test.mjs',
  'test/weeklyupdate.test.mjs',
  'test/dayone.test.mjs',
  'test/moneyweb.test.mjs',
  'test/taxweb.test.mjs',
  'test/invoicesweb.test.mjs',
  // B46 brought lib/agent.ts into this pass, so its own two suites join the catchers.
  'test/agent.test.mjs',
  'test/agentstructure.test.mjs',
];

// ⚠️ A CRASHING SUITE COUNTS AS RED, and the tally line is not identical in every suite: some end
// with a full stop and some do not, which cost sibling passes their first result twice.
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

function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
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
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE SABOTAGES. Each is a thing that was true at 95ad959f and must never be true again silently.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SABOTAGES = [
  {
    name: 'B37: the year tiles on the home screen go back to whole pounds',
    apply: (d) => edit(d, 'app/app/page.tsx', '{gbp2(moneyIn)}', '{gbp0(moneyIn)}'),
  },
  {
    name: 'B37: the week line on the home screen goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/page.tsx', '{gbp2(week.income)} in, {gbp2(week.expenses)} out.',
      '{gbp0(week.income)} in, {gbp0(week.expenses)} out.'),
  },
  {
    name: 'B37: /app/money prints the three tiles in whole pounds again',
    apply: (d) => edit(d, 'app/app/money/page.tsx', '{gbp2(log.income)}', '{gbp0(log.income)}'),
  },
  {
    name: 'B37: the car money on /app/money goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/money/page.tsx', '{gbp2(log.capitalCost)} more went out on',
      '{gbp0(log.capitalCost)} more went out on'),
  },
  {
    name: 'B37: the quarter pack tiles on the summary page go back to whole pounds',
    apply: (d) => edit(d, 'app/app/tax/summary/page.tsx', '{gbp2(sub.trade.net)}', '{gbp0(sub.trade.net)}'),
  },
  {
    name: 'B37: the Sunday digest goes back to "Pence on a Sunday evening is noise"',
    apply: (d) => edit(d, 'lib/weeklyupdate.ts', 'return gbpAbs2(n);', 'return gbp(Math.abs(Number.isFinite(n) ? n : 0));'),
  },
  {
    name: 'B39: Class 4 on the NI page goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/tax/ni/page.tsx', '{gbp2(ni.class4)}', '{gbp0(ni.class4)}'),
  },
  {
    name: 'B39: the January student loan figure goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/tax/student-loan/page.tsx', '{gbp2(tax.studentLoan)}', '{gbp0(tax.studentLoan)}'),
  },
  {
    name: '🔴 B39 THE OTHER WAY: the STATUTORY student loan threshold is dressed in pence',
    apply: (d) => edit(d, 'lib/waintents.ts', 'threshold of ${gbpShort(input.threshold)}',
      'threshold of ${formatGbp(input.threshold)}'),
  },
  {
    name: '🔴 B39 THE OTHER WAY: a Class 4 statutory band is dressed in pence',
    apply: (d) => edit(d, 'app/app/tax/ni/page.tsx', '{gbp0(FACTS.class4LowerLimit)}', '{gbp2(FACTS.class4LowerLimit)}'),
  },
  {
    name: '🔴 B41: the chat formatter loses its non number guard and can print £NaN again',
    apply: (d) => edit(d, 'lib/waintents.ts',
      "  const v = Number.isFinite(n) ? n : 0;\n  return `£${Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;",
      "  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;"),
  },
  {
    name: '🔴 B41: the quarter pack puts the sign back inside the pound',
    apply: (d) => edit(d, 'lib/quarterpack.ts',
      "  const abs = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });\n  return v < 0 ? `-£${abs}` : `£${abs}`;",
      "  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;"),
  },
  {
    name: '🔴 B41: the invoice PDF puts the sign back inside the pound',
    apply: (d) => edit(d, 'lib/invoicepdf.ts',
      "  const abs = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });\n  return v < 0 ? `-£${abs}` : `£${abs}`;",
      "  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;"),
  },
  {
    name: '🔴 B41: the pay yourself advice rounds the sign inside the pound again',
    apply: (d) => edit(d, 'lib/payyourself.ts',
      "  const r = Math.round(v) || 0;\n  const abs = Math.abs(r).toLocaleString('en-GB');\n  return r < 0 ? `-£${abs}` : `£${abs}`;",
      "  return `£${Math.round(v).toLocaleString('en-GB')}`;"),
  },
  {
    name: '🔴 B41: the WhatsApp chaser goes back to whole pounds, so £152.40 is chased as £152',
    apply: (d) => edit(d, 'lib/waintents.ts', 'for ${gbpOwed(total)}', 'for ${gbpShort(total)}'),
  },
  {
    name: "🔴 B41: lib/money.ts claims again to be the only place a pound is written",
    apply: (d) => edit(d, 'lib/money.ts',
      '// lib/money.ts. THE POUND, AND THE EIGHT COPIES OF IT THAT ARE CHECKED AGAINST IT.',
      '// lib/money.ts. ONE WAY TO WRITE A POUND.'),
  },
  {
    name: '🔴 B41: a ninth formatter appears and says nothing about itself',
    apply: (d) => edit(d, 'lib/margin.ts', 'export function marginForUsage',
      "const gbpNine = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;\nvoid gbpNine;\nexport function marginForUsage"),
  },
  {
    name: '\u{1F534} B38: the receipt on /app/pile goes back to whole pounds, beside its own VAT in pence',
    apply: (d) => edit(d, 'app/app/pile/page.tsx', '{gbp2(g.total)}', '{gbp0(g.total)}'),
  },
  {
    name: '\u{1F534} B38: the unsure receipt line loses its pence, on the screen where he says yes',
    apply: (d) => edit(d, 'app/app/pile/page.tsx', 'uncertainAmountLine(gbp2(g.total))', 'uncertainAmountLine(gbp0(g.total))'),
  },
  {
    name: '\u{1F534} B38: the single entry screen goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/entry/page.tsx', '{gbp2(entry.amount)}', '{gbp0(entry.amount)}'),
  },
  {
    name: '\u{1F534} B38: the car cost sentence goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/entry/page.tsx', '${gbp2(cost)} left your account', '${gbp0(cost)} left your account'),
  },
  {
    name: '\u{1F534} B38: the third screen the item never named goes back to whole pounds',
    apply: (d) => edit(d, 'app/app/money/page.tsx', '{gbp2(e.amount)}', '{gbp0(e.amount)}'),
  },
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // B46, 19 AUGUST 2026. THE PROACTIVE SURFACE. Seven, because section 4b of moneyone is not one
  // assertion but a derivation, and a derivation can fail in more ways than a string match can.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    name: 'B46: a figure of his goes back to whole pounds on the WhatsApp nudge',
    apply: (d) => edit(d, 'lib/agent.ts', '${his(d.ytdIncome)}', '${gbp(d.ytdIncome)}'),
  },
  {
    name: '🔴 B46 THE OTHER WAY: the Making Tax Digital level is dressed in pence',
    apply: (d) => edit(d, 'lib/agent.ts', '${gbp(mtdThreshold)}', '${his(mtdThreshold)}'),
  },
  {
    name: '🔴 B46 THE OTHER WAY: the VAT registration threshold is dressed in pence',
    apply: (d) => edit(d, 'lib/agent.ts', '${gbp(vat)}', '${his(vat)}'),
  },
  {
    name: '🔴 B46: pence printed ANONYMOUSLY, straight through gbp2, saying nothing about whose money it is',
    apply: (d) => edit(d, 'lib/agent.ts', '${his(poa)}', '${gbp2(poa)}'),
  },
  {
    name: '🔴 B46: whole pounds printed ANONYMOUSLY, straight through gbp0',
    apply: (d) => edit(d, 'lib/agent.ts', '${gbp(spt)}', '${gbp0(spt)}'),
  },
  {
    name: '🔴 B46: the two aliases are wired to the same formatter, so the file says two things and means one',
    apply: (d) => edit(d, 'lib/agent.ts', 'const his = (n: number) => gbp2(n);', 'const his = (n: number) => gbp0(n);'),
  },
  {
    name: '🔴 B46 THE FOUNDING CASE: voluntary Class 2 rounds to "about £190" again while /app/tax/ni says £189.80',
    apply: (d) => edit(d, 'lib/agent.ts', 'about ${his(cost)} for the whole year', 'about ${gbp(cost)} for the whole year'),
  },
  {
    name: '🔴 B46 THE DERIVATION ITSELF: a statutory alias stops being a BARE alias, so the scan can no longer see it is the law',
    apply: (d) => edit(d, 'lib/agent.ts', 'const spt = FACTS.class2SmallProfitsThreshold;',
      'const spt = Number(FACTS.class2SmallProfitsThreshold);'),
  },
];

// ═══ NO-OP CONTROLS. Each changes the files without changing behaviour, and must stay GREEN. Three
// controls red at once is a broken harness rather than three broken guards.
const CONTROLS = [
  {
    name: 'control: a comment is added above the money doctrine',
    apply: (d) => edit(d, 'lib/money.ts', '// PURE. No I/O, no clock, no rates.',
      '// (a control comment, meaning nothing)\n// PURE. No I/O, no clock, no rates.'),
  },
  {
    name: 'control: the weekly summary keeps its formatter and loses a blank line',
    apply: (d) => edit(d, 'lib/weeklyupdate.ts', 'function money(n: number): string {\n  return gbpAbs2(n);',
      'function money(n: number): string {\n  /* control */ return gbpAbs2(n);'),
  },
  {
    name: 'control: an unrelated NI page word changes',
    apply: (d) => edit(d, 'app/app/tax/ni/page.tsx', 'taken by your employer on the payslip.',
      'taken by your employer on the payslip today.'),
  },
  {
    name: 'B46 control: rewording a COMMENT in lib/agent.ts changes nothing',
    apply: (d) => edit(d, 'lib/agent.ts', '// HIS OWN MONEY: pence, on every surface',
      '// his own money. pence. every surface. reworded on purpose.'),
  },
  {
    name: 'B46 control: RENAMING the Class 2 cost variable changes nothing, because the guards read the work',
    apply: (d) => {
      edit(d, 'lib/agent.ts', 'const cost = Math.round(FACTS.class2WeeklyRate * 52 * 100) / 100;',
        'const class2Cost = Math.round(FACTS.class2WeeklyRate * 52 * 100) / 100;');
      edit(d, 'lib/agent.ts', 'about ${his(cost)} for the whole year', 'about ${his(class2Cost)} for the whole year');
      edit(d, 'lib/agent.ts', 'About ${his(cost)} of voluntary Class 2', 'About ${his(class2Cost)} of voluntary Class 2');
      edit(d, 'lib/agent.ts', 'threshold: spt, cost }', 'threshold: spt, cost: class2Cost }');
    },
  },
];

baseline();

let caught = 0;
const holes = [];
for (const s of SABOTAGES) {
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
for (const c of CONTROLS) {
  const dir = scratch();
  try {
    c.apply(dir);
    if (runSuite(dir)) { badControls.push(c.name); console.log(`  🔴 CONTROL RED  ${c.name}`); }
    else { controlsGreen += 1; console.log(`  control green  ${c.name}`); }
  } catch (e) { badControls.push(`${c.name} (anchor: ${e.message})`); }
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${caught}/${SABOTAGES.length} sabotages caught, ${controlsGreen}/${CONTROLS.length} controls green.`);
if (holes.length) { console.log('\nHOLES:'); for (const h of holes) console.log(`  ${h}`); }
if (badControls.length) { console.log('\nBAD CONTROLS:'); for (const b of badControls) console.log(`  ${b}`); }
process.exitCode = holes.length || badControls.length || caught !== SABOTAGES.length ? 1 : 0;
