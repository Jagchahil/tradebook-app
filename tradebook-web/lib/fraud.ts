// HMRC fraud prevention: the client collected values and the server side
// assembly of a full FraudContext. Closes docs/66 section 8.
//
// Connection method is WEB_APP_VIA_SERVER. Some Gov-Client values can only be
// gathered on the user's device (a persisted device id, the browser JS user
// agent, screen and window geometry, timezone, an optional public port and MFA
// state). The device collects them and forwards them to us; we merge them with
// the values the server can derive from the request (the end user's public IP,
// a timestamp, our vendor details) into the FraudContext that lib/hmrc.ts turns
// into headers.
//
// SECURITY. Every field here starts life on an untrusted client and ends up as
// an outbound HTTP header value on our request to HMRC. A raw carriage return
// or line feed in a header value is a header injection primitive, so
// sanitizeClientFraud strips all control characters, trims, and caps length
// before any value is trusted. Nothing is ever sent to HMRC unsanitised.

import type { FraudContext } from './hmrc';

export interface ClientFraud {
  deviceId?: string;
  browserJsUserAgent?: string;
  screens?: string; // 'width=1920&height=1080&scaling-factor=1&colour-depth=24'
  windowSize?: string; // 'width=1256&height=803'
  timezone?: string; // 'UTC+00:00'
  clientPublicPort?: string;
  multiFactor?: string;
}

const MAX_LEN = 2048;

// Drop CR, LF, NUL and every other C0 control char (code < 32) plus DEL (127),
// then trim and cap length. A char-code filter is used deliberately so there is
// no control character literal in this source file. Returns undefined for
// anything empty or not a string, so the header is omitted (HMRC's documented
// behaviour) rather than sent blank or malformed.
function headerSafe(value: unknown, max = MAX_LEN): string | undefined {
  if (typeof value !== 'string') return undefined;
  let cleaned = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) continue;
    cleaned += value[i];
  }
  cleaned = cleaned.trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, max);
}

// Our own device id. Must look like an id we generated, not free text, so a
// client cannot smuggle arbitrary content into the Gov-Client-Device-ID header.
function deviceIdSafe(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return /^[A-Za-z0-9._:-]{8,64}$/.test(s) ? s : undefined;
}

// A port is 1 to 65535. Anything else is dropped.
function portSafe(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const digits = String(value).replace(/[^0-9]/g, '').slice(0, 5);
  if (!digits) return undefined;
  const n = Number(digits);
  return n >= 1 && n <= 65535 ? String(n) : undefined;
}

// Turn whatever the client sent into a safe, minimal ClientFraud. Never throws.
export function sanitizeClientFraud(raw: unknown): ClientFraud {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: ClientFraud = {};
  const dev = deviceIdSafe(r.deviceId);
  if (dev) out.deviceId = dev;
  const ua = headerSafe(r.browserJsUserAgent);
  if (ua) out.browserJsUserAgent = ua;
  const screens = headerSafe(r.screens, 256);
  if (screens) out.screens = screens;
  const windowSize = headerSafe(r.windowSize, 128);
  if (windowSize) out.windowSize = windowSize;
  const timezone = headerSafe(r.timezone, 32);
  if (timezone) out.timezone = timezone;
  const port = portSafe(r.clientPublicPort);
  if (port) out.clientPublicPort = port;
  const mf = headerSafe(r.multiFactor, 512);
  if (mf) out.multiFactor = mf;
  return out;
}

// The end user's public IP is the FIRST entry in X-Forwarded-For (the client),
// not the last, which is the nearest proxy. Gov-Client-Public-IP wants the end
// user. Falls back to x-real-ip. Returns undefined if neither is present.
export function clientPublicIpFromRequest(req: { headers: { get(name: string): string | null } }): string | undefined {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  if (first) return first;
  const real = req.headers.get('x-real-ip');
  return real ? real.trim() : undefined;
}

// Merge the device collected values with what the server can derive from the
// request and from config, into a complete FraudContext ready for lib/hmrc.ts.
// The client values are assumed already sanitized (call sanitizeClientFraud on
// the raw body first).
export function fraudContextFromRequest(
  req: { headers: { get(name: string): string | null } },
  client: ClientFraud,
  opts?: { userId?: string; vendorVersion?: string; vendorPublicIp?: string; deviceId?: string },
): FraudContext {
  const clientPublicIp = clientPublicIpFromRequest(req);
  const vendorPublicIp = opts?.vendorPublicIp || process.env.HMRC_VENDOR_PUBLIC_IP || undefined;
  return {
    deviceId: client.deviceId || opts?.deviceId,
    userId: opts?.userId,
    clientPublicIp,
    clientPublicIpTimestamp: clientPublicIp ? new Date().toISOString() : undefined,
    vendorPublicIp,
    vendorVersion: opts?.vendorVersion || process.env.HMRC_VENDOR_VERSION || '1.0.0',
    vendorProductName: 'Lekhio',
    clientPublicPort: client.clientPublicPort,
    browserJsUserAgent: client.browserJsUserAgent,
    screens: client.screens,
    windowSize: client.windowSize,
    timezone: client.timezone,
    multiFactor: client.multiFactor,
  };
}
