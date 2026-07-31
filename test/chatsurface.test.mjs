// THE CHAT LIST SURFACE. /app/thread as DMs: the list, the sealed chat reference, the start
// button, and the read only Rakha view.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS, IN THE ORDER THE FAILURES WOULD HURT:
//
//   1. 🔴 THE SEALED REFERENCE, ATTACKED AT RUNTIME. app/app/chatref.ts is the only way a row
//      is pointed at, so it is minted, tampered with, forged, borrowed, rotated and expired
//      here, exactly as test/moneyweb.test.mjs attacks entryref. And its salt must differ from
//      entryref's, or the two modules would share a key while claiming not to.
//
//   2. 🔴 HONESTY WHEN THE MIGRATION HAS NOT RUN. Until APPLY_2026-07-31_chats.sql drops v1's
//      one-thread index, a second chat cannot exist. The button's refusal must be said in a
//      plain sentence, never papered over with somebody's old chat.
//
//   3. 🔴 RAKHA IS READ ONLY ON THIS SURFACE. The flags are the nightly walk's own stored
//      words, shown with the why, and the view carries no form, no button, no write. Replying
//      goes in the main chat and the page says so.
//
//   4. The list itself: server rendered, session first, newest first, sealed links only, and
//      readable when locked.
//
// The storage helpers behind this surface are attacked in test/thread.test.mjs, which stages
// the self contained block out of lib/supabase.ts.
// Run: node test/chatsurface.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Assert on the CODE, never on the words around it, same as every sibling suite.
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const listSrc = read('app/app/thread/page.tsx');
const chatSrc = read('app/app/thread/chat/page.tsx');
const refSrc = read('app/app/chatref.ts');
const entryRefSrc = read('app/app/entryref.ts');
const newSrc = read('app/api/thread/new/route.ts');
const routeSrc = read('app/api/thread/route.ts');

const listCode = stripComments(listSrc);
const chatCode = stripComments(chatSrc);
const newCode = stripComments(newSrc);
const routeCode = stripComments(routeSrc);

const gate = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);

console.log('\nchatsurface: DMs on our own turf, sealed links, honest refusals');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SEALED CHAT REFERENCE, ATTACKED AT RUNTIME.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the sealed reference ===\n');

// chatref imports nothing but node:crypto, so it stages as a straight copy. The unconfigured
// module is imported FIRST, while no secret is set, because the module caches its key: it must
// fail closed, no links and nothing to verify against.
function stageChatref(secret) {
  const stage = mkdtempSync(path.join(tmpdir(), 'chatref-'));
  writeFileSync(path.join(stage, 'chatref.ts'), refSrc);
  if (secret === undefined) delete process.env.WEB_SESSION_SECRET;
  else process.env.WEB_SESSION_SECRET = secret;
  return import(pathToFileURL(path.join(stage, 'chatref.ts')).href);
}

{
  const off = await stageChatref(undefined);
  ok('with no secret, no reference is ever minted',
    off.chatRef('a', 'chat', '11111111-1111-4111-8111-111111111111') === '');
  ok('with no secret, nothing verifies', off.verifyChatRef('x.y.z') === null);
  ok('and the module says plainly that it is off', off.chatRefsConfigured() === false);
}

const SECRET = 'a-test-secret-long-enough-to-clear-the-32-byte-bar';
const R = await stageChatref(SECRET);
const OWNER = '9c1b2a3d-0000-4000-8000-00000000aaaa';
const INTRUDER = '9c1b2a3d-0000-4000-8000-00000000bbbb';
const ROW = '5e6f7a8b-1111-4111-8111-222222222222';

