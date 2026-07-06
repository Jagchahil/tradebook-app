// Tests for lib/packtoken.ts, the signed short lived capability tokens that let
// the phone browser open a quarter end pack without a Bearer header. Pure crypto,
// no network. Run with: node test/packtoken.test.mjs
//
// packtoken reads its secret once at module load, so we set it before importing.

process.env.PACK_TOKEN_SECRET = 'test-secret-for-packtoken-000000';

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const P = await import(`${pathToFileURL(path.resolve(here, '../lib/packtoken.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== packtoken: round trip ===\n');
const claim = { userId: 'user-abc-123', year: 2026, quarter: 2 };
const tok = P.packToken(claim);
ok('token is non empty', typeof tok === 'string' && tok.length > 0);
ok('token has a payload.sig shape', tok.split('.').length === 2);
const back = P.verifyPackToken(tok);
ok('verifies and returns the claim', back && back.userId === 'user-abc-123' && back.year === 2026 && back.quarter === 2);

console.log('\n=== packtoken: rejection cases ===\n');
ok('null token returns null', P.verifyPackToken(null) === null);
ok('empty token returns null', P.verifyPackToken('') === null);
ok('garbage returns null', P.verifyPackToken('not-a-token') === null);
ok('missing signature returns null', P.verifyPackToken(tok.split('.')[0]) === null);

// Tampered payload: swap in a different account id, keep the old signature.
const otherClaim = { userId: 'user-evil-999', year: 2026, quarter: 2 };
const otherTok = P.packToken(otherClaim);
const forged = `${otherTok.split('.')[0]}.${tok.split('.')[1]}`;
ok('tampered payload with a stale signature is rejected', P.verifyPackToken(forged) === null);

// Flip one character of the signature.
const badSig = `${tok.split('.')[0]}.${tok.split('.')[1].replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`;
ok('altered signature is rejected', P.verifyPackToken(badSig) === null);

console.log('\n=== packtoken: expiry ===\n');
const past = new Date(Date.now() - (P.PACK_TOKEN_TTL_SECONDS + 60) * 1000);
const staleTok = P.packToken(claim, past);
ok('a token minted in the past is expired now', P.verifyPackToken(staleTok) === null);
// Freshly minted, checked slightly in the future but within the window: valid.
const soon = new Date(Date.now() + 60 * 1000);
ok('token still valid a minute later', P.verifyPackToken(tok, soon) !== null);

console.log('\n=== packtoken: url ===\n');
const url = P.packUrl(claim);
ok('url points at the pack route with a token', /\/api\/quarter-pack\?t=/.test(url));
ok('url token verifies', P.verifyPackToken(decodeURIComponent(url.split('?t=')[1])) !== null);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
