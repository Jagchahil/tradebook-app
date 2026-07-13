'use client';

import { useId, useState } from 'react';
import LeadCapture from '../../components/LeadCapture';
import { soleTraderTax, FACTS } from '../../lib/taxengine';

// The public tax calculator. 2026/27, England, Wales and Northern Ireland.
//
// ---------------------------------------------------------------------------------------------
// ⚠️ THIS FILE USED TO CONTAIN ITS OWN TAX ENGINE, AND THAT WAS A SILENT TIME BOMB.
//
// It had its own personalAllowance(), incomeTax(), class4() and marginalRate(), with 12570, 50270,
// 37700, 125140, 0.2, 0.4, 0.45 and 0.06 typed straight into the body. A SECOND COPY OF THE TAX
// LAW, sitting in a marketing page.
//
// Here is why that is worse than it sounds, and it is not "it might drift one day".
//
// KHOJI WATCHES lib/taxengine.ts. It does not watch this file. It cannot: it checks the constants
// we publish at /facts.json, and /facts.json is built from the engine. So the morning after a
// Budget, Khoji compares GOV.UK to the engine, finds the engine correct, and reports GREEN, while
// this page quietly hands a wrong number to every man who visits the website. The alarm would be
// showing all clear, and the public calculator would be lying. That is the exact failure shape this
// whole codebase keeps producing, and the exact one Khoji exists to prevent.
//
// The CIS calculator next door has always done it properly, importing soleTraderTax and FACTS. So
// does this now. There is ONE tax engine, it is tested by 1,354 parity assertions, and it is the
// one thing GOV.UK is checked against every night.
//
// If you are ever tempted to type a tax figure into a component again: don't. Import it.
// ---------------------------------------------------------------------------------------------

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const SAFFRON_DEEP = 'var(--saffron-deep)';
const SAFFRON_TINT = 'var(--saffron-tint)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const SURFACE = 'var(--surface)';

// The tax now comes from the canonical engine. These wrappers exist only so the JSX below did not
// have to change shape, and so that rounding stays where it always was: on the way to the screen,
// never in the maths.
function incomeTax(profit: number): number {
  return Math.round(soleTraderTax(profit).incomeTax);
}

function class4(profit: number): number {
  return Math.round(soleTraderTax(profit).class4);
}

// What the next pound of expenses actually saves him. Income tax rate plus the Class 4 rate at that
// point, because a sole trader pays both on the same pound of profit, which is the bit people miss.
//
// Built from FACTS, not from typed numbers. When the Budget moves a threshold, this moves with it,
// and Khoji is watching FACTS.
function marginalRate(profit: number): number {
  if (profit > FACTS.class4UpperLimit) return FACTS.higherRate + FACTS.class4UpperRate;
  if (profit > FACTS.personalAllowance) return FACTS.basicRate + FACTS.class4MainRate;
  return 0;
}

function gbp(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

// A LABEL THAT IS NOT TIED TO ITS INPUT IS NOT A LABEL.
//
// This used to render a <label> and an <input> side by side with nothing connecting them. It LOOKS
// labelled, and to a sighted man it is. To a screen reader the field is announced as "edit text",
// with no clue whether it wants his income or his expenses, and the hint underneath is never read
// at all.
//
// We answered HMRC's production credentials form: "Does your software meet accessibility standards?
// Yes." That answer has to be true, and it is cheap to make true: useId gives a stable id that
// survives server rendering, htmlFor ties the label to it, and aria-describedby makes the hint part
// of what gets announced instead of decoration nobody hears.
function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 14, fontWeight: 700, color: INK, marginBottom: 7 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel)', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span aria-hidden="true" style={{ padding: '13px 12px', background: RIVER_TINT, color: RIVER, fontWeight: 800, fontSize: 15, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          id={id}
          aria-describedby={hintId}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          style={{ flex: 1, border: 'none', outline: 'none', padding: '13px 12px', fontSize: 16, color: INK, width: '100%', background: 'transparent' }}
        />
      </div>
      <p id={hintId} style={{ fontSize: 12.5, color: MUTED, margin: '6px 2px 0' }}>{hint}</p>
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
  const saved = Math.round(e * marginalRate(t > FACTS.personalAllowance ? t : profit));

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }} className="calc-grid">
      {/* Inputs */}
      <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
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
      <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, boxShadow: '0 16px 40px rgba(17,17,17,.06)' }}>
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
    <LeadCapture source="tax-calculator" resultNote={`Tax est ${gbp(totalTax)} on ${gbp(profit)} profit`} />
    </>
  );
}
