// lib/walink.ts. BINDING A WHATSAPP NUMBER TO AN ACCOUNT, WITH THE PROOF TRAVELLING HIS WAY.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DIRECTION IS THE WHOLE IDEA, AND IT WAS THE UNEXAMINED ASSUMPTION FOR WEEKS.
//
// users.phone_number is not a label. It is a send target for three crons and it is the key inbound
// WhatsApp resolves a message by. So it may only ever hold a number somebody has proved, and the
// obvious way to prove a number is to text a code to it, which means Twilio, which is on a trial
// plan that can only text one verified number on earth. That is why this looked launch blocking.
//
// WhatsApp is itself a proof channel. He sends US a code from his own WhatsApp, and the webhook
// receives the code and the sender's number in the same payload, already authenticated by Meta. No
// SMS, no Twilio, no cost. It also proves something better than a text does: an SMS proves he can
// read a message on a SIM, this proves he controls the actual WhatsApp account the receipts will
// arrive from, which is the thing we actually care about.
//
// ⚠️ THE CODE IS LONG, AND THAT IS THE ENTIRE SECURITY OF THIS FILE.
//
// A guessed code sent from a stranger's WhatsApp binds THAT stranger's number to this man's
// account. The stranger could then feed his books and would receive his weekly figures. Six digits
// would be a million values against a channel we do not control the rate of, so the code is a
// hundred bits and guessing stops being a thing anyone attempts. He never types it: he taps a link
// or scans a square, and the message is written for him.
//
// There is therefore no attempts counter here, unlike lib/signupcode.ts. That file counts guesses
// because six digits is a space you can walk; this one does not, because it is not.
//
// No I/O, no database, no clock beyond a default a caller can override, so test/walink.test.mjs can
// attack the rules directly. The reads and writes live in lib/supabase.ts per CLAUDE.md rule 2.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// NO FALLBACK, the same rule as lib/signupcode.ts and lib/websession.ts. A secret that guards one
// thing guards one thing, and there is no quiet degradation to some other key lying around. No
// secret, no codes issued, and the page says so rather than drawing a square nobody can use.
const SECRET = process.env.WEB_SESSION_SECRET || '';

export function waLinksConfigured(): boolean {
  return SECRET.length >= 32;
}

// ⚠️ THIRTY MINUTES, NOT THE TEN A SIGNUP CODE GETS.
//
// A signup code is read off a screen and typed into the screen beside it, so ten minutes is
// generous. This one is scanned off a laptop with a phone, by a man who is at work: the customer in
// front of him takes precedence over us, every time. Ten minutes would expire on him while he was
// being useful, and an expired code on a page he has already opened is a man who does not come back
// to it. Thirty minutes, and the page mints a fresh one the moment the old one dies.
export const LINK_TTL_SECONDS = 30 * 60;

// Crockford's alphabet: no I, no L, no O, no U. Not because he types it, he does not, but because
// he READS it back to us when something has gone wrong and he is on the phone to support. A
// character set with no lookalikes in it is the difference between one call and two.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// The prefix does two jobs. It makes the message in his own chat history obviously ours rather than
// a random string he will wonder about in six months, and it gives findLinkCodeIn something to
// anchor on when he types "hi" in front of it.
export const CODE_PREFIX = 'LEKHIO-';

// Twenty symbols from a thirty two symbol alphabet is a hundred bits.
export const CODE_BODY_LENGTH = 20;

// From the CSPRNG, never Math.random, and by rejection rather than by modulo. 256 is not a multiple
// of 32 here only by luck; taking a byte modulo the alphabet length is the habit that quietly biases
// a generator the day somebody changes the alphabet to 33 characters.
export function newLinkCode(): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < CODE_BODY_LENGTH) {
    const byte = crypto.randomBytes(1)[0];
    if (byte >= limit) continue;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return CODE_PREFIX + out;
}

// ⚠️ AN HMAC OF THE CODE, KEYED, AND NOTHING ELSE GOES INTO THE DIGEST.
//
// lib/signupcode.ts folds the email address in, so a hash lifted from one row cannot be replayed
// against another. There is no equivalent here on purpose: the webhook receives the code and has to
// FIND the row, so it cannot know whose row it is looking for until it has found it. The address
// trick would mean scanning every live row and testing each, which is a full table scan on every
// inbound message and an oracle besides.
//
// What the key buys instead: a database read is a list of digests, and without WEB_SESSION_SECRET
// they are worth nothing. Reversing them is not a laptop's afternoon the way a million six digit
// codes are, it is a hundred bits.
export function hashLinkCode(code: string): string {
  if (!waLinksConfigured() || !isLinkCodeShape(code)) return '';
  return crypto.createHmac('sha256', SECRET).update(code).digest('hex');
}

