// scripts/hmrc-sandbox-demo.mjs
//
// Push-button HMRC MTD for Income Tax SANDBOX round trip, for the recognition
// demonstration (see docs/66). It drives the exact loop HMRC want to see:
//   create test user -> find business id -> connect (OAuth) -> obligations ->
//   build a cumulative summary -> approve -> submit -> validate fraud headers.
//
// It reuses the REAL production code in lib/hmrc.ts (buildPeriodicUpdate, the
// fraud-prevention header builder, and the approval-gated submit), so what you
// demonstrate is the same code path that would run live. Only the sandbox-only
// helpers (create test user, list businesses, header validator) are added here.
//
// SANDBOX ONLY, BY DESIGN. It refuses to run if HMRC_BASE_URL points at the live
// service. Nothing here can file a real return. The submit step still honours the
// hard approval gate: it will not send unless you pass --approve.
//
// SECRETS: read from the environment or a local .env.local / .env file. Never
// hardcode. Tokens and test-user credentials are cached in .hmrc-sandbox.json,
// which is gitignored. Do not commit that file.
//
// USAGE (run each step in order the first time):
//   node scripts/hmrc-sandbox-demo.mjs server-token
//   node scripts/hmrc-sandbox-demo.mjs create-user
//   node scripts/hmrc-sandbox-demo.mjs authorize        # opens a local callback
//   node scripts/hmrc-sandbox-demo.mjs businesses
//   node scripts/hmrc-sandbox-demo.mjs obligations
//   node scripts/hmrc-sandbox-demo.mjs submit           # dry run, prints payload
//   node scripts/hmrc-sandbox-demo.mjs submit --approve # actually submits
//   node scripts/hmrc-sandbox-demo.mjs fph              # validate fraud headers
//   node scripts/hmrc-sandbox-demo.mjs status           # show cached state
//
// PREREQUISITES (one time, in the HMRC Developer Hub sandbox app):
//   - Subscribe the app to: Create Test User, Business Details (MTD), Obligations
//     (MTD), Self Employment Business (MTD), Test Fraud Prevention Headers.
//   - Register the local redirect URI below as an ADDITIONAL redirect URI:
//       http://localhost:8610/callback
//   - Set HMRC_CLIENT_ID, HMRC_CLIENT_SECRET in the environment (or .env.local).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATE_FILE = path.join(ROOT, '.hmrc-sandbox.json');
const DEMO_REDIRECT = process.env.HMRC_DEMO_REDIRECT_URI || 'http://localhost:8610/callback';
const SANDBOX = 'https://test-api.service.hmrc.gov.uk';

// --- tiny .env loader (no dependency) --------------------------------------
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

// The demo signs in via a LOCAL redirect so it is self contained. We override
// HMRC_REDIRECT_URI to the local callback BEFORE importing lib/hmrc.ts, because
// that module reads the redirect uri once at import time.
process.env.HMRC_REDIRECT_URI = DEMO_REDIRECT;
if (!process.env.HMRC_BASE_URL) process.env.HMRC_BASE_URL = SANDBOX;

const BASE = process.env.HMRC_BASE_URL;
const CLIENT_ID = process.env.HMRC_CLIENT_ID;
const CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET;

// Reuse the real production code path.
const HMRC = await import(pathToFileURL(path.join(ROOT, 'lib', 'hmrc.ts')).href);

// --- guards ----------------------------------------------------------------
if (BASE.includes('://api.service.hmrc.gov.uk')) {
  console.error('REFUSING TO RUN: HMRC_BASE_URL points at the LIVE service. This demo is sandbox only.');
  process.exit(2);
}
function requireCreds() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing HMRC_CLIENT_ID / HMRC_CLIENT_SECRET. Set them in the environment or .env.local.');
    process.exit(2);
  }
}

