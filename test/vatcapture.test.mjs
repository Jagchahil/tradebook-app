// CAPTURING WHAT WE KEPT ASKING FOR AND THROWING AWAY. Run: node test/vatcapture.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
//   1. 🔴 THE COMPOUND QUESTION IS GONE. lib/circumstances.ts asked "Are you VAT registered, and
//      when did you register?" into an answer type that holds 'yes', 'no' or 'skip'. The date was
//      asked for and discarded, every time, for everybody, while the promise underneath it offered
//      him the VAT back on kit he already owned going back four years. That is Reg 111 of the VAT
//      Regulations 1995 and it is measured from the registration date and from nothing else, so the
//      product was promising a calculation whose only input it threw away. The file's own rule,
//      written above dependsOn, bans exactly this.
//
//   2. 🔴 A BAD VAT NUMBER IS REFUSED AND NEVER STORED. A number that fails the check digits is a
//      typo, and a typo stored here is printed on an invoice a customer pays from.
//
//   3. 🔴 A FUTURE REGISTRATION DATE IS REFUSED. reg111Window subtracts four years from whatever
//      it is given, so a mistyped 2062 would open a reclaim window running to 2058 and sweep every
//      receipt he owns into a claim he cannot make.
//
//   4. THE SCHEME IS ONE OF FOUR, decided by lib/vat.ts and not by the request.
//
//   5. 🔴 "WE COULD NOT READ IT" IS NOT "HE IS NOT VAT REGISTERED". Answering a database blip with
//      "not registered" would tell a registered man his invoices carry no VAT.
//
//   6. THE SCREEN SHIPS NO CLIENT JAVASCRIPT, and a man who is not registered is asked ONE
//      question rather than shown a form of fields about a scheme he is not on. Doc 103.
//
//   7. NOTHING ANYWHERE CLAIMS WE FILE A VAT RETURN, or that a VAT number has been verified.
//      lib/hmrc.ts has no VAT scope at all, and we never ask HMRC whose number this is.
//
// Behavioural where it can be, source level where a route cannot be loaded whole. The route is
// staged with stubs for next/server, the session, the rate limiter and Supabase, exactly as
// test/moneyweb.test.mjs stages app/app/entryref.ts, so the real validation code really runs.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments are stripped before looking for code a file must not contain. Every file here explains
// at length why the thing it does not do would be wrong, and a check that cannot tell the argument
// from the sentence gets deleted rather than fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const circumstancesSrc = read('lib/circumstances.ts');
const routeSrc = read('app/api/vat/route.ts');
const pageSrc = read('app/app/you/vat/page.tsx');
const youSrc = read('app/app/you/page.tsx');

const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const V = await import(pathToFileURL(path.join(root, 'lib/vat.ts')).href);
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);

console.log('\nVAT capture: the question that asked for a date and threw it away');

// ---------------------------------------------------------------------------------------------
// 🔴 1. ONE QUESTION, ONE FACT.
// ---------------------------------------------------------------------------------------------
const vatQ = C.CIRCUMSTANCES.find((c) => c.key === 'vat_registered');

ok('the vat_registered question still exists under its own key', !!vatQ);
ok('🔴 THE COMPOUND QUESTION IS GONE: the ask no longer contains "and when"',
  !/and when/i.test(vatQ.ask));
ok('...and it asks the one thing it can actually store', vatQ.ask === 'Are you VAT registered?');
ok('it asks for no date at all, in any wording',
  !/\bdate\b|\bregister\?.*\?|when did/i.test(vatQ.ask));
ok('it is still one sentence and one question mark',
  (vatQ.ask.match(/\?/g) || []).length === 1);

ok('🔴 IT KEEPS ITS PLACE IN THE ORDER. It is still one of the three biggest questions we ask',
  C.askingOrder().slice(0, 3).some((c) => c.key === 'vat_registered') && vatQ.worthOrder === 'huge');

// The promise is still a promise. A question stripped back to nothing is not a fix, it is a
// smaller hole: the four year reclaim is the reason this is the third question we ask.
ok('the why still carries the reclaim, in both halves of Reg 111',
  /four years/.test(vatQ.why) && /six months/.test(vatQ.why));
