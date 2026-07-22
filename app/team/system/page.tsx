'use client';

// MISTRI — the CTO's desk. He watches that the machine keeps running: the scheduled jobs, the tax engine's
// agreement with GOV.UK, the deploys, and whether the site is up. He never changes anything from here — a
// stopped job or a red engine becomes an item in your list. The live read comes from the Bridge: his own
// heartbeat (beaten by the desk pulse) carries the system word, and Pehredaar's surfaces carry deploy and
// uptime, so the two watchmen share one source of truth instead of checking the world twice.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

interface SurfaceRow { key?: string; label?: string; status?: string; note?: string; at?: string }
interface Beat {
  workerKey: string;
  status: string;
  headline: string;
  detail: { cronsOk?: boolean; cronAlarms?: number; knowledge?: string; surfaces?: SurfaceRow[] } & Record<string, unknown>;
  lastRunAt: string | null;
  updatedAt: string;
  stale: boolean;
}

const TONE: Record<string, string> = { ok: C.green, warn: C.amber, alert: C.red, unknown: C.faint, offline: C.faint };

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

interface ConnRow { platform: string; configured: boolean; connected: boolean; connected_by: string | null; expires_at: string | null }

export default function SystemPage() {
  const [mistri, setMistri] = useState<Beat | null>(null);
  const [pehredaar, setPehredaar] = useState<Beat | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [conns, setConns] = useState<ConnRow[]>([]);
  const [connEnabled, setConnEnabled] = useState(false);
  const [connOwner, setConnOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    async function pull() {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/bridge', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok || !alive) return;
      const j = (await res.json()) as { heartbeats?: Beat[] };
      const hb = j.heartbeats ?? [];
      if (alive) {
        setMistri(hb.find((b) => b.workerKey === 'mistri') ?? null);
        setPehredaar(hb.find((b) => b.workerKey === 'pehredaar') ?? null);
        setLoaded(true);
      }
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/connectors', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok || !on) return;
      const j = (await res.json()) as { enabled?: boolean; isOwner?: boolean; platforms?: ConnRow[] };
      if (on) { setConnEnabled(!!j.enabled); setConnOwner(!!j.isOwner); setConns(j.platforms ?? []); }
    })();
    return () => { on = false; };
  }, []);

  async function connect(platform: string) {
    const { data: s } = await browserSupabase.auth.getSession();
    const tok = s.session?.access_token;
    if (!tok) return;
    const res = await fetch(`/api/connectors/${platform}/start`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) return;
    const j = (await res.json()) as { url?: string };
    if (j.url) window.location.href = j.url;
  }

  const headTone = !mistri ? C.faint : mistri.stale ? C.faint : (TONE[mistri.status] ?? C.green);
  const headWord = !mistri ? 'not reporting yet' : mistri.stale ? 'resting' : 'on watch';

  const surfaces = pehredaar?.detail?.surfaces ?? [];
  const byKey: Record<string, SurfaceRow> = {};
  for (const sfc of surfaces) if (sfc?.key) byKey[sfc.key] = sfc;

  // The four things Mistri answers for. Cron + knowledge come from his own beat; deploy + uptime ride in
  // on Pehredaar's surfaces so we never check the same wire twice.
  const cronsOk = mistri?.detail?.cronsOk;
  const cronAlarms = mistri?.detail?.cronAlarms ?? 0;
  const knowledge = mistri?.detail?.knowledge;
  const cards = [
    {
      key: 'crons', label: 'Scheduled jobs',
      status: mistri ? (cronsOk ? 'ok' : cronsOk === false ? 'warn' : 'unknown') : 'unknown',
      note: mistri
        ? cronsOk ? 'Every scheduled job has run inside its window.'
          : cronsOk === false ? `${cronAlarms} job(s) behind — something that should be running is not.`
          : 'Job health not read yet.'
        : 'Waiting for the first pulse.',
    },
    {
      key: 'engine', label: 'Tax engine',
      status: knowledge === 'ok' ? 'ok' : knowledge && knowledge !== 'unknown' ? 'alert' : 'unknown',
      note: knowledge === 'ok' ? 'Our tax rules agree with GOV.UK — every figure rests on solid ground.'
        : knowledge && knowledge !== 'unknown' ? 'The engine disagrees with GOV.UK, or cannot be checked. Do not trust a figure until this clears.'
        : 'Engine agreement not read yet.',
    },
    {
      key: 'vercel', label: 'Deploys',
      status: byKey.vercel?.status ?? 'unknown',
      note: byKey.vercel?.note ?? 'Deploy health rides in on Pehredaar — awaiting his sweep.',
    },
    {
      key: 'uptime', label: 'Site & uptime',
      status: byKey.web?.status ?? byKey.uptime?.status ?? 'unknown',
      note: byKey.web?.note ?? byKey.uptime?.note ?? 'Uptime rides in on Pehredaar — awaiting his sweep.',
    },
  ];

  return (
    <TeamShell title="Mistri · System">
      <style>{`@keyframes lkBeat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}`}</style>

      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...pillDot, background: headTone, animation: mistri && !mistri.stale ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
          <h2 style={{ ...T.h2, margin: 0 }}>Mistri</h2>
          <span style={{ ...T.small, color: C.muted }}>{headWord}</span>
          {mistri?.updatedAt ? <span style={{ ...T.small, color: C.faint, marginLeft: 'auto' }}>checked {ago(mistri.updatedAt)}</span> : null}
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          {mistri?.headline
            ? mistri.headline
            : loaded
              ? 'Mistri is set up but has not run his first pulse yet. Once the desk pulse runs on the mini, this fills with the live system read.'
              : 'Reading the wire…'}
        </p>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          Mistri only ever looks and reports. A stopped job or a red engine becomes an item in your list to
          act on — he never restarts, redeploys, or changes a line himself.
        </p>
      </section>

      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>What he watches</h2>
          <span style={U.sectionNote}>{mistri && !mistri.stale ? 'live' : 'awaiting pulse'}</span>
        </div>
        <div style={grid}>
          {cards.map((c) => {
            const tone = TONE[c.status] ?? C.faint;
            return (
              <div key={c.key} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...pillDot, background: tone }} />
                  <span style={{ fontSize: 15, fontWeight: 750, letterSpacing: -0.2, color: C.ink }}>{c.label}</span>
                  <span style={{ ...statusWord, color: tone, marginLeft: 'auto' }}>{c.status}</span>
                </div>
                <p style={{ ...T.small, color: C.ink2, margin: '10px 0 0' }}>{c.note}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Connectors</h2>
          <span style={U.sectionNote}>{connEnabled ? 'live' : 'off'}</span>
        </div>
        <div style={grid}>
          {conns.map((c) => {
            const tone = c.connected ? C.green : c.configured ? C.amber : C.faint;
            const word = c.connected ? 'connected' : c.configured ? 'ready' : 'not set up';
            const label = c.platform === 'meta' ? 'Meta (Facebook + Instagram)' : c.platform === 'tiktok' ? 'TikTok' : c.platform === 'google' ? 'Google' : c.platform === 'linkedin' ? 'LinkedIn' : c.platform === 'twitter' ? 'X (Twitter)' : c.platform;
            const canConnect = connOwner && connEnabled && c.configured && !c.connected;
            return (
              <div key={c.platform} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...pillDot, background: tone }} />
                  <span style={{ fontSize: 15, fontWeight: 750, letterSpacing: -0.2, color: C.ink }}>{label}</span>
                  <span style={{ ...statusWord, color: tone, marginLeft: 'auto' }}>{word}</span>
                </div>
                <button
                  onClick={() => connect(c.platform)}
                  disabled={!canConnect}
                  style={{ marginTop: 12, width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: canConnect ? C.ink : C.panel, color: canConnect ? '#fff' : C.faint, fontWeight: 700, fontSize: 13, cursor: canConnect ? 'pointer' : 'not-allowed' }}>
                  {c.connected ? 'Connected' : 'Connect'}
                </button>
                <p style={{ ...T.tiny, marginTop: 8, marginBottom: 0, color: C.faint }}>
                  {!connEnabled ? 'Connectors are off until CONNECTORS_ENABLED is set.' : !c.configured ? 'Add this platform\u2019s keys in the environment first.' : c.connected ? `Linked${c.connected_by ? ' by ' + c.connected_by : ''}.` : connOwner ? 'Ready to connect.' : 'The owner connects this one.'}
                </p>
              </div>
            );
          })}
        </div>
      </section>

    </TeamShell>
  );
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 };
const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const pillDot: React.CSSProperties = { width: 9, height: 9, borderRadius: 5, display: 'inline-block', flex: '0 0 auto' };
const statusWord: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' };
