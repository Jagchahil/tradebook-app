// Lekhio logic tests. No framework, just node. Run from the repo root:
//   node test/logic.test.js
// Transpiles lib/taxguide.ts in memory and asserts the pure logic: the trade
// matcher, the guide content, the trigger, and the claim rate maths that mirror
// the WhatsApp webhook. Exits non-zero on any failure, so it works in CI too.

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'taxguide.ts'), 'utf8');
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const tmp = path.join(require('os').tmpdir(), 'lekhio_taxguide.js');
fs.writeFileSync(tmp, out);
const tg = require(tmp);

let pass = 0;
let fail = 0;
const eq = (name, a, b) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log('FAIL', name, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); }
};
const ok = (name, c) => { if (c) pass++; else { fail++; console.log('FAIL', name); } };

// Trade matcher across all 20 categories
const cases = [
  ['electrician', 'electrician'], ['sparky', 'electrician'], ['plumber', 'plumber'], ['builder', 'builder'],
  ['roofer', 'roofer'], ['plasterer', 'plasterer'], ['carpenter', 'joiner'], ['painter and decorator', 'decorator'],
  ['tiler', 'tiler'], ['gas engineer', 'gas engineer'], ['scaffolder', 'scaffolder'], ['groundworker', 'groundworker'],
  ['gardener', 'landscaper'], ['barber', 'hairdresser'], ['cleaner', 'cleaner'], ['courier', 'driver'],
  ['nail tech', 'beautician'], ['photographer', 'photographer'], ['personal trainer', 'personal trainer'],
  ['teacher', 'tutor'], ['web developer', 'freelancer'],
];
for (const [inp, want] of cases) { const r = tg.matchTrade(inp); eq('matchTrade(' + inp + ')', r ? r.name : null, want); }
eq('matchTrade(astronaut)', tg.matchTrade('astronaut'), null);

// Guide content
eq('totalCards', tg.totalCards(), 9);
ok('card0 has Step 1', /Step 1/.test(tg.cardText(0, null)));
ok('card7 claims has Every trade', /Every trade/.test(tg.cardText(7, null)));
ok('card8 closing has 31 Jan', /31 Jan/.test(tg.cardText(8, null)));
ok('card with trade lists items', /cable/i.test(tg.cardText(7, tg.matchTrade('electrician'))));

// Trigger
ok('trigger: how do i do my tax return', tg.TAXGUIDE_TRIGGER.test('how do i do my tax return'));
ok('trigger: self assessment', tg.TAXGUIDE_TRIGGER.test('self assessment please'));
ok('trigger NOT: hello', !tg.TAXGUIDE_TRIGGER.test('hello'));

// Logic spec mirroring the webhook claim maths
const mileageRate = (b) => /\b(motorbike|motorcycle|moped|scooter)\b/i.test(b) ? 24 : /\b(bicycle|pushbike|push bike|cycling|on (?:the|my) bike|by bike)\b/i.test(b) ? 20 : 55;
eq('mileage car', mileageRate('drove 24 miles'), 55);
eq('mileage motorbike', mileageRate('30 miles on the motorbike'), 24);
eq('mileage bike', mileageRate('12 miles on the bike'), 20);
const homeRate = (h) => (h >= 101 ? 26 : h >= 51 ? 18 : h >= 25 ? 10 : 0);
eq('home 90h', homeRate(90), 18); eq('home 120h', homeRate(120), 26); eq('home 30h', homeRate(30), 10); eq('home 10h', homeRate(10), 0);
const marginal = (p) => (p > 50270 ? 0.42 : p > 12570 ? 0.26 : 0);
eq('marginal 8000', marginal(8000), 0); eq('marginal 30000', marginal(30000), 0.26); eq('marginal 60000', marginal(60000), 0.42);
const cisNet = (g, d) => Math.round((g - d) * 100) / 100;
eq('cis net 400/80', cisNet(400, 80), 320);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
