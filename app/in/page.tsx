import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../lib/webauth';
import { SESSION_COOKIE, webSessionsConfigured, safeNext } from '../../lib/websession';
import { HOW_LONG } from '../../lib/onboarding';
import { A11Y_CSS, APP_THEME_CSS, FONT, RADIUS } from '../../lib/tokens';
import { INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RIVER, RIVER_DEEP, SURFACE } from '../../lib/apptheme';

export const metadata: Metadata = {
  title: 'Sign in to Lekhio',
  description: 'Sign in with your email address to see your money, your costs and what you owe.',
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
// TWO STEPS, ONE CONTACT. Step one posts what he typed and we send a code to it. Step two posts
// the code. ⚠️ On the web that contact is now his EMAIL ADDRESS and nothing else, from 2 Aug 2026;
// the phone app still posts a number to the same route. The contact itself never appears in the
// URL either way: it rides in a signed, short lived cookie, because it is the account key in this
// product and a URL is written into browser history, into Referer headers, and into every error
// report that ever records one.

// A failure code from the routes, turned into something a person can act on. Never a stack trace,
// never "an error occurred", and never blame.
function message(code: string | undefined): string | null {
  switch (code) {
    // ⚠️ THESE FOUR ALL NAMED A TEXT MESSAGE, and from 2 Aug the web door only sends email. The
    // worst of them was 'capped', which told him to "try your email address instead" on the one
    // screen where his email address is the only thing he can type. Advice he cannot follow is
    // worse than no advice, because he goes looking for the option we told him about.
    case 'contact': return 'That does not look like an email address. Try it like dave@example.com.';
    case 'capped': return 'We have sent as many codes as we can for the moment. Give it a little while and try again.';
    case 'code': return 'That code did not work. Check the email and try again.';
    case 'expired': return 'That took a little too long. Put your address in again and we will send a fresh code.';
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
  // 🔴 WHERE HE WAS HEADING BEFORE WE ASKED HIM TO PROVE WHO HE IS.
  //
  // This page used to send everybody to /app, so a customer who clicked "Manage subscription" in
  // the footer signed in and landed on the dashboard having forgotten what he came for. Small on
  // its own, and it is the last step of a journey that was completely broken until today: see
  // app/account/page.tsx for the SMS door that could never open.
  //
  // ⚠️ safeNext() IS AN ALLOWLIST OF /app AND BELOW, NOT A SANITISER, and it returns the dashboard
  // for anything else. An unvalidated destination here would turn our own login into a redirector
  // that sends a man to somebody else's page carrying the address bar he just typed his code into.
  // The reasoning and the rejected shapes are written on the function in lib/websession.ts.
  const next = safeNext(one('next'));

  const already = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (already) redirect(next);

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
            // ⚠️ NO LENGTH IN THIS SENTENCE, AND THAT IS THE FIX RATHER THAN A DIFFERENT NUMBER.
            //
            // This said "six digit" and the code that arrives is EIGHT digits. The sign in code is
            // minted by GoTrue, and its length is a Supabase project setting we do not own and can
            // be changed from a dashboard without a deploy. Copy asserting a length is therefore a
            // second copy of a fact belonging to somebody else, and the day it drifts a man counts
            // his six digits, finds two spare, and concludes he has the wrong email.
            //
            // ⚠️ THE SIGNUP CODE IS DIFFERENT AND ITS COPY STAYS. lib/signupcode.ts mints that one
            // and it really is six digits, guaranteed by a test, so app/start may say so.
            ? 'We have sent you a code. It lasts a few minutes.'
            : 'The email address you gave us. We will send you a code.'}
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
            {/* Carried as a hidden field rather than on the action URL, so it survives the post
                without the page ever re-reading it from its own address. */}
            <input type="hidden" name="next" value={next} />
            <label htmlFor="code" style={S.label}>Your code</label>
            <input
              id="code"
              name="code"
              style={S.input}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="Your code"
              maxLength={8}
              required
            />
            {/* ⚠️ UNTICKED BY DEFAULT, AND THAT IS THE SECURITY DECISION ON THIS SCREEN.
                Ticked, the session is the ordinary ninety day sliding one (lib/websession.ts has
                the cost argument). Unticked, the cookie dies when the browser closes and the row
                behind it expires within hours either way, because a builders' merchant's counter
                PC is exactly where someone signs in once, and the man in a hurry never reads a
                checkbox. The safe shape has to be the one he gets by ignoring it. */}
            <label style={S.remember}>
              <input type="checkbox" name="remember" style={S.rememberBox} />
              <span>
                Remember my browser
                <span style={S.rememberNote}>
                  (If this is not your own device, leave this unticked and you will be signed out
                  when you close it. Keep your data safe.)
                </span>
              </span>
            </label>
            <button type="submit" style={S.btn}>Sign in</button>
            {/* ⚠️ "or number" survived the 2 Aug pass because the sweep looked at the FORM, not at the
                code step. Found by walking the live sign in on 3 August. */}
            <a href="/in" style={S.link}>Use a different email address</a>
            {/* ⚠️ WE NEVER SAY "NO ACCOUNT WITH THAT ADDRESS", AND WE ARE NOT GOING TO. Telling a
                stranger which addresses are registered hands him a list of our customers, so this
                screen looks identical whether the code went out or there was nobody to send it to.
                The cost of that is a man who mistyped his email waiting for something that is never
                coming, which feels like a broken product rather than a typo. So we say the true
                thing that helps him without saying the one that helps an attacker. */}
            <p style={S.hint}>Nothing after a minute? Check the address you typed.</p>
          </form>
        ) : (
          /* 🔴 THE WEB DOOR IS EMAIL ONLY FROM 2 AUGUST 2026. THE APP DOOR IS NOT.
             This was one field taking either. lib/logindoor.ts STILL reads a mobile and
             /api/auth/start STILL accepts one, because THE PHONE APP SIGNS IN BY PHONE and has no
             email door at all. What changed is what the WEB offers, not what the system
             understands, so do not read this screen as permission to tear the parser out.

             WHY, and it is a cost and abuse decision rather than a technical one. A text is
             roughly 7p through Twilio and an email roughly 0.04p, which is about 175 times dearer
             for exactly the same proof: that he holds something we already have on file. Against
             the 215p a month a customer may cost us at the 80% margin floor, signing in by text
             twice a month spends 6% of his whole budget on arriving. And only one of the two
             doors pays an attacker. SMS pumping bills us for every code sent to a number he
             controls, and there is no email equivalent because nobody is paid when an email is
             sent.

             ⚠️ NOBODY IS EXCLUDED BY THIS, and that is what made it safe rather than merely
             cheaper. Email is compulsory at signup and app/api/signup/verify.ts mints the auth
             user on the PROVED address, so every customer who has finished signing up already has
             a working email door. A survey on 2 Aug found exactly one account that could not use
             one: a test row on the Ofcom fictitious number, no subscription. The line under the
             button is for the phone era customer anyway, because a dead end with no way out is
             the one thing this screen must never be. */
          <form action="/api/auth/start" method="post">
            <input type="hidden" name="next" value={next} />
            <label htmlFor="contact" style={S.label}>Your email address</label>
            <input
              id="contact"
              name="contact"
              type="email"
              style={S.input}
              inputMode="email"
              autoComplete="username"
              autoFocus
              placeholder="dave@example.com"
              maxLength={254}
              required
            />
            <button type="submit" style={S.btn}>Send me a code</button>
            <p style={S.hint}>
              We send a 6 digit code to that address. If you only ever signed in with your mobile,
              email info@lekhio.app and we will put your address on the account.
            </p>
          </form>
        )}

        <p style={S.foot}>
          {/* 🔴 THIS PROMISED TWO MINUTES. Signing up is six questions and about a minute of them, but
              setting up properly is ten to fifteen, and from 30 July the code lands him in that
              rather than on a dashboard. Promising two minutes to a man about to spend fifteen is
              the same shading of the truth /start was corrected for on the same day. */}
          New to Lekhio? <a href="/start" style={S.footLink}>Get set up</a>. It takes {HOW_LONG} and
          the first 7 days are free.
        </p>
        <p style={S.trust}>You approve everything. We are not HMRC.</p>
      </div>
    </main>
  );
}