ok('🔴 AND IT IS HONEST ABOUT NEEDING THE DATE, which the old one never was',
  /date you registered/.test(vatQ.why));
ok('...and it says where the date is actually asked for',
  /VAT page/i.test(vatQ.why));
ok('the source still cites Reg 111, goods four years and services six months',
  /Reg 111/.test(vatQ.source) && /4 years/.test(vatQ.source) && /6 months/.test(vatQ.source));

ok('the file writes down why the second fact did not become a second circumstance',
  /vat_profiles/.test(circumstancesSrc) && /app\/you\/vat/.test(circumstancesSrc));

// ---------------------------------------------------------------------------------------------
// THE ROUTE, STAGED AND RUN FOR REAL.
// ---------------------------------------------------------------------------------------------
const stage = mkdtempSync(path.join(tmpdir(), 'vatcapture-'));

// The two modules with no imports of their own go in whole, so the checks that run are the real
// ones: lib/vat.ts decides what a VAT number and a scheme are, here as in production.
writeFileSync(path.join(stage, 'vat.ts'), read('lib/vat.ts'));
writeFileSync(path.join(stage, 'circumstances.ts'), circumstancesSrc);

writeFileSync(path.join(stage, 'nextserver.ts'), `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);

writeFileSync(path.join(stage, 'webauth.ts'), `
export async function sessionUser() { return { id: 'u-1' }; }
`);

writeFileSync(path.join(stage, 'ratelimit.ts'), `
export async function userBurst() { return false; }
`);

// The spy. Every write the route attempts lands in state.calls, so "never stored" can be asserted
// as an absence rather than hoped for.
writeFileSync(path.join(stage, 'supabase.ts'), `
export const state = {
  profile: {
    registered: false, vrn: null, registeredOn: null, deregisteredOn: null,
    scheme: 'standard', flatRatePercent: null, flatRateFirstYear: false, cisSubcontractor: false,
  },
  readOk: true,
  saveOk: true,
  forgetOk: true,
  calls: [],
};
export async function readVatProfile(userId) {
  state.calls.push({ fn: 'readVatProfile', userId });
  return state.readOk ? state.profile : null;
}
export async function saveVatProfile(userId, patch) {
  state.calls.push({ fn: 'saveVatProfile', userId, patch });
  return state.saveOk;
}
export async function saveCircumstance(userId, key, answer, asked, channel) {
  state.calls.push({ fn: 'saveCircumstance', userId, key, answer, asked, channel });
  return true;
}
export async function forgetCircumstance(userId, key) {
  state.calls.push({ fn: 'forgetCircumstance', userId, key });
  return state.forgetOk;
}
`);

writeFileSync(
  path.join(stage, 'route.ts'),
  routeSrc
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'"),
);

const R = await import(pathToFileURL(path.join(stage, 'route.ts')).href);
const DB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

function reset(profile = {}) {
  DB.state.calls.length = 0;
  DB.state.readOk = true;
  DB.state.saveOk = true;
  DB.state.forgetOk = true;
  DB.state.profile = {
    registered: false, vrn: null, registeredOn: null, deregisteredOn: null,
    scheme: 'standard', flatRatePercent: null, flatRateFirstYear: false, cisSubcontractor: false,
    ...profile,
  };
}

function formReq(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  return {
    url: 'https://lekhio.app/api/vat',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    formData: async () => fd,
    json: async () => { throw new Error('this caller sent a form'); },
  };
}

function jsonReq(body) {
  return {
    url: 'https://lekhio.app/api/vat',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    formData: async () => { throw new Error('this caller sent json'); },
  };
}

const saves = () => DB.state.calls.filter((c) => c.fn === 'saveVatProfile');

// ---------------------------------------------------------------------------------------------
// 🔴 2. A BAD VAT NUMBER IS REFUSED, AND NOTHING AROUND IT IS STORED EITHER.
// ---------------------------------------------------------------------------------------------
ok('the fixture really is a bad number and the good one really is good',
  !V.isValidVrn('123456789') && V.isValidVrn('123456782'));

{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ vrn: '123456789' }));
  ok('🔴 A BAD VRN IS REFUSED, 400 and a reason he can act on',
    res.status === 400 && res.body.error === 'bad_vrn' && /nine digits/.test(res.body.message));
  ok('🔴 AND IT IS NEVER STORED. Not one write was attempted', saves().length === 0);
}

{
  // The dangerous shape: a typo alongside facts that are perfectly good. Half a save would leave
  // him believing the lot went in.
  reset({ registered: true });
  const res = await R.POST(jsonReq({ vrn: '123456789', registeredOn: '2024-01-15', scheme: 'cash' }));
  ok('a typo refuses the whole post rather than saving the good half',
    res.status === 400 && saves().length === 0);
}

{
  reset({ registered: true });
  const res = await R.POST(formReq({ vrn: '123456789' }));
  ok('the form caller is sent back to the screen, never handed an error object',
    res.kind === 'redirect' && res.status === 303 && /\/app\/you\/vat\?problem=vrn$/.test(res.location));
  ok('and the form path stores nothing either', saves().length === 0);
}

{
  reset({ registered: true });
  await R.POST(jsonReq({ vrn: 'GB 123 4567 82' }));
  ok('a good number is stored as nine digits, no prefix and no spaces',
    saves().length === 1 && saves()[0].patch.vrn === '123456782');
}

{
  reset({ registered: true, vrn: '123456782' });
  await R.POST(jsonReq({ vrn: '' }));
  ok('an empty box clears the number rather than half keeping it',
    saves().length === 1 && saves()[0].patch.vrn === null);
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE DATE. The Reg 111 anchor, and the whole reason this route exists.
// ---------------------------------------------------------------------------------------------
{
  const future = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  reset({ registered: true });
  const res = await R.POST(jsonReq({ registeredOn: future }));
  ok('🔴 A REGISTRATION DATE IN THE FUTURE IS REFUSED',
    res.status === 400 && res.body.error === 'bad_date');
  ok('...and nothing is stored, so no window can be opened from it', saves().length === 0);
}

{
  reset({ registered: true });
  const res = await R.POST(formReq({ registeredOn: '2062-03-12' }));
  ok('a mistyped year is refused on the form path too, with a message on the screen',
    res.kind === 'redirect' && /problem=date$/.test(res.location) && saves().length === 0);
}

{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ registeredOn: '2026-02-31' }));
  ok('31 February is refused rather than rolled forward to 3 March',
    res.status === 400 && saves().length === 0);
}

{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ registeredOn: '0202-05-05' }));
  ok('a year typed short is refused: VAT did not exist before April 1973',
    res.status === 400 && saves().length === 0);
}

{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ registeredOn: '2026-03-12' }));
  ok('a real past date is stored as given', saves()[0].patch.registeredOn === '2026-03-12');
  ok('🔴 AND THE ROUTE HANDS BACK THE WINDOW IT OPENS, from lib/vat.ts and nowhere else',
    res.body.reg111.goodsFrom === '2022-03-12' && res.body.reg111.servicesFrom === '2025-09-12');
  ok('which is exactly what reg111Window says, so the sentence cannot drift from the rule',
    res.body.reg111.goodsFrom === V.reg111Window('2026-03-12').goodsFrom);
}

// ---------------------------------------------------------------------------------------------
// 4. THE SCHEME, AND THE FLAT RATE PERCENTAGE.
// ---------------------------------------------------------------------------------------------
{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ scheme: 'made_up' }));
  ok('🔴 A SCHEME WE DO NOT KNOW IS REFUSED', res.status === 400 && res.body.error === 'bad_scheme');
  ok('and nothing is stored', saves().length === 0);
}

for (const scheme of ['standard', 'flat_rate', 'cash', 'annual']) {
  reset({ registered: true });
  await R.POST(jsonReq({ scheme }));
  ok(`the four real schemes are accepted: ${scheme}`,
    saves().length === 1 && saves()[0].patch.scheme === scheme && V.isVatScheme(scheme));
}

{
  reset({ registered: true, scheme: 'flat_rate' });
  const res = await R.POST(jsonReq({ flatRatePercent: 140 }));
  ok('a flat rate percentage over 100 is refused rather than billed for',
    res.status === 400 && res.body.error === 'bad_percent' && saves().length === 0);
}

{
  reset({ registered: true, scheme: 'flat_rate' });
  await R.POST(jsonReq({ flatRatePercent: '9.5', flatRateFirstYear: 'no' }));
  ok('a real percentage is stored as a percentage, never as a fraction',
    saves()[0].patch.flatRatePercent === 9.5);
  ok('and first year off is stored as false rather than left as it was',
    saves()[0].patch.flatRateFirstYear === false);
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE TWO RECORDS ARE WRITTEN TOGETHER, SO THEY CAN NEVER DISAGREE.
// ---------------------------------------------------------------------------------------------
{
  reset();
  await R.POST(formReq({ registered: 'yes' }));
  const logged = DB.state.calls.find((c) => c.fn === 'saveCircumstance');
  ok('saying yes writes the profile', saves()[0].patch.registered === true);
  ok('🔴 AND WRITES THE CIRCUMSTANCE ALONGSIDE IT, so the agent and the weekly update agree',
    !!logged && logged.key === 'vat_registered' && logged.answer === 'yes');
  ok('the wording logged is the module\'s own sentence, verbatim from the server',
    logged.asked === vatQ.ask);
  ok('🔴 AND THE EXHIBIT NO LONGER CONTAINS A QUESTION WE THROW AWAY THE ANSWER TO',
    !/and when/i.test(logged.asked));
  ok('the channel recorded is the one he really used', logged.channel === 'web');
}

{
  reset({ registered: true });
  await R.POST(jsonReq({ registered: false }));
  const logged = DB.state.calls.find((c) => c.fn === 'saveCircumstance');
  ok('saying no writes both records too, and the phone app is logged as the app',
    saves()[0].patch.registered === false && logged.answer === 'no' && logged.channel === 'app');
}

{
  reset({ registered: true });
  await R.POST(jsonReq({ vrn: '123456782' }));
  ok('a post that says nothing about registration does not rewrite the answer he gave',
    !DB.state.calls.some((c) => c.fn === 'saveCircumstance'));
}

{
  reset({ registered: true });
  const res = await R.POST(jsonReq({ nothing: 'useful' }));
  ok('a body with nothing we recognise is refused rather than answered with a cheerful ok',
    res.status === 400 && saves().length === 0);
}

{
  reset({ registered: true });
  DB.state.saveOk = false;
  const res = await R.POST(jsonReq({ registeredOn: '2024-06-01' }));
  ok('🔴 A FAILED WRITE IS NEVER REPORTED AS A SAVE', res.status === 502);
}

// ---------------------------------------------------------------------------------------------
// 🔴 6. "COULD NOT READ" IS NOT "NOT REGISTERED".
// ---------------------------------------------------------------------------------------------
{
  reset();
  DB.state.readOk = false;
  const res = await R.GET(jsonReq({}));
  ok('🔴 AN UNREADABLE PROFILE IS A 503, never a cheerful "not VAT registered"',
    res.status === 503 && res.body.error === 'unreadable');
  ok('...and it says nothing about his registration at all', res.body.profile === undefined);
}

{
  reset();
  const res = await R.GET(jsonReq({}));
  ok('a man who really is not registered gets 200 and a plain answer',
    res.status === 200 && res.body.profile.registered === false);
  ok('with no reclaim window, because there is no date to open one from', res.body.reg111 === null);
}

{
  reset({ registered: true, vrn: '123456782', registeredOn: '2025-04-06' });
  const res = await R.GET(jsonReq({}));
  ok('a registered man gets his number back in HMRC\'s own spacing',
    res.body.profile.vrnFormatted === 'GB 123 4567 82');
  ok('and the window his date opens', res.body.reg111.goodsFrom === '2021-04-06');
}

// ---------------------------------------------------------------------------------------------
// 7. TAKING IT BACK. The elections DELETE shape.
// ---------------------------------------------------------------------------------------------
{
  reset({ registered: true, vrn: '123456782', registeredOn: '2025-04-06', cisSubcontractor: true });
  const res = await R.DELETE(jsonReq({}));
  const patch = saves()[0].patch;
  ok('DELETE clears every VAT fact we hold',
    res.status === 200 && patch.registered === false && patch.vrn === null
    && patch.registeredOn === null && patch.scheme === 'standard' && patch.cisSubcontractor === false);
  ok('🔴 AND IT TAKES THE CIRCUMSTANCE WITH IT, so the two cannot disagree on the way out',
    DB.state.calls.some((c) => c.fn === 'forgetCircumstance' && c.key === 'vat_registered'));
}

{
  reset({ registered: true });
  DB.state.forgetOk = false;
  const res = await R.DELETE(jsonReq({}));
  ok('a failed delete never reports success. He is entitled to know whether it is gone',
    res.status === 502);
}

{
  reset({ registered: true, vrn: '123456782' });
  const res = await R.POST(formReq({ intent: 'forget' }));
  ok('the screen reaches the same erasure with a plain form post, because a browser has no DELETE',
    res.kind === 'redirect' && /done=forgotten$/.test(res.location)
    && DB.state.calls.some((c) => c.fn === 'forgetCircumstance'));
}

// ---------------------------------------------------------------------------------------------
// 8. THE ROUTE'S OWN SHAPE. Two encodings, one write, and no open redirect.
// ---------------------------------------------------------------------------------------------
{
  const code = codeOnly(routeSrc);
  ok('it takes the account from the session and only the session',
    /sessionUser\(req\)/.test(code) && !/user_id|userId.*body/.test(code.replace(/user\.id/g, '')));
  ok('it rate limits per user, like every other customer route', /userBurst\('vat', user\.id\)/.test(code));
  ok('🔴 NO REDIRECT TARGET IS EVER READ OFF THE REQUEST. Every one is built here from a constant',
    !/f\.get\('back'\)|body\.back|searchParams\.get\('back'\)/.test(code)
    && /const SCREEN = '\/app\/you\/vat'/.test(code));
  ok('the number, the scheme and the window are decided by lib/vat.ts, not copied into the route',
    /from '\.\.\/\.\.\/\.\.\/lib\/vat'/.test(routeSrc)
    && /isValidVrn/.test(code) && /isVatScheme/.test(code) && /reg111Window/.test(code));
  ok('every write goes through lib/supabase.ts rather than a fetch written here',
    !/fetch\(/.test(code) && /saveVatProfile/.test(code));
  ok('the verbatim question comes from lib/circumstances.ts, never retyped here',
    /CIRCUMSTANCES\.find\(\(c\) => c\.key === 'vat_registered'\)/.test(code));
}

// ---------------------------------------------------------------------------------------------
// 🔴 9. THE SCREEN. No client javascript, and one question until he is registered.
// ---------------------------------------------------------------------------------------------
ok('🔴 THE PAGE SHIPS NO CLIENT JAVASCRIPT',
  !/'use client'|useState|useEffect|onClick|onChange|onSubmit|<script/.test(pageSrc));
ok('it is a server rendered route with the app runtime', /export const runtime = 'nodejs'/.test(pageSrc));
ok('every answer is a plain form posting to the one route',
  (pageSrc.match(/action="\/api\/vat" method="post"/g) || []).length >= 3);
ok('it carries the shell, and names a section the nav knows', /<AppNav current="\/app\/you"/.test(pageSrc));

// The fields are inside one component, and that component is drawn for a registered man only.
const factsFrom = pageSrc.indexOf('function YourVatFacts');
const factsTo = pageSrc.indexOf('export default async function VatPage');
const facts = pageSrc.slice(factsFrom, factsTo);
const questionFrom = pageSrc.indexOf('function RegisteredQuestion');
const question = pageSrc.slice(questionFrom, factsFrom);

ok('the two halves of the screen really are separate components', factsFrom > 0 && questionFrom > 0 && factsTo > factsFrom);
ok('🔴 AN UNREGISTERED MAN IS ASKED ONE QUESTION, and it is the one he can answer',
  /Are you VAT registered\?/.test(question));
ok('🔴 AND IS SHOWN NO FORM OF FIELDS ABOUT A SCHEME HE IS NOT ON',
  !/type="text"|type="date"|type="number"|<select|name="vrn"|name="scheme"/.test(question));
ok('the fields live in the other component, all of them',
  /name="vrn"/.test(facts) && /name="registeredOn"/.test(facts) && /name="scheme"/.test(facts)
  && /name="cisSubcontractor"/.test(facts));
ok('🔴 WHICH IS DRAWN ONLY FOR A MAN WHO HAS SAID HE IS REGISTERED',
  /\{profile\.registered \? <YourVatFacts/.test(pageSrc));
ok('the flat rate percentage waits for a man who says he is on the flat rate scheme',
  /p\.scheme === 'flat_rate' \?/.test(facts) && /name="flatRatePercent"/.test(facts));
ok('the first year answer is a pair of radios, because an unticked box sends silence',
  (facts.match(/name="flatRateFirstYear"/g) || []).length === 2);

// The sentence the whole wave exists to be able to say.
ok('🔴 THE SCREEN TELLS HIM WHAT HIS REGISTRATION DATE UNLOCKS, in his own dates',
  /reg111Window\(registeredOn\)/.test(pageSrc)
  && /Anything you bought from \$\{sayDate\(win\.goodsFrom\)\} onward/.test(pageSrc)
  && /any services from \$\{sayDate\(win\.servicesFrom\)\}/.test(pageSrc));
ok('and it says "may still be", because goods have to have been on hand and no date can settle that',
  /may still be reclaimable/.test(pageSrc) && /on hand when you registered/.test(pageSrc));

ok('🔴 A FAILED PROFILE READ IS SAID PLAINLY, never drawn as "not VAT registered"',
  /profile === null/.test(pageSrc) && /could not read your VAT details/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 10. WHAT NOTHING HERE MAY EVER SAY.
// ---------------------------------------------------------------------------------------------
for (const [name, src] of [['the page', pageSrc], ['the route', routeSrc], ['the hub', youSrc]]) {
  ok(`${name}: no em dash and no en dash`, !/[—–]/.test(src));
  ok(`${name}: never writes the rival's domain`, !/lekhio\.com/.test(src));
  // ⚠️ THE COMMENTS ARE STRIPPED FIRST, and deliberately: both files argue at length that the word
  // is not available to us, and a check that cannot tell the argument from the claim would push
  // people to delete the argument. What is checked is what a customer can read.
  ok(`${name}: 🔴 NEVER CALLS A VAT NUMBER VERIFIED`, !/verified/i.test(codeOnly(src)));
  ok(`${name}: never claims we file or send his VAT return`,
    !/we (file|submit|send) your VAT|file your VAT return|submit your VAT return/i.test(src));
}
ok('🔴 THE GROUND TRUTH BEHIND THAT: lib/hmrc.ts still has no VAT scope at all',
  !/vat/i.test(read('lib/hmrc.ts')));
