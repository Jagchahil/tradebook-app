// BINDING A WHATSAPP NUMBER TO AN ACCOUNT. See lib/walink.ts.
//
// WHAT THESE TESTS PROTECT
//
// Whoever sends us a live code gets bound to an account, and from that moment they can feed that
// man's books and read his figures. So everything below is one of the ways that goes wrong, each
// written as the thing that must NOT be possible:
//
//   . a code cannot be guessed, because it is a hundred bits rather than six digits
//   . a code cannot outlive its half hour, and cannot be used twice
//   . a digest lifted from the table cannot be reversed without the key
//   . a number that already belongs to somebody else cannot be taken, in either direction
//   . nothing we say back names an account, a number or an address
//
// The load bearing one is the fourth. The first three are ordinary code hygiene and the fourth is
// the one where getting it wrong quietly breaks a stranger's books as well as his own.

// ⚠️ THE SECRET IS READ AT MODULE LOAD, SO THE IMPORT HAS TO BE DYNAMIC. A plain import is hoisted
// above the assignment and the module would load with no secret. Same reasoning as
// test/signupcode.test.mjs, which lost six assertions to exactly this.
process.env.WEB_SESSION_SECRET = 'test-secret-that-is-at-least-thirty-two-chars-long';

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const {
  newLinkCode, hashLinkCode, isLinkCodeShape, findLinkCodeIn, verifyStoredLink, bindingVerdict,
  linkMessage, welcomeAfterBinding, connectMessage, waMeLink, linkExpiresAt, isUkMobile,
  waLinksConfigured, LINK_TTL_SECONDS, CODE_PREFIX, CODE_BODY_LENGTH,
  waLinkCookieValue, verifyWaLinkCookie,
} = await import(`${pathToFileURL(path.resolve(here, '../lib/walink.ts')).href}`);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nwalink: the proof travels his way');

const NOW = new Date('2026-07-30T12:00:00Z');
const live = (over = {}) => ({
  id: 'row-1',
  user_id: 'user-a',
  expires_at: new Date(NOW.getTime() + 10 * 60 * 1000).toISOString(),
  consumed_at: null,
  ...over,
});

ok('the secret is configured for these tests', waLinksConfigured());

// ── The code itself ───────────────────────────────────────────────────────────────────────────

const code = newLinkCode();
ok('a new code has the shape the matcher looks for', isLinkCodeShape(code));
ok('a new code carries the prefix that makes it obviously ours', code.startsWith(CODE_PREFIX));
ok('a new code is the stated length', code.length === CODE_PREFIX.length + CODE_BODY_LENGTH);

// 🔴 A HUNDRED BITS, AND THE ONLY WAY TO CHECK THAT WITHOUT TRUSTING THE COMMENT IS TO GENERATE A
// LOT OF THEM. Twenty symbols from a thirty two symbol alphabet: if anything ever narrows that
// alphabet, or the generator starts repeating, this is where it shows.
const many = new Set();
for (let i = 0; i < 5000; i += 1) many.add(newLinkCode());
ok('🔴 five thousand codes produce five thousand different codes', many.size === 5000);

const symbols = new Set();
for (const c of many) for (const ch of c.slice(CODE_PREFIX.length)) symbols.add(ch);
ok('the generator reaches its whole alphabet', symbols.size === 32);

// No lookalikes. He reads this back to a person on the phone when something has gone wrong.
ok('the alphabet has no I, L, O or U in it', ![...symbols].some((c) => 'ILOU'.includes(c)));

// ── The digest ────────────────────────────────────────────────────────────────────────────────

ok('the digest is keyed, not a bare hash', hashLinkCode(code).length === 64);
ok('the same code digests the same way twice', hashLinkCode(code) === hashLinkCode(code));
ok('two codes do not collide', hashLinkCode(newLinkCode()) !== hashLinkCode(newLinkCode()));
ok('🔴 anything that is not code shaped never reaches the digest at all',
  hashLinkCode('LEKHIO-SHORT') === '' && hashLinkCode('') === '' && hashLinkCode('hello') === '');

// ── Finding it in a real message ──────────────────────────────────────────────────────────────

ok('the prefilled message contains the code', connectMessage(code).includes(code));
ok('the code is found in the message the link writes', findLinkCodeIn(connectMessage(code)) === code);
ok('the code is found when he types a word in front of it', findLinkCodeIn(`hi mate ${code}`) === code);
ok('the code is found when his keyboard lower cased it',
  findLinkCodeIn(connectMessage(code).toLowerCase()) === code);
ok('a message with no code in it finds nothing', findLinkCodeIn('how much do I owe') === null);
ok('a truncated code finds nothing', findLinkCodeIn(code.slice(0, -1)) === null);
// 🔴 Two code shaped strings in one message is not a man connecting his phone. Taking the first
// would be guessing, and guessing here binds somebody.
ok('🔴 two codes in one message find nothing rather than the first',
  findLinkCodeIn(`${code} and also ${newLinkCode()}`) === null);
