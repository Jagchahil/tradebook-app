// SABOTAGE THE PROPERTY EAR AND THE PERSON'S NAME.
//
//   node test/sabotage-earname.mjs

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-en-'));
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  return dir;
}
function runSuites(dir) {
  for (const t of ['test/propertyear.test.mjs', 'test/personname.test.mjs']) {
    try {
      const out = execFileSync('node', [path.join(dir, t)], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      if (/[1-9]\d* failed\./.test(out)) return true;
    } catch { return true; }
  }
  return false;
}
const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── The ear stops hearing ────────────────────────────────────────────────────────────────
  {
    name: 'the ear goes deaf, so "the flat upstairs" is trade again',
    apply: (d) => edit(d, 'lib/propertylanes.ts', "  return 'property';\n}", '  return null;\n}'),
  },
  {
    name: 'the voice walk stops asking it',
    apply: (d) => edit(d, 'lib/voiceflow.ts', 'const heard = spokenStream(clean);', 'const heard = null;'),
  },
  {
    name: 'the stream is never written, so the ear changes nothing',
    apply: (d) => edit(d, 'lib/voiceflow.ts',
      "    ...(stream === 'property' ? { income_type: 'property' as const } : {}),", ''),
  },
  {
    name: 'a chosen category stops winning, so the two signals can argue',
    apply: (d) => edit(d, 'lib/voiceflow.ts',
      "const stream = streamFor(parsed.category) === 'property' ? 'property' : heard ?? 'trade';",
      "const stream = heard ?? 'trade';"),
  },
  // ── 🔴 The refusals. These are the ones that move a florist's largest deduction. ─────────
  {
    name: '🔴 the trade markers are dropped, so SHOP RENT becomes property',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      '  const saidTrade = TRADE_MARKERS.some((m) => rest.includes(` ${m} `));\n  if (saidTrade) return null;', ''),
  },
  {
    name: '🔴 "the shop" falls off the trade list',
    apply: (d) => edit(d, 'lib/propertylanes.ts', "  'the shop', 'my shop', 'shop rent',", "  'shop rent',"),
  },
  {
    name: 'a property marker stops being required, so any rent is property',
    apply: (d) => edit(d, 'lib/propertylanes.ts', '  if (!saidProperty) return null;', ''),
  },
  {
    name: 'markers match anywhere in a word, so flatbed becomes a flat',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      'const saidProperty = PROPERTY_MARKERS.some((m) => h.includes(` ${m} `));',
      'const saidProperty = PROPERTY_MARKERS.some((m) => h.includes(m));'),
  },
  {
    name: 'negation stops being handled, so "not the shop" refuses',
    apply: (d) => edit(d, 'lib/propertylanes.ts',
      '  for (const n of NEGATED_TRADE) rest = rest.split(` ${n} `).join(\' \');', ''),
  },
  {
    name: 'silence stops being the default',
    apply: (d) => edit(d, 'lib/propertylanes.ts', "  if (!h.trim()) return null;", "  if (!h.trim()) return 'property';"),
  },
  {
    name: 'the row starts arriving confirmed, so the ear files instead of proposing',
    apply: (d) => edit(d, 'lib/voiceflow.ts', '    confirmed: false,', '    confirmed: true,'),
  },
  // ── The name ─────────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the reconcile SELECT drops person_name again, which is the bug itself',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'select=trade_type,trade,name,person_name,address', 'select=trade_type,trade,name,address'),
  },
  {
    name: 'the name is selected and then never written',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "  if (businessShaped && s.person_name && patch.name === undefined) patch.name = s.person_name;", ''),
  },
  {
    name: 'it stops checking the field is empty, so it can overwrite a real name',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'if (businessShaped && s.person_name && patch.name === undefined) patch.name = s.person_name;',
      'if (businessShaped && s.person_name) patch.name = s.person_name;'),
  },
  {
    name: 'a sole trader stops getting his business name in the person field',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '    if (businessShaped) patch.business_name = s.name;\n    else patch.name = s.name;',
      '    if (businessShaped) patch.business_name = s.name;'),
  },
  {
    name: 'the name is written after the patch is sent, so it never lands',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "  if (businessShaped && s.person_name && patch.name === undefined) patch.name = s.person_name;\n",
      ''),
  },
  {
    name: 'the form stops requiring a person name, so there is nothing to carry',
    apply: (d) => edit(d, 'app/start/page.tsx',
      "(!needsPersonName || personName.trim().length > 1)", "true"),
  },
];

const CONTROLS = [
  {
    name: 'a comment is reworded in propertylanes',
    apply: (d) => edit(d, 'lib/propertylanes.ts', '// A let property, in the words people actually use.',
      '// A let property, in the words people actually use (comment touched).'),
  },
  {
    name: 'a new property marker is added, which is the file doing its job',
    apply: (d) => edit(d, 'lib/propertylanes.ts', "  'the maisonette', 'the bedsit', 'the annexe',",
      "  'the maisonette', 'the bedsit', 'the annexe', 'the granny flat',"),
  },
  {
    name: 'whitespace in the reconcile patch',
    apply: (d) => edit(d, 'lib/supabase.ts', '  const businessShaped =', '\n  const businessShaped ='),
  },
];

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(dir, { recursive: true, force: true }); continue; }
  if (runSuites(dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${cOk}/${CONTROLS.length} controls green.`);
console.log(`${caught + cOk} of ${SABOTAGES.length + CONTROLS.length}.`);
if (missed > 0 || cBad > 0) process.exit(1);
