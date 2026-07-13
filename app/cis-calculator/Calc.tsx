'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { soleTraderTax, FACTS } from '../../lib/taxengine';
import LeadCapture from '../../components/LeadCapture';

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const RED = 'var(--red)';
const RED_TINT = 'var(--red-tint)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export default function Calc() {
  const [income, setIncome] = useState('');
  const [cis, setCis] = useState('');
  const [expenses, setExpenses] = useState('');

  const r = useMemo(() => {
    const grossIncome = parseNum(income);
    const cisDeducted = parseNum(cis);
    const exp = parseNum(expenses);
    const taxableProfit = Math.max(0, grossIncome - exp);
    const { incomeTax, class4, total } = soleTraderTax(taxableProfit);
    const balance = cisDeducted - total; // positive = refund, negative = still to pay
    return { grossIncome, cisDeducted, exp, taxableProfit, incomeTax, class4, total, balance };
  }, [income, cis, expenses]);

  const hasInput = parseNum(income) > 0 || parseNum(cis) > 0;
  const refund = r.balance >= 0;

  return (
    <div>
      <style>{`
        .cis-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes cisIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .cis-anim{animation:cisIn .35s cubic-bezier(.2,.7,.2,1)}
        .cis-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.cis-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="cis-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <Field label="Total paid to you this year, before CIS" hint="Everything your contractors invoiced you, before they took CIS off." value={income} onChange={setIncome} placeholder="38,000" autoFocus />
          <Field label="CIS already deducted" hint="Add up the CIS amounts from your monthly statements. Usually 20% of your labour." value={cis} onChange={setCis} placeholder="6,400" />
          <Field label="Your business expenses" hint="Tools, materials, fuel, insurance, phone, the lot. This is where most refunds grow." value={expenses} onChange={setExpenses} placeholder="9,000" />
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: '6px 0 0' }}>
            Based on 2026/27 rates, for a sole trader subcontractor with this as their only income. An estimate to show the shape of it, not a filed figure.
          </p>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="cis-anim" style={{ background: refund ? GREEN_TINT : RED_TINT, border: `1px solid ${refund ? '#CFE9D8' : '#F3C7C2'}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: refund ? GREEN : RED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                {refund ? 'Estimated refund owed to you' : 'Estimated still to pay'}
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>{gbp(Math.abs(r.balance))}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {refund
                  ? 'CIS took more than your actual tax bill, so HMRC should pay the difference back.'
                  : 'Your CIS deductions did not quite cover the tax due on your profit.'}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Fill in your numbers and your estimated CIS refund appears here.</div>
            </div>
          )}

          <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
            <Row label="Taxable profit" value={gbp(r.taxableProfit)} sub="Income less your expenses" />
            <Row label="Income tax" value={gbp(r.incomeTax)} />
            <Row label="Class 4 National Insurance" value={gbp(r.class4)} />
            <Row label="Total tax due" value={gbp(r.total)} bold />
            <Row label="CIS already paid" value={gbp(r.cisDeducted)} positive />
            <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
            <Row label={refund ? 'Refund owed' : 'Still to pay'} value={gbp(Math.abs(r.balance))} bold accent={refund ? GREEN : RED} />
          </div>
        </div>
      </div>

      {/* How it works + CTA */}
      <div style={{ background: RIVER_TINT, border: `1px solid #D4E4F4`, borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>Why subbies are nearly always owed money</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          CIS takes {Math.round(FACTS.cisRegisteredRate * 100)}% off your labour before you are paid, as if all of it were profit. But you get a £{FACTS.personalAllowance.toLocaleString('en-GB')} tax free personal allowance, and every tool, every drop of fuel and every bit of material lowers your real profit. So the tax actually due is usually a good bit less than the CIS already taken. The gap is your refund. The trick is logging every expense, all year. Miss them and you hand HMRC money that is yours.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Let Lekhio track every expense for you →</Link>
      </div>

      {/* Consent engine: only shown once they have a result, so the email is
          never a condition of using the free tool. */}
      {hasInput ? (
        <LeadCapture
          source="cis-calculator"
          resultNote={`CIS ${refund ? 'refund' : 'to pay'} est ${gbp(Math.abs(r.balance))}`}
        />
      ) : null}
    </div>
  );
}

// htmlFor + id, and the hint wired in with aria-describedby. A label sitting NEAR an input is not a
// label: a screen reader announces the field as "edit text" and never reads the hint at all. See the
// long note on the same fix in app/tax-calculator/Calc.tsx.
function Field({ label, hint, value, onChange, placeholder, autoFocus }: { label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel)', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ padding: '13px 12px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          id={id}
          aria-describedby={hintId}
          className="cis-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{ flex: 1, border: 'none', padding: '13px 14px', fontSize: 16, color: INK, background: 'transparent' }}
        />
      </div>
      <p id={hintId} style={{ fontSize: 12, color: MUTED, margin: '6px 0 0', lineHeight: 1.45 }}>{hint}</p>
    </div>
  );
}

function Row({ label, value, sub, bold, positive, accent }: { label: string; value: string; sub?: string; bold?: boolean; positive?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <div>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: accent ?? INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: accent ?? (positive ? GREEN : INK), fontVariantNumeric: 'tabular-nums' }}>{positive ? '+ ' : ''}{value}</span>
    </div>
  );
}
