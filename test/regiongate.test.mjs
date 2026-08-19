// B33. THE REGION GATE AT ONBOARDING. Not that it renders. That it gates, and that it lies about
// nothing on either side of itself.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE PARAGRAPH.
//
// Jag, 18 August 2026: "there is no point doing Scotland yet, we are focusing on it too much and
// it is quite irrelevant for us." So the signup asks a man to confirm he lives inside the region
// Lekhio actually works tax out for, before it asks him anything else, and a man who cannot
// confirm it is offered a list rather than fifteen minutes of interview ending in a number worked
// out at rates that are not his.
//
// Three things can go wrong with that and all three are silent:
//
//   1. THE GATE STOPS GATING. A tick drawn by JavaScript on his machine is a courtesy, not a
//      control, and a restored draft or a hand edited store walks straight past one. So the tick
//      is asked for again by the route that mints the account, and both halves are held here.
//   2. THE BLOCKED SCREEN STARTS PROMISING. The obvious wording is "more regions coming soon,
//      leave your email and we will tell you when". Every part of that is a promise we cannot
//      keep: "soon" is a date, "coming" is a commitment, and naming the country he is probably in
//      tells him we are working on his. He hands over an address BECAUSE of that sentence, which
//      makes the sentence the consideration for the exchange.
//   3. IT SPREADS. It is meant to gate NEW onboarding and nothing else. An existing customer must
//      never meet it, the persona fleet must never meet it, and a returning customer signing in
//      must never have it in his way. All three are asserted, by deriving which files can even
//      see the module rather than by trusting that nobody imported it.
//
// AND THE ONE STRUCTURAL RULE UNDER ALL OF IT: THE REGION NAME IS TYPED EXACTLY ONCE, IN
// lib/region.ts, AND EVERY WORD OF THE GATE IS DERIVED FROM IT. Written out five times it is five
// things to remember on the day the answer changes, and this repo's whole history is figures and
// promises typed twice becoming two figures and two promises.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  REGION, REGION_AND, REGION_TAG,
  regionConfirmLabel, regionConfirmWhy, regionElsewhereLink,
  regionBlockedHeading, regionBlockedBody, regionWaitlistAsk, regionWaitlistButton,
  regionWaitlistDone, regionBackLine,
} from '../lib/region.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// Comments stripped before any "this sentence is gone" scan. The safe form, never the naive
// //[^\n]* which eats every https:// URL in the file.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// lstat and skip symlinks: there is a dangling one at app/.node/bin and a suite that dies on it is
// a suite somebody deletes rather than fixes.
function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(root, f);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}
function eq(name, got, want) {
  ok(`${name} (got ${JSON.stringify(got)})`, got === want);
}

const regionSrc = read('lib/region.ts');
const startSrc = read('app/start/page.tsx');
const draftSrc = read('app/start/draft.ts');
const onboardSrc = read('app/api/onboard/route.ts');
const waitlistSrc = read('app/api/waitlist/route.ts');
const supaSrc = read('lib/supabase.ts');
const migration = read('supabase/APPLY_2026-08-18_waitlist_region.sql');

// Every sentence the gate says, in one place, so a scan below cannot quietly miss one by being
// written before it existed. Derived from the module's own exports rather than retyped.
const TICK_COPY = [regionConfirmLabel(), regionConfirmWhy(), regionElsewhereLink()];
const BLOCKED_COPY = [
  regionBlockedHeading(), regionBlockedBody(), regionWaitlistAsk(),
  regionWaitlistButton(), regionWaitlistDone(), regionBackLine(),
];
const ALL_COPY = [...TICK_COPY, ...BLOCKED_COPY];

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. ONE CONSTANT, AND EVERY WORD DERIVED FROM IT');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('the region is named at all (not vacuous)', typeof REGION === 'string' && REGION.length > 3);
ok('every sentence of the gate is non empty', ALL_COPY.every((c) => typeof c === 'string' && c.length > 2));

