// THE LANDLORD WALK. The four holes a landlord persona found on the live site, 31 July 2026,
// each pinned so it cannot quietly reopen:
//
//   1. NO DOOR. The /start trade picker had no Landlord chip, so she signed up as "Something
//      else" and the product never learned the one fact its property engine runs on.
//   2. RENT FILED AS TRADE. Money in had one shape, so her rent landed as trade income, which is
//      not a tidiness problem: trade income carries Class 4 National Insurance and rent does not,
//      so the mixing OVERSTATES her bill. The add screen now offers "rent from a property" to
//      accounts with the rental flag, and the manual route files it income_type 'property', the
//      same shape the WhatsApp rent capture writes and lib/propertyengine.ts reads.
//   3. A PROMISE WITH NO KEEPER. The signup reveal said the rental allowance "reaches back
//      4 years, we handle this one", and Ways to save then said "Nothing to suggest". The
//      optimiser now carries a property allowance card, and every word of its comparison comes
//      from propertyProfit() in lib/propertyengine.ts, the one place that owns that rule.
//   4. A TAX SCREEN THAT NEVER SAID RENT. Step 4 of signup promises each stream is taxed its own
//      way; the hub now says so, one sentence, only for accounts with the flag or confirmed rent.
//
// Logic tests run the staged optimiser against landlord fixtures; source assertions hold the
// wiring. Style follows test/taxoptimiser.test.mjs and test/moneyweb.test.mjs.
// Run: node test/landlord.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments argue at length about what the code must not do, so a check for code or customer copy
// strips them first, same as test/moneyweb.test.mjs.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Stage the optimiser and the property engine for bare node, the taxoptimiser.test.mjs harness.
const stage = mkdtempSync(path.join(tmpdir(), 'landlord-'));
const fix = (s) => s
  .replace("from './taxengine'", "from './taxengine.ts'")
  .replace("from './autonomy'", "from './autonomy.ts'")
  .replace("from './ltdengine'", "from './ltdengine.ts'")
  .replace("from './personalincome'", "from './personalincome.ts'")
  .replace("from './nistudentloan'", "from './nistudentloan.ts'")
  .replace("from './propertyengine'", "from './propertyengine.ts'");
