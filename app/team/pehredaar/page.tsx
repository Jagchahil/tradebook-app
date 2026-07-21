'use client';

// PEHREDAAR — the security desk. Tap the guard on the overview and you land here: one live card for every
// surface he watches (GitHub, Supabase, Vercel, UptimeRobot, the website, the app, the code), and under
// them his live message feed — what he's actually doing, newest first.
//
// THE RULE THAT DOES NOT BEND: Pehredaar never changes anything. He looks, he reports, and anything that
// needs a hand becomes an item in your list for you to approve. A guard who can also unlock the doors is
// not a guard. So this page is a window, not a control panel — there is nothing to press that changes the
// world, on purpose.
//
// Data comes from the same Bridge the overview polls (/api/team/bridge): his heartbeat carries a
// `detail.surfaces` array, and the activity feed carries his messages. Until his mini bot runs its first
// sweep, every card reads "waiting for the first sweep" rather than a false green.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

// The surfaces Pehredaar watches, in the order they matter. The bot reports against these exact keys, so
// a card exists for each even before the first sweep — "everything shows up", as asked.
const SURFACES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'github', label: 'GitHub', hint: 'Repo access, risky changes, new keys or workflows' },
  { key: 'supabase', label: 'Supabase', hint: 'Row-level security, roles, policies, auth settings' },
  { key: 'vercel', label: 'Vercel', hint: 'Deploys, environment variables, domains' },
  { key: 'uptime', label: 'UptimeRobot', hint: 'Is the site up, and how fast it answers' },
  { key: 'web', label: 'The website', hint: 'lekhio.app reachable, security headers in place' },
  { key: 'app', label: 'The app', hint: 'Mobile build health and store status' },
  { key: 'code', label: 'The code', hint: 'Dependencies, and no secrets committed by mistake' },
];

