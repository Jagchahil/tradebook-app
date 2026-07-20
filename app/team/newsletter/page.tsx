'use client';

// NEWSLETTER — the broadcast desk. Issues are written in code (lib/newsletter.ts) and previewed here,
// exactly as a subscriber will see them, in the same branded shell as every other Lekhio email. Nothing
// goes out on its own: an issue is only ever sent when you, signed in, tap send twice — and only when
// NEWSLETTER_SEND_ENABLED is armed on the server. The audience is confirmed, consented, non-unsubscribed
// leads, and every email carries a one-click unsubscribe.

import { useEffect, useState, useCallback } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

interface Issue {
  id: string;
  subject: string;
  preheader: string;
}
interface Feed {
  issues: Issue[];
  audience: number;
  armed: boolean;
  emailConfigured: boolean;
  previewHtml: string | null;
}

export default function NewsletterPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [arming, setArming] = useState(false); // first tap flips this on; second tap sends
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await browserSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const pull = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    const res = await fetch('/api/team/newsletter', { headers: { Authorization: `Bearer ${tok}` } });
    if (res.ok) {
      const j = (await res.json()) as Feed;
      setFeed(j);
      if (!selected && j.issues[0]) setSelected(j.issues[0].id);
    }
  }, [token, selected]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await pull(); })();
    return () => { alive = false; };
  }, [pull]);

  // Load the preview whenever the selected issue changes.
  useEffect(() => {
    if (!selected) { setPreviewHtml(null); return; }
    let alive = true;
    (async () => {
      const tok = await token();
      if (!tok) return;
      const res = await fetch(`/api/team/newsletter?id=${encodeURIComponent(selected)}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok && alive) {
        const j = (await res.json()) as Feed;
        setPreviewHtml(j.previewHtml);
      }
    })();
    setArming(false);
    setNote(null);
    return () => { alive = false; };
  }, [selected, token]);

  async function send() {
    if (!selected || busy) return;
    if (!arming) { setArming(true); return; } // first tap: arm
    setBusy(true);
    setError(null);
    setNote(null);
    const tok = await token();
    if (!tok) { setBusy(false); return; }
    try {
      const res = await fetch('/api/team/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ id: selected, confirm: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; queued?: number; capped?: number; error?: string };
      if (res.ok && j.ok) {
        setNote(`Sending to ${j.queued} subscriber${j.queued === 1 ? '' : 's'}${j.capped ? ` (${j.capped} over today's cap will need a second run)` : ''}.`);
      } else {
        setError(j.error || 'That did not go through.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setArming(false);
    setBusy(false);
  }

  const issue = feed?.issues.find((i) => i.id === selected) ?? null;
  const canSend = !!feed?.armed && !!feed?.emailConfigured && !!issue && (feed?.audience ?? 0) > 0;

  return (
    <TeamShell title="Newsletter · Broadcast">
      {/* AUDIENCE + STATUS */}
      <section style={U.cards}>
        <div style={U.card}>
          <div style={T.label}>Confirmed audience</div>
          <div style={{ ...T.metric, marginTop: 6 }}>{feed ? feed.audience : '—'}</div>
          <div style={{ ...T.tiny, color: C.faint, marginTop: 4 }}>double opt-in, not unsubscribed</div>
        </div>
        <div style={U.card}>
          <div style={T.label}>Sending</div>
          <div style={{ ...T.metric, marginTop: 6, color: feed?.armed ? C.green : C.faint }}>{feed ? (feed.armed ? 'Armed' : 'Off') : '—'}</div>
          <div style={{ ...T.tiny, color: C.faint, marginTop: 4 }}>{feed?.armed ? 'ready to send' : 'set NEWSLETTER_SEND_ENABLED'}</div>
        </div>
        <div style={U.card}>
          <div style={T.label}>Email service</div>
          <div style={{ ...T.metric, marginTop: 6, color: feed?.emailConfigured ? C.green : C.faint }}>{feed ? (feed.emailConfigured ? 'Live' : 'Dormant') : '—'}</div>
          <div style={{ ...T.tiny, color: C.faint, marginTop: 4 }}>Resend</div>
        </div>
      </section>

      {/* ISSUE PICKER */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Issues</h2>
          <span style={U.sectionNote}>{feed ? `${feed.issues.length} written` : ''}</span>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {(feed?.issues ?? []).map((i) => {
            const on = i.id === selected;
            return (
              <button
                key={i.id}
                onClick={() => setSelected(i.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer',
                  background: on ? C.riverTint : C.panel,
                  border: `1px solid ${on ? C.river : C.line}`,
                  borderRadius: 12, padding: '13px 15px',
                }}
              >
                <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{i.subject}</div>
                {i.preheader ? <div style={{ ...T.small, color: C.muted, marginTop: 3 }}>{i.preheader}</div> : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* PREVIEW */}
      {issue ? (
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Preview</h2>
            <span style={U.sectionNote}>exactly what a subscriber receives</span>
          </div>
          <div style={{ background: '#FBFAF7', border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 }}>
            <div style={{ ...T.tiny, color: C.faint, marginBottom: 10 }}>Subject: <span style={{ color: C.ink2, fontWeight: 700 }}>{issue.subject}</span></div>
            <div
              style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: '22px 22px 18px' }}
              dangerouslySetInnerHTML={{ __html: previewHtml ?? '<p>Loading…</p>' }}
            />
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={send}
              disabled={!canSend || busy}
              style={{
                fontSize: 13.5, fontWeight: 700, borderRadius: 10, padding: '11px 18px', cursor: canSend && !busy ? 'pointer' : 'not-allowed',
                border: '1px solid transparent', color: '#fff',
                background: arming ? C.red : C.ink, opacity: canSend && !busy ? 1 : 0.5,
              }}
            >
              {busy ? 'Sending…' : arming ? `Tap again to send to ${feed?.audience} subscribers` : 'Send this issue'}
            </button>
            {arming && !busy ? (
              <button onClick={() => setArming(false)} style={{ ...U.headerBtn }}>Cancel</button>
            ) : null}
            {!feed?.armed ? <span style={{ ...T.small, color: C.faint }}>Sending is off — arm it on the server first.</span> : null}
          </div>

          {note ? <p style={{ ...T.small, color: C.green, marginTop: 12 }}>{note}</p> : null}
          {error ? <p style={{ ...T.small, color: C.red, marginTop: 12 }}>{error}</p> : null}
        </section>
      ) : null}
    </TeamShell>
  );
}
