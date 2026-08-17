// WHO HE IS, AND WHETHER HE CAN EVER CHANGE IT. B1, THE EMPTY ACCOUNT WALK, 17 AUGUST 2026.
// Run with: node test/identityprofile.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Tom Barrow signed up cold on 17 August as a sole trader electrician, tapped Continue on the two
// optional steps the way a man on a ladder does, and made his first invoice. It went to his
// customer reading FROM his name with nothing under it, on the same document that carried his
// customer's address in full, because THAT field is required and cites GOV.UK for it. /start step 5
// had told him: "Optional. Tap Continue to skip and add it when you send your first invoice."
//
// Underneath: reconcileSignupToUser was the ONLY writer of users.name, users.business_name and
// users.address in the whole repo, and it runs once, at first sign in. users.trade_type, the column
// holding the trade WORD, had no writer anywhere in either repo, so the answer to step 3 of 6 never
// reached the account at all, and /app/you/testimonial told him "We do not hold a trade for you.
// Add one under Your details" when no such control existed.
//
// 🔴 IT IS R2-F26 WITH A DIFFERENT COLUMN, AND F26'S FIX IS TWENTY LINES ABOVE THE GAP.
// test/personname.test.mjs holds that one. This suite holds the three beside it, and the rule
// underneath all four: EVERY ANSWER /start ASKS FOR MUST REACH THE ACCOUNT, AND EVERY FACT ON THE
// ACCOUNT MUST HAVE A DOOR HE CAN REACH IT THROUGH.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => { try { return readFileSync(path.join(root, rel), 'utf8'); } catch { return ''; } };
// The safe form. The naive //[^\n]* truncates every https:// URL and blinded 34 suites for months.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const supa = read('lib/supabase.ts');
const route = read('app/api/you/details/route.ts');
const gate = read('lib/gate.ts');
const settings = read('app/app/you/settings/page.tsx');
const invoiceNew = read('app/app/invoices/new/page.tsx');
const testimonial = read('app/app/you/testimonial/page.tsx');
const youPage = read('app/app/you/page.tsx');
const start = read('app/start/page.tsx');
const categories = read('lib/categories.ts');

// Sliced to the function, never open ended to the end of the file: a slice that runs on catches an
// unrelated line three functions away, which is exactly how a Run 5 guard went green on a deletion.
const sliceFn = (src, name) => {
  const a = src.indexOf(`export async function ${name}`);
  if (a < 0) return '';
  const b = src.indexOf('\nexport ', a + 40);
  return b < 0 ? src.slice(a) : src.slice(a, b);
};
const reconcile = sliceFn(supa, 'reconcileSignupToUser');
const writer = sliceFn(supa, 'saveIdentityDetails');
const cardReader = sliceFn(supa, 'readIdentityCard');

console.log('\n=== A. the trade is asked for, and it now survives the journey onto the account ===\n');
ok('/start still asks what he does', /What do you do\?/.test(start));
ok('createSignup stores the trade WORD on the signup row',
  /if \(signup\.trade\) record\.trade = signup\.trade;/.test(supa));
ok('the reconcile SELECT names the column, or it arrives undefined however good the code is',
  /select=trade_type,trade,name,person_name,address/.test(reconcile));
ok('🔴 and the WORD is written onto the account, which nothing in either repo did before today',
  /patch\.trade_type\s*=\s*word/.test(codeOnly(reconcile)));
ok('🔴 it is taken from the trade word and NOT from trade_type, which on the signups row is the STRUCTURE',
  /const word = String\(s\.trade\)/.test(codeOnly(reconcile)));
ok('it never overwrites a trade he has since set himself',
  /if \(s\.trade && !patch\.trade_type\)/.test(codeOnly(reconcile)));
ok('it rides the existing profile patch rather than adding a request',
  reconcile.indexOf('patch.trade_type = word') > 0
  && reconcile.indexOf('patch.trade_type = word') < reconcile.indexOf('if (Object.keys(patch).length > 0)'));

console.log('\n=== B. there is a writer for his own details, and it can tell a cleared box from an undrawn one ===\n');
ok('lib/supabase.ts exports saveIdentityDetails', writer.length > 0);
ok('it PATCHes the users row', /rest\/v1\/users\?id=eq\./.test(writer) && /method: 'PATCH'/.test(writer));
ok('🔴 an ABSENT field is left alone, so a form that does not draw a box can never clear it',
  /if \(given === undefined\) continue;/.test(codeOnly(writer)));
ok('🔴 an EMPTY field is written as null, so he can take his address off his own invoices',
  /trimmed === '' \? null : trimmed/.test(codeOnly(writer)));
ok('it covers all four facts and nothing else',
  /name: 'name'/.test(writer.length ? supa : '') && /businessName: 'business_name'/.test(supa)
  && /address: 'address'/.test(supa) && /trade: 'trade_type'/.test(supa));
ok('lengths are clamped at the writer as well as the route, the createSignup rule',
  /\.slice\(0, IDENTITY_MAX\[key\]\)/.test(codeOnly(writer)));
ok('🔴 an empty patch issues NO request: a PATCH with an empty body matches every row for the filter and reports success',
  /if \(Object\.keys\(patch\)\.length === 0\) return true;/.test(codeOnly(writer)));

