'use client';

// HOKA — the CMO's desk, and the home the retired content studio's job moved into: the make loop
// (idea -> draft -> your approval -> live -> measured), the ideas bank, and the scoreboard, now framed
// as what an employee DOES rather than a portal you visit. He drafts on the smart model, you approve,
// and nothing is ever posted without your yes. The posting itself (the social accounts) is the one part
// still to wire — until then this is the brain: ideas in, drafted content out, waiting on your call.
//
// All data comes from the studio backend that already existed (/api/team/studio/*). No customer money
// is ever shown here: a storyboard is our own creative, a source_tag our own label.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';
import {
  FORMAT_LABEL, PROMISE_LABEL, STATE_LABEL,
  type Idea, type Asset, type Format, type Promise3, type ScoreRow,
} from '../../../lib/studio';

const FORMATS: Format[] = ['video', 'carousel', 'tip'];
const PROMISES: Promise3[] = ['money', 'zero_habit', 'honesty'];

interface Overview { ideas: Idea[]; assets: Asset[]; scoreboard: ScoreRow[]; hasMetrics: boolean }
type NewIdea = { title: string; trade: string; format: Format; promise: Promise3 };

export default function HokaPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<NewIdea>({ title: '', trade: '', format: 'video', promise: 'money' });

  const token = useCallback(async () => {
    const { data: s } = await browserSupabase.auth.getSession();
    return s.session?.access_token ?? null;
  }, []);

  const pull = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch('/api/team/studio/overview', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) setData((await res.json()) as Overview);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await pull(); })();
    const id = setInterval(pull, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [pull]);

  async function mutate(key: string, body: Record<string, unknown>, ok?: string) {
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setErr(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [key]: false })); return; }
    try {
      const res = await fetch('/api/team/studio/mutate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) { if (ok) setNote(ok); await pull(); }
      else setErr(j.error || 'That did not go through.');
    } catch {
      setErr('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  const assets = data?.assets ?? [];
  const awaiting = useMemo(() => assets.filter((a) => a.state === 'awaiting_approval'), [assets]);
  const inWorks = useMemo(() => assets.filter((a) => a.state === 'scripting' || a.state === 'scheduled'), [assets]);
  const ideas = useMemo(() => (data?.ideas ?? []).filter((i) => i.status === 'open'), [data]);
  const score = data?.scoreboard ?? [];

  return (
    <TeamShell title="Hoka · Marketing">
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...T.h2, margin: 0 }}>Hoka</h2>
          <span style={{ ...T.small, color: C.muted }}>CMO · the make loop</span>
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          Ideas in, drafted content out, waiting on your call. Hoka writes on the smart model; you approve,
          and nothing is posted without your yes.
        </p>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          The social accounts and the posting are the one part still to wire — until then an approved piece
          waits, ready, rather than going out on its own.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {note ? <span style={{ ...T.small, color: C.green }}>{note}</span> : null}
          {err ? <span style={{ ...T.small, color: C.red }}>{err}</span> : null}
        </div>
      </section>

      {/* NEEDS YOUR APPROVAL */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Needs your approval</h2>
          <span style={U.sectionNote}>{awaiting.length} waiting</span>
        </div>
        {awaiting.length === 0 ? (
          <div style={U.honest}>
            {!loaded ? 'Reading the studio…' : 'Nothing waiting. Draft an idea below and it lands here for your yes.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {awaiting.map((a) => (
              <div key={a.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15.5, fontWeight: 800, color: C.ink }}>{a.title}</span>
                  <span style={chip}>{FORMAT_LABEL[a.format]}</span>
                  <span style={chip}>{PROMISE_LABEL[a.promise]}</span>
                </div>
                {a.caption ? <p style={{ ...T.small, color: C.ink2, margin: '10px 0 0' }}>{a.caption}</p> : null}
                {a.storyboard?.length ? (
                  <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                    {a.storyboard.slice(0, 6).map((f) => (
                      <div key={f.n} style={frame}>
                        <span style={{ ...T.tiny, color: C.faint, fontWeight: 800 }}>{f.n}.</span>
                        <span style={{ ...T.tiny, color: C.ink2 }}><b>{f.visual}</b>{f.caption ? ` — ${f.caption}` : ''}{f.vo ? ` · “${f.vo}”` : ''}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'approve' }, 'Approved — it will schedule once posting is wired.')} style={{ ...btn, ...btnDark }}>{busy[a.id] ? 'Working…' : 'Approve'}</button>
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'changes' }, 'Sent back for changes.')} style={{ ...btn, ...btnGhost }}>Ask for changes</button>
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'reject' }, 'Rejected.')} style={{ ...btn, ...btnGhost, color: C.red, marginLeft: 'auto' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* IDEAS BANK */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Ideas</h2>
          <span style={U.sectionNote}>{ideas.length} open</span>
        </div>
        <div style={card}>
          <div style={{ ...T.tiny, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 8 }}>Add an idea</div>
          <input value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="The hook, in a line — e.g. “The £2,000 most sparkies never claim”" aria-label="Idea title" style={input} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input value={adding.trade} onChange={(e) => setAdding({ ...adding, trade: e.target.value })} placeholder="Trade (optional)" aria-label="Trade" style={{ ...input, flex: '1 1 140px' }} />
            <select value={adding.format} onChange={(e) => setAdding({ ...adding, format: e.target.value as Format })} aria-label="Format" style={sel}>
              {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
            </select>
            <select value={adding.promise} onChange={(e) => setAdding({ ...adding, promise: e.target.value as Promise3 })} aria-label="Promise" style={sel}>
              {PROMISES.map((p) => <option key={p} value={p}>{PROMISE_LABEL[p]}</option>)}
            </select>
            <button
              disabled={busy.__add || !adding.title.trim()}
              onClick={() => mutate('__add', { action: 'add_idea', ...adding }, 'Idea added.').then(() => setAdding({ title: '', trade: '', format: adding.format, promise: adding.promise }))}
              style={{ ...btn, ...btnDark, opacity: busy.__add || !adding.title.trim() ? 0.5 : 1 }}
            >{busy.__add ? 'Adding…' : 'Add'}</button>
          </div>
        </div>

        {ideas.length > 0 ? (
          <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            {ideas.map((i) => (
              <div key={i.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{i.title}</div>
                  <div style={{ ...T.tiny, color: C.faint, marginTop: 3 }}>
                    {FORMAT_LABEL[i.format]} · {PROMISE_LABEL[i.promise]}{i.trade ? ` · ${i.trade}` : ''}{i.votes ? ` · ${i.votes} vote${i.votes === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <button disabled={busy[`v${i.id}`]} onClick={() => mutate(`v${i.id}`, { action: 'vote_idea', id: i.id })} style={{ ...btn, ...btnGhost }}>▲ Vote</button>
                <button disabled={busy[`d${i.id}`]} onClick={() => mutate(`d${i.id}`, { action: 'draft', id: i.id }, 'Hoka drafted it — see Needs your approval.')} style={{ ...btn, ...btnDark }}>{busy[`d${i.id}`] ? 'Drafting…' : 'Draft with AI'}</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* IN THE WORKS + LIVE */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>In the works & live</h2>
          <span style={U.sectionNote}>{inWorks.length + score.length} pieces</span>
        </div>
        {inWorks.length === 0 && score.length === 0 ? (
          <div style={U.honest}>Nothing scripting or live yet. Approved pieces will queue here once posting is wired.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {inWorks.map((a) => (
              <div key={a.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0 }}>{a.title}</span>
                <span style={chip}>{STATE_LABEL[a.state]}</span>
              </div>
            ))}
            {score.map((s) => (
              <div key={s.asset.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, flex: 1, minWidth: 0 }}>{s.asset.title}</span>
                <span style={{ ...T.tiny, color: C.faint }}>{s.realTrials} trials · {s.realPaying} paying from this</span>
                <span style={chip}>{STATE_LABEL[s.asset.state]}</span>
              </div>
            ))}
          </div>
        )}
        {!data?.hasMetrics && score.length === 0 ? (
          <p style={{ ...T.tiny, color: C.faint, marginTop: 10 }}>
            The scoreboard reads zero until posts are live and their link carries a tag. That is honest, not broken.
          </p>
        ) : null}
      </section>
    </TeamShell>
  );
}

const card: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: '0 1px 2px rgba(17,17,17,.03)' };
const chip: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: '3px 9px' };
const frame: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline' };
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 14, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', background: '#fff' };
const sel: React.CSSProperties = { fontSize: 13, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', background: '#fff' };
const btn: React.CSSProperties = { fontSize: 12.5, fontWeight: 750, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', border: '1px solid transparent' };
const btnDark: React.CSSProperties = { background: C.ink, color: '#fff' };
const btnGhost: React.CSSProperties = { background: '#fff', color: C.muted, borderColor: C.line };
