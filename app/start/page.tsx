'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';

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
  'Photographer', 'Tutor', 'Carer', 'Cafe', 'Market trader', 'Freelancer', 'Something else',
];

const TOTAL = 6;

function digitsOnly(v: string) {
  return v.replace(/\D/g, '');
}

export default function StartPage() {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>(null);
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState<boolean | null>(false);
  // The streams question: what sits alongside the trade. It shapes the tax
  // picture and primes the WhatsApp setup, so it earns a step of its own.
  const [streams, setStreams] = useState<string[]>([]);
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
  // Email is optional now. Empty is fine; if they do type one, it must be valid.
  const emailValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameLabel = tradeType === 'ltd' ? 'Company name' : tradeType === 'business' ? 'Trading name' : 'Your full name';

  const canContinue = useMemo(() => {
    if (step === 1) return phoneReady && emailValid;
    if (step === 2) return tradeType !== null && name.trim().length > 1;
    if (step === 3) return trade !== '' && (trade !== 'Something else' || customTrade.trim().length > 1);
    if (step === 4) return true; // streams optional, none is a fine answer
    if (step === 5) return true; // address optional
    if (step === 6) return vat !== null;
    return false;
  }, [step, phoneReady, emailValid, tradeType, name, trade, customTrade, vat]);

  function submitSignup() {
    // Fire and forget. The success screen shows regardless, so the experience
    // never breaks if the backend is not switched on yet.
    try {
      fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          email: email.trim(),
          tradeType,
          name: name.trim(),
          trade: trade === 'Something else' ? customTrade.trim() : trade,
          postcode: postcode.trim(),
          address: address.trim(),
          vat,
          streams,
          website: hp,
          ts: Date.now() - t0,
          offer,
          ref,
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }
  }

  function next() {
    if (step < TOTAL) {
      setStep(step + 1);
    } else {
      submitSignup();
      setDone(true);
    }
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
            <span style={{ fontSize: 12.5, color: MUTED }}>About a minute</span>
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
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
          {offer ? (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, backgroundColor: GREEN_TINT, border: '1px solid #CFE9D8', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: 18 }}>🎉</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: GREEN, lineHeight: 1.4 }}>Your 14 days free is ready. No card needed. Finish to get started.</span>
            </div>
          ) : null}
          {billingResult === 'success' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your plan is locked in.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                Your card is saved and your 14 day free trial is running. You will not be charged until it ends, and you can cancel any time before then and pay nothing. Download the app and say hello on WhatsApp to log your first receipt.
              </p>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', opacity: 0.5 }}>
                  <span style={badgeStore}>  App Store · soon</span>
                  <span style={badgeStore}>▶  Google Play · soon</span>
                </div>
                <p style={{ fontSize: 12.5, color: MUTED, marginTop: 10, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>The app lands in the stores soon. You do not need to wait, everything works on WhatsApp right now.</p>
              </div>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : billingResult === 'cancelled' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your trial is still running.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                No card added, and that is fine. Your 14 day free trial is active. You can add a card to keep Lekhio any time, from the app or the website.
              </p>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', opacity: 0.5 }}>
                  <span style={badgeStore}>  App Store · soon</span>
                  <span style={badgeStore}>▶  Google Play · soon</span>
                </div>
                <p style={{ fontSize: 12.5, color: MUTED, marginTop: 10, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>The app lands in the stores soon. You do not need to wait, everything works on WhatsApp right now.</p>
              </div>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : done ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>You are all set{name ? `, ${name.split(' ')[0]}` : ''}.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 420, margin: '0 auto 18px' }}>
                Your 14 day free trial has started. No card needed. Three steps and your back office runs itself:
              </p>

              <div style={{ textAlign: 'left', backgroundColor: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 16, padding: 18, maxWidth: 460, margin: '0 auto 18px' }}>
                {[
                  ['1', 'Download the app', 'Your books, your figures, your yes on every entry.'],
                  ['2', 'Take the 60 second tour', 'It opens on first launch: how capture works, who Puchio and Rakha are, and why January stops hurting.'],
                  ['3', 'Finish setup on WhatsApp', 'Six quick questions: your work, CIS, student loan, salary, property, a goal. Each answer sharpens your numbers.'],
                ].map(([n, t, d]) => (
                  <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{n}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: INK }}>{t}</span>
                      <span style={{ display: 'block', fontSize: 13, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>{d}</span>
                    </span>
                  </div>
                ))}
                <a href={`https://wa.me/447593214044?text=${encodeURIComponent('setup')}`} style={{ display: 'block', textAlign: 'center', backgroundColor: '#25D366', color: '#fff', fontSize: 15, fontWeight: 700, padding: '13px 0', borderRadius: 12, marginTop: 10 }}>💬 Start the WhatsApp setup now</a>
              </div>

              {/* Optional: add a card so Lekhio carries on after the free trial. */}
              <div style={{ textAlign: 'left', backgroundColor: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 16, padding: 20, maxWidth: 460, margin: '0 auto 24px' }}>
                <p style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>Add a card to keep Lekhio</p>
                <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.5, margin: '0 0 14px' }}>
                  {'Save a card so Lekhio carries on after your trial. Still 14 days free, cancel any time before then and pay nothing.'}
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {(['monthly', 'annual'] as const).map((p) => {
                    const active = plan === p;
                    return (
                      <button key={p} onClick={() => setPlan(p)} style={{ flex: 1, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: active ? RIVER : INK, backgroundColor: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 12, padding: '11px 0' }}>
                        {p === 'monthly' ? 'Monthly' : 'Annual'}
                        {p === 'annual' ? <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: GREEN, marginTop: 2 }}>2 months free</span> : null}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, color: INK }}>{priceNow}</span>
                  <span style={{ fontSize: 12.5, color: MUTED }}>after your free trial</span>
                </div>

                <button className="btn" onClick={startCheckout} disabled={billingBusy} style={{ width: '100%', cursor: billingBusy ? 'wait' : 'pointer', backgroundColor: RIVER, color: '#fff', border: 'none', fontSize: 15.5, fontWeight: 700, padding: '14px 0', borderRadius: 12 }}>
                  {billingBusy ? 'Opening secure checkout…' : 'Save my card, stay 14 days free →'}
                </button>
                <p style={{ fontSize: 11.5, color: MUTED, textAlign: 'center', margin: '10px 0 0' }}>Secure payment by Stripe. We never see your card number.</p>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', opacity: 0.5 }}>
                  <span style={badgeStore}>  App Store · soon</span>
                  <span style={badgeStore}>▶  Google Play · soon</span>
                </div>
                <p style={{ fontSize: 12.5, color: MUTED, marginTop: 10, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>The app lands in the stores soon. You do not need to wait, everything works on WhatsApp right now.</p>
              </div>
              <p style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>Prefer to decide later? Just download the app, your trial is already running.</p>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : (
            <div key={step} className="step-anim">
              {step === 1 && (
                <Step title="Let's set up your account" sub="Your mobile is your account. It links your WhatsApp, where the work happens. Email is optional.">
                  <label style={fieldLabel}>Mobile number</label>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '15px 14px', backgroundColor: RIVER_TINT, color: RIVER, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>🇬🇧 +44</span>
                    <input className="field" inputMode="tel" placeholder="7700 900 000" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={14} style={{ flex: 1, border: 'none', padding: '15px 14px', fontSize: 17, color: INK, letterSpacing: '0.5px', background: 'transparent' }} />
                  </div>
                  <label style={{ ...fieldLabel, marginTop: 18 }}>Email (optional)</label>
                  <input className="field" inputMode="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Only if you want emailed receipts. Everything else happens on WhatsApp.</p>
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>We never share your details. We only ever message you in reply to you.</p>
                </Step>
              )}

              {step === 2 && (
                <Step title="How do you trade?" sub="So your invoices and tax records show the right name.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['sole', '👤', 'Just me', 'Self employed under my own name'],
                      ['business', '🏪', 'A business name', 'I trade as a name, like Smith Electrical'],
                      ['ltd', '🏢', 'A limited company', 'I have a registered company'],
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
                      <label style={fieldLabel}>{nameLabel}</label>
                      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={tradeType === 'ltd' ? 'Smith Electrical Ltd' : tradeType === 'business' ? 'Smith Electrical' : 'Sam Smith'} style={fieldStyle} />
                      {tradeType === 'ltd' && <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>We will verify your company details for you. No need to dig out paperwork.</p>}
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
                        <button key={t} className="chip" onClick={() => setTrade(t)} style={{ cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: active ? '#fff' : INK, backgroundColor: active ? RIVER : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 22, padding: '10px 16px' }}>{t}</button>
                      );
                    })}
                  </div>
                  {trade === 'Something else' && (
                    <div style={{ marginTop: 18 }}>
                      <label style={fieldLabel}>Tell us what you do</label>
                      <input className="field" value={customTrade} onChange={(e) => setCustomTrade(e.target.value)} placeholder="e.g. Mobile dog groomer" style={fieldStyle} autoFocus />
                    </div>
                  )}
                </Step>
              )}

              {step === 4 && (
                <Step title="Anything alongside the work?" sub="The question most tax tools never ask, and it changes everything: each stream is taxed its own way, and Lekhio keeps them separate the way HMRC does.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['job', '💼', 'A PAYE job', 'A salary uses your allowance and bands first, so it sets the rate your business profit is taxed at.'],
                      ['property', '🏠', 'Rental property', 'Rent has its own rules: no National Insurance, Section 24 on the mortgage interest, and new rates arriving April 2027.'],
                      ['loan', '🎓', 'A student loan', 'On self employed income the repayment lands in one lump with the January bill. Lekhio includes it in your set aside figure.'],
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
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 14 }}>Tick any that apply, or none. The two minute WhatsApp setup picks these up properly with the exact figures.</p>
                </Step>
              )}

              {step === 5 && (
                <Step title="Your business address" sub="This shows at the top of your invoices. You can skip it and add it later.">
                  <label style={fieldLabel}>Postcode</label>
                  <input className="field" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="LS1 4AB" style={fieldStyle} />
                  <label style={{ ...fieldLabel, marginTop: 16 }}>Address</label>
                  <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit 4, Mill Road, Leeds" style={fieldStyle} />
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>Optional. Tap Continue to skip and add it when you send your first invoice.</p>
                </Step>
              )}

              {step === 6 && (
                <Step title="Are you VAT registered?" sub="Most sole traders are not. If you are not sure, choose No, you can change it any time.">
                  <div style={{ display: 'flex', gap: 12 }}>
                    {([['no', 'No', false], ['yes', 'Yes', true]] as const).map(([k, label, val]) => {
                      const active = vat === val;
                      return (
                        <button key={k} className="opt" onClick={() => setVat(val)} style={{ flex: 1, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: active ? RIVER : INK, backgroundColor: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '18px 0' }}>{label}</button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 22, backgroundColor: RIVER_TINT, borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 13.5, color: RIVER_DEEP, lineHeight: 1.6, margin: 0 }}>That is everything. Next you will start your free trial. No card needed, and you can cancel any time.</p>
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
            <button className="btn" onClick={next} disabled={!canContinue} style={{ cursor: canContinue ? 'pointer' : 'not-allowed', backgroundColor: canContinue ? RIVER : '#C7D2E8', color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12 }}>
              {step === TOTAL ? 'Start free trial' : 'Continue'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, paddingBottom: 16, margin: 0 }}>14 days free · No card needed · Cancel any time</p>
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
const badgeStore: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: INK, color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 18px', borderRadius: 12,
};
