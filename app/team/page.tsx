'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U, FONT } from './ui';
import OverviewNew from './OverviewNew';
import type { TeamOverview, TeamCustomer } from '../../lib/team';

// THE TEAM CONSOLE. Sign in, then the overview.
//
// The old page stacked the brain, the charts, the sources and the customer list here. That detail now
// lives on its own routes (/team/knowledge, /team/numbers, /team/customers) and the signed-in screen is
// <OverviewNew />: your list, the health line, the money, and the workforce reporting in. The sign in,
// the loading state, and the not-on-team handling are UNCHANGED, on purpose.
//
// WHAT IS NOT ON THIS SCREEN, AND WILL NOT BE. No customer's transactions, income, tax bill, receipts
// or phone number. The app tells every user "your records are encrypted and only you can see them", and
// the day this page shows a man's books that sentence becomes a lie.
//
// Sign in is an email and a password, and the password is NOT the gate. The gate is a row in
// team_members, re-checked on the server on every request, so a stranger who guesses a password holds a
// key to a door that is not there.

interface Payload {
  me: { email: string; name: string | null; role: string };
  overview: TeamOverview;
  customers: TeamCustomer[];
  health: {
    crons: string;
    cronAlarms: Array<{ job: string; reason: string }>;
    knowledge: string;
    knowledgeAlarms: Array<{ kind?: string; reason?: string }>;
    brain: Record<string, unknown> | null;
  };
}

export default function TeamPage() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) { setReady(true); return; }

    const res = await fetch('/api/team/overview', { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 403) {
      // A valid session with no row in team_members is the NORMAL state of the world. Do not leave him
      // holding a session on an empty screen. Throw it away and send him back to sign in.
      await browserSupabase.auth.signOut();
      setError('That account is not on the Lekhio team.');
    } else if (res.status === 503) {
      setError('Could not read the database. This is NOT "no customers". Do not trust a zero here.');
    } else if (!res.ok) {
      setError('Could not load.');
    } else {
      setData((await res.json()) as Payload);
    }
    setReady(true);
  }

  useEffect(() => { load(); }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await browserSupabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) {
      // ONE message for both failures, on purpose. Telling "no such user" from "wrong password" apart
      // lets a stranger use this form to find out who works here.
      setError('That email and password do not match.');
      return;
    }
    setPassword('');
    load();
  }

  async function forgot() {
    const addr = email.trim().toLowerCase();
    if (!addr) { setError('Type your email above first, then tap this.'); return; }
    setError(null);
    await browserSupabase.auth.resetPasswordForEmail(addr, {
      redirectTo: `${window.location.origin}/team/reset`,
    });
    setSent(true);
  }

  // The first half second: the wordmark, not a blank card.
  if (!ready) {
    return (
      <main style={S.signInPage}>
        <div style={S.authCard}>
          <div style={S.brandRow}>
            <span style={S.wordmark}>Lekhio</span>
            <span style={S.accent} aria-hidden="true" />
          </div>
          <p style={S.muted}>One moment.</p>
        </div>
      </main>
    );
  }

  // Not signed in: the split sign-in screen.
  if (!data) {
    return (
      <main className="team-split" style={S.split}>
        <style>{`
          .team-brand-mobile { display: flex; }
          @media (min-width: 900px) {
            .team-split { grid-template-columns: 440px minmax(0, 1fr) !important; }
            .team-brand { display: flex !important; }
            .team-brand-mobile { display: none !important; }
          }
        `}</style>

        <aside className="team-brand" style={S.brandPanel}>
          <div>
            <div style={S.brandRow}>
              <span style={{ ...S.wordmark, color: '#fff', fontSize: 24 }}>Lekhio</span>
              <span style={S.accent} aria-hidden="true" />
            </div>
            <p style={S.brandLine}>One less button at a time.<br />Until only one is left.</p>
            <p style={S.brandApprove}>Approve.</p>
          </div>
          <p style={S.brandFoot}>
            The team console. Customers, revenue, and whether the brain still agrees with HMRC.
          </p>
        </aside>

        <div style={S.formPanel}>
          <div style={S.authCard}>
            <div className="team-brand-mobile" style={S.brandRow}>
              <span style={S.wordmark}>Lekhio</span>
              <span style={S.accent} aria-hidden="true" />
            </div>

            {sent ? (
              <>
                <h1 style={S.cardH1}>Check your email</h1>
                <p style={S.cardSub}>
                  If <b style={{ color: C.ink }}>{email.trim().toLowerCase()}</b> is on the team, a link to
                  set a new password is on its way.
                </p>
                <button type="button" style={S.ghost} onClick={() => { setSent(false); setError(null); }}>
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <h1 style={S.cardH1}>Team sign in</h1>
                <p style={S.cardSub}>For the Lekhio team.</p>
                <form onSubmit={signIn}>
                  <label htmlFor="team-email" style={S.label}>Email</label>
                  <input id="team-email" type="email" autoComplete="username" autoFocus required
                    value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lekhio.app" style={S.input} />
                  <label htmlFor="team-password" style={{ ...S.label, marginTop: 16 }}>Password</label>
                  <input id="team-password" type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" style={S.input} />
                  <button type="submit" style={{ ...S.button, opacity: busy ? 0.6 : 1 }} disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
                <button type="button" style={S.textLink} onClick={forgot}>Forgotten your password?</button>
              </>
            )}

            {error ? <p style={S.error}>{error}</p> : null}
          </div>

          <p style={S.legal}>
            This page never shows a customer{"'"}s receipts, figures or phone number, and it never will.
            We tell every user their records are theirs alone.
          </p>
        </div>
      </main>
    );
  }

  // Signed in: the new overview.
  return (
    <OverviewNew
      data={data}
      onSignOut={async () => { await browserSupabase.auth.signOut(); location.reload(); }}
    />
  );
}