{
  const ref = R.chatRef(OWNER, 'chat', ROW);
  ok('a chat reference round trips', (() => {
    const c = R.verifyChatRef(ref);
    return c !== null && c.owner === OWNER && c.kind === 'chat' && c.id === ROW;
  })());
  const rref = R.chatRef(OWNER, 'rakha', ROW);
  ok('a rakha reference round trips with its kind intact',
    R.verifyChatRef(rref)?.kind === 'rakha');

  // 🔴 THE POINT OF THE WHOLE MODULE: the row id must not be readable out of the URL.
  ok('🔴 the reference does not contain the row id',
    !ref.includes(ROW) && !ref.includes(ROW.replace(/-/g, '')));
  ok('🔴 nor the owner', !ref.includes(OWNER));
  ok('two references to the same chat never look alike', ref !== R.chatRef(OWNER, 'chat', ROW));

  // 🔴 THE TENANCY ATTACK. Another account holding a perfectly VALID reference must be refused.
  const claim = R.verifyChatRef(ref);
  ok('🔴 A VALID REFERENCE IN ANOTHER MAN\'S SESSION IS REFUSED',
    R.chatRefBelongsTo(claim, INTRUDER) === false);
  ok('and honoured only in the session it was minted for', R.chatRefBelongsTo(claim, OWNER) === true);
  ok('an empty session owner is refused too', R.chatRefBelongsTo(claim, '') === false);
  ok('a null claim belongs to nobody', R.chatRefBelongsTo(null, OWNER) === false);

  // Tampering. Flip one character in the MIDDLE of the ciphertext: the last base64 char of an
  // unpadded group can carry only padding bits, so flipping it proves nothing.
  const mid = ref.lastIndexOf('.') + 3;
  const bent = ref.slice(0, mid) + (ref[mid] === 'A' ? 'B' : 'A') + ref.slice(mid + 1);
  ok('🔴 one flipped character is refused', R.verifyChatRef(bent) === null);

  // Forgery without the secret: the right shape, the wrong key.
  const forged = [crypto.randomBytes(12), crypto.randomBytes(16), Buffer.from(JSON.stringify({ o: INTRUDER, k: 'chat', i: ROW, exp: 9999999999 }))]
    .map((b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .join('.');
  ok('🔴 a forged reference with the right shape and the wrong key is refused',
    R.verifyChatRef(forged) === null);

  // A reference minted under a different secret, which is what secret rotation looks like.
  const other = await stageChatref('a-completely-different-secret-also-long-enough');
  ok('a reference from a rotated secret is refused, not honoured', other.verifyChatRef(ref) === null);
  process.env.WEB_SESSION_SECRET = SECRET;

  // Expiry. Longer lived than an entry reference ON PURPOSE: the composer posts the reference
  // back with the man's words in the same form, so an expiry here eats a typed message rather
  // than merely bouncing a look. Seven days, and the module's header carries the reasoning.
  ok('the life is seven days, not entryref\'s four hours',
    R.CHAT_REF_TTL_SECONDS === 7 * 24 * 60 * 60);
  const later = new Date(Date.now() + (R.CHAT_REF_TTL_SECONDS + 60) * 1000);
  ok('an expired reference is refused', R.verifyChatRef(ref, later) === null);
  ok('and a live one is not', R.verifyChatRef(ref, new Date()) !== null);

  // Shapes on the way in.
  ok('a non uuid id mints nothing', R.chatRef(OWNER, 'chat', 'DROP TABLE conversations') === '');
  ok('an unknown kind mints nothing', R.chatRef(OWNER, 'talk', ROW) === '');
  ok('an empty owner mints nothing', R.chatRef('', 'chat', ROW) === '');
  ok('garbage does not verify',
    R.verifyChatRef('not-even-close') === null && R.verifyChatRef('') === null && R.verifyChatRef(null) === null);
}

// 🔴 ITS OWN SALT. The key derives from the same WEB_SESSION_SECRET as entryref, so the SALT
// is the only thing keeping the two modules' keys apart. If they ever matched, a chat
// reference could be opened as an entry reference by whichever code path got there first.
{
  const salt = (src) => (src.match(/const SALT = '([^']+)'/) || [])[1];
  ok('🔴 chatref\'s salt differs from entryref\'s, so the derived keys can never match',
    Boolean(salt(refSrc)) && Boolean(salt(entryRefSrc)) && salt(refSrc) !== salt(entryRefSrc));
}

// ---------------------------------------------------------------------------------------------
// 2. THE CHAT LIST PAGE. Server rendered, session first, sealed links, newest first.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the chat list ===\n');

ok('no client JavaScript: not a client component, no handlers, no hooks, no script tag',
  !/^'use client'/m.test(listSrc)
  && !/onClick|onChange|onSubmit|useState|useEffect|<script/.test(listCode));
ok('session first: the cookie names the man, or he goes to /in',
  /userFromSessionCookie/.test(listCode) && /redirect\('\/in'\)/.test(listCode));
ok('the chats and the flags are read through lib/supabase.ts, never an inline query',
  /listChatsForUser\(user\.id\)/.test(listCode) && /rakhaFlagsForUser\(user\.id\)/.test(listCode)
  && !/rest\/v1/.test(listCode));
ok('🔴 every link is minted from the SESSION user through the sealed reference',
  /chatRef\(user\.id, 'chat', c\.id\)/.test(listCode)
  && /chatRef\(user\.id, 'rakha', f\.id\)/.test(listCode));
ok('🔴 the href carries the reference and nothing else: no conversation or signal id in any URL',
  /\/app\/thread\/chat\?c=\$\{encodeURIComponent\(ref\)\}/.test(listCode)
  && !/[?&]c=\$\{c\.id/.test(listCode) && !/[?&]c=\$\{f\.id/.test(listCode));
ok('a row whose reference cannot be minted fails closed: readable, not clickable',
  /r\.href \?/.test(listCode));
ok('newest first, chats and Rakha\'s rows sorted together',
  /rows\.sort\(\(a, b\) => b\.at - a\.at\)/.test(listCode));
ok('🔴 "Start a new chat" sits at the top and posts a plain form to /api/thread/new',
  /<form action="\/api\/thread\/new" method="post"/.test(listCode)
  && listCode.indexOf('/api/thread/new') < listCode.indexOf('rows.map'));
ok('...and it hides behind the same read only banner other pages draw',
  /READONLY_TITLE/.test(listCode)
  && /\) : \(\s*<form action="\/api\/thread\/new"/.test(listCode));
ok('🔴 a locked account still READS the list: the rows render outside the locked branch',
  listCode.indexOf('rows.map') > -1);
ok('a failed chats read is said plainly, never drawn as an empty list',
  /could not read your chats just now/.test(listSrc));
ok('a failed Rakha read is said too, without hiding the chats that did load',
  /could not read what Rakha has flagged just now/.test(listSrc));
ok('the empty state invites the first chat instead of drawing nothing',
  listSrc.includes('Ask me anything about your money'));
ok('no console call in the page: chat content never reaches a log',
  !/console\./.test(listCode));
ok('the nav knows the thread row', /<AppNav current="\/app\/thread" \/>/.test(listSrc));

// 🔴 THE HONEST LINE FOR THE UNRUN MIGRATION, PINNED. Until APPLY_2026-07-31_chats.sql runs,
// the database refuses a second Lekhio chat; the man is told so in a sentence, and the route
// maps the refusal to that sentence rather than to a generic shrug.
ok('🔴 the list says plainly when a second chat cannot be started yet',
  listSrc.includes('A second chat cannot be started just yet'));
ok('🔴 and the new chat route maps the blocked insert to exactly that line',
  /made\.blocked \? '\?problem=onechat'/.test(newCode)
  && /case 'onechat':/.test(listCode));

// ---------------------------------------------------------------------------------------------
// 3. THE NEW CHAT ROUTE. Session, burst, gate, one insert, and a 303 into the fresh chat.
// ---------------------------------------------------------------------------------------------
console.log('\n=== starting a new chat ===\n');

ok('sessionUser first, and the chat is minted for the session\'s account',
  newCode.indexOf('await sessionUser(') > -1
  && /createLekhioChat\(user\.id\)/.test(newCode));
ok('🔴 nothing is read from the body at all: no form, no id, nothing to tamper with',
  !/formData|f\.get|req\.json/.test(newCode));
ok('🔴 the gate row exists and starting a chat is the work',
  gate.ruleFor('app/api/thread/new') === 'entitled');
ok('the refusal is the shared one, back to the list that draws the banner',
  /refuseUnentitled\(req, '\/app\/thread'\)/.test(newCode));
ok('posts are rate limited on the shared durable counter, keyed on the user',
  /userBurst\('threadnew', user\.id/.test(newCode));
ok('🔴 success 303s into the fresh chat through a sealed reference, never an id',
  /chatRef\(user\.id, 'chat', made\.id\)/.test(newCode)
  && /\/app\/thread\/chat\?c=\$\{encodeURIComponent\(ref\)\}/.test(newCode)
  && !/[?&]c=\$\{made\.id/.test(newCode));
ok('no sealed references configured means the list, not a broken link',
  /if \(!ref\) return back\(''\)/.test(newCode));
ok('no console call in the route', !/console\./.test(newCode));

// ---------------------------------------------------------------------------------------------
// 4. THE RAKHA VIEW. What Rakha suggested, the stored why, and nothing to press.
// ---------------------------------------------------------------------------------------------
console.log('\n=== the read only Rakha view ===\n');

ok('a rakha claim resolves through the scoped read, by name',
  /rakhaFlagForUser\(user\.id, claim\.id\)/.test(chatCode));
ok('what renders is the STORED payload: the title and the why in Rakha\'s own words',
  /\{flag\.title\}/.test(chatCode) && /\{flag\.body\}/.test(chatCode));

// 🔴 READ ONLY MEANS NO FORM AND NO BUTTON ANYWHERE IN THE VIEW. The RakhaView function is
// sliced out of the file and searched as code: a dismiss button or a reply box added later
// goes red here before it goes live.
{
  const start = chatCode.indexOf('function RakhaView');
  const end = chatCode.indexOf('const CSS');
  ok('the RakhaView function exists and is sliceable', start > -1 && end > start);
  const view = chatCode.slice(start, end);
  ok('🔴 the Rakha view carries NO form and NO button: it suggests, he decides',
    !/<form|<button|<input/.test(view));
  ok('🔴 and the honest line about replying is on it',
    chatSrc.includes('Replying about this goes in your main chat'));
  ok('a failed read is said plainly on the Rakha view too',
    /could not read this just now/.test(chatSrc));
}

// A rakha reference can never become a place to write: the POST route refuses any claim whose
// kind is not 'chat' before the counter, the gate or any row is touched.
ok('🔴 /api/thread refuses a rakha reference outright',
  /claim\.kind !== 'chat'/.test(routeCode));

// ---------------------------------------------------------------------------------------------
// 5. HOUSE COPY. No em or en dashes anywhere on the new surface.
// ---------------------------------------------------------------------------------------------
console.log('\n=== house copy ===\n');

for (const [name, src] of [
  ['the chat list', listSrc],
  ['the chat view', chatSrc],
  ['chatref', refSrc],
  ['the new chat route', newSrc],
  ['the chats APPLY file', read('supabase/APPLY_2026-07-31_chats.sql')],
]) {
  ok(`no em or en dash in ${name}`, !/[–—]/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