for (const f of ['taxengine', 'autonomy', 'nistudentloan', 'ltdengine', 'personalincome', 'propertyengine', 'taxoptimiser', 'housestyle']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const P = await import(pathToFileURL(path.join(stage, 'propertyengine.ts')).href);
const H = await import(pathToFileURL(path.join(stage, 'housestyle.ts')).href);
const find = (list, key) => list.find((o) => o.key === key);

const base = {
  startYear: 2026, monthsElapsed: 12,
  ytdTradeIncome: 0, ytdTradeExpenses: 0, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: [], homeOfficeClaimed: true, mileageClaimed: true, purchaseGoal: null,
};

console.log('\n=== the property allowance card: when it speaks and when it stays silent ===\n');

// Nothing moves for a pure trader. The one-way promise every optimiser change must keep.
const trader = O.findOptimisations({ ...base, ytdTradeIncome: 30000, ytdTradeExpenses: 5000, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'] });
ok('a trader with no rent and no flag never sees the property card', !find(trader, 'property_allowance'));

// The flag alone, no figures: the card appears and says plainly that there is no number yet.
const flagged = O.findOptimisations({ ...base, circumstances: { rental: 'yes' } });
const flagCard = find(flagged, 'property_allowance');
ok('the rental flag opens the card before any rent is logged', !!flagCard);
ok('...as information, never a quantified saving', flagCard?.info === true && flagCard?.estSaving === 0);
ok('...naming the £1,000 property allowance', /£1,000 property/.test(flagCard?.title ?? ''));
ok('...and it says honestly that no figures are logged yet', /No property figures are logged yet/.test(flagCard?.detail ?? ''));

// 'no' suppresses; silence does not open. The same rule marriage already follows: only an
// explicit yes is an answer, and an unanswered question is not a no.
ok("an explicit 'no' keeps the card away", !find(O.findOptimisations({ ...base, circumstances: { rental: 'no' } }), 'property_allowance'));
ok('an unanswered question, with no rent, keeps it away too', !find(O.findOptimisations({ ...base, circumstances: {} }), 'property_allowance'));

console.log('\n=== the comparison is the property engine\'s, never a second copy ===\n');

// Rents within the allowance: nothing to tax, and the engine says so in its own words.
const small = find(O.findOptimisations({ ...base, ytdPropertyIncome: 850, ytdPropertyExpenses: 0 }), 'property_allowance');
ok('confirmed rent opens the card without any flag, because money logged is a fact', !!small);
ok('rents within the allowance: the engine\'s own "nothing to tax" sentence',
  /nothing to tax/.test(small?.detail ?? ''));
ok('🔴 THE SENTENCE IS propertyProfit()\'s, VERBATIM. One engine, one comparison',
  (small?.detail ?? '').startsWith(P.propertyProfit(850, 0, '2026-27').note));
ok('...and the figure carries its basis: his own confirmed rent', /£850 of rent/.test(small?.detail ?? ''));

// The allowance beats thin costs: it is used instead, and both figures are named.
const thin = find(O.findOptimisations({ ...base, ytdPropertyIncome: 12000, ytdPropertyExpenses: 300 }), 'property_allowance');
ok('allowance beats £300 of costs and the card says so', /is used instead/.test(thin?.detail ?? ''));
ok('...with his rent and his costs both named as the basis',
  /£12,000 of rent/.test(thin?.detail ?? '') && /£300 of property costs/.test(thin?.detail ?? ''));

// Real costs beat the allowance: actuals are deducted, exactly as the engine decides.
const costly = find(O.findOptimisations({ ...base, ytdPropertyIncome: 12000, ytdPropertyExpenses: 4000 }), 'property_allowance');
ok('£4,000 of actual costs beat the allowance and the card says so', /deducted instead/.test(costly?.detail ?? ''));
ok('...again in the engine\'s verbatim sentence',
  (costly?.detail ?? '').startsWith(P.propertyProfit(12000, 4000, '2026-27').note));

// The card can never inflate a headline: estSaving is zero in every branch, so the total a
// customer might one day see is unchanged whether or not the card is present.
for (const card of [flagCard, small, thin, costly]) {
  if (card && card.estSaving !== 0) ok('a property allowance card leaked a saving into the total', false);
}
ok('no branch of the card ever puts a number into totalEstimatedSaving',
  O.totalEstimatedSaving([flagCard, small, thin, costly].filter(Boolean)) === 0);

// The year table reaches the April 2027 schedule, so a Budget year does not silence the card.
ok('the card still speaks under the 2027/28 schedule',
  !!find(O.findOptimisations({ ...base, startYear: 2027, ytdPropertyIncome: 850 }), 'property_allowance'));

// House style: the copy the customer reads carries no em dash, en dash, or hyphen as a dash.
for (const card of [flagCard, small, thin, costly]) {
  ok(`house style holds: "${(card?.title ?? '').slice(0, 40)}..."`,
    !H.hasForbiddenDash(card?.title ?? '') && !H.hasForbiddenDash(card?.detail ?? ''));
}

console.log('\n=== the front door: a Landlord chip, wired to the property stream ===\n');
const start = read('app/start/page.tsx');
ok('the trade picker offers Landlord', /'Landlord',/.test(codeOnly(start)));
ok('🔴 PICKING LANDLORD CARRIES THE RENTAL FLAG WITH THE SIGNUP, deduplicated, never removing a tick',
  /trade === 'Landlord' && !streams\.includes\('property'\) \? \[\.\.\.streams, 'property'\] : streams/.test(codeOnly(start)));

console.log('\n=== the signup flag reaches the account: reconcile writes the rental circumstance ===\n');
const db = read('lib/supabase.ts');
ok('the property stream tick becomes the rental circumstance, in his own recorded wording',
  /streams\.includes\('property'\)/.test(codeOnly(db))
  && /saveCircumstance\(\s*userId, 'rental', 'yes',\s*'You told us at signup that you have rental property\.', 'web',\s*\)/.test(db));
ok('accountHasRental exists and reads only his own statements: the circumstance, or confirmed property rows',
  /export async function accountHasRental/.test(db)
  && /income_type=eq\.property&confirmed=eq\.true/.test(db));

console.log('\n=== money in: rent distinguishable at the door, nothing existing reclassified ===\n');
const addPage = read('app/app/money/add/page.tsx');
const route = read('app/api/money/manual/route.ts');
ok('the add screen stays server rendered, no client JavaScript', !/^'use client'/m.test(addPage));
ok('the rent choice is on the form', /name="direction" value="rent"/.test(addPage) && /Rent in, from a property/.test(addPage));
ok('🔴 AND IT IS GATED: drawn only for an account with the rental stream (doc 103 empty test)',
  /\{rental \? \(/.test(codeOnly(addPage)) && /accountHasRental/.test(codeOnly(addPage)));
ok('money out is still the default and plain money in is untouched',
  /name="direction" value="out" defaultChecked/.test(addPage) && /name="direction" value="in"/.test(addPage));
ok('the route accepts exactly three directions', /direction !== 'in' && direction !== 'out' && direction !== 'rent'/.test(codeOnly(route)));
// 🔴 THIS ASSERTION USED TO PIN THE DEFECT, BYTE FOR BYTE. B62, 20 August 2026.
//
// It read: /income_type: direction === 'rent' \? 'property' : undefined/, and it was GREEN for the
// whole time a landlord's typed mortgage interest was being deducted against a trade she did not
// have. The words above it, "AND ONLY RENT DOES", were written as a promise and were being kept.
// The promise was the bug. A guard that asserts an expression character by character does not
// protect a behaviour, it FREEZES a line, and the next person to read a green suite concluded the
// stream was handled.
//
// ⚠️ SO IT IS NOW ABOUT THE SHAPE AND THE BEHAVIOUR LIVES IN ITS OWN SUITE:
// test/b62propertyroute.test.mjs stages this route, posts every category lib/propertylanes.ts names,
// and reads the split back out of the real propertyYtdTotals.
ok('🔴 RENT LANDS IN THE PROPERTY STREAM AND SO DOES A PROPERTY COST, and which categories those'
  + ' are is lib/propertylanes.ts to say',
  /income_type:[^;]*direction === 'rent'/.test(codeOnly(route))
  && /streamFor\(/.test(codeOnly(route))
  && /from '(\.\.\/)+lib\/propertylanes'/.test(codeOnly(route)));
ok('rent is filed under the same literal the WhatsApp rent capture writes',
  /direction === 'rent' \? 'rent'/.test(codeOnly(route)));
ok('plain money in is still income, decided by the server, whatever the form claimed',
  /direction === 'in' \? 'income'/.test(codeOnly(route)));
ok('the confirmation names the stream', /Logged as rent\. It is in your property stream/.test(addPage));

console.log('\n=== the tax hub keeps the signup promise: rent is its own stream, said where he looks ===\n');
const hub = read('app/app/tax/page.tsx');
ok('the sentence exists and is gated on the flag or confirmed rent, never shown to everyone',
  /optimiser\.circumstances\?\.rental === 'yes'/.test(codeOnly(hub))
  && /taxed as its own stream/.test(hub));
ok('with rent money it says where the figure sits and where the working shows',
  /counted in the figure above/.test(hub) && /Ways to save/.test(hub));
ok('with only the flag it stays honest about having no figures yet',
  /once it is logged it is counted here/.test(hub));

console.log('\n=== ways to save stays a renderer: every word still comes from the optimiser ===\n');
const ways = read('app/app/tax/ways-to-save/page.tsx');
ok('the page imports no property engine and computes no comparison of its own',
  !/propertyengine/.test(codeOnly(ways)) && /findOptimisations/.test(ways));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
