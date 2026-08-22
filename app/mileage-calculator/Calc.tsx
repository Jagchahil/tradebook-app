'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { mileageClaim, soleTraderTax, FACTS, type Vehicle } from '../../lib/taxengine';
import {
  capitalOptions, vehicleAdvice, USE_BANDS, useBandLabel as bandLabel,
  type CapitalKind, type UseBand,
} from '../../lib/capital';
import { SCOTLAND_LINE } from '../../lib/scotland';
import LeadCapture from '../../components/LeadCapture';
import { gbp0 } from '../../lib/money';
import { edge } from '../../lib/apptheme';

// useBandLabel is aliased to bandLabel for the same reason app/app/CarQuestion.tsx aliases it: the
// name begins with "use", so react-hooks/rules-of-hooks reads a plain label function as a hook and
// refuses the .map() it is called inside. Renaming it in lib/ would touch a live screen to satisfy a
// lint rule, which is the wrong way round.

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const ON_GREEN_TINT = 'var(--on-green-tint)';
const SAFFRON_TINT = 'var(--saffron-tint)';
const ON_SAFFRON_TINT = 'var(--on-saffron-tint)';
const PANEL = 'var(--panel)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const ON_RIVER = 'var(--on-river)';

// Borders derive from their own accent rather than being written as hex, so a tinted panel still
// has an edge in dark. Same reasoning as components/LeadCapture.tsx.
const LINE_GREEN = edge(GREEN, 22);
const LINE_RIVER = edge(RIVER, 22);
const LINE_SAFFRON = edge('var(--saffron)', 26);

// 🔴 HIS MARGINAL RATE, MEASURED OFF THE ENGINE RATHER THAN IMPORTED.
// lib/taxoptimiser.ts exports marginalRate() and it is the right function, but NO client component
// in this repo imports that module, and there is a reason: it pulls propertyengine, ltdengine,
// personalincome, autonomy and nistudentloan in behind it. That is five engines in the bundle of a
// marketing page, downloaded by a stranger who typed a number of miles into a box.
//
// The rate that matters to a DEDUCTION is the one on the last hundred pounds of profit, so this
// takes the tax off with that hundred and without it and divides. It returns the same figure
// marginalRate() does at every band, on the engine already loaded, and it types no rate to do it.
function measuredMarginalRate(profit: number): number {
  if (profit <= 0) return 0;
  const probe = Math.min(100, profit);
  const diff = soleTraderTax(profit).total - soleTraderTax(profit - probe).total;
  return Math.max(0, Math.min(1, diff / probe));
}

