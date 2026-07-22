// The ad and post connectors (pure logic in lib/connectors.ts). Run: node test/connectors.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'conn-'));
writeFileSync(path.join(stage, 'connectors.ts'), readFileSync(path.join(lib, 'connectors.ts'), 'utf8'));
// Configure a full set of env so the pure builders have something to build with.
process.env.META_APP_ID = 'meta-id';
process.env.META_APP_SECRET = 'meta-secret';
process.env.META_REDIRECT_URI = 'https://lekhio.app/api/connectors/meta/callback';
process.env.TIKTOK_CLIENT_KEY = 'ttk-key';
process.env.TIKTOK_CLIENT_SECRET = 'ttk-secret';
process.env.TIKTOK_REDIRECT_URI = 'https://lekhio.app/api/connectors/tiktok/callback';
process.env.LINKEDIN_CLIENT_ID = 'li-id';
process.env.LINKEDIN_CLIENT_SECRET = 'li-sec';
process.env.LINKEDIN_REDIRECT_URI = 'https://lekhio.app/api/connectors/linkedin/callback';
process.env.REDDIT_CLIENT_ID = 'rd-id';
process.env.REDDIT_CLIENT_SECRET = 'rd-sec';
process.env.REDDIT_REDIRECT_URI = 'https://lekhio.app/api/connectors/reddit/callback';
process.env.TWITTER_CLIENT_ID = 'x-id';
process.env.TWITTER_CLIENT_SECRET = 'x-sec';
process.env.TWITTER_REDIRECT_URI = 'https://lekhio.app/api/connectors/twitter/callback';
const K = await import(pathToFileURL(path.join(stage, 'connectors.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

console.log('\n=== ships dark, config detection ===\n');
ok('CONNECTORS_ENABLED off by default', K.CONNECTORS_ENABLED() === false);
ok('meta reads as configured with full env', K.connectorConfigured('meta') === true);
ok('google reads as not configured (no env set)', K.connectorConfigured('google') === false);
ok('isConnector guards the platform string', K.isConnector('meta') && !K.isConnector('myspace'));

console.log('\n=== authorize URL is correct per platform ===\n');
const st = K.signState('meta:nonce123', 'sekret');
const mu = new URL(K.authorizeUrl('meta', st));
ok('meta hits the facebook dialog', mu.origin + mu.pathname === 'https://www.facebook.com/v21.0/dialog/oauth');
ok('meta carries client_id, not client_key', mu.searchParams.get('client_id') === 'meta-id' && !mu.searchParams.has('client_key'));
ok('meta asks for instagram_content_publish', (mu.searchParams.get('scope') || '').includes('instagram_content_publish'));
ok('meta response_type is code and state is passed', mu.searchParams.get('response_type') === 'code' && mu.searchParams.get('state') === st);
const tu = new URL(K.authorizeUrl('tiktok', st));
ok('tiktok uses client_key', tu.searchParams.get('client_key') === 'ttk-key' && !tu.searchParams.has('client_id'));
ok('tiktok asks to publish video', (tu.searchParams.get('scope') || '').includes('video.publish'));
const gu = new URL(K.authorizeUrl('google', K.signState('google:n', 'sekret')));
ok('google asks offline with consent for a refresh token', gu.searchParams.get('access_type') === 'offline' && gu.searchParams.get('prompt') === 'consent');

console.log('\n=== signed state round trips and rejects tampering ===\n');
ok('a good state verifies back to its payload', K.verifyState(st, 'sekret') === 'meta:nonce123');
ok('a wrong secret rejects', K.verifyState(st, 'other') === null);
ok('a tampered body rejects', K.verifyState('AAAA.' + st.split('.')[1], 'sekret') === null);
ok('no secret fails closed', K.verifyState(st, '') === null);
ok('garbage rejects', K.verifyState('not-a-token', 'sekret') === null);

console.log('\n=== meta webhook verify and signature ===\n');
process.env.META_VERIFY_TOKEN = 'vt';
ok('meta webhook echoes the challenge on a token match', K.verifyMetaWebhook('subscribe', 'vt', 'CH') === 'CH');
ok('meta webhook refuses a wrong token', K.verifyMetaWebhook('subscribe', 'nope', 'CH') === null);
import cryptoM from 'node:crypto';
const raw = '{"hello":"world"}';
const good = 'sha256=' + cryptoM.createHmac('sha256', 'app-secret').update(raw, 'utf8').digest('hex');
ok('a correct signature passes', K.verifyMetaSignature(raw, good, 'app-secret') === true);
ok('a wrong signature fails', K.verifyMetaSignature(raw, 'sha256=deadbeef', 'app-secret') === false);
ok('no secret fails closed', K.verifyMetaSignature(raw, good, '') === false);

console.log('\n=== tiktok shared secret webhook ===\n');
ok('tiktok webhook passes on the shared secret', K.verifyTikTokWebhook('shh', 'shh') === true);
ok('tiktok webhook fails on the wrong secret', K.verifyTikTokWebhook('nope', 'shh') === false);

console.log('\n=== exchangeCode refuses while dark ===\n');
const r = await K.exchangeCode('meta', 'somecode');
ok('exchange is refused with reason disabled while off', r.ok === false && r.error === 'disabled');

console.log('\n=== new platforms: linkedin, x (pkce), reddit ===\n');
ok('CONNECTORS has all six', K.CONNECTORS.length === 6);
ok('linkedin configured', K.connectorConfigured('linkedin') === true);
ok('reddit configured', K.connectorConfigured('reddit') === true);
ok('twitter configured', K.connectorConfigured('twitter') === true);
const lu = new URL(K.authorizeUrl('linkedin', st));
ok('linkedin hits linkedin authorize', lu.origin + lu.pathname === 'https://www.linkedin.com/oauth/v2/authorization');
ok('linkedin asks w_member_social', (lu.searchParams.get('scope') || '').includes('w_member_social'));
const ru = new URL(K.authorizeUrl('reddit', st));
ok('reddit asks duration permanent for a refresh token', ru.searchParams.get('duration') === 'permanent');
ok('reddit asks the submit scope', (ru.searchParams.get('scope') || '').includes('submit'));
const pv = K.pkceVerifier();
const pc = K.pkceChallenge(pv);
ok('pkce verifier and challenge are both present and differ', Boolean(pv) && Boolean(pc) && pv !== pc);
ok('pkce challenge is stable for a verifier', K.pkceChallenge(pv) === pc);
const xu = new URL(K.authorizeUrl('twitter', st, { codeChallenge: pc }));
ok('x carries the pkce challenge and S256', xu.searchParams.get('code_challenge') === pc && xu.searchParams.get('code_challenge_method') === 'S256');
ok('x with no challenge omits the pkce params', !new URL(K.authorizeUrl('twitter', st)).searchParams.has('code_challenge'));
ok('x asks tweet.write with offline access', (xu.searchParams.get('scope') || '').includes('tweet.write') && (xu.searchParams.get('scope') || '').includes('offline.access'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
