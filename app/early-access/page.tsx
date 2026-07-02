'use client';

import { useState } from 'react';

export default function EarlyAccessPage() {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Enter a valid UK mobile number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleaned, email }),
      });
      if (!res.ok) throw new Error('Failed to save.');
      setDone(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main style={styles.page}>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <div style={styles.tick}>✓</div>
          <h1 style={styles.heading}>You&apos;re on the list.</h1>
          <p style={styles.sub}>
            We&apos;ll text you when Lekhio is ready for you. Keep your phone nearby.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.wordmark}>Lekhio</div>

        <h1 style={styles.heading}>Get early access.</h1>
        <p style={styles.sub}>
          Lekhio is coming to WhatsApp first. Drop your number and we&apos;ll text
          you the moment it&apos;s live. No app download. No forms. Just text it.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.phoneRow}>
            <span style={styles.prefix}>🇬🇧 +44</span>
            <input
              type="tel"
              placeholder="7700 900 000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              style={styles.phoneInput}
              required
            />
          </div>

          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={styles.emailInput}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Saving...' : 'Get early access'}
          </button>

          <p style={styles.small}>
            UK numbers only. No spam. You can remove yourself any time.
          </p>
        </form>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#FBFAF7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
  },
  wordmark: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#111111',
    marginBottom: '36px',
    letterSpacing: '-0.3px',
  },
  heading: {
    fontSize: '38px',
    fontWeight: '800',
    color: '#111111',
    letterSpacing: '-1px',
    lineHeight: '1.15',
    margin: '0 0 14px 0',
  },
  sub: {
    fontSize: '16px',
    color: '#6B7280',
    lineHeight: '1.6',
    margin: '0 0 32px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  phoneRow: {
    display: 'flex',
    borderRadius: '12px',
    border: '1.5px solid #E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  prefix: {
    padding: '16px',
    backgroundColor: '#E9F1FA',
    color: '#1B59A6',
    fontWeight: '600',
    fontSize: '14px',
    borderRight: '1.5px solid #E5E7EB',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
  },
  phoneInput: {
    flex: 1,
    padding: '16px',
    fontSize: '16px',
    color: '#111111',
    border: 'none',
    outline: 'none',
    backgroundColor: 'transparent',
  },
  emailInput: {
    width: '100%',
    padding: '16px',
    fontSize: '16px',
    color: '#111111',
    border: '1.5px solid #E5E7EB',
    borderRadius: '12px',
    outline: 'none',
    backgroundColor: '#FFFFFF',
    boxSizing: 'border-box',
  },
  error: {
    color: '#EF4444',
    fontSize: '13px',
    margin: '0',
  },
  button: {
    width: '100%',
    padding: '17px',
    backgroundColor: '#1B59A6',
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '700',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  small: {
    fontSize: '12px',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: '1.5',
    margin: '0',
  },
  tick: {
    width: '56px',
    height: '56px',
    backgroundColor: '#E9F1FA',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    margin: '0 auto 20px',
    color: '#1B59A6',
  },
};
