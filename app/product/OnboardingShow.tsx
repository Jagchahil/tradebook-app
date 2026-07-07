'use client';

// The onboarding journey as a short film: four stages from signup to a system
// that runs itself. It plays itself. Content streams in like a live chat, stages
// cross fade automatically, and every frame is a real screen from the product
// rather than marketing fiction. No buttons, no clicking, it just runs.

import { useEffect, useState } from 'react';

const INK = 'var(--tx)';
const MUTED = 'var(--tx-mut)';
const LINE = 'var(--bd)';
const PANEL = 'var(--panel)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const AMBER = 'var(--saffron-deep)';
const AMBER_TINT = 'var(--saffron-tint)';
const SURFACE = 'var(--surface)';

// Pacing. Each item lands STAGGER apart, then the stage holds before it hands
// over to the next. Tight enough to feel alive, slow enough to read.
const STAGGER = 460;
const HOLD = 1500;
const COUNTS = [6, 5, 6, 5];
const durFor = (i: number) => COUNTS[i] * STAGGER + HOLD;

const STAGES = [
  { n: 'Step 1 · the website', t: 'Sign up asks who you are', head: '🌐 lekhio.com/start · step 4 of 6', live: false },
  { n: 'Step 2 · the app', t: 'A 60 second tour', head: '📱 Lekhio app · first launch', live: false },
  { n: 'Step 3 · WhatsApp', t: 'The two minute setup', head: '💬 Lekhio · WhatsApp', live: true },
  { n: 'Step 4 · every day after', t: 'It runs itself', head: '💬 Lekhio · day to day', live: true },
];

const NOTES: [string, string][] = [
  [
    'The website starts the conversation.',
    'Signup asks the question most tax tools never do: what sits alongside the work. A job, a rental, a student loan, each taxed its own way, and every choice teaches while it asks.',
  ],
  [
    'First launch opens a sixty second tour.',
    'How capture works, the approval gate, your income streams, the two helpers. The last slide is a handover: one green button opens WhatsApp with the setup already typed.',
  ],
  [
    'Six questions that configure, not decorate.',
    'Work shape, CIS, student loan, salary, property, a goal. Buttons for taps, short text for figures, and every answer writes straight into your account: the loan folds into your set aside, the salary sets your bands.',
  ],
  [
    'Then onboarding dissolves into the product.',
    'Receipts read themselves, unpaid invoices arrive with the chase already drafted, and Rakha watches your numbers around your goal. Everything still waits for your yes.',
  ],
];

function Reveal({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <div className="ob-item" style={{ animationDelay: `${i * STAGGER}ms` }}>
      {children}
    </div>
  );
}

function BubbleIn({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <Reveal i={i}>
      <div style={{ maxWidth: '86%', background: SURFACE, border: `1px solid ${LINE}`, color: INK, borderRadius: '12px 12px 12px 4px', padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5 }}>{children}</div>
    </Reveal>
  );
}

function BubbleOut({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <Reveal i={i}>
      <div style={{ maxWidth: '86%', marginLeft: 'auto', background: GREEN_TINT, color: INK, borderRadius: '12px 12px 4px 12px', padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5, width: 'fit-content' }}>{children}</div>
    </Reveal>
  );
}

function Stage({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <>
        <Reveal i={0}><div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Anything alongside the work?</div></Reveal>
        <Reveal i={1}><div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>Each stream is taxed its own way. Lekhio keeps them separate, the way HMRC does.</div></Reveal>
        <Reveal i={2}><div style={{ border: `1.5px solid ${RIVER}`, background: RIVER_TINT, borderRadius: 10, padding: 10 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>💼 A PAYE job ✓</div><div style={{ fontSize: 11, color: RIVER_DEEP }}>Sets the rate your profit is taxed at</div></div></Reveal>
        <Reveal i={3}><div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 10 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>🏠 Rental property</div><div style={{ fontSize: 11, color: MUTED }}>Own rules, new rates April 2027</div></div></Reveal>
        <Reveal i={4}><div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 10 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>🎓 A student loan</div><div style={{ fontSize: 11, color: MUTED }}>Lands in one lump each January</div></div></Reveal>
        <Reveal i={5}><div style={{ marginTop: 'auto', background: RIVER, color: '#fff', textAlign: 'center', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700 }}>Continue</div></Reveal>
      </>
    );
  }
  if (stage === 1) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, flex: 1, justifyContent: 'center' }}>
        <Reveal i={0}><div style={{ width: 64, height: 64, borderRadius: 18, background: RIVER_TINT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto' }}>🛡️</div></Reveal>
        <Reveal i={1}><div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Two helpers, day and night</div></Reveal>
        <Reveal i={2}><div style={{ fontSize: 12, color: MUTED, lineHeight: 1.55, maxWidth: 230 }}>Puchio answers when you ask. Rakha speaks before you ask: thresholds, deadlines, unpaid invoices, chances to save.</div></Reveal>
        <Reveal i={3}>
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
            {[0, 1, 2].map((d) => <span key={d} style={{ width: 6, height: 6, borderRadius: 3, background: LINE }} />)}
            <span style={{ width: 16, height: 6, borderRadius: 3, background: AMBER }} />
            <span style={{ width: 6, height: 6, borderRadius: 3, background: LINE }} />
          </div>
        </Reveal>
        <Reveal i={4}><div style={{ marginTop: 14, width: 250, background: '#25D366', color: '#fff', textAlign: 'center', borderRadius: 10, padding: 10, fontSize: 13, fontWeight: 700 }}>💬 Finish setup on WhatsApp</div></Reveal>
      </div>
    );
  }
  if (stage === 2) {
    return (
      <>
        <BubbleOut i={0}>setup</BubbleOut>
        <BubbleIn i={1}>Right, let us set your numbers up properly. Six short questions, each one makes your figures sharper. First: how does your money come in?</BubbleIn>
        <Reveal i={2}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Self employed', 'Job + my own work', 'Mostly property'].map((b) => (
              <span key={b} style={{ border: `1px solid ${RIVER}`, color: RIVER_DEEP, borderRadius: 999, padding: '5px 10px', fontSize: 11.5, fontWeight: 700 }}>{b}</span>
            ))}
          </div>
        </Reveal>
        <BubbleIn i={3}>Do you have a student loan? On self employed income the repayment lands in one lump with the January bill.</BubbleIn>
        <BubbleOut i={4}>salary 32000</BubbleOut>
        <BubbleIn i={5}>Salary saved: £32,000 ✓ Your bands, your loan and your set aside figure all start from the right place now.</BubbleIn>
      </>
    );
  }
  return (
    <>
      <BubbleOut i={0}>📸 receipt.jpg</BubbleOut>
      <BubbleIn i={1}>Screwfix, £42.80, materials. Logged and waiting for your yes in the app.</BubbleIn>
      <BubbleOut i={2}>who owes me</BubbleOut>
      <BubbleIn i={3}>Invoice 0012 (£850, Dave Wilson) is 18 days over. Here is a chase in your voice, forward it as it is:</BubbleIn>
      <Reveal i={4}>
        <div style={{ border: `1px solid ${AMBER}`, background: AMBER_TINT, borderRadius: 12, padding: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: AMBER, letterSpacing: '0.05em' }}>🛡️ RAKHA SPOTTED</div>
          <div style={{ fontSize: 12, color: INK, marginTop: 3, lineHeight: 1.45 }}>Your goal &ldquo;the new van&rdquo; is 43% covered. Buying before 5 April saves you £2,100 at your rate.</div>
        </div>
      </Reveal>
    </>
  );
}