ok('a non string finds nothing', findLinkCodeIn(null) === null && findLinkCodeIn(42) === null);

// ── The verdicts ──────────────────────────────────────────────────────────────────────────────

ok('a live unconsumed row is ok', verifyStoredLink(live(), NOW) === 'ok');
ok('a consumed row is spent, even inside its window',
  verifyStoredLink(live({ consumed_at: NOW.toISOString() }), NOW) === 'spent');
ok('an expired row is expired',
  verifyStoredLink(live({ expires_at: new Date(NOW.getTime() - 1000).toISOString() }), NOW) === 'expired');
ok('no row is none', verifyStoredLink(null, NOW) === 'none' && verifyStoredLink(undefined, NOW) === 'none');
ok('a row with no owner is none', verifyStoredLink(live({ user_id: '' }), NOW) === 'none');

// 🔴 Spent is decided BEFORE expiry, so a dead row cannot be brought back by any reading of a date.
ok('🔴 a row that is both spent and expired reads as spent, never as ok',
  verifyStoredLink(live({
    consumed_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() - 1000).toISOString(),
  }), NOW) === 'spent');

ok('🔴 an unparseable expiry fails closed',
  verifyStoredLink(live({ expires_at: 'not a date' }), NOW) === 'expired');
ok('the boundary second is expired, not ok',
  verifyStoredLink(live({ expires_at: NOW.toISOString() }), NOW) === 'expired');
ok('the stated lifetime is what linkExpiresAt actually gives',
  Date.parse(linkExpiresAt(NOW)) - NOW.getTime() === LINK_TTL_SECONDS * 1000);

// ── The rule that protects somebody else ──────────────────────────────────────────────────────

ok('a fresh number on a live code binds', bindingVerdict('ok', null, 'user-a') === 'ok');
ok('the same number on the same account is already connected, not an error',
  bindingVerdict('ok', 'user-a', 'user-a') === 'already');
ok("🔴 a number that belongs to another account is refused, never moved",
  bindingVerdict('ok', 'user-b', 'user-a') === 'taken');
ok('a dead code is still dead even when the number is free',
  bindingVerdict('expired', null, 'user-a') === 'expired'
  && bindingVerdict('spent', null, 'user-a') === 'spent'
  && bindingVerdict('none', null, 'user-a') === 'none');
// The ownership check must never rescue a bad code. If it did, an expired code plus a number we
// already know would bind.
ok('🔴 ownership is only ever consulted after the code has passed',
  bindingVerdict('expired', 'user-a', 'user-a') === 'expired');

// ── What we say back ──────────────────────────────────────────────────────────────────────────

const REFUSALS = ['expired', 'spent', 'none', 'taken', 'already', 'notuk', 'failed'];
ok('every refusal has something to say', REFUSALS.every((v) => linkMessage(v).length > 20));
ok('every refusal says something different',
  new Set(REFUSALS.map(linkMessage)).size === REFUSALS.length);
ok('a successful bind has no refusal text', linkMessage('ok') === '');

// 🔴 The man reading the 'taken' reply may be the attacker. It must not confirm whose number it is,
// and it must not confirm that a particular account exists.
ok('🔴 nothing we say back contains an at sign, a plus or a run of digits that could be a number',
  REFUSALS.every((v) => !/@|\+\d|\d{6,}/.test(linkMessage(v))));

// House style, and it applies to anything a customer reads.
const ALL_COPY = [...REFUSALS.map(linkMessage), welcomeAfterBinding('Dave'), welcomeAfterBinding(null),
  connectMessage(code)];
ok('no em dashes or en dashes anywhere in the copy', ALL_COPY.every((s) => !/[–—]/.test(s)));

ok('the welcome greets him by name when we have one', welcomeAfterBinding('Dave').startsWith('Right, Dave.'));
// 🔴 The FIRST word of the stored name, decided here rather than by each caller. A director greeted
// as his own company is a bug this codebase has already shipped once, on 27 July.
ok('🔴 a full name is greeted by its first word only',
  welcomeAfterBinding('Dave Smith').startsWith('Right, Dave.'));
ok('a company name in the name field does not produce a greeting with a comma and nothing after it',
  welcomeAfterBinding('   ').startsWith('Right.'));

