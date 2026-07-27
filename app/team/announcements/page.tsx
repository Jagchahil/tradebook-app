'use client';

// /team/announcements — THE DESK WHERE KHOJI BECOMES VISIBLE.
//
// Two things on one page, and the order is the argument.
//
// FIRST, what a customer sees right now, rendered by the actual banner component, from the actual
// output of lib/announcements.ts. Not a mock up. Approve a card on the Brain desk, come here, and it
// is there. That loop is the whole point of this feature: until today, approving a finding moved a
// number in the engine and told the man who pays us absolutely nothing.
//
// SECOND, the place to write one in our own words, for the things a machine cannot say, and for a
// finding whose distilled summary reads like a statutory instrument.
//
// ⚠️ PUBLISHING HERE CANNOT BYPASS THE APPROVAL GATE. Attaching a knowledge item only replaces the
// WORDING of a card the customer would already have been shown; if that finding is not approved,
// nothing appears at all. There is no path on this page that puts an unreviewed row in front of a
// customer, and there must never be one.

import { useCallback, useEffect, useState } from 'react';
import TeamShell from '../TeamShell';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import { AnnouncementsBanner, type BannerItem } from '../../_shared/AnnouncementsBanner';

interface Row {
  id: string;
  title: string | null;
  body: string | null;
  source_url: string | null;
  knowledge_item_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  live: boolean;
}

const MAX_BODY = 220;   // mirrors MAX_BODY_CHARS; the server refuses over this, this only warns early

export default function AnnouncementsPage() {
  return (
    <TeamShell title="Announcements">
      <Desk />
    </TeamShell>
  );
}

