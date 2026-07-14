'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U, FONT } from './ui';
import type { Vitals, Day, Knowledge } from '../../lib/brain';

// KHOJI. The brain, live.
//
// ⚠️ WHAT THIS SCREEN REFUSES TO BE, and the refusal survived a redesign.
//
// Khoji is the only thing we have that nobody else in the category has, so the pull is to make it
// LOOK like a brain: a rising line, a big green number, the word LIVE pulsing in a corner. That
// version of this page is a screensaver, and worse than nothing, because it teaches the team to
// glance at it and feel reassured.
//
// So it was made to look like a reactor, and then every part of the reactor was wired to a fact:
//
//   THE GRID IS NOT DECORATION. It is one cell per constant the tax engine PUBLISHES. A cell is lit
//   because something compared that number to its GOV.UK page last night and it matched. A cell is
//   DARK because nothing is watching it. You cannot make this thing look impressive by polishing it;
//   the only way to light the grid up is to go and write the extractor. The design cannot flatter us.
//
//   THE PULSE IS THE HEARTBEAT, not an animation. It beats when a run actually checked something. A
//   crashed differ, or one that has stopped, and it stops with it.
//
// "0 drift" does not mean our tax numbers are right. It means the ones we look at are right. The
// distance between those two sentences is one Budget, and one man signing a return we prepared.

interface Pending {
  id: string;
  title: string | null;
  summary: string | null;
  source_url: string | null;
  affects: string | null;
  effective_date: string | null;
  confidence: number | null;
  engine_impact: boolean;
  created_at: string;
}

interface Payload {
  vitals: Vitals;
  coverage: { pct: number; watched: number; total: number; blind: number };
  knowledge: Knowledge;
  growth: Day[];
  runs: Array<{ ran_at: string; agreed: number; drifted: number; blind: number; ok: boolean }>;
  pending: Pending[];
}

const PULSE: Record<Vitals['pulse'], { tone: string; word: string; alive: boolean }> = {
  checking:  { tone: '#3DDC84', word: 'CHECKING',           alive: true },
  wrong:     { tone: '#FF5A4E', word: 'WE ARE WRONG',       alive: true },
  blind:     { tone: '#FFB020', word: 'CANNOT SEE',         alive: true },
  // Not amber. "Nobody is looking" is the state in which every other light here stops meaning
  // anything, and the pulse STOPS, because there is no heartbeat to draw.
  unwatched: { tone: '#FF5A4E', word: 'NOBODY IS LOOKING',  alive: false },
  failed:    { tone: '#FF5A4E', word: 'THE RUN DID NOT FINISH', alive: false },
  never:     { tone: '#FF5A4E', word: 'NEVER RUN',          alive: false },
};

