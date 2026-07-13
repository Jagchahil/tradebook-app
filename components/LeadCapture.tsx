'use client';

import { useState } from 'react';

// Reusable, PECR compliant email capture for the free tools. Design rules baked in:
//  - The tool's value (the result) is shown for free above this, so giving an
//    email is never a condition of using the tool. Consent is freely given.
//  - The marketing consent box is UNTICKED by default. A pre ticked box is not
//    valid consent under UK law.
//  - The exact wording the user agrees to is sent to the server and stored, so
//    consent is provable (who, when, what they were told).
// Drop it into any tool: <LeadCapture source="cis-calculator" resultNote="Refund est £6,400" />

const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const INK = '#111111';
const MUTED = '#5B6470';
const LINE = '#D4E4F4';
const GREEN = '#15803D';
const RED = '#B42318';

const CONSENT_TEXT =
  'Yes, email me my result plus occasional tax deadline reminders and money saving tips from Lekhio. I can unsubscribe at any time.';

export default function LeadCapture({
  source,
  resultNote = null,
  heading = 'Want your result emailed, plus your MTD reminders?',
  sub = 'Pop your email in and we will send this result, then the odd genuinely useful nudge about your tax deadlines and money you could claim back. No spam. Unsubscribe any time.',
}: {
  source: string;
  resultNote?: string | null;
  heading?: string;
  sub?: string;
}) {
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
          consent_text: CONSENT_TEXT,
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
      <div style={{ background: '#E7F5EC', border: '1px solid #CFE9D8', borderRadius: 18, padding: '20px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, marginBottom: 4 }}>You are on the list.</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          We will send your result and keep you right on the deadlines that matter. Check your inbox.
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
          style={{ flex: '1 1 220px', minWidth: 0, border: `1.5px solid ${LINE}`, borderRadius: 11, padding: '13px 14px', fontSize: 15, color: INK, background: '#fff' }}
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          style={{ background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '13px 22px', borderRadius: 11, border: 'none', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}
        >
          {state === 'sending' ? 'Sending…' : 'Email me my result'}
        </button>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 14, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(ev) => setConsent(ev.target.checked)}
          style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0, accentColor: RIVER }}
        />
        <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{CONSENT_TEXT}</span>
      </label>

      {error ? <p style={{ color: RED, fontSize: 13, margin: '10px 0 0' }}>{error}</p> : null}

      <p style={{ fontSize: 11.5, color: MUTED, margin: '12px 0 0', lineHeight: 1.5 }}>
        We look after your details and never sell them. See our{' '}
        <a href="/privacy" style={{ color: RIVER, fontWeight: 600 }}>Privacy Policy</a>. Lekhio is not HMRC.
      </p>
    </form>
  );
}
