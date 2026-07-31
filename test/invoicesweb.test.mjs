// THE INVOICES SURFACE. Every invoice, one invoice, a new one, proof of income, shared books.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Written against the failures that would ship quietly, in the style of test/moneyweb.test.mjs:
//
//   1. AN ID IN A URL. Every app link to an invoice carries a sealed reference from
//      app/app/invoiceref.ts, and this suite ATTACKS it at runtime: forged, tampered, expired,
//      borrowed by another account, minted under a different secret, minted for a different
//      PURPOSE. Every one must be refused. The public /invoice/[id] link is the one sanctioned
//      exception and belongs to the customer's customer.
//
//   2. A SECOND CREATION PATH. /api/invoices must be another CALLER of createInvoice in
//      lib/supabase.ts, never another copy of the numbering or the write.
//
//   3. LEKHIO SENDING SOMETHING. Nothing on this surface may message, email or chase a
//      customer's customer. The chaser is drafted, rendered, and sent by the tradesman himself
//      or not at all. The share-books link is minted and shown once, never mailed by us.
//
//   4. TWO VOICES FOR ONE MAN. The web chaser's polite and firm drafts must match
//      lib/waintents.ts chaseMessage to the character, run against the real module.
//
//   5. A ROUTE THAT TRUSTS THE BROWSER. Both new routes take the account from the session and
//      only the session, and both have a row in lib/gate.ts.
//
// Run: node test/invoicesweb.test.mjs
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

// Comments stripped before looking for code a file must not contain, moneyweb's own reason:
// these files explain at length why the thing they do not do would be wrong.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// app/app/invoiceref.ts imports only node:crypto, so it stages alone.
function stageInvoiceref(secret) {
  const stage = mkdtempSync(path.join(tmpdir(), 'invoiceref-'));
  writeFileSync(path.join(stage, 'invoiceref.ts'), read('app/app/invoiceref.ts'));
  if (secret === undefined) delete process.env.WEB_SESSION_SECRET;
  else process.env.WEB_SESSION_SECRET = secret;
  return import(pathToFileURL(path.join(stage, 'invoiceref.ts')).href);
}

// app/app/invoices/words.ts imports lib/money extensionless, the same staging fix as moneyweb
// gives entryref its moneylog.
function stageWords() {
  const stage = mkdtempSync(path.join(tmpdir(), 'invoicewords-'));
  writeFileSync(path.join(stage, 'money.ts'), read('lib/money.ts'));
  writeFileSync(
    path.join(stage, 'words.ts'),
    read('app/app/invoices/words.ts').replace("from '../../../lib/money'", "from './money.ts'"),
  );
  return import(pathToFileURL(path.join(stage, 'words.ts')).href);
}

// lib/waintents.ts is pure and import free, so the REAL chaser voice is on the bench.
function stageWaintents() {
  const stage = mkdtempSync(path.join(tmpdir(), 'waintents-'));
  writeFileSync(path.join(stage, 'waintents.ts'), read('lib/waintents.ts'));
  return import(pathToFileURL(path.join(stage, 'waintents.ts')).href);
}

const pageList = read('app/app/invoices/page.tsx');
const pageNew = read('app/app/invoices/new/page.tsx');
const pageDetail = read('app/app/invoice/page.tsx');
const pageProof = read('app/app/proof-of-income/page.tsx');
const pageShare = read('app/app/share-books/page.tsx');
const routeInvoices = read('app/api/invoices/route.ts');
const routeShare = read('app/api/share-books/route.ts');
const routeShareJson = read('app/api/share/route.ts');
const nav = read('app/app/AppNav.tsx');
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);

console.log('\ninvoices on the web: listed, opened, made, chased, proved and shared');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SEALED REFERENCE, ATTACKED AT RUNTIME.
// ---------------------------------------------------------------------------------------------
{
  const off = await stageInvoiceref(undefined);
  ok('with no secret, no reference is ever minted', off.invoiceRef('a', '11111111-1111-4111-8111-111111111111', 'invoice') === '');
  ok('with no secret, nothing verifies', off.verifyInvoiceRef('x.y.z') === null);
  ok('and the module says plainly that it is off', off.invoiceRefsConfigured() === false);
}