// --- state -----------------------------------------------------------------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(patch) {
  const s = { ...loadState(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
  return s;
}
const mask = (v) => (v ? `${String(v).slice(0, 4)}...(${String(v).length} chars)` : 'none');

// --- a realistic fraud-prevention context for the sandbox ------------------
// Values that a real browser would supply are filled with well formed samples so
// the validator sees the correct shape. In production these come from the client.
function demoFraudContext(userId) {
  return {
    deviceId: 'beec798b-b366-47fa-b1f8-92cede14a1ce',
    userId: userId || 'demo-user',
    clientPublicIp: '198.51.100.7',
    clientPublicIpTimestamp: new Date().toISOString(),
    vendorPublicIp: '203.0.113.6',
    clientPublicPort: '58231',
    browserJsUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    screens: 'width=1920&height=1080&scaling-factor=2&colour-depth=24',
    windowSize: 'width=1440&height=900',
    timezone: 'UTC+00:00',
    vendorVersion: process.env.npm_package_version || '1.0.0',
    // DEMO PLACEHOLDERS for the two conditional headers, so the validator shows a
    // fully clean pass. In production these are a real decision:
    //   multiFactor  -> report your actual MFA event. Lekhio signs users in with
    //                   phone OTP, which is a factor you can and should report.
    //   licenseIds   -> Lekhio has no per-device license keys (it is SaaS), so you
    //                   either send a hashed account id or declare to HMRC that this
    //                   header does not apply. Do not ship this fake value live.
    multiFactor: 'type=OTHER&timestamp=2026-07-01T13%3A20Z&unique-reference=0283da60063abfb3a87f1aed845d17fe2d9ba8c780b478dc4ae048f5ee97a6d5',
    licenseIds: 'lekhio-web=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1',
  };
}

// --- sample transactions for the cumulative summary ------------------------
// Year to date (accounting period start to latest quarter end). Positive is
// income, negative is expense, matching lib/hmrc.ts SimpleTxn.
const SAMPLE_TXNS = [
  { amount: 5200, category: 'income' },
  { amount: 3100, category: 'income' },
  { amount: -640, category: 'materials' },
  { amount: -220, category: 'tools' },
  { amount: -900, category: 'subcontractor' },
  { amount: -410, category: 'fuel' },
  { amount: -95, category: 'phone' },
  { amount: -180, category: 'accountancy' },
];

// ===========================================================================
// Steps
// ===========================================================================

// Application-restricted server token (client_credentials). Needed for the
// sandbox-only Create Test User and Test Fraud Prevention Headers endpoints.
async function serverToken() {
  requireCreds();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.error('server-token failed:', res.status, json);
    process.exit(1);
  }
  saveState({ serverToken: json.access_token });
  console.log('OK server token obtained:', mask(json.access_token));
}

async function createUser() {
  const st = loadState();
  if (!st.serverToken) { console.error('Run server-token first.'); process.exit(1); }
  const res = await fetch(`${BASE}/create-test-user/individuals`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${st.serverToken}`,
      Accept: 'application/vnd.hmrc.1.0+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serviceNames: ['national-insurance', 'self-assessment', 'mtd-income-tax'] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('create-user failed:', res.status, json); process.exit(1); }
  saveState({
    nino: json.nino,
    saUtr: json.saUtr,
    testUserId: json.userId,
    testPassword: json.password,
  });
  console.log('OK test user created.');
  console.log('  NINO      :', json.nino);
  console.log('  SA UTR    :', json.saUtr);
  console.log('  Gateway ID:', json.userId);
  console.log('  Password  :', json.password, '(sandbox only, fictional)');
  console.log('Use these Government Gateway credentials at the sign in step of "authorize".');
}

async function authorize() {
  requireCreds();
  const state = HMRC.signState('demo-user');
  const url = HMRC.authorizeUrl(state);
  if (!url) { console.error('authorizeUrl returned null. Check HMRC_CLIENT_ID and redirect uri.'); process.exit(1); }

  const port = Number(new URL(DEMO_REDIRECT).port || 8610);
  console.log('\n1) Make sure this redirect URI is registered in the sandbox app:');
  console.log('   ', DEMO_REDIRECT);
  console.log('\n2) Open this URL and sign in with the test user Government Gateway credentials:\n');
  console.log('   ', url, '\n');

  await new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, DEMO_REDIRECT);
      if (u.pathname !== new URL(DEMO_REDIRECT).pathname) { res.writeHead(404); res.end(); return; }
      const code = u.searchParams.get('code');
      const gotState = u.searchParams.get('state');
      const err = u.searchParams.get('error');
      const finish = (msg) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<p>${msg} You can close this tab.</p>`); };
      if (err || !code) { finish('Authorization failed.'); console.error('authorize error:', err || 'no code'); server.close(); return resolve(); }
      if (HMRC.verifyState(gotState) !== 'demo-user') { finish('State check failed.'); console.error('state verification failed'); server.close(); return resolve(); }
      const tokens = await HMRC.exchangeCodeForToken(code);
      if (!tokens) { finish('Token exchange failed.'); console.error('token exchange failed'); server.close(); return resolve(); }
      const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 0) * 1000).toISOString();
      saveState({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt });
      finish('Connected to HMRC sandbox.');
      console.log('OK connected. access token:', mask(tokens.access_token), 'expires', expiresAt);
      server.close();
      resolve();
    });
    server.listen(port, () => console.log(`Waiting for the HMRC redirect on ${DEMO_REDIRECT} ...`));
  });
}