const SHAPE = new RegExp(`^${CODE_PREFIX}[${ALPHABET}]{${CODE_BODY_LENGTH}}$`);

export function isLinkCodeShape(value: unknown): value is string {
  return typeof value === 'string' && SHAPE.test(value);
}

// ⚠️ HE WILL NOT SEND US A BARE CODE, WHATEVER THE LINK PREFILLS.
//
// The wa.me link writes the message for him, but plenty of people add a word before pressing send,
// some phones append a signature, and a few will forward it to themselves first. So the code is
// found ANYWHERE in the message rather than compared to the whole of it.
//
// Upper cased first, because a phone with autocorrect on will happily lower case a string that
// looks like a word to it, and refusing a man's own code because his keyboard was helpful is the
// kind of failure nobody ever reports, they just give up.
//
// Exactly one match, or nothing. Two code shaped strings in one message is not a man connecting his
// phone, and picking the first would be guessing.
export function findLinkCodeIn(body: unknown): string | null {
  if (typeof body !== 'string' || body.length === 0) return null;
  const found = body.toUpperCase().match(
    new RegExp(`${CODE_PREFIX}[${ALPHABET}]{${CODE_BODY_LENGTH}}`, 'g'),
  );
  if (!found || found.length !== 1) return null;
  return isLinkCodeShape(found[0]) ? found[0] : null;
}

export interface StoredLink {
  id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
}

// 'ok' the code is live and this number may be bound
// 'spent' the code has already bound a number
// 'expired' the code outlived its half hour
// 'none' no row matched, so it is not one of ours or it never existed
// 'taken' the code is fine but THIS NUMBER already belongs to a different account
// 'already' this number is already bound to this same account, so there is nothing to do
// 'notuk' the message came from a number that is not a UK mobile, so we will not bind it
// 'failed' everything was in order and the write did not happen. Ours, and we say so.
export type LinkVerdict =
  | 'ok' | 'spent' | 'expired' | 'none' | 'taken' | 'already' | 'notuk' | 'failed';

// 🔴 A UK MOBILE, AND ONLY A UK MOBILE, BECAUSE THIS COLUMN IS A SEND TARGET.
//
// normalizeUkPhone is forgiving by design: it strips a country code, strips leading zeros, and
// puts +44 on the front of whatever is left. Feed it an American number and it hands back a
// well formed +44 number that belongs to nobody. Harmless while the only use was LOOKING an
// account up, because a number that matches nothing simply matches nothing.
//
// Binding is not a lookup. It writes the column three crons SEND to, so a mangled number is a
// weekly summary posted into the void every week, for ever, with nothing anywhere reporting it.
// The shape check is the same one lib/websession.ts uses for the sign in cookie.
//
// ⚠️ THIS IS THE LINE TO CHANGE ON THE DAY LEKHIO LEAVES THE UK, and it is one line on purpose.
export function isUkMobile(e164: string | null | undefined): boolean {
  return typeof e164 === 'string' && /^\+447\d{9}$/.test(e164);
}

// ⚠️ THE ORDER IS THE POINT, AND IT IS THE SAME ORDER lib/signupcode.ts USES.
//
// Spent and expired are decided before anything else, so a dead row can never be revived. FAILS
// CLOSED at every step: a missing row, an unreadable date, a malformed row, all refusals.
export function verifyStoredLink(
  row: StoredLink | null | undefined,
  now: Date = new Date(),
): LinkVerdict {
  if (!row || !row.user_id) return 'none';
  if (row.consumed_at) return 'spent';
  const exp = Date.parse(row.expires_at);
  // An unreadable expiry is OUR data being wrong, and the safe reading of a date we cannot parse is
  // that it has passed. He opens the page again and gets another, which costs him nothing.
  if (!Number.isFinite(exp) || exp <= now.getTime()) return 'expired';
  return 'ok';
}

