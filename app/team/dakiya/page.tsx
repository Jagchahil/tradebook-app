'use client';

// DAKIYA — the front desk. Three times a day he scans the Lekhio mailboxes, drafts a reply to every
// real enquiry, and lands them here. You read the customer's message, tweak the draft if you want, and
// tap Approve to send it — branded, from the address it came in on. Or dismiss it. THE RULE: Dakiya
// never sends anything on his own. Every reply waits for you. He reads and drafts; you decide.
//
// Data comes from /api/team/dakiya (pending + recently decided) and his heartbeat from the same Bridge
// as everyone else (/api/team/bridge). Until his reader runs, the list is simply empty and honest.

import { useEffect, useState, useCallback } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

type Lane = 'sales' | 'support' | 'general';
type DraftStatus = 'pending' | 'sent' | 'dismissed';

interface Draft {
  id: string;
  threadId: string;
  lane: Lane;
  fromEmail: string;
  fromName: string | null;
  toAlias: string;
  subject: string;
  snippet: string;
  draftSubject: string;
  draftBody: string;
  status: DraftStatus;
  createdAt: string;
  decidedAt: string | null;
}
interface Beat {
  workerKey: string;
  status: string;
  headline: string;
  detail: Record<string, unknown>;
  lastRunAt: string | null;
  updatedAt: string;
  stale: boolean;
}

const LANE_LABEL: Record<Lane, string> = { sales: 'Sales', support: 'Support', general: 'General' };
const LANE_TONE: Record<Lane, string> = { sales: C.river, support: '#0E7C86', general: C.muted };

