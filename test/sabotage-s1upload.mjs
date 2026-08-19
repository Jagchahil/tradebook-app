// SABOTAGE THE UPLOAD BYTE CHECK. S1, 19 August 2026.
//
//   node test/sabotage-s1upload.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// S1 closed the last item of the twenty point security sweep: no upload path may accept a
// declared type it has not confirmed from the bytes. The guard for it is in
// test/oneupload.test.mjs and most of it is a SOURCE SCAN, which is the easiest kind of guard
// to make vacuous, so it is worth exactly what this pass proves.
//
// Each sabotage puts ONE thing back the way it was at 126bd950, on a scratch copy, and a suite
// has to go red. A sabotage that stays green is a hole and is reported as one.
//
// ⚠️ THE ONES WORTH KEEPING ARE THE QUIET ONES. Deleting the check outright is the obvious
// sabotage and the least interesting. The ones that matter change NOTHING a customer could
// see and everything about what we can still prove: the check moving to AFTER the write, the
// null return being treated as fine, the WEBP header being read four bytes short.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-s1-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

const SUITES = [
  'test/oneupload.test.mjs',
  'test/receiptstore.test.mjs',
  'test/moneyweb.test.mjs',
  'test/thread.test.mjs',
  'test/receiptvat.test.mjs',
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
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

const CHECK = `  if (!bytesConfirmType(bytes, mediaType)) return { outcome: 'nottype' };`;
const STORE = `  const storedPath = await storeReceiptImage(userId, bytes, mediaType);`;

const SABOTAGES = [
  {
    name: 'the receipt walk stops looking at the bytes at all',
    apply: (d) => edit(d, 'lib/receiptingest.ts', CHECK, '  // check removed'),
  },
  {
    name: '🔴 the check survives but moves to AFTER the write, which is after the thing it prevents',
    apply: (d) => {
      edit(d, 'lib/receiptingest.ts', CHECK, '  // moved');
      edit(d, 'lib/receiptingest.ts', STORE, STORE + '\n' + CHECK);
    },
  },
  {
    name: '🔴 the sniffer says yes to anything, so every declared type confirms itself',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      `  const actual = imageTypeFromBytes(bytes);
  return actual !== null && actual === (declared || '').toLowerCase().split(';')[0].trim();`,
      `  return RECEIPT_IMAGE_TYPES.includes((declared || '').toLowerCase().split(';')[0].trim());`),
  },
  {
    name: '🔴 unrecognised bytes are treated as fine, which is the null means yes hole',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      `  return actual !== null && actual === (declared || '').toLowerCase().split(';')[0].trim();`,
      `  return actual === null || actual === (declared || '').toLowerCase().split(';')[0].trim();`),
  },
  {
    name: '🔴 WEBP is read four bytes short, so a RIFF container of anything passes as an image',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      `  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';`,
      `  if (b.length >= 4 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';`),
  },
  {
    name: '🔴 a real image lying about WHICH image it is is waved through',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      `  return actual !== null && actual === (declared || '').toLowerCase().split(';')[0].trim();`,
      `  return actual !== null;`),
  },
  {
    name: '🔴 THE FIFTH DOOR: the job photo route stops checking, and it never goes through the walk',
    apply: (d) => edit(d, 'app/api/diary/photo/route.ts',
      `  if (!bytesConfirmType(bytes, mediaType)) return job(jobId, 'problem=type');`,
      `  // check removed`),
  },
  {
    name: '🔴 a caller stops answering the refusal and lets it fall through to "try a clearer photo"',
    apply: (d) => edit(d, 'app/api/thread/route.ts',
      `    case 'nottype':`,
      `    case 'nottype_disabled':`),
  },
  {
    name: '🔴 the two chat channels word the refusal separately again, which is how nine caveats start',
    apply: (d) => edit(d, 'app/api/whatsapp/route.ts',
      `      return NOT_AN_IMAGE_REPLY;`,
      `      return 'I cannot read that kind of file. A JPEG or PNG photograph works.';`),
  },
];

const CONTROLS = [
  {
    name: 'control: a comment above the sniffer is reworded',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      '// The first twelve bytes are enough for all four types we accept',
      '// Twelve bytes is enough for all four of the types we accept'),
  },
  {
    name: 'control: the sniffer\'s local parameter is renamed, because the guards read the work',
    apply: (d) => edit(d, 'lib/receiptingest.ts',
      `export function imageTypeFromBytes(bytes: Uint8Array): string | null {
  const b = bytes;`,
      `export function imageTypeFromBytes(raw: Uint8Array): string | null {
  const b = raw;`),
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
