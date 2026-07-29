import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../lib/webauth';
import { SESSION_COOKIE, webSessionsConfigured } from '../../lib/websession';
import { A11Y_CSS, FONT, INK, LINE, MUTED, PAPER, RADIUS, RIVER, RIVER_DEEP } from '../../lib/tokens';

export const metadata: Metadata = {
  title: 'Sign in to Lekhio',
  description: 'Sign in with your mobile number to see your money, your costs and what you owe.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SIGNING IN, WITH NO JAVASCRIPT AT ALL.
//
// ⚠️ THIS PAGE SHIPS ZERO CLIENT SCRIPT ON PURPOSE, AND IT IS THE WHOLE POINT OF THE WEB APP.
//
// The man this is for is on a cheap Android on a bad signal, standing in somebody's kitchen. Every
// kilobyte of JavaScript is a second he spends looking at a white screen wondering whether we have
// taken his money and broken. Two plain forms and two redirects need none of it: the page works
// with scripting switched off, on a browser five years out of date, over 3G.
//
// The cost of that discipline is that error states come back as a short code in the URL and get
// turned into a sentence here. That is a fair trade and it keeps the wording where a human can
// read it, rather than in a route handler.
//
// TWO STEPS, ONE NUMBER. Step one posts the number and we text a code. Step two posts the code.
// The number itself never appears in the URL: it rides in a signed, short lived cookie, because a
// phone number is the account key in this product and a URL is written into browser history, into
// Referer headers, and into every error report that ever records one.

// A failure code from the routes, turned into something a person can act on. Never a stack trace,
// never "an error occurred", and never blame.
function message(code: string | undefined): string | null {
  switch (code) {
    case 'contact': return 'That does not look like an email address or a UK mobile number. Try it like dave@example.com or 07123 456789.';
    case 'capped': return 'We cannot send a code by text just now. Try your email address instead, or come back in a little while.';
    case 'code': return 'That code did not work. Check the text and try again.';
    case 'expired': return 'That took a little too long. Put your number in again and we will send a fresh code.';
    case 'toomany': return 'Too many tries. Give it a few minutes and try again.';
    case 'send': return 'We could not send the code just now. Try again in a minute.';
    case 'session': return 'We could not sign you in just now. Try again in a minute.';
    case 'origin': return 'That request did not come from Lekhio, so we stopped it.';
    case 'unavailable': return 'Signing in is not available right now. Try again shortly.';
    case 'bad': return 'Something went wrong with that. Try again.';
    default: return null;
  }
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // Already signed in, so do not make him prove it again. Anyone arriving here with a live session
  // wanted his money, not a form.
  const jar = await cookies();
  const already = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (already) redirect('/app');

  const step = one('step') === 'code' ? 'code' : 'phone';
  const err = message(one('e'));
  const signedOut = one('out') === '1';
  const configured = webSessionsConfigured();

  return (
    <main style={S.wrap}>
      <style>{CSS}</style>
      <div className="lek-in">
        <div style={S.brandRow}>
          <span style={S.logo}>Lekhio</span>
          <span style={S.rule} />
        </div>

        <h1 style={S.h1}>{step === 'code' ? 'Enter your code' : 'Sign in'}</h1>
        <p style={S.sub}>
          {step === 'code'
            ? 'We have sent you a six digit code. It lasts a few minutes.'
            : 'Your email address or your mobile number, whichever you gave us. We will send you a code.'}
        </p>

        {signedOut && <p style={S.note}>You are signed out.</p>}
        {err && <p style={S.err} role="alert">{err}</p>}

        {/* Signing in is not possible without the signing secret, and saying so beats a form that
            silently goes nowhere. Doc 103's honesty test applied to an error state. */}
        {!configured ? (
          <p style={S.note}>
            Signing in is not switched on just now. Try again shortly, and get in touch if it stays that way.
          </p>
        ) : step === 'code' ? (
          <form action="/api/auth/verify" method="post">
            <label htmlFor="code" style={S.label}>Your code</label>
            <input
              id="code"
              name="code"
              style={S.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="6 digit code"
              maxLength={8}
              required
            />
            <button type="submit" style={S.btn}>Sign in</button>
            <a href="/in" style={S.link}>Use a different email or number</a>
          </form>
        ) : (
          /* ONE FIELD, TWO DOORS. Not two forms of login, one form of login with two ways for the
             code to arrive. The app shows the same words, so the front door never changes shape
             between two screens with the same name over them. lib/logindoor.ts decides which he
             gave us, on the presence of an @ and nothing cleverer. */
          <form action="/api/auth/start" method="post">
            <label htmlFor="contact" style={S.label}>Email or mobile number</label>
            <input
              id="contact"
              name="contact"
              style={S.input}
              inputMode="email"
              autoComplete="username"
              autoFocus
              placeholder="dave@example.com or 07123 456789"
              maxLength={254}
              required
            />
            <button type="submit" style={S.btn}>Send me a code</button>
            <p style={S.hint}>Email is instant and free. A text works too.</p>
          </form>
        )}

        <p style={S.foot}>
          New to Lekhio? <a href="/start" style={S.footLink}>Get set up</a>. It takes two minutes and
          the first 7 days are free.
        </p>
        <p style={S.trust}>You approve everything. We are not HMRC.</p>
      </div>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  `.lek-in{width:100%;max-width:420px;background:#fff;border:1px solid ${LINE};border-radius:${RADIUS.lg}px;padding:32px 28px}`,
  `@media(max-width:460px){.lek-in{border:none;border-radius:0;padding:26px 20px;background:transparent}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', display: 'grid', placeItems: 'center', background: PAPER, padding: 18, fontFamily: FONT, color: INK },
  brandRow: { marginBottom: 24 },
  logo: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: RIVER_DEEP },
  rule: { display: 'block', width: 40, height: 3, borderRadius: 2, marginTop: 7, background: RIVER },
  h1: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', margin: '0 0 8px' },
  sub: { fontSize: 15, lineHeight: 1.55, color: MUTED, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 8 },
  input: { width: '100%', boxSizing: 'border-box', padding: '14px', fontSize: 16, fontFamily: FONT, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, color: INK, background: '#fff' },
  btn: { width: '100%', marginTop: 16, padding: '15px 16px', fontSize: 15.5, fontWeight: 700, fontFamily: FONT, color: '#fff', background: RIVER, border: 'none', borderRadius: RADIUS.md, cursor: 'pointer' },
  link: { display: 'block', textAlign: 'center', marginTop: 14, fontSize: 14, fontWeight: 600, color: MUTED, textDecoration: 'none' },
  err: { color: '#C0392B', fontSize: 14.5, lineHeight: 1.5, margin: '0 0 16px' },
  note: { background: '#F2F0EA', borderRadius: RADIUS.md, padding: 14, fontSize: 14.5, lineHeight: 1.5, margin: '0 0 16px' },
  foot: { fontSize: 14, lineHeight: 1.55, color: MUTED, margin: '24px 0 0' },
  footLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
  hint: { fontSize: 13, color: MUTED, textAlign: 'center', margin: '12px 0 0' },
  trust: { fontSize: 12.5, color: MUTED, margin: '14px 0 0' },
};