// 🔴 THE STRUCTURAL RULE. The region name appears ONCE in the file that owns it, which is the
// declaration, and the count is DERIVED rather than eyeballed. A second literal is the whole
// failure mode: change REGION and one sentence in five keeps the old answer.
// ⚠️ COMMENTS STRIPPED FIRST, AND THIS SUITE'S FIRST DRAFT DID NOT, WHICH IS THE SEVENTH TIME
//    THIS REPO HAS BEEN CAUGHT BY IT. The file's own argument for choosing this region NAMES the
//    region, in prose, on purpose: an argument that will not say what it is arguing for is not an
//    argument. A comment is documentation, not a second source of truth, and a guard that cannot
//    tell prose from code would have forced the reasoning out of the file to keep itself green.
{
  const code = codeOnly(regionSrc);
  ok('the stripper stripped, and did not eat the code (not vacuous)',
    code.includes(`= '${REGION}'`) && code.length < regionSrc.length);
  const hits = code.split(REGION).length - 1;
  eq('🔴 the region name is typed exactly once in the CODE of lib/region.ts, in the declaration', hits, 1);
}

// ...and nowhere else in the product at all. Derived by walking, never by a typed list of files,
// because a typed list of files is the thing that rots.
{
  const files = [...walk(path.join(root, 'app'), ['.ts', '.tsx']), ...walk(path.join(root, 'lib'), ['.ts'])]
    .filter((f) => rel(f) !== 'lib/region.ts');
  ok('the sweep actually walked the tree (not vacuous)', files.length > 100);
  const typed = files.filter((f) => readFileSync(f, 'utf8').includes(REGION));
  eq('🔴 no other file in app/ or lib/ types the region name', typed.map(rel).join(', '), '');
}

// The "and" form is derived from the "or" form, not a second constant. A region with no " or " in
// it, such as "the UK", must pass straight through unchanged rather than break.
ok('the rates wording is the same list read as a set', REGION_AND.split(' ').length === REGION.split(' ').length);
// 🔴 AND IT IS NEVER TYPED OUT EITHER, WHICH THE LENGTH CHECK ABOVE CANNOT SEE. A hole found by
//    this packet's own sabotage pass: writing `export const REGION_AND = 'England, Wales and
//    Northern Ireland'` satisfies every other assertion in this section and quietly means a one
//    word change to REGION now changes half the gate and leaves the other half saying the old
//    answer. The rates form is a DERIVATION or it is a second constant, and there is no third
//    thing it can be.
{
  const hits = codeOnly(regionSrc).split(REGION_AND).length - 1;
  eq('🔴 the rates form of the region name is never typed in code, only derived', hits, 0);
}
ok('...and it is derived, so a region with no "or" survives it',
  REGION.includes(' or ') ? REGION_AND.includes(' and ') && !REGION_AND.includes(' or ') : REGION_AND === REGION);

// The tag stored beside a waitlist address. A slug, and every word of it comes out of REGION, so
// changing the constant changes what new rows are tagged with.
ok('the tag is a plain slug', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(REGION_TAG));
ok('🔴 and every word of the tag comes out of the region name',
  REGION_TAG.split('-').every((w) => REGION.toLowerCase().includes(w)));

