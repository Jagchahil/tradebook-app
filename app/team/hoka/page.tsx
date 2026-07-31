'use client';

// HOKA — the CMO's desk. Marketing, made by hand.
//
// 🔴 31 JULY 2026: THE IDEAS BANK AND EVERY AI DRAFTING PATH WERE REMOVED. What used to sit here was
// an ideas backlog you fed, a "Draft with AI" button, a nightly bot that drained the backlog into
// storyboards, a brief route that composed a whole slate, and a render queue that turned the winners
// into video. All of it is gone. Jag writes the marketing himself, so this page is now three honest
// jobs and nothing else:
//
//   1. THE ACCOUNTS. Which social platforms are actually connected, and the one button that connects
//      the next one. This moved here from Mistri's desk on the same day, because the accounts a
//      marketer posts from belong on the marketer's page.
//   2. THE WORK. A piece you wrote, moving forward one step at a time: written -> your approval ->
//      booked in -> live. Nothing writes a word for you and nothing posts without your yes.
//   3. THE SCOREBOARD. What a piece actually brought in, read off our own records by its tag.
//
// All data comes from the studio backend that already existed (/api/team/studio/*) plus the connector
// board (/api/team/connectors). No customer money is ever shown here: a storyboard is our own
// creative, a source_tag our own label, and the only figure is an aggregate count of arrivals.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U, shortDate } from '../ui';
import TeamShell from '../TeamShell';
import {
  FORMAT_LABEL, PROMISE_LABEL, STATE_LABEL, PLATFORM_LABEL,
  type Asset, type Format, type Promise3, type ScoreRow,
} from '../../../lib/studio';

const FORMATS: Format[] = ['video', 'carousel', 'tip'];
const PROMISES: Promise3[] = ['money', 'zero_habit', 'honesty'];

// The five OAuth connectors, in the order they are worth having. These are ACCOUNT names, which is a
// different vocabulary from the content platforms above: one Meta connection covers Facebook and
// Instagram, one Google connection covers YouTube.
const CONNECTOR_LABEL: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  linkedin: 'LinkedIn',
  twitter: 'X',
};
const CONNECTOR_COVERS: Record<string, string> = {
  meta: 'Facebook and Instagram',
  tiktok: 'TikTok',
  google: 'YouTube and Google Ads',
  linkedin: 'the Lekhio company page',
  twitter: 'X',
};

interface CalendarRow {
  asset_id: string;
  title: string;
  format: Format;
  scheduled_for: string | null;
  platforms: string[];
  captions: Record<string, string>;
}
interface Overview { assets: Asset[]; scoreboard: ScoreRow[]; calendar: CalendarRow[]; hasMetrics: boolean }
interface ConnRow { platform: string; configured: boolean; connected: boolean; connected_by: string | null; expires_at: string | null }
type NewPiece = { title: string; trade: string; format: Format; promise: Promise3; caption: string; source_tag: string };

const BLANK: NewPiece = { title: '', trade: '', format: 'video', promise: 'money', caption: '', source_tag: '' };

