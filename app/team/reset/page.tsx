'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, FONT } from '../ui';

// SET A NEW PASSWORD. Where the reset link from /team lands.
//
// Supabase puts a recovery session in the URL fragment and the client picks it up (detectSessionInUrl
// is on). So by the time this page renders, the person is TEMPORARILY signed in and may set a new
// password. That is the whole flow.
//
// ⚠️ THE MINIMUM IS TWELVE CHARACTERS, AND THAT NUMBER IS NOT DECORATIVE.
//
// Supabase's own leaked-password screening, which checks a password against the HaveIBeenPwned
// corpus, is a PRO PLAN FEATURE and we are on Free. So we CANNOT tell whether the password somebody
// types here has already been breached somewhere else. We checked, in the dashboard, rather than
// assuming.
//
// Given that we cannot screen it, length is the only lever we have left, and the project default
// was SIX. Six characters, unscreened, on the door to our customer list. Twelve is not paranoid, it
// is the least we can do while we cannot check.
const MIN = 12;


export default function ResetPage() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A recovery link gives a real session. No session means somebody wandered here directly, and
  // there is nothing for them to do.
  useEffect(() => {
    browserSupabase.auth.getSession().then(({ data }) => {
      setAllowed(Boolean(data.session));
      setReady(true);
    });
  }, []);

  const tooShort = pw.length > 0 && pw.length < MIN;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ok = pw.length >= MIN && pw === pw2;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError(null);

    const { error: err } = await browserSupabase.auth.updateUser({ password: pw });
    setBusy(false);

    if (err) {
      setError(err.message || 'Could not set that password. Try a different one.');
      return;
    }
    setPw('');
    setPw2('');
    setDone(true);
  }

  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={S.brandRow}>
          <span style={S.wordmark}>Lekhio</span>
          <span style={S.accent} aria-hidden="true" />
        </div>

        {!ready ? (
          <p style={S.sub}>One moment.</p>
        ) : done ? (
          <>
            <h1 style={S.h1}>Password set</h1>
            <p style={S.sub}>You are signed in. Everything is waiting for you.</p>
            <a href="/team" style={S.button}>Go to the dashboard</a>
          </>
        ) : !allowed ? (
          <>
            <h1 style={S.h1}>This link has expired</h1>
            <p style={S.sub}>
              Reset links do not last long, which is the point of them. Ask for a fresh one and it
              will work.
            </p>
            <a href="/team" style={S.button}>Back to sign in</a>
          </>
        ) : (
          <>
            <h1 style={S.h1}>Set a new password</h1>
            <p style={S.sub}>At least {MIN} characters. Use something no other site has ever seen.</p>

            <form onSubmit={save}>
              <label htmlFor="pw" style={S.label}>New password</label>
              <input
                id="pw"
                type="password"
                autoComplete="new-password"
                autoFocus
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                style={{ ...S.input, borderColor: tooShort ? '#E0A9A2' : C.line }}
              />
              <p style={S.hint}>
                {pw.length === 0
                  ? `${MIN} characters or more.`
                  : tooShort
                    ? `${MIN - pw.length} more to go.`
                    : 'Long enough.'}
              </p>

              <label htmlFor="pw2" style={{ ...S.label, marginTop: 14 }}>Again, to be sure</label>
              <input
                id="pw2"
                type="password"
                autoComplete="new-password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                style={{ ...S.input, borderColor: mismatch ? '#E0A9A2' : C.line }}
              />
              {mismatch ? <p style={{ ...S.hint, color: '#C0392B' }}>These do not match.</p> : null}

              <button
                type="submit"
                disabled={!ok || busy}
                style={{ ...S.button, marginTop: 18, opacity: ok && !busy ? 1 : 0.5, cursor: ok && !busy ? 'pointer' : 'not-allowed' }}
              >
                {busy ? 'Saving…' : 'Set password'}
              </button>
            </form>
          </>
        )}

        {error ? <p style={S.error}>{error}</p> : null}
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 22px',
    background: `radial-gradient(1100px 520px at 50% -8%, #EEF4FB 0%, ${C.paper} 62%)`,
    fontFamily: FONT,
    color: C.ink,
  },
  card: {
    width: '100%', maxWidth: 420, background: '#fff',
    border: `1px solid ${C.line}`, borderRadius: 20, padding: '34px 32px 30px',
    boxShadow: '0 18px 50px rgba(17,17,17,0.07), 0 2px 6px rgba(17,17,17,0.03)',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 },
  wordmark: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: C.ink },
  accent: { width: 26, height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${C.river}, ${C.saffron})`, display: 'inline-block' },
  h1: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' },
  sub: { fontSize: 14.5, color: C.muted, lineHeight: 1.55, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 7 },
  input: {
    width: '100%', padding: '14px 15px', fontSize: 15.5, color: C.ink,
    border: `1.5px solid ${C.line}`, borderRadius: 12, background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  },
  hint: { fontSize: 12.5, color: C.muted, margin: '7px 2px 0' },
  button: {
    display: 'block', width: '100%', padding: '15px', marginTop: 14, textAlign: 'center',
    fontSize: 15.5, fontWeight: 700, color: '#fff', fontFamily: 'inherit', textDecoration: 'none',
    background: `linear-gradient(135deg, ${C.river}, ${C.riverDeep})`,
    border: 0, borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(27,89,166,0.25)',
  },
  error: { color: '#C0392B', fontSize: 13.5, marginTop: 16, fontWeight: 600, lineHeight: 1.5 },
};
