'use client';

// THE NEW OVERVIEW. The slim front page: your list first, then the health line, the money you came for,
// the workforce in a constellation, and a card per buddy reporting in. The heavy detail (the brain, the
// charts, the customer list) lives on its own page now and is one tap away from each card.
//
// This composes the pieces and takes the SAME `data` the console already loads from /api/team/overview,
// so integration is a one-line swap in page.tsx: render <OverviewNew data={data} onSignOut={...} />
// inside the signed-in branch, in place of the old stacked dashboard.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U, gbp } from './ui';
import Buddy from './Buddy';
import WorkforceMap from './WorkforceMap';
import WorkforceTodo from './WorkforceTodo';
import { BUDDIES, SEED_TODOS, type TodoItem } from './buddies';
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

// per-buddy report line for the cards. Real numbers get folded in below where we have them.
const REPORT: Record<string, { tag: 'live' | 'next' | 'plan'; bubble: string }> = {
  gyani:     { tag: 'live', bubble: 'Engine still agrees with GOV.UK. One quick fix ready for your yes.' },
  mistri:    { tag: 'live', bubble: 'Site up, jobs on time, nothing red. A couple of chores only you can do.' },
  munshi:    { tag: 'next', bubble: "Spec's written. Approve me to start, and decide my setup when you get a sec." },
  hoka:      { tag: 'plan', bubble: "Dreaming of viral clips. Left you the App Store screenshots so we're ready." },
  khazanchi: { tag: 'plan', bubble: "Nothing to count yet, nothing for your list. Wake me when there's money." },
  saudagar:  { tag: 'plan', bubble: "No trials to chase, nothing for your list. Real customers, and I'm up." },
};

const TAG: Record<string, React.CSSProperties> = {
  live: { background: C.greenTint, color: C.green },
  next: { background: C.saffronTint, color: C.amber },
  plan: { background: C.lineSoft, color: C.faint },
};
const TAG_LABEL: Record<string, string> = { live: 'Live', next: 'Build next', plan: 'Parked' };

