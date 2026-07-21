'use client';

// WHATSAPP SUPPORT — the desk where a paying customer's cry for help lands. When someone asks for a
// human in their WhatsApp thread, or reports a problem, a ticket appears here with a drafted reply. You
// read what they said, tweak the draft, and tap send — the reply goes straight back into their WhatsApp,
// from the Lekhio number, inside the 24-hour window. THE RULE, same as Dakiya: nothing is sent on its
// own. Every reply waits for you.

import { useEffect, useState, useCallback } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

type Reason = 'human' | 'complaint' | 'problem' | 'billing' | 'other';
type Status = 'open' | 'answered' | 'dismissed';

interface Suggestion {
  id: string;
  slug: string;
  title: string;
  body: string;
}
interface Ticket {
  id: string;
  phone: string;
  customerName: string | null;
  reason: Reason;
  customerMessage: string;
  draftReply: string;
  status: Status;
  openedAt: string;
  lastInboundAt: string;
  decidedAt: string | null;
  windowOpen: boolean;
  suggestions?: Suggestion[];
}

const REASON_LABEL: Record<Reason, string> = {
  human: 'Wants a human',
  complaint: 'Complaint',
  problem: 'Problem',
  billing: 'Billing',
  other: 'Support',
};
const REASON_TONE: Record<Reason, string> = {
  human: C.river,
  complaint: C.red,
  problem: C.amber,
  billing: '#0E7C86',
  other: C.muted,
};

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

// Hours left in the 24h free window, from the customer's last message.
function windowLeft(lastInboundIso: string): number {
  const t = Date.parse(lastInboundIso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, 24 - (Date.now() - t) / 3_600_000);
}

function maskPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : p;
}

