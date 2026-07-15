'use client';

// THE CONTENT STUDIO SCREEN. A section of the team console (docs 110, 111, 112).
//
// It reuses the console's design system (../ui) and its exact auth posture: you must be signed in on
// the team console, and the server re-checks team_members on every request. This page never asks for
// a password of its own and never shows a customer's data. What it shows is our own marketing work:
// ideas, the make loop board, the storyboard you approve, and the scoreboard of what worked.
//
// THE STORYBOARD IS THE POINT. In this phase we have no generation connector, so the cheapest and
// most honest thing to review is the storyboard: scene by scene, before a single credit is spent.
// Approving it is the gate.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S, FONT, shortDate, gbp } from '../ui';
import {
  STATES, STATE_LABEL, FORMAT_LABEL, PROMISE_LABEL, PLATFORM_LABEL,
  nextState, isPublishGate,
  type Idea, type Asset, type Approval, type Metric, type ScoreRow,
  type Format, type Promise3, type Platform,
} from '../../../lib/studio';

interface Overview {
  me: { email: string; name: string | null; role: string };
  ideas: Idea[];
  assets: Asset[];
  scoreboard: ScoreRow[];
  hasMetrics: boolean;
}
interface Detail {
  asset: Asset;
  approvals: Approval[];
  metrics: Metric[];
}

const FORMAT_KEYS = Object.keys(FORMAT_LABEL) as Format[];
const PROMISE_KEYS = Object.keys(PROMISE_LABEL) as Promise3[];
const PLATFORM_KEYS = Object.keys(PLATFORM_LABEL) as Platform[];

async function token(): Promise<string | null> {
  const { data } = await browserSupabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function StudioPage() {
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'ideas' | 'board' | 'scoreboard'>('board');
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const t = await token();
    if (!t) { setError('signin'); setReady(true); return; }
    const res = await fetch('/api/team/studio/overview', { headers: { Authorization: `Bearer ${t}` } });
    if (res.status === 401 || res.status === 403) { setError('signin'); setReady(true); return; }
    if (!res.ok) { setError('unreadable'); setReady(true); return; }
    setData((await res.json()) as Overview);
    setError(null);
    setReady(true);
  }

  useEffect(() => { load(); }, []);

  async function mutate(bodyObj: Record<string, unknown>): Promise<boolean> {
    const t = await token();
    if (!t) return false;
    const res = await fetch('/api/team/studio/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(bodyObj),
    });
    return res.ok;
  }

  if (!ready) {
    return <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}><span style={T.small}>Loading the studio.</span></div>;
  }

  if (error === 'signin') {
    return (
      <div style={{ ...S.page, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...S.panel, maxWidth: 420, textAlign: 'center' }}>
          <h1 style={T.h2}>Sign in on the console first</h1>
          <p style={{ ...T.small, marginTop: 10 }}>
            The Studio uses your team login. Open the team console, sign in, then come back here.
          </p>
          <a href="/team" style={{ ...S.chip, ...S.chipOn, display: 'inline-block', marginTop: 16, textDecoration: 'none' }}>Go to the console</a>
        </div>
      </div>
    );
  }

  const me = data?.me;
  const isOwner = me?.role === 'owner';
  const assets = data?.assets ?? [];
  const ideas = data?.ideas ?? [];
  const scoreboard = data?.scoreboard ?? [];
  const empty = assets.length === 0 && ideas.length === 0;

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={S.accent} />
            <span style={S.wordmark}>Lekhio Studio</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={S.headerRole}>{me?.name || me?.email} {isOwner ? '· owner' : '· member'}</span>
            <a href="/team" style={{ ...S.headerBtn, textDecoration: 'none' }}>Console</a>
          </div>
        </div>
      </header>

      <main style={S.main}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={T.h1}>The Content Studio</h1>
          <span style={S.sectionNote}>Ideas, the make loop, the storyboard you approve, and what worked. Nothing here spends or posts on its own.</span>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          {(['board', 'ideas', 'scoreboard'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{ ...S.chip, ...(tab === k ? S.chipOn : {}) }}
            >
              {k === 'board' ? 'Pipeline' : k === 'ideas' ? `Ideas (${ideas.length})` : 'Scoreboard'}
            </button>
          ))}
        </div>

        {empty && (
          <div style={{ ...S.honest, marginTop: 22 }}>
            The studio is empty. {isOwner
              ? 'Seed it with the bible content to see the storyboards you can review.'
              : 'Ask the owner to seed the bible content.'}
            {isOwner && (
              <div style={{ marginTop: 12 }}>
                <button
                  style={{ ...S.chip, ...S.chipOn }}
                  onClick={async () => { if (await mutate({ action: 'seed' })) load(); }}
                >
                  Seed the bible content
                </button>
              </div>
            )}
          </div>
        )}

        {!empty && tab === 'board' && (
          <Board assets={assets} onOpen={setOpenId} />
        )}
        {!empty && tab === 'ideas' && (
          <Ideas ideas={ideas} onAdd={async (b) => { if (await mutate({ action: 'add_idea', ...b })) load(); }} onVote={async (id) => { if (await mutate({ action: 'vote_idea', id })) load(); }} />
        )}
        {!empty && tab === 'scoreboard' && (
          <Scoreboard rows={scoreboard} hasMetrics={data?.hasMetrics ?? false} onOpen={setOpenId} />
        )}
      </main>

      {openId && (
        <AssetDrawer
          id={openId}
          isOwner={!!isOwner}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); }}
          mutate={mutate}
        />
      )}
    </div>
  );
}