type SurfaceStatus = 'ok' | 'warn' | 'alert' | 'unknown';
interface SurfaceRow { key: string; label?: string; status?: SurfaceStatus; note?: string; at?: string }
interface Beat {
  workerKey: string; status: string; headline: string;
  detail: { surfaces?: SurfaceRow[]; sweptAt?: string } & Record<string, unknown>;
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

export default function PehredaarPage() {
  const [beat, setBeat] = useState<Beat | null>(null);
  const [acts, setActs] = useState<Act[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [retry, setRetry] = useState<Record<string, 'working' | 'queued' | 'error'>>({});

  useEffect(() => {
    let alive = true;
    async function pull() {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const res = await fetch('/api/team/bridge', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok || !alive) return;
      const j = (await res.json()) as { heartbeats?: Beat[]; activity?: Act[] };
      const hb = (j.heartbeats ?? []).find((b) => b.workerKey === 'pehredaar') ?? null;
      const mine = (j.activity ?? []).filter((a) => a.workerKey === 'pehredaar');
      if (alive) { setBeat(hb); setActs(mine); setLoaded(true); }
    }
    pull();
    const id = setInterval(pull, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const surfaces = beat?.detail?.surfaces ?? [];
  const byKey: Record<string, SurfaceRow> = {};
  for (const sfc of surfaces) if (sfc?.key) byKey[sfc.key] = sfc;

  // The surfaces that need a hand — a warning or an alert. Each gets a ready-to-paste prompt and a Retry.
  const flagged = SURFACES
    .map((s) => ({ def: s, row: byKey[s.key] }))
    .filter(({ row }) => row?.status === 'warn' || row?.status === 'alert');

  const headTone = !beat ? C.faint : beat.stale ? C.faint : (TONE[beat.status] ?? C.green);
  const headWord = !beat ? 'not reporting yet' : beat.stale ? 'resting' : 'on the clock';

  async function token(): Promise<string | null> {
    const { data } = await browserSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  // The prompt Jag copies and pastes to Claude to get a fix moving. Built from what Pehredaar actually
  // reported, so Claude lands with the full picture in one paste.
  function promptFor(label: string, status: string, note: string): string {
    return (
      `Pehredaar (Lekhio's 24/7 security watch) has flagged ${label} with a ${status}.\n\n` +
      `What he reported: "${note}"\n\n` +
      `Please look into what's causing this on ${label}, explain it plainly, and fix it. When it's sorted ` +
      `I'll hit Retry on the Pehredaar desk so he re-runs the sweep and confirms it's clear.`
    );
  }

  async function copyPrompt(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      /* clipboard blocked — the prompt box is selectable as a fallback */
    }
  }

  async function doRetry(worker: string) {
    if (retry[worker] === 'working') return;
    setRetry((m) => ({ ...m, [worker]: 'working' }));
    const tok = await token();
    if (!tok) { setRetry((m) => ({ ...m, [worker]: 'error' })); return; }
    try {
      const res = await fetch('/api/team/bridge/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ worker }),
      });
      setRetry((m) => ({ ...m, [worker]: res.ok ? 'queued' : 'error' }));
    } catch {
      setRetry((m) => ({ ...m, [worker]: 'error' }));
    }
  }

  return (
    <TeamShell title="Pehredaar · Security">
      {/* lkBeat lives in Buddy's own <style>, which this page never renders, so bring the pulse with us. */}
      <style>{`@keyframes lkBeat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}`}</style>

      {/* THE GUARD'S OWN STATUS */}
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...pillDot, background: headTone, animation: beat && !beat.stale ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
          <h2 style={{ ...T.h2, margin: 0 }}>Pehredaar</h2>
          <span style={{ ...T.small, color: C.muted }}>{headWord}</span>
          {beat?.lastRunAt ? <span style={{ ...T.small, color: C.faint, marginLeft: 'auto' }}>last swept {ago(beat.lastRunAt)}</span> : null}
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          {beat?.headline
            ? beat.headline
            : loaded
              ? 'Pehredaar is set up but has not run his first sweep yet. Once his bot is switched on the mini, the cards below fill with what he found and this fills with what he is doing right now.'
              : 'Reading the wire…'}
        </p>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          Pehredaar only ever looks and reports. He never changes a setting, a key or a line of code —
          anything that needs doing lands in your list to approve.
        </p>
      </section>

      {/* THE SURFACES, ONE LIVE CARD EACH */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>What he watches</h2>
          <span style={U.sectionNote}>{beat && !beat.stale ? 'live' : 'awaiting first sweep'}</span>
        </div>
        <div style={grid}>
          {SURFACES.map((sfc) => {
            const row = byKey[sfc.key];
            const st = (row?.status ?? 'unknown') as SurfaceStatus;
            const tone = TONE[st] ?? C.faint;
            return (
              <div key={sfc.key} style={surfCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...pillDot, background: tone }} />
                  <span style={{ fontSize: 15, fontWeight: 750, letterSpacing: -0.2, color: C.ink }}>{sfc.label}</span>
                  <span style={{ ...statusWord, color: tone, marginLeft: 'auto' }}>
                    {row ? st : 'not yet'}
                  </span>
                </div>
                <p style={{ ...T.small, color: C.ink2, margin: '10px 0 0', flex: 1 }}>
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

      {/* NEEDS A HAND — a prompt to copy + a retry, right under the warnings. */}
      {flagged.length > 0 ? (
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Needs a hand</h2>
            <span style={U.sectionNote}>{flagged.length} to look at</span>
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {flagged.map(({ def, row }) => {
              const st = (row?.status ?? 'warn') as SurfaceStatus;
              const note = row?.note ?? '';
              const prompt = promptFor(def.label, st, note);
              const rState = retry['pehredaar'];
              return (
                <div key={def.key} style={fixCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ ...pillDot, background: TONE[st] ?? C.amber }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{def.label}</span>
                    <span style={{ ...statusWord, color: TONE[st] ?? C.amber }}>{st}</span>
                  </div>
                  <p style={{ ...T.small, color: C.ink2, margin: '0 0 12px' }}>{note || def.hint}</p>

                  <div style={{ ...T.tiny, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 6 }}>
                    Copy this to Claude to get it fixed
                  </div>
                  <textarea
                    readOnly
                    value={prompt}
                    onFocus={(e) => e.currentTarget.select()}
                    rows={5}
                    aria-label={`Fix prompt for ${def.label}`}
                    style={promptArea}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => copyPrompt(def.key, prompt)} style={{ ...miniBtn, ...miniBtnDark }}>
                      {copied === def.key ? 'Copied ✓' : 'Copy prompt'}
                    </button>
                    <button
                      onClick={() => doRetry('pehredaar')}
                      disabled={rState === 'working'}
                      style={{ ...miniBtn, ...miniBtnGhost, opacity: rState === 'working' ? 0.6 : 1 }}
                    >
                      {rState === 'working' ? 'Queuing…' : rState === 'queued' ? 'Re-check queued ✓' : rState === 'error' ? 'Try Retry again' : 'Retry'}
                    </button>
                  </div>
                  {rState === 'queued' ? (
                    <div style={{ ...T.tiny, color: C.green, marginTop: 8 }}>
                      Queued — Pehredaar re-runs the whole sweep on his next pass and this clears itself if it reads clean.
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* THE LIVE MESSAGE FEED */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Live from Pehredaar</h2>
          <span style={U.sectionNote}>newest first</span>
        </div>
        {acts.length === 0 ? (
          <div style={U.honest}>
            No messages yet. When Pehredaar runs he narrates here — a line for each surface as he checks it,
            and a flag the moment anything looks off.
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
const surfCard: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14,
  padding: 16, minHeight: 128, boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const pillDot: React.CSSProperties = { width: 9, height: 9, borderRadius: 5, display: 'inline-block', flex: '0 0 auto' };
const statusWord: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 'auto' };
const fixCard: React.CSSProperties = {
  background: '#fff8ec', border: '1px solid #f0dcae', borderRadius: 14, padding: 18,
};
const promptArea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 12.5, lineHeight: 1.5, color: C.ink,
  border: '1px solid #e6cf95', borderRadius: 10, padding: '11px 12px', background: '#fff',
  fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", resize: 'vertical',
};
const miniBtn: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 750, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', border: '1px solid transparent',
};
const miniBtnDark: React.CSSProperties = { background: C.ink, color: '#fff' };
const miniBtnGhost: React.CSSProperties = { background: '#fff', color: '#5c4200', borderColor: '#e6cf95' };