// THE SIGN IN SCREEN STYLES, and nothing else. Everything the dashboard drew now lives in its own
// components and routes.
const S: Record<string, React.CSSProperties> = {
  split: {
    minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)',
    fontFamily: FONT, color: C.ink, background: C.paper,
  },
  brandPanel: {
    display: 'none', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 48px',
    background: `linear-gradient(150deg, #16324F 0%, ${C.riverDeep} 55%, ${C.river} 100%)`, color: '#fff',
  },
  brandLine: { fontSize: 34, fontWeight: 800, lineHeight: 1.25, letterSpacing: -0.9, margin: '38px 0 0', color: '#fff', maxWidth: 380 },
  brandApprove: { fontSize: 34, fontWeight: 800, letterSpacing: -0.9, margin: '2px 0 0', color: C.saffron },
  brandFoot: { fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: 0, maxWidth: 340 },

  formPanel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '48px 24px',
    background: `radial-gradient(900px 420px at 50% -10%, ${C.riverTint} 0%, ${C.paper} 60%)`,
  },
  signInPage: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '40px 22px',
    background: `radial-gradient(1100px 520px at 50% -8%, ${C.riverTint} 0%, ${C.paper} 62%)`, fontFamily: FONT, color: C.ink,
  },
  authCard: {
    width: '100%', maxWidth: 420, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20,
    padding: '34px 32px 30px', boxShadow: '0 18px 50px rgba(17,17,17,0.07), 0 2px 6px rgba(17,17,17,0.03)',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 },
  wordmark: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: C.ink },
  accent: { ...U.accent, width: 26 },

  cardH1: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' },
  cardSub: { ...T.body, color: C.muted, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 7 },
  input: {
    width: '100%', padding: '14px 15px', fontSize: 15.5, color: C.ink,
    border: `1.5px solid ${C.line}`, borderRadius: 12, background: C.panel, outline: 'none', fontFamily: 'inherit',
  },
  button: {
    width: '100%', padding: '15px', marginTop: 14, fontSize: 15.5, fontWeight: 700, color: '#fff', fontFamily: 'inherit',
    background: `linear-gradient(135deg, ${C.river}, ${C.riverDeep})`, border: 0, borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(27,89,166,0.25)',
  },
  ghost: {
    width: '100%', padding: '12px', marginTop: 16, fontSize: 14, fontWeight: 700, color: C.river,
    background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  textLink: {
    display: 'block', width: '100%', marginTop: 16, padding: 0, background: 'none', border: 0, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, color: C.muted, textAlign: 'center',
  },
  legal: { ...T.small, color: C.faint, textAlign: 'center', maxWidth: 400, margin: 0 },
  muted: { ...T.small, marginTop: 6 },
  error: { color: C.red, fontSize: 13.5, marginTop: 16, fontWeight: 600, lineHeight: 1.5 },
};