function parseNum(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const gbp = (n: number) => gbp0(n);
const pence = (rate: number) => `${Math.round(rate * 100)}p`;

// 🔴 NOT ONE RATE IS TYPED IN THIS FILE. Every figure below, the pence, the band, and the
// wording of the bands in the breakdown, comes out of FACTS at render time.
//
// ⚠️ THE FAILURE THIS AVOIDS HAS ALREADY HAPPENED TWICE IN THIS REPO. HMRC moved the car rate
// from 45p to 55p with effect from 6 April 2026. lib/newsletter.ts was still saying 45p on 6 August,
// four months later, and app/api/whatsapp/route.ts had a hardcoded 55p that ignored an approved
// override. Khoji compares GOV.UK to lib/taxengine.ts and to nothing else, so a rate repeated in a
// component is a rate standing outside the watch: the alarm reads the engine, finds it correct,
// reports green, and the website quietly hands every visitor last year's number.
// See test/onlyoneengine.test.mjs and test/mileage.test.mjs.
const BAND = FACTS.mileageFirstBandMiles;

type VehicleChoice = { v: Vehicle; label: string; rateNote: string };

function vehicleChoices(): VehicleChoice[] {
  return [
    { v: 'car', label: 'Car or van', rateNote: `${pence(FACTS.mileageCarFirst10k)} a mile to ${BAND.toLocaleString('en-GB')}, then ${pence(FACTS.mileageCarOver10k)}` },
    { v: 'motorcycle', label: 'Motorcycle', rateNote: `${pence(FACTS.mileageMotorcycle)} a mile, no band` },
    { v: 'bicycle', label: 'Bicycle', rateNote: `${pence(FACTS.mileageBicycle)} a mile, no band` },
  ];
}

export default function Calc() {
  const [miles, setMiles] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>('car');
  const [profit, setProfit] = useState('');

  // Step two. Closed by default: the man who came for "what are my miles worth" gets his answer in
  // one screen, and only the man actually thinking about a purchase pays for the extra questions.
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState('');
  const [kind, setKind] = useState<CapitalKind>('not_a_car');
  const [useBand, setUseBand] = useState<UseBand>(75);
  const [running, setRunning] = useState('');

  const r = useMemo(() => {
    const m = Math.max(0, parseNum(miles));
    const claim = mileageClaim(m, vehicle);
    const banded = vehicle === 'car' || vehicle === 'van';
    const firstMiles = banded ? Math.min(m, BAND) : m;
    const overMiles = banded ? Math.max(0, m - BAND) : 0;
    const firstRate = banded ? FACTS.mileageCarFirst10k : (vehicle === 'motorcycle' ? FACTS.mileageMotorcycle : FACTS.mileageBicycle);

    // The tax it is actually worth, worked out rather than approximated. A flat marginal rate over
    // states the saving whenever a claim straddles a band edge, so this runs the same engine twice,
    // once with the claim and once without, and shows the difference.
    const p = Math.max(0, parseNum(profit));
    const taxBefore = p > 0 ? soleTraderTax(p).total : 0;
    const taxAfter = p > 0 ? soleTraderTax(Math.max(0, p - claim)).total : 0;
    const taxSaved = p > 0 ? Math.max(0, Math.round(taxBefore - taxAfter)) : 0;

    return { m, claim, firstMiles, overMiles, firstRate, banded, profit: p, taxSaved };
  }, [miles, vehicle, profit]);

  const advice = useMemo(() => {
    const c = parseNum(cost);
    if (!open || c <= 0 || r.m <= 0) return null;
    return vehicleAdvice({
      cost: c,
      kind,
      businessMilesPerYear: r.m,
      businessUsePct: useBand,
      runningCostsPerYear: parseNum(running) || null,
      // His own rate, measured off the engine above. Never a rate typed on this page.
      marginalRate: measuredMarginalRate(r.profit),
    });
  }, [open, cost, kind, useBand, running, r.m, r.profit]);

  const hasInput = r.m > 0;

  return (
    <div>
      <style>{`
        .mi-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT};outline:none}
        @keyframes miIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        .mi-anim{animation:miIn .35s cubic-bezier(.2,.7,.2,1)}
        .mi-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:22px;align-items:start}
        @media(max-width:820px){.mi-grid{grid-template-columns:1fr}}
        .mi-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:640px){.mi-two{grid-template-columns:1fr}}
      `}</style>

      <div className="mi-grid">
        {/* Inputs */}
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
          <Field
            label="Business miles this tax year"
            hint="Work journeys only. Getting from home to a single regular workplace is commuting and does not count."
            value={miles}
            onChange={setMiles}
            placeholder="9,400"
            unit="miles"
            autoFocus
          />

          <Choice
            label="What are you driving"
            options={vehicleChoices().map((c) => ({ value: c.v, label: c.label, note: c.rateNote }))}
            value={vehicle}
            onChange={(v) => setVehicle(v as Vehicle)}
          />

          <Field
            label="Your profit this year, before this claim"
            hint="Roughly what you made after your other costs. Optional. It is only used to show what the claim is worth in actual tax."
            value={profit}
            onChange={setProfit}
            placeholder="34,000"
            unit="£"
          />

          <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.55, margin: '6px 0 0' }}>
            Based on 2026/27 rates for a sole trader using simplified expenses. An estimate to show the shape of it, not a filed figure.
          </p>
        </div>

        {/* Result */}
        <div style={{ position: 'sticky', top: 20 }}>
          {hasInput ? (
            <div className="mi-anim" style={{ background: GREEN_TINT, border: `1px solid ${LINE_GREEN}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: ON_GREEN_TINT, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                Comes off your profit
              </div>
              <div style={{ fontSize: 46, fontWeight: 800, color: INK, letterSpacing: '-1.5px', lineHeight: 1 }}>{gbp(r.claim)}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
                {r.taxSaved > 0
                  ? `On your profit that is about ${gbp(r.taxSaved)} less tax and National Insurance.`
                  : 'Add your profit on the left to see what that is worth in actual tax.'}
              </div>
            </div>
          ) : (
            <div style={{ background: SURFACE, border: `1px dashed ${LINE}`, borderRadius: 18, padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.5 }}>Put your business miles in and the claim appears here.</div>
            </div>
          )}

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, marginTop: 16 }}>
            {r.banded ? (
              <>
                <Row
                  label={`First ${BAND.toLocaleString('en-GB')} miles at ${pence(FACTS.mileageCarFirst10k)}`}
                  sub={`${Math.round(r.firstMiles).toLocaleString('en-GB')} miles`}
                  value={gbp(r.firstMiles * FACTS.mileageCarFirst10k)}
                />
                <Row
                  label={`Miles above ${BAND.toLocaleString('en-GB')} at ${pence(FACTS.mileageCarOver10k)}`}
                  sub={`${Math.round(r.overMiles).toLocaleString('en-GB')} miles`}
                  value={gbp(r.overMiles * FACTS.mileageCarOver10k)}
                />
              </>
            ) : (
              <Row
                label={`${Math.round(r.m).toLocaleString('en-GB')} miles at ${pence(r.firstRate)}`}
                sub="One rate, no band"
                value={gbp(r.claim)}
              />
            )}
            <div style={{ height: 1, background: LINE, margin: '12px 0' }} />
            <Row label="Total mileage claim" value={gbp(r.claim)} bold accent={GREEN} />
            {r.taxSaved > 0 ? <Row label="Tax and NI it saves you" value={gbp(r.taxSaved)} bold /> : null}
          </div>

          {/* WHICH COUNTRY'S RATES. The mileage rate itself is UK wide, but the second figure on this
              screen is the TAX it saves, and that is worked out at the England, Wales and Northern
              Ireland bands. A Scot reading "about £1,430 less tax" off a free tool has no account to
              read a caveat on later and no second screen to correct it. Same constant, same reason,
              as its four sibling tools. See lib/scotland.ts and test/scotland.test.mjs. */}
          <p style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, marginTop: 14 }}>
            {SCOTLAND_LINE}
          </p>
        </div>
      </div>

      {/* ── THE TRAP, ABOVE THE FOLD OF THE SECOND HALF ────────────────────────────────────────
          Claiming mileage AND the fuel is the commonest mistake in this whole area, and it is the
          one that costs money at an enquiry rather than merely leaving some on the table. It goes
          before the buy-or-mileage comparison, not after it. */}
      <div style={{ background: SAFFRON_TINT, border: `1px solid ${LINE_SAFFRON}`, borderRadius: 18, padding: '20px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: ON_SAFFRON_TINT, marginBottom: 8 }}>Do not claim the fuel as well</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          The mileage rate is a simplified expense and it already covers the lot: the fuel, the insurance, the servicing, the road tax, the tyres, the repairs. Put mileage in and then put your fuel receipts in too and you have claimed the fuel twice. Pick mileage, and the pump receipts are just your record of the journeys, not a second deduction.
        </p>
      </div>

      {/* ── STEP TWO ─────────────────────────────────────────────────────────────────────────── */}
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 24, marginTop: 22 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: INK, font: 'inherit' }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: RIVER_TINT, color: RIVER_DEEP, fontWeight: 800, fontSize: 15, flex: '0 0 auto' }}>{open ? '−' : '+'}</span>
          <span>
            <span style={{ display: 'block', fontSize: 16.5, fontWeight: 800 }}>Thinking of buying a vehicle through the business?</span>
            <span style={{ display: 'block', fontSize: 13.5, color: MUTED, marginTop: 3 }}>You have to pick one route and you cannot switch later. See which is worth more on your figures.</span>
          </span>
        </button>

        {open ? (
          <div className="mi-anim" style={{ marginTop: 20, borderTop: `1px solid ${LINE}`, paddingTop: 20 }}>
            <div className="mi-two">
              <Field label="What it costs" hint="The price you would pay for it." value={cost} onChange={setCost} placeholder="18,000" unit="£" />
              <Field label="What it costs to run a year" hint="Fuel, insurance, servicing, tax, tyres. A rough figure is fine. Optional." value={running} onChange={setRunning} placeholder="3,200" unit="£" />
            </div>

            <Choice
              label="What sort of vehicle is it"
              options={capitalOptions().map((o) => ({ value: o.kind, label: o.label, note: o.note }))}
              value={kind}
              onChange={(v) => setKind(v as CapitalKind)}
            />

            <Choice
              label="How much of the driving is for work"
              options={USE_BANDS.map((b) => ({ value: String(b), label: `${b}%`, note: bandLabel(b) }))}
              value={String(useBand)}
              onChange={(v) => setUseBand(Number(v) as UseBand)}
            />

            {advice ? (
              <div className="mi-anim" style={{ marginTop: 6 }}>
                <div className="mi-two" style={{ marginBottom: 16 }}>
                  <Card
                    title="Keep it in your own name"
                    lead={gbp(advice.mileageFirstYear)}
                    sub="off your profit in year one"
                    later={`${gbp(advice.mileageLaterYear)} again every year you do those miles`}
                    win={advice.best === 'mileage'}
                  />
                  <Card
                    title="Buy it through the business"
                    lead={gbp(advice.purchaseFirstYear)}
                    sub="off your profit in year one"
                    later={`about ${gbp(advice.purchaseLaterYear)} in a typical later year`}
                    win={advice.best === 'business_purchase'}
                  />
                </div>

                {/* The reasoning comes from lib/capital.ts vehicleAdvice(), which is the same engine
                    the in app vehicle screen reads. Rendered, never rewritten: the wording carries
                    the lock rule and the double claim warning, and a paraphrase on a marketing page
                    is how those two get softened. */}
                <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, padding: '18px 20px' }}>
                  {advice.lines.map((line, i) => (
                    <p key={i} style={{ fontSize: 14.5, color: INK, lineHeight: 1.62, margin: i === 0 ? 0 : '12px 0 0' }}>{line}</p>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13.5, color: MUTED, lineHeight: 1.55, margin: '4px 0 0' }}>
                Put your business miles in above and a price in here, and the two routes get worked out side by side.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Why it matters + CTA */}
      <div style={{ background: RIVER_TINT, border: `1px solid ${LINE_RIVER}`, borderRadius: 18, padding: '22px 24px', marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: RIVER_DEEP, marginBottom: 8 }}>The miles nobody writes down</div>
        <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.6, margin: 0 }}>
          The trip to the merchant. The quote you drove out to give and never won. The run to the wholesaler because one part was missing. Each one is a business journey at {pence(FACTS.mileageCarFirst10k)} a mile, and each one is forgotten by the following Tuesday. HMRC expects a record behind the claim, so the date, the destination, the reason and the miles need to be somewhere. Most people reconstruct it in January from memory and go low, because a number you cannot back up is a number you talk yourself out of.
        </p>
        <Link href="/start" style={{ display: 'inline-block', marginTop: 16, background: RIVER, color: ON_RIVER, fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 11 }}>Let Lekhio keep the log for you →</Link>
      </div>

      {/* Consent engine: only shown once they have a result, so the email is never a condition of
          using the free tool. */}
      {hasInput ? (
        <LeadCapture
          source="mileage-calculator"
          resultNote={`Mileage claim est ${gbp(r.claim)} on ${Math.round(r.m).toLocaleString('en-GB')} miles`}
        />
      ) : null}
    </div>
  );
}

// htmlFor + id, and the hint wired in with aria-describedby. A label sitting NEAR an input is not a
// label: a screen reader announces the field as "edit text" and never reads the hint at all. Same
// fix as app/cis-calculator/Calc.tsx.
function Field({ label, hint, value, onChange, placeholder, unit, autoFocus }: { label: string; hint: string; value: string; onChange: (v: string) => void; placeholder: string; unit: '£' | 'miles'; autoFocus?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const money = unit === '£';
  return (
    <div style={{ marginBottom: 18 }}>
      <label htmlFor={id} style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        {money ? <span aria-hidden="true" style={{ padding: '13px 12px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>£</span> : null}
        <input
          id={id}
          aria-describedby={hintId}
          className="mi-field"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          style={{ flex: 1, border: 'none', padding: '13px 14px', fontSize: 16, color: INK, background: 'transparent', minWidth: 0 }}
        />
        {money ? null : <span aria-hidden="true" style={{ padding: '13px 14px', background: SURFACE, color: MUTED, fontWeight: 700, fontSize: 14, borderLeft: `1.5px solid ${LINE}` }}>miles</span>}
      </div>
      <p id={hintId} style={{ fontSize: 12, color: MUTED, margin: '6px 0 0', lineHeight: 1.45 }}>{hint}</p>
    </div>
  );
}

// A radio group, not a row of buttons that look like one. Grouped and labelled, so a keyboard lands
// on the group once and arrows through the options rather than tabbing past each in turn.
function Choice({ label, options, value, onChange }: { label: string; options: { value: string; label: string; note: string }[]; value: string; onChange: (v: string) => void }) {
  const name = useId();
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
      <legend style={{ fontSize: 13.5, fontWeight: 700, color: INK, marginBottom: 8, padding: 0 }}>{label}</legend>
      <div style={{ display: 'grid', gap: 8 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: on ? RIVER_TINT : PANEL, border: `1.5px solid ${on ? RIVER : LINE}`, borderRadius: 12, padding: '11px 13px', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                onChange={() => onChange(o.value)}
                style={{ marginTop: 3, accentColor: RIVER, flex: '0 0 auto' }}
              />
              <span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: on ? RIVER_DEEP : INK }}>{o.label}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: MUTED, lineHeight: 1.45, marginTop: 2 }}>{o.note}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Card({ title, lead, sub, later, win }: { title: string; lead: string; sub: string; later: string; win: boolean }) {
  return (
    <div style={{ background: win ? GREEN_TINT : SURFACE, border: `1px solid ${win ? LINE_GREEN : LINE}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: win ? ON_GREEN_TINT : MUTED, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-1px', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{lead}</div>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sub}</div>
      <div style={{ fontSize: 13, color: INK, marginTop: 10, lineHeight: 1.5 }}>{later}</div>
    </div>
  );
}

function Row({ label, value, sub, bold, accent }: { label: string; value: string; sub?: string; bold?: boolean; accent?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <div>
        <span style={{ fontSize: bold ? 15 : 14, fontWeight: bold ? 800 : 500, color: accent ?? INK }}>{label}</span>
        {sub ? <div style={{ fontSize: 11.5, color: MUTED }}>{sub}</div> : null}
      </div>
      <span style={{ fontSize: bold ? 16 : 14.5, fontWeight: bold ? 800 : 600, color: accent ?? INK, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
