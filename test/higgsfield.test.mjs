// The render contract (pure logic in lib/higgsfield.ts). Run: node test/higgsfield.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'higgs-'));
// higgsfield.ts imports houseCopy from ./housestyle at run time, and only types from ./studio which
// type stripping erases. Stage housestyle and rewrite the import to the staged .ts.
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
const fix = (s) => s.replace("from './housestyle'", "from './housestyle.ts'");
writeFileSync(path.join(stage, 'higgsfield.ts'), fix(readFileSync(path.join(lib, 'higgsfield.ts'), 'utf8')));
const H = await import(pathToFileURL(path.join(stage, 'higgsfield.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

console.log('\n=== ships dark, caps have cautious defaults ===\n');
ok('STUDIO_GEN_ENABLED is off by default', H.STUDIO_GEN_ENABLED() === false);
ok('per brief cap defaults to 8', H.genMaxPerBrief() === 8);
ok('per day cap defaults to 24', H.genMaxPerDay() === 24);

console.log('\n=== aspect and weight per format ===\n');
ok('carousel is 4:5', H.aspectFor('carousel') === '4:5');
ok('video is 9:16', H.aspectFor('video') === '9:16');
ok('tip is 9:16', H.aspectFor('tip') === '9:16');
ok('video is the heaviest', H.renderWeight('video') > H.renderWeight('carousel') && H.renderWeight('carousel') > H.renderWeight('tip'));

console.log('\n=== buildRenderRequest is faceless and dash free ===\n');
const asset = {
  id: 'a1', format: 'video', scene: 'Loft — natural light',
  storyboard: [
    { n: 1, visual: 'Cable in a loft — handheld', caption: 'Filing is the easy bit — the money is the claim', vo: 'Filing is the easy bit', seconds: 4 },
    { n: 2, visual: 'Phone snaps a receipt', caption: 'Snap it', vo: null, seconds: 3 },
  ],
};
const req = H.buildRenderRequest(asset);
ok('aspect follows the format', req.aspect === '9:16');
ok('directive carries the faceless rule', /faceless/i.test(req.directive) && /never a face/i.test(req.directive));
ok('scene is cleaned of dashes', !/[–—−]/.test(req.scene) && req.scene.includes('Loft'));
ok('frame captions are cleaned of dashes', req.frames.every((f) => !/[–—−]/.test(f.caption)));
ok('frame visuals are cleaned of dashes', req.frames.every((f) => !/[–—−]/.test(f.visual)));
ok('a null vo stays null', req.frames[1].vo === null);
ok('the request carries the format weight', req.weight === H.renderWeight('video'));

console.log('\n=== planRenders enforces the caps ===\n');
const ten = Array.from({ length: 10 }, (_, i) => ({ asset_id: `a${i}`, format: 'video' }));
const p1 = H.planRenders(ten, { maxPerBrief: 8, maxPerDay: 24, alreadyToday: 0 });
ok('per brief cap accepts 8 of 10', p1.accepted.length === 8 && p1.skipped.length === 2);
ok('the overflow is marked over_cap', p1.skipped.every((s) => s.reason === 'over_cap'));
const p2 = H.planRenders(ten, { maxPerBrief: 8, maxPerDay: 24, alreadyToday: 20 });
ok('the day ceiling narrows the brief', p2.accepted.length === 4);
const p3 = H.planRenders(ten, { maxPerBrief: 8, maxPerDay: 24, alreadyToday: 24 });
ok('a spent day accepts nothing', p3.accepted.length === 0 && p3.skipped.length === 10);

console.log('\n=== acceptRenderResult gates before storing a url ===\n');
ok('disabled refuses any url', H.acceptRenderResult('https://cdn.higgsfield.ai/x.mp4', { enabled: false, configured: true }).reason === 'disabled');
ok('no key refuses', H.acceptRenderResult('https://cdn.higgsfield.ai/x.mp4', { enabled: true, configured: false }).reason === 'no_key');
ok('a plain http url is refused', H.acceptRenderResult('http://x/y.mp4', { enabled: true, configured: true }).reason === 'bad_url');
ok('a data url is refused', H.acceptRenderResult('data:video/mp4;base64,AAAA', { enabled: true, configured: true }).reason === 'bad_url');
ok('a real https url is accepted', H.acceptRenderResult('https://cdn.higgsfield.ai/x.mp4', { enabled: true, configured: true }).ok === true);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