function Desk() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [preview, setPreview] = useState<BannerItem[] | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [knowledgeItemId, setKnowledgeItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    const res = await fetch('/api/team/announcements', { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) { setUnreadable(true); return; }
    const j = (await res.json()) as { items?: Row[]; preview?: BannerItem[] | null };
    setRows(j.items ?? []);
    setPreview(j.preview ?? null);
    setUnreadable(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const t = s.session?.access_token ?? null;
      setToken(t);
      if (t) await load(t);
    })();
  }, [load]);

  async function publish() {
    setErr(null);
    if (!token) return;
    if (!title.trim()) { setErr('Give it a headline.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/team/announcements', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, sourceUrl, knowledgeItemId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; max?: number; was?: number };
        setErr(explain(j));
        return;
      }
      setTitle(''); setBody(''); setSourceUrl(''); setKnowledgeItemId('');
      await load(token);
    } catch {
      setErr('Could not publish just now. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  }

  async function retire(id: string) {
    if (!token) return;
    await fetch('/api/team/announcements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retire', id }),
    });
    await load(token);
  }

  return (
    <>
      {/* ── What a customer sees, right now ─────────────────────────────────────────────────── */}
      <section style={U.card}>
        <h2 style={T.h2}>What a customer sees right now</h2>
        <p style={T.small}>
          The real banner, from the real selection code, with nothing dismissed. Approve a finding on
          the Knowledge desk and it appears here. Only approved findings ever reach it.
        </p>

        <div style={{ marginTop: 16, maxWidth: 520 }}>
          {preview === null && !unreadable && <p style={T.small}>Reading.</p>}

          {/* ⚠️ "COULD NOT READ IT" AND "NOTHING TO SAY" ARE DIFFERENT FACTS AND THEY DO NOT GET THE
              SAME SENTENCE. A blank banner because a query timed out, shown as a quiet week, is the
              exact silent-success failure this codebase keeps being bitten by. */}
          {unreadable && (
            <p style={{ ...T.small, color: C.red }}>
              Could not read the announcements. This is not the same as there being nothing to say.
            </p>
          )}

          {preview !== null && preview.length === 0 && (
            <p style={T.small}>
              Nothing approved and recent enough to show. A customer sees no banner at all, which is
              correct: a row that says nothing teaches him to stop looking.
            </p>
          )}

          {preview !== null && preview.length > 0 && <AnnouncementsBanner items={preview} />}
        </div>
      </section>

      {/* ── Write one ───────────────────────────────────────────────────────────────────────── */}
      <section style={U.card}>
        <h2 style={T.h2}>Say something in our own words</h2>
        <p style={T.small}>
          For what a machine cannot write. Keep it to what changed and what it means for him. No em
          dashes, no en dashes, the house style is enforced on the way in.
        </p>

        {/* Every field carries a real label and an id, not just a placeholder. A placeholder
            disappears the moment you type into it and a screen reader may never announce it at all,
            which is why test/labels.test.mjs fails the build over it. It caught this page. */}
        <div style={{ marginTop: 14, display: 'grid', gap: 10, maxWidth: 560 }}>
          <div>
            <label htmlFor="ann-title" style={S.label}>Headline</label>
            <input
              id="ann-title"
              aria-label="Headline"
              style={S.input}
              placeholder="For example: you can now upload receipts from the web"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ann-body" style={S.label}>Body, optional</label>
            <textarea
              id="ann-body"
              aria-label="Body"
              style={{ ...S.input, minHeight: 76, resize: 'vertical' }}
              placeholder="A line or two."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div style={{ ...T.small, color: body.length > MAX_BODY ? C.red : C.muted }}>
              {body.length} of {MAX_BODY} characters.
              {body.length > MAX_BODY ? ' Too long, it will be refused. Shorten it.' : ''}
            </div>
          </div>

          <div>
            <label htmlFor="ann-source" style={S.label}>Source link, optional</label>
            <input
              id="ann-source"
              aria-label="Source link"
              style={S.input}
              placeholder="https only. Optional for a product note, required if you state a rule."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="ann-item" style={S.label}>Knowledge item id, optional</label>
            <input
              id="ann-item"
              aria-label="Knowledge item id"
              style={S.input}
              placeholder="Set this if it is your plainer wording of an approved finding."
              value={knowledgeItemId}
              onChange={(e) => setKnowledgeItemId(e.target.value)}
            />
          </div>
          {err && <p style={{ ...T.small, color: C.red }}>{err}</p>}
          <button type="button" style={S.btn} onClick={publish} disabled={busy}>
            {busy ? 'Publishing.' : 'Publish to every customer'}
          </button>
          <p style={T.small}>
            Your name and the time go on it, the same as approving a finding. Taking one down retires
            it, it is never deleted: a thing we said is a thing we said.
          </p>
        </div>
      </section>

      {/* ── Everything published ────────────────────────────────────────────────────────────── */}
      <section style={U.card}>
        <h2 style={T.h2}>Published</h2>
        {rows === null && <p style={T.small}>Reading.</p>}
        {rows !== null && rows.length === 0 && <p style={T.small}>Nothing written yet.</p>}
        {rows !== null && rows.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {rows.map((r) => (
              <div key={r.id} style={S.row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...T.body, fontWeight: 700 }}>{r.title}</div>
                  {r.body && <div style={{ ...T.small, marginTop: 3 }}>{r.body}</div>}
                  <div style={{ ...T.small, marginTop: 5, color: C.faint }}>
                    {r.created_by || 'unattributed'}
                    {r.published_at ? ` · ${new Date(r.published_at).toLocaleDateString('en-GB')}` : ''}
                    {r.knowledge_item_id ? ' · rewords an approved finding' : ''}
                  </div>
                </div>
                <span style={r.live ? S.pillLive : S.pillOff}>{r.live ? 'Live' : 'Retired'}</span>
                {r.live && (
                  <button type="button" style={S.retire} onClick={() => retire(r.id)}>Retire</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function explain(j: { error?: string; max?: number; was?: number }): string {
  switch (j.error) {
    case 'no_title': return 'Give it a headline.';
    case 'title_too_long': return 'The headline is over 120 characters. Shorten it.';
    case 'body_too_long': return `The body is ${j.was} characters and the limit is ${j.max}. It would have been published and shown to nobody, so it is refused instead.`;
    case 'bad_source_link': return 'The source link must be a full https address.';
    case 'bad_expiry': return 'That expiry date could not be read.';
    case 'house_style': return 'That still contains a dash. Use a full stop or a comma.';
    case 'write_failed': return 'The write did not land. Nothing was published.';
    default: return 'Could not publish that. Check the fields and try again.';
  }
}

const S: Record<string, React.CSSProperties> = {
  label: {
    display: 'block', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3,
    color: C.muted, marginBottom: 5,
  },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 14.5,
    border: `1.5px solid ${C.line}`, borderRadius: 10, color: C.ink, outline: 'none', background: '#fff',
  },
  btn: {
    padding: '12px 16px', fontSize: 14.5, fontWeight: 700, color: '#fff', background: C.river,
    border: 'none', borderRadius: 10, cursor: 'pointer', justifySelf: 'start',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff',
  },
  pillLive: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
    color: C.green, background: C.greenTint, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap',
  },
  pillOff: {
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
    color: C.faint, background: C.lineSoft, padding: '4px 9px', borderRadius: 999, whiteSpace: 'nowrap',
  },
  retire: {
    fontSize: 12.5, fontWeight: 700, color: C.muted, background: 'transparent',
    border: `1px solid ${C.line}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
  },
};
