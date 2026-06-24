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
      <main className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#EEF2FF] rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">✓</span>
          </div>
          <h1 className="text-3xl font-extrabold text-[#111111] tracking-tight mb-3">
            You're on the list.
          </h1>
          <p className="text-[#6B7280] text-base leading-relaxed">
            We'll text you when TradeBook is ready for you. Keep your phone nearby.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-6">
      <div className="max-w-md w-full">
        <div className="mb-10">
          <span className="text-2xl font-bold text-[#111111]">TradeBook</span>
        </div>

        <h1 className="text-4xl font-extrabold text-[#111111] tracking-tight leading-tight mb-4">
          Get early access.
        </h1>
        <p className="text-[#6B7280] text-base leading-relaxed mb-8">
          TradeBook is coming to WhatsApp first. Drop your number and we'll text
          you the moment it's live. No app download. No forms. Just text it.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex rounded-xl border border-[#E5E7EB] bg-white overflow-hidden focus-within:border-[#4F46E5] transition-colors">
            <span className="px-4 py-4 bg-[#EEF2FF] text-[#4F46E5] font-semibold text-sm border-r border-[#E5E7EB] whitespace-nowrap">
              🇬🇧 +44
            </span>
            <input
              type="tel"
              placeholder="7700 900 000"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="flex-1 px-4 py-4 text-[#111111] text-base bg-transparent outline-none placeholder-[#9CA3AF]"
              required
            />
          </div>

          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-4 py-4 rounded-xl border border-[#E5E7EB] bg-white text-[#111111] text-base outline-none focus:border-[#4F46E5] transition-colors placeholder-[#9CA3AF]"
          />

          {error && (
            <p className="text-[#EF4444] text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-[#4F46E5] text-white font-bold text-base rounded-xl hover:bg-[#4338CA] transition-colors disabled:opacity-60"
          >
            {loading ? 'Saving...' : 'Get early access'}
          </button>

          <p className="text-[#9CA3AF] text-xs text-center leading-relaxed">
            UK numbers only. No spam. You can remove yourself any time.
          </p>
        </form>
      </div>
    </main>
  );
}
