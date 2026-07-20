'use client';

// THE OVERVIEW — the CEO's front page, kept deliberately calm. The day, your list, the business in a
// glance, and the team as one quiet grid you tap into.
//
// WHAT CHANGED (20 Jul, the "make it like Apple" pass):
//   - The node-constellation is GONE. It drew the team TWICE (once as orbiting chips, once as cards
//     below), and its layout had six fixed seats, so the moment the workforce grew past six the extra
//     chips piled onto the top seat and their labels collided. One clean grid, one source of truth.
//   - Health folds into the business line instead of a separate band of pills.
//   - Each worker is a whole-card tap target, and shows its LIVE status when the Bridge has a heartbeat
//     for it (falling back to a calm one-liner until its bot starts reporting).
//
// Same data contract as before: takes the payload the console already loads from /api/team/overview.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U, gbp } from './ui';
import Buddy from './Buddy';
import WorkforceTodo from './WorkforceTodo';
import TeamTabs from './TeamTabs';
import { BUDDIES, BUBBLE, SEED_TODOS, type TodoItem } from './buddies';
import type { TeamOverview } from '../../lib/team';

interface Health {
  crons: string;
  knowledge: string;
  cronAlarms: Array<{ job: string; reason: string }>;
  knowledgeAlarms: Array<{ kind?: string; reason?: string }>;
  brain: Record<string, unknown> | null;
}
export interface OverviewPayload {
  me: { email: string; name: string | null; role: string };
  overview: TeamOverview;
  health: Health;
}

interface Beat { status: string; headline: string; stale: boolean }

const STATUS_TONE: Record<string, string> = { ok: C.green, warn: C.amber, alert: C.red, offline: C.faint };

