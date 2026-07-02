// Tests the HMRC MTD foundation: the transaction-to-payload mapping and the
// hard approval gate. Runs on plain Node (TypeScript read directly). No network.
//   node test/hmrc/run-hmrc-test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const H = await import(`${pathToFileURL(path.resolve(here, '../../lib/hmrc.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const txns = [
  { amount: 5000, category: 'income' },     // turnover
  { amount: 1200, category: 'income' },     // turnover
  { amount: -400, category: 'materials' },  // costOfGoods
  { amount: -150, category: 'tools' },      // costOfGoods
  { amount: -800, category: 'subcontractor' }, // paymentsToSubcontractors
  { amount: -300, category: 'fuel' },       // carVanTravelExpenses
  { amount: -120, category: 'phone' },      // adminCosts
  { amount: -200, category: 'accountancy' },// professionalFees
  { amount: -90, category: 'meals' },       // otherExpenses
];

console.log('\n=== HMRC MTD foundation tests ===\n');

const full = H.buildPeriodicUpdate(txns, '2026-04-06', '2026-07-05');
ok('turnover sums income', full.periodIncome.turnover === 6200);
ok('costOfGoods merges materials + tools (550)', full.periodExpenses.costOfGoods === 550);
ok('paymentsToSubcontractors (800)', full.periodExpenses.paymentsToSubcontractors === 800);
ok('carVanTravelExpenses (300)', full.periodExpenses.carVanTravelExpenses === 300);
ok('adminCosts from phone (120)', full.periodExpenses.adminCosts === 120);
ok('professionalFees from accountancy (200)', full.periodExpenses.professionalFees === 200);
ok('otherExpenses from meals (90)', full.periodExpenses.otherExpenses === 90);
ok('period dates carried through', full.periodDates.periodStartDate === '2026-04-06' && full.periodDates.periodEndDate === '2026-07-05');

const consolidated = H.buildPeriodicUpdate(txns, '2026-04-06', '2026-07-05', { consolidated: true });
const totalExpenses = 400 + 150 + 800 + 300 + 120 + 200 + 90; // 2060
ok('consolidated expenses total (2060)', consolidated.periodExpenses.consolidatedExpenses === totalExpenses);
ok('consolidated has no category breakdown', Object.keys(consolidated.periodExpenses).length === 1);

// The approval gate must refuse without approved === true.
let threw = false;
try {
  await H.submitQuarterlyUpdate({
    nino: 'AA000000A', businessId: 'X', taxYear: '2026-27', accessToken: 't',
    payload: full, approved: false, fraud: {},
  });
} catch (e) {
  threw = e instanceof H.ApprovalRequiredError;
}
ok('submit refuses without explicit approval', threw);

// With approval but no credentials, it must NOT throw and must report dormant.
let dormant = null;
try {
  dormant = await H.submitQuarterlyUpdate({
    nino: 'AA000000A', businessId: 'X', taxYear: '2026-27', accessToken: 't',
    payload: full, approved: true, fraud: {},
  });
} catch {
  dormant = { ok: false, status: -1, body: 'threw' };
}
ok('approved + no credentials = dormant, no send', dormant && dormant.body === 'hmrc_not_configured');

// --- Fraud prevention headers (WEB_APP_VIA_SERVER) ------------------------
// The always-on headers must be present even with an empty context.
const baseHdr = H.fraudPreventionHeaders({});
ok('connection method is WEB_APP_VIA_SERVER', baseHdr['Gov-Client-Connection-Method'] === 'WEB_APP_VIA_SERVER');
ok('vendor product name always sent', baseHdr['Gov-Vendor-Product-Name'] === 'Lekhio');
ok('vendor version uses software=value form', baseHdr['Gov-Vendor-Version'] === 'lekhio-web=1.0.0');