// Each sentence names the region rather than describing it vaguely, EXCEPT the two that have no
// business naming it: the button and the thank you. Asserted as a shape so a reworded sentence
// that still names the region is fine and a reworded one that stops naming it is not.
for (const [what, text] of [
  ['the tick', regionConfirmLabel()],
  ['the reason beside the tick', regionConfirmWhy()],
  ['the way out', regionElsewhereLink()],
  ['the blocked body', regionBlockedBody()],
  ['the way back', regionBackLine()],
]) {
  ok(`${what} names the region, derived`, text.includes(REGION) || text.includes(REGION_AND));
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. THE BLOCKED SCREEN PROMISES NOTHING, AND OUR OWN WORDS ARE SUBTRACTED FIRST');
// ════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 SUBTRACT WHAT WE ARE ENTITLED TO SAY BEFORE SCANNING FOR WHAT WE ARE NOT. "Northern Ireland"
// is inside the region name, so a blunt scan for a named country fails on the region itself. Same
// discipline as promptclaims: assemble, subtract the parts you put there on purpose, then scan.

const stripped = BLOCKED_COPY
  .join(' ')
  .split(REGION).join(' ')
  .split(REGION_AND).join(' ');

ok('the scan has something to read (not vacuous)', stripped.trim().length > 60);

// A timeline is a promise about WHEN. We do not have one.
const TIMELINE = /\b(soon|shortly|coming|any day|in the (coming|next)|weeks|months|next year|by the end|q[1-4]\b|later this|roadmap)\b/i;
ok('🔴 no timeline anywhere on the blocked screen', !TIMELINE.test(stripped));

// A named country is a guess printed back at him as a fact. We did not ask where he is.
const COUNTRY = /\b(scotland|scottish|ireland|irish|wales|welsh|england|english|isle of man|jersey|guernsey|channel islands)\b/i;
ok('🔴 no country is named beyond the region itself', !COUNTRY.test(stripped));

// A claim about what WILL be supported is the same promise wearing a different tense.
// ⚠️ THE SUFFIXES ARE THE WHOLE GUARD. The first draft read `(support|add|...)\b` and could not
//    see "will be supportED", which is the exact tense this sentence would be written in. Its own
//    control caught it, which is what a control is for.
const WILL_SUPPORT = /\b(will (be )?(support|add|cover|include|arrive|launch)(s|ed|ing)?|are being added|is being added|we are (working|building)|in development|on the way)\b/i;
ok('🔴 no claim about what will be supported', !WILL_SUPPORT.test(stripped));

// ⚠️ VACUITY FIRST, EVERY TIME. Three negatives in a row pass on an empty string, and this repo
// has been bitten by that. Each scanner is proved to bite on a planted sentence.
ok('...and the timeline scanner would bite (control)', TIMELINE.test('more regions are coming soon'));
ok('...and the country scanner would bite (control)', COUNTRY.test('we do not do Scotland yet'));
ok('...and the will support scanner would bite (control)', WILL_SUPPORT.test('your area will be supported'));

// The thank you is a promise too, and it is the one made AFTER he has handed the address over,
// which is the point at which a promise costs him something. It must be conditional.
ok('🔴 the thank you is conditional, never a commitment', /\bunless\b|\bif\b/i.test(regionWaitlistDone()));
ok('the ask says the address has one use', /anything else|only|nothing else/i.test(regionWaitlistAsk()));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. BOTH STATES OF THE COPY ARE ON THE SCREEN, AND NEITHER IS TYPED');
// ════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THE CALL IS PINNED, NOT THE BRACES AROUND IT. `{fn()}` was the first draft and it failed on
//    the one control whose label is a ternary, `{busy ? 'Saving' : regionWaitlistButton()}`, which
//    is a perfectly ordinary shape. A guard that dictates the JSX around a call is guarding the
//    JSX. Comments stripped, so a mention in prose cannot satisfy any of these.
const startCode = codeOnly(startSrc);
ok('the screen source was stripped and survived (not vacuous)',
  startCode.includes('regionBlockedHeading') && startCode.length < startSrc.length);
for (const fn of ['regionConfirmLabel', 'regionConfirmWhy', 'regionElsewhereLink']) {
  ok(`the tick state calls ${fn}()`, startCode.includes(`${fn}()`));
}
for (const fn of ['regionBlockedHeading', 'regionBlockedBody', 'regionWaitlistAsk',
  'regionWaitlistButton', 'regionWaitlistDone', 'regionBackLine']) {
  ok(`the blocked state calls ${fn}()`, startCode.includes(`${fn}()`));
}

// The two states are alternatives, not two things that can be on screen together, and the footer
// is not under the blocked one: a live Continue under a screen that has just said no is a button
// whose only function is to disappoint.
//
// 🔴 THE NAME IS DERIVED FROM THE WORK AND THEN USED, NEVER WRITTEN TWICE. B30 wrote two guards
//    that pinned an identifier rather than the work, both went RED under a control that renamed
//    the local CONSISTENTLY, and nothing in the gate could have found either. A guard anchored on
//    a variable NAME is guarding the name. So the branch that draws the blocked heading is found
//    first, and whatever it happens to be called is read out of it.
// ⚠️ THE LAST BRANCH BEFORE THE HEADING, NOT THE FIRST ONE THAT FITS INSIDE A WINDOW. The first
//    draft searched forward from any `) : X ? (` within four thousand characters and matched
//    `done`, two arms up the same ternary chain, which is a window sliding onto a neighbour: the
//    identical mistake this file's f23 sibling was repaired for this morning. Read up to the work,
//    then take the branch nearest it.
{
  const upto = startCode.slice(0, startCode.indexOf('regionBlockedHeading()'));
  const arms = [...upto.matchAll(/\)\s*:\s*(\w+)\s*\?\s*\(/g)];
  const name = arms.length ? arms[arms.length - 1][1] : null;
  ok('the blocked screen is an alternative to the steps, not an addition', !!name);
  // Both chrome blocks, and the count is DERIVED: the footer and the progress bar are two
  // different components that must both stand down, and asserting one of them was how the bar
  // survived the first push.
  const guarded = name
    ? (startCode.split(`!done && !billingResult && !${name} && (`).length - 1)
    : 0;
  ok('🔴 and the Continue footer is not drawn under it', guarded >= 1);
  // 🔴 NOR THE PROGRESS BAR, WHICH IS THE ONE THAT GOT THROUGH. Found by reading the whole screen
  //    on production: the blocked screen wore "STEP 1 OF 6" and "10 to 15 minutes in total" over a
  //    heading saying there is no setup for him. He is not on step one of anything, and it is not
  //    going to take him fifteen minutes. Two false promises, in the chrome rather than in the
  //    copy, which is exactly where no assertion in this repo was looking.
  eq('🔴 both the bar and the footer stand down on the blocked screen', guarded, 2);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. THE TICK IS NOT OPTIONAL, AND IT IS NOT ONLY A TICK');
// ════════════════════════════════════════════════════════════════════════════════════════

// The screen half. 🔴 SAME RULE: the state behind the tick is read off the TICK, which is the
// work, and then used. Renaming it consistently changes nothing a customer can see and must not
// turn any of these red.
const tickMatch = startCode.match(/id="signup-region"[\s\S]{0,300}?checked=\{(\w+)\}/);
const tick = tickMatch ? tickMatch[1] : null;
ok('the tick on the screen is bound to a state at all (not vacuous)', !!tick);
ok('the first step cannot be left without the confirmation',
  !!tick && new RegExp(`if \\(step === 1\\) return ${tick} &&`).test(startCode));
ok('...and the memo recomputes when he ticks it, or the button stays dead',
  !!tick && new RegExp(`\\}, \\[step, ${tick},`).test(startCode));

// The draft half. A restored tab must not resume past the only screen that asks.
ok('the draft carries the confirmation', /\bregion: boolean;/.test(draftSrc));
// 🔴 AND THE SCREEN WRITES THE LIVE TICK INTO IT, NOT A CONSTANT. A hole found by this packet's
//    own sabotage pass: `writeDraft({ ..., region: false, ... })` keeps every other guard green,
//    keeps the type honest, and quietly clears his answer on every keystroke, so a refresh sends a
//    man who HAS confirmed back to the start for ever. Derived from the tick's own name.
{
  // ⚠️ SLICED TO THE CALL'S OWN END, NEVER TO A MAGIC NUMBER OF CHARACTERS. The first draft took
  //    300 characters and the window ran straight off the end of the object into the effect's
  //    DEPENDENCY ARRAY, which still lists the tick, so the sabotage that replaced the saved value
  //    with a constant stayed green on a match belonging to a different line. Found by the pass.
  //    Third time this exact shape has been repaired in this repo today.
  const wStart = startCode.indexOf('writeDraft({');
  const call = startCode.slice(wStart, startCode.indexOf('});', wStart));
  ok('the draft write was found (not vacuous)', call.includes('writeDraft({') && call.includes('streams'));
  ok('🔴 and it saves the tick he actually pressed, never a constant',
    !!tick && (new RegExp(`[,{]\\s*${tick}\\s*,`).test(call) || new RegExp(`region:\\s*${tick}\\s*,`).test(call)));
}
ok('🔴 a draft without it restores to step 1, whatever step it claims',
  /step: d\.region === true &&/.test(draftSrc));
ok('...and it is only ever restored from a real true', /region: d\.region === true,/.test(draftSrc));
// The setter is derived from the declaration too, for the same reason.
{
  const decl = tick ? startCode.match(new RegExp(`const \\[${tick}, (set\\w+)\\] = useState\\(false\\)`)) : null;
  const setter = decl ? decl[1] : null;
  ok('the tick state declares a setter (not vacuous)', !!setter);
  ok('start over clears it, so a shared machine cannot inherit an answer',
    !!setter && startCode.includes(`${setter}(false);`));
}

// The server half, which is the one that is actually a gate.
// ⚠️ `regionConfirmed` IS PINNED BY NAME ON PURPOSE AND IT IS NOT THE TRAP ABOVE. It is the WIRE
//    FIELD between this screen and app/api/onboard, so it is a contract between two files rather
//    than a local somebody may tidy: renaming it on one side and not the other is precisely the
//    defect, and a guard that shrugged at that would be guarding nothing.
ok('the signup posts the confirmation',
  !!tick && new RegExp(`regionConfirmed: ${tick},`).test(startCode));
ok('🔴 and the door refuses without it',
  /if \(b\.regionConfirmed !== true\)/.test(codeOnly(onboardSrc)));
{
  const code = codeOnly(onboardSrc);
  const refusal = code.indexOf('b.regionConfirmed !== true');
  const create = code.indexOf('createSignup(');
  ok('the refusal is proved present and so is the thing it guards (not vacuous)',
    refusal > -1 && create > -1);
  ok('🔴 and it refuses BEFORE an account is created, not after', refusal < create);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n5. THE WAITLIST CAPTURE, END TO END');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('the blocked screen posts to the waitlist', /fetch\('\/api\/waitlist'/.test(startSrc));
ok('🔴 and it tags the row with the region, derived from the constant',
  /region: REGION_TAG/.test(startSrc));
ok('it sends an address and nothing else besides the tag',
  /body: JSON\.stringify\(\{ email: regionEmail\.trim\(\), region: REGION_TAG \}\)/.test(startSrc));

{
  const code = codeOnly(waitlistSrc);
  ok('🔴 the route takes an address where it used to demand a number',
    /if \(!phone && !email\)/.test(code) && !/const phone = cleanPhone\(rawPhone\);\s*\n\s*if \(!phone\)/.test(code));
  ok('...and it still refuses a row nobody can be reached on', /if \(!phone && !email\)/.test(code));
  // 🔴 AND THE OTHER CALLER CANNOT REACH THE RELAXED BRANCH, WHICH IS THE ARGUMENT THE ROUTE'S OWN
  //    COMMENT MAKES AND WHICH WAS UNTIL NOW ONLY AN ARGUMENT. /early-access is phone first: it
  //    refuses below ten digits before it posts, and it sends `phone` on every submit. So loosening
  //    the server rule to "one of the two" cannot silently start accepting phoneless rows from the
  //    marketing form. If somebody removes that check, this goes red and the claim comes with it.
  const early = codeOnly(read('app/early-access/page.tsx'));
  ok('/early-access still guards its own number before it posts',
    /cleaned\.length < 10/.test(early) && /setError\('Enter a valid UK mobile number\.'\)/.test(early));
  ok('...and still sends it on every submit', /phone: cleaned/.test(early));
  ok('the region is validated as a slug, never taken as typed',
    /\/\^\[a-z0-9-\]\{1,60\}\$\//.test(code));
  ok('the region travels to the insert', /insertWaitlistSignup\(\{ phone, email, region \}\)/.test(code));
  // 🔴 THE PROMISE HALF. The waitlist welcome email says "one of the first we let in" and "your
  // first 7 days are free". Neither may be said to a man we have just turned away.
  ok('🔴 no welcome email is sent on the region path',
    /if \(email && !region && outcome === 'inserted'\)/.test(code));
}

{
  const start = supaSrc.indexOf('export async function insertWaitlistSignup');
  const body = supaSrc.slice(start, supaSrc.indexOf('// --- Marketing leads'));
  ok('the insert was found (not vacuous)', start > -1 && body.length > 200);
  ok('the region is written when there is one', /if \(signup\.region\) record\.region = signup\.region;/.test(body));
  ok('a phone is no longer assumed', /if \(signup\.phone\) record\.phone =/.test(body));
  // 🔴 THE ADDRESS SURVIVES THE MIGRATION NOT HAVING BEEN RUN. Dropping a turned away man's
  // address over a bookkeeping column is the worst outcome available on this screen.
  ok('🔴 a missing region column drops the tag, never the address',
    /if \(res\.status === 400 && record\.region\)/.test(body));
  ok('...and it says so, without ever naming him',
    /region column missing/.test(body) && !/signup\.email/.test(body.split('console.warn')[1] ?? ''));
}

// The migration. Additive, and it invents nothing about anybody already on the list.
ok('the migration adds the column and does not alter one',
  /add column if not exists region text/.test(migration));
ok('🔴 and it backfills nothing, because a null means nobody turned this person away',
  !/update public\.waitlist[\s\S]*set region/i.test(migration));

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('\n6. IT GATES NEW ONBOARDING AND NOTHING ELSE. ALL THREE, ASSERTED');
// ════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 DERIVED BY WALKING, NOT BY A TYPED LIST. "Nobody imported it anywhere else" is a claim about
// a whole tree, and the only honest way to make it is to read the whole tree.

{
  const files = [...walk(path.join(root, 'app'), ['.ts', '.tsx']), ...walk(path.join(root, 'lib'), ['.ts'])]
    .filter((f) => rel(f) !== 'lib/region.ts');
  // Multiline imports are the normal shape here, so the match cannot be line anchored.
  const IMPORTS = /import[\s\S]{0,400}?from\s+'(?:\.\.\/)+lib\/region'|from\s+'\.\/region'/;
  const importers = files.filter((f) => IMPORTS.test(readFileSync(f, 'utf8'))).map(rel).sort();
  ok('the import sweep actually walked the tree (not vacuous)', files.length > 100);
  eq('🔴 exactly one screen in the product can see the gate, and it is the signup',
    importers.join(', '), 'app/start/page.tsx');
}

// 1. AN EXISTING SIGNED IN ACCOUNT NEVER MEETS IT. The setup interview behind sign in is where a
//    customer part way through his onboarding lives, and it gains nothing at all.
{
  const setup = read('app/app/setup/page.tsx');
  ok('🔴 the signed in setup interview is untouched by the gate',
    !setup.includes(REGION) && !/region(Confirm|Blocked|Waitlist)/.test(setup));
}

// 2. THE PERSONA FLEET IS UNTOUCHED. They are signed in accounts, so the assertion above covers
//    the screens; this covers their ROWS. Nothing in this packet writes to an existing one.
//
// ⚠️ THE FIRST DRAFT OF THIS ASSERTION WAS VACUOUS AND I FOUND IT BY READING IT BACK. It ran its
//    regex against `codeOnly(supaSrc).slice(0, 0) + ''`, which is the EMPTY STRING, so the first
//    half passed whatever lib/supabase.ts said. A negative guard reading an empty string passes
//    everything, and this repo has been bitten by that three times before this one. Both halves
//    now read a real string and both are proved non empty first.
{
  const code = codeOnly(supaSrc);
  ok('the file under the claim was read (not vacuous)', code.includes('record.region'));
  // The tag is written by exactly one function, and that function posts to exactly one table.
  const writes = (code.match(/record\.region/g) ?? []).length;
  ok('🔴 the region tag is written in one place only', writes >= 1 && writes <= 4);
  const start = code.indexOf('export async function insertWaitlistSignup');
  const body = code.slice(start, start + 3000);
  ok('🔴 and that place posts to the waitlist table and no other',
    body.includes('/rest/v1/waitlist') && !/rest\/v1\/users/.test(body));
  ok('🔴 the migration touches the waitlist and nothing a persona owns',
    /public\.waitlist/.test(migration) && !/public\.users|public\.signups|public\.transactions/.test(migration));
}

// 3. A RETURNING SIGNED OUT CUSTOMER REACHES SIGN IN WITH NOTHING IN HIS WAY. He never goes near
//    /start: the site's own nav sends him to /in, which is a different route entirely.
{
  const signin = read('app/in/page.tsx');
  const site = read('app/_shared/site.tsx');
  const mw = read('proxy.ts');
  ok('🔴 the sign in door has nothing of the gate on it',
    !signin.includes(REGION) && !/region(Confirm|Blocked|Waitlist)/.test(signin));
  ok('...and the site still sends a returning customer straight to it', /href="\/in"/.test(site));
  ok('...and nothing in the middleware stands between him and it', !/region/i.test(codeOnly(mw)));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
