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
  /logFor\(rows \?\? \[\], month\)\.entries\.find/.test(pageEntry));
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
// 🔴 5. THE RECEIPT UPLOAD. One parse path, never auto confirmed.
// ---------------------------------------------------------------------------------------------
ok('the capture page posts a plain multipart form',
  /action="\/api\/money\/receipt" method="post" encType="multipart\/form-data"/.test(pageCapture));
ok('with a plain file input and no script',
  /type="file" accept="image\/\*" required/.test(pageCapture)
  && !/'use client'|onClick|onChange|useState|<script/.test(pageCapture));
ok('the page says the truth about what happens next',
  /never straight into your figures/.test(pageCapture)
  && /nothing a machine reads counts until you have said it is right/.test(pageCapture));
ok('an unconfigured build explains itself and draws no button (doc 103 honesty test)',
  /hasClaudeConfig/.test(pageCapture) && /not switched on yet/.test(pageCapture));
ok('a locked account sees the read only banner here too', /READONLY_TITLE/.test(pageCapture));

ok('🔴 THE ROUTE CALLS THE ONE PARSER, IN lib/claude.ts',
  routeReceipt.includes("from '../../../../lib/claude'") && /parseReceipt\(base64, mediaType\)/.test(routeReceipt));
ok('🔴 and the one date clamp, in lib/waintents.ts',
  /clampReceiptDate\(parsed\.transaction_date\)/.test(routeReceipt));
ok('🔴 NOTHING IN THIS FILE EVER CONFIRMS A ROW',
  /confirmed: false/.test(routeReceipt) && !/confirmed:\s*true/.test(codeOnly(routeReceipt)));
ok('🔴 a receipt is an expense, stored negative, exactly as the webhook stores it',
  /amount: -Math\.abs\(parsed\.amount\)/.test(routeReceipt));
ok('🔴 the duplicate check is the same lib composition the webhook runs',
  /recentUnconfirmedForMatch\(user\.id/.test(routeReceipt)
  && /findDuplicate\(/.test(routeReceipt)
  && /source_type === 'bank_feed'/.test(routeReceipt)
  && /hit\.strength === 'same'/.test(routeReceipt));
ok('a confident duplicate merges instead of double counting',
  /mergeIntoTransaction\(user\.id/.test(routeReceipt) && /done=merged/.test(routeReceipt));
ok('🔴 the route writes through insertTransaction and nothing else',
  routeReceipt.includes('insertTransaction(') && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(routeReceipt)));
ok('the row is written for the session user and marked as what it is',
  /user_id: user\.id/.test(routeReceipt) && /source_type: 'web_image'/.test(routeReceipt));
ok('🔴 AND NEVER FOR A USER THE REQUEST NAMED', !/body\.user|f\.get\(\s*['"]user/i.test(codeOnly(routeReceipt)));
ok('an unreadable total is refused, not filed as a £0 he acts on',
  /parsed\.amount <= 0/.test(routeReceipt) && /problem=unread/.test(routeReceipt));
ok('the AI spend walks the same rings as the webhook: caps, counters, judge',
  /aiCapsFor\(/.test(routeReceipt) && /bumpAiUsage\('global', 'all'\)/.test(routeReceipt) && /decideSpend\(/.test(routeReceipt));
ok('the upload is validated before the budget is spent',
  // Compared on the CALL SITES, not the imports, which sit at the top of every file.
  codeOnly(routeReceipt).indexOf('req.formData()') < codeOnly(routeReceipt).indexOf('await countActiveSubscribers()'));
ok('there is a size ceiling and a type allowlist',
  /MAX_BYTES/.test(routeReceipt) && /image\/jpeg/.test(routeReceipt) && /problem=type/.test(routeReceipt));
ok('a multipart form caller gets a 303, never JSON',
  /multipart\/form-data/.test(routeReceipt) && /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(routeReceipt));

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
