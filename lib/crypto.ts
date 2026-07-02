// Field-level encryption for secrets at rest (bank + HMRC OAuth tokens).
//
// We store third party OAuth tokens (TrueLayer bank access/refresh, HMRC MTD
// access/refresh) in Postgres. Those rows live behind RLS with no policies and
// the service role only, but defense in depth says a leaked database dump must
// not hand an attacker live banking tokens. So we encrypt the token fields with
// AES-256-GCM before they ever reach the database, and decrypt on read, so the
// rest of the app only ever sees plaintext.
//
// SAFE ROLLOUT. Encryption only activates once BANK_TOKEN_KEY is set. With the
// key unset, encryptSecret is a no-op and decryptSecret returns its input
// unchanged, so deploying this code alone changes nothing. Once the key is set,
// new writes are encrypted; reads transparently handle both the new enc:v1:
// ciphertext and any legacy plaintext rows, so no backfill or downtime is needed.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

// Ciphertext marker. Any stored value starting with this is our own AES-256-GCM
// output. Anything else is treated as legacy plaintext and returned unchanged,
// which is what makes reads backward compatible during and after rollout.
const PREFIX = 'enc:v1:';

// A fixed application salt for the scrypt key derivation path. This is not a
// secret. Its only job is to make the derived key specific to this application
// when the operator supplies a passphrase rather than a raw 32 byte key. A raw
// base64 or hex 32 byte key skips derivation entirely and is preferred.
const APP_SALT = 'lekhio.bank.token.key.v1';

// Cache the derived key across calls. Deriving via scrypt on every encrypt or
// decrypt would be needlessly slow, and the key never changes within a process.
let cachedKey: Buffer | null | undefined;

// Resolve BANK_TOKEN_KEY into a 32 byte key, or null when encryption is off.
//
// Accepted forms, in order:
//   1. base64 that decodes to exactly 32 bytes -> used directly.
//   2. hex that decodes to exactly 32 bytes -> used directly.
//   3. any other non empty string -> treated as a passphrase and stretched to
//      32 bytes with scrypt using the fixed app salt.
// An unset or empty value returns null, which switches encryption off entirely.
function resolveKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env.BANK_TOKEN_KEY;
  if (!raw || raw.trim() === '') {
    cachedKey = null;
    return cachedKey;
  }

  const value = raw.trim();

  // Try base64 first. We re encode and compare so we do not accept a string that
  // merely happens to contain base64 characters but is not real base64.
  try {
    const b64 = Buffer.from(value, 'base64');
    if (b64.length === 32 && b64.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) {
      cachedKey = b64;
      return cachedKey;
    }
  } catch {
    // fall through to the next form
  }

  // Then hex. A 32 byte key is 64 hex characters.
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    cachedKey = Buffer.from(value, 'hex');
    return cachedKey;
  }

  // Otherwise treat the value as a passphrase and derive a 32 byte key.
  cachedKey = scryptSync(value, APP_SALT, 32);
  return cachedKey;
}

// True when a usable key is configured, so callers or health checks can tell
// whether secrets are actually being encrypted at rest.
export function isEncryptionEnabled(): boolean {
  return resolveKey() !== null;
}

// Encrypt a plaintext secret for storage.
//
// With no key configured this returns the plaintext unchanged, so enabling this
// code without a key is a no-op. With a key, the output is:
//   enc:v1: + base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)
// A fresh random 12 byte IV is used per call (the standard GCM nonce size), so
// encrypting the same secret twice yields different ciphertext.
export function encryptSecret(plain: string): string {
  const key = resolveKey();
  if (!key) return plain; // encryption off: store as is

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return (
    PREFIX +
    iv.toString('base64') +
    ':' +
    authTag.toString('base64') +
    ':' +
    ciphertext.toString('base64')
  );
}

// Decrypt a stored secret back to plaintext.
//
//   null                 -> null.
//   starts with enc:v1:  -> decrypt. On any decryption error we log and return
//                           null, so a single unreadable row (wrong key, corrupt
//                           data) can never crash a whole sync run.
//   anything else        -> returned unchanged (legacy plaintext, backward
//                           compatible with rows written before encryption).
export function decryptSecret(stored: string | null): string | null {
  if (stored === null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext, pass through

  const key = resolveKey();
  if (!key) {
    // A row is encrypted but the key is not configured. We cannot read it. Log
    // and return null rather than throwing, so one row cannot take down a sync.
    console.error('[crypto] encrypted value found but BANK_TOKEN_KEY is not set');
    return null;
  }

  try {
    const body = stored.slice(PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) throw new Error('malformed ciphertext');
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
  } catch (err) {
    // Do not log the value itself. Only the fact that a row failed to decrypt.
    console.error('[crypto] failed to decrypt a stored secret:', (err as Error).message);
    return null;
  }
}
