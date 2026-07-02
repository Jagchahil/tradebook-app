import type { Metadata } from 'next';
import Link from 'next/link';
import { EXPENSE_RULES, TAX_TIPS, VERDICT_LABEL, type Verdict } from '../../lib/taxrules';
import LeadCapture from '../../components/LeadCapture';
import { A11Y_CSS } from '../../lib/tokens';

export const metadata: Metadata = {
  title: 'Can I claim it? UK self employed expenses, answered straight | Lekhio',
  description:
    'Can I expense my work boots? Is a van tax deductible? Lekhio answers the real allowable expense questions for UK sole traders, the grey areas included, all within the law. Ask it on WhatsApp.',
  openGraph: {
    title: 'Can I claim it? Just ask Lekhio.',
    description:
      'The real rules on what UK sole traders can and cannot claim, the grey areas done properly, all legal. Ask it on WhatsApp.',
    type: 'website',
  },
};

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const RED_INK = '#B23A2B';
const RED_TINT = '#FDECEC';
const PAPER = '#FBFAF7';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function verdictColours(v: Verdict): { fg: string; bg: string } {
  if (v === 'yes') return { fg: GREEN, bg: GREEN_TINT };
  if (v === 'no') return { fg: RED_INK, bg: RED_TINT };
  return { fg: SAFFRON_DEEP, bg: SAFFRON_TINT };
}

const yesRules = EXPENSE_RULES.filter((r) => r.verdict === 'yes');
const midRules = EXPENSE_RULES.filter((r) => r.verdict === 'partly' || r.verdict === 'depends');
const noRules = EXPENSE_RULES.filter((r) => r.verdict === 'no');

// The four classic ones people get wrong, shown with the full detail.
const greyKeys = ['everyday_clothes', 'car', 'training', 'meals'];
const greyAreas = greyKeys
  .map((k) => EXPENSE_RULES.find((r) => r.key === k))
  .filter((r): r is (typeof EXPENSE_RULES)[number] => Boolean(r));

const demo: { side: 'out' | 'in'; text: string }[] = [
  { side: 'out', text: 'can I claim my work jeans?' },
  { side: 'in', text: 'Sorry, no. Everyday clothes are out, even if you only wear them on site. Branded uniform and protective gear like boots are in though.' },
  { side: 'out', text: 'what about my van?' },
  { side: 'in', text: 'Yes. A work van is allowable, the whole cost the year you buy it, or claim 55p a mile instead. 👍' },
];

function RuleCard({ r }: { r: (typeof EXPENSE_RULES)[number] }) {
  const c = verdictColours(r.verdict);
  return (
    <div className="rulecard" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>{r.title}</h3>
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: c.fg, background: c.bg, padding: '5px 10px', borderRadius: 12 }}>{VERDICT_LABEL[r.verdict]}</span>
      </div>
      <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: 0 }}>{r.rule}</p>
    </div>
  );
}

function Group({ title, blurb, rules, accent }: { title: string; blurb: string; rules: typeof EXPENSE_RULES; accent: string }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <div className="reveal" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: accent }} />
        <h3 style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>{title}</h3>
      </div>
      <p className="reveal" style={{ fontSize: 14.5, color: MUTED, margin: '0 0 18px', maxWidth: 620 }}>{blurb}</p>
      <div className="reveal rulegrid">
        {rules.map((r) => (
          <RuleCard key={r.key} r={r} />
        ))}
      </div>
    </div>
  );
}

