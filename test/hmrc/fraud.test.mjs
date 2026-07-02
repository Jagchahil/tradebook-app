// Unit tests for the HMRC fraud collection lib. Run: node test/hmrc/fraud.test.mjs
import {
  sanitizeClientFraud,
  clientPublicIpFromRequest,
  fraudContextFromRequest,
} from '../../lib/fraud.ts';

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

function reqWith(headers) {
  return { headers: { get: (k) => headers[k.toLowerCase()] ?? null } };
}

// --- Header injection is neutralised ---------------------------------------
const injected = sanitizeClientFraud({
  browserJsUserAgent: 'Mozilla/5.0\r\nGov-Client-Public-IP: 6.6.6.6',
  screens: 'width=1920\nX-Evil: 1',
  timezone: 'UTC+00:00\r\n',
  deviceId: 'abc\r\n123',
});
check('CRLF stripped from user agent', !/[\r\n]/.test(injected.browserJsUserAgent || ''));
check('user agent keeps its safe text', injected.browserJsUserAgent === 'Mozilla/5.0Gov-Client-Public-IP: 6.6.6.6');
check('newline stripped from screens', !/[\r\n]/.test(injected.screens || ''));
check('timezone trimmed of CRLF', injected.timezone === 'UTC+00:00');
check('deviceId with control chars is rejected', injected.deviceId === undefined);

// --- Valid values pass through ---------------------------------------------
const clean = sanitizeClientFraud({
  deviceId: '9f8c1b2a-4d5e-6f70-8a9b-0c1d2e3f4a5b',
  browserJsUserAgent: 'Mozilla/5.0 (iPhone)',
  screens: 'width=1170&height=2532&scaling-factor=3&colour-depth=24',
  windowSize: 'width=390&height=844',
  timezone: 'UTC+01:00',
  clientPublicPort: '54321',
  multiFactor: 'type=OTHER&timestamp=2026-07-02T22:00:00.000Z&unique-reference=abc',
});
check('valid deviceId kept', clean.deviceId === '9f8c1b2a-4d5e-6f70-8a9b-0c1d2e3f4a5b');
check('valid screens kept', clean.screens === 'width=1170&height=2532&scaling-factor=3&colour-depth=24');
check('valid window size kept', clean.windowSize === 'width=390&height=844');
check('valid timezone kept', clean.timezone === 'UTC+01:00');
check('valid port kept', clean.clientPublicPort === '54321');
check('valid multiFactor kept', clean.multiFactor?.startsWith('type=OTHER'));

// --- Junk / edge inputs ----------------------------------------------------
check('non-object raw returns empty', Object.keys(sanitizeClientFraud(null)).length === 0);
check('port out of range dropped', sanitizeClientFraud({ clientPublicPort: '99999' }).clientPublicPort === undefined);
check('port from noisy string extracted', sanitizeClientFraud({ clientPublicPort: 'port 443 ' }).clientPublicPort === '443');
check('short deviceId rejected', sanitizeClientFraud({ deviceId: 'abc' }).deviceId === undefined);
check('overlong deviceId rejected', sanitizeClientFraud({ deviceId: 'a'.repeat(100) }).deviceId === undefined);
check('empty string omitted', sanitizeClientFraud({ timezone: '   ' }).timezone === undefined);

// --- Client public IP: first XFF entry (the end user), not the proxy -------
check(
  'first XFF entry is used',
  clientPublicIpFromRequest(reqWith({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1, 10.0.0.2' })) === '203.0.113.9',
);
check(
  'x-real-ip fallback',
  clientPublicIpFromRequest(reqWith({ 'x-real-ip': '198.51.100.7' })) === '198.51.100.7',
);
check('no ip headers returns undefined', clientPublicIpFromRequest(reqWith({})) === undefined);

// --- Context assembly merges request + client + config ---------------------
const ctx = fraudContextFromRequest(
  reqWith({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
  clean,
  { userId: 'user-123', vendorVersion: '1.2.3', vendorPublicIp: '52.10.20.30' },
);
check('context takes client IP from first XFF', ctx.clientPublicIp === '203.0.113.9');
check('context sets a timestamp when IP present', typeof ctx.clientPublicIpTimestamp === 'string' && ctx.clientPublicIpTimestamp.endsWith('Z'));
check('context carries userId', ctx.userId === 'user-123');
check('context carries vendor version', ctx.vendorVersion === '1.2.3');
check('context carries vendor public IP', ctx.vendorPublicIp === '52.10.20.30');
check('context product name is Lekhio', ctx.vendorProductName === 'Lekhio');
check('context carries device id from client', ctx.deviceId === clean.deviceId);
check('context carries browser UA', ctx.browserJsUserAgent === clean.browserJsUserAgent);
check('no timestamp when no IP', fraudContextFromRequest(reqWith({}), {}).clientPublicIpTimestamp === undefined);

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