export default function OnboardingShow() {
  const [stage, setStage] = useState(0);

  // Self advancing. Each stage schedules the next based on how much it has to
  // say, then it loops. Nothing to press.
  useEffect(() => {
    const id = setTimeout(() => setStage((s) => (s + 1) % STAGES.length), durFor(stage));
    return () => clearTimeout(id);
  }, [stage]);

  const s = STAGES[stage];

  return (
    <div>
      <style>{`
        @keyframes obPop{0%{opacity:0;transform:translateY(12px) scale(.965)}55%{opacity:1}100%{opacity:1;transform:none}}
        .ob-item{opacity:0;animation:obPop .5s cubic-bezier(.2,.75,.3,1) forwards}
        @keyframes obStageIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .ob-stagewrap{animation:obStageIn .42s ease}
        @keyframes obFill{from{width:0}to{width:100%}}
        @keyframes obPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
        .ob-live{animation:obPulse 1.4s ease-in-out infinite}
        .ob-grid{display:grid;grid-template-columns:300px 1fr;gap:26px;align-items:start}
        @media(max-width:760px){.ob-grid{grid-template-columns:1fr}.ob-phone{margin:0 auto}}
        .ob-segs{display:flex;gap:6px;margin-bottom:16px}
        .ob-seg{flex:1;height:3px;background:${SURFACE};border-radius:2px;overflow:hidden}
        .ob-fill{height:100%;width:0;background:${RIVER};border-radius:2px}
        .ob-label{font-size:11px;font-weight:800;letter-spacing:.04em;color:${RIVER_DEEP};text-transform:uppercase}
      `}</style>

      {/* Non interactive progress. The active segment fills over the stage's own
          length, the ones before it stay full, the ones after stay empty. */}
      <div className="ob-segs" aria-hidden>
        {STAGES.map((st, i) => (
          <div key={st.n} className="ob-seg">
            <div
              className="ob-fill"
              style={
                i < stage
                  ? { width: '100%' }
                  : i === stage
                    ? { animation: `obFill ${durFor(i)}ms linear forwards` }
                    : { width: 0 }
              }
            />
          </div>
        ))}
      </div>

      <div className="ob-grid">
        <div className="ob-phone" style={{ width: 300, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 26, overflow: 'hidden', boxShadow: '0 24px 60px rgba(17,17,17,.14)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${LINE}`, fontSize: 12, color: MUTED }}>
            {s.live ? <span className="ob-live" style={{ width: 7, height: 7, borderRadius: 4, background: '#22C55E', display: 'inline-block' }} /> : null}
            {s.head}
          </div>
          <div key={stage} className="ob-stagewrap" style={{ padding: 14, minHeight: 330, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Stage stage={stage} />
          </div>
        </div>

        <div key={stage} className="ob-stagewrap">
          <div className="ob-label">{s.n}</div>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '6px 0 10px', letterSpacing: '-0.4px' }}>{NOTES[stage][0]}</h3>
          <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>{NOTES[stage][1]}</p>
          {stage === 3 ? (
            <div style={{ marginTop: 16, background: GREEN_TINT, border: '1px solid #CFE9D8', borderRadius: 12, padding: '12px 14px', fontSize: 13.5, color: GREEN, fontWeight: 700 }}>
              The promise, kept: text it, sorted.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
