'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';
import { findSic } from '../../lib/siccodes';
import { HOW_LONG } from '../../lib/onboarding';

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const SAFFRON = '#E0A33E';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const PAPER = '#FBFAF7';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

type TradeType = 'sole' | 'business' | 'ltd' | null;

const trades = [
  'Electrician', 'Plumber', 'Builder', 'Plasterer', 'Roofer', 'Joiner',
  'Decorator', 'Gardener', 'Cleaner', 'Driver', 'Hairdresser', 'Barber',
  // Landlord earned its chip on 31 July 2026, after a landlord persona walked this page and had
  // nowhere to land but "Something else". The product already keeps a property stream with its own
  // engine (lib/propertyengine.ts), so the front door saying nothing about it was the door lying
  // about the house. Picking it also carries the rental property flag with the signup, see
  // submitSignup: a man whose trade IS the letting should not have to also tick "alongside".
  'Landlord',
  'Photographer', 'Tutor', 'Carer', 'Cafe', 'Market trader', 'Freelancer', 'Something else',
];

const TOTAL = 6;

function digitsOnly(v: string) {
  return v.replace(/\D/g, '');
}

// A failure code from the signup routes, turned into something a person can act on. Same approach
// as app/in/page.tsx: never a stack trace, never "an error occurred", and never blame.
function codeMessage(code: string | undefined): string {
  switch (code) {
    case 'code': return 'That code did not work. Check the email and try again.';
    case 'email': return 'That email does not look right. Go back and check it.';
    case 'toomany': return 'Too many tries. Give it a few minutes and try again.';
    case 'capped': return 'We cannot send codes just this minute. Try again shortly.';
    case 'send': return 'We could not send that just now. Try again in a minute.';
    case 'account': return 'We could not finish setting your account up. Try again in a minute.';
    case 'session': return 'We could not sign you in just now. Try again in a minute.';
    case 'origin': return 'That request did not come from Lekhio, so we stopped it.';
    case 'unavailable': return 'Signing up is not available right now. Try again shortly.';
    default: return 'Something went wrong with that. Try again.';
  }
}

