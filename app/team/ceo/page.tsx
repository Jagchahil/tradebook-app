'use client';

// THE CEO BRIEF — the situation room. Not a to-do list (that is "Today"), just a live one-line read on
// every worker: what each is doing right now, updating the moment they report. Anything that actually
// needs you still goes to your list; this is so you always know what is happening without having to ask.
//
// One section per worker. A fresh heartbeat shows what it is doing (and "reporting live"); with no beat
// yet it shows what the worker is FOR, greyed, so the screen never pretends a napping bot is busy. Each
// row is a tap target into that worker's own desk.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';
import TeamTabs from '../TeamTabs';
import Buddy from '../Buddy';
import { BUDDIES, BUBBLE } from '../buddies';

interface Beat { workerKey: string; status: string; headline: string; lastRunAt: string | null; updatedAt: string; stale: boolean }
interface Act { id: string; workerKey: string; kind: string; message: string; at: string }

const TONE: Record<string, string> = { ok: C.green, warn: C.amber, alert: C.red, offline: C.faint };

function ago(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function CeoBriefPage() {
  const [beats, setBeats] = useState<Record<string, Beat>>({});
  const [lastAct, setLastAct] = useState<Record<string, Act>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function pull() {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/bridge', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok || !alive) return;
      const j = (await res.json()) as { heartbeats?: Beat[]; activity?: Act[] };
      const bmap: Record<string, Beat> = {};
      for (const b of j.heartbeats ?? []) bmap[b.workerKey] = b;
      // Newest activity per worker (activity comes newest-first from the API).
      const amap: Record<string, Act> = {};
      for (const a of j.activity ?? []) if (!amap[a.workerKey]) amap[a.workerKey] = a;
      if (alive) { setBeats(bmap); setLastAct(amap); setLoaded(true); }
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const liveCount = Object.values(beats).filter((b) => !b.stale).length;

  return (
    <TeamShell title="CEO brief">
      <TeamTabs active="ceo" />

      <div style={{ marginTop: 24 }}>
        <h1 style={hero}>What everyone’s doing</h1>
        <p style={{ ...T.body, color: C.muted, marginTop: 8, maxWidth: 620 }}>
          {loaded
            ? liveCount > 0
              ? `${liveCount} ${liveCount === 1 ? 'worker is' : 'workers are'} reporting live. Anything that needs you is in your list.`
              : 'A live read on the team. When a worker runs, its line here updates on its own. Anything that needs you goes to your list.'
            : 'Reading the wire…'}
        </p>
      </div>

      <section style={{ marginTop: 22 }}>
        <div style={{ ...U.panel, padding: 0 }}>
          {BUDDIES.map((b, i) => {
            const beat = beats[b.key];
            const live = beat && !beat.stale;
            const tone = live ? (TONE[beat.status] ?? C.green) : C.faint;
            const act = lastAct[b.key];
            const line = live && beat.headline ? beat.headline : (BUBBLE[b.key] ?? '');
            const word = live ? 'reporting live' : beat ? `last seen ${ago(beat.updatedAt)}` : b.statusWord;
            return (
              <a
                key={b.key}
                href={b.href}
                style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 18px',
                  borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}`,
                  textDecoration: 'none', color: 'inherit',
                }}
              >
                <Buddy def={b} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15.5, fontWeight: 750, letterSpacing: -0.2, color: C.ink }}>{b.name}</span>
                    <span style={{ ...T.tiny, textTransform: 'uppercase', letterSpacing: 0.4, color: C.faint }}>{b.role}</span>
                  </div>
                  <p style={{ ...T.small, color: live ? C.ink2 : C.muted, margin: '4px 0 0' }}>{line}</p>
                  {live && act ? (
                    <p style={{ ...T.tiny, color: C.faint, margin: '5px 0 0' }}>latest: {act.message} · {ago(act.at)}</p>
                  ) : null}
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', paddingTop: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 5, background: tone, display: 'inline-block', animation: live ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
                  <span style={{ ...T.tiny, color: C.muted }}>{word}</span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <p style={{ ...T.tiny, marginTop: 28, maxWidth: 680 }}>
        This is a read-only brief. Nothing here changes anything — it is the one place you can glance and
        know what the whole team is up to. What needs a decision is in your list.
      </p>
    </TeamShell>
  );
}

const hero: React.CSSProperties = { fontSize: 26, fontWeight: 700, letterSpacing: -0.7, color: C.ink, margin: 0, lineHeight: 1.1 };
