// app/app/chatref.ts. HOW A CHAT IS POINTED AT WITHOUT ITS ID EVER REACHING A URL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THE CHAT LIST NEEDS ITS OWN REFERENCE MODULE AT ALL.
//
// /app/thread grew from one standing thread into a DM style list: every conversation a row,
// and each row opening into its own view. test/webauth.test.mjs section 1 still holds: no page
// under app/app takes a dynamic segment and no query string carries a row id, so the link from
// a row to its chat carries a REFERENCE on the app/app/entryref.ts pattern: the owner, what
// kind of thing is being opened, and its id, sealed with AES-256-GCM. Nothing in it reads,
// nothing in it bends without the tag failing, nothing enumerates.
//
// ⚠️ ITS OWN SALT, SO ITS KEY IS NOBODY ELSE'S KEY. Same scrypt derivation from
// WEB_SESSION_SECRET as entryref, with a different salt, which makes this module's key a
// different key from both the session signer's and the entry reference's. A chat reference can
// never be replayed as an entry reference or the other way round: the other module's key
// refuses the ciphertext outright.
//
// ⚠️ AND THE REFERENCE GRANTS NOTHING. The chat view resolves the user from the session,
// checks the claim was minted for that same user (chatRefBelongsTo), and then reads the rows
// through queries scoped by user_id in lib/supabase.ts. A stolen reference meets the sign in
// page; a forged one meets the auth tag. It only ever answers "which of YOUR chats", never
// "whose".
//
// ⚠️ A LONGER LIFE THAN AN ENTRY REFERENCE, ON PURPOSE. An entry reference that expires costs
// a bounced look: the man lands back on the month log. A chat stays open on a phone for days,
// and the composer posts the reference back with his WORDS in the same form, so an expiry here
// would eat a message he has already typed. Seven days keeps browser history bounded without
// ever costing him a sentence in any realistic sitting.
//
// Lives under app/app because it is a shape of the web surface, not an engine: no money, no
// tax. Pure apart from the env read, so tests attack it directly.

import crypto from 'node:crypto';

const SECRET = process.env.WEB_SESSION_SECRET || '';

// This is not a secret. It only makes the derived key specific to this module, so the key that
// seals chat references can never double as the session signer's or the entry reference's.
const SALT = 'lekhio.chat.ref.v1';

// Derived once per process, exactly as entryref does: scrypt is deliberately slow and the chat
// list mints one reference per row.
let cachedKey: Buffer | null | undefined;
function keyOrNull(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = SECRET.length >= 32 ? crypto.scryptSync(SECRET, SALT, 32) : null;
  return cachedKey;
}

export function chatRefsConfigured(): boolean {
  return keyOrNull() !== null;
}

// Seven days. See the header for why this is longer than an entry reference's four hours.
export const CHAT_REF_TTL_SECONDS = 7 * 24 * 60 * 60;

// What a reference can point at. 'chat' is a conversations row of any kind; 'rakha' is an
// agent_signals row, the read only view of something Rakha flagged. The kind is INSIDE the
// sealed claim so a reference minted for one table cannot be replayed against the other.
export type ChatRefKind = 'chat' | 'rakha';
const KINDS: ChatRefKind[] = ['chat', 'rakha'];

export interface ChatRefClaim {
  owner: string;      // the account the reference was minted for. Checked against the session.
  kind: ChatRefKind;  // which table the id names, so the view reads the right one.
  id: string;         // the row id, which never appears anywhere a customer can read.
}

// The same shape rule lib/supabase.ts applies before an id reaches a query: a row id is a uuid
// or it is not a row id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Mint a reference. Returns an empty string when unconfigured or when any input fails its shape
// check, so every caller fails closed: no reference, no link, and the row renders as plain text.
export function chatRef(owner: string, kind: ChatRefKind, id: string, now: Date = new Date()): string {
  const key = keyOrNull();
  if (!key || !owner || !KINDS.includes(kind) || !UUID.test(id)) return '';
  const exp = Math.floor(now.getTime() / 1000) + CHAT_REF_TTL_SECONDS;
  const plain = JSON.stringify({ o: owner, k: kind, i: id, exp });
  // A fresh random nonce per reference, so two references to the same chat never look alike.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

// Verify and open a reference. Null for anything missing, malformed, tampered, forged or
// expired. Never throws: a bad reference is a man with a stale link, and the answer to that is
// the chat list, not a stack trace.
export function verifyChatRef(ref: string | null | undefined, now: Date = new Date()): ChatRefClaim | null {
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
    const body = JSON.parse(plain) as { o?: unknown; k?: unknown; i?: unknown; exp?: unknown };
    const exp = Number(body.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
    const owner = typeof body.o === 'string' ? body.o : '';
    const kind = typeof body.k === 'string' ? body.k : '';
    const id = typeof body.i === 'string' ? body.i : '';
    // Shape checked again on the way out, so a claim minted under an older, looser rule must
    // not carry something this build would never have accepted on the way in.
    if (!owner || !KINDS.includes(kind as ChatRefKind) || !UUID.test(id)) return null;
    return { owner, kind: kind as ChatRefKind, id };
  } catch {
    return null;
  }
}

// ⚠️ THE CHECK THE CHAT VIEW MUST MAKE, AND IT IS A FUNCTION SO A TEST CAN ATTACK IT.
//
// A reference is minted for one account. The view resolves the session first and then asks
// this, so a reference that leaks shows the wrong man nothing. The row reads are scoped by
// user_id anyway, which makes this belt on top of braces, and both stay.
export function chatRefBelongsTo(claim: ChatRefClaim | null, sessionOwner: string): boolean {
  return claim !== null && sessionOwner !== '' && claim.owner === sessionOwner;
}
