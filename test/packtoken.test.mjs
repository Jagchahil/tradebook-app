// Tests for lib/packtoken.ts, the signed short lived capability tokens that let
// the phone browser open a quarter end pack or a proof of income without a
// Bearer header. Pure crypto, no network. Run with: node test/packtoken.test.mjs
//
// THE HOLE THIS SUITE NOW PINS SHUT: the two documents used to share one token
// format with nothing in the signed body saying which document it was for, so a
// twenty minute link minted so a lender could see the proof of income also
// opened the quarter end pack, and the other way round. The fix is an audience
// (`aud`) inside the signed body, demanded at verification. These tests mint as
// one document and verify as the other, both ways, and prove the old audience
// free format is dead.
//
// packtoken reads its secret once at module load, so we set it before importing.

process.env.PACK_TOKEN_SECRET = 'test-secret-for-packtoken-000000';

import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const P = await import(`${pathToFileURL(path.resolve(here, '../lib/packtoken.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// The module's own token maths, restated here so the suite can mint what the
// module refuses to: an old format token with no audience, and a signed body
// with a junk audience. If the module's b64url or signature ever changes shape
// these forgeries stop matching and the tests below fail loudly, which is the
// correct outcome: the forgery tests must track the real format.
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signPayload = (payload) =>
  crypto.createHmac('sha256', process.env.PACK_TOKEN_SECRET).update(payload).digest('hex').slice(0, 32);
const mintRaw = (body) => {
  const payload = b64url(Buffer.from(JSON.stringify(body), 'utf8'));
  return `${payload}.${signPayload(payload)}`;
};
const freshExp = () => Math.floor(Date.now() / 1000) + 10 * 60;

console.log('\n=== packtoken: round trip, each document for itself ===\n');
const claim = { userId: 'user-abc-123', year: 2026, quarter: 2 };
const tok = P.packToken(claim, 'quarter-pack');
ok('token is non empty', typeof tok === 'string' && tok.length > 0);
ok('token has a payload.sig shape', tok.split('.').length === 2);
const back = P.verifyPackToken(tok, 'quarter-pack');
ok('verifies for its own audience and returns the claim', back && back.userId === 'user-abc-123' && back.year === 2026 && back.quarter === 2);
const proofTok = P.packToken(claim, 'income-proof');
ok('income proof token verifies for the income proof', P.verifyPackToken(proofTok, 'income-proof') !== null);

console.log('\n=== packtoken: the documents are not interchangeable ===\n');
// The hole itself, both ways round. Minted exactly as each route mints, then
// pushed at the other route's verification. Before 6 August 2026 both of these
// verifications succeeded.
ok('a quarter pack token does not open the income proof', P.verifyPackToken(tok, 'income-proof') === null);
ok('an income proof token does not open the quarter pack', P.verifyPackToken(proofTok, 'quarter-pack') === null);

// The old format: a correctly signed body with NO aud at all, which is exactly
// what every token minted before the audience existed looks like. It must fail
// for BOTH documents. Fail open here would keep the interchange alive for
// anyone still holding an old link.
const legacyTok = mintRaw({ u: 'user-abc-123', y: 2026, q: 2, exp: freshExp() });
ok('an old format token with no audience is dead for the quarter pack', P.verifyPackToken(legacyTok, 'quarter-pack') === null);
ok('an old format token with no audience is dead for the income proof', P.verifyPackToken(legacyTok, 'income-proof') === null);

// A signed body whose aud is present but junk: not a string, or a string that
// names no document we have. Signed with the real secret, so only the audience
// check can be the thing that rejects it.
const numericAud = mintRaw({ u: 'user-abc-123', y: 2026, q: 2, aud: 42, exp: freshExp() });
ok('a non string audience in the body is rejected', P.verifyPackToken(numericAud, 'quarter-pack') === null);
const junkAud = mintRaw({ u: 'user-abc-123', y: 2026, q: 2, aud: 'books-share', exp: freshExp() });
ok('an audience naming no document of ours is rejected', P.verifyPackToken(junkAud, 'quarter-pack') === null);

console.log('\n=== packtoken: minting demands a real audience ===\n');
// TypeScript pins the audience at compile time; these prove the runtime fails
// closed for plain JS callers too.
ok('minting with no audience yields no token', P.packToken(claim) === '');
ok('minting with an unknown audience yields no token', P.packToken(claim, 'books-share') === '');
ok('minting with a Date where the audience goes yields no token', P.packToken(claim, new Date()) === '');
ok('verifying with no audience returns null', P.verifyPackToken(tok) === null);
ok('verifying with an unknown audience returns null', P.verifyPackToken(tok, 'books-share') === null);

console.log('\n=== packtoken: rejection cases ===\n');
ok('null token returns null', P.verifyPackToken(null, 'quarter-pack') === null);
ok('empty token returns null', P.verifyPackToken('', 'quarter-pack') === null);
ok('garbage returns null', P.verifyPackToken('not-a-token', 'quarter-pack') === null);
ok('missing signature returns null', P.verifyPackToken(tok.split('.')[0], 'quarter-pack') === null);

// Tampered payload: swap in a different account id, keep the old signature.
const otherClaim = { userId: 'user-evil-999', year: 2026, quarter: 2 };
const otherTok = P.packToken(otherClaim, 'quarter-pack');
const forged = `${otherTok.split('.')[0]}.${tok.split('.')[1]}`;
ok('tampered payload with a stale signature is rejected', P.verifyPackToken(forged, 'quarter-pack') === null);

// Tampered audience: take the income proof token's payload and the quarter pack
// token's signature. Editing the aud must break the signature like any other
// field, or the audience would be a suggestion rather than a claim.
const audSwap = `${proofTok.split('.')[0]}.${tok.split('.')[1]}`;
ok('swapping the audience under an old signature is rejected', P.verifyPackToken(audSwap, 'quarter-pack') === null);

// Flip one character of the signature.
const badSig = `${tok.split('.')[0]}.${tok.split('.')[1].replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`;
ok('altered signature is rejected', P.verifyPackToken(badSig, 'quarter-pack') === null);

console.log('\n=== packtoken: expiry ===\n');
const past = new Date(Date.now() - (P.PACK_TOKEN_TTL_SECONDS + 60) * 1000);
const staleTok = P.packToken(claim, 'quarter-pack', past);
ok('a token minted in the past is expired now', P.verifyPackToken(staleTok, 'quarter-pack') === null);
// Freshly minted, checked slightly in the future but within the window: valid.
const soon = new Date(Date.now() + 60 * 1000);
ok('token still valid a minute later', P.verifyPackToken(tok, 'quarter-pack', soon) !== null);
// The right audience does not resurrect an expired token, and a live token does
// not excuse the wrong audience. Both gates hold at once.
ok('an expired token is dead even for its own audience', P.verifyPackToken(staleTok, 'quarter-pack') === null);
ok('a live token is dead for the wrong audience even in the window', P.verifyPackToken(tok, 'income-proof', soon) === null);

console.log('\n=== packtoken: url ===\n');
const url = P.packUrl(claim);
ok('url points at the pack route with a token', /\/api\/quarter-pack\?t=/.test(url));
const urlTok = decodeURIComponent(url.split('?t=')[1]);
ok('url token verifies for the quarter pack', P.verifyPackToken(urlTok, 'quarter-pack') !== null);
ok('url token does not open the income proof', P.verifyPackToken(urlTok, 'income-proof') === null);

console.log('\n=== packtoken: no secret, no tokens ===\n');
// The module reads its secret once at import, so an unset secret needs a fresh
// copy of the module imported under a cleared environment.
{
  const saved = process.env.PACK_TOKEN_SECRET;
  delete process.env.PACK_TOKEN_SECRET;
  const stage = mkdtempSync(path.join(tmpdir(), 'packtoken-nosecret-'));
  const src = readFileSync(path.resolve(here, '../lib/packtoken.ts'), 'utf8');
  writeFileSync(path.join(stage, 'packtoken.ts'), src);
  const bare = await import(pathToFileURL(path.join(stage, 'packtoken.ts')).href);
  ok('with no secret configured, minting yields no token', bare.packToken(claim, 'quarter-pack') === '');
  ok('with no secret configured, a previously valid token does not verify', bare.verifyPackToken(tok, 'quarter-pack') === null);
  process.env.PACK_TOKEN_SECRET = saved;
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
