'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { compare } from '../../lib/ltdengine';
import LeadCapture from '../../components/LeadCapture';

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const AMBER = 'var(--saffron-deep)';
const AMBER_TINT = 'var(--saffron-tint)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export default function Calc() {
  const [profit, setProfit] = useState('');

  const c = useMemo(() => compare(parseNum(profit)), [profit]);
  const hasInput = parseNum(profit) > 0;
  const ltdWins = c.winner === 'ltd';
  const even = c.winner === 'even';

  return (
    <div>
      <style>{`
        .lc-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes lcIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .lc-anim{animation:lcIn .35s cubic-bezier(.2,.7,.2,1)}
        .lc-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.lc-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="lc-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <Field id="lc-profit" label="Your profit for the year" hint="Income less expenses, before any tax. The same number either way: what changes is how it is taxed." value={profit} onChange={setProfit} placeholder="45,000" />
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: '6px 0 0' }}>
            The company side assumes the standard setup: a small director salary (the best of £12,570, £6,708 or £5,000 for your number), the rest as dividends, everything taken out. Money left in the company only strengthens the company case.
          </p>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="lc-anim" style={{ background: even ? AMBER_TINT : GREEN_TINT, border: `1px solid ${even ? '#F1DBAE' : '#CFE9D8'}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: even ? AMBER : GREEN, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                {even ? 'Too close to call' : ltdWins ? 'Limited company keeps more' : 'Sole trader keeps more'}
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>
                {even ? '£0' : `${gbp(Math.abs(c.delta))} a year`}
              </div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {even
                  ? 'The difference is inside the noise. Accountancy costs and admin decide it, and they point at staying sole trader.'
                  : ltdWins
                    ? `Before company costs. Accounts and filing typically run £600 to £1,500 a year, which ${Math.abs(c.delta) < 1500 ? 'would eat most of this' : 'still leaves a real gap'}.`
                    : 'At this profit the dividend rates and employer NI cost more than they save. Simple wins.'}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>⚖️</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Put your profit in and the honest answer appears here.</div>
            </div>
          )}

          {hasInput ? (
            <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
              <Row label="Sole trader: tax and NI" value={gbp(c.soleTrader.tax)} sub="Income tax plus Class 4" />
              <Row label="Sole trader: you keep" value={gbp(c.soleTrader.takeHome)} bold />
              <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
              <Row label={`Company: salary ${gbp(c.ltd.salary)} + dividends`} value={gbp(c.ltd.totalTax)} sub={`Corporation tax ${gbp(c.ltd.corpTax)}, dividend tax ${gbp(c.ltd.divTax)}${c.ltd.employerNI > 0 ? `, employer NI ${gbp(c.ltd.employerNI)}` : ''}`} />
              <Row label="Company: you keep" value={gbp(c.ltd.takeHome)} bold />
            </div>
          ) : null}
        </div>
      </div>

      {/* Explainer + CTA */}
      <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>The answer changes as you grow, so keep asking</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          The dividend rates rose two points in April 2026 and the maths moved for everyone. Landlords have their own version of this question: companies deduct mortgage interest in full and skip the new 2027 property rates. Lekhio runs your real numbers all year and Rakha tells you when the answer flips for you, not for the average person in a blog post.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Get the answer on your numbers →</Link>
      </div>

      {hasInput ? (
        <LeadCapture
          source="sole-trader-vs-limited"
          resultNote={`ST vs Ltd at ${gbp(c.profit)}: ${c.winner} by ${gbp(Math.abs(c.delta))}`}
        />
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, value, onChange, placeholder }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel)', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span style={{ padding: '13px 12px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          id={id}
          className="lc-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, border: 'none', padding: '13px 14px', fontSize: 16, color: INK, background: 'transparent' }}
          autoFocus
        />
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: '6px 0 0', lineHeight: 1.45 }}>{hint}</p>
    </div>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <div style={{ maxWidth: '70%' }}>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 12 }}>{value}</span>
    </div>
  );
}
