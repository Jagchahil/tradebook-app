'use client';

// MANAGE YOUR SUBSCRIPTION, ON THE WEB.
//
// The app takes no payment and manages no subscription, on purpose: that keeps it
// out of Apple's in-app purchase rules and off their margin. Billing lives here,
// tied to the same phone the account uses. You sign in with a one-time code, and
// then we open Stripe's own billing portal, where cancellation, payment method
// and invoices are handled in the safe place for them.
//
// No SDK, raw fetch, same as the rest of the codebase. The one-time code goes to
// Supabase auth directly; the access token it returns is used only to open the
// portal for YOUR customer record and nothing else.

import { useState } from 'react';

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Turn UK input (07..., 447..., +44 7...) into E.164, the account key.
function toE164(raw: string): string {
  const d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) return d;
  if (d.startsWith('44')) return `+${d}`;
  if (d.startsWith('07')) return `+44${d.slice(1)}`;
  if (d.startsWith('7') && d.length === 10) return `+44${d}`;
  return d.startsWith('+') ? d : `+${d}`;
}

type Stage = 'phone' | 'code' | 'opening' | 'done' | 'nosub';

export default function AccountPage() {
  const [stage, setStage] = useState<Stage>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode() {
    setErr(null);
    const e164 = toE164(phone);
    if (e164.length < 12) { setErr('Enter your mobile number.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${SUPA}/auth/v1/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ phone: e164, create_user: false }),
      });
      if (!res.ok) { setErr('Could not send a code. Check the number and try again.'); return; }
      setStage('code');
    } catch { setErr('Could not send a code. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  async function verifyAndOpen() {
    setErr(null);
    if (code.trim().length < 4) { setErr('Enter the code from the text.'); return; }
    setBusy(true);
    try {
      const vRes = await fetch(`${SUPA}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ type: 'sms', phone: toE164(phone), token: code.trim() }),
      });
      if (!vRes.ok) { setErr('That code did not work. Try again, or resend.'); setBusy(false); return; }
      const vJson = (await vRes.json()) as { access_token?: string };
      const token = vJson.access_token;
      if (!token) { setErr('Could not sign you in. Try again.'); setBusy(false); return; }

      setStage('opening');
      const pRes = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (pRes.status === 404) { setStage('nosub'); setBusy(false); return; }
      if (!pRes.ok) { setErr('Could not open your billing just now. Try again in a minute.'); setStage('code'); setBusy(false); return; }
      const pJson = (await pRes.json()) as { url?: string };
      if (pJson.url) { window.location.href = pJson.url; return; }
      setErr('Could not open your billing just now. Try again in a minute.');
      setStage('code');
    } catch { setErr('Something went wrong. Try again in a minute.'); setStage('code'); }
    finally { setBusy(false); }
  }

  return (
    <main style={S.wrap}>
      <div style={S.card}>
        <div style={S.brand}>Lekhio</div>
        <h1 style={S.h1}>Manage your subscription</h1>
        <p style={S.sub}>
          Cancellation, payment method and invoices, all in one place. Sign in with your mobile number,
          the same one your Lekhio account uses.
        </p>

        {stage === 'phone' && (
          <>
            <label htmlFor="acct-phone" style={S.label}>Mobile number</label>
            <input
              id="acct-phone"
              aria-label="Mobile number"
              style={S.input}
              inputMode="tel"
              autoComplete="tel"
              placeholder="07123 456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendCode(); }}
            />
            {err && <p style={S.err}>{err}</p>}
            <button style={S.btn} onClick={sendCode} disabled={busy}>
              {busy ? 'Sending…' : 'Send me a code'}
            </button>
          </>
        )}

        {stage === 'code' && (
          <>
            <label htmlFor="acct-code" style={S.label}>Enter the code we texted you</label>
            <input
              id="acct-code"
              aria-label="One-time code"
              style={S.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyAndOpen(); }}
            />
            {err && <p style={S.err}>{err}</p>}
            <button style={S.btn} onClick={verifyAndOpen} disabled={busy}>
              {busy ? 'Checking…' : 'Open my billing'}
            </button>
            <button style={S.link} onClick={() => { setStage('phone'); setCode(''); setErr(null); }}>
              Use a different number
            </button>
          </>
        )}

        {stage === 'opening' && <p style={S.sub}>Opening your billing…</p>}

        {stage === 'nosub' && (
          <div style={S.note}>
            <p style={{ margin: 0 }}>
              There is no active subscription on this number. If you are on the free trial, there is
              nothing to manage yet, and nothing to pay. When you subscribe, this is where you will
              manage it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#FBFAF7', padding: 24 },
  card: {
    width: '100%', maxWidth: 420, background: '#FFFFFF', border: '1px solid #E7E3D9',
    borderRadius: 20, padding: 32, boxShadow: '0 8px 40px rgba(0,0,0,0.05)',
  },
  brand: { fontSize: 14, fontWeight: 800, color: '#1B59A6', letterSpacing: 0.3, marginBottom: 18 },
  h1: { fontSize: 24, fontWeight: 800, color: '#111111', letterSpacing: -0.5, margin: '0 0 8px' },
  sub: { fontSize: 15, color: '#5B6470', lineHeight: 1.5, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#5B6470', marginBottom: 8 },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '14px 14px', fontSize: 16,
    border: '1px solid #E7E3D9', borderRadius: 12, color: '#111111', outline: 'none', background: '#FFFFFF',
  },
  btn: {
    width: '100%', marginTop: 16, padding: '15px 16px', fontSize: 16, fontWeight: 800,
    color: '#FFFFFF', background: '#1B59A6', border: 'none', borderRadius: 12, cursor: 'pointer',
  },
  link: {
    width: '100%', marginTop: 12, padding: 8, fontSize: 14, fontWeight: 600, color: '#5B6470',
    background: 'transparent', border: 'none', cursor: 'pointer',
  },
  err: { color: '#C0392B', fontSize: 14, margin: '12px 0 0' },
  note: { background: '#F2F0EA', borderRadius: 12, padding: 16, fontSize: 14.5, color: '#111111', lineHeight: 1.5 },
};
