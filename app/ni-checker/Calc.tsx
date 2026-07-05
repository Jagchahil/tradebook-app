'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { niPosition, NI_FACTS } from '../../lib/nistudentloan';
import { FACTS } from '../../lib/taxengine';
import LeadCapture from '../../components/LeadCapture';

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const AMBER = '#8A5A00';
const AMBER_TINT = '#FFF4DE';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export default function Calc() {
  const [salary, setSalary] = useState('');
  const [profit, setProfit] = useState('');

  const r = useMemo(() => niPosition(parseNum(salary), parseNum(profit)), [salary, profit]);
  const hasInput = parseNum(salary) > 0 || parseNum(profit) > 0;
  const pensionSafe = r.qualifiesViaEmployment || r.qualifiesViaProfits;

  return (
    <div>
      <style>{`
        .ni-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes niIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .ni-anim{animation:niIn .35s cubic-bezier(.2,.7,.2,1)}
        .ni-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.ni-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="ni-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <Field id="ni-salary" label="Employment income for the year" hint="Your salary before tax. Leave it empty if you only work for yourself." value={salary} onChange={setSalary} placeholder="0" autoFocus />
          <Field id="ni-profit" label="Self employed profit for the year" hint="Your income less your expenses. Leave it empty if you are only employed." value={profit} onChange={setProfit} placeholder="28,000" />
          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: '6px 0 0' }}>
            2026/27 rates. Class 1 is what your employer takes through payroll. Class 4 comes with your Self Assessment.
          </p>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="ni-anim" style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                Your National Insurance this year
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>{gbp(r.total)}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {r.status === 'both'
                  ? 'Class 1 through your payslip plus Class 4 with your Self Assessment.'
                  : r.status === 'selfEmployed'
                    ? 'Class 4, collected with your Self Assessment bill.'
                    : 'Class 1, taken through your payslip before you are paid.'}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🛡️</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Fill in your numbers and your NI position appears here.</div>
            </div>
          )}

          {hasInput ? (
            <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
              <Row label="Class 1 (employee, via payroll)" value={gbp(r.class1)} sub={`8% between ${gbp(NI_FACTS.class1PrimaryThreshold)} and ${gbp(NI_FACTS.class1UpperEarningsLimit)}, then 2%`} />
              <Row label="Class 4 (self employed)" value={gbp(r.class4)} sub={`6% between ${gbp(FACTS.class4LowerLimit)} and ${gbp(FACTS.class4UpperLimit)}, then 2%`} />
              <Row label="Class 2" value={r.voluntaryClass2Suggested ? `${gbp(r.class2Voluntary.annual)} optional` : '£0'} sub="Voluntary since April 2024" />
              <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
              <Row label="Total charged" value={gbp(r.total)} bold />
            </div>
          ) : null}

          {hasInput ? (
            <div className="ni-anim" style={{ background: pensionSafe ? GREEN_TINT : AMBER_TINT, border: `1px solid ${pensionSafe ? '#CFE9D8' : '#F1DBAE'}`, borderRadius: 18, padding: 18, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: pensionSafe ? GREEN : AMBER, marginBottom: 6 }}>
                {pensionSafe ? '✓ Your State Pension year looks covered' : '△ Your State Pension year may not count'}
              </div>
              <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.55, margin: 0 }}>
                {pensionSafe
                  ? r.qualifiesViaEmployment
                    ? 'Your earnings are above the lower earnings limit, so this year counts towards your State Pension even where no NI is actually paid on it.'
                    : `Profits at or above £${FACTS.class2SmallProfitsThreshold.toLocaleString('en-GB')} mean this year counts towards your State Pension without paying Class 2.`
                  : `With profits under £${FACTS.class2SmallProfitsThreshold.toLocaleString('en-GB')} and no job covering you, this year may not count towards your State Pension. Paying voluntary Class 2, about ${gbp(r.class2Voluntary.annual)} for the year, is usually the cheapest way to protect it. You need 35 qualifying years for the full pension.`}
              </p>
              {r.annualMaximaMayApply ? (
                <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, margin: '8px 0 0' }}>
                  Paying both Class 1 and Class 4 at your level can go over the annual maximum. HMRC can refund the excess, worth checking after year end.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Explainer + CTA */}
      <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>NI is the tax nobody explains</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          It funds your State Pension, and the rules changed completely in 2024: Class 2 became voluntary, so low profit years can quietly stop counting towards your pension without anyone telling you. Lekhio watches your profits all year and tells you when a £190 decision protects a pension year, before the deadline passes, not after.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Let Lekhio watch it for you →</Link>
      </div>

      {hasInput ? (
        <LeadCapture
          source="ni-checker"
          resultNote={`NI est ${gbp(r.total)} (${r.status})`}
        />
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, value, onChange, placeholder, autoFocus }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel)', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span style={{ padding: '13px 12px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          id={id}
          className="ni-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{ flex: 1, border: 'none', padding: '13px 14px', fontSize: 16, color: INK, background: 'transparent' }}
        />
      </div>
      <p style={{ fontSize: 12, color: MUTED, margin: '6px 0 0', lineHeight: 1.45 }}>{hint}</p>
    </div>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <div>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 12 }}>{value}</span>
    </div>
  );
}
