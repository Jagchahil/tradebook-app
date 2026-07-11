// Tests for lib/crypto.ts, the field level encryption for OAuth tokens at rest
// (bank + HMRC access/refresh tokens). Pure functions, no network. Run with:
//   node test/crypto.test.mjs   (Node 22.6+, TypeScript type stripping)
//
// The module reads BANK_TOKEN_KEY once and caches the derived key for the life
// of the module instance. To exercise both the key-off and key-on states, and
// two different keys at once (the wrong-key case), we import the module several
// times with a distinct query string each time. Each distinct URL is a fresh
// module instance with its own cached key, and we set process.env immediately
// before the FIRST call into each instance so it resolves the key we intend.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cryptoUrl = pathToFileURL(path.resolve(here, '../lib/crypto.ts')).href;

// Load a fresh instance of the crypto module with BANK_TOKEN_KEY set to `key`
// (undefined to leave it unset). We trigger resolveKey immediately via
// isEncryptionEnabled so the instance caches this key before env changes again.
async function load(tag, key) {
  if (key === undefined) delete process.env.BANK_TOKEN_KEY;
  else process.env.BANK_TOKEN_KEY = key;
  const m = await import(`${cryptoUrl}?case=${tag}`);
  m.isEncryptionEnabled(); // force the one-time key resolution now
  return m;
}

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// A raw 32 byte base64 key, and a second, different one for the wrong-key test.
const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 7).toString('base64');
const KEY_HEX = Buffer.alloc(32, 9).toString('hex'); // 64 hex chars
const PASSPHRASE = 'correct horse battery staple lekhio';

console.log('\n=== crypto: encryption OFF (no key) ===\n');
{
  const c = await load('off', undefined);
  ok('isEncryptionEnabled is false with no key', c.isEncryptionEnabled() === false);
  ok('encryptSecret is a no-op passthrough', c.encryptSecret('sk_live_abc') === 'sk_live_abc');
  ok('decryptSecret passes plaintext through', c.decryptSecret('sk_live_abc') === 'sk_live_abc');
  ok('decryptSecret(null) is null', c.decryptSecret(null) === null);
  ok('no enc:v1: prefix is ever written when off', !c.encryptSecret('x').startsWith('enc:v1:'));
}

console.log('\n=== crypto: encryption ON (raw base64 key) ===\n');
{
  const c = await load('base64', KEY_A);
  ok('isEncryptionEnabled is true with a key', c.isEncryptionEnabled() === true);

  const secret = 'truelayer-refresh-Zm9vYmFy-9931';
  const enc = c.encryptSecret(secret);
  ok('ciphertext carries the enc:v1: marker', enc.startsWith('enc:v1:'));
  ok('ciphertext does not contain the plaintext', !enc.includes(secret));
  ok('round trips back to the plaintext', c.decryptSecret(enc) === secret);

  // Fresh 12 byte IV per call, so the same secret encrypts to different bytes.
  const enc2 = c.encryptSecret(secret);
  ok('encrypting twice yields different ciphertext (fresh IV)', enc !== enc2);
  ok('both ciphertexts still decrypt to the same plaintext', c.decryptSecret(enc2) === secret);

  // Backward compatibility: a legacy plaintext row (no prefix) passes through
  // unchanged even when the key is set, so no backfill is needed on rollout.
  ok('legacy plaintext row passes through unchanged', c.decryptSecret('legacy-plain-token') === 'legacy-plain-token');
  ok('decryptSecret(null) is null when on', c.decryptSecret(null) === null);

  // Empty string still round trips (an absent-but-present token field).
  ok('empty string round trips', c.decryptSecret(c.encryptSecret('')) === '');

  // Tamper detection. GCM auth must reject any altered byte. We flip the FIRST
  // base64 character of the target part, which always maps to real high-order
  // bits of the first byte (unlike a trailing char, whose low bits can be
  // discarded to padding and leave the decoded bytes unchanged).
  const flip = (ch) => (ch === 'A' ? 'B' : 'A');
  const mutFirst = (s) => flip(s[0]) + s.slice(1);
  // enc format is enc:v1:<ivB64>:<tagB64>:<ctB64>. Splitting on ':' gives
  // ['enc','v1','<iv>','<tag>','<ct>'].
  const parts = enc.split(':');
  ok('enc format is enc:v1:iv:tag:ct (5 colon-parts)', parts.length === 5 && parts[0] === 'enc' && parts[1] === 'v1');

  const tamperedCt = ['enc', 'v1', parts[2], parts[3], mutFirst(parts[4])].join(':');
  ok('tampered ciphertext fails auth and returns null', c.decryptSecret(tamperedCt) === null);

  const tamperedTag = ['enc', 'v1', parts[2], mutFirst(parts[3]), parts[4]].join(':');
  ok('tampered auth tag returns null', c.decryptSecret(tamperedTag) === null);

  const tamperedIv = ['enc', 'v1', mutFirst(parts[2]), parts[3], parts[4]].join(':');
  ok('tampered IV returns null', c.decryptSecret(tamperedIv) === null);

  ok('malformed ciphertext (too few parts) returns null', c.decryptSecret('enc:v1:onlyonepart') === null);
  ok('marker with garbage body returns null', c.decryptSecret('enc:v1:@@@:@@@:@@@') === null);
}

console.log('\n=== crypto: key forms all enable encryption and round trip ===\n');
{
  const cHex = await load('hex', KEY_HEX);
  ok('64-char hex key enables encryption', cHex.isEncryptionEnabled() === true);
  ok('hex key round trips', cHex.decryptSecret(cHex.encryptSecret('hex-secret')) === 'hex-secret');

  const cPass = await load('pass', PASSPHRASE);
  ok('passphrase enables encryption', cPass.isEncryptionEnabled() === true);
  ok('passphrase key round trips', cPass.decryptSecret(cPass.encryptSecret('pass-secret')) === 'pass-secret');
}

console.log('\n=== crypto: wrong key cannot read another key’s ciphertext ===\n');
{
  // Instance A caches KEY_A on load; instance B caches KEY_B on load. Because
  // each caches at load time, they hold different keys simultaneously.
  const a = await load('wrongkey-a', KEY_A);
  const b = await load('wrongkey-b', KEY_B);
  const enc = a.encryptSecret('bank-access-token-123');
  ok('the right key decrypts', a.decryptSecret(enc) === 'bank-access-token-123');
  ok('a different key returns null, never throws', b.decryptSecret(enc) === null);
}

console.log('\n=== crypto: encrypted row is unreadable when the key is later removed ===\n');
{
  const on = await load('later-on', KEY_A);
  const enc = on.encryptSecret('token-written-while-keyed');
  const off = await load('later-off', undefined);
  // An enc:v1: value found while the key is unset cannot be read: null, not a crash.
  ok('encrypted value with key removed returns null', off.decryptSecret(enc) === null);
  // But plaintext still passes through, so mixed rows never crash a sync.
  ok('plaintext still passes through with key removed', off.decryptSecret('plain') === 'plain');
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
