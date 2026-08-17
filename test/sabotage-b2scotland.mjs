// SABOTAGE THE SCOTLAND RULE ON THE CONVERSATIONAL LANES. B2, 17 AUGUST 2026.
//
//   node test/sabotage-b2scotland.mjs
//
// Section 2b of test/scotland.test.mjs was written after a live walk in which a Glasgow sole
// trader was told, by the in app chat, that his tax rates are the same as the rest of the UK, and
// then handed a band table with a 41% higher rate and no advanced rate. The rule that should have
// stopped both existed, in one prompt, asserted by nothing.
//
// Every sabotage below is a way that comes back: the rule deleted, the rule wording its own
// caveat, the rule sending him to gov.scot again, a second divergent copy, or one channel quietly
// losing the shared block. If one goes green, section 2b is decoration.
//
// The scratch tree is built as <tmp>/tradebook with a link to the real mobile repo beside it,
// because scotland.test.mjs section 3b reads '../tradebook-app'. Without that link every run goes
// red for a missing repo, every sabotage looks caught and every control looks broken, which is the
// harness lying rather than the guards biting.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b2scot-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}
function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/scotland.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (/[1-9]\d* failed\./.test(out)) return true;
  } catch { return true; }
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
// Drops the whole source line carrying `needle`, so a sabotage does not have to quote a 600
// character prompt string back at itself and rot the day a word in it changes.
const dropLine = (dir, rel, needle) => {
  const p = path.join(dir, rel);
  const lines = readFileSync(p, 'utf8').split('\n');
  const hit = lines.findIndex((l) => l.includes(needle) && !l.trimStart().startsWith('//'));
  if (hit === -1) throw new Error(`NO CODE LINE in ${rel} carrying: ${needle.slice(0, 60)}`);
  lines.splice(hit, 1);
  writeFileSync(p, lines.join('\n'));
};

const RULE_HEAD = 'SCOTLAND. Income tax rates and bands above the personal allowance are devolved';

const SABOTAGES = [
  {
    name: '🔴 the whole rule is deleted, so neither channel is told anything, which IS the finding',
    apply: ({ dir }) => dropLine(dir, 'lib/claude.ts', RULE_HEAD),
  },
  {
    name: '🔴 the rule goes back to living in ONE prompt, so WhatsApp hears nothing again',
    apply: ({ dir }) => {
      const p = path.join(dir, 'lib/claude.ts');
      const lines = readFileSync(p, 'utf8').split('\n');
      const hit = lines.findIndex((l) => l.includes(RULE_HEAD) && !l.trimStart().startsWith('//'));
      if (hit === -1) throw new Error('rule line not found');
      const [rule] = lines.splice(hit, 1);
      const anchor = lines.findIndex((l) => l.includes('You are Lekhio, the in-app accountant'));
      if (anchor === -1) throw new Error('accountantSystem anchor not found');
      lines.splice(anchor + 1, 0, rule);
      writeFileSync(p, lines.join('\n'));
    },
  },
  {
    name: '🔴 it sends him off to read the bands on gov.scot himself, which lib/scotland.ts forbids',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      'NEVER state a Scottish rate, band, threshold or percentage',
      'point him to the Scottish bands on gov.scot, and never state a Scottish rate, band, threshold or percentage'),
  },
  {
    name: 'the ban on stating a Scottish rate or band is dropped',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      'NEVER state a Scottish rate, band, threshold or percentage, not even to compare it with these ones, and ',
      ''),
  },
  {
    name: '🔴 the ban on saying Scotland is the same as the rest of the UK is dropped, which is answer one from the walk',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      'NEVER say that Scotland is the same as the rest of the UK, because it is not.',
      'Be helpful about it.'),
  },
  {
    name: 'it stops saying National Insurance, VAT and student loans are UK wide, so a Scot gets hedged on figures that are his',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      'National Insurance, VAT and student loan plans ARE the same across the UK, so answer those normally.',
      'Be careful with the other figures too.'),
  },
  {
    name: '🔴 the rule words its own caveat instead of quoting SCOTLAND_LINE, which is how one caveat becomes nine',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      '"${SCOTLAND_LINE}"',
      '"Your income tax here uses the England, Wales and Northern Ireland rates."'),
  },
  {
    name: 'the SCOTLAND_LINE import is dropped, so the file no longer reads the one sentence',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts', "import { SCOTLAND_LINE } from './scotland';\n", ''),
  },
  {
    name: '🔴 one channel loses the shared block, so the rule exists and that prompt never receives it',
    apply: ({ dir }) => editOnce(dir, 'lib/claude.ts', '    ...taxFacts2627(),\n', ''),
  },
  // ── J8: the set aside figure carries the sentence on every channel ───────────────────────
  {
    name: '🔴 the THREAD set aside answer drops the sentence, so web and chat disagree about one figure',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', '${cisLine} ${collection} ${SCOTLAND_LINE}`', '${cisLine} ${collection}`'),
  },
  {
    name: '🔴 WHATSAPP drops it, so the channel he uses from a van is the uncaveated one',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts',
      "const scot = hasPosition ? ` ${SCOTLAND_LINE}` : '';", "const scot = '';"),
  },
  {
    name: 'WhatsApp stops guarding on hasPosition, so a man with no figure gets a caveat about one',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts',
      "const scot = hasPosition ? ` ${SCOTLAND_LINE}` : '';", "const scot = ` ${SCOTLAND_LINE}`;"),
  },
  {
    name: 'a SECOND Scotland line is added, the exact drift that put the two channels out of step',
    apply: ({ dir }) => editOnce(dir, 'lib/claude.ts',
      "  'Rules:',",
      "  'Scottish taxpayers should check their own bands.',\n  'Rules:',"),
  },
];

const CONTROLS = [
  {
    name: 'a comment above the rule is reworded',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      '// It is the same drift the note above the WhatsApp prompt already records for the CIS rules:',
      '// It is the same drift the note above the WhatsApp prompt already records for CIS (touched):'),
  },
  {
    name: 'an unrelated prompt line is reworded, which is the file doing its job',
    apply: ({ dir }) => edit(dir, 'lib/claude.ts',
      'This is the bill that surprises people.',
      'This is the bill that catches people out.'),
  },
  {
    name: 'blank line added inside the shared block',
    apply: ({ dir }) => editOnce(dir, 'lib/claude.ts', 'function taxFacts2627(): string[] {', 'function taxFacts2627(): string[] {\n'),
  },
  {
    name: 'the Scotland sentence itself is untouched and lib/scotland.ts is only re commented',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts', '// ⚠️ THE SENTENCE LIVES HERE, NOT IN THE PAGES', '// ⚠️ THE SENTENCE LIVES HERE, AND NOT IN THE PAGES'),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${cOk}/${CONTROLS.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);