const SECRET = 'a-test-secret-long-enough-to-clear-the-32-byte-bar';
const R = await stageInvoiceref(SECRET);
const OWNER = '9c1b2a3d-0000-4000-8000-00000000aaaa';
const INTRUDER = '9c1b2a3d-0000-4000-8000-00000000bbbb';
const ROW = '5e6f7a8b-1111-4111-8111-222222222222';

{
  const ref = R.invoiceRef(OWNER, ROW, 'invoice');
  ok('a reference round trips', (() => {
    const c = R.verifyInvoiceRef(ref);
    return c !== null && c.owner === OWNER && c.row === ROW && c.kind === 'invoice';
  })());

  ok('🔴 the reference does not contain the row id', !ref.includes(ROW) && !ref.includes(ROW.replace(/-/g, '')));
  ok('🔴 nor the owner', !ref.includes(OWNER));
  ok('two references to the same row never look alike', ref !== R.invoiceRef(OWNER, ROW, 'invoice'));

  // 🔴 THE TENANCY ATTACK. A perfectly valid reference in another man's session must be refused.
  const claim = R.verifyInvoiceRef(ref);
  ok('🔴 A VALID REFERENCE IN ANOTHER MAN\'S SESSION IS REFUSED', R.invoiceRefUsable(claim, INTRUDER, 'invoice') === false);
  ok('and honoured only in the session it was minted for', R.invoiceRefUsable(claim, OWNER, 'invoice') === true);
  ok('an empty session owner is refused too', R.invoiceRefUsable(claim, '', 'invoice') === false);
  ok('a null claim is usable by nobody', R.invoiceRefUsable(null, OWNER, 'invoice') === false);

  // 🔴 THE PURPOSE ATTACK. A share reference replayed at the invoice page, and the reverse.
  const shareRef = R.invoiceRef(OWNER, ROW, 'share');
  const shareClaim = R.verifyInvoiceRef(shareRef);
  ok('a share reference verifies as what it is', shareClaim !== null && shareClaim.kind === 'share');
  ok('🔴 A SHARE REFERENCE CANNOT OPEN THE INVOICE PAGE', R.invoiceRefUsable(shareClaim, OWNER, 'invoice') === false);
  ok('🔴 AND AN INVOICE REFERENCE CANNOT SHOW A BOOKS LINK', R.invoiceRefUsable(claim, OWNER, 'share') === false);

  // Tampering, flipped in the middle of the ciphertext for moneyweb's stated reason.
  const mid = ref.lastIndexOf('.') + 3;
  const bent = ref.slice(0, mid) + (ref[mid] === 'A' ? 'B' : 'A') + ref.slice(mid + 1);
  ok('🔴 one flipped character is refused', R.verifyInvoiceRef(bent) === null);

  // Forgery: right shape, wrong key.
  const forged = [crypto.randomBytes(12), crypto.randomBytes(16), Buffer.from(JSON.stringify({ o: INTRUDER, r: ROW, k: 'invoice', exp: 9999999999 }))]
    .map((b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .join('.');
  ok('🔴 a forged reference with the right shape and the wrong key is refused', R.verifyInvoiceRef(forged) === null);

  const other = await stageInvoiceref('a-completely-different-secret-also-long-enough');
  ok('a reference from a rotated secret is refused, not honoured', other.verifyInvoiceRef(ref) === null);
  process.env.WEB_SESSION_SECRET = SECRET;

  // Expiry, per kind: four hours for an invoice, fifteen minutes for the once-shown books link.
  const in16min = new Date(Date.now() + 16 * 60 * 1000);
  const past4h = new Date(Date.now() + (R.INVOICE_REF_TTL_SECONDS + 60) * 1000);
  ok('an invoice reference outlives lunch', R.verifyInvoiceRef(ref, in16min) !== null);
  ok('but not the day', R.verifyInvoiceRef(ref, past4h) === null);
  ok('🔴 A BOOKS LINK REFERENCE IS DEAD IN A QUARTER OF AN HOUR', R.verifyInvoiceRef(shareRef, in16min) === null);
  ok('and live inside it', R.verifyInvoiceRef(shareRef, new Date(Date.now() + 10 * 60 * 1000)) !== null);

  // Shapes on the way in.
  ok('a non uuid row mints nothing', R.invoiceRef(OWNER, 'DROP TABLE invoices', 'invoice') === '');
  ok('an unknown kind mints nothing', R.invoiceRef(OWNER, ROW, 'books') === '');
  ok('an empty owner mints nothing', R.invoiceRef('', ROW, 'invoice') === '');
  ok('garbage does not verify', R.verifyInvoiceRef('not-even-close') === null && R.verifyInvoiceRef('') === null && R.verifyInvoiceRef(null) === null);
}

// ---------------------------------------------------------------------------------------------
// 2. THE WORDS. Shape checked rows, plain word ages, status first ordering.
// ---------------------------------------------------------------------------------------------
const W = await stageWords();
const TODAY = '2026-07-30';
const mk = (over) => ({
  id: ROW, number: 'INV-0001', customer: 'Dave', total: 450,
  status: 'draft', issued: '2026-07-01', due: '2026-07-15', ...over,
});

{
  const row = W.normaliseInvoiceRow({
    id: ROW, number: 'INV-0002', customer_name: ' Dave ', total: '450.5',
    status: 'sent', issued_date: '2026-07-01T00:00:00Z', due_date: '2026-07-15',
  });
  ok('a real row normalises, trimmed and typed', row !== null && row.customer === 'Dave' && row.total === 450.5 && row.issued === '2026-07-01');
  ok('a row with no uuid id is dropped, not guessed at', W.normaliseInvoiceRow({ id: '17', total: 10 }) === null);
  ok('a row with an unreadable total is dropped', W.normaliseInvoiceRow({ id: ROW, total: 'a lot' }) === null);
  ok('garbage is dropped', W.normaliseInvoiceRow(null) === null && W.normaliseInvoiceRow('x') === null);
}

{
  ok('the due date is the reference when set', W.referenceDate(mk({})) === '2026-07-15');
  ok('fourteen days from issue when not, the WhatsApp chaser\'s own judgement',
    W.referenceDate(mk({ due: null })) === '2026-07-15');
  ok('paid is paid whatever the dates say', W.invoiceState(mk({ status: 'paid' }), TODAY) === 'paid');
  ok('past the reference date is late', W.invoiceState(mk({}), TODAY) === 'late');
  ok('and the lateness is counted from it', W.daysLate(mk({}), TODAY) === 15);
  ok('before the reference date is waiting', W.invoiceState(mk({ due: '2026-08-10' }), TODAY) === 'waiting');
}

{
  ok('one day is "a day late"', W.lateWords(1) === 'a day late');
  ok('three days in words', W.lateWords(3) === 'three days late');
  ok('a week, rounded like a person rounds', W.lateWords(8) === 'a week late');
  ok('🔴 twenty one days is "three weeks late", never a date dump', W.lateWords(21) === 'three weeks late');
  ok('two months', W.lateWords(61) === 'two months late');
  ok('and past a year it stops counting', W.lateWords(400) === 'over a year late');
  ok('due words: today, tomorrow, five days, two weeks',
    W.dueWords(0) === 'due today' && W.dueWords(1) === 'due tomorrow'
    && W.dueWords(5) === 'due in five days' && W.dueWords(14) === 'due in two weeks');
  ok('a paid row reads "Paid"', W.statusWords(mk({ status: 'paid' }), TODAY) === 'Paid');
  ok('a late row reads in weeks', W.statusWords(mk({}), TODAY) === 'two weeks late');
}

{
  const rows = [
    mk({ id: '11111111-1111-4111-8111-111111111111', status: 'paid', issued: '2026-07-20' }),
    mk({ id: '22222222-2222-4222-8222-222222222222', due: '2026-08-10' }),            // waiting, later
    mk({ id: '33333333-3333-4333-8333-333333333333', due: '2026-07-01' }),            // late 29 days
    mk({ id: '44444444-4444-4444-8444-444444444444', due: '2026-07-25' }),            // late 5 days
    mk({ id: '55555555-5555-4555-8555-555555555555', due: '2026-08-01' }),            // waiting, sooner
  ];
  const order = W.sortInvoices(rows, TODAY).map((r) => r.id[0]);
  ok('🔴 STATUS FIRST: most late, less late, soonest due, later due, paid last', order.join('') === '34521');
}

{
  ok('nothing owed, nothing said (the empty test)',
    W.owedLine([mk({ status: 'paid' })], TODAY) === null);
  ok('owed and none late says so',
    W.owedLine([mk({ due: '2026-08-10' })], TODAY) === '£450 is owed to you, and none of it is late.');
  ok('owed and all late says so',
    W.owedLine([mk({})], TODAY) === '£450 is owed to you, and all of it is late.');
  ok('owed and some late names both figures',
    W.owedLine([mk({}), mk({ id: '66666666-6666-4666-8666-666666666666', due: '2026-08-10', total: 100 })], TODAY)
    === '£550 is owed to you, and £450 of it is late.');
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE CHASER. One man, one voice, three firmnesses, and Lekhio sends none of them.
// ---------------------------------------------------------------------------------------------
const WA = await stageWaintents();
{
  const ctx = { customer: 'Dave', number: 'INV-0012', total: 450, daysSinceIssued: 6, daysLate: 45, link: 'https://x/invoice/1' };

  ok('🔴 THE POLITE DRAFT IS chaseMessage\'S OWN VOICE, TO THE CHARACTER',
    W.chaserDraft('polite', ctx) === WA.chaseMessage('Dave', 'INV-0012', 450, 6, 'https://x/invoice/1'));
  ok('🔴 AND SO IS THE FIRM ONE',
    W.chaserDraft('firm', ctx) === WA.chaseMessage('Dave', 'INV-0012', 450, 45, 'https://x/invoice/1'));

  const final = W.chaserDraft('final', ctx);
  ok('the final notice is its own, firmer step', final !== W.chaserDraft('firm', ctx) && final.includes('final reminder'));
  ok('it gives a deadline in days, not a threat', final.includes('seven days') && !/court|legal|solicitor|debt collect/i.test(final));
  ok('every draft carries the number, the money and the link', ['polite', 'firm', 'final'].every((t) => {
    const d = W.chaserDraft(t, ctx);
    return d.includes('INV-0012') && d.includes('£450') && d.includes('https://x/invoice/1');
  }));
  ok('a nameless customer is greeted, not blanked', W.chaserDraft('polite', { ...ctx, customer: ' ' }).startsWith('Hi there,'));
  ok('a single day reads "a day", never "1 days"',
    W.chaserDraft('firm', { ...ctx, daysLate: 1 }).includes('now a day outstanding'));
  ok('no draft carries a forbidden dash', ['polite', 'firm', 'final'].every((t) => !/[—–]/.test(W.chaserDraft(t, ctx))));
  ok('the tones are exactly the three on offer',
    W.CHASER_TONES.map((t) => t.tone).join(',') === 'polite,firm,final'
    && W.isChaserTone('firm') === true && W.isChaserTone('rude') === false);
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE LIST. Session first, sealed links, an honest empty state.
// ---------------------------------------------------------------------------------------------
ok('the list resolves the session and sends a stranger to the door',
  pageList.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageList));
ok('🔴 the read is scoped to the session user and only the session user',
  /exportUserData\(user\.id, null\)/.test(pageList));
ok('🔴 every row link carries a sealed reference minted for THIS session',
  /invoiceRef\(user\.id, inv\.id, 'invoice'\)/.test(pageList)
  && /href=\{`\/app\/invoice\?ref=\$\{encodeURIComponent\(ref\)\}`\}/.test(pageList));
ok('🔴 no row id is ever written into a URL on the list',
  !/href=\{`[^`]*\$\{inv\.id\}/.test(codeOnly(pageList)));
ok('with no secret the row stays plain text rather than becoming a dead link',
  /\{ref \? \(/.test(pageList));
ok('a failed read is told apart from an empty book',
  /data\.user !== null/.test(pageList) && /Nothing is lost/.test(pageList));
ok('🔴 the empty state is one honest line and the way to make one',
  /You have not made an invoice yet\./.test(pageList) && /href="\/app\/invoices\/new"/.test(pageList));
ok('ages come from the words module, never a raw date on screen',
  /statusWords\(inv, todayISO\)/.test(pageList) && !/issued_date|due_date/.test(codeOnly(pageList)));
ok('the owed line obeys the empty test', /\{owed \? <p style=\{S\.owed\}>\{owed\}<\/p> : null\}/.test(pageList));
ok('pounds are written by lib/money', pageList.includes("from '../../../lib/money'") && /gbp2\(inv\.total\)/.test(pageList));
ok('the list ships no client script', !/'use client'|onClick|onChange|useState|<script/.test(pageList));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE DETAIL VIEW. Reference checked for owner AND purpose, and nothing is ever sent.
// ---------------------------------------------------------------------------------------------
ok('the detail page resolves the session and sends a stranger to the door',
  pageDetail.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageDetail));
ok('🔴 the reference is verified, owner checked AND purpose checked, before anything is read',
  /verifyInvoiceRef\(one\('ref'\)/.test(pageDetail)
  && /if \(!claim \|\| !invoiceRefUsable\(claim, user\.id, 'invoice'\)\) redirect\('\/app\/invoices'\)/.test(pageDetail));
ok('the row is read through getPublicInvoice, the one one-invoice read in lib',
  /getPublicInvoice\(row\)/.test(pageDetail) && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(pageDetail)));
ok('🔴 NOTHING ON THE DETAIL PAGE POSTS, SENDS OR MUTATES: no form exists at all',
  !/<form/.test(pageDetail));
ok('🔴 the share step hands HIM the link: WhatsApp share sheet and a mail compose, never a send by us',
  /wa\.me\/\?text=/.test(pageDetail) && /mailto:/.test(pageDetail)
  && !/sendText|sendInvoiceEmail|sendEmail/.test(pageDetail));
ok('the public link is built from siteBase(), never a hardcoded domain',
  /siteBase\(\)\}\/invoice\//.test(pageDetail) && !/lekhio\.app/.test(pageDetail));
ok('🔴 the chaser appears only when the invoice is actually late',
  /\{late > 0 \? \(/.test(pageDetail));
ok('the firmness is his choice, three links and no script',
  /CHASER_TONES\.map/.test(pageDetail) && /tone=\$\{t\.tone\}/.test(pageDetail));
ok('the drafts come from the words module, deterministic, no AI call',
  /chaserDraft\(tone,/.test(pageDetail) && !/draftInvoice|anthropic|claude/i.test(codeOnly(pageDetail)));
ok('and the page says plainly that we never message his customer',
  /We never message your customer\./.test(pageDetail));
ok('a paid invoice offers no chase and says why', /Paid\. Nothing to chase\./.test(pageDetail));
ok('the detail page ships no client script', !/'use client'|onClick|onChange|useState|<script/.test(pageDetail));
ok('money is written by lib/money', pageDetail.includes("from '../../../lib/money'") && /gbp2\(/.test(pageDetail));

// ---------------------------------------------------------------------------------------------
// 🔴 6. MAKING ONE. The existing creation path, reused exactly, and the share step is his.
// ---------------------------------------------------------------------------------------------
ok('the new page posts to /api/invoices and nowhere else',
  /action="\/api\/invoices" method="post"/.test(pageNew)
  && (pageNew.match(/<form action="/g) || []).length === 2 // the form, and the locked state's checkout button
  && /action="\/api\/billing\/checkout"/.test(pageNew));
ok('a locked account sees the read only banner, not a form that will be refused',
  /READONLY_TITLE/.test(pageNew) && /gateForUser/.test(pageNew));
ok('the first line is required and the spares are spares',
  /required=\{i === 0\}/.test(pageNew));
ok('🔴 the weight is said BEFORE the press: nothing goes to his customer',
  /Nothing goes to your customer/.test(pageNew) && /sending it is yours to do/.test(pageNew));
ok('and the contact field says what it is not', /We never contact your customer\./.test(pageNew));
ok('the new page ships no client script', !/'use client'|onClick|onChange|useState|<script/.test(pageNew));

ok('the route takes the account from the session', /sessionUser\(req\)/.test(routeInvoices));
ok('🔴 AND NEVER FROM THE REQUEST', !/body\.user\b|f\.get\(\s*['"]user/i.test(codeOnly(routeInvoices)));
ok('🔴 THE ROUTE NEVER WRITES A ROW ITSELF, IT CALLS createInvoice',
  routeInvoices.includes('createInvoice(') && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(routeInvoices)));
ok('🔴 the invoice is created for the session user', /createInvoice\(user\.id,/.test(routeInvoices));
ok('🔴 a half typed line is refused, never dropped',
  /problem=line/.test(routeInvoices) && /if \(!description \|\| !Number\.isFinite\(amount\)/.test(routeInvoices));
ok('the amount is read exactly as /api/money/manual reads one',
  /Math\.round\(Number\(amountRaw\.replace\(\/\[,\\s\]\/g, ''\)\) \* 100\) \/ 100/.test(routeInvoices));
ok('🔴 NO EMAIL, NO MESSAGE, NO CONTACT WITH HIS CUSTOMER FROM THIS ROUTE',
  !/sendInvoiceEmail|sendText|sendEmail|resend/i.test(codeOnly(routeInvoices)));
ok('🔴 the redirect onward carries a sealed reference, never the new row id',
  /invoiceRef\(user\.id, inv\.id, 'invoice'\)/.test(routeInvoices)
  && /\/app\/invoice\?ref=\$\{encodeURIComponent\(ref\)\}/.test(routeInvoices)
  && !/redirect\([^)]*\$\{inv\.id\}/.test(codeOnly(routeInvoices)));
ok('a form caller gets a 303, never JSON',
  /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(routeInvoices) && !/,\s*302\)/.test(routeInvoices));
ok('a failed write is refused out loud, not reported as success', /problem=unavailable/.test(routeInvoices));
ok('the work is rate limited per account', /rateLimitedShared\(`invoices:\$\{user\.id\}`/.test(routeInvoices));
ok('🔴 app/api/invoices has a gate decision and it is entitled', G.ruleFor('app/api/invoices') === 'entitled');
ok('and the route actually consults the gate', /gateForUser/.test(routeInvoices) && /refuseUnentitled/.test(routeInvoices));

// ---------------------------------------------------------------------------------------------
// 🔴 7. PROOF OF INCOME. lib/incomeproof's figures, printable, honest about what it is not.
// ---------------------------------------------------------------------------------------------
ok('the proof resolves the session and sends a stranger to the door',
  pageProof.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageProof));
ok('🔴 every figure comes from buildIncomeProof over the session user\'s confirmed rows',
  /getConfirmedTransactionsForRange\(user\.id, startISO, endISO\)/.test(pageProof)
  && /buildIncomeProof\(rows, businessName, year, now\)/.test(pageProof));
ok('🔴 the page computes no figure of its own',
  !/income\s*\+|expenses\s*\+|\+=|profit\s*=/.test(codeOnly(pageProof)));
ok('🔴 there is a print stylesheet in the page\'s own style block',
  /@media print/.test(pageProof) && /lek-noprint/.test(pageProof));
ok('what lands on paper is the document alone: nav and controls are stripped',
  /className="lek-noprint"[\s\S]{0,80}AppNav/.test(pageProof));
ok('🔴 it says what it is NOT, for the lender holding it',
  /not an HMRC document, an SA302,\s*\n?\s*or a filed tax return/.test(pageProof));
ok('🔴 an empty year gets an honest sentence, never a page of zeros',
  /proof\.txCount === 0/.test(pageProof) && /would tell a lender something false/.test(pageProof));
ok('pence are shown, because this is a document: gbp2 from lib/money',
  pageProof.includes("from '../../../lib/money'") && /gbp2\(proof\./.test(pageProof));
ok('printing is the browser\'s own menu: no script, no onclick button',
  !/'use client'|onClick|onclick|useState|<script/.test(pageProof));
ok('the year switch offers this year and last, nothing to explore', /thisYear, thisYear - 1/.test(pageProof));

// ---------------------------------------------------------------------------------------------
// 🔴 8. SHARE YOUR BOOKS. Prepared here, approved and sent by him, revocable in one press.
// ---------------------------------------------------------------------------------------------
ok('the share page resolves the session and sends a stranger to the door',
  pageShare.includes('userFromSessionCookie') && /redirect\('\/in'\)/.test(pageShare));
ok('the shares and the categories are read for the session user',
  /listBookShares\(user\.id\)/.test(pageShare) && /getConfirmedTransactionsForUser\(user\.id\)/.test(pageShare));
ok('🔴 the exclude list is his own real categories via lib/bookshare, never a guessed list',
  /categoriesIn\(rows\)/.test(pageShare));
ok('🔴 the fresh link is shown ONLY behind the sealed short lived reference, owner and purpose checked',
  /verifyInvoiceRef\(one\('made'\)/.test(pageShare)
  && /invoiceRefUsable\(madeClaim, user\.id, 'share'\)/.test(pageShare));
ok('and re-derived only from HIS OWN list of shares',
  /shares\.find\(\(s\) => s\.id === madeClaim\.row\)/.test(pageShare));
ok('🔴 the page says the link is shown once, and that we send nothing',
  /the only time we show it/.test(pageShare) && /We do not send it/.test(pageShare));
ok('the recipient email field is a note for him, never a send target',
  /We never email them\./.test(pageShare));
ok('a live grant carries the kill switch, a dead one does not',
  /state === 'ok' \? \(\s*<form action="\/api\/share-books"/.test(pageShare)
  && /name="action" value="revoke"/.test(pageShare));
ok('the grant state comes from lib/bookshare, not a second judgement', /grantState\(s, now\)/.test(pageShare));
ok('an unconfigured build says so and draws no form (doc 103 honesty test)',
  /not switched on in this build/.test(pageShare) && /\{!configured \? \(/.test(pageShare));
ok('the share page ships no client script', !/'use client'|onClick|onChange|useState|<script/.test(pageShare));

ok('the form route takes the account from the session', /sessionUser\(req\)/.test(routeShare));
ok('🔴 the grant is created for the session user through lib machinery',
  /createBookShare\(\s*user\.id,/.test(routeShare) && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(routeShare)));
ok('🔴 A REVOKE CAN ONLY EVER KILL HIS OWN GRANT', /revokeBookShare\(user\.id, id\)/.test(routeShare));
ok('🔴 the scope fails closed: no readable date range, nothing shared',
  /normaliseScope\(/.test(routeShare) && /if \(!scope\.fromDate\) return back\('problem=bad'\)/.test(routeShare));
ok('🔴 the two share doors spend ONE rate limit budget',
  /rateLimitedShared\(`share:\$\{user\.id\}`/.test(routeShare)
  && /rateLimitedShared\(`share:\$\{user\.id\}`/.test(routeShareJson));
ok('🔴 NOTHING IS EMAILED OR MESSAGED BY THIS ROUTE EITHER',
  !/sendText|sendEmail|sendInvoiceEmail|resend/i.test(codeOnly(routeShare)));
ok('the redirect carries the sealed reference, never the grant id',
  /invoiceRef\(user\.id, share\.id, 'share'\)/.test(routeShare)
  && !/made=\$\{share\.id\}/.test(codeOnly(routeShare)));
ok('a form caller gets a 303, never JSON', /,\s*303\)/.test(routeShare) && !/,\s*302\)/.test(routeShare));
ok('🔴 app/api/share-books has a gate decision and it is always, his records being his',
  G.ruleFor('app/api/share-books') === 'always');

// ---------------------------------------------------------------------------------------------
// 9. THE NAV, AND THE HOUSE RULES ACROSS THE WHOLE SURFACE.
// ---------------------------------------------------------------------------------------------
const sections = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
ok('the nav has an Invoices section with all four doors',
  /label: 'Invoices'/.test(sections)
  && /href: '\/app\/invoices'/.test(sections)
  && /href: '\/app\/invoices\/new'/.test(sections)
  && /href: '\/app\/proof-of-income'/.test(sections)
  && /href: '\/app\/share-books'/.test(sections));
ok('the detail view is reached from a row, never from the menu', !/'\/app\/invoice'/.test(sections));
ok('the detail page still lights up Invoices in the nav', /<AppNav current="\/app\/invoices" \/>/.test(pageDetail));

for (const [name, src] of [
  ['list', pageList], ['detail', pageDetail], ['new', pageNew], ['proof', pageProof],
  ['share page', pageShare], ['invoices route', routeInvoices], ['share route', routeShare],
]) {
  ok(`${name}: no em or en dash anywhere in it`, !/[—–]/.test(src));
  ok(`${name}: never writes the rival domain`, !/lekhio\.com/.test(src));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
