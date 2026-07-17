'use client';

// MANAGE YOUR SUBSCRIPTION, ON THE WEB.
//
// The app takes no payment and manages no subscription, on purpose: that keeps it
// out of Apple's in-app purchase rules and off their margin. Billing lives here,
// tied to the same phone the account uses. You sign in with a one-time code, and
// then we open Stripe's own billing portal, where cancellation, payment method
// and invoices are handled in the safe place for them.
//
// This page is STANDALONE (no site chrome), so it carries its own font and brand
// palette. It must still feel like Lekhio: Inter, the river blue, a warm brand
// panel with the promise on it. A bare white card in a serif fallback is not us.
//
// No SDK, raw fetch, same as the rest of the codebase. The one-time code goes to
// Supabase auth directly; the access token it returns is used only to open the
// portal for YOUR customer record and nothing else.

import { useState } from 'react';

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Brand, inlined because this page loads none of the site CSS. Matches app/_shared/site.tsx.
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const INK = '#111111';
const MUTED = '#5B6470';
const PAPER = '#FBFAF7';
const LINE = '#E7E3D9';
const WHATSAPP = '#1FA855';

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
      <style>{CSS}</style>
      <div className="acc-shell">
        {/* Brand panel: the promise, on brand. Becomes a compact header on a phone. */}
        <aside className="acc-brand">
          <div>
            <div style={S.logo}>Lekhio</div>
            <div style={S.logoRule} />
          </div>
          <div>
            <h1 style={S.heroTitle}>Your account,<br />in one place.</h1>
            <p style={S.heroSub}>Cancel, switch your card, or download an invoice whenever you like. No phone calls, no forms, no waiting on hold.</p>
            <div style={S.pill}><span style={S.dot} /> Works through WhatsApp</div>
          </div>
          <p style={S.brandTrust}>You approve everything. We are not HMRC.</p>
        </aside>

        {/* Sign in card */}
        <section className="acc-card">
          <h2 style={S.h2}>Manage your subscription</h2>
          <p style={S.sub}>Sign in with your mobile number, the same one your Lekhio account uses. We text you a one-time code.</p>

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
              <button style={S.btn} onClick={sendCode} disabled={busy} className="acc-btn">
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
              <button style={S.btn} onClick={verifyAndOpen} disabled={busy} className="acc-btn">
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

          <div style={S.foot}>
            <a href="https://lekhio.app" style={S.footLink}>← Back to lekhio.app</a>
            <span style={S.footMuted}>Secured by Stripe</span>
          </div>
        </section>
      </div>
    </main>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.acc-shell {
  width: 100%; max-width: 920px; display: grid; grid-template-columns: 1.05fr 1fr;
  background: #fff; border: 1px solid ${LINE}; border-radius: 24px; overflow: hidden;
  box-shadow: 0 24px 70px rgba(19,66,119,0.14);
}
.acc-brand {
  background: linear-gradient(160deg, ${RIVER} 0%, ${RIVER_DEEP} 100%);
  color: #fff; padding: 44px 40px; display: flex; flex-direction: column;
  justify-content: space-between; gap: 40px; min-height: 520px;
}
.acc-card { padding: 44px 40px; display: flex; flex-direction: column; }
.acc-btn { transition: opacity .15s ease, transform .05s ease; }
.acc-btn:hover { opacity: .93; }
.acc-btn:active { transform: translateY(1px); }
@media (max-width: 760px) {
  .acc-shell { grid-template-columns: 1fr; max-width: 460px; }
  .acc-brand { padding: 30px 28px; min-height: 0; gap: 22px; }
  .acc-card { padding: 30px 28px; }
}
`;

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', display: 'grid', placeItems: 'center', background: PAPER, padding: 20, fontFamily: FONT, color: INK },
  logo: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' },
  logoRule: { width: 46, height: 4, borderRadius: 2, marginTop: 8, background: 'linear-gradient(90deg,#fff 60%, #E9B45A 60%)' },
  heroTitle: { fontSize: 32, lineHeight: 1.12, fontWeight: 800, letterSpacing: '-0.8px', margin: 0, color: '#fff' },
  heroSub: { fontSize: 15.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.86)', margin: '16px 0 22px', maxWidth: 340 },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', padding: '8px 14px', borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 999, background: WHATSAPP, boxShadow: '0 0 0 3px rgba(31,168,85,0.25)' },
  brandTrust: { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 },
  h2: { fontSize: 23, fontWeight: 800, color: INK, letterSpacing: '-0.4px', margin: '0 0 8px' },
  sub: { fontSize: 14.5, color: MUTED, lineHeight: 1.55, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 8, letterSpacing: '0.2px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '14px 14px', fontSize: 16, fontFamily: FONT, border: `1.5px solid ${LINE}`, borderRadius: 12, color: INK, outline: 'none', background: '#fff' },
  btn: { width: '100%', marginTop: 16, padding: '15px 16px', fontSize: 15.5, fontWeight: 700, fontFamily: FONT, color: '#fff', background: RIVER, border: 'none', borderRadius: 12, cursor: 'pointer' },
  link: { width: '100%', marginTop: 12, padding: 8, fontSize: 14, fontWeight: 600, fontFamily: FONT, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' },
  err: { color: '#C0392B', fontSize: 14, margin: '12px 0 0' },
  note: { background: '#F2F0EA', borderRadius: 12, padding: 16, fontSize: 14.5, color: INK, lineHeight: 1.5 },
  foot: { marginTop: 'auto', paddingTop: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  footLink: { fontSize: 13, fontWeight: 600, color: RIVER, textDecoration: 'none' },
  footMuted: { fontSize: 12.5, color: MUTED },
};