export default function SupportPage() {
  const [open, setOpen] = useState<Ticket[]>([]);
  const [recent, setRecent] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
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
      const res = await fetch('/api/team/support', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const j = (await res.json()) as { open?: Ticket[]; recent?: Ticket[] };
        setOpen(j.open ?? []);
        setRecent(j.recent ?? []);
      }
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await pull(); };
    run();
    const id = setInterval(run, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [pull]);

  function draftFor(t: Ticket) {
    return edits[t.id] ?? t.draftReply;
  }

  async function decide(t: Ticket, action: 'send' | 'dismiss') {
    if (busy[t.id]) return;
    setBusy((b) => ({ ...b, [t.id]: true }));
    setError(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [t.id]: false })); return; }
    try {
      const res = await fetch('/api/team/support/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(action === 'send' ? { id: t.id, action, body: draftFor(t) } : { id: t.id, action }),
      });
      if (res.ok) {
        setOpen((list) => list.filter((x) => x.id !== t.id));
        const decided: Ticket = { ...t, status: action === 'send' ? 'answered' : 'dismissed', decidedAt: new Date().toISOString() };
        setRecent((list) => [decided, ...list].slice(0, 30));
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string; needsTemplate?: boolean };
        setError(
          j.needsTemplate
            ? 'The 24-hour reply window has closed for this customer. A free reply will not send now — it needs an approved template, or wait for them to message again.'
            : j.error || 'That did not go through. Try again in a moment.',
        );
      }
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [t.id]: false }));
  }

  return (
    <TeamShell title="Support · WhatsApp">
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...T.h2, margin: 0 }}>WhatsApp support</h2>
          <span style={{ ...T.small, color: C.muted }}>{open.length ? `${open.length} waiting` : 'all clear'}</span>
        </div>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          When a customer asks for a person or reports a problem in WhatsApp, it lands here with a drafted
          reply. You edit and send; the reply goes back into their WhatsApp thread from the Lekhio number.
          Nothing is sent without your tap.
        </p>
        <div style={{ marginTop: 14 }}>
          <a href="/team/playbook" style={{ ...U.headerBtn, textDecoration: 'none', display: 'inline-block' }}>
            Playbook · common issues &rarr;
          </a>
        </div>
      </section>

      {error ? <div style={{ ...U.panel, borderColor: C.red, color: C.red, marginTop: 14 }}>{error}</div> : null}

      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Waiting for you</h2>
          <span style={U.sectionNote}>{open.length ? `${open.length} to answer` : 'all clear'}</span>
        </div>
        {open.length === 0 ? (
          <div style={U.honest}>
            {loaded
              ? 'No one is waiting on a reply. When a customer asks for a human or flags a problem on WhatsApp, it appears here for you to answer.'
              : 'Reading the desk…'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {open.map((t) => {
              const disabled = !!busy[t.id];
              const hrs = windowLeft(t.lastInboundAt);
              const win = t.windowOpen && hrs > 0;
              return (
                <div key={t.id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...reasonChip, color: REASON_TONE[t.reason], borderColor: REASON_TONE[t.reason] }}>{REASON_LABEL[t.reason]}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{t.customerName || maskPhone(t.phone)}</span>
                    <span style={{ ...T.tiny, color: win ? C.green : C.amber, marginLeft: 'auto', fontWeight: 650 }}>
                      {win ? `reply window: ${hrs < 1 ? '<1' : Math.floor(hrs)}h left` : 'window closed — needs a template'}
                    </span>
                  </div>

                  <div style={theirMsg}>
                    <div style={{ ...T.tiny, color: C.faint, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>What they said · {ago(t.lastInboundAt)}</div>
                    <div style={{ ...T.small, color: C.ink, whiteSpace: 'pre-wrap' }}>{t.customerMessage}</div>
                  </div>

                  {t.suggestions && t.suggestions.length > 0 ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ ...T.tiny, color: C.faint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>From your playbook — tap to use</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {t.suggestions.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setEdits((e) => ({ ...e, [t.id]: s.body }))}
                            disabled={disabled}
                            title={s.body}
                            style={chip}
                          >
                            {s.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12 }}>
                    <div style={{ ...T.tiny, color: C.faint, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Your reply — edit before you send</div>
                    <textarea
                      value={draftFor(t)}
                      onChange={(ev) => setEdits((e) => ({ ...e, [t.id]: ev.target.value }))}
                      disabled={disabled}
                      rows={Math.min(14, Math.max(4, draftFor(t).split('\n').length + 1))}
                      style={bodyArea}
                      aria-label="Reply"
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => decide(t, 'send')} disabled={disabled || !win || !draftFor(t).trim()} style={{ ...btn, ...btnSend, opacity: disabled || !win || !draftFor(t).trim() ? 0.5 : 1 }}>
                      {disabled ? 'Sending…' : 'Send reply on WhatsApp'}
                    </button>
                    <button onClick={() => decide(t, 'dismiss')} disabled={disabled} style={{ ...btn, ...btnGhost, opacity: disabled ? 0.6 : 1 }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {recent.length > 0 ? (
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Recently handled</h2>
            <span style={U.sectionNote}>last {recent.length}</span>
          </div>
          <div style={{ ...U.panel, padding: 0 }}>
            {recent.map((t, i) => (
              <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 18px', borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}` }}>
                <span style={{ ...pillDot, background: t.status === 'answered' ? C.green : C.faint }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...T.small, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.status === 'answered' ? 'Answered' : 'Dismissed'} · {REASON_LABEL[t.reason]} · {t.customerName || maskPhone(t.phone)}
                  </div>
                </div>
                <span style={{ ...T.tiny, color: C.faint }}>{ago(t.decidedAt)}</span>
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
const reasonChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
  border: '1px solid', borderRadius: 999, padding: '2px 8px',
};
const theirMsg: React.CSSProperties = {
  marginTop: 12, background: '#FBFAF7', border: `1px solid ${C.lineSoft}`, borderRadius: 10, padding: '10px 12px',
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
const chip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 650, color: C.river, background: C.riverTint,
  border: `1px solid ${C.line}`, borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