export default function Brain() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/team/brain', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 503) {
      setErr('Could not read the brain. This is NOT "nothing has been checked". We could not reach the database, and we do not know what Khoji found.');
      return;
    }
    if (!res.ok) { setErr('Could not load Khoji.'); return; }
    setD((await res.json()) as Payload);
  }

  useEffect(() => { load(); }, []);

  // APPROVE, or DISMISS. See app/api/team/review/route.ts for why this is one at a time and why
  // there will never be an "approve all".
  //
  // The row leaves the list the instant you click, because a queue that hesitates gets double
  // clicked. But if the write FAILS it comes straight back, because the one thing worse than a slow
  // approval is a human who believes he approved something and did not.
  async function decide(item: Pending, decision: 'approve' | 'dismiss') {
    if (!d || busy) return;
    setBusy(item.id);
    const before = d.pending;
    setD({ ...d, pending: before.filter((p) => p.id !== item.id) });

    const { data: s } = await browserSupabase.auth.getSession();
    const res = await fetch('/api/team/review', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: item.id, decision }),
    });
    setBusy(null);

    if (!res.ok) {
      setD((cur) => (cur ? { ...cur, pending: before } : cur));
      setErr('That did not save. The item is back in the queue. Nothing was approved.');
      return;
    }
    setErr(null);
    load();   // re-read, so the counts above move with it
  }

  if (err && !d) return <p style={S.err}>{err}</p>;

  if (!d) {
    return (
      <section style={U.section}>
        <div style={U.sectionHead}><h2 style={T.h2}>Khoji</h2><span style={U.sectionNote}>waking up</span></div>
        <div style={{ ...S.reactor, height: 210 }} aria-busy="true" />
      </section>
    );
  }

  const v = d.vitals;
  const p = PULSE[v.pulse];
  const cov = d.coverage;

  return (
    <section style={U.section}>
      <style>{KEYFRAMES}</style>

      <div style={U.sectionHead}>
        <h2 style={T.h2}>Khoji</h2>
        <span style={U.sectionNote}>the brain. It reads GOV.UK so nobody has to remember to.</span>
      </div>

      {err ? <p style={{ ...S.err, marginBottom: 12 }}>{err}</p> : null}

      {/* THE REACTOR ------------------------------------------------------------------------ */}
      <div style={S.reactor}>
        <div style={S.glow} aria-hidden="true" />

        <div style={S.topRow}>
          <div style={S.pulseWrap}>
            <span
              style={{
                ...S.core,
                background: p.tone,
                boxShadow: `0 0 0 0 ${p.tone}`,
                animation: p.alive ? 'khojiPulse 2.4s ease-out infinite' : 'none',
                opacity: p.alive ? 1 : 0.65,
              }}
              aria-hidden="true"
            />
            <span style={{ ...S.state, color: p.tone }}>{p.word}</span>
          </div>
          <div style={S.stamp}>
            {v.lastRunAt === null
              ? 'NO RUN ON RECORD'
              : v.hoursAgo === 0 ? 'CHECKED WITHIN THE HOUR'
              : `LAST LOOKED ${v.hoursAgo}H AGO`}
            {v.published > 0 ? <span style={S.year}> · {cov.watched}/{cov.total} WATCHED</span> : null}
          </div>
        </div>

        <p style={S.says}>{v.says}</p>

        {/* ⚠️ THE GRID IS THE HONESTY. One cell per constant the engine publishes. Lit = something
            compared it to GOV.UK and it matched. DARK = nothing is watching it. There is no way to
            make this look better except to go and write the extractor. */}
        <div style={S.gridWrap}>
          <div style={S.grid}>
            {cells(cov.total, v).map((cell, i) => (
              <span
                key={i}
                title={cell.title}
                style={{
                  ...S.cell,
                  background: cell.lit ? cell.tone : 'transparent',
                  border: cell.lit ? 'none' : `1px dashed rgba(255,255,255,0.28)`,
                  boxShadow: cell.lit ? `0 0 7px ${cell.tone}66` : 'none',
                  animationDelay: `${(i % 14) * 90}ms`,
                  animation: cell.lit && p.alive ? 'khojiBreathe 3.6s ease-in-out infinite' : 'none',
                }}
              />
            ))}
          </div>

          <div style={S.legend}>
            <Key tone="#3DDC84" label={`${v.agreed} agree with GOV.UK`} />
            {v.drifted > 0 ? <Key tone="#FF5A4E" label={`${v.drifted} DRIFT`} /> : null}
            {v.blind > 0 ? <Key tone="#FFB020" label={`${v.blind} cannot be read`} /> : null}
            <Key tone={null} label={`${v.unwatched.length} unwatched`} />
          </div>
        </div>

        {/* The last fortnight of nights. A gap is a night nobody checked. The one chart here you
            want to be boring. */}
        {d.runs.length > 0 ? (
          <div style={S.nights}>
            {d.runs.map((r) => {
              const checked = r.agreed + r.drifted + r.blind;
              const dead = checked === 0;   // a run that compared nothing is not a run. It is a hole.
              return (
                <span
                  key={r.ran_at}
                  title={dead
                    ? `${new Date(r.ran_at).toLocaleString('en-GB')}: the run did not check anything.`
                    : `${new Date(r.ran_at).toLocaleString('en-GB')}: ${r.agreed} agreed, ${r.drifted} drift, ${r.blind} blind`}
                  style={{
                    ...S.night,
                    background: dead ? 'transparent'
                      : r.drifted > 0 ? '#FF5A4E'
                      : r.blind > 0 ? '#FFB020'
                      : '#3DDC84',
                    border: dead ? '1.5px dashed #FF5A4E' : 'none',
                    opacity: dead ? 1 : 0.9,
                  }}
                />
              );
            })}
            <span style={S.nightsNote}>the last {d.runs.length} nights</span>
          </div>
        ) : null}

        {/* The unwatched, by name. The least flattering line in the company, and it stays. */}
        {v.unwatched.length > 0 ? (
          <div style={S.gap}>
            <b style={{ color: '#fff' }}>&ldquo;0 drift&rdquo; does not mean our tax numbers are right.
            It means the ones we look at are right.</b>{' '}
            These {v.unwatched.length} sit underneath real figures in real tax returns and nothing has
            ever compared them to GOV.UK. They are not fine. They are unexamined.
            <div style={S.chips}>
              {v.unwatched.map((f) => <span key={f} style={S.chip}>{f}</span>)}
            </div>
          </div>
        ) : null}
      </div>

      {/* THE APPROVAL GATE ------------------------------------------------------------------ */}
      <Queue items={d.pending} busy={busy} onDecide={decide} approved={d.knowledge.reviewed} />

      {/* WHAT IT HOLDS ---------------------------------------------------------------------- */}
      <div style={{ ...U.panel, marginTop: 12 }}>
        <div style={S.statRow}>
          <Stat n={d.knowledge.reviewed} label="approved" tone={C.green} note="the only rows a user ever sees" />
          <Stat n={d.knowledge.waiting} label="waiting for you" tone={d.knowledge.waiting > 0 ? C.amber : C.faint} />
          <Stat n={d.knowledge.raw} label="not yet distilled" tone={C.faint} />
          <Stat n={d.knowledge.incidents} label="open incidents" tone={d.knowledge.incidents > 0 ? C.red : C.faint} note="not knowledge. Alarms." />
        </div>
        <Growth points={d.growth} />
        <div style={S.foot}>
          <b style={{ color: C.ink }}>{d.growth.at(-1)?.total ?? 0}</b> things Khoji has learned, and it
          has never learned one from a user. Only public tax law: GOV.UK, HMRC manuals, primary
          sources. Never a transaction, never a receipt, never a name.
        </div>
      </div>
    </section>
  );
}

