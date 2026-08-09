// A CUSTOMER WRITES HIS OWN REVIEW, AND WHOSE NAME ENDS UP UNDER IT.
//
//   node test/owntestimonial.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT: A TESTIMONIAL NOBODY COULD TAKE DOWN, BECAUSE NOTHING REMEMBERED IT WAS HIS.
//
// Until 9 August 2026 a testimonial could only be typed in at /team, into a table whose only
// identity column was created_by: the TEAM MEMBER who entered it. So a customer's name and his
// words sat on the public homepage and there was no request he could make that would remove them,
// because after the typing there was nothing in the database that knew whose they were. The GDPR
// erasure walked straight past them, and the erasure is a legal duty rather than a courtesy.
//
// The obvious fix was a "customer email" box on the console. Jag's is better: HE writes it, from
// inside his own account, so the user id is on the row BY CONSTRUCTION rather than because
// somebody remembered to paste an address.
//
// 🔴 THIS RATCHET GUARDS SIX FAILURES, AND THE FIRST TWO ARE THE ONES THAT MATTER.
//
//   1. THE NAME COMES BACK OFF THE FORM. A name in a request body is a name he CHOSE, not one he
//      HAS. Any account could then publish a quote signed as somebody else, and an invented
//      testimonial is banned outright by CAP 3.47 and the DMCC Act 2024. Two booleans in, and the
//      server reads his own row.
//   2. HE CAN PUBLISH HIMSELF. published must be forced false on this path or the homepage of
//      lekhio.app is a text box anyone with an account can type into.
//   3. THE SWITCHES SHIP PRE-TICKED. A pre-ticked consent box is not consent: Recital 32, and
//      Planet49 (C-673/17) says so in terms. Putting a man's name on the open web needs a positive
//      act, so both boxes arrive off and he throws them.
//   4. A FAILED READ OF HIS DETAILS FILES HIM ANONYMOUSLY. He ticks his name, the preview shows
//      his name, the users read wobbles, and the row says "Lekhio user". It refuses instead.
//   5. THE PREVIEW AND THE ROW STOP AGREEING. Both run testimonialByline. Two copies of one rule
//      drift, and the drift is invisible until it is on the homepage.
//   6. THE CONSOLE'S COPY OF 'customer' DRIFTS FROM THE WRITER'S. The console is a client bundle
//      and cannot import from lib/supabase, so the literal is duplicated. A filter on a literal
//      that has drifted shows NOTHING WAITING, which reads exactly like nobody having written one,
//      and a man's review sits unread for weeks.
//
// ⚠️ THE BEHAVIOURAL ARM RUNS writeOwnTestimonial AGAINST A STUBBED TRANSPORT and reads the body
// it actually posted. A source scan alone passes on a rule that is written and never reached.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ── Stage lib/*.ts into a tmpdir so node's type stripping can import it. Same trick as the other
//    suites: extensionless relative imports are rewritten to .ts. ────────────────────────────────
const stage = mkdtempSync(path.join(tmpdir(), 'lekhio-testimonial-'));
for (const f of readdirSync(path.join(repoRoot, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  const src = readFileSync(path.join(repoRoot, 'lib', f), 'utf8');
  writeFileSync(
    path.join(stage, f),
    src.replace(/from '(\.\/[^']+?)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`)),
  );
}

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

const USER_ID = '11111111-2222-3333-4444-555555555555';

// A transport that answers the users read with whatever card the case wants, records every write,
// and can be told to fail the users read outright.
async function withFetch({ card = { name: 'Dave Sharma', business_name: 'Sharma Electrical', trade_type: 'electrician' }, failCard = false }, run) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, body: init.body ?? null });
    if (u.includes('/rest/v1/users?')) {
      if (failCard) return new Response('boom', { status: 500 });
      return new Response(JSON.stringify([card]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    // ⚠️ 200 AND NOT 204. `new Response('', { status: 204 })` THROWS in undici, because 204 is a
    // null body status, and the throw is swallowed by the writer's own catch: the write then
    // reports false and the failure reads as a bug in the code under test rather than in the stub.
    return new Response('', { status: 200 });
  };
  try {
    const result = await run();
    return { calls, result };
  } finally {
    globalThis.fetch = real;
  }
}

const posted = (calls) => {
  const c = calls.find((x) => x.method === 'POST' && x.url.endsWith('/rest/v1/testimonials'));
  return c ? JSON.parse(c.body) : null;
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe by-line is one function, so the preview cannot promise what the row will not carry.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const card = { name: 'Dave Sharma', businessName: 'Sharma Electrical', trade: 'electrician', phone: null, phoneVerifiedAt: null };

  ok('both off gives the anonymous by-line and no trade',
    JSON.stringify(SB.testimonialByline(card, false, false)) === JSON.stringify({ name: SB.TESTIMONIAL_ANON, trade: '' }));
  ok('name on gives his name',
    SB.testimonialByline(card, true, false).name === 'Dave Sharma');
  ok('trade on gives his trade',
    SB.testimonialByline(card, false, true).trade === 'electrician');
  ok('the business name is the fallback when we hold no trade',
    SB.testimonialByline({ ...card, trade: null }, false, true).trade === 'Sharma Electrical');
  ok('🔴 A NAME WE DO NOT HOLD IS THE ANONYMOUS ONE, never an empty by-line and never an invented one',
    SB.testimonialByline({ ...card, name: null }, true, false).name === SB.TESTIMONIAL_ANON
    && SB.testimonialByline({ ...card, name: '   ' }, true, false).name === SB.TESTIMONIAL_ANON);
  ok('a null card is safe to render, which is what lets the page ask before it knows',
    SB.testimonialByline(null, true, true).name === SB.TESTIMONIAL_ANON
    && SB.testimonialByline(null, true, true).trade === '');
  ok('the anonymous word identifies nobody and names the product',
    /^Lekhio/.test(SB.TESTIMONIAL_ANON) && !/\d/.test(SB.TESTIMONIAL_ANON));

  // ⚠️ HIDING THE TRADE MUST PRODUCE AN EMPTY STRING AND NOT A SPACE OR A COMMA. app/page.tsx
  // renders it into a bare <small>, so empty draws nothing and anything else draws a stray mark
  // under a man's name on the front door.
  ok('🔴 A HIDDEN TRADE IS EXACTLY EMPTY, because the homepage prints it into a bare element',
    SB.testimonialByline(card, true, false).trade === '');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nWhat actually reaches the database.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const { calls, result } = await withFetch({}, () =>
    SB.writeOwnTestimonial(USER_ID, { quote: 'It does my books off a photo.', rating: 5, showName: true, showTrade: true }));
  const row = posted(calls);
  ok('the write reports success', result === true);
  ok('a row was posted to testimonials', row !== null);
  ok('🔴 IT IS NOT PUBLISHED. He cannot put himself on the homepage.', row.published === false);
  ok('🔴 THE ROW CARRIES HIS user_id, which is the whole reason an erasure can now reach it',
    row.user_id === USER_ID);
  ok('and created_by is him as well, which is what makes the row honest under CAP 3.47',
    row.created_by === USER_ID);
  ok('the source marks it as his own words', row.source === SB.TESTIMONIAL_FROM_CUSTOMER);
  ok('the name was read off his row, not taken from the caller', row.name === 'Dave Sharma');
  ok('so was the trade', row.trade === 'electrician');
  ok('his words are his words', row.quote === 'It does my books off a photo.');

  // ⚠️ REPLACE, NOT ACCUMULATE. A wall of quotes from one man is a comments section, and it gives
  // an erasure more to miss.
  const del = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/testimonials'));
  ok('🔴 HIS PREVIOUS ONE IS CLEARED FIRST, so there is only ever one of him', del.length === 1);
  ok('and that delete is scoped to him by user_id', del[0].url.includes(`user_id=eq.${USER_ID}`));
  const iDel = calls.indexOf(del[0]);
  const iPost = calls.findIndex((c) => c.method === 'POST' && c.url.endsWith('/rest/v1/testimonials'));
  ok('the clear happens BEFORE the insert, or it deletes the one it just wrote',
    iDel >= 0 && iPost >= 0 && iDel < iPost);
}
{
  const { calls } = await withFetch({}, () =>
    SB.writeOwnTestimonial(USER_ID, { quote: 'Worth it.', rating: 4, showName: false, showTrade: false }));
  const row = posted(calls);
  ok('🔴 SWITCHES OFF PUTS NO NAME OF HIS ON THE ROW AT ALL', row.name === SB.TESTIMONIAL_ANON);
  ok('and no trade', row.trade === '');
  ok('⚠️ AND HIS ROW IS NOT EVEN READ, because nothing about him was needed',
    !calls.some((c) => c.url.includes('/rest/v1/users?')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nA read we could not make must not become a quiet answer about him.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const { calls, result } = await withFetch({ failCard: true }, () =>
    SB.writeOwnTestimonial(USER_ID, { quote: 'Good.', rating: 5, showName: true, showTrade: false }));
  ok('🔴 AN UNREADABLE CARD REFUSES THE SAVE rather than filing him as somebody anonymous',
    result === false);
  ok('and nothing was written, so his old review is untouched', posted(calls) === null);
  ok('not even the clearing delete ran',
    !calls.some((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/testimonials')));
}
{
  // The other side of the same rule: he asked for neither, so the card was never needed and a
  // database we cannot read about him is not a reason to refuse his words.
  const { result } = await withFetch({ failCard: true }, () =>
    SB.writeOwnTestimonial(USER_ID, { quote: 'Good.', rating: 5, showName: false, showTrade: false }));
  ok('but an anonymous review still saves, because nothing about him was being read', result === true);
}
{
  const { result } = await withFetch({}, () => SB.writeOwnTestimonial('', { quote: 'x', rating: 5, showName: false, showTrade: false }));
  ok('no session, no write', result === false);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe door: two booleans in, and no string that reaches the by-line.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
const route = readFileSync(path.join(repoRoot, 'app/api/testimonial/route.ts'), 'utf8');
{
  ok('🔴 THE ROUTE READS NO NAME OFF THE FORM',
    !/f\.get\(\s*['"]name['"]\s*\)/.test(route));
  ok('🔴 AND NO TRADE',
    !/f\.get\(\s*['"]trade['"]\s*\)/.test(route));
  ok('it reads the two switches instead',
    /f\.get\(\s*['"]showname['"]\s*\)/.test(route) && /f\.get\(\s*['"]showtrade['"]\s*\)/.test(route));
  ok('and hands the writer booleans, never strings',
    /writeOwnTestimonial\(user\.id,\s*\{\s*quote,\s*rating,\s*showName,\s*showTrade\s*\}\)/.test(route));

  ok('every operation is scoped by the SESSION user id and never by an id in the body',
    !/f\.get\(\s*['"](id|user_?id)['"]\s*\)/i.test(route)
    && /sessionUser\(req\)/.test(route));

  // ⚠️ THE DELETE IS NOT GATED ON ENTITLEMENT, and the write is. Taking his own words off our site
  // is a right, not work he buys; a lapsed subscription must not hold a man's name on a marketing
  // page. The remove branch has to return before anything that could charge him for it.
  const iRemove = route.indexOf("=== 'remove'");
  const iWrite = route.indexOf('writeOwnTestimonial(');
  ok('the remove branch exists and returns before the write path', iRemove > 0 && iWrite > 0 && iRemove < iWrite);
  ok('the remove is a form FIELD and not a method, because a form cannot send DELETE',
    /name="intent"|f\.get\('intent'\)|f\.get\("intent"\)/.test(route));

  ok('a failed write is never reported as a saved one',
    /done \? '\?saved=1' : '\?problem=unavailable'/.test(route));
  ok('the burst limit is on the account, like every other write door', /userBurst\(/.test(route));
  ok('the house style lock runs after the sanitiser', /sanitiseDashes/.test(route) && /hasForbiddenDash\(quote\)/.test(route));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe page: both switches off, and a preview built by the writer.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
const page = readFileSync(path.join(repoRoot, 'app/app/you/testimonial/page.tsx'), 'utf8');
{
  ok('🔴 THE PAGE POSTS NO NAME OR TRADE INPUT',
    !/<input[^>]*name="name"/.test(page) && !/<input[^>]*name="trade"/.test(page));
  ok('it draws the two switches instead',
    /name="showname"/.test(page) && /name="showtrade"/.test(page));

  // 🔴 THE PRE-TICK RULE. defaultChecked must be driven by what HE chose last time, and the
  // computation of that must not be a constant. A `defaultChecked` on a literal true is the exact
  // thing Recital 32 and Planet49 forbid.
  ok('🔴 NEITHER SWITCH IS PRE-TICKED BY US',
    !/defaultChecked=\{true\}/.test(page) && !/defaultChecked(?!=)/.test(page.replace(/defaultChecked=\{[^}]*\}/g, '')));
  ok('and what is ticked is read back off his own previous row',
    /const nameWasOn = haveName && existing !== null/.test(page)
    && /const tradeWasOn = haveTrade && existing !== null/.test(page));
  ok('a man with no review on file starts with both off, because existing is null then',
    /existing !== null/.test(page));

  ok('🔴 THE PREVIEW IS BUILT BY THE WRITER\'S OWN FUNCTION, not by a second copy of the rule',
    /testimonialByline\(card, true, true\)/.test(page));
  ok('and the anonymous word is imported rather than spelled again',
    /TESTIMONIAL_ANON/.test(page) && !/'Lekhio user'/.test(page));

  // ⚠️ THE CSS PREVIEW DEPENDS ON DOM ORDER: the sibling combinator only reaches FORWARD, so both
  // inputs must render before .lek-prev. Wrapping either in its own label silently breaks it, and
  // a preview that has stopped following the switches is worse than no preview.
  const iName = page.indexOf('id="showname"');
  const iTrade = page.indexOf('id="showtrade"');
  const iPrev = page.indexOf('className="lek-prev"');
  ok('all three preview markers exist, so the ordering below can actually fail',
    iName >= 0 && iTrade >= 0 && iPrev >= 0);
  ok('🔴 BOTH SWITCHES RENDER BEFORE THE PREVIEW, which is what the sibling selector needs',
    iName < iPrev && iTrade < iPrev);
  ok('and the selectors are the ones that shape depends on',
    /#showname:checked ~ \.lek-prev/.test(page) && /#showtrade:checked ~ \.lek-prev/.test(page));
  ok('the preview carries no client javascript, like every other write surface in the app',
    !/'use client'/.test(page) && !/onChange=/.test(page));

  ok('🔴 A FAILED READ OF HIS DETAILS DRAWS NO FORM, same rule as a failed read of his review',
    /card === null \?/.test(page));
  ok('and the page says the review is not live when he saves it',
    /until we publish it/.test(page));
  ok('a switch we cannot honour is disabled rather than drawn as a control that does nothing',
    /disabled=\{!haveName\}/.test(page) && /disabled=\{!haveTrade\}/.test(page));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe console: a review a customer wrote must not read as one of our drafts.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
const hoka = readFileSync(path.join(repoRoot, 'app/team/hoka/page.tsx'), 'utf8');
{
  // 🔴 THE DUPLICATED LITERAL. hoka is a client bundle and cannot import from lib/supabase without
  // dragging the service role path into a browser. So the word is copied, and THIS is the guard
  // that stops the copy drifting. A drifted filter shows nothing waiting, which reads exactly like
  // nobody having written one: a silence, and a silence here is a man ignored for weeks.
  const m = /const FROM_CUSTOMER = '([^']+)';/.exec(hoka);
  ok('the console declares its own copy of the marker', m !== null);
  ok('🔴 AND IT AGREES WITH THE WRITER\'S, or the desk shows nothing waiting for ever',
    m !== null && m[1] === SB.TESTIMONIAL_FROM_CUSTOMER);

  ok('the desk separates what a customer wrote from what we typed in',
    /t\.source === FROM_CUSTOMER && !t\.published/.test(hoka));
  ok('🔴 THOSE ROWS ARE DRAWN FIRST, because the list is newest first and they sink by the weekend',
    /\[\.\.\.waiting, \.\.\.testimonials\.filter/.test(hoka));
  ok('they say they are waiting rather than that they are hidden',
    /Waiting for you/.test(hoka));
  ok('and the button says what pressing it does',
    /Approve and put it live/.test(hoka));
  ok('the count is stated where somebody will see it',
    /waiting for you/.test(hoka) && /waiting\.length > 0/.test(hoka));
  ok('a customer\'s own review is not labelled as added by one of us',
    /t\.source !== FROM_CUSTOMER \? ` · added by/.test(hoka));
  ok('and its source reads as a sentence rather than as "via customer"',
    /written by them, in their own account/.test(hoka));

  // ⚠️ THE APPROVE BUTTON IS THE EXISTING PUBLISH PATH. A second write path to the same column is
  // a second place for the CAP 3.47 rule to be forgotten.
  ok('approving goes through the publish path that already existed',
    /toggleReview\(t\.id, !t\.published\)/.test(hoka));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe erasure can now reach it, which is the whole reason this exists.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const sb = readFileSync(path.join(repoRoot, 'lib/supabase.ts'), 'utf8');
  ok('🔴 testimonials IS IN THE MANIFEST BOTH DOORS WALK',
    /table:\s*'testimonials'/.test(sb));
  ok('and it is keyed by user id, which is the column that did not exist before 9 August',
    /table:\s*'testimonials'[^}]*userKey:\s*'user_id'/.test(sb));

  // The team door can still write one for somebody who is not a customer. That row honestly has no
  // account to key to, and the signature makes the null deliberate rather than forgotten.
  ok('a quote from somebody with no account is still allowed, with an explicit null',
    /createdBy: string, userId: string \| null = null/.test(sb));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