export default function HokaPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState<NewPiece>(BLANK);
  const [links, setLinks] = useState<Record<string, string>>({});

  const [conns, setConns] = useState<ConnRow[]>([]);
  const [connEnabled, setConnEnabled] = useState(false);
  const [connOwner, setConnOwner] = useState(false);
  const [connLoaded, setConnLoaded] = useState(false);

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

  const pullConns = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch('/api/team/connectors', { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) return;
      const j = (await res.json()) as { enabled?: boolean; isOwner?: boolean; platforms?: ConnRow[] };
      setConnEnabled(!!j.enabled);
      setConnOwner(!!j.isOwner);
      setConns(j.platforms ?? []);
    } finally {
      setConnLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) { await pull(); await pullConns(); } })();
    const id = setInterval(pull, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [pull, pullConns]);

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

  // Connecting is a redirect, not a mutation: we ask the server for the authorize URL and go there.
  async function connect(platform: string) {
    setErr(null); setNote(null);
    const tok = await token();
    if (!tok) return;
    const res = await fetch(`/api/connectors/${platform}/start`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(j.error === 'connectors disabled'
        ? 'The connector layer is switched off. Set CONNECTORS_ENABLED on Vercel first.'
        : j.error === 'not configured'
          ? `${CONNECTOR_LABEL[platform] || platform} has no keys set on Vercel yet.`
          : j.error || 'Could not start that connection.');
      return;
    }
    const j = (await res.json()) as { url?: string };
    // Navigating away, not mutating a captured value. The rule cannot tell the difference.
    // eslint-disable-next-line react-hooks/immutability
    if (j.url) window.location.href = j.url;
  }

  const assets = data?.assets ?? [];
  const writing = useMemo(() => assets.filter((a) => a.state === 'scripting'), [assets]);
  const awaiting = useMemo(() => assets.filter((a) => a.state === 'awaiting_approval'), [assets]);
  const booked = data?.calendar ?? [];
  const bookedAssets = useMemo(() => assets.filter((a) => a.state === 'scheduled'), [assets]);
  const score = data?.scoreboard ?? [];
  const connectedCount = conns.filter((c) => c.connected).length;

  return (
    <TeamShell title="Hoka · Marketing">
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...T.h2, margin: 0 }}>Hoka</h2>
          <span style={{ ...T.small, color: C.muted }}>CMO · the accounts, and the work</span>
        </div>
        <p style={{ ...T.body, marginTop: 12, marginBottom: 0 }}>
          You write it, you approve it, it goes out. Nothing on this page writes a word of copy and
          nothing posts without your yes.
        </p>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {note ? <span style={{ ...T.small, color: C.green }}>{note}</span> : null}
          {err ? <span style={{ ...T.small, color: C.red }}>{err}</span> : null}
        </div>
      </section>

      {/* THE ACCOUNTS */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>The accounts</h2>
          <span style={U.sectionNote}>
            {!connLoaded ? 'reading…' : `${connectedCount} of ${conns.length} connected`}
          </span>
        </div>

        {connLoaded && !connEnabled ? (
          <div style={{ ...U.honest, marginBottom: 14 }}>
            The connector layer is switched off, so Connect will refuse. Set <b>CONNECTORS_ENABLED=true</b> on
            Vercel and redeploy, then come back here.
          </div>
        ) : null}

        {!connLoaded ? (
          <div style={U.honest}>Reading the connections…</div>
        ) : conns.length === 0 ? (
          <div style={U.honest}>No connectors are compiled in. That should not happen; tell Mistri.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {conns.map((c) => {
              const label = CONNECTOR_LABEL[c.platform] || c.platform;
              const tone = c.connected ? C.green : c.configured ? C.amber : C.faint;
              const word = c.connected ? 'Connected' : c.configured ? 'Keys in, not connected' : 'No keys yet';
              return (
                <div key={c.platform} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ ...U.dot, background: tone }} aria-hidden="true" />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 750, color: C.ink }}>{label}</div>
                    <div style={{ ...T.tiny, color: C.faint, marginTop: 3 }}>
                      {word} · covers {CONNECTOR_COVERS[c.platform] || label}
                      {c.connected && c.connected_by ? ` · by ${c.connected_by}` : ''}
                      {c.connected && c.expires_at ? ` · expires ${shortDate(c.expires_at)}` : ''}
                    </div>
                  </div>
                  {connOwner ? (
                    <button
                      onClick={() => connect(c.platform)}
                      disabled={!c.configured}
                      title={c.configured ? '' : 'The keys for this platform are not on Vercel yet.'}
                      style={{ ...btn, ...(c.connected ? btnGhost : btnDark), opacity: c.configured ? 1 : 0.45, cursor: c.configured ? 'pointer' : 'not-allowed' }}
                    >
                      {c.connected ? 'Reconnect' : 'Connect'}
                    </button>
                  ) : (
                    <span style={{ ...T.tiny, color: C.faint }}>Owner connects this</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p style={{ ...T.tiny, color: C.faint, marginTop: 10 }}>
          Connecting an account here does not switch posting on. Posting is a separate act and it still
          runs through you.
        </p>
      </section>

      {/* WRITE A PIECE */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Write a piece</h2>
          <span style={U.sectionNote}>yours, not a machine&rsquo;s</span>
        </div>
        <div style={card}>
          <input value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="What is it? e.g. “The £2,000 most sparkies never claim”" aria-label="Title" style={input} />
          <input value={adding.caption} onChange={(e) => setAdding({ ...adding, caption: e.target.value })} placeholder="The caption, in your words (optional)" aria-label="Caption" style={{ ...input, marginTop: 8 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input value={adding.trade} onChange={(e) => setAdding({ ...adding, trade: e.target.value })} placeholder="Trade (optional)" aria-label="Trade" style={{ ...input, flex: '1 1 130px' }} />
            <input value={adding.source_tag} onChange={(e) => setAdding({ ...adding, source_tag: e.target.value })} placeholder="Tag, for the scoreboard" aria-label="Source tag" style={{ ...input, flex: '1 1 160px' }} />
            <select value={adding.format} onChange={(e) => setAdding({ ...adding, format: e.target.value as Format })} aria-label="Format" style={sel}>
              {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
            </select>
            <select value={adding.promise} onChange={(e) => setAdding({ ...adding, promise: e.target.value as Promise3 })} aria-label="Promise" style={sel}>
              {PROMISES.map((p) => <option key={p} value={p}>{PROMISE_LABEL[p]}</option>)}
            </select>
            <button
              disabled={busy.__add || !adding.title.trim()}
              onClick={() => mutate('__add', {
                action: 'create_asset',
                title: adding.title,
                trade: adding.trade,
                format: adding.format,
                promise: adding.promise,
                caption: adding.caption,
                source_tag: adding.source_tag,
              }, 'Added. It is in Being written below.').then(() => setAdding({ ...BLANK, format: adding.format, promise: adding.promise }))}
              style={{ ...btn, ...btnDark, opacity: busy.__add || !adding.title.trim() ? 0.5 : 1 }}
            >{busy.__add ? 'Adding…' : 'Add'}</button>
          </div>
          <p style={{ ...T.tiny, color: C.faint, marginTop: 10, marginBottom: 0 }}>
            The tag is how the scoreboard finds it later. Put the same string on the link you post.
          </p>
        </div>
      </section>

      {/* BEING WRITTEN */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Being written</h2>
          <span style={U.sectionNote}>{writing.length} on the go</span>
        </div>
        {writing.length === 0 ? (
          <div style={U.honest}>{!loaded ? 'Reading…' : 'Nothing being written. Add one above.'}</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {writing.map((a) => (
              <div key={a.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 750, color: C.ink }}>{a.title}</div>
                  <div style={{ ...T.tiny, color: C.faint, marginTop: 3 }}>
                    {FORMAT_LABEL[a.format]} · {PROMISE_LABEL[a.promise]}{a.trade ? ` · ${a.trade}` : ''}
                  </div>
                </div>
                <button
                  disabled={busy[`r${a.id}`]}
                  onClick={() => mutate(`r${a.id}`, { action: 'advance', id: a.id, to: 'awaiting_approval' }, 'Moved to your approval.')}
                  style={{ ...btn, ...btnDark }}
                >{busy[`r${a.id}`] ? 'Moving…' : 'Ready for your yes'}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* NEEDS YOUR APPROVAL */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Needs your approval</h2>
          <span style={U.sectionNote}>{awaiting.length} waiting</span>
        </div>
        {awaiting.length === 0 ? (
          <div style={U.honest}>
            {!loaded ? 'Reading…' : 'Nothing waiting on you.'}
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
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'approve' }, 'Approved and booked a slot.')} style={{ ...btn, ...btnDark }}>{busy[a.id] ? 'Working…' : 'Approve'}</button>
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'changes' }, 'Sent back for changes.')} style={{ ...btn, ...btnGhost }}>Needs changes</button>
                  <button disabled={busy[a.id]} onClick={() => mutate(a.id, { action: 'decide', id: a.id, kind: 'publish', decision: 'reject' }, 'Rejected.')} style={{ ...btn, ...btnGhost, color: C.red, marginLeft: 'auto' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BOOKED IN */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Booked in</h2>
          <span style={U.sectionNote}>{booked.length} with a slot</span>
        </div>
        {booked.length === 0 ? (
          <div style={U.honest}>Nothing booked. Approving a piece gives it the next free slot.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {booked.map((b) => {
              const a = bookedAssets.find((x) => x.id === b.asset_id);
              return (
                <div key={b.asset_id} style={card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 750, color: C.ink, flex: 1, minWidth: 160 }}>{b.title}</span>
                    <span style={chip}>{shortDate(b.scheduled_for)}</span>
                    {(b.platforms || []).map((p) => (
                      <span key={p} style={chip}>{PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] || p}</span>
                    ))}
                  </div>
                  {a?.file_url ? (
                    <p style={{ ...T.tiny, color: C.green, margin: '10px 0 0' }}>
                      File attached. <a href={a.file_url} target="_blank" rel="noreferrer" style={{ color: C.river }}>Open it</a>
                    </p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <input
                        value={links[b.asset_id] ?? ''}
                        onChange={(e) => setLinks({ ...links, [b.asset_id]: e.target.value })}
                        placeholder="Paste the link to the file you made (https)"
                        aria-label="File link"
                        style={{ ...input, flex: '1 1 240px' }}
                      />
                      <button
                        disabled={busy[`m${b.asset_id}`] || !(links[b.asset_id] || '').trim()}
                        onClick={() => mutate(`m${b.asset_id}`, { action: 'set_media', id: b.asset_id, file_url: links[b.asset_id] }, 'File attached.')}
                        style={{ ...btn, ...btnGhost }}
                      >Attach</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ ...T.tiny, color: C.faint, flex: 1, minWidth: 160 }}>
                      Post it yourself, then mark it live so the scoreboard starts watching.
                    </span>
                    <button
                      disabled={busy[`l${b.asset_id}`]}
                      onClick={() => mutate(`l${b.asset_id}`, { action: 'advance', id: b.asset_id, to: 'live' }, 'Marked live.')}
                      style={{ ...btn, ...btnDark }}
                    >{busy[`l${b.asset_id}`] ? 'Working…' : 'It is posted'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* LIVE + SCOREBOARD */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Live</h2>
          <span style={U.sectionNote}>{score.length} out there</span>
        </div>
        {score.length === 0 ? (
          <div style={U.honest}>Nothing live yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {score.map((s) => (
              <div key={s.asset.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, flex: 1, minWidth: 160 }}>{s.asset.title}</span>
                <span style={{ ...T.tiny, color: C.faint }}>{s.realTrials} trials · {s.realPaying} paying from this</span>
                <span style={chip}>{STATE_LABEL[s.asset.state]}</span>
              </div>
            ))}
          </div>
        )}
        {!data?.hasMetrics && score.length === 0 ? (
          <p style={{ ...T.tiny, color: C.faint, marginTop: 10 }}>
            The scoreboard reads zero until posts are live and their link carries a tag. That is honest,
            not broken.
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