export default function StartPage() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>(null);
  const [name, setName] = useState('');
  // ⚠️ THE HUMAN BEING, SEPARATE FROM THE BUSINESS. Added 27 July 2026 after a real signup on
  // lekhio.app was greeted as "Test", the first word of "Test Coffee Shop Ltd".
  //
  // There was one `name` field with its LABEL swapped by trade type, which reads like a tidy bit of
  // reuse and is not: for a limited company it captured the company and nothing else, so a man
  // called Dave who runs Smith Electrical Ltd got "Hi Smith" from a product whose entire pitch is
  // that it feels like a person. A sole trader still answers once, because for him the two ARE the
  // same name and asking twice would be the sort of pointless question doc 103 forbids.
  const [personName, setPersonName] = useState('');
  const [trade, setTrade] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  // Which of the SIC suggestions is on screen, 0 = the best match. "Not quite?" steps through the
  // rest rather than us guessing again; never sent anywhere until he sees and keeps this one.
  const [sicPick, setSicPick] = useState(0);
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState<boolean | null>(false);
  // The streams question: what sits alongside the trade. It shapes the tax
  // picture and primes the questions onboarding asks next, so it earns a step of its own.
  const [streams, setStreams] = useState<string[]>([]);
  // The code step. `done` now means "the questions are answered, prove the email", not "finished":
  // the account does not exist until the code is typed, so this is the last thing between him and
  // his own books rather than a thank you screen.
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [hp, setHp] = useState(''); // honeypot, must stay empty for a real person
  const [t0] = useState(() => Date.now());
  const [offer] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('offer') ?? '' : ''));
  const [billingResult] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('billing') ?? '' : ''));
  // A referral code carried in on ?ref= (doc 82). Attribution only; passed to the
  // onboard save, sanitised server side. Never shown, never rewards automatically.
  const [ref] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') ?? '' : ''));
  // A field sales rep's code on ?rep=. Only a valid one unlocks the longer 30 day
  // trial at checkout; the server decides, this just carries it through.
  const [rep] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('rep') ?? '' : ''));

  // Billing: the chosen period drives the price shown and charged. One simple price for everyone.
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [billingBusy, setBillingBusy] = useState(false);
  const priceNow = plan === 'annual' ? '£129 a year' : '£12.99 a month';

  async function startCheckout() {
    setBillingBusy(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, offer, email: email.trim(), phone, rep }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through
    }
    // Billing not switched on yet, or a hiccup. The free trial is already running,
    // so we simply let the user carry on rather than block them.
    setBillingBusy(false);
  }

  const phoneReady = digitsOnly(phone).length >= 10;
  // Email is required. One account, tied to a name, a mobile and an email, so nothing about a
  // person is ever split across two records. It must be present and valid to move on.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameLabel = tradeType === 'ltd' ? 'Company name' : tradeType === 'business' ? 'Trading name' : 'Your full name';
  // A limited company and a trading name are not the person. A sole trader trades under his own
  // name, so his one answer is both.
  const needsPersonName = tradeType === 'ltd' || tradeType === 'business';
  // Who we greet, everywhere. One expression, so the success screen, the email and the app can
  // never disagree about what to call him.
  const greetName = (needsPersonName ? personName : name).trim();

  const canContinue = useMemo(() => {
    if (step === 1) return phoneReady && emailValid;
    if (step === 2) return tradeType !== null && name.trim().length > 1 && (!needsPersonName || personName.trim().length > 1);
    if (step === 3) return trade !== '' && (trade !== 'Something else' || customTrade.trim().length > 1);
    if (step === 4) return true; // streams optional, none is a fine answer
    if (step === 5) return true; // address optional
    if (step === 6) return vat !== null;
    return false;
  }, [step, phoneReady, emailValid, tradeType, name, personName, needsPersonName, trade, customTrade, vat]);

  // What they actually typed or picked, for the SIC matcher. Only a limited company needs a SIC
  // code at all (Companies House asks for it; a sole trader never does, see lib/siccodes), so this
  // only shows and only travels with the signup when tradeType is 'ltd'. Never filed anywhere by
  // us: it is a head start for when he registers himself, which the copy says plainly.
  const effectiveTrade = trade === 'Something else' ? customTrade : trade;
  const sicMatches = useMemo(
    () => (tradeType === 'ltd' && effectiveTrade.trim().length > 1 ? findSic(effectiveTrade, 3) : []),
    [tradeType, effectiveTrade],
  );
  const sicChoice = sicMatches[Math.min(sicPick, sicMatches.length - 1)] ?? null;

  // 🔴 THIS IS NO LONGER FIRE AND FORGET, AND IT CANNOT BE.
  //
  // It used to post and move straight on, because the next screen was a thank you and nothing
  // depended on the row landing. Now the next thing that happens is that he proves his email, and
  // /api/signup/verify reconciles his answers by looking that signup row up. A post still in
  // flight is a man who answered six questions and arrives in an empty account.
  async function submitSignup(): Promise<void> {
    try {
      await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          email: email.trim(),
          tradeType,
          name: name.trim(),
          // The person, sent alongside the business name. app/api/onboard falls back to `name` when
          // this is empty, which is exactly right for a sole trader.
          personName: greetName,
          trade: trade === 'Something else' ? customTrade.trim() : trade,
          postcode: postcode.trim(),
          address: address.trim(),
          vat,
          // A landlord's rental property is not "alongside the work", it IS the work, so step 4's
          // property tick cannot be the only way the flag travels. Picking the Landlord chip
          // carries it too, deduplicated, and nothing is ever removed from what he ticked himself.
          streams: trade === 'Landlord' && !streams.includes('property') ? [...streams, 'property'] : streams,
          website: hp,
          ts: Date.now() - t0,
          offer,
          ref,
          // Only ever sent once he has actually SEEN the suggestion on screen (sicChoice is only set
          // when the box above rendered). Never guessed silently server side.
          sicCode: sicChoice ? sicChoice.code : undefined,
        }),
      });
    } catch {
      // A failed save must not trap him on the form. He still gets his code and his account; the
      // worst case is that a few answers are asked again inside onboarding, which is a nuisance
      // rather than a wall.
    }
  }

  // Ask for the code. Used both on finishing the questions and by "Send it again".
  async function sendCode(isResend = false): Promise<boolean> {
    if (isResend) setResendBusy(true);
    try {
      const res = await fetch('/api/signup/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCodeErr(codeMessage(data.error));
        return false;
      }
      return true;
    } catch {
      setCodeErr('We could not send that just now. Try again in a minute.');
      return false;
    } finally {
      // Deliberately not a countdown. He does not need a timer, he needs the button to stop
      // looking like the thing to press twenty times while the first email is still in flight.
      if (isResend) setTimeout(() => setResendBusy(false), 30_000);
    }
  }

  // Prove it. This is the moment the account exists.
  async function confirmCode(): Promise<void> {
    setCodeBusy(true);
    setCodeErr('');
    try {
      const res = await fetch('/api/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string; message?: string };
      if (res.ok && data.ok) {
        // A full navigation, not a router push. The session arrives as an HttpOnly cookie on this
        // very response, and /app is server rendered off it, so the next page must be fetched by
        // the browser with that cookie attached.
        window.location.href = data.redirect || '/app';
        return;
      }
      // The route sends a specific sentence for a code that expired, was used, or has been retired
      // after too many tries. Prefer it: "that code did not work" is useless advice for a code that
      // can no longer work however carefully he types it.
      setCodeErr(data.message || codeMessage(data.error));
    } catch {
      setCodeErr('We could not check that just now. Try again in a minute.');
    }
    setCodeBusy(false);
  }

  async function next() {
    if (step < TOTAL) {
      setStep(step + 1);
      return;
    }
    // Save the answers FIRST, then ask for the code, then show the screen. In that order, because
    // the verify step reconciles against the row this writes.
    await submitSignup();
    await sendCode();
    setDone(true);
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  const pct = done ? 100 : Math.round(((step - 1) / TOTAL) * 100);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: PAPER, color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          *{box-sizing:border-box}body{margin:0}a{text-decoration:none}
          @keyframes stepIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
          @keyframes pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
          .step-anim{animation:stepIn .35s cubic-bezier(.2,.7,.2,1)}
          .opt{transition:border-color .15s ease, background-color .15s ease, transform .12s ease}
          .opt:hover{border-color:${RIVER}!important;transform:translateY(-2px)}
          .chip{transition:all .12s ease}
          .chip:hover{border-color:${RIVER}!important}
          .btn{transition:background-color .18s ease, transform .15s ease, box-shadow .18s ease}
          .btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 10px 24px rgba(27,89,166,.26)}
          .btn:active:not(:disabled){transform:translateY(0)}
          .field:focus{outline:none;border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT}}
          .barfill{transition:width .4s cubic-bezier(.2,.7,.2,1)}
        `,
        }}
      />

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${LINE}`, backgroundColor: '#fff' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', color: INK }}>Lekhio</Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: GREEN, backgroundColor: GREEN_TINT, padding: '5px 11px', borderRadius: 20 }}>🔒 Secure setup</span>
        </div>
      </div>

      {/* Progress */}
      {!done && !billingResult && (
        <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: '20px 22px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: RIVER, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {step} of {TOTAL}</span>
            {/* 🔴 THIS SAID "About a minute", AND IT WAS TRUE OF THESE SIX QUESTIONS AND FALSE ABOUT
                WHAT HE IS STARTING. Six questions really do take a minute; what follows them is ten
                to fifteen, because we cannot tailor a man's tax until we know everything about him.
                A page that promises a minute and then asks for fifteen has not saved him fourteen
                minutes, it has taught him we shade the truth about his money on the very first
                screen. Jag's call, 28 July: say it up front, because depth is the feature.
                The string comes from lib/onboarding so this page and the setup screens cannot
                disagree about it. */}
            <span style={{ fontSize: 12.5, color: MUTED }}>{HOW_LONG} in total</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, backgroundColor: SURFACE, overflow: 'hidden' }}>
            <div className="barfill" style={{ height: 7, borderRadius: 4, width: `${Math.max(pct, 8)}%`, background: `linear-gradient(90deg, ${RIVER}, ${SAFFRON})` }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 22px 40px' }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          {/* Honeypot. Hidden from people, but bots that fill every field trip it. */}
          <input
            type="text"
            name="website"
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
          {offer ? (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, backgroundColor: GREEN_TINT, border: '1px solid #CFE9D8', borderRadius: 12, padding: '12px 14px' }}>
              
              <span style={{ fontSize: 13.5, fontWeight: 600, color: GREEN, lineHeight: 1.4 }}>Your 7 days free is ready. No card needed. Finish to get started.</span>
            </div>
          ) : null}
          {billingResult === 'success' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your plan is locked in.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                Your card is saved and your 7 day free trial is running. You will not be charged until it ends, and you can cancel any time before then and pay nothing.
              </p>
              {/* The way in, not a way to a store queue. Both Stripe return screens land a man
                  who already has an account, so the only sensible button is his own books. */}
              <a href="/app" className="btn" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12, marginBottom: 22 }}>Open my Lekhio →</a>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : billingResult === 'cancelled' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your trial is still running.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                No card added, and that is fine. Your 7 day free trial is active. You can add a card to keep Lekhio any time, from your account.
              </p>
              {/* The way in, not a way to a store queue. Both Stripe return screens land a man
                  who already has an account, so the only sensible button is his own books. */}
              <a href="/app" className="btn" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12, marginBottom: 22 }}>Open my Lekhio →</a>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : done ? (
            /* 🔴 THE END OF THE ROAD USED TO BE A FIELD.
               It read: download the app, let the app set you up, say hello on WhatsApp. The store
               buttons beside it were dimmed and said "soon", and there was no link to the web app
               anywhere on the page. The product did not appear at the end of its own signup.

               Now the last thing he does is prove his email, which is what MAKES the account, and
               then he is in. No download, no WhatsApp, no waiting on Apple. */
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✉</div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Check your email.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 8px' }}>
                We have sent a six digit code to <b style={{ color: INK }}>{email.trim()}</b>. Type it
                in and we will start setting your Lekhio up.
              </p>
              <p style={{ fontSize: 13, color: MUTED, margin: '0 auto 24px', maxWidth: 400 }}>
                It can take a minute to arrive. Have a look in your junk folder if it does not.
              </p>

              <div style={{ maxWidth: 320, margin: '0 auto' }}>
                <label htmlFor="signup-code" style={{ ...fieldLabel, textAlign: 'left' }}>Your code</label>
                <input
                  id="signup-code"
                  className="field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="6 digit code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setCodeErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 4) void confirmCode(); }}
                  style={{ ...fieldStyle, textAlign: 'center', fontSize: 24, letterSpacing: '6px', fontWeight: 700 }}
                />
                {codeErr ? (
                  <p role="alert" style={{ fontSize: 13.5, color: '#C0392B', lineHeight: 1.5, margin: '10px 0 0', textAlign: 'left' }}>{codeErr}</p>
                ) : null}
                <button
                  className="btn"
                  onClick={() => void confirmCode()}
                  disabled={codeBusy || code.length < 4}
                  style={{ width: '100%', marginTop: 14, cursor: codeBusy ? 'wait' : code.length < 4 ? 'not-allowed' : 'pointer', backgroundColor: code.length < 4 ? '#C7D2E8' : RIVER, color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, padding: '15px 0', borderRadius: 12 }}
                >
                  {codeBusy ? 'Just a moment…' : 'Open my Lekhio →'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendCode(true)}
                  disabled={resendBusy}
                  style={{ marginTop: 14, background: 'none', border: 'none', color: resendBusy ? MUTED : RIVER, fontSize: 14, fontWeight: 600, cursor: resendBusy ? 'default' : 'pointer', padding: 8 }}
                >
                  {resendBusy ? 'Sent. Give it a moment.' : 'Send it again'}
                </button>
              </div>

            </div>
          ) : (
            <div key={step} className="step-anim">
              {step === 1 && (
                <Step title="Let's set up your account" sub="Your email is your account, and we will send you a code at the end to prove it. Your mobile is what links your WhatsApp later, once you want to send receipts by text.">
                  <label htmlFor="signup-phone" style={fieldLabel}>Mobile number</label>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '15px 14px', backgroundColor: RIVER_TINT, color: RIVER, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>🇬🇧 +44</span>
                    <input id="signup-phone" className="field" inputMode="tel" placeholder="7700 900 000" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={14} style={{ flex: 1, border: 'none', padding: '15px 14px', fontSize: 17, color: INK, letterSpacing: '0.5px', background: 'transparent' }} />
                  </div>
                  <label htmlFor="signup-email" style={{ ...fieldLabel, marginTop: 18 }}>Email</label>
                  <input id="signup-email" className="field" inputMode="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>We send your code here, and everything about your account lives here. Your number is only used to link WhatsApp when you are ready.</p>
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>We never share your details. We only ever message you in reply to you.</p>
                </Step>
              )}

              {step === 2 && (
                <Step title="How do you trade?" sub="So your invoices and tax records show the right name.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['sole', '', 'Just me', 'Self employed under my own name'],
                      ['business', '', 'A business name', 'I trade as a name, like Smith Electrical'],
                      ['ltd', '', 'A limited company', 'I have a registered company'],
                    ] as const).map(([val, icon, t, d]) => {
                      const active = tradeType === val;
                      return (
                        <button key={val} className="opt" onClick={() => setTradeType(val)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, backgroundColor: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '16px 16px' }}>
                          <span style={{ fontSize: 24 }}>{icon}</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: INK }}>{t}</span>
                            <span style={{ display: 'block', fontSize: 13.5, color: MUTED, marginTop: 2 }}>{d}</span>
                          </span>
                          <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${active ? RIVER : LINE}`, backgroundColor: active ? RIVER : 'transparent', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  {tradeType && (
                    <div style={{ marginTop: 16 }}>
                      <label htmlFor="signup-name" style={fieldLabel}>{nameLabel}</label>
                      <input id="signup-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={tradeType === 'ltd' ? 'Smith Electrical Ltd' : tradeType === 'business' ? 'Smith Electrical' : 'Sam Smith'} style={fieldStyle} />
                      {/* 🔴 THIS SAID: "We will verify your company details for you."
                          We do not verify anything. Verification is a WARRANTY: it says we checked
                          this and we vouch for it. What we actually do is look your company up on
                          the public Companies House register and read back what it says. If that
                          register is wrong, or he types a name that matches somebody else's company,
                          we have "verified" nothing at all, and he has our word for it.
                          Say what we do. It is still the good bit: he does not dig out paperwork. */}
                      {/* 🔴 THIS COPY WAS A PROMISE THE PAGE DID NOT KEEP, and it was live for weeks.
                          It read: "We will look your company up on the Companies House register and
                          fill the details in for you." app/start never called anything. The lookup
                          is real and it works, but in the MOBILE setup flow, which can call
                          /api/companies-house because by then the user is signed in.

                          This page has no session at any point, and opening that endpoint to
                          anonymous callers would reopen the hole the 26 July audit closed: one
                          shared key, 600 requests per five minutes, and lookup quietly dying for
                          every real customer mid signup.

                          So the lookup now runs SERVER SIDE when this form is submitted, and the
                          copy says what actually happens: we do the looking, he does not dig out
                          paperwork, and nothing fills in on screen because nothing can yet. The
                          live type ahead comes to the web app's own setup screen at item 6. */}
                      {tradeType === 'ltd' && <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>Type it as it appears on the register. We look your company up on the Companies House register ourselves once you finish, so there is no paperwork to dig out.</p>}
                      {needsPersonName && (
                        <div style={{ marginTop: 16 }}>
                          <label htmlFor="signup-person" style={fieldLabel}>Your full name</label>
                          <input id="signup-person" aria-label="Your full name" className="field" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Sam Smith" style={fieldStyle} />
                          <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>So we can talk to you like a person, not like a company.</p>
                        </div>
                      )}
                    </div>
                  )}
                </Step>
              )}

              {step === 3 && (
                <Step title="What do you do?" sub="We use this to sort your expenses into the right categories automatically.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {trades.map((t) => {
                      const active = trade === t;
                      return (
                        <button key={t} className="chip" onClick={() => { setTrade(t); setSicPick(0); }} style={{ cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: active ? '#fff' : INK, backgroundColor: active ? RIVER : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 22, padding: '10px 16px' }}>{t}</button>
                      );
                    })}
                  </div>
                  {trade === 'Something else' && (
                    <div style={{ marginTop: 18 }}>
                      <label htmlFor="signup-trade" style={fieldLabel}>Tell us what you do</label>
                      <input id="signup-trade" className="field" value={customTrade} onChange={(e) => { setCustomTrade(e.target.value); setSicPick(0); }} placeholder="e.g. Mobile dog groomer" style={fieldStyle} autoFocus />
                    </div>
                  )}
                  {sicChoice && (
                    <div style={{ marginTop: 18, backgroundColor: RIVER_TINT, border: `1.5px solid ${RIVER}`, borderRadius: 14, padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Your likely SIC code</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 6 }}>{sicChoice.code} &middot; {sicChoice.label}</div>
                      {/* 🔴 THIS SAID "when you register your limited company", TO A MAN WHO JUST
                          PICKED "I have a registered company" ONE STEP UP. Lecturing him about
                          registering a company he already has is the small tell that we are not
                          listening. The honest frame: the register's own entry is the record, we
                          file nothing, and this is just so his details here line up. */}
                      <p style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
                        Companies House keeps a code like this on your company&apos;s record. We never file it anywhere, it is matched from what you told us, and the register&apos;s own entry is the one that counts.
                      </p>
                      {sicMatches.length > 1 && (
                        <button type="button" onClick={() => setSicPick((p) => (p + 1) % sicMatches.length)} style={{ marginTop: 8, background: 'none', border: 'none', color: RIVER, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                          Not quite right? Try another
                        </button>
                      )}
                    </div>
                  )}
                </Step>
              )}

              {step === 4 && (
                <Step title="Anything alongside the work?" sub="The question most tax tools never ask, and it changes everything: each stream is taxed its own way, and Lekhio keeps them separate the way HMRC does.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['job', '', 'A PAYE job', 'A salary uses your allowance and bands first, so it sets the rate your business profit is taxed at.'],
                      ['property', '', 'Rental property', 'Rent has its own rules: no National Insurance, Section 24 on the mortgage interest, and new rates arriving April 2027.'],
                      ['loan', '', 'A student loan', 'On self employed income the repayment lands in one lump with the January bill. Lekhio includes it in your set aside figure.'],
                    ] as const).map(([val, icon, t, d]) => {
                      const active = streams.includes(val);
                      return (
                        <button key={val} className="opt" onClick={() => setStreams(active ? streams.filter((x) => x !== val) : [...streams, val])} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, backgroundColor: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '15px 16px' }}>
                          <span style={{ fontSize: 24 }}>{icon}</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: INK }}>{t}</span>
                            <span style={{ display: 'block', fontSize: 13, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{d}</span>
                          </span>
                          <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${active ? RIVER : LINE}`, backgroundColor: active ? RIVER : 'transparent', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 14 }}>Tick any that apply, or none. We ask for the exact figures once you are inside, where they can be saved against your account.</p>
                </Step>
              )}

              {step === 5 && (
                <Step title="Your business address" sub="This shows at the top of your invoices. You can skip it and add it later.">
                  <label htmlFor="signup-postcode" style={fieldLabel}>Postcode</label>
                  <input id="signup-postcode" className="field" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="LS1 4AB" style={fieldStyle} />
                  <label style={{ ...fieldLabel, marginTop: 16 }}>Address</label>
                  <input className="field" aria-label="Your address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit 4, Mill Road, Leeds" style={fieldStyle} />
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>Optional. Tap Continue to skip and add it when you send your first invoice.</p>
                </Step>
              )}

              {step === 6 && (
                /* 🔴 STRUCTURE AWARE, because "Most sole traders are not" was being said to a man
                   who told us two steps earlier that he runs a limited company. VAT registration
                   belongs to the COMPANY for him, so the sentence names that instead of calling
                   him a sole trader. The safe default and the way out stay identical. */
                <Step
                  title="Are you VAT registered?"
                  sub={tradeType === 'ltd'
                    ? 'This one is about the company: whether it is registered for VAT. If you are not sure, choose No, you can change it any time.'
                    : 'Most sole traders are not. If you are not sure, choose No, you can change it any time.'}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    {([['no', 'No', false], ['yes', 'Yes', true]] as const).map(([k, label, val]) => {
                      const active = vat === val;
                      return (
                        <button key={k} className="opt" onClick={() => setVat(val)} style={{ flex: 1, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: active ? RIVER : INK, backgroundColor: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '18px 0' }}>{label}</button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 22, backgroundColor: RIVER_TINT, borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 13.5, color: RIVER_DEEP, lineHeight: 1.6, margin: 0 }}>That is the quick part done. We will email you a code, and then there are {HOW_LONG} of questions about you, which is where the money is. You can stop part way through and pick up where you left off. Your free trial starts the moment you are in, and no card is needed.</p>
                  </div>
                </Step>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      {!done && !billingResult && (
        <div style={{ borderTop: `1px solid ${LINE}`, backgroundColor: '#fff' }}>
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            {step > 1 ? (
              <button onClick={back} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 15, fontWeight: 600, color: MUTED, padding: '12px 4px' }}>Back</button>
            ) : <span />}
            <button className="btn" onClick={() => void next()} disabled={!canContinue} style={{ cursor: canContinue ? 'pointer' : 'not-allowed', backgroundColor: canContinue ? RIVER : '#C7D2E8', color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12 }}>
              {step === TOTAL ? 'Start free trial' : 'Continue'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, paddingBottom: 16, margin: 0 }}>7 days free · No card needed · Cancel any time</p>
        </div>
      )}
    </main>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.8px', margin: '0 0 10px', lineHeight: 1.15 }}>{title}</h1>
      <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.55, margin: '0 0 26px' }}>{sub}</p>
      {children}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%', backgroundColor: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 12, padding: '14px 14px', fontSize: 16, color: INK,
};
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
};