// --- the board ---------------------------------------------------------------------------------

function Board({ assets, onOpen }: { assets: Asset[]; onOpen: (id: string) => void }) {
  return (
    <div style={{ ...S.section, display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
      {STATES.map((st) => {
        const col = assets.filter((a) => a.state === st);
        const gate = st === 'awaiting_approval';
        return (
          <div key={st} style={{ flex: '0 0 240px', minWidth: 240 }}>
            <div style={{ ...T.label, marginBottom: 10, color: gate ? C.amber : C.faint }}>
              {STATE_LABEL[st]} · {col.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.map((a) => (
                <button
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  style={{
                    ...S.panel, padding: 14, textAlign: 'left', cursor: 'pointer',
                    borderColor: gate ? '#F0D8B0' : C.line, background: gate ? C.amberTint : C.panel,
                  }}
                >
                  <div style={{ ...T.small, color: C.ink, fontWeight: 700, lineHeight: 1.35 }}>{a.title}</div>
                  <div style={{ ...T.tiny, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={tag()}>{FORMAT_LABEL[a.format]}</span>
                    {a.trade && <span style={tag()}>{a.trade}</span>}
                    <span style={tag()}>{a.storyboard.length} frames</span>
                  </div>
                </button>
              ))}
              {col.length === 0 && <div style={{ ...T.tiny, color: C.faint }}>Nothing here.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- ideas -------------------------------------------------------------------------------------

function Ideas({
  ideas, onAdd, onVote,
}: {
  ideas: Idea[];
  onAdd: (b: { title: string; trade: string | null; format: Format; promise: Promise3; note: string | null }) => void;
  onVote: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [trade, setTrade] = useState('');
  const [format, setFormat] = useState<Format>('video');
  const [promise, setPromise] = useState<Promise3>('money');
  const [note, setNote] = useState('');

  return (
    <div style={S.section}>
      <div style={{ ...S.panel, marginBottom: 18 }}>
        <div style={T.label}>Add an idea</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <input aria-label="The idea, in a line" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The idea, in a line" style={input(240)} />
          <input aria-label="Trade (optional)" value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Trade (optional)" style={input(150)} />
          <select aria-label="Format" value={format} onChange={(e) => setFormat(e.target.value as Format)} style={input(130)}>
            {FORMAT_KEYS.map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
          <select aria-label="Promise" value={promise} onChange={(e) => setPromise(e.target.value as Promise3)} style={input(230)}>
            {PROMISE_KEYS.map((p) => <option key={p} value={p}>{PROMISE_LABEL[p]}</option>)}
          </select>
          <input aria-label="Idea note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={input(220)} />
          <button
            style={{ ...S.chip, ...S.chipOn, opacity: title.trim() ? 1 : 0.5 }}
            disabled={!title.trim()}
            onClick={() => { onAdd({ title: title.trim(), trade: trade.trim() || null, format, promise, note: note.trim() || null }); setTitle(''); setTrade(''); setNote(''); }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ideas.map((i) => (
          <div key={i.id} style={{ ...S.panel, display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
            <button onClick={() => onVote(i.id)} style={{ ...S.chip, minWidth: 54, textAlign: 'center' }}>▲ {i.votes}</button>
            <div style={{ flex: 1 }}>
              <div style={{ ...T.small, color: C.ink, fontWeight: 700 }}>{i.title}</div>
              <div style={{ ...T.tiny, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={tag()}>{FORMAT_LABEL[i.format]}</span>
                {i.trade && <span style={tag()}>{i.trade}</span>}
                <span style={tag()}>{PROMISE_LABEL[i.promise]}</span>
                {i.note && <span style={{ ...T.tiny, color: C.muted }}>{i.note}</span>}
              </div>
            </div>
          </div>
        ))}
        {ideas.length === 0 && <div style={S.honest}>No ideas yet. Add the first one above.</div>}
      </div>
    </div>
  );
}

// --- scoreboard --------------------------------------------------------------------------------

function Scoreboard({ rows, hasMetrics, onOpen }: { rows: ScoreRow[]; hasMetrics: boolean; onOpen: (id: string) => void }) {
  return (
    <div style={S.section}>
      {!hasMetrics && (
        <div style={{ ...S.honest, marginBottom: 16 }}>
          No numbers yet. The money columns stay at zero until posts are live and their link carries the tag. That is honest, not broken.
        </div>
      )}
      <div style={{ ...S.panel, overflowX: 'auto' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Post</th>
              <th style={S.th}>Reach</th>
              <th style={S.th}>Saves</th>
              <th style={S.th}>Shares</th>
              <th style={S.th}>Tool clicks</th>
              <th style={S.th}>Real trials</th>
              <th style={S.th}>Paying now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.asset.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(r.asset.id)}>
                <td style={S.td}>{r.asset.title}</td>
                <td style={S.td}>{r.totals.reach.toLocaleString('en-GB')}</td>
                <td style={S.td}>{r.totals.saves.toLocaleString('en-GB')}</td>
                <td style={S.td}>{r.totals.shares.toLocaleString('en-GB')}</td>
                <td style={S.td}>{r.totals.clicks.toLocaleString('en-GB')}</td>
                <td style={{ ...S.td, fontWeight: 700, color: C.river }}>{r.realTrials}</td>
                <td style={{ ...S.td, fontWeight: 700, color: C.green }}>{r.realPaying}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td style={S.td} colSpan={7}><span style={T.small}>Nothing live yet. Approve a storyboard, mark it live, then it shows here.</span></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- the asset drawer: the storyboard and the gate --------------------------------------------

function AssetDrawer({
  id, isOwner, onClose, onChanged, mutate,
}: {
  id: string;
  isOwner: boolean;
  onClose: () => void;
  onChanged: () => void;
  mutate: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function loadDetail() {
    const t = await token();
    if (!t) return;
    const res = await fetch(`/api/team/studio/asset?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) setDetail((await res.json()) as Detail);
  }
  useEffect(() => { loadDetail(); }, [id]);

  async function act(b: Record<string, unknown>) {
    setBusy(true);
    const ok = await mutate(b);
    setBusy(false);
    if (ok) { await loadDetail(); onChanged(); }
  }

  const a = detail?.asset;
  const nxt = a ? nextState(a.state) : null;
  const gateNow = a ? a.state === 'awaiting_approval' : false;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,16,0.42)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(760px, 96vw)', height: '100%', background: C.paper, overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.18)' }}>
        <div style={{ ...S.header, position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ ...S.headerInner, height: 56 }}>
            <span style={{ ...S.wordmark, fontSize: 15 }}>{a ? STATE_LABEL[a.state] : 'Loading'}</span>
            <button onClick={onClose} style={S.headerBtn}>Close</button>
          </div>
        </div>

        {!a && <div style={{ padding: 26 }}><span style={T.small}>Loading.</span></div>}

        {a && (
          <div style={{ padding: 26 }}>
            <h1 style={T.h1}>{a.title}</h1>
            <div style={{ ...T.tiny, marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={tag()}>{FORMAT_LABEL[a.format]}</span>
              {a.trade && <span style={tag()}>{a.trade}</span>}
              <span style={tag()}>{PROMISE_LABEL[a.promise]}</span>
              {a.source_tag && <span style={tag()}>{a.source_tag}</span>}
            </div>
            {a.scene && <p style={{ ...T.small, marginTop: 14, fontStyle: 'italic' }}>{a.scene}</p>}

            {/* THE STORYBOARD */}
            <div style={{ ...S.section, marginTop: 22 }}>
              <div style={T.label}>Storyboard · {a.storyboard.length} frames</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {a.storyboard.map((f) => (
                  <div key={f.n} style={{ ...S.panel, display: 'flex', gap: 14, padding: 14 }}>
                    <div style={{ flex: '0 0 34px', ...T.metric, fontSize: 22, color: C.faint }}>{f.n}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...T.tiny, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>We see</div>
                      <div style={{ ...T.small, color: C.ink2 }}>{f.visual}</div>
                      <div style={{ ...T.small, color: C.ink, fontWeight: 750, marginTop: 8 }}>{f.caption}</div>
                      {f.vo && <div style={{ ...T.small, color: C.river, marginTop: 6 }}>&ldquo;{f.vo}&rdquo;</div>}
                    </div>
                    {f.seconds ? <div style={{ ...T.tiny, color: C.faint, flex: '0 0 auto' }}>{f.seconds}s</div> : null}
                  </div>
                ))}
                {a.storyboard.length === 0 && <div style={S.honest}>No storyboard yet. This asset was created without frames.</div>}
              </div>
            </div>

            {a.caption && (
              <div style={{ ...S.section }}>
                <div style={T.label}>Caption</div>
                <p style={{ ...T.small, marginTop: 8 }}>{a.caption}</p>
              </div>
            )}

            {/* THE GATE */}
            {gateNow && (
              <div style={{ ...S.section }}>
                <div style={T.label}>The publish gate</div>
                {isOwner ? (
                  <div style={{ ...S.panel, marginTop: 10 }}>
                    <p style={{ ...T.small, marginBottom: 10 }}>Approve this storyboard to produce and schedule it. A rejection or a change request is recorded and the card stays here for a redraft.</p>
                    <input aria-label="Approval note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...input(320), marginBottom: 10 }} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button disabled={busy} style={{ ...S.chip, background: C.green, color: '#fff', borderColor: C.green }} onClick={() => act({ action: 'decide', id: a.id, kind: 'publish', decision: 'approve', note })}>Approve</button>
                      <button disabled={busy} style={{ ...S.chip }} onClick={() => act({ action: 'decide', id: a.id, kind: 'publish', decision: 'changes', note })}>Request changes</button>
                      <button disabled={busy} style={{ ...S.chip, color: C.red, borderColor: '#F0C8C2' }} onClick={() => act({ action: 'decide', id: a.id, kind: 'publish', decision: 'reject', note })}>Reject</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...S.honest, marginTop: 10 }}>This is waiting on the owner. Only Jag can approve a storyboard to go ahead.</div>
                )}
              </div>
            )}

            {/* MOVE THE CARD (non gate steps) */}
            {!gateNow && nxt && !isPublishGate(a.state, nxt) && (
              <div style={{ ...S.section }}>
                <button disabled={busy} style={{ ...S.chip, ...S.chipOn }} onClick={() => act({ action: 'advance', id: a.id, to: nxt })}>
                  Move to {STATE_LABEL[nxt]}
                </button>
              </div>
            )}

            {/* METRICS (once live) */}
            {(a.state === 'live' || a.state === 'measured') && (
              <MetricBox assetId={a.id} platforms={a.platforms} metrics={detail!.metrics} onAdd={act} busy={busy} />
            )}

            {/* APPROVAL HISTORY */}
            {detail!.approvals.length > 0 && (
              <div style={{ ...S.section }}>
                <div style={T.label}>Decision history</div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail!.approvals.map((ap) => (
                    <div key={ap.id} style={{ ...T.tiny }}>
                      <strong style={{ color: ap.decision === 'approve' ? C.green : ap.decision === 'reject' ? C.red : C.amber }}>{ap.decision}</strong>
                      {' '}({ap.kind}) by {ap.decided_by} on {shortDate(ap.created_at)}
                      {ap.spend_cap_pence ? ` · cap ${gbp(ap.spend_cap_pence)}` : ''}
                      {ap.note ? ` · ${ap.note}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({
  assetId, platforms, metrics, onAdd, busy,
}: {
  assetId: string;
  platforms: Platform[];
  metrics: Metric[];
  onAdd: (b: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const first = platforms[0] ?? 'tiktok';
  const [platform, setPlatform] = useState<Platform>(first);
  const [reach, setReach] = useState('');
  const [saves, setSaves] = useState('');
  const [shares, setShares] = useState('');
  const [clicks, setClicks] = useState('');

  const num = (s: string) => { const v = parseInt(s, 10); return Number.isFinite(v) && v >= 0 ? v : 0; };

  return (
    <div style={{ ...S.section }}>
      <div style={T.label}>Add numbers by hand (no connector yet)</div>
      <div style={{ ...S.panel, marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} style={input(130)}>
            {PLATFORM_KEYS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </select>
          <input aria-label="Reach" value={reach} onChange={(e) => setReach(e.target.value)} placeholder="Reach" style={input(90)} />
          <input aria-label="Saves" value={saves} onChange={(e) => setSaves(e.target.value)} placeholder="Saves" style={input(90)} />
          <input aria-label="Shares" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="Shares" style={input(90)} />
          <input aria-label="Clicks" value={clicks} onChange={(e) => setClicks(e.target.value)} placeholder="Clicks" style={input(90)} />
          <button
            disabled={busy}
            style={{ ...S.chip, ...S.chipOn }}
            onClick={() => onAdd({ action: 'add_metric', id: assetId, platform, reach: num(reach), saves: num(saves), shares: num(shares), clicks: num(clicks) })}
          >
            Save
          </button>
        </div>
        {metrics.length > 0 && (
          <div style={{ marginTop: 12, ...T.tiny, color: C.muted }}>
            {metrics.length} entr{metrics.length === 1 ? 'y' : 'ies'} recorded.
          </div>
        )}
      </div>
    </div>
  );
}

// --- little shared styles ----------------------------------------------------------------------

function tag(): React.CSSProperties {
  return {
    padding: '3px 8px', borderRadius: 999, border: `1px solid ${C.line}`,
    background: C.panel, fontSize: 11, fontWeight: 650, color: C.ink2,
  };
}
function input(width: number): React.CSSProperties {
  return {
    width, padding: '8px 11px', borderRadius: 9, border: `1px solid ${C.line}`,
    fontSize: 13, fontFamily: FONT, color: C.ink, background: C.panel,
  };
}