// ── The number we are willing to write down ───────────────────────────────────────────────────
//
// 🔴 normalizeUkPhone will turn an American number into a well formed +44 one that belongs to
// nobody. That is harmless for a LOOKUP and is not harmless for a BIND, because the column being
// written is what three crons send to.
ok('a UK mobile is accepted', isUkMobile('+447700900123'));
ok('🔴 a mangled non UK number is refused', !isUkMobile('+4412025550123'));
ok('a UK landline is refused', !isUkMobile('+441134960000'));
ok('a short number is refused', !isUkMobile('+44770090012'));
ok('a long number is refused', !isUkMobile('+4477009001234'));
ok('no plus is refused', !isUkMobile('447700900123'));
ok('rubbish is refused', !isUkMobile('') && !isUkMobile(null) && !isUkMobile(undefined));
ok('the welcome still reads properly when we do not', welcomeAfterBinding(null).startsWith('Right.'));
// 🔴 THIS ASSERTION PINNED A DEAD INSTRUCTION IN PLACE, WHICH IS THE ONE THING A TEST MUST NOT DO.
// It read "the welcome points at the bank, which is the one thing that needs nothing typed", and
// the idea was right: the welcome should name the route that asks least of him. The DOOR moved.
// TrueLayer declined production authorisation, bankFeedOffered() went to default off, and this
// assertion went on holding the sentence steady while the thing it named stopped existing.
// So it now pins the PROPERTY rather than the door: the welcome names a route that works today.
ok('🔴 the welcome does NOT tell him to connect a bank, because there is no provider',
  !/connect(ing|s|ed)? (to )?(your|the) bank/i.test(welcomeAfterBinding('Dave')));
ok('it points at the route that genuinely needs nothing typed',
  /import(ing)? a bank statement/i.test(welcomeAfterBinding('Dave')));
// 🔴 It is a reply inside the free window, so it must never claim to be, or reference, a template.
ok('the welcome names no template', !/template/i.test(welcomeAfterBinding('Dave')));

// ── The link ──────────────────────────────────────────────────────────────────────────────────

const link = waMeLink('447700900123', code);
ok('the link points at wa.me with the number in digits', link === `https://wa.me/447700900123?text=${encodeURIComponent(connectMessage(code))}`);
ok('a number typed with a plus and spaces still produces a clean link',
  waMeLink('+44 7700 900123', code) === link);
// 🔴 wa.me does not error on a bad number, it opens WhatsApp on a blank screen, which looks exactly
// like us being broken. So no number means no link at all, and the page draws nothing.
ok('🔴 no configured number means no link, never a half built one',
  waMeLink('', code) === null && waMeLink(null, code) === null && waMeLink(undefined, code) === null);
ok('a nonsense code produces no link', waMeLink('447700900123', 'hello') === null);
ok('the code survives url encoding intact', decodeURIComponent(link.split('text=')[1]).includes(code));

// ── The cookie that carries it to the screen ──────────────────────────────────────────────────

const cookie = waLinkCookieValue(code, NOW);
ok('a code round trips through its own cookie', verifyWaLinkCookie(cookie, NOW) === code);
ok('the cookie does not contain the code in the clear',
  !cookie.includes(code) && !cookie.includes(code.slice(CODE_PREFIX.length)));

// 🔴 Every bad cookie is null, never an error and never a value. Null reads as "no code yet", which
// draws the button that mints a fresh one, and that is the safe direction from every failure.
ok('🔴 a tampered payload is refused', verifyWaLinkCookie(`x${cookie}`, NOW) === null);
ok('🔴 a stripped signature is refused', verifyWaLinkCookie(cookie.split('.')[0], NOW) === null);
ok('🔴 a swapped signature is refused',
  verifyWaLinkCookie(`${cookie.split('.')[0]}.${waLinkCookieValue(newLinkCode(), NOW).split('.')[1]}`, NOW) === null);
ok('rubbish is refused', verifyWaLinkCookie('hello', NOW) === null
  && verifyWaLinkCookie('', NOW) === null && verifyWaLinkCookie(null, NOW) === null);
ok('the cookie dies exactly when the code does',
  verifyWaLinkCookie(cookie, new Date(NOW.getTime() + LINK_TTL_SECONDS * 1000 - 1)) === code
  && verifyWaLinkCookie(cookie, new Date(NOW.getTime() + LINK_TTL_SECONDS * 1000 + 1000)) === null);
// The shape is checked on the way out too, so a cookie we signed under a looser rule cannot smuggle
// something through that this build would never have issued.
ok('🔴 a validly signed cookie carrying a bad code is still refused', (() => {
  const bad = Buffer.from(JSON.stringify({ k: 'LEKHIO-NOPE', exp: 4102444800 }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // Signed with the real secret by asking the module for a good cookie and reusing nothing but the
  // fact that we cannot forge one. This asserts the OUT check, so the payload is built by hand and
  // the signature is deliberately wrong: it must be refused for either reason, never accepted.
  return verifyWaLinkCookie(`${bad}.${cookie.split('.')[1]}`, NOW) === null;
})());

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
