// R2-F18. "THAT'S THE FLAT UPSTAIRS, NOT THE SHOP" WAS TRANSCRIBED PERFECTLY AND FILED AS TRADE.
// Run with: node test/propertyear.test.mjs   (Node 22.6+, pure type stripping)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Rosa said, into her phone, unprompted:
//
//   "The Okafors' rent came in yesterday, nine hundred and fifty. That's the flat upstairs, not
//    the shop."
//
// Whisper got every word. The stream disambiguation is IN HER WORDS, in the exact form a person
// uses when they know two things could be confused. It became trade income. The pile's rent button
// rescued it one button later, which is the product asking her to correct something she had already
// got right, out loud, before it asked.
//
// 🔴 THE HARD HALF IS SAYING NO. Rosa pays £1,400 a month of SHOP RENT to SO BLOOM PROPERTIES. That
// is a trade cost and one of the largest deductions in her books. An ear that hears "rent" and
// reaches for the property stream would move it out of her trade, which is WORSE than the bug it
// fixes: the money in case was rescued by a button on the next screen, and a misfiled cost is
// silent. So most of this suite is about the sentences that must NOT fire.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'pear-'));
writeFileSync(path.join(stage, 'propertylanes.ts'), readFileSync(path.join(lib, 'propertylanes.ts'), 'utf8'));
const P = await import(pathToFileURL(path.join(stage, 'propertylanes.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };
const hears = (t) => P.spokenStream(t);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. The sentence that started it, and the shapes around it');
// ════════════════════════════════════════════════════════════════════════════════════════

ok("🔴 the exact sentence from the run",
  hears("The Okafors' rent came in yesterday, nine hundred and fifty. That's the flat upstairs, not the shop.") === 'property');
ok('the flat, plainly', hears('nine fifty rent for the flat') === 'property');
ok('my tenant paid', hears('my tenant paid me 950 today') === 'property');
ok('the tenancy', hears('deposit back on the tenancy, 400') === 'property');
ok('buy to let', hears('610 mortgage on the buy to let') === 'property');
ok('the rental', hears('gas safety cert on the rental, 90 quid') === 'property');
ok('i rent out', hears('new boiler for the house i rent out, 1200') === 'property');
ok('upstairs on its own', hears('painted the upstairs between tenants, 200') === 'property');

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('B. 🔴 The refusals, which matter more than the hits');
// ════════════════════════════════════════════════════════════════════════════════════════

// Rosa's actual largest trade cost. Getting this wrong moves a deduction out of her trade silently.
ok('🔴 SHOP RENT is a trade cost, not property', hears('shop rent went out, fourteen hundred') === null);
ok('🔴 rent on the shop', hears('paid the rent on the shop, 1400') === null);
ok('the unit', hears('rent for the unit, 800') === null);
ok('the premises', hears('insurance on the premises, 240') === null);
ok('the yard', hears('rent on the yard, 300') === null);
ok('the lockup', hears('the lockup rent, 150') === null);
ok('a van hire is not a property', hears('van rental for the week, 220') === null);
ok('a tool hire is not a property', hears('hired a breaker, 60 quid') === null);

// The word "rent" alone must never be enough. This is the whole guard.
ok('🔴 the word rent on its own says nothing', hears('rent, 950') === null);
ok('nor does a payment from a person', hears('950 in from the Okafors') === null);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('C. Negation: "not the shop" is a PROPERTY sentence');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('🔴 the flat, not the shop', hears("that's the flat, not the shop") === 'property');
ok('the flat, nothing to do with the shop', hears('rent for the flat, nothing to do with the shop') === 'property');
ok('my tenant, not the business', hears('my tenant paid, not the business') === 'property');
// But a genuine trade marker still refuses even beside a property one, because a sentence naming
// both without negating one is ambiguous and ambiguity is not a licence to move money.
ok('both named and neither negated: refuse', hears('rent for the flat and the shop, 2350') === null);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. Silence is the default, and it is most messages');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('an ordinary expense says nothing', hears('forty quid of diesel at the BP') === null);
ok('an ordinary income says nothing', hears('660 in from a funeral tribute') === null);
ok('empty says nothing', hears('') === null);
ok('null says nothing', hears(null) === null);
ok('undefined says nothing', hears(undefined) === null);
ok('gibberish says nothing', hears('asdkjh askjdh') === null);
// 🔴 A MARKER MUST MATCH AS A WHOLE PHRASE, NOT AS A SUBSTRING. The first draft of this suite used
// "flatbed delivery charge", which does not contain "the flat" at all, so it passed whether the
// matcher was bounded or not and guarded nothing. The sabotage pass caught that. These inputs
// contain a marker as a genuine substring and must still be refused.
ok('flatbed is not a flat', hears('flatbed delivery charge 45') === null);
ok('🔴 "the flatbed" contains "the flat" and is still not a property', hears('the flatbed broke, 45 to fix') === null);
ok('🔴 "the property developer" is a payee, not his rental', hears('paid the property developers 300') === null);
ok('🔴 "the property management people" is a payee too', hears('paid the property management people 120') === null);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('E. The wiring: the category still wins, and the ear only proposes');
// ════════════════════════════════════════════════════════════════════════════════════════

const voiceSrc = readFileSync(path.join(lib, 'voiceflow.ts'), 'utf8');
ok('the voice walk asks the ear', /const heard = spokenStream\(clean\)/.test(voiceSrc));
// ⚠️ THE ASSIGNMENT, not the identifier.
ok('🔴 a chosen category still wins where it has an opinion',
  /streamFor\(parsed\.category\) === 'property' \? 'property' : heard \?\? 'trade'/.test(voiceSrc));
ok('and property is written as the stream, not as a category',
  /income_type: 'property' as const/.test(voiceSrc));
ok('🔴 the row still lands UNCONFIRMED, so the ear never files anything',
  /confirmed: false,/.test(voiceSrc));
ok('and it asks the one owner rather than matching words itself',
  /from '\.\/propertylanes'/.test(voiceSrc));

// Trade rows must not gain the field at all, so nothing an existing customer has moves.
const insertBlock = voiceSrc.slice(voiceSrc.indexOf('await insertTransaction({'), voiceSrc.indexOf('await sendText(fromPhone, confirmationLine'));
ok('🔴 a trade row is written exactly as before, with no stream at all',
  /\.\.\.\(stream === 'property' \? \{ income_type: 'property' as const \} : \{\}\)/.test(insertBlock));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