export default function OverviewNew({
  data, onSignOut,
}: { data: OverviewPayload; onSignOut: () => void }) {
  const o = data.overview;
  const h = data.health;
  const cronsOk = h.crons === 'ok';
  // The tax-knowledge light, honest about degree. 'stale' is AMBER — a queue/feed lag, not a wrong
  // number — and only drift/blind/unwatched are red. Each red state says exactly what it is instead of
  // the old generic "your engine disagrees with GOV.UK", which used to fire even on a quiet week when
  // the engine had in fact just been confirmed correct.
  const knowTone =
    h.knowledge === 'ok' ? C.green
      : h.knowledge === 'unknown' ? C.faint
        : h.knowledge === 'stale' ? C.amber
          : C.red;
  const knowAlarm =
    h.knowledge === 'drift'
      ? 'Khoji found a tax constant that disagrees with GOV.UK. Every figure is suspect until this is fixed.'
      : h.knowledge === 'blind'
        ? 'Khoji could not read one of its GOV.UK pages, so a constant is unconfirmed. Treat figures with care until this is green.'
        : h.knowledge === 'unwatched'
          ? 'Nothing has checked our tax constants against GOV.UK recently. We are not saying we are wrong — we are saying nobody is looking.'
          : null;
  const cronTone = cronsOk ? C.green : h.crons === 'unknown' ? C.faint : C.red;
  const first = data.me.name ? data.me.name.split(' ')[0] : '';

  const [todos, setTodos] = useState<TodoItem[] | null>(null);
  const [beats, setBeats] = useState<Record<string, Beat>>({});

  // The CEO to-do list (Munshi fills it each morning).
  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) { setTodos([]); return; }
      const res = await fetch('/api/team/todos', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) { setTodos(SEED_TODOS); return; }
      const j = await res.json();
      setTodos((j.todos as TodoItem[]) ?? []);
    })();
  }, []);

  // The Bridge: live heartbeats off the mini, so a card can show what its worker is doing right now.
  // Polled gently so the "watch them work" view stays current without hammering the server.
  useEffect(() => {
    let alive = true;
    async function pull() {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/bridge', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok || !alive) return;
      const j = (await res.json()) as { heartbeats?: Array<{ workerKey: string; status: string; headline: string; stale: boolean }> };
      const map: Record<string, Beat> = {};
      for (const b of j.heartbeats ?? []) map[b.workerKey] = { status: b.status, headline: b.headline, stale: b.stale };
      if (alive) setBeats(map);
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  async function persist(bodyObj: Record<string, unknown>) {
    const { data: s } = await browserSupabase.auth.getSession();
    const tok = s.session?.access_token;
    if (!tok) return;
    await fetch('/api/team/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify(bodyObj),
    });
  }

  // Open items per worker (not done), for the little count on each card.
  const flags: Record<string, number> = {};
  let needsOpen = 0;
  for (const t of todos ?? []) {
    if (t.done) continue;
    flags[t.buddyKey] = (flags[t.buddyKey] ?? 0) + 1;
    if (t.kind === 'needs') needsOpen += 1;
  }

  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const statusLine =
    todos === null ? 'Bringing your day together…'
      : needsOpen > 0 ? `${needsOpen} ${needsOpen === 1 ? 'thing needs' : 'things need'} you today. The team has the rest in hand.`
        : 'Nothing needs you today. The team has it.';

  return (
    <div style={U.page}>
      <header style={U.header}>
        <div style={U.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={U.wordmark}>Lekhio</span>
            <span style={U.accent} aria-hidden="true" />
            <span style={{ ...U.headerRole, marginLeft: 6 }}>Console</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={U.headerRole}>{data.me.name || data.me.email} · {data.me.role}</span>
            <button style={U.headerBtn} onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main style={U.main}>
        {/* THE DAY */}
        <div style={T.label}>{dateLine}</div>
        <h1 style={hero}>{partOfDay}{first ? `, ${first}` : ''}.</h1>
        <p style={{ ...T.body, color: C.muted, marginTop: 8, maxWidth: 620 }}>{statusLine}</p>

        {/* TABS — Today (your list + the team) or the live CEO brief. */}
        <TeamTabs active="today" />

        {/* YOUR LIST */}
        <div id="team-list" style={{ marginTop: 26 }}>
          {todos === null ? (
            <div style={U.honest}>Bringing your list together…</div>
          ) : (
            <WorkforceTodo
              items={todos}
              onApprove={(id) => persist({ id, done: true })}
              onDoneToggle={(id, done) => persist({ id, done })}
            />
          )}
        </div>

        {/* THE BUSINESS */}
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>The business</h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <StatusDot label="Tax knowledge" tone={knowTone} />
              <StatusDot label="Systems" tone={cronTone} />
            </span>
          </div>
          <div style={U.cards}>
            <Metric label="Customers" value={String(o.customers)} />
            <Metric label="Paying" value={String(o.active + o.pastDue)} tone={o.active + o.pastDue > 0 ? C.green : undefined} />
            <Metric label="On trial" value={String(o.trialing)} tone={o.trialing > 0 ? C.river : undefined} />
            <Metric label="MRR" value={gbp(o.mrrPence)} />
            <Metric label="Cancelling" value={String(o.cancelRequested)} tone={o.cancelRequested > 0 ? C.amber : undefined} />
          </div>
          {knowAlarm ? (
            <p style={{ ...U.alarm, marginTop: 14 }}>{knowAlarm}</p>
          ) : null}
        </section>

        {/* THE TEAM */}
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>The team</h2>
            <span style={U.sectionNote}>tap any to open</span>
          </div>
          <div style={grid}>
            {BUDDIES.map((b) => {
              const beat = beats[b.key];
              const live = beat && !beat.stale;
              const count = flags[b.key] ?? 0;
              const line = live && beat.headline ? beat.headline : (BUBBLE[b.key] ?? '');
              const dotColor = live ? (STATUS_TONE[beat.status] ?? C.green)
                : b.status === 'live' ? C.green : b.status === 'waking' ? C.amber : C.faint;
              const word = live ? 'reporting live' : b.statusWord;
              return (
                <a key={b.key} href={b.href} style={card}>
                  <div style={cardTop}>
                    <Buddy def={b} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={cardName}>{b.name}</div>
                      <div style={cardRole}>{b.role}</div>
                    </div>
                    {count > 0 ? <span style={countBadge}>{count}</span> : null}
                  </div>
                  <div style={cardLine}>{line}</div>
                  <div style={cardFoot}>
                    <span style={cardStatus}>
                      <span style={{ width: 7, height: 7, borderRadius: 5, background: dotColor, display: 'inline-block', animation: live ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
                      {word}
                    </span>
                    <span style={{ color: C.river, fontWeight: 700, fontSize: 15 }} aria-hidden="true">→</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <p style={{ ...T.tiny, marginTop: 44, maxWidth: 700 }}>
          This page shows who our customers are and what they pay us. It never shows anyone&apos;s receipts,
          income, expenses, tax figures or phone number, and it never will.
        </p>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={U.card}>
      <div style={T.label}>{label}</div>
      <div style={{ ...T.metric, color: tone ?? C.ink, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function StatusDot({ label, tone }: { label: string; tone: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: C.muted }}>
      <span style={{ width: 8, height: 8, borderRadius: 5, background: tone, display: 'inline-block' }} />
      {label}
    </span>
  );
}

const hero: React.CSSProperties = { fontSize: 30, fontWeight: 700, letterSpacing: -0.9, color: C.ink, margin: '6px 0 0', lineHeight: 1.1 };

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(248px, 1fr))',
  gap: 14,
};

const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16,
  padding: 18, textDecoration: 'none', color: 'inherit',
  boxShadow: '0 1px 2px rgba(17,17,17,.03)', minHeight: 158,
};
const cardTop: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 };
const cardName: React.CSSProperties = { fontSize: 16.5, fontWeight: 750, letterSpacing: -0.3, color: C.ink };
const cardRole: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: C.faint, marginTop: 2 };
const countBadge: React.CSSProperties = {
  marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999,
  background: C.river, color: '#fff', fontSize: 11.5, fontWeight: 800,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
const cardLine: React.CSSProperties = { marginTop: 13, fontSize: 13, color: C.ink2, lineHeight: 1.5, flex: 1 };
const cardFoot: React.CSSProperties = { marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const cardStatus: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: C.muted };
