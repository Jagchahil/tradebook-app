'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { findSic } from '../../lib/siccodes';

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const SAFFRON = '#E0A33E';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';

const OFFER_HREF = '/start?offer=setup20';

type PathKey = 'sole' | 'name' | 'ltd' | 'done';

interface Choice {
  key: PathKey;
  icon: string;
  title: string;
  sub: string;
}

const CHOICES: Choice[] = [
  { key: 'sole', icon: '👤', title: 'Become a sole trader', sub: 'The simplest way to work for yourself. Most trades start here.' },
  { key: 'name', icon: '🏪', title: 'Trade under a business name', sub: 'Still a sole trader, with a name like Chahil Electrical.' },
  { key: 'ltd', icon: '🏢', title: 'Set up a limited company', sub: 'A registered company. More admin, more protection.' },
  { key: 'done', icon: '✅', title: 'I am already set up', sub: 'Skip the setup and go straight to your books.' },
];

interface Step {
  title: string;
  body: string;
  codeLabel?: string;
  codeValue?: string;
  linkLabel?: string;
  linkHref?: string;
  tip?: string;
  sic?: boolean;
  preview?: { site: 'GOV.UK' | 'Companies House'; heading: string; cta: string };
}

const GATEWAY ='https://www.gov.uk/log-in-register-hmrc-online-services';
const REGISTER_SA = 'https://www.gov.uk/register-for-self-assessment/self-employed';
const CH_SEARCH = 'https://find-and-update.company-information.service.gov.uk/';
const CH_FORM = 'https://www.gov.uk/limited-company-formation';
const CH_IDV = 'https://www.gov.uk/guidance/verifying-your-identity-for-companies-house';
const CORP_TAX = 'https://www.gov.uk/corporation-tax';

const SOLE_TAIL: Step[] = [
  { title: 'Set up your Government Gateway', body: 'This is your login for everything HMRC. Create one with your email and you get a user ID and password. You will use it to register and, later, to file.', linkLabel: 'Create a Government Gateway account', linkHref: GATEWAY, preview: { site: 'GOV.UK', heading: 'Sign in to your HMRC online account', cta: 'Create sign in details' } },
  { title: 'Register for Self Assessment as self employed', body: 'Tell HMRC you are working for yourself. The form is the CWF1, done online. It also signs you up for Class 2 and Class 4 National Insurance at the same time, so this is one job, not three.', codeLabel: 'The form', codeValue: 'CWF1', linkLabel: 'Register for Self Assessment', linkHref: REGISTER_SA, preview: { site: 'GOV.UK', heading: 'Register for Self Assessment', cta: 'Start now' } },
  { title: 'Get your UTR', body: 'HMRC posts you a Unique Taxpayer Reference, a 10 digit number, within about 10 working days, plus an activation code for your online account. Keep the UTR safe, you need it every time you file.', codeLabel: 'You receive', codeValue: 'A 10 digit UTR' },
  { title: 'Start keeping digital records', body: 'From day one, log your income and costs. Lekhio does this from a text, so you are ready for Making Tax Digital with no spreadsheets and no January scramble.' },
];

