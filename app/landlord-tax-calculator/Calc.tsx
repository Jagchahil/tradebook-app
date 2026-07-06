'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { aprilDelta } from '../../lib/propertyengine';
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
  const [salary, setSalary] = useState('');
  const [tradeProfit, setTradeProfit] = useState('');
  const [rents, setRents] = useState('');
  const [expenses, setExpenses] = useState('');
  const [finance, setFinance] = useState('');
  const [joint, setJoint] = useState(false);

  const d = useMemo(
    () =>
      aprilDelta({
        employmentIncome: parseNum(salary),
        tradeProfit: parseNum(tradeProfit),
        rents: parseNum(rents),
        propertyExpenses: parseNum(expenses),
        financeCosts: parseNum(finance),
        jointShare: joint ? 0.5 : 1,
      }),
    [salary, tradeProfit, rents, expenses, finance, joint],
  );

  const hasInput = parseNum(rents) > 0;
  const now = d.now;
  const then = d.then;
  const rises = d.extraPerYear > 0;

  return (
    <div>
      <style>{`
        .ll-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes llIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .ll-anim{animation:llIn .35s cubic-bezier(.2,.7,.2,1)}
        .ll-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.ll-grid{grid-template-columns:1fr}}
        .ll-chip{cursor:pointer;border:1.5px solid ${LINE};border-radius:11px;padding:10px 12px;background:var(--panel);text-align:left;width:100%}
        .ll-chip[data-on='true']{border-color:${RIVER};background:${RIVER_TINT}}
      `}</style>

      <div className="ll-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 10 }}>Income outside the property</div>
          <Field id="ll-salary" label="Employment income for the year" hint="Salary before tax. Leave empty if you have no job." value={salary} onChange={setSalary} placeholder="0" />
          <Field id="ll-trade" label="Self employed profit for the year" hint="Income less expenses from working for yourself. Leave empty if none." value={tradeProfit} onChange={setTradeProfit} placeholder="0" />

          <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, margin: '4px 0 10px' }}>The property</div>
          <Field id="ll-rents" label="Rent for the year, before costs" hint="Everything your tenants pay you across the year." value={rents} onChange={setRents} placeholder="12,000" />
          <Field id="ll-expenses" label="Allowable expenses, excluding mortgage interest" hint="Repairs, agent fees, insurance, ground rent. If under £1,000 the flat allowance is applied instead, automatically." value={expenses} onChange={setExpenses} placeholder="2,000" />
          <Field id="ll-finance" label="Mortgage interest for the year" hint="The interest part only, not capital repayments. Section 24 turns this into a tax credit rather than an expense." value={finance} onChange={setFinance} placeholder="6,000" />

          <button type="button" className="ll-chip" data-on={joint} onClick={() => setJoint(!joint)} aria-pressed={joint}>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{joint ? '✓ ' : ''}Owned 50/50 with someone else</span>
            <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>Halves the rents, expenses and interest to show your share only</span>
          </button>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="ll-anim" style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                Tax your property adds, {now.yearLabel}
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>{gbp(now.taxCausedByProperty)}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                On top of the {gbp(now.incomeTax - now.taxCausedByProperty)} your other income already costs. No National Insurance on rent.
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🏠</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Add your rent and costs, and your bill appears here, this year and after April 2027.</div>
            </div>
          )}

          {hasInput ? (
            <div className="ll-anim" style={{ background: rises ? AMBER_TINT : GREEN_TINT, border: `1px solid ${rises ? '#F1DBAE' : '#CFE9D8'}`, borderRadius: 18, padding: 20, marginTop: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: rises ? AMBER : GREEN, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>
                From April 2027
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-1px', lineHeight: 1 }}>
                {rises ? `+${gbp(d.extraPerYear)} a year` : 'No change on these numbers'}
              </div>
              <div style={{ fontSize: 12.5, color: INK, marginTop: 8, lineHeight: 1.5 }}>
                {rises
                  ? `Property income moves to its own rates (22/42/47) and the mortgage interest credit moves to 22%. Your ${then.yearLabel} bill on the same numbers: ${gbp(then.incomeTax)}.`
                  : 'The new property rates only bite once your rental profit is taxed. On these numbers nothing changes.'}
              </div>
            </div>
          ) : null}

          {hasInput ? (
            <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
              <Row label="Rental profit" value={gbp(now.property.profit)} sub={now.property.note} />
              <Row label={`Tax on the rental, ${now.yearLabel}`} value={gbp(now.propertyTax)} />
              {now.s24Relief > 0 ? <Row label="Mortgage interest credit (Section 24)" value={`-${gbp(now.s24Relief)}`} sub={now.s24UnrelievedFinance > 0 ? `${gbp(now.s24UnrelievedFinance)} of interest is capped this year and carries forward` : undefined} /> : null}
              <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
              <Row label={`Whole bill, ${now.yearLabel}`} value={gbp(now.totalWithClass4)} bold sub={now.class4 > 0 ? 'Including Class 4 NI on your self employed profit' : undefined} />
              <Row label={`Whole bill, ${then.yearLabel}`} value={gbp(then.totalWithClass4)} bold />
            </div>
          ) : null}
        </div>
      </div>

      {/* Explainer + CTA */}
      <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>April 2027 is the biggest landlord tax change since Section 24</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          Budget 2025 gave property income its own tax rates from April 2027, two points above the normal ones, and quietly changed how your personal allowance is used. Most landlords will find out when the bill arrives. Lekhio tracks your rents and costs all year, keeps the set aside number honest across your job, your trade and your property, and Rakha warns you about changes like this a year early, on your numbers, not in a headline.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Never get surprised by a Budget →</Link>
      </div>

      {hasInput ? (
        <LeadCapture
          source="landlord-tax-calculator"
          resultNote={`Landlord est ${gbp(now.taxCausedByProperty)} now, +${gbp(d.extraPerYear)} from 2027`}
        />
      ) : null}
    </div>
  );
}

function Field({ id, label, hint, value, onChange, placeholder }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--panel)', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span style={{ padding: '13px 12px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>£</span>
        <input
          id={id}
          className="ll-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
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
      <div style={{ maxWidth: '70%' }}>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 12 }}>{value}</span>
    </div>
  );
}
