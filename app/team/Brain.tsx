'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U } from './ui';
import type { Vitals, Day, Knowledge } from '../../lib/brain';

// KHOJI. The brain, live.
//
// ⚠️ WHAT THIS SCREEN REFUSES TO BE.
//
// Khoji is the only thing we have that nobody else in the category has, so the pull is to make it
// look like a brain: a rising line, a big green number, the word LIVE pulsing somewhere. That
// version of this page would be a screensaver, and worse than nothing, because it would teach the
// team to glance at it and feel reassured.
//
// The first thing on it is therefore the least flattering number in the company: how many of the
// constants our users' tax bills rest on have NEVER been compared to GOV.UK. Not a percentage of
// the ones we watch. All of them, by name.
//
// "0 drift" does not mean our tax numbers are right. It means the ones we look at are right. The
// distance between those two sentences is one Budget, and one man signing a return we prepared.

interface Payload {
  vitals: Vitals;
  coverage: { pct: number; watched: number; total: number; blind: number };
  knowledge: Knowledge;
  growth: Day[];
  runs: Array<{ ran_at: string; agreed: number; drifted: number; blind: number; ok: boolean }>;
}

const PULSE: Record<Vitals['pulse'], { tone: string; tint: string; word: string }> = {
  checking:  { tone: C.green,  tint: C.greenTint,  word: 'Checking' },
  wrong:     { tone: C.red,    tint: C.redTint,    word: 'We are wrong' },
  blind:     { tone: C.amber,  tint: C.amberTint,  word: 'Cannot see' },
  // Deliberately RED, not amber. "Nobody is looking" is not a degraded state, it is the state in
  // which every other light on this page stops meaning anything.
  unwatched: { tone: C.red,    tint: C.redTint,    word: 'Nobody is looking' },
  // The job ran and compared nothing. Red, because "it crashed" and "it is fine" must never share
  // a colour, and for about an hour on 14 July they shared a colour and a sentence.
  failed:    { tone: C.red,    tint: C.redTint,    word: 'The run did not finish' },
  never:     { tone: C.red,    tint: C.redTint,    word: 'Never run' },
};