export default function CanIClaimPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          *{box-sizing:border-box} body{margin:0} a{text-decoration:none}
          @keyframes riseIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
          .reveal{opacity:0;transform:translateY(16px);transition:opacity .4s ease,transform .4s cubic-bezier(.2,.7,.2,1)}
          .reveal.in{opacity:1;transform:none}
          .h1{font-size:54px;line-height:1.05;letter-spacing:-2px}
          .h2{font-size:32px;line-height:1.14;letter-spacing:-0.7px}
          .rulegrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
          .oneRule{display:grid;grid-template-columns:1.1fr .9fr;gap:36px;align-items:center}
          .rulecard{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
          .rulecard:hover{transform:translateY(-4px);box-shadow:0 16px 36px rgba(17,17,17,.08);border-color:${RIVER_TINT}}
          .btn{transition:transform .18s ease,box-shadow .18s ease,background-color .18s ease}
          .btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(27,89,166,.28)}
          @media (max-width:880px){.h1{font-size:36px}.h2{font-size:25px}.rulegrid{grid-template-columns:1fr}.oneRule{grid-template-columns:1fr;gap:24px}.grey-grid{grid-template-columns:1fr!important}.tips-grid{grid-template-columns:1fr!important}}
          `,
        }}
      />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}` }} /></noscript>
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      {/* Nav */}
      <nav style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" className="btn" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 20 }}>ASK LEKHIO</span>
          <h1 className="h1" style={{ fontWeight: 700, margin: '0 0 18px' }}>Can I claim it? Just ask.</h1>
          <p style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, margin: '0 0 26px' }}>
            Half of paying less tax is just knowing what you are allowed to claim. Text Lekhio the thing, and get a straight answer in seconds. The real rules, the grey areas included, all fully within the law.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link href="/start" className="btn" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Start free trial</Link>
            <a href="#list" className="btn" style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>See the list</a>
          </div>
        </div>
      </section>

      {/* The one rule + WhatsApp demo */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px' }}>
        <div className="reveal oneRule">
          <div style={{ minWidth: 0 }}>
            <h2 className="h2" style={{ fontWeight: 700, margin: '0 0 14px' }}>One simple test runs the lot.</h2>
            <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.65, margin: '0 0 16px' }}>
              HMRC allows a cost if it was spent <strong style={{ color: INK }}>wholly and exclusively for the business</strong>. If something is part business and part personal, like your phone or your car, you claim the business share, not all of it.
            </p>
            <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              That is it. No tricks, no dodgy loopholes. Just claiming everything you are legally owed, and not a penny you are not. Most people leave money on the table simply because they never asked.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 300, maxWidth: '100%', background: '#fff', borderRadius: 26, border: `1px solid ${LINE}`, boxShadow: '0 24px 60px rgba(17,17,17,.14)', overflow: 'hidden' }}>
              <div style={{ background: '#075E54', color: '#fff', padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 32, height: 32, borderRadius: 16, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💬</span>
                <div><div style={{ fontSize: 13.5, fontWeight: 700 }}>Lekhio</div><div style={{ fontSize: 10.5, opacity: 0.85 }}>online</div></div>
              </div>
              <div style={{ background: '#ECE5DD', padding: '16px 13px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {demo.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.side === 'out' ? 'flex-end' : 'flex-start', background: m.side === 'out' ? '#DCF8C6' : '#fff', borderRadius: m.side === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '9px 12px', maxWidth: '86%', fontSize: 13, color: INK, boxShadow: m.side === 'in' ? '0 1px 2px rgba(0,0,0,.08)' : 'none', lineHeight: 1.5 }}>{m.text}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The list */}
      <section id="list" style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '46px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 className="h2" style={{ fontWeight: 700, margin: '0 0 12px' }}>What you can and cannot claim.</h2>
            <p style={{ fontSize: 16.5, color: MUTED, maxWidth: 560, margin: '0 auto' }}>The common ones for UK sole traders. Ask Lekhio about anything not here and it will tell you straight.</p>
          </div>
          <Group title="Yes, claim these in full" blurb="Straightforward business costs. Log them all, even the small ones, because every pound you miss is tax you did not need to pay." rules={yesRules} accent={GREEN} />
          <Group title="Part of it, or it depends" blurb="Mixed use or grey area items. You can claim, but only the business share or only in the right circumstances. Lekhio works out the right slice." rules={midRules} accent={SAFFRON_DEEP} />
          <Group title="Usually not, so do not risk it" blurb="The ones people wrongly try to claim. Getting these wrong invites trouble, so we keep you on the right side of the line." rules={noRules} accent={RED_INK} />
        </div>
      </section>

      {/* Grey areas done properly */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '50px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 36 }}>
          <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>THE GREY AREAS</span>
          <h2 className="h2" style={{ fontWeight: 700, margin: '0 0 12px' }}>The ones everyone gets wrong.</h2>
          <p style={{ fontSize: 16.5, color: MUTED, maxWidth: 600, margin: '0 auto' }}>Clothes, the car, training, meals. Here is the honest rule on each, so you claim what you can and steer clear of what you cannot.</p>
        </div>
        <div className="reveal grey-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {greyAreas.map((r) => {
            const c = verdictColours(r.verdict);
            return (
              <div key={r.key} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{r.title}</h3>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.fg, background: c.bg, padding: '4px 10px', borderRadius: 12 }}>{VERDICT_LABEL[r.verdict]}</span>
                </div>
                <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{r.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Claim everything you are owed */}
      <section style={{ background: `linear-gradient(180deg, #fff, ${RIVER_TINT})`, borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '50px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 36 }}>
            <span style={{ display: 'inline-block', backgroundColor: '#fff', border: `1px solid ${LINE}`, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>KEEP MORE, LEGALLY</span>
            <h2 className="h2" style={{ fontWeight: 700, margin: '0 0 12px' }}>The legal ways to pay less tax.</h2>
            <p style={{ fontSize: 16.5, color: MUTED, maxWidth: 600, margin: '0 auto' }}>Nothing dodgy, nothing risky. Just the reliefs and allowances people miss. Lekhio tracks most of these for you as you work.</p>
          </div>
          <div className="reveal tips-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {TAX_TIPS.map((t, i) => (
              <div key={t.title} style={{ display: 'flex', gap: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '18px 20px' }}>
                <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 14, background: RIVER, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                <div>
                  <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 4px' }}>{t.title}</h3>
                  <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: 0 }}>{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Consent engine */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '8px 24px 0' }}>
        <LeadCapture
          source="can-i-claim"
          heading="Get the claim answers, plus your tax reminders"
          sub="Pop your email in and we will send you a handy claim guide, then the odd genuinely useful nudge about deadlines and money you could claim back. No spam, unsubscribe any time."
        />
      </section>

      {/* CTA */}
      <section style={{ background: INK }}>
        <div className="reveal" style={{ maxWidth: 720, margin: '0 auto', padding: '54px 24px', textAlign: 'center' }}>
          <h2 className="h2" style={{ color: '#fff', fontWeight: 700, margin: '0 0 14px' }}>Stop overpaying. Just ask.</h2>
          <p style={{ fontSize: 16.5, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 28px' }}>
            Lekhio answers your claim questions on WhatsApp, logs every cost as you go, and keeps you ready for tax. You always approve before anything is sent to HMRC.
          </p>
          <Link href="/start" className="btn" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Start free trial</Link>
          <p style={{ fontSize: 13, color: '#8A93A0', marginTop: 22, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            General information, not tax advice for your exact situation. Lekhio is an independent UK company, not HMRC, and not endorsed by HMRC. Always check your own position with HMRC or an accountant if you are unsure.
          </p>
          <div style={{ marginTop: 18 }}>
            <Link href="/" style={{ color: '#CFE0F2', fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          </div>
        </div>
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});}else{var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}})},{threshold:0.1});els.forEach(function(e){io.observe(e)});}}catch(e){document.querySelectorAll('.reveal').forEach(function(x){x.classList.add('in')});}})();`,
        }}
      />
    </main>
  );
}
