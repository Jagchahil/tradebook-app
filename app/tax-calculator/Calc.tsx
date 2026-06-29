'use client';

import { useState } from 'react';

// 2026/27, England, Wales and Northern Ireland. Personal allowance £12,570
// (tapered above £100,000), basic 20% then higher 40% then additional 45%.
// Class 4 NI 6% between £12,570 and £50,270, 2% above. Class 2 is not a flat
// charge for most from 2024/25, so it is left out. Simplified, an estimate only.

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const SURFACE = '#F2F0EA';

function personalAllowance(profit: number): number {
  if (profit <= 100000) return 12570;
  return Math.max(0, 12570 - Math.floor((profit - 100000) / 2));
}

function incomeTax(profit: number): number {
  const pa = personalAllowance(profit);
  const taxable = Math.max(0, profit - pa);
  let tax = 0;
  const basic = Math.min(taxable, 37700);
  tax += basic * 0.2;
  const higher = Math.min(Math.max(taxable - 37700, 0), 125140 - pa - 37700);
  tax += higher * 0.4;
  const additional = Math.max(taxable - (125140 - pa), 0);
  tax += additional * 0.45;
  return Math.round(tax);
}

function class4(profit: number): number {
  const lower = 12570;
  const upper = 50270;
  const band1 = Math.max(0, Math.min(profit, upper) - lower) * 0.06;
  const band2 = Math.max(0, profit - upper) * 0.02;
  return Math.round(band1 + band2);
}

function marginalRate(profit: number): number {
  if (profit > 50270) return 0.42;
  if (profit > 12570) return 0.26;
  return 0;
}

function gbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: INK, marginBottom: 7 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span style={{ padding: '13px 12px', background: RIVER_TINT, color: RIVER, fontWeight: 800, fontSize: 15, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 12px', fontSize: 16, color: INK, width: '100%', background: 'transparent' }}
        />
      </div>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 2px 0' }}>{hint}</p>
    </div>
  );
}

function Line({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${SURFACE}` }}>
      <span style={{ fontSize: strong ? 15 : 14, fontWeight: strong ? 700 : 500, color: strong ? INK : MUTED }}>{label}</span>
      <span style={{ fontSize: strong ? 18 : 15, fontWeight: 800, color: accent ?? INK }}>{value}</span>
    </div>
  );
}

export default function Calc() {
  const [turnover, setTurnover] = useState('45000');
  const [expenses, setExpenses] = useState('9000');

  const t = parseInt(turnover || '0', 10) || 0;
  const e = parseInt(expenses || '0', 10) || 0;
  const profit = Math.max(0, t - e);

  const tax = incomeTax(profit);
  const ni = class4(profit);
  const totalTax = tax + ni;
  const takeHome = Math.max(0, profit - totalTax);
  const effective = profit > 0 ? totalTax / profit : 0;
  const setAsidePct = Math.round(effective * 100);
  const saved = Math.round(e * marginalRate(t > 12570 ? t : profit));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }} className="calc-grid">
      {/* Inputs */}
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px', color: INK }}>Your year</h2>
        <p style={{ fontSize: 13.5, color: MUTED, margin: '0 0 20px' }}>Rough figures are fine. Change them and watch it update.</p>
        <Field label="Money in (your turnover)" value={turnover} onChange={setTurnover} hint="Everything you got paid before costs, across the year." />
        <Field label="Your business costs (expenses)" value={expenses} onChange={setExpenses} hint="Materials, fuel, tools, mileage, phone, the lot. This is what Lekhio captures for you." />
        <div style={{ background: RIVER_TINT, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: RIVER_DEEP }}>Taxable profit</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: RIVER_DEEP }}>{gbp(profit)}</span>
        </div>
      </div>

      {/* Results */}
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, boxShadow: '0 16px 40px rgba(17,17,17,.06)' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 14px', color: INK }}>What it means</h2>
        <Line label="Income tax" value={gbp(tax)} />
        <Line label="National Insurance (Class 4)" value={gbp(ni)} />
        <Line label="Total to set aside for tax" value={gbp(totalTax)} strong accent={SAFFRON_DEEP} />
        <Line label="Take home after tax" value={gbp(takeHome)} strong accent={GREEN} />

        <div style={{ background: SAFFRON_TINT, borderRadius: 12, padding: '14px 16px', marginTop: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: SAFFRON_DEEP, marginBottom: 4 }}>Set aside about {setAsidePct}p of every £1 of profit</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>Put roughly {setAsidePct}% of your profit aside and the tax bill never stings. Lekhio tracks this for you in real time.</div>
        </div>

        {saved > 0 ? (
          <div style={{ background: GREEN_TINT, borderRadius: 12, padding: '14px 16px', marginTop: 12 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: GREEN, marginBottom: 4 }}>Claiming your costs saved you about {gbp(saved)}</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>That is the tax you did not pay because you claimed your {gbp(e)} of expenses. Miss them, and that is money handed to HMRC for no reason.</div>
          </div>
        ) : null}

        <p style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginTop: 16 }}>
          An estimate for 2026/27, England, Wales and Northern Ireland. Scotland has different income tax bands. It assumes self employment income only and the standard personal allowance. Not tax advice for your exact situation.
        </p>
      </div>

      <style>{`@media (max-width:820px){.calc-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}