export default function Brain() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/team/brain', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 503) {
        // NOT "the brain is empty". On this page above all others the difference is the product.
        setErr('Could not read the brain. This is NOT "nothing has been checked". We could not reach the database, and we do not know what Khoji found.');
        return;
      }
      if (!res.ok) { setErr('Could not load Khoji.'); return; }
      setD((await res.json()) as Payload);
    })();
  }, []);

  if (err) return <p style={S.err}>{err}</p>;

  if (!d) {
    return (
      <section style={U.section}>
        <div style={U.sectionHead}><h2 style={T.h2}>Khoji</h2><span style={U.sectionNote}>reading</span></div>
        <div style={{ ...U.panel, height: 150 }} aria-busy="true" />
      </section>
    );
  }

  const v = d.vitals;
  const p = PULSE[v.pulse];
  const cov = d.coverage;

  return (
    <section style={U.section}>
      <div style={U.sectionHead}>
        <h2 style={T.h2}>Khoji</h2>
        <span style={U.sectionNote}>the brain. It reads GOV.UK so nobody has to remember to.</span>
      </div>

      {/* 1. THE PULSE. Not "is it healthy". WHEN did something last look, and what did it find. */}
      <div style={{ ...U.panel, borderColor: v.pulse === 'checking' ? C.line : p.tone }}>
        <div style={S.pulseRow}>
          <span style={{ ...S.pulseDot, background: p.tone }} aria-hidden="true" />
          <span style={{ ...S.pulseWord, color: p.tone }}>{p.word}</span>
          <span style={S.when}>
            {v.lastRunAt === null
              ? 'no run has ever been recorded'
              : v.hoursAgo === 0 ? 'checked within the hour'
              : `last looked ${v.hoursAgo}h ago`}
          </span>
        </div>

        <p style={S.says}>{v.says}</p>

        {/* The last fortnight of nights. Fourteen marks, and a gap in them is a night nobody
            checked. It is the one chart on this page you want to be boring. */}
        {d.runs.length > 0 ? (
          <div style={S.nights}>
            {d.runs.map((r) => {
              // ⚠️ A CRASHED RUN IS NOT A GREEN NIGHT, and it rendered as one for about an hour.
              //
              // The colour used to be: red if drifted, amber if blind, otherwise green. A run that
              // crashed before checking anything has drifted 0 and blind 0, so it painted itself
              // green. My own crash sat on this page as a healthy night, on the strip whose entire
              // job is to show you the nights nobody checked.
              //
              // A night with no comparisons in it is a HOLE, and it is drawn as one.
              const checked = r.agreed + r.drifted + r.blind;
              const dead = checked === 0;
              return (
                <span
                  key={r.ran_at}
                  title={dead
                    ? `${new Date(r.ran_at).toLocaleString('en-GB')}: the run did not check anything. It started and did not finish.`
                    : `${new Date(r.ran_at).toLocaleString('en-GB')}: ${r.agreed} agreed, ${r.drifted} drift, ${r.blind} blind`}
                  style={{
                    ...S.night,
                    background: dead ? 'transparent'
                      : r.drifted > 0 ? C.red
                      : r.blind > 0 ? C.amber
                      : C.green,
                    border: dead ? `1.5px dashed ${C.red}` : 'none',
                  }}
                />
              );
            })}
            <span style={S.nightsNote}>the last {d.runs.length} nights</span>
          </div>
        ) : null}
      </div>

      {/* 2. WHAT IT HAS NEVER LOOKED AT. The least flattering number in the company, and the one
             that stops "0 drift" quietly turning into "our tax numbers are right". */}
      <div style={{ ...U.panel, marginTop: 12 }}>
        <div style={S.covHead}>
          <div>
            <div style={T.label}>Constants watched</div>
            <div style={S.covBig}>
              {cov.watched}<span style={S.covOf}> of {cov.total}</span>
            </div>
          </div>
          <div style={S.covPct}>{cov.pct}%</div>
        </div>

        <div style={S.bar} aria-hidden="true">
          <div style={{ ...S.barFill, width: `${cov.pct}%` }} />
        </div>

        {v.unwatched.length > 0 ? (
          <>
            <p style={S.covNote}>
              <b>&ldquo;0 drift&rdquo; does not mean our tax numbers are right. It means the ones we
              look at are right.</b> These {v.unwatched.length} are published by the engine, sit
              underneath real figures in real tax returns, and have never once been compared to
              GOV.UK. They are not fine. They are unexamined.
            </p>
            <div style={S.chips}>
              {v.unwatched.map((f) => <span key={f} style={S.gap}>{f}</span>)}
            </div>
          </>
        ) : cov.total > 0 ? (
          <p style={S.covNote}>Every constant the engine publishes has an extractor watching it.</p>
        ) : null}
      </div>

      {/* 3. WHAT IT HAS LEARNED. Collecting is not learning: a queue nobody approves is a brain
             that has stopped growing while looking busy. */}
      <div style={{ ...U.panel, marginTop: 12 }}>
        <div style={S.knowRow}>
          <Stat n={d.knowledge.reviewed} label="approved" tone={C.green} note="the only rows a user ever sees" />
          <Stat n={d.knowledge.waiting} label="waiting for a human" tone={d.knowledge.waiting > 0 ? C.amber : C.faint} />
          <Stat n={d.knowledge.raw} label="not yet distilled" tone={C.faint} />
          <Stat n={d.knowledge.incidents} label="open incidents" tone={d.knowledge.incidents > 0 ? C.red : C.faint} note="not knowledge. Alarms." />
        </div>

        <Growth points={d.growth} />

        <div style={S.legend}>
          <b style={{ color: C.ink }}>{d.growth.at(-1)?.total ?? 0}</b> things Khoji has learned, and
          it has never learned one from a user. Only public tax law: GOV.UK, HMRC manuals, primary
          sources. Never a transaction, never a receipt, never a name.
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label, tone, note }: { n: number; label: string; tone: string; note?: string }) {
  return (
    <div style={S.stat}>
      <div style={{ ...T.metric, fontSize: 26, color: tone }}>{n}</div>
      <div style={S.statL}>{label}</div>
      {note ? <div style={S.statNote}>{note}</div> : null}
    </div>
  );
}

// The brain growing. A running total, because what matters is that it is bigger than it was.
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

const S: Record<string, React.CSSProperties> = {
  err: { ...U.alarm, marginTop: 20 },

  pulseRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pulseDot: { width: 9, height: 9, borderRadius: 5, flex: '0 0 auto' },
  pulseWord: { fontSize: 17, fontWeight: 800, letterSpacing: -0.3 },
  when: { ...T.small, color: C.faint, marginLeft: 'auto' },
  says: { ...T.body, margin: '12px 0 0', maxWidth: 720 },

  nights: { display: 'flex', alignItems: 'center', gap: 4, marginTop: 18 },
  night: { width: 14, height: 22, borderRadius: 3, flex: '0 0 auto' },
  nightsNote: { ...T.tiny, marginLeft: 8 },

  covHead: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  covBig: { ...T.metric, marginTop: 6 },
  covOf: { fontSize: 17, fontWeight: 600, color: C.faint, letterSpacing: 0 },
  covPct: { ...T.metric, fontSize: 26, color: C.faint },
  bar: { height: 6, borderRadius: 3, background: C.lineSoft, marginTop: 14, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${C.river}, ${C.saffron})` },
  covNote: { ...T.small, margin: '14px 0 0', maxWidth: 720 },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 },
  gap: {
    padding: '5px 10px', borderRadius: 7, background: C.paper, border: `1px dashed ${C.line}`,
    fontSize: 12, fontWeight: 650, color: C.ink2,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },

  knowRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: { flex: '1 1 130px', minWidth: 120 },
  statL: { ...T.tiny, marginTop: 5, color: C.muted, fontWeight: 650 },
  statNote: { ...T.tiny, marginTop: 3 },

  legend: { ...T.small, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`, maxWidth: 760 },
};
