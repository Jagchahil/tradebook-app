// app/app/entryref.ts. HOW A ROW IS POINTED AT WITHOUT ITS ID EVER REACHING A URL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY A LINK TO ONE TRANSACTION IS A PROBLEM AT ALL.
//
// test/webauth.test.mjs section 1 is the tenancy design of the whole web app: THERE IS NOWHERE
// TO PUT AN ID. No page takes a dynamic segment, no query string carries a row id, so there is
// nothing a customer can edit to reach another customer's figures. The money log needed a detail
// view, and the obvious /app/money/t/[id] would have punched the first hole in that wall.
//
// So the link carries a REFERENCE instead: the row id, the owner and the month, encrypted with
// AES-256-GCM. Nothing in it can be read, nothing in it can be changed without the tag failing,
// and there is nothing to enumerate. The precedent is lib/packtoken.ts, the signed capability
// URL the quarter pack already uses. This goes one step further and encrypts rather than only
// signs, because a signed but readable payload would still put the row id in his browser
// history, and the whole point of the rule is that an id never appears in a URL.
//
// ⚠️ AND THE REFERENCE GRANTS NOTHING. That is the part that makes it safe to carry.
//
// The detail page still resolves the user from the session, still checks the claim names that
// same user (refBelongsTo), and still reads the row through a query scoped to user_id. A stolen
// or leaked reference in someone else's hands meets the sign in page, and a forged one meets
// the auth tag. The reference only ever answers "which of YOUR rows", never "whose".
//
// ⚠️ THE KEY IS DERIVED FROM WEB_SESSION_SECRET, NOT USED RAW, AND NOT A NEW SECRET.
//
// lib/packtoken.ts's rule is that a secret that guards one thing guards one thing. A brand new
// env var would be the tidy answer, except that an unset secret means no links at all, silently,
// in production, which is how features die on deploy day. WEB_SESSION_SECRET already has to
// exist for the web app to work at all, and scrypt with this module's own salt makes the key
// used here a DIFFERENT key from the one that signs sessions, so neither is a sample of the
// other's output.
//
// Lives under app/app rather than lib/ because it is a shape of the web surface, not an engine:
// no money, no tax, no categorisation. Pure apart from the env read, so tests attack it directly.

import crypto from 'node:crypto';
import { isMonthKey } from '../../lib/moneylog';

const SECRET = process.env.WEB_SESSION_SECRET || '';

// This is not a secret. It only makes the derived key specific to this module, so the key that
// encrypts entry references can never double as the key that signs sessions.
const SALT = 'lekhio.entry.ref.v1';

// Derived once per process. scrypt is deliberately slow, and a money page renders one reference
// per row, so paying the derivation per call would make the busiest screen the slowest one.
let cachedKey: Buffer | null | undefined;
function keyOrNull(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = SECRET.length >= 32 ? crypto.scryptSync(SECRET, SALT, 32) : null;
  return cachedKey;
}

export function entryRefsConfigured(): boolean {
  return keyOrNull() !== null;
}

// Four hours. Longer than any sitting, short enough that a reference in his browser history is
// dead the same day. Expiry costs him nothing: a stale link lands back on the month log.
export const ENTRY_REF_TTL_SECONDS = 4 * 60 * 60;

export interface EntryRefClaim {
  owner: string;   // the account the reference was minted for. Checked against the session.
  row: string;     // the transaction id, which never appears anywhere a customer can read.
  month: string;   // YYYY-MM, so the page can fetch by date exactly as /app/money does.
}

// The same shape rule lib/supabase.ts applies before an id reaches a query: a row id is a uuid
// or it is not a row id. A shape check, not a calculation, so a local copy cannot drift into a
// wrong number.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Mint a reference. Returns an empty string when unconfigured or when either input fails its
// shape check, so every caller fails closed: no reference, no link, and the row renders as the
// plain text it always was.
export function entryRef(owner: string, row: string, month: string, now: Date = new Date()): string {
  const key = keyOrNull();
  if (!key || !owner || !UUID.test(row) || !isMonthKey(month)) return '';
  const exp = Math.floor(now.getTime() / 1000) + ENTRY_REF_TTL_SECONDS;
  const plain = JSON.stringify({ o: owner, r: row, m: month, exp });
  // A fresh random nonce per reference, the standard GCM shape lib/crypto.ts also uses. Two
  // references to the same row therefore never look alike, which is what opaque means.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

// Verify and open a reference. Null for anything missing, malformed, tampered, forged or
// expired. Never throws: a bad reference is a man with a stale link, and the answer to that is
// the month log, not a stack trace.
export function verifyEntryRef(ref: string | null | undefined, now: Date = new Date()): EntryRefClaim | null {
  const key = keyOrNull();
  if (!key || !ref || ref.length > 600) return null;
  const parts = ref.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = fromB64url(parts[0]);
    const tag = fromB64url(parts[1]);
    const ct = fromB64url(parts[2]);
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const body = JSON.parse(plain) as { o?: unknown; r?: unknown; m?: unknown; exp?: unknown };
    const exp = Number(body.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
    const owner = typeof body.o === 'string' ? body.o : '';
    const row = typeof body.r === 'string' ? body.r : '';
    const month = typeof body.m === 'string' ? body.m : '';
    // Shape checked again on the way out, same rule as verifyPendingCookie in lib/websession.ts:
    // a reference minted under an older, looser rule must not carry something this build would
    // never have accepted on the way in.
    if (!owner || !UUID.test(row) || !isMonthKey(month)) return null;
    return { owner, row, month };
  } catch {
    return null;
  }
}

// ⚠️ THE CHECK THE DETAIL PAGE MUST MAKE, AND IT IS A FUNCTION SO A TEST CAN ATTACK IT.
//
// A reference is minted for one account. The page resolves the session first and then asks this,
// so a reference that leaks, however it leaks, shows the wrong man nothing. The row fetch is
// scoped by user_id anyway, which means this check is belt on top of braces, and both stay.
export function refBelongsTo(claim: EntryRefClaim | null, sessionOwner: string): boolean {
  return claim !== null && sessionOwner !== '' && claim.owner === sessionOwner;
}
