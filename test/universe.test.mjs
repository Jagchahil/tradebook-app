// THE UNIVERSE, TESTED. The picture is a thin renderer over lib/universe.ts, so the model is what
// we prove: the four suns are the four suns, every star hangs off a real arm, every tax constant is
// present, brightness follows what we actually watch (never flatters), the one real comet tail is
// there, and no star cites a source we are not licensed to read.
//
// Same staging trick as brainmap.test.mjs: the lib uses extensionless relative imports (so Next and
// tsc are happy), and Node's type-stripping loader needs the .ts, so we copy the small dependency
// tree into a temp dir and rewrite the imports on the way in.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'universe-'));
const rewrite = (src) => src.replace(/from '\.\/([a-zA-Z0-9_.-]+)'/g, "from './$1.ts'");
for (const f of ['lawsources', 'taxengine', 'claimrules.data', 'universe']) {
  writeFileSync(path.join(stage, f + '.ts'), rewrite(readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')));
}
const U = await import(pathToFileURL(path.join(stage, 'universe.ts')).href);
const { buildUniverse, everySourceLicensed, formatConstant, CORES } = U;
const { FACTS } = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const { LEGAL_FIELDS } = await import(pathToFileURL(path.join(stage, 'lawsources.ts')).href);

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; } catch (e) { fail++; console.log(`  FAIL ${name}`); console.log('    ' + (e && e.message)); }
};

console.log('\nuniverse: the whole brain as a galaxy that only glows where it is watched');

// ── The four suns, exactly. ─────────────────────────────────────────────────────────────────────
t('four cores, named and no more', () => {
  const u = buildUniverse();
  assert.equal(u.cores.length, 4);
  assert.deepEqual(u.cores.map((c) => c.key).sort(), ['khoji', 'lekhio', 'puchio', 'rakha']);
  assert.equal(CORES.length, 4);
});

// ── Structural integrity: no orphan stars, no orphan arms. ──────────────────────────────────────
t('every star hangs off a real arm, every arm off a real core', () => {
  const u = buildUniverse();
  const armIds = new Set(u.arms.map((a) => a.id));
  const coreKeys = new Set(u.cores.map((c) => c.key));
  for (const a of u.arms) assert.ok(coreKeys.has(a.core), `arm ${a.id} has unknown core ${a.core}`);
  for (const s of u.stars) {
    assert.ok(armIds.has(s.arm), `star ${s.id} points at missing arm ${s.arm}`);
    assert.ok(coreKeys.has(s.core), `star ${s.id} has unknown core ${s.core}`);
  }
});

// ── Every engine constant is out there, exactly once. ───────────────────────────────────────────
t('all tax constants present as stars, one each', () => {
  const u = buildUniverse();
  const constIds = u.stars.filter((s) => s.kind === 'constant').map((s) => s.id);
  assert.equal(new Set(constIds).size, constIds.length, 'a constant was drawn twice');
  for (const key of Object.keys(FACTS)) {
    assert.ok(constIds.includes(`const:${key}`), `constant ${key} is missing from the sky`);
  }
  assert.equal(constIds.length, Object.keys(FACTS).length);
});

// ── Every legal field is an arm of Khoji. ───────────────────────────────────────────────────────
t('the twelve fields of law are all arms', () => {
  const u = buildUniverse();
  for (const f of LEGAL_FIELDS) {
    assert.ok(u.arms.some((a) => a.id === `khoji:${f}`), `field ${f} has no arm`);
  }
});

// ── Brightness is honest: dim without a watch, bright with one. ─────────────────────────────────
t('with no live state, no tax constant glows', () => {
  const u = buildUniverse();
  const lit = u.stars.find((s) => s.kind === 'constant' && s.pulse !== 'unmeasured');
  assert.equal(lit, undefined, 'a tax constant glowed with nothing watching it');
});

t('a watched constant burns with the tax pulse; an unwatched one stays dim', () => {
  const u = buildUniverse({ tax: { pulse: 'fresh', watchedKeys: ['mileageCarFirst10k'] } });
  const lit = u.stars.find((s) => s.id === 'const:mileageCarFirst10k');
  const dim = u.stars.find((s) => s.id === 'const:badrRate');
  assert.equal(lit.pulse, 'fresh');
  assert.equal(dim.pulse, 'unmeasured');
});

t('drift shows as attention on the watched constants, not green', () => {
  const u = buildUniverse({ tax: { pulse: 'attention', watchedKeys: Object.keys(FACTS) } });
  const c = u.stars.find((s) => s.id === 'const:personalAllowance');
  assert.equal(c.pulse, 'attention');
});

// ── The one real comet tail. ────────────────────────────────────────────────────────────────────
t('mileage carries its real 45p tail, and flat constants carry none', () => {
  const u = buildUniverse();
  const mile = u.stars.find((s) => s.id === 'const:mileageCarFirst10k');
  assert.ok(mile.history && mile.history.length === 1, 'the mileage tail is missing');
  assert.equal(mile.history[0].value, '45p');
  assert.equal(mile.value, '55p');
  const pa = u.stars.find((s) => s.id === 'const:personalAllowance');
  assert.ok(!pa.history, 'a flat constant grew a tail it never had');
});

// ── Formatting reads like a fact, not a variable. ───────────────────────────────────────────────
t('constants format the way a human reads them', () => {
  assert.equal(formatConstant('basicRate', 0.2), '20%');
  assert.equal(formatConstant('personalAllowance', 12570), '£12,570');
  assert.equal(formatConstant('mileageCarFirst10k', 0.55), '55p');
  assert.equal(formatConstant('taxYear', '2026/27'), '2026/27');
});

// ── The licence line, drawn from lawsources, not re-implemented. ────────────────────────────────
t('no star cites a host we are not licensed to read', () => {
  const u = buildUniverse({ law: { employment: { pulse: 'fresh' } } });
  assert.ok(everySourceLicensed(u), 'a star cited an unlicensed source');
});

// ── Stats add up, and the exam count flows through. ─────────────────────────────────────────────
t('stats count the sky honestly and the exam bank shows its size', () => {
  const u = buildUniverse({ tax: { pulse: 'fresh', watchedKeys: Object.keys(FACTS) }, examCount: 173, day: 20 });
  assert.equal(u.stats.stars, u.stars.length);
  assert.equal(u.stats.watched, u.stars.filter((s) => s.pulse !== 'unmeasured').length);
  assert.equal(u.stats.day, 20);
  const exam = u.stars.find((s) => s.id === 'exam:tax');
  assert.equal(exam.value, '173');
  assert.ok(exam.says.includes('173'));
});

// ── Determinism: the same inputs draw the same sky, byte for byte. ──────────────────────────────
t('the build is deterministic', () => {
  const a = buildUniverse({ tax: { pulse: 'fresh', watchedKeys: ['basicRate'] }, examCount: 173, day: 5 });
  const b = buildUniverse({ tax: { pulse: 'fresh', watchedKeys: ['basicRate'] }, examCount: 173, day: 5 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
