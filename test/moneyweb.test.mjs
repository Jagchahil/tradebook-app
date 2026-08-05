// THE WEB INPUT LAYER. Manual entry, receipt upload, and the one line detail view.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Until 30 July a web customer with no WhatsApp bound could not enter a single transaction. The
// three screens that fix that are exactly the kind of surface this codebase keeps writing
// warnings about, so the suite is written against the failures that would ship quietly:
//
//   1. A SECOND PARSE PATH. /api/money/receipt must be another CALLER of parseReceipt,
//      clampReceiptDate, findDuplicate and insertTransaction, never another copy of any of them.
//
//   2. A MACHINE'S READING CONFIRMED BY A MACHINE. The receipt route may never write
//      confirmed: true. The manual route may, because there the man typed every figure himself.
//
//   3. MONEY IN QUIETLY RECLASSIFIABLE. The one way rule on /app/money must hold on the detail
//      view too: no strike-out button on a payment in, ever, and the manual route must file
//      money in as income whatever the form claimed it was.
//
//   4. AN ID IN A URL. The detail view is reached by a sealed reference, and this suite ATTACKS
//      it at runtime: forged, tampered, expired, borrowed by another account, minted under a
//      different secret. Every one must be refused.
//
//   5. A ROUTE THAT TRUSTS THE BROWSER. Both routes must take the account from the session and
//      only the session, and both must have a row in lib/gate.ts, marked entitled.
//
// Source level assertions plus logic tests, in the style of test/onboardingweb.test.mjs.
// Run: node test/moneyweb.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments are stripped before looking for a string a CUSTOMER sees, or for code the file must
// not contain. Every one of these files explains at length why the thing it does not do would be
// wrong, and a check that cannot tell the argument from the sentence gets deleted, not fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Stage app/app/entryref.ts for bare node: it imports lib/moneylog.ts extensionless, which Next
// resolves and type stripping does not. Same fix as test/reviewpile.test.mjs, same reason.
function stageEntryref(secret) {
  const stage = mkdtempSync(path.join(tmpdir(), 'entryref-'));
  writeFileSync(path.join(stage, 'moneylog.ts'), read('lib/moneylog.ts'));
  writeFileSync(
    path.join(stage, 'entryref.ts'),
    read('app/app/entryref.ts').replace("from '../../lib/moneylog'", "from './moneylog.ts'"),
  );
  if (secret === undefined) delete process.env.WEB_SESSION_SECRET;
  else process.env.WEB_SESSION_SECRET = secret;
  return import(pathToFileURL(path.join(stage, 'entryref.ts')).href);
}

const pageAdd = read('app/app/money/add/page.tsx');
const pageCapture = read('app/app/money/capture/page.tsx');
const pageEntry = read('app/app/entry/page.tsx');
const pageMoney = read('app/app/money/page.tsx');
const routeManual = read('app/api/money/manual/route.ts');
const routeReceipt = read('app/api/money/receipt/route.ts');
// The receipt walk itself: store, parse, bank merge, duplicate refusal, insert as waiting.
// It moved out of the route on 5 August 2026 so the WhatsApp webhook and the chat composer
// could run the SAME walk instead of copies. The pins on what the walk does moved with it.
const ingest = read('lib/receiptingest.ts');
const nav = read('app/app/AppNav.tsx');
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);

console.log('\nmoney on the web: typed in, photographed, and opened one line at a time');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SEALED REFERENCE, ATTACKED AT RUNTIME.
// ---------------------------------------------------------------------------------------------
// The unconfigured module is imported FIRST, while no secret is set, because the module caches
// its key. It must fail closed: no links, and nothing to verify against.
{
  const off = await stageEntryref(undefined);
  ok('with no secret, no reference is ever minted', off.entryRef('a', '11111111-1111-4111-8111-111111111111', '2026-07') === '');
  ok('with no secret, nothing verifies', off.verifyEntryRef('x.y.z') === null);
  ok('and the module says plainly that it is off', off.entryRefsConfigured() === false);
}

const SECRET = 'a-test-secret-long-enough-to-clear-the-32-byte-bar';
const R = await stageEntryref(SECRET);
const OWNER = '9c1b2a3d-0000-4000-8000-00000000aaaa';
const INTRUDER = '9c1b2a3d-0000-4000-8000-00000000bbbb';
const ROW = '5e6f7a8b-1111-4111-8111-222222222222';