// 🔴 THE ONE RULE THAT PROTECTS SOMEBODY OTHER THAN THE MAN HOLDING THE PHONE.
//
// Inbound WhatsApp resolves a message to an account BY NUMBER, and findUserIdByPhone deliberately
// returns nothing when two rows match. So binding a number that already belongs to another account
// does not create a shared inbox, it creates two accounts that both stop working: his receipts stop
// being filed and so do the other man's, and neither of them is told why.
//
// It also has an uglier reading. A man who knows a colleague's number could bind it to his own
// account and take delivery of that colleague's books. There is no charitable version of this, so
// it is refused outright rather than resolved by preferring one account over the other.
//
// Rebinding to the SAME account is fine and is not an error: he has scanned twice, or he lost the
// reply. Rebinding a DIFFERENT number to his own account is also fine, because he has just proved
// the new one and he was signed in to get the code. He has changed his phone, which people do.
export function bindingVerdict(
  codeVerdict: LinkVerdict,
  ownerOfThisNumber: string | null,
  codeBelongsTo: string,
): LinkVerdict {
  if (codeVerdict !== 'ok') return codeVerdict;
  if (!ownerOfThisNumber) return 'ok';
  return ownerOfThisNumber === codeBelongsTo ? 'already' : 'taken';
}

// What he is told on WhatsApp when it did not work. Every one of these is a different sentence,
// because "try again" is useless advice for a code that can no longer work however carefully he
// sends it, and because a man who has just been refused deserves to know which door to try next.
//
// ⚠️ NONE OF THESE NAMES AN ACCOUNT, A NUMBER OR AN EMAIL. The man reading 'taken' may be the
// attacker, and the reply must not confirm for him that a particular number is on our books.
export function linkMessage(verdict: LinkVerdict): string {
  switch (verdict) {
    case 'expired':
      return 'That code has expired. Open Lekhio on the web, go to Connect WhatsApp, and it will show you a fresh one.';
    case 'spent':
      return 'That code has been used already. If you need to connect a different phone, open Lekhio on the web and get a new one.';
    case 'none':
      return 'We could not find that code. Open Lekhio on the web, go to Connect WhatsApp, and send the one it shows you.';
    case 'taken':
      return 'This number is already connected to a Lekhio account, so we have not changed anything. If that is not you, reply SUPPORT and a person will look at it.';
    case 'already':
      return 'This phone is already connected. Send me a photo of a receipt whenever you like and I will log it.';
    case 'notuk':
      return 'We can only connect a UK mobile at the moment. Everything else in Lekhio works as normal on the website.';
    case 'failed':
      return 'Something went wrong our end and your phone is not connected yet. Nothing has changed on your account. Open Lekhio on the web and get a fresh code.';
    default:
      return '';
  }
}

// ⚠️ THE WELCOME IS A REPLY, NOT A TEMPLATE, AND THAT IS WHY THIS IS FREE.
//
// The 27 July build board still says the Activate press "fires ONE proactive welcome template".
// That was written before the direction was reversed. A proactive template would have to be sent to
// the number typed at signup, which nobody has proved, which is the exact thing this whole file
// exists to avoid. It would also cost money per customer and need Meta's approval before it could
// send at all, so it would ship dark.
//
// Because he messaged US, the twenty four hour customer service window is open and this goes out as
// ordinary text, immediately, for nothing. There is no template here and there must never be one.
//
// It says what WhatsApp can do and it points at the bank, because the bank is the one capture route
// that needs nothing typed. Three things, not ten: doc 103's rule is that a list he has to read and
// reject is a list he stops reading.
//
// ⚠️ IT TAKES THE WHOLE STORED NAME AND USES THE FIRST WORD ITSELF. Callers have exactly one thing
// in their hand, users.name, and if each one trimmed it its own way we would greet the same man
// differently on two surfaces. The 27 July fix that stopped a director being greeted as his own
// company is the reason this is not left to the caller.
export function welcomeAfterBinding(storedName?: string | null): string {
  const first = (storedName || '').trim().split(/\s+/)[0] || '';
  const hello = first ? `Right, ${first}. ` : 'Right. ';
  return [
    `${hello}Your phone is connected, so this chat is your Lekhio now.`,
    '',
    'Send me a photo of a receipt and I will read it and file it.',
    'Say what you spent or got paid and I will log it.',
    'Ask me what you owe, or what you made this week, and I will tell you.',
    '',
    'The one thing worth doing next is connecting your bank on the website. Everything you spend from it lands here on its own, and you never type your own figures again.',
  ].join('\n');
}