// A full context should satisfy every required header (nothing missing).
const fullCtx = {
  deviceId: 'beec798b-b366-47fa-b1f8-92cede14a1ce',
  userId: 'user-123',
  clientPublicIp: '198.51.100.0',
  clientPublicIpTimestamp: '2026-07-01T14:30:05.123Z',
  vendorPublicIp: '203.0.113.6',
  clientPublicPort: '12345',
  browserJsUserAgent: 'Mozilla/5.0',
  screens: 'width=1920&height=1080&scaling-factor=1&colour-depth=24',
  windowSize: 'width=1256&height=803',
  timezone: 'UTC+00:00',
};
ok('full context leaves no required header missing', H.missingFraudHeaders(fullCtx).length === 0);
ok('empty context reports the client-collected headers missing', H.missingFraudHeaders({}).length > 0);
ok('forwarded header chains vendor then client IP', H.fraudPreventionHeaders(fullCtx)['Gov-Vendor-Forwarded'] === 'by=203.0.113.6&for=198.51.100.0');
ok('user id header uses lekhio=<id>', H.fraudPreventionHeaders(fullCtx)['Gov-Client-User-IDs'] === 'lekhio=user-123');
ok('public IP timestamp defaults when IP present but no ts', typeof H.fraudPreventionHeaders({ clientPublicIp: '198.51.100.0' })['Gov-Client-Public-IP-Timestamp'] === 'string');

// --- OAuth authorize host regression --------------------------------------
// The sign-in host must be the GOV.UK tax service (test-www.tax.service.gov.uk),
// NOT test-www.tax.service.hmrc.gov.uk, which does not resolve. Load a fresh
// module instance with credentials set so authorizeUrl returns a URL.
process.env.HMRC_CLIENT_ID = 'test-client';
process.env.HMRC_REDIRECT_URI = 'http://localhost:8610/callback';
const H2 = await import(`${pathToFileURL(path.resolve(here, '../../lib/hmrc.ts')).href}?v=authhost`);
const authUrl = H2.authorizeUrl('state123') || '';
ok('authorize host is test-www.tax.service.gov.uk (sandbox, no hmrc)', authUrl.startsWith('https://test-www.tax.service.gov.uk/oauth/authorize'));
ok('authorize URL carries the client id and redirect', authUrl.includes('client_id=test-client') && authUrl.includes('callback'));
delete process.env.HMRC_CLIENT_ID;
delete process.env.HMRC_REDIRECT_URI;

// --- Year-end: final declaration gate + calculation dormancy --------------
let fdThrew = false;
try {
  await H.submitFinalDeclaration({ nino: 'AA000000A', taxYear: '2026-27', accessToken: 't', approved: false, fraud: {} });
} catch (e) {
  fdThrew = e instanceof H.ApprovalRequiredError;
}
ok('final declaration refuses without explicit approval', fdThrew);

let fdDormant = null;
try {
  fdDormant = await H.submitFinalDeclaration({ nino: 'AA000000A', taxYear: '2026-27', accessToken: 't', approved: true, fraud: {} });
} catch {
  fdDormant = { body: 'threw' };
}
ok('final declaration approved + no credentials = dormant', fdDormant && fdDormant.body === 'hmrc_not_configured');

const trig = await H.triggerCalculation('AA000000A', '2026-27', 'intent-to-finalise', 't', {});
ok('trigger calculation is dormant with no credentials', trig && trig.ok === false && trig.status === 0);

// --- Annual: BSAS adjustments gate + losses dormancy ----------------------
let bsasThrew = false;
try {
  await H.submitBsasAdjustments({ nino: 'AA000000A', calculationId: 'c', taxYear: '2026-27', adjustments: {}, approved: false, accessToken: 't', fraud: {} });
} catch (e) {
  bsasThrew = e instanceof H.ApprovalRequiredError;
}
ok('BSAS adjustments refuse without explicit approval', bsasThrew);

const lossDormant = await H.listBroughtForwardLosses('AA000000A', '2026-27', 't', {});
ok('losses read is dormant with no credentials', lossDormant === null);

const claim = await H.createLossClaim('AA000000A', {}, 't', {});
ok('create loss claim is dormant with no credentials', claim && claim.ok === false && claim.status === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
