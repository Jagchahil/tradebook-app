'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U, FONT } from './ui';
import { isLive } from '../../lib/brain';
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

interface Organ {
  key: 'khoji' | 'rakha' | 'puchio';
  name: string;
  does: string;
  pulse: 'alive' | 'attention' | 'broken' | 'unwired';
  says: string;
  redWhen: string | null;
  count: number | null;
}
interface Body {
  organs: Organ[];
  centre: { subscribers: number; says: string };
  blind: boolean;
}

interface Payload {
  body: Body;
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

  // ⚠️ THE COUNT WENT STALE, AND THE BUG WAS A RACE I BUILT MYSELF.
  //
  // The first version re-read the whole brain after EVERY decision. Click fast, and an OLDER response
  // lands after a newer one and overwrites the queue with a bigger, staler list. The database was
  // perfectly correct: it said 26 waiting, 22 approved, every single click had landed. The SCREEN
  // said 31 and would not move.
  //
  // Which is the worst possible failure for this particular button, because it looks exactly like
  // "my approval did not save", and a man who does not trust the button stops using the gate.
  //
  // So the deck is the truth. One card at a time. A decision pops it locally, the POST goes off, and
  // NOTHING re-reads the server unless something fails. There is no response left in flight that can
  // arrive late and lie to you.
  const [deck, setDeck] = useState<Pending[] | null>(null);
  const [done, setDone] = useState<Array<{ item: Pending; decision: 'approve' | 'dismiss' }>>([]);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => { if (d && deck === null) setDeck(d.pending); }, [d, deck]);

  async function post(id: string, decision: 'approve' | 'dismiss' | 'undo') {
    const { data: s } = await browserSupabase.auth.getSession();
    return fetch('/api/team/review', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${s.session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, decision }),
    });
  }

  // APPROVE, or NOT RELEVANT. One card leaves, the next arrives. See app/api/team/review/route.ts for
  // why there is no Approve All and never will be: this is fast, not bulk. A human still reads each
  // one. He just is not made to fight the interface while he does it.
  async function decide(item: Pending, decision: 'approve' | 'dismiss') {
    if (!deck) return;

    // Pop it NOW. The card must not hesitate: a queue that lags gets double clicked, and a double
    // click on this button is a thing we told our users twice.
    setDeck(deck.filter((p) => p.id !== item.id));
    setDone((prev) => [{ item, decision }, ...prev]);
    setErr(null);

    const res = await post(item.id, decision);

    // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. Put it back at the FRONT, where he will see
    // it, not at the bottom of a deck he may never reach.
    if (!res.ok) {
      setDeck((cur) => (cur ? [item, ...cur.filter((p) => p.id !== item.id)] : [item]));
      setDone((prev) => prev.filter((x) => x.item.id !== item.id));
      setErr('That did not save. The card is back at the top. Nothing was approved.');
    }
  }

  // UNDO. The reason a single click is acceptable on the most consequential button in the company.
  //
  // Speed without a way back is not seamless, it is dangerous. It puts the row straight back in the
  // queue, at the front, exactly where it came from.
  async function undo() {
    const last = done[0];
    if (!last || undoing) return;
    setUndoing(true);

    const res = await post(last.item.id, 'undo');
    setUndoing(false);

    if (!res.ok) {
      setErr('Could not undo that. It is still ' + (last.decision === 'approve' ? 'approved' : 'dismissed') + '.');
      return;
    }
    setDeck((cur) => (cur ? [last.item, ...cur] : [last.item]));
    setDone((prev) => prev.slice(1));
    setErr(null);
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

        {/* ═══════════════════════════════════════════════════════════════════════════════════
            🔴 THE THREE ORGANS, AND LEKHIO IN THE MIDDLE.

            AN ORGAN WE CANNOT MEASURE IS DRAWN DARK. IT IS NEVER DRAWN GREEN.

            The obvious version of this screen is four rings, glowing, pulsing, growing. It would
            look magnificent and it would be a screensaver: a ring that glows whether or not the
            organ behind it is working is not a status light, and the day one of them dies the
            console goes on glowing exactly as before.

            So each organ answers one question: WHAT WOULD MAKE YOU GO RED? Khoji can answer it, and
            every way it can go red has actually happened. Puchio can answer it.

            RAKHA CANNOT. Its signals are computed on the way past a request and thrown away. There
            is no table. If it stopped tonight, nothing anywhere would go red, and nobody would find
            out, because nobody is waiting for it. So it is drawn DARK, with the reason underneath,
            and the whole reactor says BLIND at the top rather than glowing over the top of it.
            (supabase/APPLY_2026-07-14_rakha.sql closes it.)
            ═══════════════════════════════════════════════════════════════════════════════════ */}
        {d.body ? (
          <>
            {d.body.blind ? (
              <div style={S.blindBanner}>
                ONE ORGAN HAS NO HEARTBEAT. This console is not showing you a healthy system. It is
                showing you the part of the system it can see.
              </div>
            ) : null}

            <div style={S.organRow}>
              {d.body.organs.map((o) => {
                const tone = o.pulse === 'alive' ? '#3DDC84'
                  : o.pulse === 'attention' ? '#FFB020'
                    : o.pulse === 'broken' ? '#FF4D4D'
                      : '#3A3F4B';           // unwired. Not a colour. An absence.
                const dark = o.pulse === 'unwired';
                return (
                  <div key={o.key} style={{ ...S.organ, opacity: dark ? 0.72 : 1 }}>
                    <div style={{ ...S.organRing, borderColor: tone, boxShadow: dark ? 'none' : `0 0 18px ${tone}55` }}>
                      <span style={{ ...S.organDot, background: tone, animation: dark ? 'none' : 'khojiPulse 2.6s ease-out infinite' }} />
                    </div>
                    <div style={S.organName}>{o.name}</div>
                    <div style={S.organDoes}>{o.does}</div>
                    <div style={{ ...S.organSays, color: dark ? '#FF9F9F' : '#9AA3B2' }}>{o.says}</div>
                    {/* The most honest line on the screen. An organ that cannot say how it would go
                        red is an organ nobody is watching. */}
                    <div style={S.organRed}>
                      {o.redWhen ? `Goes red when: ${o.redWhen}` : 'Nothing would make this go red. That is the problem.'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* THE CENTRE. The only number here that is a PERSON and not a process. Everything else
                in this reactor exists to be right for him. */}
            <div style={S.centre}>{d.body.centre.says}</div>
          </>
        ) : null}

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
      <Deck
        deck={deck ?? []}
        doneCount={done.length}
        canUndo={done.length > 0 && !undoing}
        lastDecision={done[0]?.decision}
        onDecide={decide}
        onUndo={undo}
        approvedBefore={d.knowledge.reviewed}
      />

      {/* WHAT IT HOLDS ---------------------------------------------------------------------- */}
      <div style={{ ...U.panel, marginTop: 12 }}>
        {/* ⚠️ THESE COUNT THE DECK, NOT A SNAPSHOT FROM PAGE LOAD.
            The old version read `d.knowledge.waiting`, frozen at the moment the page loaded, while
            the deck emptied underneath it. Two numbers on one screen, from one table, disagreeing.
            That is the same bug as the growth chart and the 82 closed alarms, for the third time in
            one day, and the answer is the same: ONE source, derived, never two. */}
        <div style={S.statRow}>
          <Stat n={d.knowledge.reviewed + done.filter((x) => x.decision === 'approve').length}
                label="approved" tone={C.green} note="the only rows a user ever sees" />
          <Stat n={deck?.length ?? d.knowledge.waiting}
                label="waiting for you" tone={(deck?.length ?? 0) > 0 ? C.amber : C.faint} />
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

// --- THE DECK -----------------------------------------------------------------------------------
//
// ⚠️ THIS IS THE ONE BUTTON THE WHOLE DOCTRINE IS ABOUT.
//
// "One less button at a time. Until only one is left. Approve."
//
// A `reviewed` row is the ONLY kind that ever reaches a user's tax answer. So Approve is the moment
// a sentence Khoji scraped off GOV.UK becomes something we will say to a self-employed man about the
// return he is legally responsible for.
//
// IT IS A DECK, NOT A LIST, AND THAT IS NOT A UI PREFERENCE.
//
// A list of forty items asks him to hold forty decisions in his head and scroll. He scrolls, he
// skims, and skimming is exactly the failure a human gate exists to prevent. One card fills the
// screen: he can only be looking at the thing he is deciding.
//
// It is fast, and it is NOT bulk. There is no Approve All and there never will be. A human reads
// every one. He is simply not made to fight the interface while he does it. And because it is fast,
// the last decision is ALWAYS reversible with one click: speed without a way back is not seamless,
// it is dangerous.
function Deck({
  deck, doneCount, canUndo, lastDecision, onDecide, onUndo, approvedBefore,
}: {
  deck: Pending[];
  doneCount: number;
  canUndo: boolean;
  lastDecision?: 'approve' | 'dismiss';
  onDecide: (i: Pending, d: 'approve' | 'dismiss') => void;
  onUndo: () => void;
  approvedBefore: number;
}) {
  const card = deck[0];
  const total = deck.length + doneCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 100;

  if (!card) {
    return (
      <div style={{ ...U.panel, marginTop: 12 }}>
        <div style={S.emptyQ}>
          <b style={{ color: C.green }}>Nothing waiting for you.</b> Everything Khoji has distilled has
          been read by a human. {approvedBefore + doneCount} approved in total, and an approved row is
          the only kind that ever reaches a user.
          {canUndo ? (
            <button onClick={onUndo} style={{ ...S.undo, marginTop: 14 }}>
              Undo the last one
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...U.panel, marginTop: 12, padding: 0, overflow: 'hidden' }}>
      {/* The bar is the whole point of a deck: he can see the end of it. A list of forty has no end. */}
      <div style={S.deckHead}>
        <div style={S.deckLeft}>
          <span style={S.deckN}>{deck.length}</span>
          <span style={S.deckLabel}>left to read</span>
        </div>
        <div style={S.bar} aria-hidden="true">
          <div style={{ ...S.barFill, width: `${pct}%` }} />
        </div>
        {canUndo ? (
          <button onClick={onUndo} style={S.undo}>
            Undo {lastDecision === 'approve' ? 'approve' : 'dismiss'}
          </button>
        ) : null}
      </div>

      {/* THE CARD. One. He can only be looking at the thing he is deciding. */}
      <article key={card.id} style={S.card}>
        <div style={S.cardTop}>
          {/* ⚠️ THE BADGE THAT LIED ON ITS FIRST DAY. It said "CHANGES THE TAX ENGINE" on a page from
              1 January 2019 and another from 6 April 2017. `engine_impact` is a MODEL'S GUESS and the
              distiller had set it true on all 39 items: the loudest label on the screen was on
              everything, which means it was on nothing. The shout is now reserved for a change that
              is actually landing, decided by a fact the model cannot fudge: the effective date. */}
          {card.engine_impact && isLive(card.effective_date) ? (
            <span style={S.impact}>CHANGES THE TAX ENGINE</span>
          ) : card.engine_impact ? (
            <span style={S.touches}>touches the tax engine</span>
          ) : null}
          {card.effective_date ? (
            <span style={S.when}>
              from {new Date(card.effective_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : null}
        </div>

        <h3 style={S.cardTitle}>{card.title || 'Untitled'}</h3>
        {card.summary ? <p style={S.cardBody}>{card.summary}</p> : null}
        {card.affects ? <p style={S.affects}>Affects: {card.affects}</p> : null}

        {/* THE SOURCE, ALWAYS, AND ABOVE THE BUTTONS. You are about to vouch for this in front of
            HMRC. The summary is a MODEL'S account of a page, and on 8 July a model read the mileage
            page, scored its own confidence at 0.95, and was flat wrong. */}
        {card.source_url ? (
          <a href={card.source_url} target="_blank" rel="noopener noreferrer" style={S.src}>
            Read the GOV.UK page first &rarr;
          </a>
        ) : (
          <p style={S.noSrc}>No source link. Do not approve this.</p>
        )}

        <div style={S.actions}>
          <button onClick={() => onDecide(card, 'approve')} style={S.approve}>Approve</button>
          <button onClick={() => onDecide(card, 'dismiss')} style={S.dismiss}>Not relevant</button>
        </div>

        <p style={S.stakes}>
          <b>Nothing here reaches a single user until you say yes.</b> That is not a chore. That is the
          product.
        </p>
      </article>

      {/* The next card, peeking. It says: this ends, and here is how far away the end is. */}
      {deck[1] ? <div style={S.peek}>Next: {deck[1].title || 'Untitled'}</div> : null}
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

  blindBanner: {
    position: 'relative' as const, zIndex: 1,
    margin: '0 0 18px', padding: '10px 14px',
    borderRadius: 10, border: '1px solid #FF4D4D55', background: '#FF4D4D14',
    color: '#FF9F9F', fontSize: 12.5, lineHeight: 1.5, fontWeight: 600,
  },
  organRow: {
    position: 'relative' as const, zIndex: 1,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 18,
    marginBottom: 18,
  },
  organ: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', textAlign: 'center' as const },
  organRing: {
    width: 44, height: 44, borderRadius: '50%', border: '2px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  organDot: { width: 10, height: 10, borderRadius: '50%' },
  organName: { fontSize: 14, fontWeight: 700, color: '#E8ECF3', letterSpacing: 0.4 },
  organDoes: { fontSize: 11.5, color: '#7C8494', marginTop: 3, lineHeight: 1.45, maxWidth: 210 },
  organSays: { fontSize: 12, marginTop: 8, lineHeight: 1.45, maxWidth: 210 },
  organRed: { fontSize: 10.5, color: '#5C6373', marginTop: 8, lineHeight: 1.4, maxWidth: 210, fontStyle: 'italic' as const },
  centre: {
    position: 'relative' as const, zIndex: 1,
    textAlign: 'center' as const, fontSize: 13, color: '#C9D1DC', fontWeight: 600,
    padding: '12px 0 4px', borderTop: '1px solid #FFFFFF12', marginBottom: 4,
  },

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

  // --- the deck ---------------------------------------------------------------------------------
  deckHead: {
    display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
    padding: '16px 22px', borderBottom: `1px solid ${C.line}`, background: C.paper,
  },
  deckLeft: { display: 'flex', alignItems: 'baseline', gap: 8, flex: '0 0 auto' },
  deckN: { ...T.metric, fontSize: 26, color: C.amber },
  deckLabel: { ...T.tiny, fontWeight: 650 },
  // He can see the end of it. A list of forty has no end, and a man who cannot see the end skims.
  bar: { flex: '1 1 180px', height: 6, borderRadius: 3, background: C.lineSoft, overflow: 'hidden', minWidth: 120 },
  barFill: { height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${C.river}, ${C.green})`, transition: 'width 220ms ease' },
  undo: {
    padding: '7px 13px', borderRadius: 9,
    border: `1px solid ${C.line}`, background: C.panel, color: C.muted,
    fontSize: 12.5, fontWeight: 650, fontFamily: FONT, cursor: 'pointer', flex: '0 0 auto',
  },

  card: { padding: '24px 24px 22px' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  impact: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7,
    padding: '4px 8px', borderRadius: 5,
    background: C.redTint, color: '#8C2A20',
  },
  // The same fact, told honestly. It touches a rate we hold, and it is not news: the change landed
  // years ago, our engine has it, and Khoji compares it to GOV.UK every night. Worth reading. Not
  // worth shouting.
  touches: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
    padding: '4px 8px', borderRadius: 5,
    background: C.lineSoft, color: C.muted,
  },
  when: { ...T.tiny, fontWeight: 650 },
  cardTitle: { ...T.h1, fontSize: 21, margin: '0 0 10px', lineHeight: 1.3 },
  cardBody: { ...T.body, fontSize: 15, margin: 0, maxWidth: 760 },
  affects: { ...T.small, margin: '10px 0 0', color: C.faint },

  src: { ...T.small, color: C.river, fontWeight: 700, textDecoration: 'none', display: 'inline-block', marginTop: 16 },
  noSrc: { ...T.small, color: C.red, fontWeight: 700, marginTop: 16 },

  actions: { display: 'flex', gap: 10, marginTop: 20 },
  approve: {
    padding: '13px 34px', borderRadius: 11, border: 0,
    background: C.green, color: '#fff',
    fontSize: 15, fontWeight: 750, fontFamily: FONT, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(15,123,79,0.26)',
  },
  dismiss: {
    padding: '13px 20px', borderRadius: 11,
    border: `1px solid ${C.line}`, background: C.panel, color: C.muted,
    fontSize: 15, fontWeight: 650, fontFamily: FONT, cursor: 'pointer',
  },
  stakes: { ...T.small, margin: '16px 0 0', maxWidth: 620 },

  peek: {
    padding: '12px 24px', background: C.paper, borderTop: `1px solid ${C.lineSoft}`,
    ...T.tiny, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  emptyQ: { ...T.small, maxWidth: 700 },

  // --- what it holds ----------------------------------------------------------------------------
  statRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  stat: { flex: '1 1 130px', minWidth: 120 },
  statL: { ...T.tiny, marginTop: 5, color: C.muted, fontWeight: 650 },
  statNote: { ...T.tiny, marginTop: 3 },
  foot: { ...T.small, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}`, maxWidth: 760 },
};