{
  const ref = R.entryRef(OWNER, ROW, '2026-07');
  ok('a reference round trips', (() => {
    const c = R.verifyEntryRef(ref);
    return c !== null && c.owner === OWNER && c.row === ROW && c.month === '2026-07';
  })());

  // 🔴 THE POINT OF THE WHOLE MODULE: the row id must not be readable out of the URL.
  ok('🔴 the reference does not contain the row id', !ref.includes(ROW) && !ref.includes(ROW.replace(/-/g, '')));
  ok('🔴 nor the owner', !ref.includes(OWNER));
  ok('two references to the same row never look alike', ref !== R.entryRef(OWNER, ROW, '2026-07'));

  // 🔴 THE TENANCY ATTACK. Another account holding a perfectly VALID reference to this row must
  // be refused. This is the active attempt to reach another user's row: the reference verifies,
  // and the ownership check still says no.
  const claim = R.verifyEntryRef(ref);
  ok('🔴 A VALID REFERENCE IN ANOTHER MAN\'S SESSION IS REFUSED', R.refBelongsTo(claim, INTRUDER) === false);
  ok('and honoured only in the session it was minted for', R.refBelongsTo(claim, OWNER) === true);
  ok('an empty session owner is refused too', R.refBelongsTo(claim, '') === false);
  ok('a null claim belongs to nobody', R.refBelongsTo(null, OWNER) === false);

  // Tampering. Flip one character in the MIDDLE of the ciphertext and the auth tag must catch
  // it. Not the last character: the final base64 char of an unpadded group can carry nothing but
  // padding bits, so flipping it sometimes decodes to the very same bytes and proves nothing.
  const mid = ref.lastIndexOf('.') + 3;
  const bent = ref.slice(0, mid) + (ref[mid] === 'A' ? 'B' : 'A') + ref.slice(mid + 1);
  ok('🔴 one flipped character is refused', R.verifyEntryRef(bent) === null);

  // Forgery without the secret. An attacker who knows the format but not the key.
  const forged = [crypto.randomBytes(12), crypto.randomBytes(16), Buffer.from(JSON.stringify({ o: INTRUDER, r: ROW, m: '2026-07', exp: 9999999999 }))]
    .map((b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .join('.');
  ok('🔴 a forged reference with the right shape and the wrong key is refused', R.verifyEntryRef(forged) === null);

  // A reference minted under a different secret, which is what secret rotation looks like.
  const other = await stageEntryref('a-completely-different-secret-also-long-enough');
  ok('a reference from a rotated secret is refused, not honoured', other.verifyEntryRef(ref) === null);
  // Put the real test secret back for anything below.
  process.env.WEB_SESSION_SECRET = SECRET;

  // Expiry.
  const later = new Date(Date.now() + (R.ENTRY_REF_TTL_SECONDS + 60) * 1000);
  ok('an expired reference is refused', R.verifyEntryRef(ref, later) === null);
  ok('and a live one is not', R.verifyEntryRef(ref, new Date()) !== null);

  // Shapes on the way in.
  ok('a non uuid row mints nothing', R.entryRef(OWNER, 'DROP TABLE transactions', '2026-07') === '');
  ok('a nonsense month mints nothing', R.entryRef(OWNER, ROW, '2026-13') === '');
  ok('an empty owner mints nothing', R.entryRef('', ROW, '2026-07') === '');
  ok('garbage does not verify', R.verifyEntryRef('not-even-close') === null && R.verifyEntryRef('') === null && R.verifyEntryRef(null) === null);
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE MONEY ROW LINK. A reference, never an id, and never a dead link.
// ---------------------------------------------------------------------------------------------
ok('the month page mints the reference from the SESSION user and the month on screen',
  /entryRef\(user\.id, e\.id, month\)/.test(pageMoney));
ok('🔴 the link carries the reference and nothing else',
  /href=\{`\/app\/entry\?ref=\$\{encodeURIComponent\(ref\)\}`\}/.test(pageMoney));
ok('🔴 no row id is ever written into a URL on the month page',
  !/href=\{`[^`]*\$\{e\.id\}/.test(codeOnly(pageMoney)));
ok('with no secret the row stays plain text rather than becoming a dead link',
  /\{ref \? \(/.test(pageMoney) && /<span style=\{e\.personal \? S\.labelOff : S\.label\}>\{e\.label\}<\/span>/.test(pageMoney));

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE DETAIL VIEW. Session first, ownership second, scoped read third.
// ---------------------------------------------------------------------------------------------
ok('the detail page resolves the session and sends a stranger to the door',
  pageEntry.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageEntry));
ok('🔴 a reference is verified AND checked against the session before anything is read',
  /verifyEntryRef\(one\('ref'\)/.test(pageEntry)
  && /if \(!claim \|\| !refBelongsTo\(claim, user\.id\)\) redirect\('\/app\/money'\)/.test(pageEntry));
ok('🔴 the row is read through the user scoped month query, like /app/money itself',
  /transactionsInMonth\(user\.id, month\)/.test(pageEntry));
ok('the row is picked out by lib/moneylog, not by a second grouping',
  /logFor\(rows \?\? \[\], month,[\s\S]{0,80}?\)\.entries\.find/.test(pageEntry));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 BOTH PAGES ASK lib/capital.ts THE SAME QUESTION THE TAX ENGINE ASKS.
//
// logFor takes the written down test as a parameter rather than owning it, because moneylog.ts
// imports nothing and may not start. That hands every caller a way to get it wrong: a page passing
// () => false quietly reproduces the 4 August defect, where /app/money reported June as a £52,557
// loss because a £60,000 Audi sat in Out while lib/supabase.ts had already held it out of his tax
// figures. The test is not free choice, it is isWrittenDown.
//
// ⚠️ THE NEGATIVE IS SCOPED TO THE CALL AND NOT TO THE FILE, and the first draft was not. A blanket
// ban on 'not_a_car' fired on three lines of app/app/entry that legitimately branch on it to decide
// which form to draw, which is a rendering choice and not a tax one. A guard that forbids a string
// a page has honest uses for is a guard somebody deletes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const logForCall = (src) => (codeOnly(src).match(/logFor\([\s\S]{0,140}?\)\.entries/) ?? [''])[0];
for (const [name, src] of [['app/app/entry', pageEntry], ['app/app/money', pageMoney]]) {
  ok(`🔴 ${name} asks lib/capital which costs are written down`,
    /isWrittenDown\(r\.capital_kind\)/.test(codeOnly(src))
    && /from '\.\.\/\.\.\/\.\.\/lib\/capital'/.test(src));
  ok(`...and does not decide it for itself in the call`,
    !/not_a_car|capital_kind\s*===|\(\)\s*=>\s*(true|false)/.test(logForCall(src)));
}

// 🔴 AND THE MONEY THAT LEAVES Out IS NAMED ON THE SCREEN IT LEFT. Holding a car out of the total
// and saying nothing about it swaps one wrong figure for a second one he cannot check, with
// £60,000 sitting in plain sight two rows below the total that no longer counts it.
ok('🔴 /app/money prints what went out on cars whenever there is some',
  /log\.capitalCost > 0/.test(codeOnly(pageMoney))
  && /gbp0\(log\.capitalCost\)/.test(codeOnly(pageMoney)));
ok('...and says why it is not in Out, in words',
  /not in Out/.test(pageMoney) && /several years/.test(pageMoney));
ok('🔴 and the row itself is marked, so the row and the total stop contradicting',
  /e\.writtenDown \?/.test(codeOnly(pageMoney)) && /spread over years/.test(pageMoney));
ok('the car line is drawn only when there is one, doc 103 empty test',
  !/log\.capitalCost >= 0|capitalCost !== null/.test(codeOnly(pageMoney)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SENTENCE THAT TOLD A MAN £2,700 WAS "MOST OF" £60,000, AND WHICH NOTHING GUARDED.
//
// app/app/entry is the ONE screen in the product built to stop a man misreading what a car is
// worth, and on 4 August 2026 it read: "You told us this was a car, 75% for work. That is £2,700
// off your profit this year, most of it, about three quarters." The tail was useBandLabel(75),
// written to be a dropdown option answering how much of the DRIVING is work. Appended to a
// sentence it modifies the nearest thing, and the nearest thing was a pound figure. £2,700 is 4.5%
// of that car.
//
// ⚠️ IT WAS FOUND BY READING IT, NOT BY A TEST, and a sabotage pass then put the old wording back
// and all 157 suites stayed green. This codebase's own named disease: shipped, correct, and pinned
// by nothing. So the claim is guarded from both ends.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 the car sentence names the COST beside the relief, so neither can be mistaken for the other',
  /\$\{gbp0\(cost\)\} left your account/.test(pageEntry)
  && /of it comes off your profit this year/.test(pageEntry));
ok('...and says where the rest went, because a man told only the small number thinks it is lost',
  /written down a little at a time/.test(pageEntry));
ok('🔴 AND NO BAND LABEL IS EVER GLUED ONTO A SENTENCE ABOUT MONEY',
  !/useBandLabel|bandLabel/.test(codeOnly(pageEntry)));
// ⚠️ AND THE SHARE IS STATED BEFORE THE FIGURE, NEVER AFTER IT. "£2,700, three quarters" reads as
// a claim about £2,700 whichever label supplies the tail, so the ordering is the guard, not the
// identifier. app/app/CarQuestion.tsx still uses the labels and should: there they are the options.
ok('🔴 and the driving share is stated before the pound figure, not after it',
  !/gbp0\([^)]*\)[^`]{0,40}(three quarters|about half|a quarter|most of it)/i.test(pageEntry));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE BUTTON THAT UNDOES IT SAID "leave it as it is" WHILE MOVING £1,284 OF HIS COSTS.
//
// Found on 4 August walking a real row: MEGGER LTD, £1,284 of electrical test equipment, answered
// at some point as "any other car". The screen said, correctly, "£1,284 left your account and £58
// of it comes off your profit this year". The one button that fixes it read "It was not a car,
// leave it as it is".
//
// That label was written for the UNANSWERED row, where it is exactly right: nobody has been asked,
// the cost is already coming off in full, and saying so changes no arithmetic at all. On a row
// already answered as a car it is the opposite of true, and that is the ONLY case where a man
// needs the button. Nobody presses "leave it as it is" in order to change something, so the
// correction screen was hiding its own correction behind a label that promised inaction.
//
// ⚠️ THE OLD COMMENT ABOVE IT SAID THE QUIET PART: "a van comes off in full, WHICH IS WHAT THE ROW
// IS ALREADY DOING". The reasoning was written once, for one case, and then applied to both.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 the not-a-car button says what it DOES when the row already says car, in pounds',
  /storedKind\s*\n?\s*\? `It was not a car\. Put the whole \$\{gbp0\(cost\)\} in my costs`/.test(pageEntry));
ok('...and keeps the honest wording for a row nobody has ever been asked about',
  /: 'It was not a car, leave it as it is'/.test(pageEntry));
// ⚠️ THE PROMISE OF INACTION MAY ONLY APPEAR ON THE BRANCH WHERE IT IS TRUE. A label claiming
// nothing changes, offered on a row where something does, is the whole defect.
{
  const btn = (codeOnly(pageEntry).match(/name="capital_kind" value="not_a_car"[\s\S]{0,700}?<\/form>/) ?? [''])[0];
  ok('🔴 and "leave it as it is" is never offered on a row that is being written down',
    /storedKind\s*\n?\s*\?/.test(btn) && /leave it as it is/.test(btn));
  ok('...with the consequence spelled out beside it, not left for him to work out',
    /plant and machinery/.test(btn) && /instead of a slice a year/.test(btn));
}
ok('a failed read is told apart from a missing row',
  /rows !== null/.test(pageEntry) && /Nothing is lost/.test(pageEntry));
ok('pounds are written by lib/money', pageEntry.includes("from '../../../lib/money'") && /gbp0\(entry\.amount\)/.test(pageEntry));

// 🔴 THE ONE WAY RULE, ON THE NEW SURFACE. Only money out gets the strike-out form, and the
// correction goes through the SAME route with the SAME fields as the month page.
ok('🔴 ONLY MONEY OUT CAN BE STRUCK OUT FROM THE DETAIL VIEW',
  /entry\.amount < 0 \? \(\s*<form action="\/api\/personal" method="post"/.test(pageEntry));
ok('the correction posts the same fields the month page posts',
  /name="id" value=\{entry\.id\}/.test(pageEntry)
  && /name="m" value=\{month\}/.test(pageEntry)
  && /name="personal" value=\{entry\.personal \? 'false' : 'true'\}/.test(pageEntry));
ok('🔴 money in is told it stays put, in words', /Money in stays put/.test(pageEntry));
// ⚠️ THIS ASSERTION USED TO SAY "/api/personal is its only action" AND COUNT ONE FORM. It was
// right when it was written and stopped being right on 2 August 2026, when the detail page became
// the place a man corrects what a large purchase WAS.
//
// The reason it existed is still live and still worth pinning: a detail page that grows its own
// little routes is how a second implementation of a write appears next to the real one. So the
// rule is not "one form", it is "no verbs of its own": every action on this page posts to a route
// that exists in app/api, and the page itself writes nothing.
//
// The car question is three forms and only two of them post. The kind step is a GET back to this
// same page, which is how a two step question works with no client script, and a GET that only
// redraws a page is not a verb.
{
  const actions = [...pageEntry.matchAll(/<(?:form|CarBands)[\s\S]{0,260}?action=(?:"([^"]+)"|\{?'([^']+)'\}?)/g)]
    .map((m) => m[1] ?? m[2]);
  const posts = [...pageEntry.matchAll(/<form action="([^"]+)" method="post"/g)].map((m) => m[1]);
  ok('the detail page still invents no verbs of its own', actions.length > 0
    && actions.every((a) => a === '/api/personal' || a === '/api/money/capital' || a === '/app/entry'));
  ok('🔴 and every POST on it goes to a route that exists',
    posts.length >= 2 && posts.every((a) => ['/api/personal', '/api/money/capital'].includes(a)));
  ok('the kind step is a GET, so choosing "a car" writes nothing until he presses Save',
    /<form action="\/app\/entry" method="get"/.test(pageEntry));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. MANUAL ENTRY. His typing, his press, one insert path.
// ---------------------------------------------------------------------------------------------
ok('the add page posts to the manual route and nowhere else',
  /action="\/api\/money\/manual" method="post"/.test(pageAdd));
ok('both directions are on the form and money out is the default',
  /name="direction" value="out" defaultChecked/.test(pageAdd) && /name="direction" value="in"/.test(pageAdd));
ok('the date defaults to today and cannot be tomorrow',
  /defaultValue=\{today\}/.test(pageAdd) && /max=\{today\}/.test(pageAdd));
ok('🔴 THE CATEGORY LIST HAS ONE HOME', /CATEGORIES\.map/.test(pageAdd) && !/const CATEGORIES\s*=/.test(pageAdd));
ok('🔴 the weight of money in is said BEFORE the press',
  /Money in goes straight into your income figures, and nothing takes it out again\s+quietly/.test(pageAdd));
ok('the page ships no client script',
  !/'use client'|onClick|onChange|useState|<script/.test(pageAdd));
ok('a locked account sees the read only banner, not a form that will be refused',
  /READONLY_TITLE/.test(pageAdd) && /gateForUser/.test(pageAdd));

ok('the route takes the account from the session', /sessionUser\(req\)/.test(routeManual));
ok('🔴 AND NEVER FROM THE REQUEST', !/body\.user|f\.get\(\s*['"]user/i.test(codeOnly(routeManual)));
ok('🔴 the row is written for the session user', /user_id: user\.id/.test(routeManual));
ok('🔴 THE ROUTE NEVER WRITES A ROW ITSELF, IT CALLS insertTransaction',
  routeManual.includes('insertTransaction(') && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(routeManual)));
ok('🔴 the sign follows the direction, through one expression',
  /amount: direction === 'out' \? -magnitude : magnitude/.test(routeManual));
ok('🔴 MONEY IN IS ALWAYS INCOME, WHATEVER THE FORM SAID',
  /direction === 'in' \? 'income'/.test(routeManual));
ok('money out takes a validated category or the honest word other',
  /isCategory\(trimmed\) \? trimmed : 'other'/.test(routeManual));
ok('🔴 the date window is asked of clampReceiptDate, not redeclared',
  /clampReceiptDate\(date\) !== date/.test(routeManual) && routeManual.includes("from '../../../../lib/waintents'"));
ok('his own typing lands confirmed, and the file says why',
  /confirmed: true/.test(routeManual));
ok('it is marked as what it is', /source_type: 'web_manual'/.test(routeManual));
ok('a form caller gets a 303, never JSON',
  /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(routeManual) && !/,\s*302\)/.test(routeManual));
ok('a failed write is refused out loud, not reported as success',
  /problem=unavailable/.test(routeManual));
ok('the amount is bounded and finite before it goes anywhere',
  /Number\.isFinite\(magnitude\)/.test(routeManual) && /magnitude > 1_000_000/.test(routeManual));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE RECEIPT UPLOAD. One ingest walk, in lib/receiptingest.ts, never auto confirmed.
// The route is a DOOR: session, gate, burst, upload validity, budget, and the sentence back.
// Everything that happens to the photograph is the shared walk all three doors call.
// ---------------------------------------------------------------------------------------------
ok('the capture page posts a plain multipart form',
  /action="\/api\/money\/receipt" method="post" encType="multipart\/form-data"/.test(pageCapture));
ok('with a plain file input, straight to a phone\'s camera, and no script',
  /type="file" accept="image\/\*" capture="environment" required/.test(pageCapture)
  && !/'use client'|onClick|onChange|useState|<script/.test(pageCapture));
ok('the page says the truth about what happens next',
  /never straight into your figures/.test(pageCapture)
  && /nothing a machine reads counts until you have said it is right/.test(pageCapture));
ok('and the camera line promises only what every device does',
  /On a phone, the camera opens itself/.test(pageCapture));
ok('an unconfigured build explains itself and draws no button (doc 103 honesty test)',
  /hasClaudeConfig/.test(pageCapture) && /not switched on yet/.test(pageCapture));
ok('a locked account sees the read only banner here too', /READONLY_TITLE/.test(pageCapture));

ok('🔴 THE ROUTE RUNS THE ONE INGEST WALK, AND NO COPY OF ANY PART OF IT',
  routeReceipt.includes("from '../../../../lib/receiptingest'")
  && /await ingestReceiptImage\(\{/.test(routeReceipt)
  && !/parseReceipt\(|insertTransaction\(|mergeIntoTransaction\(|findDuplicate\(/.test(codeOnly(routeReceipt)));
ok('🔴 THE WALK CALLS THE ONE PARSER, IN lib/claude.ts',
  ingest.includes("from './claude'") && /parseReceipt\(base64, mediaType\)/.test(ingest));
ok('🔴 and the one date clamp, in lib/waintents.ts',
  /clampReceiptDate\(parsed\.transaction_date\)/.test(ingest));
ok('🔴 NOTHING IN THE WALK OR THE ROUTE EVER CONFIRMS A ROW',
  /confirmed: false/.test(ingest) && !/confirmed:\s*true/.test(codeOnly(ingest))
  && !/confirmed:\s*true/.test(codeOnly(routeReceipt)));
ok('🔴 a receipt is an expense, stored negative, whichever door it came through',
  /amount: -Math\.abs\(parsed\.amount\)/.test(ingest));
ok('🔴 the bank duplicate check is the same lib composition the webhook now shares outright',
  /recentUnconfirmedForMatch\(userId/.test(ingest)
  && /findDuplicate\(/.test(ingest)
  && /source_type === 'bank_feed'/.test(ingest)
  && /strength === 'same'/.test(ingest));
ok('a confident bank duplicate merges instead of double counting',
  /mergeIntoTransaction\(userId/.test(ingest) && /done=merged/.test(routeReceipt));
ok('🔴 THE SAME RECEIPT SENT TWICE IS REFUSED: no second row, and no silent merge either',
  /r\.source_type === 'web_image' \|\| r\.source_type === 'whatsapp_image'/.test(ingest)
  && /outcome: 'duplicate'/.test(ingest)
  && /done=already/.test(routeReceipt)
  && /I have not added it again/.test(ingest));
ok('🔴 the walk writes through insertTransaction and nothing else, and the route writes nothing',
  ingest.includes('insertTransaction(') && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(ingest))
  && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(routeReceipt)));
ok('the row is written for the session user and marked as what it is',
  /userId: user\.id/.test(routeReceipt) && /sourceType: 'web_image'/.test(routeReceipt)
  && /user_id: userId/.test(ingest));
ok('🔴 AND NEVER FOR A USER THE REQUEST NAMED', !/body\.user|f\.get\(\s*['"]user/i.test(codeOnly(routeReceipt)));
ok('an unreadable total is refused, not filed as a £0 he acts on',
  /parsed\.amount <= 0/.test(ingest) && /problem=unread/.test(routeReceipt));
ok('the AI spend walks the same rings as the webhook: caps, counters, judge',
  /aiCapsFor\(/.test(routeReceipt) && /bumpAiUsage\('global', 'all'\)/.test(routeReceipt) && /decideSpend\(/.test(routeReceipt));
ok('the upload is validated before the budget is spent',
  // Compared on the CALL SITES, not the imports, which sit at the top of every file.
  codeOnly(routeReceipt).indexOf('req.formData()') < codeOnly(routeReceipt).indexOf('await countActiveSubscribers()'));
ok('there is a size ceiling and a type allowlist, and they are the walk\'s own',
  /MAX_RECEIPT_BYTES/.test(routeReceipt) && /RECEIPT_IMAGE_TYPES/.test(routeReceipt)
  && /image\/jpeg/.test(ingest) && /problem=type/.test(routeReceipt) && /problem=big/.test(routeReceipt));
ok('a multipart form caller gets a 303, never JSON',
  /multipart\/form-data/.test(routeReceipt) && /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(routeReceipt));

// ---------------------------------------------------------------------------------------------
// 🔴 5b. THE WALK, STAGED AND RUN. Real dedupe, real vendor keys, recording storage.
// The three verdicts that matter: fold into the bank line, REFUSE the same receipt twice,
// and otherwise land one waiting row. Assertions on what was written, not on prose.
// ---------------------------------------------------------------------------------------------
{
  const iStage = mkdtempSync(path.join(tmpdir(), 'ingest-'));
  // The matcher and the vendor keys go in WHOLE: a stub of the thing under test would be a
  // test of the stub. Both are import free on purpose, which is what makes this possible.
  writeFileSync(path.join(iStage, 'dedupe.ts'), read('lib/dedupe.ts'));
  writeFileSync(path.join(iStage, 'memory.ts'), read('lib/memory.ts'));
  writeFileSync(path.join(iStage, 'waintents.ts'), 'export function clampReceiptDate(d) { return d || "2026-08-05"; }\n');
  writeFileSync(path.join(iStage, 'claude.ts'), [
    'export const state = { parsed: null };',
    'export async function parseReceipt() { return state.parsed; }',
  ].join('\n'));
  writeFileSync(path.join(iStage, 'supabase.ts'), `
export const state = { rows: [], calls: [], insertFails: false, storedPath: 'receipts/u-1/2026-08-05-x.jpg' };
export async function recentUnconfirmedForMatch() { return state.rows; }
export async function insertTransaction(record) {
  state.calls.push({ fn: 'insert', record: { ...record } });
  if (state.insertFails) throw new Error('down');
}
export async function mergeIntoTransaction(userId, id, patch) {
  state.calls.push({ fn: 'merge', userId, id, patch: { ...patch } });
  return true;
}
export async function storeReceiptImage() { return state.storedPath; }
export async function readVatProfile() { return null; }
`);
  writeFileSync(
    path.join(iStage, 'receiptingest.ts'),
    read('lib/receiptingest.ts').replace(/from '\.\/([a-zA-Z]+)'/g, "from './$1.ts'"),
  );
  const I = await import(pathToFileURL(path.join(iStage, 'receiptingest.ts')).href);
  const IDB = await import(pathToFileURL(path.join(iStage, 'supabase.ts')).href);
  const IAI = await import(pathToFileURL(path.join(iStage, 'claude.ts')).href);

  const screwfix = {
    merchant_name: 'Screwfix', amount: 164.78, category: 'materials',
    transaction_type: 'expense', transaction_date: '2026-08-05', vat: null,
  };
  const bankLine = { id: 'b1', vendor: 'SCREWFIX 1234 LONDON', amount: -164.78, transaction_date: '2026-08-05', category: null, source_type: 'bank_feed' };
  const earlierReceipt = { id: 'r1', vendor: 'Screwfix', amount: -164.78, transaction_date: '2026-08-05', category: 'materials', source_type: 'whatsapp_image' };
  const run = async (rows, parsed = screwfix) => {
    IDB.state.rows = rows;
    IDB.state.calls.length = 0;
    IDB.state.insertFails = false;
    IAI.state.parsed = parsed;
    return I.ingestReceiptImage({ userId: 'u-1', bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg', sourceType: 'web_image' });
  };
  const writes = () => IDB.state.calls;

  {
    const r = await run([]);
    const w = writes();
    ok('a fresh receipt lands as ONE waiting row: negative, unconfirmed, marked, with its image',
      r.outcome === 'logged' && w.length === 1 && w[0].fn === 'insert'
      && w[0].record.amount === -164.78 && w[0].record.confirmed === false
      && w[0].record.user_id === 'u-1' && w[0].record.source_type === 'web_image'
      && w[0].record.raw_input_url === 'receipts/u-1/2026-08-05-x.jpg');
    ok('and the caller is handed the figures for its sentence',
      r.merchant === 'Screwfix' && r.amount === 164.78 && r.category === 'materials' && r.date === '2026-08-05');
  }
  {
    const r = await run([bankLine]);
    const w = writes();
    ok('🔴 the bank line the card payment already made is MERGED into, never doubled',
      r.outcome === 'merged' && w.length === 1 && w[0].fn === 'merge' && w[0].id === 'b1'
      && w[0].patch.vendor === 'Screwfix' && w[0].patch.raw_input_url === 'receipts/u-1/2026-08-05-x.jpg');
  }
  {
    const r = await run([earlierReceipt]);
    const w = writes();
    ok('🔴 THE SAME RECEIPT SENT TWICE WRITES NOTHING AT ALL: no insert, no merge, no second row',
      r.outcome === 'duplicate' && w.length === 0);
    ok('and the refusal carries the first row\'s own figures, so the sentence names the receipt he knows',
      r.merchant === 'Screwfix' && r.amount === 164.78 && r.date === '2026-08-05');
    ok('🔴 the refusal sentence itself: honest, specific, and shared by every door',
      I.duplicateReceiptLine(r.merchant, r.amount, r.date)
        === 'Looks like the Screwfix receipt for £164.78 on 5 August, which you already added. I have not added it again.');
  }
  {
    const r = await run([bankLine, earlierReceipt]);
    const w = writes();
    ok('when both exist the BANK line wins: the bank pass runs first and the receipt folds into facts',
      r.outcome === 'merged' && w.length === 1 && w[0].fn === 'merge' && w[0].id === 'b1');
  }
  {
    const r = await run([{ ...earlierReceipt, amount: -84.3 }]);
    ok('a different total at the same shop is a different purchase, and it lands',
      r.outcome === 'logged' && writes().length === 1);
  }
  {
    const r = await run([{ ...earlierReceipt, vendor: '' }]);
    ok('🔴 a MAYBE never refuses: an unreadable shop still lands, because refusing a row we cannot vouch for deletes a real cost',
      r.outcome === 'logged' && writes().length === 1);
  }
  {
    const r = await run([], { ...screwfix, amount: 0 });
    ok('an unreadable total is unread, and nothing is written',
      r.outcome === 'unread' && writes().length === 0);
  }
  {
    IDB.state.rows = [];
    IDB.state.calls.length = 0;
    IAI.state.parsed = screwfix;
    IDB.state.insertFails = true;
    const r = await I.ingestReceiptImage({ userId: 'u-1', bytes: new Uint8Array([1]), mediaType: 'image/jpeg', sourceType: 'web_image' });
    IDB.state.insertFails = false;
    ok('a failed write is admitted as failed, never reported as logged',
      r.outcome === 'failed');
  }
  {
    ok('the spoken day reads like a person: 5 August, not an ISO string',
      I.speakDay('2026-08-05') === '5 August' && I.speakDay('2026-12-25') === '25 December'
      && I.speakDay('garbage') === 'garbage');
  }
}

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE GATE. Both routes have a row, both are the work, both enforce it.
// ---------------------------------------------------------------------------------------------
ok('🔴 app/api/money/manual has a decision and it is entitled', G.ruleFor('app/api/money/manual') === 'entitled');
ok('🔴 app/api/money/receipt has a decision and it is entitled', G.ruleFor('app/api/money/receipt') === 'entitled');
ok('both routes actually consult the gate',
  /gateForUser/.test(routeManual) && /gateForUser/.test(routeReceipt));

// ---------------------------------------------------------------------------------------------
// 7. THE NAV. Both new doors are findable, and the detail view deliberately is not.
// ---------------------------------------------------------------------------------------------
const sections = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
ok('the nav offers the manual entry screen under Money', /href: '\/app\/money\/add'/.test(sections));
ok('the nav offers the receipt screen under Money', /href: '\/app\/money\/capture'/.test(sections));
ok('the detail view is reached from a row, never from the menu', !/\/app\/entry/.test(sections));
ok('the detail page still lights up Money in the nav', /<AppNav current="\/app\/money" \/>/.test(pageEntry));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