export default function OverviewNew({
  data, onSignOut,
}: { data: OverviewPayload; onSignOut: () => void }) {
  const o = data.overview;
  const h = data.health;
  const brainOk = h.knowledge === 'ok';
  const cronsOk = h.crons === 'ok';

  // The CEO to-do list, live from the server (Munshi fills it each morning). Null while loading.
  const [todos, setTodos] = useState<TodoItem[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) { setTodos([]); return; }
      const res = await fetch('/api/team/todos', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) { setTodos(SEED_TODOS); return; } // fall back to the seed only if it cannot be read
      const j = await res.json();
      setTodos((j.todos as TodoItem[]) ?? []);
    })();
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

  // flags = OPEN items per buddy (not yet done), for the constellation flags and the "on your list" chips
  const flags: Record<string, number> = {};
  for (const t of todos ?? []) if (!t.done) flags[t.buddyKey] = (flags[t.buddyKey] ?? 0) + 1;

  function scrollToList() {
    document.getElementById('team-list')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div style={U.page}>
      {/* header, unchanged shape from the old console */}
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
        <div style={T.label}>Overview</div>
        <h1 style={{ ...T.h1, marginTop: 4 }}>Morning{data.me.name ? `, ${data.me.name.split(' ')[0]}` : ''}. The team&apos;s in.</h1>
        <p style={{ ...T.small, marginTop: 6, maxWidth: 640 }}>
          The team prepared everything it can. Approve the ones it can finish, the rest it just tells you.
        </p>

        {/* YOUR LIST */}
        <div id="team-list" style={{ marginTop: 22 }}>
          {todos === null ? (
            <div style={U.honest}>Loading your list.</div>
          ) : (
            <WorkforceTodo
              items={todos}
              onApprove={(id) => persist({ id, done: true })}
              onDoneToggle={(id, done) => persist({ id, done })}
            />
          )}
        </div>

        {/* HEALTH */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 26 }}>
          <Pill label="Tax knowledge" value={h.knowledge} tone={brainOk ? C.green : h.knowledge === 'unknown' ? C.faint : C.red} />
          <Pill label="Scheduled jobs" value={h.crons} tone={cronsOk ? C.green : h.crons === 'unknown' ? C.faint : C.red} />
        </div>
        {!brainOk && h.knowledge !== 'unknown' ? (
          <p style={{ ...U.alarm, marginTop: 14 }}>
            Khoji says our tax engine disagrees with GOV.UK, or cannot check it. Every figure is suspect until this is green.
          </p>
        ) : null}

        {/* MONEY */}
        <section style={{ ...U.section, marginTop: 26 }}>
          <div style={U.cards}>
            <Metric label="Customers" value={String(o.customers)} />
            <Metric label="Paying" value={String(o.active + o.pastDue)} tone={o.active + o.pastDue > 0 ? C.green : undefined} />
            <Metric label="On trial" value={String(o.trialing)} tone={o.trialing > 0 ? C.river : undefined} />
            <Metric label="MRR" value={gbp(o.mrrPence)} />
            <Metric label="Cancelling" value={String(o.cancelRequested)} tone={o.cancelRequested > 0 ? C.amber : undefined} />
          </div>
        </section>

        {/* THE WORKFORCE */}
        <section style={U.section}>
          <WorkforceMap flags={flags} />
        </section>

        {/* REPORTING IN */}
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Reporting in</h2>
            <span style={U.sectionNote}>the flagged ones put something on your list</span>
          </div>
          <div style={S.grid}>
            {BUDDIES.map((b) => {
              const rep = REPORT[b.key] ?? { tag: 'plan', bubble: '' };
              const count = flags[b.key] ?? 0;
              const parked = b.status === 'asleep';
              return (
                <div key={b.key} style={S.bc}>
                  <div style={S.bcTop}>
                    <Buddy def={b} size={56} />
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted }}>{b.role}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>{b.name}</div>
                    </div>
                    <span style={{ ...S.tag, ...TAG[rep.tag], marginLeft: 'auto' }}>{TAG_LABEL[rep.tag]}</span>
                  </div>
                  <div style={S.bubble}>{rep.bubble}</div>
                  {count > 0 ? (
                    <button style={S.foryou} onClick={scrollToList}>
                      <span style={S.foryouN}>{count}</span> on your list
                    </button>
                  ) : parked ? (
                    <div style={{ ...T.tiny, marginTop: 10 }}>Nothing for you today.</div>
                  ) : null}
                  <div style={S.foot}>
                    <span style={S.stt}>
                      <span style={{ width: 7, height: 7, borderRadius: 5, background: b.status === 'live' ? C.green : b.status === 'waking' ? C.amber : C.faint, display: 'inline-block', animation: b.status === 'live' ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
                      {b.statusWord}
                    </span>
                    <a href={b.href} style={S.open}>Open →</a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p style={{ ...T.tiny, marginTop: 40, maxWidth: 700 }}>
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
function Pill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span style={U.pill}>
      <span style={{ ...U.dot, background: tone }} />
      <span style={{ color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ color: tone, fontWeight: 750 }}>{value}</span>
    </span>
  );
}

const S: Record<string, React.CSSProperties> = {
  // flex-wrap instead of a fixed grid, so it collapses on a phone with no media query (inline styles cannot do queries)
  grid: { display: 'flex', flexWrap: 'wrap', gap: 15 },
  bc: { flex: '1 1 260px', minWidth: 240, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: '18px 18px 14px', boxShadow: '0 1px 2px rgba(17,17,17,.03)', display: 'flex', flexDirection: 'column', minHeight: 200 },
  bcTop: { display: 'flex', alignItems: 'center', gap: 13 },
  tag: { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', alignSelf: 'flex-start' },
  bubble: { position: 'relative', marginTop: 14, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 13, padding: '11px 13px', fontSize: 12.8, color: C.ink2, lineHeight: 1.5 },
  foryou: { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 11, fontWeight: 750, color: C.river, cursor: 'pointer', background: 'none', border: 0, fontFamily: 'inherit' },
  foryouN: { background: C.river, color: '#fff', borderRadius: 999, minWidth: 16, height: 16, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' },
  foot: { marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  stt: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.muted },
  open: { fontSize: 12.8, fontWeight: 700, color: C.river, textDecoration: 'none' },
};
