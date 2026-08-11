'use client';

import { useState } from 'react';
import { leadButton, leadConsentText, leadDoneLine, leadHeading, leadPromise, leadSub } from '../lib/features';
import {
  RIVER, RIVER_DEEP, RIVER_TINT, INK, MUTED, GREEN, GREEN_TINT, ON_GREEN_TINT, RED, PANEL, ON_RIVER, edge,
} from '../lib/apptheme';

// Reusable, PECR compliant email capture for the free tools. Design rules baked in:
//  - The tool's value (the result) is shown for free above this, so giving an
//    email is never a condition of using the tool. Consent is freely given.
//  - The marketing consent box is UNTICKED by default. A pre ticked box is not
//    valid consent under UK law.
//  - The exact wording the user agrees to is sent to the server and stored, so
//    consent is provable (who, when, what they were told).
// Drop it into any tool: <LeadCapture source="cis-calculator" resultNote="Refund est £6,400" />

// 🔴 THIS FILE WROTE THE PALETTE OUT LONGHAND AND THEREFORE COULD NOT INVERT. Found 4 August 2026
// by walking the site in dark at 375px, not by reading it.
//
// It carried RIVER = '#1B59A6', RIVER_TINT = '#E9F1FA', INK = '#111111' and five more. Every one of
// those is the palette's own value, correct to the byte, which is exactly why nobody caught it: in
// light it renders identically to the token. In dark the page goes to --bg #0E1116 and the card
// stays #E9F1FA, a pale island on a black page across eleven public tool pages. Legible, and
// obviously not part of the product.
//
// ⚠️ THE TWO GUARDS THAT WERE BOTH TRUE WHILE IT SHIPPED. test/tokens.test.mjs ratchets DISTINCT
// unnamed colours, and these were all named, so it had nothing to say. test/phonewidth.test.mjs
// bans raw hex outright but walks app/app, which has none. Neither asked "does this invert". The
// ratchet that does now lives beside the first one in test/tokens.test.mjs.
//
// ⚠️ SO NOTHING HERE IS A COLOUR ANY MORE. Every value below is var(--x) via lib/apptheme.ts and
// flips with the theme. The two tinted borders use edge(), which derives from the accent, because
// a fixed border on a flipping panel is the same bug one layer down.
const LINE = edge(RIVER, 20);
const LINE_GREEN = edge(GREEN, 20);

// 🔴 FOUR REMINDER PROMISES USED TO BE TYPED IN THIS FILE, AND IT RENDERS ON ELEVEN PUBLIC PAGES.
// The heading, the sub, the thank you, and the tick box a customer's consent is RECORDED from.
// remindersLive() is false and no channel can send one. Every one of the four now comes from
// lib/features.ts, where both wordings sit side by side, so the day the flag flips all twelve
// pages upgrade themselves. See the header on leadHeading() there for how they survived the
// 3 August sweep: it was a sweep of app/, and this file is not in app/.
//
// ⚠️ A CLIENT COMPONENT, so these must be NEXT_PUBLIC reads. remindersLive() is, deliberately: a
// server only flag would be false here and true on the server, and the same sentence would render
// two different ways on one page.
export default function LeadCapture({
  source,
  resultNote = null,
  heading = leadHeading(),
  sub = leadSub(),
}: {
  source: string;
  resultNote?: string | null;
  heading?: string;
  sub?: string;
}) {
  // 🔴 WHAT WE ARE PROMISING HIM, DECIDED BY THE SOURCE AND NOT BY THIS COMPONENT. See leadPromise
  // in lib/features.ts for what /free-mtd-filing was saying before this existed.
  const promise = leadPromise(source);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!consent) {
      setError('Please tick the box so we know you are happy to hear from us.');
      return;
    }
    setState('sending');
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          result_note: resultNote,
          consent: true,
          consent_text: leadConsentText(promise),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Something went wrong. Try again.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('Something went wrong. Try again.');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div style={{ background: GREEN_TINT, border: `1px solid ${LINE_GREEN}`, borderRadius: 18, padding: '20px 24px', marginTop: 22 }}>
        {/* 🔴 ON the tint, the ink is ON_GREEN_TINT, not GREEN. GREEN on GREEN_TINT reads 4.46:1,
            under the 4.5:1 minimum this product holds every pair to. ON_GREEN_TINT is themed for
            dark too. This card renders on eleven public tool pages, so the fix reaches all of
            them from one place. See lib/tokens.ts. */}
        <div style={{ fontSize: 16, fontWeight: 800, color: ON_GREEN_TINT, marginBottom: 4 }}>You are on the list.</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          {leadDoneLine(promise)}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: RIVER_TINT, border: `1px solid ${LINE}`, borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 6 }}>{heading}</div>
      <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: '0 0 14px' }}>{sub}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {/*
          A PLACEHOLDER IS NOT A LABEL. It disappears the moment he starts typing, it is announced
          by some screen readers and not others, and it fails WCAG 1.3.1 outright.

          There is no visible label here on purpose (the heading above already says what it wants),
          so the label is given to assistive technology directly. That is the correct fix, and it is
          the one that makes our answer to HMRC true: "Does your software meet accessibility
          standards? Yes."
        */}
        <input
          type="email"
          inputMode="email"
          aria-label="Your email address"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          placeholder="you@yourtrade.co.uk"
          style={{ flex: '1 1 220px', minWidth: 0, border: `1.5px solid ${LINE}`, borderRadius: 11, padding: '13px 14px', fontSize: 15, color: INK, background: PANEL }}
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          style={{ background: RIVER, color: ON_RIVER, fontSize: 15, fontWeight: 700, padding: '13px 22px', borderRadius: 11, border: 'none', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}
        >
          {state === 'sending' ? 'Sending…' : leadButton(promise)}
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(ev) => setConsent(ev.target.checked)}
          style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0, accentColor: RIVER }}
        />
        <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{leadConsentText(promise)}</span>
      </label>

      {error ? <p style={{ color: RED, fontSize: 13, margin: '10px 0 0' }}>{error}</p> : null}

      <p style={{ fontSize: 11.5, color: MUTED, margin: '12px 0 0', lineHeight: 1.5 }}>
        We look after your details and never sell them. See our{' '}
        <a href="/privacy" style={{ color: RIVER, fontWeight: 600 }}>Privacy Policy</a>. Lekhio is not HMRC.
      </p>
    </form>
  );
}