console.log('\n=== C. the door he reaches it through ===\n');
ok('the route exists', route.length > 0);
ok('it is behind his session', /sessionUser\(req\)/.test(codeOnly(route)));
ok('it is rate limited like every other write of his own facts', /userBurst\('you-details'/.test(codeOnly(route)));
for (const field of ['name', 'business_name', 'trade', 'address']) {
  ok(`🔴 ${field} is read only when the form actually posted it, which is the undrawn box rule`,
    new RegExp(`form\\.has\\('${field}'\\)`).test(codeOnly(route)));
}
ok('a form with none of them is refused rather than written as four nulls',
  /if \(Object\.keys\(details\)\.length === 0\) return back\(req, 'unavailable'\);/.test(codeOnly(route)));
ok('303, so a refresh cannot write it twice', /, 303\)/.test(route));
ok('a textarea address is stored one line, comma separated, because the invoice renderer splits on commas',
  /split\(\/\[\\r\\n\]\+\//.test(route) && /join\(', '\)/.test(route));

console.log('\n=== D. the gate lets him at his own facts ===\n');
const gateRow = /\{ route: 'app\/api\/you\/details', rule: '([a-z]+)'/.exec(gate);
ok('lib/gate.ts has a row for the route, so it cannot ship ungoverned', gateRow !== null);
ok("🔴 and the rule is 'always': his address is a field GOV.UK asks every invoice to carry, so gating it gates a legal requirement",
  gateRow !== null && gateRow[1] === 'always');

console.log('\n=== E. Settings draws it, prefilled, or a save would blank what it does not show ===\n');
const settingsCode = codeOnly(settings);
ok('the section is called Your details, which is the name the testimonial page has pointed at all along',
  /Your details<\/h2>/.test(settingsCode));
ok('it posts to the route', /action="\/api\/you\/details"/.test(settingsCode));
for (const [field, source] of [['name', 'card?.name'], ['trade', 'card?.trade'], ['address', 'card?.address']]) {
  ok(`the ${field} box is drawn`, new RegExp(`name="${field}"`).test(settingsCode));
  ok(`🔴 and prefilled from his row, or saving the form would wipe it`,
    new RegExp(`defaultValue=\\{${source.replace('?', '\\?').replace('.', '\\.')}`).test(settingsCode));
}
ok('the business name box is drawn only when he has one, not as an empty invitation to invent one',
  /businessShaped \? \(/.test(settingsCode) && /name="business_name"/.test(settingsCode));
ok('and a trading name counts, not only a company or a partnership',
  /Boolean\(\(card\?\.businessName \?\? ''\)\.trim\(\)\)/.test(settingsCode));
ok('🔴 readIdentityCard selects the address, or the box above is always empty however right the form is',
  /select=name,business_name,trade_type,address,phone_number/.test(cardReader));
ok('and hands it back', /address: r\.address \?\? null/.test(cardReader));
ok('the saved sentence is its own, not the message switches one',
  /case 'details':/.test(read('app/app/you/identity.ts')));

console.log('\n=== F. the invoice screen says it when it is missing, and only then ===\n');
const invCode = codeOnly(invoiceNew);
ok('the invoice screen reads his identity', /readIdentityCard\(user\.id\)/.test(invCode));
ok('🔴 a FAILED read says nothing: null means we could not look, not that he has no address',
  /identityCard !== null && !\(identityCard\.address \?\? ''\)\.trim\(\)/.test(invCode));
ok('the line is drawn only when it is missing, which is doc 103 empty test',
  /\{ownAddressMissing \? \(/.test(invCode));
ok('it names GOV.UK, the same authority the customer address field cites three inches below',
  /GOV\.UK lists the supplier/.test(invCode));
ok('it gives him the door', /href="\/app\/you\/settings"/.test(invCode));
ok('🔴 and it does NOT block him: the form is still rendered, because he may be billing a job right now',
  invCode.indexOf('ownAddressMissing ?') < invCode.indexOf('<form action="/api/invoices"'));

console.log('\n=== G. no sentence points at a door that does not exist ===\n');
ok('the testimonial name line names Settings', /Add one under Your details in Settings/.test(testimonial));
ok('the testimonial trade line names Settings',
  (testimonial.match(/Add one under Your details in Settings/g) || []).length >= 2);
ok('🔴 /app/you no longer says the rest comes from pages below when three of the four were on no page at all',
  /your name, your\n              trade and your business address in\{' '\}/.test(youPage)
  && /href="\/app\/you\/settings"/.test(youPage));

console.log('\n=== H. and /start no longer claims something the categoriser does not do ===\n');
const startCode = codeOnly(start);
ok('🔴 step 3 does not claim the trade sorts his expenses: lib/categories.ts is a merchant NAME list and takes no trade',
  !/sort your expenses into the right categories/.test(startCode));
ok('it says what the answer actually does', /Landlord is the one that changes things/.test(startCode));
ok('🔴 RATCHET: lib/categories.ts still takes no trade. When this goes red the categoriser has learned one, and step 3 has earned the old sentence back.',
  categories.length > 0 && !/function[^\n]*\btrade\b[^\n]*\)/.test(codeOnly(categories)));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