// The message the link writes for him. He sees this in his own chat history forever, so it is a
// sentence rather than a bare string of characters he will wonder about in six months.
export function connectMessage(code: string): string {
  return `Connect my Lekhio. ${code}`;
}

// ⚠️ THE NUMBER IS DIGITS ONLY, NO PLUS AND NO SPACES. wa.me silently fails on anything else: it
// does not error, it opens WhatsApp on a blank screen, which is indistinguishable from us being
// broken. Returns null rather than a half built link when the number is not configured, and the
// page draws nothing at all in that case.
export function waMeLink(numberDigits: string | null | undefined, code: string): string | null {
  const digits = (numberDigits || '').replace(/[^0-9]/g, '');
  if (digits.length < 8 || !isLinkCodeShape(code)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(connectMessage(code))}`;
}

export function linkExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + LINK_TTL_SECONDS * 1000).toISOString();
}

// ── Carrying the code to the screen ──────────────────────────────────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THE CODE NEEDS A COOKIE AT ALL, AND WHY THE COOKIE IS SIGNED HERE RATHER THAN IN
// lib/websession.ts, WHICH ALREADY SIGNS ONE.
//
// public.wa_links stores the digest and never the code. That is not going to change: a database
// read has to be worth nothing to whoever gets it. The consequence is that once a code has been
// generated there is nowhere on earth to read it back from, so the connect page cannot simply look
// up the live one and draw it again.
//
// Two other shapes were considered and both are worse:
//
//   . Mint a fresh code on every GET of the connect page. That makes an ordinary page load write to
//     the database, so a refresh or a back button churns credentials, and a man with the page open
//     on two tabs finds one of the squares has quietly stopped working.
//   . Redirect with the code in the URL. It is a credential, so that writes it into his history,
//     into any Referer we leak, and into every error report that ever records a URL. lib/websession
//     .ts refuses to put a phone number in a URL for exactly this reason, and a code is worse.
//
// So he presses a button, one row is written, and the code comes back in a signed HttpOnly cookie
// that lives precisely as long as the code does. Every refresh after that redraws the same square
// with no further writes.
//
// ⚠️ AND IT IS SIGNED HERE, DUPLICATING FIFTEEN LINES OF lib/websession.ts, FOR A REASON WORTH
// WRITING DOWN BECAUSE IT WILL CATCH SOMEBODY ELSE.
//
// The obvious move is to put waLinkCookieValue beside pendingCookieValue and import the code shape
// from here. It was written that way first, and it broke test/websession.test.mjs immediately.
//
// Node's TypeScript type stripping cannot resolve an EXTENSIONLESS relative import, and this repo
// is on moduleResolution "bundler", so every relative import in lib/ is extensionless. Next bundles
// them and does not care; `node test/x.test.mjs` importing a lib file directly does. That is why
// lib/signupcode.ts, lib/onboarding.ts, lib/websession.ts and this file all import nothing but
// node:crypto: it is not a style, it is the condition of being testable at all. Adding one import
// to websession.ts made the whole module unloadable by its own suite.
//
// So the rule: A lib MODULE A TEST LOADS DIRECTLY MAY NOT IMPORT ANOTHER lib MODULE. The duplicated
// part is a generic HMAC over a payload, not a rule about money or codes, and every rule that
// matters still lives in exactly one place.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const WALINK_COOKIE = 'lek_wa';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

export function waLinkCookieValue(code: string, now: Date = new Date()): string {
  if (!waLinksConfigured() || !isLinkCodeShape(code)) return '';
  const exp = Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS;
  const payload = b64url(Buffer.from(JSON.stringify({ k: code, exp }), 'utf8'));
  return `${payload}.${sign(payload)}`;
}

// The code we actually issued, or null. Null means it timed out or the cookie was tampered with,
// and either way the page offers him a fresh one rather than drawing a square nobody can use.
//
// ⚠️ THE SHAPE IS CHECKED ON THE WAY OUT AS WELL AS THE WAY IN. A cookie signed under an older and
// looser rule cannot carry something this build would never have issued.
export function verifyWaLinkCookie(
  value: string | null | undefined, now: Date = new Date(),
): string | null {
  if (!waLinksConfigured() || !value) return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  let body: { k?: unknown; exp?: unknown };
  try {
    body = JSON.parse(fromB64url(payload).toString('utf8'));
  } catch {
    return null;
  }
  const exp = Number(body.exp);
  if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
  return isLinkCodeShape(body.k) ? body.k : null;
}