ok('the page says plainly that his VAT return is still his to send',
  /We do not send VAT returns/.test(pageSrc));
ok('and it is honest about what the number check is: a shape, not a check on him',
  /We check the shape of it/.test(pageSrc) && /We do not ask HMRC whether it is yours/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 11. THE GATE, AND THE HUB.
// ---------------------------------------------------------------------------------------------
ok('🔴 THE NEW ROUTE HAS A DECISION IN lib/gate.ts', G.ruleFor('app/api/vat') !== null);
ok('...and it is never gated: telling us a fact about himself is not work we do for him',
  G.ruleFor('app/api/vat') === 'always');
ok('the row says why, in the voice of the rows around it',
  /elections/i.test(G.GATED_ROUTES.find((r) => r.route === 'app/api/vat').why));
ok('it sits with the other facts about him, not with the work',
  G.ruleFor('app/api/circumstances') === 'always' && G.ruleFor('app/api/business') === 'always');

ok('the hub reads the VAT profile rather than guessing from the old answer',
  /readVatProfile\(user\.id\)/.test(youSrc));
ok('🔴 AND A FAILED READ THERE FALLS BACK TO THE LOG rather than asserting he is not registered',
  /readVatProfile\(user\.id\)\.catch\(\(\) => null\)/.test(youSrc)
  && /if \(vat\?\.registered\)/.test(youSrc));
ok('the hub points at the new screen rather than repeating it',
  /href="\/app\/you\/vat"/.test(youSrc));
ok('and it stays a hub: the VAT part is one sentence and one door',
  (youSrc.match(/href="\/app\/you\/vat"/g) || []).length === 1);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
