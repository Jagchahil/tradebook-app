'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { rentARoom, PROPERTY_FACTS } from '../../lib/propertyengine';
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
  const [rent, setRent] = useState('');
  const [expenses, setExpenses] = useState('');
  const [shared, setShared] = useState(false);

  const limit = PROPERTY_FACTS['2026-27'].rentARoomLimit;
  const effectiveLimit = shared ? limit / 2 : limit;

  const r = useMemo(() => {
    const gross = parseNum(rent);
    const base = rentARoom(gross, parseNum(expenses));
    // The limit halves when the rent is shared with another person.
    if (!shared) return base;
    const withRelief = Math.max(0, gross - effectiveLimit);
    return {
      ...base,
      withinLimit: gross <= effectiveLimit,
      taxableWithRelief: withRelief,
      reliefIsBetter: withRelief <= base.taxableWithActuals,
    };
  }, [rent, expenses, shared, effectiveLimit]);

  const hasInput = parseNum(rent) > 0;
  const free = r.withinLimit;

  return (
    <div>
      <style>{`
        .rr-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes rrIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .rr-anim{animation:rrIn .35s cubic-bezier(.2,.7,.2,1)}
        .rr-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.rr-grid{grid-template-columns:1fr}}
        .rr-chip{cursor:pointer;border:1.5px solid ${LINE};border-radius:11px;padding:10px 12px;background:var(--panel);text-align:left;width:100%}
        .rr-chip[data-on='true']{border-color:${RIVER};background:${RIVER_TINT}}
      `}</style>

      <div className="rr-grid">
        {/* Inputs */}
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <Field id="rr-rent" label="Rent from your lodger for the year" hint="Everything they pay you, including anything for meals, cleaning or laundry." value={rent} onChange={setRent} placeholder="7,200" />
          <Field id="rr-expenses" label="Your actual costs for the letting" hint="The lodger's share of bills, insurance, wear and tear. Only used if the normal method beats Rent a Room." value={expenses} onChange={setExpenses} placeholder="1,200" />
          <button type="button" className="rr-chip" data-on={shared} onClick={() => setShared(!shared)} aria-pressed={shared}>
            <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>{shared ? '✓ ' : ''}Someone else also receives this rent</span>
            <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>A partner or joint owner. The tax free limit halves to {gbp(limit / 2)} each</span>
          </button>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="rr-anim" style={{ background: free ? GREEN_TINT : AMBER_TINT, border: `1px solid ${free ? '#CFE9D8' : '#F1DBAE'}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: free ? GREEN : AMBER, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                {free ? 'Tax free under Rent a Room' : 'Over the limit: you have a choice'}
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>
                {free ? '£0' : gbp(Math.min(r.taxableWithRelief, r.taxableWithActuals))}
              </div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {free
                  ? `Under the ${gbp(effectiveLimit)} limit there is usually nothing to pay and nothing to report.`
                  : r.reliefIsBetter
                    ? `Taxable if you opt into Rent a Room, which beats deducting your expenses (${gbp(r.taxableWithActuals)} taxable).`
                    : `Taxable using the normal method, which beats Rent a Room (${gbp(r.taxableWithRelief)} taxable). High costs flip the answer.`}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>🛏️</div>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Add the year&apos;s rent and your answer appears here.</div>
            </div>
          )}

          {hasInput && !free ? (
            <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
              <Row label="Opting into Rent a Room" value={`${gbp(r.taxableWithRelief)} taxable`} sub={`Rent above the ${gbp(effectiveLimit)} limit, expenses ignored`} />
              <Row label="Normal method" value={`${gbp(r.taxableWithActuals)} taxable`} sub="Rent less your actual costs" />
              <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
              <Row label="Better for you" value={r.reliefIsBetter ? 'Rent a Room' : 'Normal method'} bold sub="You choose each year on your return. HMRC allows whichever is lower." />
            </div>
          ) : null}
        </div>
      </div>

      {/* Explainer + CTA */}
      <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>The election most people never make</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          Over the limit, HMRC lets you pick the smaller taxable amount every single year, but you have to know the choice exists. Lekhio watches your lodger income alongside everything else you earn, makes the election arithmetic automatic, and Rakha nudges you when the answer flips.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Let Lekhio make the call →</Link>
      </div>

      {hasInput ? (
        <LeadCapture
          source="rent-a-room-checker"
          resultNote={`RaR ${free ? 'tax free' : `taxable ${gbp(Math.min(r.taxableWithRelief, r.taxableWithActuals))}`}`}
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
          className="rr-field"
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
      <div style={{ maxWidth: '62%' }}>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4 }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginLeft: 12 }}>{value}</span>
    </div>
  );
}