function ago(iso?: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function DakiyaPage() {
  const [beat, setBeat] = useState<Beat | null>(null);
  const [pending, setPending] = useState<Draft[]>([]);
  const [recent, setRecent] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Per-draft local edits and in-flight state, keyed by draft id.
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await browserSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const pull = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const [d, b] = await Promise.all([
        fetch('/api/team/dakiya', { headers: { Authorization: `Bearer ${tok}` } }),
        fetch('/api/team/bridge', { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      if (d.ok) {
        const j = (await d.json()) as { pending?: Draft[]; recent?: Draft[] };
        setPending(j.pending ?? []);
        setRecent(j.recent ?? []);
      }
      if (b.ok) {
        const j = (await b.json()) as { heartbeats?: Beat[] };
        setBeat((j.heartbeats ?? []).find((x) => x.workerKey === 'dakiya') ?? null);
      }
    } catch {
      /* keep the last good view */
    }
    setLoaded(true);
  }, [token]);

  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) void pull(); };
    run();
    const id = setInterval(run, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [pull]);

  function editFor(d: Draft) {
    return edits[d.id] ?? { subject: d.draftSubject, body: d.draftBody };
  }
  function setEdit(id: string, patch: Partial<{ subject: string; body: string }>) {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? { subject: '', body: '' }), ...patch } as { subject: string; body: string } }));
  }

  async function decide(d: Draft, action: 'send' | 'dismiss') {
    if (busy[d.id]) return;
    setBusy((b) => ({ ...b, [d.id]: true }));
    setError(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [d.id]: false })); return; }
    const e = editFor(d);
    try {
      const res = await fetch('/api/team/dakiya/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(action === 'send'
          ? { id: d.id, action, subject: e.subject, body: e.body }
          : { id: d.id, action }),
      });
      if (res.ok) {
        // Optimistically move it out of pending.
        setPending((list) => list.filter((x) => x.id !== d.id));
        const decided: Draft = { ...d, status: action === 'send' ? 'sent' : 'dismissed', decidedAt: new Date().toISOString() };
        setRecent((list) => [decided, ...list].slice(0, 30));
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || 'That did not go through. Try again in a moment.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [d.id]: false }));
  }

  const headTone = !beat ? C.faint : beat.stale ? C.faint : C.green;
  const headWord = !beat ? 'not reporting yet' : beat.stale ? 'resting' : 'on the desk';

  return (
    <TeamShell title="Dakiya · Front Desk">
      <style>{`@keyframes lkBeat{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.55}}`}</style>

      {/* DAKIYA'S OWN STATUS */}
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ ...pillDot, background: headTone, animation: beat && !beat.stale ? 'lkBeat 1.8s ease-in-out infinite' : 'none' }} />
          <h2 style={{ ...T.h2, margin: 0 }}>Dakiya</h2>
          <span style={{ ...T.small, color: C.muted }}>{headWord}</span>
          {beat?.lastRunAt ? <span style={{ ...T.small, color: C.faint, marginLeft: 'auto' }}>last swept {ago(beat.lastRunAt)}</span> : null}
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          {beat?.headline
            ? beat.headline
            : loaded
              ? 'Dakiya is set up but has not run his first inbox sweep yet. Once his reader is switched on, replies he drafts land below for you to approve.'
              : 'Reading the wire…'}
        </p>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          Dakiya reads and drafts. He never sends anything on his own — every reply below waits for your
          approval, and goes out branded from the address it came in on.
        </p>
        <div style={{ marginTop: 14 }}>
          <a href="/team/newsletter" style={{ ...U.headerBtn, textDecoration: 'none', display: 'inline-block' }}>
            Newsletter · broadcast to subscribers &rarr;
          </a>
        </div>
      </section>

      {error ? (
        <div style={{ ...U.panel, borderColor: C.red, color: C.red, marginTop: 14 }}>{error}</div>
      ) : null}

      {/* THE DRAFTS WAITING */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Waiting for you</h2>
          <span style={U.sectionNote}>{pending.length ? `${pending.length} to review` : 'all clear'}</span>
        </div>
        {pending.length === 0 ? (
          <div style={U.honest}>
            No replies waiting. When Dakiya sweeps the mailboxes and drafts an answer, it appears here for
            you to read, tweak and approve.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {pending.map((d) => {
              const e = editFor(d);
              const disabled = !!busy[d.id];
              return (
                <div key={d.id} style={card}>
                  {/* who and which lane */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...laneChip, color: LANE_TONE[d.lane], borderColor: LANE_TONE[d.lane] }}>{LANE_LABEL[d.lane]}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{d.fromName || d.fromEmail}</span>
                    <span style={{ ...T.tiny, color: C.faint }}>{d.fromEmail}</span>
                    <span style={{ ...T.tiny, color: C.faint, marginLeft: 'auto' }}>to {d.toAlias} · {ago(d.createdAt)}</span>
                  </div>

                  {/* what they wrote */}
                  <div style={theirMsg}>
                    <div style={{ ...T.tiny, color: C.faint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>Their message</div>
                    <div style={{ ...T.small, color: C.ink, fontWeight: 600, marginBottom: 4 }}>{d.subject || '(no subject)'}</div>
                    <div style={{ ...T.small, color: C.ink2, whiteSpace: 'pre-wrap' }}>{d.snippet}</div>
                  </div>

                  {/* the draft, editable */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...T.tiny, color: C.faint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Dakiya's draft — edit before you send</div>
                    <input
                      value={e.subject}
                      onChange={(ev) => setEdit(d.id, { subject: ev.target.value })}
                      disabled={disabled}
                      style={subjInput}
                      aria-label="Reply subject"
                    />
                    <textarea
                      value={e.body}
                      onChange={(ev) => setEdit(d.id, { body: ev.target.value })}
                      disabled={disabled}
                      rows={Math.min(16, Math.max(6, e.body.split('\n').length + 1))}
                      style={bodyArea}
                      aria-label="Reply body"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => decide(d, 'send')} disabled={disabled} style={{ ...btn, ...btnSend, opacity: disabled ? 0.6 : 1 }}>
                      {disabled ? 'Sending…' : `Approve & send from ${d.toAlias}`}
                    </button>
                    <button onClick={() => decide(d, 'dismiss')} disabled={disabled} style={{ ...btn, ...btnGhost, opacity: disabled ? 0.6 : 1 }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* RECENTLY HANDLED */}
      {recent.length > 0 ? (
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Recently handled</h2>
            <span style={U.sectionNote}>last {recent.length}</span>
          </div>
          <div style={{ ...U.panel, padding: 0 }}>
            {recent.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 18px', borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}` }}>
                <span style={{ ...pillDot, background: d.status === 'sent' ? C.green : C.faint }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...T.small, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.status === 'sent' ? 'Sent' : 'Dismissed'} · {LANE_LABEL[d.lane]} · {d.subject || '(no subject)'}
                  </div>
                </div>
                <span style={{ ...T.tiny, color: C.faint }}>{ago(d.decidedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </TeamShell>
  );
}

const pillDot: React.CSSProperties = { width: 9, height: 9, borderRadius: 5, display: 'inline-block', flex: '0 0 auto' };
const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16,
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const laneChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
  border: '1px solid', borderRadius: 999, padding: '2px 8px',
};
const theirMsg: React.CSSProperties = {
  marginTop: 12, background: '#FBFAF7', border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '10px 12px',
};
const subjInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 14, fontWeight: 600, color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', marginBottom: 8, background: '#fff',
};
const bodyArea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.6, color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px', background: '#fff',
  fontFamily: "Inter,-apple-system,'Segoe UI',sans-serif", resize: 'vertical',
};
const btn: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, borderRadius: 10, padding: '10px 16px', cursor: 'pointer', border: '1px solid transparent',
};
const btnSend: React.CSSProperties = { background: C.ink, color: '#fff' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: C.muted, borderColor: C.line };