const CSS = [
  // The theme variables first, because every colour below is one of them. This page follows the
  // device the same way the app does, with not one byte of script. See APP_THEME_CSS in tokens.
  APP_THEME_CSS,
  A11Y_CSS,
  `.lek-in{width:100%;max-width:420px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.lg}px;padding:32px 28px}`,
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
  input: { width: '100%', boxSizing: 'border-box', padding: '14px', fontSize: 16, fontFamily: FONT, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, color: INK, background: PANEL },
  btn: { width: '100%', marginTop: 16, padding: '15px 16px', fontSize: 15.5, fontWeight: 700, fontFamily: FONT, color: ON_RIVER, background: RIVER, border: 'none', borderRadius: RADIUS.md, cursor: 'pointer' },
  link: { display: 'block', textAlign: 'center', marginTop: 14, fontSize: 14, fontWeight: 600, color: MUTED, textDecoration: 'none' },
  remember: { display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' },
  rememberBox: { width: 18, height: 18, marginTop: 1, flex: '0 0 auto', cursor: 'pointer' },
  rememberNote: { display: 'block', fontSize: 13, lineHeight: 1.5, fontWeight: 400, color: MUTED, marginTop: 3 },
  err: { color: RED, fontSize: 14.5, lineHeight: 1.5, margin: '0 0 16px' },
  note: { background: SURFACE, borderRadius: RADIUS.md, padding: 14, fontSize: 14.5, lineHeight: 1.5, margin: '0 0 16px' },
  foot: { fontSize: 14, lineHeight: 1.55, color: MUTED, margin: '24px 0 0' },
  footLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
  hint: { fontSize: 13, color: MUTED, textAlign: 'center', margin: '12px 0 0' },
  trust: { fontSize: 12.5, color: MUTED, margin: '14px 0 0' },
};