function stepsFor(path: PathKey): Step[] {
  if (path === 'sole') {
    return [
      { title: 'Check you need to register', body: 'Once you earn more than £1,000 a year working for yourself, HMRC needs you registered for Self Assessment. The deadline is 5 October after the tax year you started, so do not sit on it.', tip: 'Under £1,000 a year? The trading allowance covers you and you do not need to register yet.' },
      ...SOLE_TAIL,
    ];
  }
  if (path === 'name') {
    return [
      { title: 'Pick your trading name', body: 'You can trade under a name like Chahil Electrical without registering it anywhere. The rules: it cannot include Limited, Ltd, plc or LLP, cannot be offensive, and cannot copy an existing trade mark. Put your own name and the business name on your invoices.', tip: 'Check the name is free as a trade mark on the IPO website, and grab the matching domain while you are at it.' },
      { title: 'Check you need to register for tax', body: 'A business name does not change your tax. You are still a sole trader, so you register for Self Assessment once you earn over £1,000 a year, by 5 October after the tax year you started.' },
      ...SOLE_TAIL,
    ];
  }
  if (path === 'ltd') {
    return [
      { title: 'Choose your company name', body: 'Check it is free on the Companies House register. It must end in Limited or Ltd, must not be the same as an existing company, and cannot use sensitive words without permission.', linkLabel: 'Search the Companies House register', linkHref: CH_SEARCH, preview: { site: 'Companies House', heading: 'Search the register', cta: 'Search' } },
      { title: 'Gather what you need, including your SIC code', body: 'A registered office address, which is public, at least one director, your shareholders and how the shares split, anyone with significant control, usually anyone owning more than 25%, and a SIC code that describes what you do. Tell us your trade below and we will give you the exact code.', codeLabel: 'You need a', codeValue: 'SIC code', sic: true },
      { title: 'Verify your identity', body: 'Since late 2025, every director and person with significant control must verify their identity with Companies House. You do it online with photo ID and get a personal code. Sort this before or as you register.', codeLabel: 'You get a', codeValue: 'Personal code', linkLabel: 'Verify your identity', linkHref: CH_IDV, preview: { site: 'GOV.UK', heading: 'Verify your identity for Companies House', cta: 'Start now' } },
      { title: 'Register at Companies House', body: 'Register online. It costs £100 and you are usually set up within 24 hours. You get a Certificate of Incorporation and your company number.', codeLabel: 'Cost', codeValue: '£100 online', linkLabel: 'Set up a limited company', linkHref: CH_FORM, preview: { site: 'GOV.UK', heading: 'Set up a limited company', cta: 'Register now' } },
      { title: 'Tell HMRC, set up Corporation Tax', body: 'Within 3 months of starting to trade, register the company for Corporation Tax. As a director you may also need to register for your own Self Assessment.', linkLabel: 'Register for Corporation Tax', linkHref: CORP_TAX, preview: { site: 'GOV.UK', heading: 'Register for Corporation Tax', cta: 'Sign in and register' } },
    ];
  }
  return [];
}

const EXTRAS: { icon: string; title: string; body: string; href: string }[] = [
  { icon: '🧾', title: 'VAT', body: 'Only once your turnover passes £90,000 in a 12 month period. Most sole traders never reach it.', href: 'https://www.gov.uk/vat-registration' },
  { icon: '👷', title: 'CIS', body: 'In construction? Register for the Construction Industry Scheme. As a subcontractor it drops your deduction from 30% to 20%.', href: 'https://www.gov.uk/what-is-the-construction-industry-scheme' },
  { icon: '👥', title: 'PAYE', body: 'Taking on your first employee or apprentice? Register as an employer before their first payday.', href: 'https://www.gov.uk/paye-for-employers' },
];

interface Essential {
  icon: string;
  title: string;
  body: string;
  cost?: string;
  expense?: boolean;
  expenseLabel?: string;
  linkLabel: string;
  linkHref?: string;
  internalHref?: string;
}

// The full "set up the rest of your business" checklist. What a traditional
// accountant would point you to, free, with Lekhio woven through. Every
// allowable cost gets a nudge that Lekhio tracks it for tax.
const ESSENTIALS: Essential[] = [
  { icon: '🏦', title: 'Open a business bank account', body: 'Keep business money separate from day one. Popular free or low cost picks for sole traders are Starling, Tide, Mettle and Monzo Business.', cost: 'Free to a few pounds a month', expense: true, linkLabel: 'Compare business accounts', linkHref: 'https://www.moneysavingexpert.com/banking/business-bank-accounts/' },
  { icon: '📧', title: 'Get a proper email and domain', body: 'name@yourbusiness.co.uk looks the part on every invoice. Google Workspace gives you email, and a .co.uk domain is about £10 a year.', cost: 'From about £5 a month plus the domain', expense: true, linkLabel: 'Set up Google Workspace', linkHref: 'https://workspace.google.com/' },
  { icon: '🛡️', title: 'Sort your insurance', body: 'Public liability is a must for most trades. Add tools cover and professional indemnity if you need them. Compare quotes on a broker.', cost: 'From a few pounds a month', expense: true, linkLabel: 'Compare cover', linkHref: 'https://www.simplybusiness.co.uk/' },
  { icon: '🧾', title: 'Look professional getting paid', body: 'Send clean, branded invoices and quotes. Use our free maker now, or let Lekhio build and send them from a text.', linkLabel: 'Free invoice maker', internalHref: '/invoice-generator' },
  { icon: '📜', title: 'Trade registration, if you need it', body: 'Gas engineers need Gas Safe, electricians often need NICEIC or NAPIT. Check what your trade requires before you take on work.', cost: 'Varies by trade', expense: true, expenseLabel: 'Claim the fee on Lekhio', linkLabel: 'Gas Safe register', linkHref: 'https://www.gassaferegister.co.uk/' },
  { icon: '💷', title: 'Start a pension', body: 'A self employed pension cuts your tax bill and builds your future. Nest is the simple, government backed option.', cost: 'You choose', expense: true, expenseLabel: 'Cuts your tax, Lekhio tracks it', linkLabel: 'See Nest', linkHref: 'https://www.nestpensions.org.uk/' },
];

