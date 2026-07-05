'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { STUDENT_PLANS, studentLoanRepayment, type StudentPlan } from '../../lib/nistudentloan';
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
const gbpExact = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const UNDERGRAD: { key: StudentPlan | 'none'; label: string; hint: string }[] = [
  { key: 'plan1', label: 'Plan 1', hint: 'Started uni before Sep 2012 (England or Wales), or NI loans' },
  { key: 'plan2', label: 'Plan 2', hint: 'Started uni Sep 2012 to Jul 2023 (England or Wales)' },
  { key: 'plan4', label: 'Plan 4', hint: 'Scottish student loans' },
  { key: 'plan5', label: 'Plan 5', hint: 'Started uni from Aug 2023 (England)' },
  { key: 'none', label: 'None', hint: 'No undergraduate loan' },
];

export default function Calc() {
  const [income, setIncome] = useState('');
  const [undergrad, setUndergrad] = useState<StudentPlan | 'none'>('plan2');
  const [postgrad, setPostgrad] = useState(false);
  const [selfEmployed, setSelfEmployed] = useState(false);

  const plans = useMemo(() => {
    const p: StudentPlan[] = [];
    if (undergrad !== 'none') p.push(undergrad);
    if (postgrad) p.push('postgrad');
    return p;
  }, [undergrad, postgrad]);

  const r = useMemo(() => studentLoanRepayment(parseNum(income), plans), [income, plans]);
  const hasInput = parseNum(income) > 0 && plans.length > 0;
  const repaying = r.annualTotal > 0;

  return (
    <div>
      <style>{`
        .sl-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes slIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .sl-anim{animation:slIn .35s cubic-bezier(.2,.7,.2,1)}
        .sl-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.sl-grid{grid-template-columns:1fr}}
        .sl-chip{cursor:pointer;border:1.5px solid ${LINE};border-radius:11px;padding:10px 12px;background:var(--panel);text-align:left;width:100%}
        .sl-chip[data-on='true']{border-color:${RIVER};background:${RIVER_TINT}}
      `}</style>

      <div className="sl-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 8 }}>Your undergraduate loan</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {UNDERGRAD.map((u) => (
                <button key={u.key} type="button" className="sl-chip" data-on={undergrad === u.key} onClick={() => setUndergrad(u.key)} aria-pressed={undergrad === u.key}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{u.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>{u.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <button type="button" className="sl-chip" data-on={postgrad} onClick={() => setPostgrad(!postgrad)} aria-pressed={postgrad}>
              <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{postgrad ? '✓ ' : ''}Postgraduate loan too</span>
              <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>A master's or doctoral loan repays on top of a plan loan, 6% above £21,000</span>
            </button>
          </div>

          <Field id="sl-income" label="Your income for the year, before tax" hint="Salary if employed. Profit plus any other income if self employed." value={income} onChange={setIncome} placeholder="34,000" />

          <div style={{ marginBottom: 6 }}>
            <button type="button" className="sl-chip" data-on={selfEmployed} onClick={() => setSelfEmployed(!selfEmployed)} aria-pressed={selfEmployed}>
              <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{selfEmployed ? '✓ ' : ''}I work for myself</span>
              <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>Repayment comes as one lump with your January Self Assessment bill</span>
            </button>
          </div>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="sl-anim" style={{ background: repaying ? RIVER_TINT : GREEN_TINT, border: `1px solid ${repaying ? '#D4E4F4' : '#CFE9D8'}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: repaying ? RIVER_DEEP : GREEN, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                {repaying ? (selfEmployed ? 'Set aside for your January bill' : 'Your repayment this year') : 'Nothing to repay this year'}
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>{gbp(r.annualTotal)}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {repaying
                  ? selfEmployed
                    ? 'HMRC adds this to your Self Assessment bill in one lump. Nothing is taken as you go.'
                    : `About ${gbpExact(r.monthlyTotal)} a month through your payslip.`
                  : 'Your income is under the threshold for your plan, so nothing is due.'}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🎓</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Pick your plan, add your income, and your repayment appears here.</div>
            </div>
          )}

          {hasInput ? (
            <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
              {r.perPlan.map((p) => (
                <Row
                  key={p.plan}
                  label={p.label}
                  value={gbp(p.annual)}
                  sub={`${Math.round(STUDENT_PLANS[p.plan].rate * 100)}% of income above ${gbp(STUDENT_PLANS[p.plan].threshold)}`}
                />
              ))}
              <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
              <Row label="Total for the year" value={gbp(r.annualTotal)} bold />
              <Row label="Per month" value={gbpExact(r.monthlyTotal)} />
            </div>
          ) : null}

          {hasInput && selfEmployed && repaying ? (
            <div className="sl-anim" style={{ background: AMBER_TINT, border: '1px solid #F1DBAE', borderRadius: 18, padding: 18, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: AMBER, marginBottom: 6 }}>△ The January shock, explained</div>
              <p style={{ fontSize: 13.5, color: INK, lineHeight: 1.55, margin: 0 }}>
                Employed people repay a little every payday. Self employed people repay nothing all year, then the whole {gbp(r.annualTotal)} lands on the January tax bill on top of income tax and National Insurance. Put it aside monthly and January is boring, which is the goal.
              </p>
            </div>
          ) : null}

          {hasInput && undergrad !== 'none' ? (
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: '12px 4px 0' }}>
              Write off: {STUDENT_PLANS[undergrad].writeOff}. Near the end of your loan, switching to direct debit stops you overpaying.
            </p>
          ) : null}
        </div>
      </div>

      {/* Explainer + CTA */}
      <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>One number that includes the loan</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          Most tax apps forget student loans exist, then January arrives. Lekhio tracks your income all year and keeps one honest set aside figure: tax, National Insurance and student loan together, so the bill is never a surprise.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Always know your number →</Link>
      </div>

      {hasInput ? (
        <LeadCapture
          source="student-loan-checker"
          resultNote={`SL repay est ${gbp(r.annualTotal)} (${plans.join('+')})`}
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
          className="sl-field"
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
      <div>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 12 }}>{value}</span>
    </div>
  );
}