// --- THE QUEUE ----------------------------------------------------------------------------------
//
// ⚠️ THIS IS THE ONE BUTTON THE WHOLE DOCTRINE IS ABOUT.
//
// "One less button at a time. Until only one is left. Approve."
//
// A `reviewed` row is the ONLY kind that ever reaches a user's tax answer. So clicking Approve is
// the moment a sentence Khoji scraped off GOV.UK becomes something we will say to a self-employed
// man about the return he is legally responsible for. There is no Approve All, and there will not be
// one: forty unread items becoming forty things we have told our users, in one thoughtless second,
// is precisely what the human gate exists to prevent.
function Queue({
  items, busy, onDecide, approved,
}: {
  items: Pending[];
  busy: string | null;
  onDecide: (i: Pending, d: 'approve' | 'dismiss') => void;
  approved: number;
}) {
  if (items.length === 0) {
    return (
      <div style={{ ...U.panel, marginTop: 12 }}>
        <div style={S.emptyQ}>
          <b style={{ color: C.green }}>Nothing waiting for you.</b> Everything Khoji has distilled has
          been read by a human. {approved} approved so far, and an approved row is the only kind that
          ever reaches a user.
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...U.panel, marginTop: 12, padding: 0, overflow: 'hidden' }}>
      <div style={S.qHead}>
        <div>
          <div style={T.label}>Waiting for you</div>
          <div style={S.qCount}>{items.length}</div>
        </div>
        <p style={S.qWhy}>
          Khoji found these on GOV.UK and put them in plain English. <b>Nothing here reaches a single
          user until you say yes.</b> That is not a chore. That is the product.
        </p>
      </div>

      {items.map((i) => (
        <article key={i.id} style={{ ...S.card, opacity: busy === i.id ? 0.45 : 1 }}>
          <div style={S.cardTop}>
            {i.engine_impact ? <span style={S.impact}>CHANGES THE TAX ENGINE</span> : null}
            {i.effective_date ? (
              <span style={S.when}>from {new Date(i.effective_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            ) : null}
          </div>

          <h3 style={S.cardTitle}>{i.title || 'Untitled'}</h3>
          {i.summary ? <p style={S.cardBody}>{i.summary}</p> : null}
          {i.affects ? <p style={S.affects}>Affects: {i.affects}</p> : null}

          <div style={S.cardFoot}>
            <div style={S.actions}>
              <button
                onClick={() => onDecide(i, 'approve')}
                disabled={busy !== null}
                style={{ ...S.approve, cursor: busy ? 'wait' : 'pointer' }}
              >
                Approve
              </button>
              <button
                onClick={() => onDecide(i, 'dismiss')}
                disabled={busy !== null}
                style={{ ...S.dismiss, cursor: busy ? 'wait' : 'pointer' }}
              >
                Not relevant
              </button>
            </div>

            {/* THE SOURCE, ALWAYS. You are about to vouch for this in front of HMRC. Read it first.
                A summary is a model's account of a page, and a model has been wrong before. */}
            {i.source_url ? (
              <a href={i.source_url} target="_blank" rel="noopener noreferrer" style={S.src}>
                Read the GOV.UK page first &rarr;
              </a>
            ) : (
              <span style={S.noSrc}>No source link. Do not approve this.</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

// --- the drawings -------------------------------------------------------------------------------

// One cell per PUBLISHED constant. The dark ones are the truth.
function cells(total: number, v: Vitals) {
  const out: Array<{ lit: boolean; tone: string; title: string }> = [];
  for (let i = 0; i < v.drifted; i++) out.push({ lit: true, tone: '#FF5A4E', title: 'DRIFT: our engine disagrees with GOV.UK' });
  for (let i = 0; i < v.blind; i++) out.push({ lit: true, tone: '#FFB020', title: 'Could not be read off its GOV.UK page' });
  for (let i = 0; i < v.agreed; i++) out.push({ lit: true, tone: '#3DDC84', title: 'Compared to its GOV.UK page. It matched.' });
  for (const name of v.unwatched) out.push({ lit: false, tone: '', title: `${name}: nothing is watching this` });
  // If the engine publishes more than the run accounted for, the remainder is unexamined. Show it as
  // dark rather than quietly shrinking the grid to a number that flatters us.
  while (out.length < total) out.push({ lit: false, tone: '', title: 'unexamined' });
  return out.slice(0, Math.max(total, out.length));
}

const Key = ({ tone, label }: { tone: string | null; label: string }) => (
  <span style={S.key}>
    <span
      style={{
        ...S.keyDot,
        background: tone ?? 'transparent',
        border: tone ? 'none' : '1px dashed rgba(255,255,255,0.35)',
      }}
      aria-hidden="true"
    />
    {label}
  </span>
);

function Stat({ n, label, tone, note }: { n: number; label: string; tone: string; note?: string }) {
  return (
    <div style={S.stat}>
      <div style={{ ...T.metric, fontSize: 26, color: tone }}>{n}</div>
      <div style={S.statL}>{label}</div>
      {note ? <div style={S.statNote}>{note}</div> : null}
    </div>
  );
}

function Growth({ points }: { points: Day[] }) {
  const max = Math.max(1, ...points.map((p) => p.total));
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${28 - (p.total / max) * 25}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: '100%', height: 92, display: 'block', marginTop: 18 }}>
      <path d={`${d} L 100 28.6 L 0 28.6 Z`} fill={`${C.river}18`} />
      <path d={d} fill="none" stroke={C.river} strokeWidth="0.9" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="28.6" x2="100" y2="28.6" stroke={C.line} strokeWidth="0.4" />
    </svg>
  );
}

// Inline styles cannot do keyframes. The pulse is the heartbeat: it stops when the brain does.
const KEYFRAMES = `
@keyframes khojiPulse {
  0%   { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  70%  { box-shadow: 0 0 0 11px rgba(0,0,0,0); opacity: 1; }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); opacity: 1; }
}
@keyframes khojiBreathe {
  0%, 100% { opacity: 0.72; }
  50%      { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }
}
`;

const INK = '#0E1116';

const S: Record<string, React.CSSProperties> = {
  err: { ...U.alarm },

  // The reactor. Dark, so the lights mean something. A grid of green cells on white is a spreadsheet.
  reactor: {
    position: 'relative',
    overflow: 'hidden',
    background: `linear-gradient(160deg, ${INK} 0%, #12161D 55%, #0C1015 100%)`,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: '22px 24px 24px',
    color: 'rgba(255,255,255,0.9)',
    fontFamily: FONT,
  },
  glow: {
    position: 'absolute', top: -140, right: -80, width: 420, height: 300,
    background: 'radial-gradient(closest-side, rgba(61,220,132,0.10), rgba(0,0,0,0))',
    pointerEvents: 'none',
  },

  topRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' },
  pulseWrap: { display: 'flex', alignItems: 'center', gap: 11 },
  core: { width: 10, height: 10, borderRadius: 6, display: 'inline-block', flex: '0 0 auto' },
  state: {
    fontSize: 13, fontWeight: 800, letterSpacing: 1.4,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  stamp: {
    fontSize: 11, letterSpacing: 1.1, fontWeight: 600,
    color: 'rgba(255,255,255,0.42)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  year: { color: 'rgba(255,255,255,0.28)' },

  says: {
    margin: '16px 0 0', maxWidth: 660,
    fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)',
  },

  gridWrap: { marginTop: 20 },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: 640 },
  cell: { width: 13, height: 13, borderRadius: 3, display: 'inline-block', flex: '0 0 auto' },

  legend: { display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 },
  key: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  keyDot: { width: 9, height: 9, borderRadius: 3, display: 'inline-block' },

  nights: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 22 },
  night: { width: 13, height: 20, borderRadius: 3, flex: '0 0 auto' },
  nightsNote: { fontSize: 11.5, color: 'rgba(255,255,255,0.35)', marginLeft: 9 },

  gap: {
    marginTop: 22, paddingTop: 18,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.58)', maxWidth: 700,
  },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 },
  chip: {
    padding: '4px 9px', borderRadius: 6,
    border: '1px dashed rgba(255,255,255,0.22)', color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5, fontWeight: 600,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },

  // --- the queue --------------------------------------------------------------------------------
  qHead: {
    display: 'flex', alignItems: 'flex-start', gap: 22, flexWrap: 'wrap',
    padding: '20px 22px', borderBottom: `1px solid ${C.line}`, background: C.paper,
  },
  qCount: { ...T.metric, fontSize: 30, marginTop: 4, color: C.amber },
  qWhy: { ...T.small, margin: 0, maxWidth: 560, flex: '1 1 320px' },

  card: { padding: '20px 22px', borderBottom: `1px solid ${C.lineSoft}` },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 9 },
  impact: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7,
    padding: '4px 8px', borderRadius: 5,
    background: C.redTint, color: '#8C2A20',
  },
  when: { ...T.tiny, fontWeight: 650 },
  cardTitle: { ...T.h2, fontSize: 16, margin: '0 0 8px' },
  cardBody: { ...T.body, margin: 0, maxWidth: 760 },
  affects: { ...T.small, margin: '9px 0 0', color: C.faint },

  cardFoot: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    marginTop: 16,
  },
  actions: { display: 'flex', gap: 8 },
  approve: {
    padding: '10px 22px', borderRadius: 10, border: 0,
    background: C.green, color: '#fff',
    fontSize: 14, fontWeight: 750, fontFamily: FONT,
    boxShadow: '0 6px 16px rgba(15,123,79,0.24)',
  },
  dismiss: {
    padding: '10px 16px', borderRadius: 10,
    border: `1px solid ${C.line}`, background: C.panel, color: C.muted,
    fontSize: 14, fontWeight: 650, fontFamily: FONT,
  },
  src: { ...T.small, color: C.river, fontWeight: 650, textDecoration: 'none' },
  noSrc: { ...T.small, color: C.red, fontWeight: 650 },

  emptyQ: { ...T.small, maxWidth: 700 },

  // --- what it holds ----------------------------------------------------------------------------
  statRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: { flex: '1 1 130px', minWidth: 120 },
  statL: { ...T.tiny, marginTop: 5, color: C.muted, fontWeight: 650 },
  statNote: { ...T.tiny, marginTop: 3 },
  foot: { ...T.small, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`, maxWidth: 760 },
};