const linkProps = { target: '_blank', rel: 'noopener noreferrer' as const };

const CHIP_TRADES = ['Electrician', 'Plumber, heating or gas', 'Builder or bricklayer', 'Joiner or carpenter', 'Plasterer', 'Painter and decorator', 'Roofer', 'Landscaper or gardener', 'Tiler or flooring', 'Cleaner'];

export default function Wizard() {
  const [path, setPath] = useState<PathKey | null>(null);
  const [step, setStep] = useState(0);
  const [sicQuery, setSicQuery] = useState('');
  const sicMatches = useMemo(() => (sicQuery.trim() ? findSic(sicQuery, 3) : []), [sicQuery]);

  const steps = path && path !== 'done' ? stepsFor(path) : [];
  const total = steps.length;
  const finished = path === 'done' || (path !== null && step >= total);

  function choose(p: PathKey) {
    setPath(p);
    setStep(0);
  }
  function restart() {
    setPath(null);
    setStep(0);
  }

  return (
    <div>
      <style>{`
        @keyframes wzIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes wzPop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
        .wz-anim{animation:wzIn .35s cubic-bezier(.2,.7,.2,1)}
        .wz-choice{transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
        .wz-choice:hover{transform:translateY(-3px);border-color:${RIVER}!important;box-shadow:0 16px 36px rgba(17,17,17,.09)}
        .wz-btn{transition:transform .15s ease,box-shadow .18s ease,background-color .18s ease}
        .wz-btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(27,89,166,.26)}
        .wz-bar{transition:width .4s cubic-bezier(.2,.7,.2,1)}
        .wz-chip{transition:transform .12s ease,border-color .12s ease}
        .wz-chip:hover{transform:translateY(-1px);border-color:${RIVER}!important}
        .wz-field:focus{border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT}}
        .wz-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .wz-sic{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        @media(max-width:760px){.wz-grid{grid-template-columns:1fr}.wz-sic{grid-template-columns:1fr}}
      `}</style>

      {/* Chooser */}
      {path === null && (
        <div className="wz-anim">
          <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 6px' }}>What are you setting up?</h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 0 22px' }}>Tell us, and we will give you the exact steps, the forms, and the codes you need. Free, in plain English.</p>
          <div className="wz-grid">
            {CHOICES.map((c) => (
              <button key={c.key} onClick={() => choose(c.key)} className="wz-choice" style={{ textAlign: 'left', cursor: 'pointer', background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 16, padding: 22, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 28 }}>{c.icon}</span>
                <span>
                  <span style={{ display: 'block', fontSize: 17, fontWeight: 800, color: INK }}>{c.title}</span>
                  <span style={{ display: 'block', fontSize: 14, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{c.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      {path !== null && !finished && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <button onClick={restart} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: MUTED, padding: 0 }}>‹ Change</button>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: RIVER, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {step + 1} of {total}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: SURFACE, overflow: 'hidden', marginBottom: 22 }}>
            <div className="wz-bar" style={{ height: 7, borderRadius: 4, width: `${((step + 1) / total) * 100}%`, background: `linear-gradient(90deg, ${RIVER}, ${SAFFRON})` }} />
          </div>

          <div key={step} className="wz-anim" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '26px 26px', boxShadow: '0 14px 40px rgba(17,17,17,.05)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: RIVER, color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{step + 1}</div>
            <h3 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.4px', margin: '0 0 10px' }}>{steps[step].title}</h3>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: 0 }}>{steps[step].body}</p>

            {steps[step].codeValue ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 16, background: SAFFRON_TINT, border: `1px solid #EAD6A8`, borderRadius: 12, padding: '10px 14px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: SAFFRON_DEEP, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{steps[step].codeLabel}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: INK }}>{steps[step].codeValue}</span>
              </div>
            ) : null}

            {steps[step].sic ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 10 }}>What do you do? We will find your SIC code.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {CHIP_TRADES.map((t) => {
                    const active = sicQuery === t;
                    return (
                      <button key={t} onClick={() => setSicQuery(t)} className="wz-chip" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: active ? '#fff' : INK, background: active ? RIVER : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 20, padding: '7px 13px' }}>{t}</button>
                    );
                  })}
                </div>
                <input
                  value={sicQuery}
                  onChange={(e) => setSicQuery(e.target.value)}
                  placeholder="Or type it, e.g. kitchen fitter, drainage, mobile mechanic"
                  className="wz-field"
                  style={{ width: '100%', background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', fontSize: 15, color: INK, outline: 'none' }}
                />

                {sicMatches.length > 0 ? (
                  <div className="wz-anim" style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Your recommended SIC code</div>
                    <div style={{ background: GREEN_TINT, border: '1px solid #CFE9D8', borderRadius: 14, padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>{sicMatches[0].code}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{sicMatches[0].label}</span>
                      </div>
                      <p style={{ fontSize: 13, color: MUTED, margin: '8px 0 0', lineHeight: 1.5 }}>Enter this when Companies House asks for your SIC code. You can add more than one if you do a few things.</p>
                      {sicMatches[0].alt ? (
                        <p style={{ fontSize: 12.5, color: MUTED, margin: '8px 0 0' }}>Often paired with <strong style={{ color: INK }}>{sicMatches[0].alt!.code}</strong> {sicMatches[0].alt!.label}.</p>
                      ) : null}
                    </div>
                    {sicMatches.length > 1 ? (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Or, if that is not quite it:</div>
                        <div className="wz-sic">
                          {sicMatches.slice(1).map((m) => (
                            <div key={m.code} style={{ display: 'flex', gap: 10, alignItems: 'baseline', background: SURFACE, borderRadius: 10, padding: '9px 12px' }}>
                              <span style={{ fontSize: 13.5, fontWeight: 800, color: RIVER_DEEP, fontVariantNumeric: 'tabular-nums' }}>{m.code}</span>
                              <span style={{ fontSize: 13, color: INK }}>{m.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 10 }}>Pick your trade or type what you do, and your exact code appears here.</p>
                )}
              </div>
            ) : null}

            {steps[step].preview ? (
              <div className="wz-anim" style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>What you will see</div>
                <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${LINE}`, boxShadow: '0 8px 24px rgba(17,17,17,.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#E8E8E8', padding: '8px 12px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: '#F25F58' }} />
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: '#FBBE3C' }} />
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: '#58CB42' }} />
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#6B7280', background: '#fff', borderRadius: 6, padding: '3px 10px', fontVariantNumeric: 'tabular-nums' }}>{steps[step].preview!.site === 'Companies House' ? 'find-and-update.company-information.service.gov.uk' : 'gov.uk'}</span>
                  </div>
                  <div style={{ background: '#0b0c0c', color: '#fff', padding: '10px 16px', fontSize: 14, fontWeight: 700 }}>{steps[step].preview!.site}</div>
                  <div style={{ background: '#fff', padding: '18px 16px' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#0b0c0c', marginBottom: 12 }}>{steps[step].preview!.heading}</div>
                    <span style={{ display: 'inline-block', background: '#00703c', color: '#fff', fontSize: 13.5, fontWeight: 700, padding: '9px 16px', borderRadius: 3 }}>{steps[step].preview!.cta} ›</span>
                  </div>
                </div>
              </div>
            ) : null}

            {steps[step].tip ? (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, background: RIVER_TINT, borderRadius: 12, padding: '12px 14px' }}>
                <span style={{ fontSize: 15 }}>💡</span>
                <span style={{ fontSize: 13.5, color: RIVER_DEEP, lineHeight: 1.55 }}>{steps[step].tip}</span>
              </div>
            ) : null}

            {steps[step].linkHref ? (
              <a href={steps[step].linkHref} {...linkProps} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 14.5, fontWeight: 700, color: RIVER }}>
                {steps[step].linkLabel} on GOV.UK ↗
              </a>
            ) : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: MUTED }}>Back</button>
            ) : <span />}
            <button onClick={() => setStep(step + 1)} className="wz-btn" style={{ background: RIVER, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, padding: '14px 30px', borderRadius: 12 }}>
              {step === total - 1 ? 'I am ready' : 'Next step'}
            </button>
          </div>
        </div>
      )}

      {/* Finish + offer */}
      {finished && (
        <div className="wz-anim" style={{ textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: GREEN_TINT, color: GREEN, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'wzPop .5s ease' }}>✓</div>
          <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>
            {path === 'done' ? 'Great, you are already registered.' : 'Registration sorted. Now the rest.'}
          </h2>
          <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, maxWidth: 520, margin: '0 auto 28px' }}>
            {path === 'done'
              ? 'Skip the paperwork and get straight to the part that saves you money and time.'
              : 'Follow the steps above on GOV.UK, it is quicker than it looks. Then let Lekhio handle the books, the claims and the tax, all by text.'}
          </p>

          {/* Set up the rest of your business */}
          <div style={{ maxWidth: 760, margin: '0 auto 30px', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14, textAlign: 'center' }}>Now set up the rest, the way an accountant would, but free</div>
            <div className="wz-grid">
              {ESSENTIALS.map((e) => (
                <div key={e.title} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
                  <div style={{ fontSize: 24 }}>{e.icon}</div>
                  <div style={{ fontSize: 16.5, fontWeight: 800, marginTop: 8 }}>{e.title}</div>
                  <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: '6px 0 10px' }}>{e.body}</p>
                  {e.cost ? <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{e.cost}</div> : null}
                  {e.expense ? <div style={{ display: 'inline-block', marginTop: 10, background: GREEN_TINT, color: GREEN, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 12 }}>💚 {e.expenseLabel ?? 'Claim it on Lekhio'}</div> : null}
                  {e.linkHref ? <div style={{ marginTop: 10 }}><a href={e.linkHref} {...linkProps} style={{ fontSize: 13.5, fontWeight: 700, color: RIVER }}>{e.linkLabel} ↗</a></div> : null}
                  {e.internalHref ? <div style={{ marginTop: 10 }}><Link href={e.internalHref} style={{ fontSize: 13.5, fontWeight: 700, color: RIVER }}>{e.linkLabel} →</Link></div> : null}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: MUTED, marginTop: 12, textAlign: 'center' }}>Popular options, not recommendations or financial advice. Compare and pick what suits you.</p>
          </div>

          {/* The offer */}
          <div style={{ maxWidth: 560, margin: '0 auto', background: INK, borderRadius: 20, padding: '30px 26px' }}>
            <div style={{ display: 'inline-block', background: 'rgba(224,163,62,0.18)', color: SAFFRON, fontSize: 12, fontWeight: 800, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>FOUNDER OFFER, TODAY ONLY FOR YOU</div>
            <h3 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', margin: '0 0 10px' }}>First month free, then 20% off for life.</h3>
            <p style={{ fontSize: 15.5, color: '#B6BDC8', lineHeight: 1.6, margin: '0 0 22px' }}>
              Because you set up with us, lock in 20% off every month, for as long as you stay. That is £15.99 a month instead of £19.99, forever. The catch: you have to sign up now, straight from here.
            </p>
            <Link href={OFFER_HREF} className="wz-btn" style={{ display: 'inline-block', background: RIVER, color: '#fff', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 12 }}>Claim my offer and sign up</Link>
            <p style={{ fontSize: 12.5, color: '#8A93A0', marginTop: 14 }}>30 days free, no card needed. Cancel any time. The 20% sticks for life.</p>
          </div>

          {/* Extras */}
          {path !== 'done' ? (
            <div style={{ marginTop: 34, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, textAlign: 'center' }}>Also, only if it applies to you</div>
              <div className="wz-grid">
                {EXTRAS.map((e) => (
                  <a key={e.title} href={e.href} {...linkProps} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, color: INK }}>
                    <div style={{ fontSize: 22 }}>{e.icon}</div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, marginTop: 6 }}>{e.title}</div>
                    <div style={{ fontSize: 13.5, color: MUTED, marginTop: 4, lineHeight: 1.55 }}>{e.body}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: RIVER, marginTop: 8 }}>How to ↗</div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <button onClick={restart} style={{ marginTop: 26, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: MUTED }}>← Set up something else</button>
        </div>
      )}
    </div>
  );
}
