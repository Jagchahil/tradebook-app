// THE VAT SCREEN. What he owes this quarter, prepared, and the four ways it could lie to him.
//
//   node test/vatposition.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS SUITE IS DEFENDING.
//
//   1. A FILING CLAIM WE CANNOT BACK. lib/hmrc.ts asks for 'read:self-assessment
//      write:self-assessment' and contains no VAT at all. Making Tax Digital for VAT is ABSENT
//      from this codebase, not half built, so this screen may not carry the quarterly summary's
//      "the pipeline is built and waits on HMRC" sentence either: that is true of income tax and
//      would be a straight lie about VAT. He files his own VAT return. The page says so once.
//
//   2. A REVERSE CHARGE INVOICE COUNTED AS OUTPUT TAX, OR HIDDEN. VATA 1994 s55A means the most
//      common invoice this audience sends carries no VAT, and VATREVCON37100 says that VAT
//      "should not be included in the amount shown as total VAT charged". So it must appear on
//      the screen, apart, or a subcontractor reads an output figure that looks broken and stops
//      believing every other number we show him. Shown, and never added.
//
//   3. A REFUND CLAMPED TO ZERO. A quiet quarter with a van in it puts him in refund. A screen
//      that floors the figure at nothing is a screen that quietly loses him money.
//
//   4. A VAT ROW ON THE TAX HUB OF A MAN WHO IS NOT REGISTERED. Most UK trades are under the
//      threshold and always will be. Doc 103's empty test: a row that says "nothing to check" is
//      a row he learns to skip, and then he skips it the quarter it matters.
//
// Source assertions on the two screens, plus runtime tests against lib/vat.ts itself, in the style
// of test/taxweb.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// lib/vat.ts imports nothing on purpose, so it loads straight into bare node.
const V = await import(pathToFileURL(path.join(root, 'lib/vat.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b) => Math.abs(a - b) < 0.0000001;

const PAGE = 'app/app/tax/vat/page.tsx';
const HUB = 'app/app/tax/page.tsx';
const page = read(PAGE);
const hub = read(HUB);

// Comments stripped before asking what the CODE does or what a CUSTOMER reads. The page explains
// at length why the thing it does not do would be wrong, and a check that cannot tell the argument
// from the sentence gets deleted rather than fixed.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const flat = (s) => s.replace(/\s+/g, ' ');
const copy = flat(codeOnly(page));

console.log('\nthe VAT screen: prepared, never filed, and never quietly wrong');

// ---------------------------------------------------------------------------------------------
console.log('\n1. ZERO CLIENT JAVASCRIPT, AND THE SESSION IN FRONT OF IT');
// ---------------------------------------------------------------------------------------------
// ⚠️ THE HANDLER CHECK IS ANCHORED ON THE ATTRIBUTE, NOT THE LETTERS. The first draft matched
// "onInput" anywhere and failed on `positionInput`, which is a test failing for the wrong reason
// and is exactly how a real assertion gets weakened by whoever fixes it in a hurry.
ok('🔴 THE PAGE SHIPS NO CLIENT JAVASCRIPT AT ALL',
  !/'use client'/.test(page)
  && !/\buseState\b|\buseEffect\b|\buseRef\b/.test(page)
  && !/\son[A-Z][A-Za-z]*\s*=/.test(page)
  && !/<script/i.test(page));
ok('🔴 AND THAT HANDLER CHECK STILL BITES', /\son[A-Z][A-Za-z]*\s*=/.test('<button onClick={go}>'));
// 🔴 7 AUGUST 2026: widened to allow next=. Every page under app/app now carries its own
// destination through the sign in door (see test/signinnext.test.mjs), not just a bare '/in'.
ok('it resolves the user from the session and sends a stranger to the door',
  page.includes('userFromSessionCookie') && /redirect\('\/in(\?[^']*)?'\)/.test(page));
ok('forced dynamic, so his figures are never cached into somebody else\'s page',
  page.includes("dynamic = 'force-dynamic'"));
ok('it wears the shared shell and lights up the Tax tab',
  page.includes('APP_CSS') && page.includes('<AppNav current="/app/tax" />'));
// The nav has never heard of /app/tax/vat, and naming a route it does not know highlights nothing.
{
  const sections = (() => {
    const nav = read('app/app/AppNav.tsx');
    return nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
  })();
  ok('/app/tax/vat is NOT in the nav: it is reached from the hub, by the men it belongs to',
    !sections.includes("href: '/app/tax/vat'"));
}
ok('it writes pounds through lib/money.ts and builds none of its own',
  page.includes("from '../../lib/money'") && !/`£\$\{|['"]£['"]\s*\+/.test(codeOnly(page)));

// ---------------------------------------------------------------------------------------------
console.log('\n2. WE DO NOT FILE HIS VAT RETURN, AND NOTHING ON THE PAGE SUGGESTS WE MIGHT');
// ---------------------------------------------------------------------------------------------
ok('🔴 NOTHING CLAIMS WE FILE OR SUBMIT A VAT RETURN',
  !/\bwe\s+(will\s+)?file\b/i.test(copy)
  && !/\bwe\s+(will\s+)?submit\b/i.test(copy)
  && !/\bwe\s+(will\s+)?do\s+your\s+(tax|vat)\b/i.test(copy)
  && !/\bfiled?\s+automatically\b/i.test(copy)
  && !/your VAT return (is|will be) (sent|submitted|filed)/i.test(copy));
ok('and nothing claims he can file from here today', !/\byou can file (now|today)\b/i.test(copy));
ok('🔴 THE GUARD STILL BITES: it catches a real claim',
  /\bwe\s+(will\s+)?file\b/i.test('We file your VAT return for you.')
  && /\bwe\s+(will\s+)?submit\b/i.test('We submit it to HMRC on the seventh.'));
ok('🔴 AND THE PAGE SAYS SO IN PLAIN WORDS, ONCE',
  /Lekhio does not send VAT returns to HMRC\./.test(copy));
ok('it names who does file it, and does not apologise for the fact',
  /before you file your own return, through whatever you use for it today/.test(copy)
  && !/sorry|unfortunately|we know this is|for now, you will have to/i.test(copy));
// The structural fact behind that sentence, asserted next to the screen that depends on it. If
// somebody ever adds a VAT scope to the OAuth request, this fails here as well as in vat.test.mjs.
ok('🔴 lib/hmrc.ts STILL CONTAINS NO VAT AT ALL, so nothing here could file even if it wanted to',
  !/vat/i.test(read('lib/hmrc.ts')));
ok('and the page never borrows the income tax "waiting on HMRC" line, which would promise MTD for VAT',
  !/production access|waits on HMRC|when it arrives, you will see the figures/i.test(copy));
ok('it never claims HMRC approval, endorsement or recognition',
  !/HMRC[\s-]*(approved|accredited|certified|endorsed|recognised)/i.test(copy));

// ---------------------------------------------------------------------------------------------
console.log('\n3. THE HUB GIVES HIM THE DOOR THAT IS HIS, AND A FAILED READ GIVES HIM NEITHER');
// ---------------------------------------------------------------------------------------------
const hubCode = codeOnly(hub);
ok('the hub reads the VAT profile from lib/supabase.ts, the one source',
  hubCode.includes('readVatProfile(user.id)'));
ok('🔴 THE ROW IS GATED ON REGISTRATION, AND A FAILED READ IS NOT REGISTRATION',
  /const vatRegistered = vat !== null && vat\.registered;/.test(hubCode));
// ⚠️ TWO DOORS SINCE 9 AUGUST 2026, AND THE GUARANTEE IS UNCHANGED. Until today /app/tax/vat had
// an arm written for the unregistered man that nothing linked to, and its own comment said so:
// "He has no row on the Tax hub, so he typed the address to be here." The door waited for the
// figure behind it to stop being summed off his invoices, which undercounts. It is his confirmed
// trade income now, so the door opens, WITH DIFFERENT WORDS, because it is a different question.
// What has not changed: an unregistered man never sees "VAT this quarter", and a failed profile
// read gets him NEITHER door.
ok('the hub links to the VAT screen twice, once for each kind of man',
  (hubCode.match(/href="\/app\/tax\/vat"/g) || []).length === 2);
{
  // Each link must sit INSIDE its own gate, not merely somewhere in a file that also has gates.
  const gate = hubCode.indexOf('{vatRegistered ? (');
  const second = hubCode.indexOf(') : vatThresholdDoor ? (');
  const shut = hubCode.indexOf(') : null}', second);
  const href = hubCode.indexOf('href="/app/tax/vat"');
  ok('all four markers exist, so the ordering assertions below can actually fail',
    gate > 0 && second > 0 && shut > 0 && href > 0);
  ok('🔴 THE QUARTER DOOR IS DRAWN INSIDE THE REGISTERED GATE, so an unregistered man never sees it',
    gate > 0 && href > gate && second > href);
  ok('🔴 AND THE THRESHOLD DOOR IS DRAWN INSIDE ITS OWN, after it',
    second > 0 && shut > second && hubCode.indexOf('VAT threshold') > second);
  ok('the two doors say different things, because they answer different questions',
    /VAT this quarter/.test(hubCode) && /VAT threshold/.test(hubCode));
}
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ASSERTION PASSED FOR A DAY WHILE THE RULE IT NAMES WAS BROKEN. Rewritten 9 Aug 2026.
//
// It pinned the literal source line `vat !== null && !vat.registered && !isCompany`, and its own
// name says "a failed PROFILE read gets neither door". TWO profiles are read into that decision and
// only one of them was being checked. getBusinessProfile answers null on a failed read, isCompany
// is `biz?.businessType === 'limited_company'`, and `null?.businessType` is undefined, so a
// director whose business profile read timed out was drawn the door the next assertion swears he
// can never see.
//
// The old form could not have caught it. Pinning a line proves the line has not CHANGED; it proves
// nothing about whether the line is RIGHT, and it agrees with whatever the line happens to say on
// the day it is written. So the property is asserted in terms of the READS now, not the text.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const decl = /const vatThresholdDoor = ([^;]+);/.exec(hubCode);
  ok('the door decision is where this file thinks it is', decl !== null);
  const expr = decl ? decl[1] : '';
  ok('🔴 EVERY READ THE DECISION LEANS ON IS CHECKED FOR FAILURE, not only the VAT one',
    /\bvat !== null\b/.test(expr) && /\bbiz !== null\b/.test(expr));
  ok('🔴 AND THE DIRECTOR TEST IS THE PRODUCT OF A SUCCESSFUL READ, never of an absent one',
    /\bbiz !== null\b/.test(expr) && /!isCompany/.test(expr)
    && expr.indexOf('biz !== null') < expr.indexOf('!isCompany'));
  // ⚠️ AND THE OPPOSITE DEFAULT IS RIGHT FOR THE MTD ROW ABOVE IT. An OBLIGATION he may already be
  // breaking must survive an unknown; an OFFER must not. Two adjacent lines defaulting opposite
  // ways looks like a bug to every reader who has not been told it is not one, so the hub records
  // the rule at the decision and this holds it there.
  //
  // ⚠️ ASSERTED AGAINST `hub` AND NOT `hubCode`, and the difference is the point. codeOnly() strips
  // comments precisely so that no assertion about BEHAVIOUR can be satisfied by prose describing
  // it. This is the one assertion here that is deliberately about the prose, so it is the one that
  // has to read the raw file. Written against hubCode first, where it could never pass.
  ok('and the reasoning for the opposite default on the MTD row is recorded beside it',
    /An OBLIGATION he may already be breaking/.test(hub)
    && /An OFFER to go and look at something/.test(hub));
}
ok('🔴 AND NEITHER DOES A DIRECTOR: his company registers, not him, and the copy behind it says "your"',
  /&& !isCompany;/.test(hubCode));
ok('the door is a plain anchor, no script, like every other door on the hub',
  /<a href="\/app\/tax\/vat" style=\{S\.door\} className="lek-hit">/.test(hubCode));
// And the screen itself, if he reaches it by typing the address, answers with the engine's own
// sentence rather than a table of zeroes he might believe.
const P0 = { profile: V.EMPTY_VAT_PROFILE, outputVat: 0, inputVat: 0, grossTurnover: 0, blockedVat: 0, inputVatWithProof: 0 };
ok('an unregistered visitor gets lib/vat.ts\'s plain sentence, not a table of zeroes',
  V.vatPosition(P0).due === 0 && /not VAT registered/.test(V.vatPosition(P0).notes[0]));
ok('and the page renders those notes rather than writing that sentence itself',
  /notes\.map\(/.test(codeOnly(page)) && !/You are not VAT registered/.test(copy));

// ---------------------------------------------------------------------------------------------
console.log('\n4. THE REVERSE CHARGE IS SHOWN, APART, AND NEVER ADDED TO WHAT HE OWES');
// ---------------------------------------------------------------------------------------------
const priced = V.priceInvoice([{ description: 'First fix', amount: 10000 }], 'reverse_charge');
ok('🔴 A REVERSE CHARGE INVOICE CHARGES NO VAT AND ITS TOTAL IS THE NET',
  priced.vat === 0 && priced.total === 10000);
ok('and the customer\'s VAT is carried separately, at the standard rate',
  priced.reverseChargeVat === 2000);
{
  // End to end: his output tax from that invoice is zero, so the position owes nothing on it.
  const REG = { ...V.EMPTY_VAT_PROFILE, registered: true };
  const p = V.vatPosition({ ...P0, profile: REG, outputVat: priced.vat, grossTurnover: priced.total });
  ok('🔴 SO THE POSITION OWES NOTHING ON IT: the £2,000 is his customer\'s to account for',
    p.due === 0 && p.outputVat === 0);
}
ok('the page shows the reverse charge figure from the invoices, not from a sum of its own',
  /out\.reverseChargeVat/.test(codeOnly(page)));
ok('🔴 AND THE POSITION IS NEVER FED IT: the input block names outputVat and nothing else',
  /outputVat: out\.outputVat/.test(codeOnly(page))
  && !/outputVat:[^,]*reverse/i.test(codeOnly(page))
  && !/reverseCharge[^\n]*\+|\+[^\n]*reverseCharge/.test(codeOnly(page)));
ok('the page says in one sentence whose VAT it is',
  /On those invoices your customer accounts for the VAT, so it is not yours to pay and it is not in the figure above\./.test(copy));
ok('and the block is drawn only for a man who has raised one (doc 103\'s empty test)',
  /\{reverseCharge > 0 \? \(/.test(page));
ok('it explains why the charged figure looks low, which is the whole reason the block exists',
  /looks low/i.test(copy));

// ---------------------------------------------------------------------------------------------
console.log('\n5. A REFUND QUARTER READS AS A REFUND, AND IS NEVER CLAMPED TO ZERO');
// ---------------------------------------------------------------------------------------------
const REGISTERED = { ...V.EMPTY_VAT_PROFILE, registered: true };
const negative = V.vatPosition({ ...P0, profile: REGISTERED, outputVat: 200, inputVat: 900, inputVatWithProof: 900 });
ok('🔴 THE ENGINE RETURNS A NEGATIVE POSITION, NOT A FLOOR AT ZERO', negative.due === -700);
ok('the page decides refund from the sign of the engine\'s own figure',
  /const refund = pos !== null && pos\.due < 0;/.test(codeOnly(page)));
ok('🔴 AND THE LABEL SAYS HMRC OWES HIM, so the magnitude can be printed without a stray minus',
  /HMRC owes you so far/.test(copy)
  && /refund \? gbpAbs0\(pos\.due\) : gbp0\(pos\.due\)/.test(codeOnly(page)));
ok('nothing on the page clamps the figure',
  !/Math\.max\(0, *pos\.due\)/.test(page) && !/Math\.max\(pos\.due, *0\)/.test(page));
ok('and it tells him plainly that a refund quarter is real rather than an error',
  /it is HMRC that owes you\. That is a real position and not a mistake\./.test(copy));

// ---------------------------------------------------------------------------------------------
console.log('\n6. THE FLAT RATE SCHEME IS A DIFFERENT SUM, AND ITS NOTES REACH THE SCREEN');
// ---------------------------------------------------------------------------------------------
const FLAT = { ...V.EMPTY_VAT_PROFILE, registered: true, scheme: 'flat_rate', flatRatePercent: 9.5 };
const flatPos = V.vatPosition({ ...P0, profile: FLAT, outputVat: 4000, inputVat: 1200, inputVatWithProof: 1200, grossTurnover: 24000 });
ok('🔴 IT IS A PERCENTAGE OF GROSS TURNOVER, NOT OUTPUT MINUS INPUT',
  flatPos.due === 2280 && flatPos.flatRateUsed === 0.095);
ok('and the input tax is zeroed, because on that scheme he does not reclaim it',
  flatPos.inputVat === 0);
ok('the engine writes both flat rate sentences',
  /do not reclaim/.test(flatPos.notes.join(' ')) && /percentage of your VAT inclusive turnover/.test(flatPos.notes.join(' ')));
ok('🔴 AND THE PAGE RENDERS THEM RATHER THAN RETYPING THEM',
  /\{notes\.map\(\(n\) => <p key=\{n\} style=\{S\.quiet\}>\{n\}<\/p>\)\}/.test(page)
  && !/do not reclaim/.test(copy));
ok('the flat rate working is drawn off the engine\'s own rate, through asPercent',
  /pos\.flatRateUsed !== null \? \(/.test(page) && /asPercent\(pos\.flatRateUsed\)/.test(page));
ok('a customer with no percentage on file is told the figure is not right yet, by the engine',
  /not right until you add it/.test(V.vatPosition({ ...P0, profile: { ...FLAT, flatRatePercent: null }, grossTurnover: 24000 }).notes.join(' ')));

// ---------------------------------------------------------------------------------------------
console.log('\n7. THE VAT NUMBER IS PRINTED, NEVER CALLED VERIFIED');
// ---------------------------------------------------------------------------------------------
// lib/vat.ts is explicit: the check digits prove the SHAPE, not the man. We do not ask HMRC whether
// the number is his, and a word that implies we did is the same class of claim as implying
// recognition. Checked over the whole file, comments included, because the word is the danger.
ok('🔴 THE WORD "VERIFIED" APPEARS NOWHERE ON THE PAGE, IN ANY FORM', !/verif/i.test(page));
ok('nor any cousin of it about the number',
  !/(number|vrn)[^.]{0,40}\b(confirmed|validated|checked) (with|against|by) HMRC/i.test(copy));
ok('the number is printed by formatVrn, in HMRC\'s own spacing, and only when we hold one',
  /formatVrn\(profile\.vrn\)/.test(page) && /\{vrn \? </.test(page));
ok('formatVrn still prints it the way HMRC does', V.formatVrn('123456782') === 'GB 123 4567 82');

// ---------------------------------------------------------------------------------------------
console.log('\n8. NOTHING IS INVENTED: ONE ENGINE, AND A FAILED READ IS SAID, NOT ZEROED');
// ---------------------------------------------------------------------------------------------
ok('🔴 EVERY FIGURE COMES FROM vatPosition(), and the page sums nothing itself',
  /vatPosition\(positionInput\)/.test(page)
  && !/\breduce\(/.test(codeOnly(page)) && !/\w\s*\+=\s*/.test(codeOnly(page)));
ok('no VAT rate or threshold is typed into the screen',
  !/(?<![\d.])(0\.2|0\.05|0\.165|90000|88000|150000)(?![\d.])/.test(codeOnly(page)));
ok('the registration threshold, where it is named, is the constant',
  /gbp0\(VAT_REGISTRATION_THRESHOLD\)/.test(page));
ok('🔴 A NULL PROFILE READS AS "WE COULD NOT READ IT", NEVER AS "NOT REGISTERED"',
  /profile === null \? \(/.test(page) && /We could not read your VAT details just now/.test(copy));
ok('and a failed figures read shows a blank he can retry, not a zero he would believe',
  /pos === null \? \(/.test(page)
  && /We could not read \{out === null \? 'your invoices' : 'what you have confirmed'\} just now/.test(flat(page))
  && /a zero you believe is worse than a blank you can try again/.test(copy));
ok('an empty quarter is said in words, never worn as a confident zero',
  /const nothingYet = pos !== null && out !== null/.test(codeOnly(page))
  && /\{nothingYet \? \(/.test(page)
  // ⚠️ THE SENTENCE MOVED INTO A TEMPLATE LITERAL IN RUN 4, because the empty case now has two
  // arms: a truly empty quarter, and a quarter whose invoices are all still marked unsent. The
  // property this suite owns is unchanged, that an empty quarter is SAID rather than worn as a
  // confident zero, so it is asserted on the sentence rather than on the JSX braces it used to
  // sit in. test/run4fixes.test.mjs owns the second arm.
  && /Nothing raised or confirmed since \$\{pretty\(from\)\}/.test(page));
ok('the reads are the three lib/supabase.ts functions, never an inline query',
  page.includes('readVatProfile') && page.includes('getOutputVat') && page.includes('getConfirmedInputVat')
  && !/fetch\(/.test(codeOnly(page)));

// ---------------------------------------------------------------------------------------------
console.log('\n9. THE PROOF SHARE TRAVELS WITH THE MONEY, AND THE REG 111 PROMISE IS KEPT');
// ---------------------------------------------------------------------------------------------
const std = V.vatPosition({ ...P0, profile: REGISTERED, outputVat: 4000, inputVat: 1200, inputVatWithProof: 900, grossTurnover: 24000 });
ok('the engine carries the share of the reclaim that has a receipt behind it', near(std.proofShare, 0.75));
ok('🔴 AND THE SCREEN SAYS IT, QUIETLY, WITHOUT REFUSING HIM A PENNY OVER IT',
  /pos\.proofShare >= 1/.test(page)
  && /has a receipt behind it/.test(copy)
  && /Nothing here is ever refused for want of a receipt/.test(copy));
ok('the proof line is drawn only where there is a reclaim to describe',
  /\{pos\.inputVat > 0 \? \(/.test(page));

const w = V.reg111Window('2026-07-01');
ok('the window is four years for goods and six months for services',
  w.goodsFrom === '2022-07-01' && w.servicesFrom === '2026-01-01');
ok('🔴 THE SCREEN SHOWS IT WITH HIS REAL DATES, which is the promise lib/circumstances.ts makes',
  /reg111Window\(profile\.registeredOn\)/.test(page)
  && /pretty\(window111\.goodsFrom\)/.test(page) && /pretty\(window111\.servicesFrom\)/.test(page));
ok('and only when we actually hold his registration date',
  V.reg111Window(null) === null && /\{window111 \? \(/.test(page));

// ---------------------------------------------------------------------------------------------
console.log('\n10. HOUSE RULES, ON BOTH FILES');
// ---------------------------------------------------------------------------------------------
// ⚠️ THE DASH AND THE DOMAIN ARE BOTH WRITTEN AS ESCAPES, for the same reason twice over.
// A guard must not read as the thing it forbids. test/housestyle.test.mjs writes the dashes it
// strips as \u2014 and \u2013 so that the file enforcing the rule does not break it, and
// test/domain.test.mjs walks this directory and flags any line carrying the rival address,
// so a check for it that spelled it out would be reported as the offence. Ours is lekhio.app.
// The other one belongs to Lacspace Corporation and appears nowhere in our code.
for (const [name, src] of [[PAGE, page], [HUB, hub]]) {
  ok(`${name}: no em dash or en dash anywhere, comments included`, !/[\u2014\u2013]/.test(src));
  ok(`${name}: never writes the rival domain`, !/lekhio\u002Ecom/i.test(src));
  ok(`${name}: paints no raw hex, only the theme by name`, !/#[0-9a-f]{3,6}\b/i.test(codeOnly(src)));
  ok(`${name}: names no messaging surface it cannot promise`, !/WhatsApp/.test(codeOnly(src)));
}
// 🔴 AND BOTH ESCAPED GUARDS STILL BITE. A mistyped escape passes everything in silence, which
// is worse than no check at all because it reads as proof. The fixtures are built the same way.
ok('the dash guard still catches a real em dash and a real en dash',
  /[\u2014\u2013]/.test('tax \u2014 bill') && /[\u2014\u2013]/.test('12,570 \u2013 50,270'));
ok('the domain guard still catches the rival address',
  /lekhio\u002Ecom/i.test('https://lekhio' + '\u002E' + 'com/terms'));

ok('the hub still carries the standing line: prepared, never sent without approval',
  /Nothing is ever sent to HMRC unless you have approved it first/.test(flat(hub)));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