async function businesses() {
  const st = loadState();
  if (!st.accessToken || !st.nino) { console.error('Run authorize and create-user first.'); process.exit(1); }
  const res = await fetch(`${BASE}/individuals/business/details/${encodeURIComponent(st.nino)}/list`, {
    headers: {
      Authorization: `Bearer ${st.accessToken}`,
      Accept: 'application/vnd.hmrc.2.0+json',
      ...HMRC.fraudPreventionHeaders(demoFraudContext('demo-user')),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { console.error('businesses failed:', res.status, json); process.exit(1); }
  const list = json.listOfBusinesses || json.businesses || [];
  const selfEmp = list.find((b) => (b.typeOfBusiness || b.businessType) === 'self-employment') || list[0];
  if (!selfEmp) { console.error('No self-employment business found for the test user.', json); process.exit(1); }
  saveState({ businessId: selfEmp.businessId });
  console.log('OK businessId:', selfEmp.businessId, '(', selfEmp.tradingName || selfEmp.typeOfBusiness || 'self-employment', ')');
}

async function obligations() {
  const st = loadState();
  if (!st.accessToken || !st.nino) { console.error('Run authorize and create-user first.'); process.exit(1); }
  const data = await HMRC.retrieveObligations(st.nino, st.accessToken, demoFraudContext('demo-user'));
  if (!data) { console.error('obligations returned nothing (check subscription and, in sandbox, Gov-Test-Scenario).'); process.exit(1); }
  console.log('OK obligations:\n', JSON.stringify(data, null, 2));
}

async function submit(approve) {
  const st = loadState();
  if (!st.accessToken || !st.nino || !st.businessId) { console.error('Run create-user, authorize, businesses first.'); process.exit(1); }
  const taxYear = process.env.HMRC_DEMO_TAX_YEAR || '2026-27';
  const consolidated = process.env.HMRC_DEMO_CONSOLIDATED === 'true';
  const start = process.env.HMRC_DEMO_PERIOD_START || '2026-04-06';
  const end = process.env.HMRC_DEMO_PERIOD_END || '2026-07-05';

  const payload = HMRC.buildPeriodicUpdate(SAMPLE_TXNS, start, end, { consolidated });
  console.log('Cumulative (year to date) payload to submit:\n', JSON.stringify(payload, null, 2));

  if (!approve) {
    console.log('\nDRY RUN. Nothing sent. Re-run with --approve to submit for real (sandbox).');
    return;
  }
  // The real approval gate: submitQuarterlyUpdate throws unless approved === true.
  const result = await HMRC.submitQuarterlyUpdate({
    nino: st.nino,
    businessId: st.businessId,
    taxYear,
    accessToken: st.accessToken,
    payload,
    approved: true,
    fraud: demoFraudContext('demo-user'),
  });
  console.log('OK submit result:', JSON.stringify(result, null, 2));
}

async function calc() {
  const st = loadState();
  if (!st.accessToken || !st.nino) { console.error('Run create-user and authorize first.'); process.exit(1); }
  const taxYear = process.env.HMRC_DEMO_TAX_YEAR || '2026-27';
  const trig = await HMRC.triggerCalculation(st.nino, taxYear, 'intent-to-finalise', st.accessToken, demoFraudContext('demo-user'));
  console.log('Trigger calculation:', JSON.stringify(trig, null, 2));
  if (!trig.calculationId) { console.error('No calculationId returned (sandbox may need a Gov-Test-Scenario for this test user).'); return; }
  const calculation = await HMRC.retrieveCalculation(st.nino, taxYear, trig.calculationId, st.accessToken, demoFraudContext('demo-user'));
  saveState({ calculationId: trig.calculationId });
  console.log('OK calculation (the income tax estimate to show the user, with a disclaimer):\n', JSON.stringify(calculation, null, 2));
}

async function finalise(approve) {
  const st = loadState();
  if (!st.accessToken || !st.nino) { console.error('Run create-user and authorize first.'); process.exit(1); }
  const taxYear = process.env.HMRC_DEMO_TAX_YEAR || '2026-27';
  if (!approve) {
    console.log('Final declaration crystallises the tax year and is irreversible. DRY RUN, nothing sent. Re-run with --approve to submit (sandbox).');
    return;
  }
  // Real approval gate: submitFinalDeclaration throws unless approved === true.
  const res = await HMRC.submitFinalDeclaration({ nino: st.nino, taxYear, accessToken: st.accessToken, approved: true, fraud: demoFraudContext('demo-user') });
  console.log('OK final declaration result:', JSON.stringify(res, null, 2));
}

async function fph() {
  const st = loadState();
  if (!st.serverToken) { console.error('Run server-token first.'); process.exit(1); }
  const ctx = demoFraudContext('demo-user');
  const missing = HMRC.missingFraudHeaders(ctx);
  if (missing.length) console.log('Note, context is missing these required headers:', missing.join(', '));
  const res = await fetch(`${BASE}/test/fraud-prevention-headers/validate`, {
    headers: {
      Authorization: `Bearer ${st.serverToken}`,
      Accept: 'application/vnd.hmrc.1.0+json',
      ...HMRC.fraudPreventionHeaders(ctx),
    },
  });
  const json = await res.json().catch(() => ({}));
  console.log('Fraud header validator status:', res.status);
  console.log(JSON.stringify(json, null, 2));
}

function status() {
  const s = loadState();
  console.log('Cached sandbox state (secrets masked):');
  console.log('  base       :', BASE);
  console.log('  serverToken:', mask(s.serverToken));
  console.log('  nino       :', s.nino || 'none');
  console.log('  businessId :', s.businessId || 'none');
  console.log('  accessToken:', mask(s.accessToken));
  console.log('  expiresAt  :', s.expiresAt || 'none');
  console.log('  testUserId :', s.testUserId || 'none');
}

// ===========================================================================
const [, , cmd, ...rest] = process.argv;
const approve = rest.includes('--approve');
const commands = {
  'server-token': serverToken,
  'create-user': createUser,
  authorize,
  businesses,
  obligations,
  submit: () => submit(approve),
  calc,
  finalise: () => finalise(approve),
  fph,
  status: async () => status(),
};

if (!cmd || !commands[cmd]) {
  console.log('HMRC MTD sandbox demo. Commands, run in order:');
  console.log('  server-token | create-user | authorize | businesses | obligations | submit [--approve] | calc | finalise [--approve] | fph | status');
  console.log('\nSee the header of this file and docs/66 for the full walkthrough.');
  process.exit(cmd ? 1 : 0);
}

commands[cmd]().catch((e) => { console.error('ERROR:', e && e.message ? e.message : e); process.exit(1); });
