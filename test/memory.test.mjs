// The brain. See lib/memory.ts.
//
// Two things these tests exist to protect:
//
//   1. THE KEY MUST SURVIVE FILTHY BANK DESCRIPTORS. If "SCREWFIX 1234 LONDON" and
//      "SCREWFIX DIRECT LTD" do not land on the same key, nothing is ever learned
//      twice and the whole store is worthless.
//
//   2. THE CROWD MUST NEVER OVERRULE THE PERSON, AND MUST NEVER LEARN ANYTHING
//      PRIVATE. A plumber booking CIRCLE K as fuel and a decorator booking it as
//      meals are both right about their own business.

import * as M from '../lib/memory.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

console.log('\nThe brain\n');

// --- the normaliser: the whole thing rests on this ---------------------------
const SCREWFIX = M.normaliseVendor('SCREWFIX');
ok('SCREWFIX 1234 LONDON matches SCREWFIX', M.normaliseVendor('SCREWFIX 1234 LONDON') === SCREWFIX);
ok('SCREWFIX DIRECT LTD matches SCREWFIX', M.normaliseVendor('SCREWFIX DIRECT LTD') === SCREWFIX);
ok('SCREWFIX.COM matches SCREWFIX', M.normaliseVendor('SCREWFIX.COM') === SCREWFIX);
ok('Screwfix matches SCREWFIX (case)', M.normaliseVendor('Screwfix') === SCREWFIX);
ok('CARD PAYMENT TO SCREWFIX matches SCREWFIX', M.normaliseVendor('CARD PAYMENT TO SCREWFIX') === SCREWFIX);

const AMAZON = M.normaliseVendor('AMAZON');
ok("AMAZON INT'L*RT4G9 matches AMAZON", M.normaliseVendor("AMAZON INT'L*RT4G9") === AMAZON);
ok('AMAZON.CO.UK matches AMAZON', M.normaliseVendor('AMAZON.CO.UK') === AMAZON);

const SHELL = M.normaliseVendor('SHELL');
ok('SHELL 4471 matches SHELL', M.normaliseVendor('SHELL 4471') === SHELL);
ok('SHELL SERVICE STN matches SHELL', M.normaliseVendor('SHELL SERVICE STN') === SHELL);

// Two words are kept, so different merchants sharing a first word stay apart.
ok('CITY ELECTRICAL and CITY PLUMBING are DIFFERENT vendors',
  M.normaliseVendor('CITY ELECTRICAL FACTORS') !== M.normaliseVendor('CITY PLUMBING SUPPLIES'));

// THE COLLISION THAT WOULD HAVE POISONED THE BOOKS.
// A one word key made both of these "circle", so a lesson that CIRCLE K is fuel
// would have been applied to a trading refund. Different merchants, different keys.
ok('CIRCLE K and CIRCLE UK TRADING REFUND are DIFFERENT vendors',
  M.normaliseVendor('CIRCLE K') !== M.normaliseVendor('CIRCLE UK TRADING REFUND'));
ok('a stripped town does not split a shop (SCREWFIX LEEDS is SCREWFIX)',
  M.normaliseVendor('SCREWFIX 991 LEEDS') === M.normaliseVendor('SCREWFIX'));

// Symbols that are part of the name survive.
ok('B&Q keeps its ampersand', M.normaliseVendor('B&Q 0451') === M.normaliseVendor('B&Q'));

ok('empty is empty', M.normaliseVendor('') === '');
ok('null is empty', M.normaliseVendor(null) === '');
ok('a string of only noise is empty', M.normaliseVendor('CARD PAYMENT REF 998877') === '');

// --- recall: whose answer wins ------------------------------------------------
const rules = [{ vendor_key: M.normaliseVendor('CIRCLE K'), category: 'fuel', is_personal: null, hits: 4 }];
const patterns = [
  { vendor_key: M.normaliseVendor('CIRCLE K'), category: 'meals', votes: 900 },
  { vendor_key: M.normaliseVendor('SCREWFIX'), category: 'materials', votes: 8412 },
  { vendor_key: M.normaliseVendor('OBSCURE SHOP'), category: 'tools', votes: 1 },
];

const mine = M.recall('CIRCLE K 8823', rules, patterns);
ok('MY rule beats 900 strangers', mine.category === 'fuel');
ok('and it is marked as mine', mine.source === 'user');

const crowd = M.recall('SCREWFIX 1234 LONDON', rules, patterns);
ok('the crowd answers a vendor I have never corrected', crowd.category === 'materials');
ok('and it is marked as the crowd', crowd.source === 'crowd');

const thin = M.recall('OBSCURE SHOP', rules, patterns);
ok('ONE persons opinion is not a pattern (privacy AND accuracy)', thin.category === null);
ok('and we say we know nothing', thin.source === 'none');

const unknown = M.recall('NEVER SEEN BEFORE PLC', rules, patterns);
ok('an unknown vendor returns nothing, so we fall through to AI', unknown.source === 'none');
ok('an empty vendor returns nothing', M.recall('', rules, patterns).source === 'none');

// A personal rule is recalled too.
const personalRules = [{ vendor_key: M.normaliseVendor('CHILD TAX CREDIT'), category: null, is_personal: true, hits: 1 }];
const p = M.recall('CHILD TAX CREDIT', personalRules, []);
ok('we remember what they told us is not business', p.isPersonal === true);
ok('and never have to ask again', p.source === 'user');

// --- learn: what is worth remembering, and what must stay private -------------
const l1 = M.learn({ vendor: 'CITY ELECTRICAL FACTORS', category: 'materials' });
ok('a category correction is a lesson', l1?.category === 'materials');
ok('and it is safe to pool: a merchant sells what it sells', l1?.shareable === true);

const l2 = M.learn({ vendor: 'MR JOHN SMITH', isPersonal: true });
ok('"not business" is a lesson', l2?.isPersonal === true);
ok('but it is NEVER pooled: one man\'s mate is another man\'s customer', l2?.shareable === false);

const l3 = M.learn({ vendor: 'SOMETHING', category: 'other' });
ok('"other" is not a lesson, it is the absence of one', l3 === null);

const l4 = M.learn({ vendor: 'BET365', category: 'other', isPersonal: true });
ok('a personal entry is still learned for the user', l4?.isPersonal === true);
ok('but never taught to the crowd', l4?.shareable === false);

ok('nothing to learn from an empty vendor', M.learn({ vendor: '', category: 'fuel' }) === null);
ok('nothing to learn from no correction', M.learn({ vendor: 'SHELL' }) === null);

// --- the compounding property, stated as a test -------------------------------
// A user who has taught us 3 vendors pays AI on none of them again.
const taught = ['SCREWFIX', 'SHELL', 'CITY ELECTRICAL'].map((v) => ({
  vendor_key: M.normaliseVendor(v), category: 'materials', is_personal: null, hits: 1,
}));
const known = ['SCREWFIX 991 LEEDS', 'SHELL 4471', 'CITY ELECTRICAL FACTORS LTD']
  .map((v) => M.recall(v, taught, []));
ok('every vendor they taught us is recalled with no AI', known.every((k) => k.source === 'user'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
