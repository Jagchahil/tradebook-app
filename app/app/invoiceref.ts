// app/app/invoiceref.ts. HOW AN INVOICE IS POINTED AT WITHOUT ITS ID EVER REACHING AN APP URL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE PRECEDENT IS app/app/entryref.ts, AND THE RULE IS THE SAME RULE.
//
// test/webauth.test.mjs holds the whole web app to one shape: THERE IS NOWHERE TO PUT AN ID.
// The invoice list needed a detail view, and /app/invoices/[id] would have punched the second
// hole in that wall, so the link carries a sealed reference instead: the row id and the owner,
// encrypted with AES-256-GCM. Nothing in it can be read, nothing in it can be changed without
// the auth tag failing, and there is nothing to enumerate.
//
// ⚠️ THIS IS ITS OWN MODULE, NOT A WIDENING OF entryref.ts, ON PURPOSE. entryref carries a month
// because the money detail page reads through the month query. An invoice has no month, and
// teaching entryref to sometimes not have one would loosen the shape check that makes a stale
// or forged money reference die cleanly. Two small sealed shapes beat one clever one. The salt
// below also differs, so a reference minted by one module can never open the other.
//
// ⚠️ AND THE REFERENCE GRANTS NOTHING, exactly as entryref's header says. The detail page still
// resolves the user from the session, still checks the claim names that same user AND the
// purpose it was minted for (invoiceRefUsable), and only then reads the row. A leaked
// reference in a stranger's hands meets the sign in page; a borrowed one meets the ownership
// check; a forged one meets the auth tag.
//
// ⚠️ THE PUBLIC PAGES ARE NOT AN EXCEPTION TO THE RULE, THEY ARE A DIFFERENT RULE. /invoice/[id]
// and /pay/[id] carry the raw id on purpose: they are capability links a tradesman hands to HIS
// customer, who has no session and never will. This module is for the tradesman's own app URLs,
// where a session exists and an id would be a hole.
//
// ⚠️ THE KIND IS PART OF THE SEALED CLAIM, the same lesson lib/bookshare.ts signs its purpose
// prefix for: a token minted for one job must never be replayable at another. 'invoice' opens
// the invoice detail page. 'share' lets /app/share-books show a freshly minted books link once,
// briefly, after the redirect that created it, without the share id riding in the URL.
//
// The key is derived from WEB_SESSION_SECRET with this module's own salt, not used raw and not
// a new secret, for entryref's stated reason: a brand new env var that is unset in production
// means no links at all, silently, and scrypt with a distinct salt makes this key a DIFFERENT
// key from the session signer and from entryref's. Lives under app/app because it is a shape of
// the web surface, not an engine. Pure apart from the env read, so tests attack it directly.

import crypto from 'node:crypto';

const SECRET = process.env.WEB_SESSION_SECRET || '';

// Not a secret. It only makes the derived key specific to this module.
const SALT = 'lekhio.invoice.ref.v1';

// Derived once per process, entryref's own reasoning: scrypt is deliberately slow and the list
// page mints one reference per row.
let cachedKey: Buffer | null | undefined;
function keyOrNull(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = SECRET.length >= 32 ? crypto.scryptSync(SECRET, SALT, 32) : null;
  return cachedKey;
}

export function invoiceRefsConfigured(): boolean {
  return keyOrNull() !== null;
}

export type RefKind = 'invoice' | 'share';

// Four hours for an invoice, entryref's judgement: longer than any sitting, dead the same day.
// Fifteen minutes for a share, because that reference exists only to carry a books link across
// one redirect, and a link to a man's books must not be resurrectable from browser history over
// lunch. Expiry costs him nothing either way: a stale link lands back on the list it came from.
export const INVOICE_REF_TTL_SECONDS = 4 * 60 * 60;
export const SHARE_REF_TTL_SECONDS = 15 * 60;

export interface InvoiceRefClaim {
  owner: string;  // the account the reference was minted for. Checked against the session.
  row: string;    // the row id, which never appears anywhere a customer can read.
  kind: RefKind;  // what the reference may open. Checked by the page that opens it.
}

// The same shape rule entryref and lib/supabase.ts apply: a row id is a uuid or it is not a
// row id.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isKind(x: unknown): x is RefKind {
  return x === 'invoice' || x === 'share';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Mint a reference. Returns an empty string when unconfigured or when any input fails its shape
// check, so every caller fails closed: no reference, no link, and the row renders as the plain
// text it always was.
export function invoiceRef(owner: string, row: string, kind: RefKind, now: Date = new Date()): string {
  const key = keyOrNull();
  if (!key || !owner || !UUID.test(row) || !isKind(kind)) return '';
  const ttl = kind === 'share' ? SHARE_REF_TTL_SECONDS : INVOICE_REF_TTL_SECONDS;
  const exp = Math.floor(now.getTime() / 1000) + ttl;
  const plain = JSON.stringify({ o: owner, r: row, k: kind, exp });
  // A fresh random nonce per reference, the standard GCM shape entryref and lib/crypto.ts use.
  // Two references to the same row never look alike, which is what opaque means.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${b64url(iv)}.${b64url(cipher.getAuthTag())}.${b64url(ct)}`;
}

// Verify and open a reference. Null for anything missing, malformed, tampered, forged or
// expired. Never throws: a bad reference is a man with a stale link, and the answer to that is
// the list page, not a stack trace.
export function verifyInvoiceRef(ref: string | null | undefined, now: Date = new Date()): InvoiceRefClaim | null {
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
    const body = JSON.parse(plain) as { o?: unknown; r?: unknown; k?: unknown; exp?: unknown };
    const exp = Number(body.exp);
    if (!Number.isFinite(exp) || exp < Math.floor(now.getTime() / 1000)) return null;
    const owner = typeof body.o === 'string' ? body.o : '';
    const row = typeof body.r === 'string' ? body.r : '';
    // Shape checked again on the way out, entryref's rule: a reference minted under an older,
    // looser rule must not carry something this build would never have accepted on the way in.
    if (!owner || !UUID.test(row) || !isKind(body.k)) return null;
    return { owner, row, kind: body.k };
  } catch {
    return null;
  }
}

// ⚠️ THE CHECK EVERY OPENING PAGE MUST MAKE, AND IT IS ONE FUNCTION SO A TEST CAN ATTACK IT.
//
// Both fences in one place, so a page cannot remember the owner and forget the kind: the claim
// must have been minted for the session asking AND for the job the page does. entryref keeps
// them separate because it has one kind; with two, a split check is a check half made.
export function invoiceRefUsable(claim: InvoiceRefClaim | null, sessionOwner: string, kind: RefKind): boolean {
  return claim !== null && sessionOwner !== '' && claim.owner === sessionOwner && claim.kind === kind;
}
