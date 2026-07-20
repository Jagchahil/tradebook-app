'use client';

// KANJOOS — the money desk. Tap the coin on the overview and you land here: a card for every place the
// company spends (Anthropic first, that's the big one, then OpenAI when voice notes go live, then
// Supabase against its Free-plan ceiling), each showing the actual number, and under them his live feed.
//
// THE RULE, same as the guard: Kanjoos never changes what you spend. He reads the meter and reports. A
// spike, a budget overrun, a database filling toward a paid upgrade — each becomes a line for you to
// decide on. A bot that can quietly cancel keys or cap budgets is not a cost-watcher, it's a liability.
//
// Data comes from the same Bridge as everyone else (/api/team/bridge): his heartbeat carries a
// `detail.lines` array of spend figures, and the activity feed carries his messages. Until his mini bot
// runs, every card reads "waiting for the first sweep".

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

// The places money goes, in the order they matter. The bot reports against these exact keys, so a card
// exists for each even before the first sweep.
const SOURCES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'anthropic', label: 'Anthropic (Claude)', hint: 'Your Claude API spend — the big one' },
  { key: 'openai', label: 'OpenAI', hint: 'Voice-note transcription spend, once it is switched on' },
  { key: 'supabase', label: 'Supabase', hint: 'Database size against the Free-plan ceiling' },
];

type LineStatus = 'ok' | 'warn' | 'alert' | 'unknown';
interface CostLine { key: string; label?: string; value?: string; status?: LineStatus; note?: string; at?: string }
interface Beat {
  workerKey: string; status: string; headline: string;
  detail: { lines?: CostLine[]; sweptAt?: string } & Record<string, unknown>;
  lastRunAt: string | null; updatedAt: string; stale: boolean;
}
interface Act { id: string; workerKey: string; kind: string; message: string; at: string }

const TONE: Record<string, string> = { ok: C.green, warn: C.amber, alert: C.red, unknown: C.faint, offline: C.faint };
const KIND_TONE: Record<string, string> = { found: C.amber, warn: C.amber, error: C.red, done: C.green, start: C.river, info: C.muted };

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

export default function KanjoosPage() {
  const [beat, setBeat] = useState<Beat | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
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
      const hb = (j.heartbeats ?? []).find((b) => b.workerKey === 'kanjoos') ?? null;
      const mine = (j.activity ?? []).filter((a) => a.workerKey === 'kanjoos');
      if (alive) { setBeat(hb); setActs(mine); setLoaded(true); }
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const lines = beat?.detail?.lines ?? [];
  const byKey: Record<string, CostLine> = {};
  for (const l of lines) if (l?.key) byKey[l.key] = l;

  const headTone = !beat ? C.faint : beat.stale ? C.faint : (TONE[beat.status] ?? C.green);
  const headWord = !beat ? 'not reporting yet' : beat.stale ? 'resting' : 'on the clock';

  return (
    <TeamShell title="Kanjoos · Cost">
      {/* lkBeat lives in Buddy's own <style>, which this page never renders, so bring the pulse with us. */}
      <style>{`@keyframes lkBeat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}`}</style>

      {/* THE WATCHER'S OWN STATUS */}
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...pillDot, background: headTone, animation: beat && !beat.stale ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
          <h2 style={{ ...T.h2, margin: 0 }}>Kanjoos</h2>
          <span style={{ ...T.small, color: C.muted }}>{headWord}</span>
          {beat?.lastRunAt ? <span style={{ ...T.small, color: C.faint, marginLeft: 'auto' }}>last checked {ago(beat.lastRunAt)}</span> : null}
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          {beat?.headline
            ? beat.headline
            : loaded
              ? 'Kanjoos is set up but has not run his first cost sweep yet. Once his bot is switched on the mini, the cards below fill with real spend and this fills with what he is finding.'
              : 'Reading the wire…'}
        </p>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          Kanjoos only ever reads the meter and reports. He never cancels a key, caps a budget or changes a
          plan — anything worth doing about the money lands in your list to approve.
        </p>
      </section>

      {/* THE SPEND, ONE CARD EACH */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Where the money goes</h2>
          <span style={U.sectionNote}>{beat && !beat.stale ? 'live' : 'awaiting first sweep'}</span>
        </div>
        <div style={grid}>
          {SOURCES.map((sfc) => {
            const row = byKey[sfc.key];
            const st = (row?.status ?? 'unknown') as LineStatus;
            const tone = TONE[st] ?? C.faint;
            const value = row?.value && row.value !== '—' ? row.value : null;
            return (
              <div key={sfc.key} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...pillDot, background: tone }} />
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: C.ink }}>{sfc.label}</span>
                  <span style={{ ...statusWord, color: tone, marginLeft: 'auto' }}>{row ? st : 'not yet'}</span>
                </div>
                <div style={{ ...T.metric, fontSize: 24, marginTop: 12, color: value ? C.ink : C.faint }}>
                  {value ?? '—'}
                </div>
                <p style={{ ...T.small, color: C.ink2, margin: '8px 0 0', flex: 1 }}>
                  {row?.note ? row.note : sfc.hint}
                </p>
                <div style={{ ...T.tiny, color: C.faint, marginTop: 10 }}>
                  {row?.at ? `checked ${ago(row.at)}` : 'waiting for the first sweep'}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* THE LIVE MESSAGE FEED */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Live from Kanjoos</h2>
          <span style={U.sectionNote}>newest first</span>
        </div>
        {acts.length === 0 ? (
          <div style={U.honest}>
            No messages yet. When Kanjoos runs he narrates here — the spend on each source as he reads it,
            and a flag the moment a bill spikes or a limit gets close.
          </div>
        ) : (
          <div style={{ ...U.panel, padding: 0 }}>
            {acts.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, padding: '13px 18px', borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}` }}>
                <span style={{ ...pillDot, background: KIND_TONE[a.kind] ?? C.muted, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...T.body, margin: 0, color: C.ink }}>{a.message}</div>
                  <div style={{ ...T.tiny, color: C.faint, marginTop: 3 }}>{a.kind} · {ago(a.at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </TeamShell>
  );
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 };
const card: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
  padding: 16, minHeight: 140, boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const pillDot: React.CSSProperties = { width: 9, height: 9, borderRadius: 5, display: 'inline-block', flex: '0 0 auto' };
const statusWord: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' };
