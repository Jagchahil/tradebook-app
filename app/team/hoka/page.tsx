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

// A REAL customer testimonial, shown on the public homepage. Only a quote a customer actually said
// and agreed to. The founder holds the evidence and the permission off system; this desk holds who
// added it. See the header on /api/team/reviews and app/_shared/site.tsx for the rule and the law.
interface TReview {
  id: string;
  quote: string;
  name: string;
  trade: string;
  rating: number;
  source: string | null;
  published: boolean;
  created_by: string | null;
  created_at: string | null;
}
type NewReview = { quote: string; name: string; trade: string; rating: number; source: string };
const BLANK_REVIEW: NewReview = { quote: '', name: '', trade: '', rating: 5, source: '' };

// The route answers with a short code. Turn each into the thing to actually fix, the way the OAuth
// reasons above are turned into an instruction rather than a code to google.
function reviewError(code?: string): string {
  switch (code) {
    case 'no_quote': return 'Add the quote.';
    case 'no_name': return 'Add the name.';
    case 'no_trade': return 'Add the trade and place.';
    case 'bad_rating': return 'The rating has to be a whole number, 1 to 5.';
    case 'house_style': return 'No dashes. Use a full stop.';
    case 'quote_too_long': return 'That quote is too long.';
    case 'name_too_long': return 'That name is too long.';
    case 'trade_too_long': return 'That descriptor is too long.';
    case 'source_too_long': return 'That source note is too long.';
    default: return 'That did not go through.';
  }
}

// 🔴 WHAT THE CALLBACK IS TRYING TO TELL YOU.
//
// /api/connectors/[platform]/callback encodes a distinct reason for every way an OAuth can fail, and
// until 31 Jul 2026 nothing read a single one of them. It redirected to a page that rendered nothing,
// so a refusal was indistinguishable from a success: you came back to a normal looking console and
// believed you were connected. A silent failure is worse than a loud one, because you stop looking.
//
// Each reason is turned into the thing to actually go and DO, not a code to google.
const REASON: Record<string, string> = {
  disabled: 'The connector layer is switched off. Set CONNECTORS_ENABLED to true on Vercel and redeploy.',
  not_configured: 'That platform has no keys on Vercel yet.',
  unknown_platform: 'That is not a platform we have a connector for.',
  platform_mismatch: 'The answer came back for a different platform than the one that asked. Try again.',
  bad_state: 'The round trip could not be verified. This is almost always CONNECTOR_STATE_SECRET (or AGENT_SECRET, its fallback) missing on Vercel: with no secret the start signs the state anyway and the callback then refuses every one of them.',
  no_token: 'The platform accepted the login but handed back no token.',
  exchange_failed: 'The platform refused to swap the code for a token.',
  network: 'Could not reach the platform to swap the code for a token.',
  store_failed: 'The token came back but could not be saved. Check the marketing_connectors table exists.',
};

function explain(code: string): string {
  if (REASON[code]) return REASON[code];
  const http = /^http_(\d{3})$/.exec(code);
  if (http) {
    return `The platform refused the token exchange with a ${http[1]}. That is nearly always the redirect URI or the client secret on Vercel not matching what the platform has on file.`;
  }
  return `The platform refused it: ${code}`;
}

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
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [testimonials, setTestimonials] = useState<TReview[]>([]);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [newReview, setNewReview] = useState<NewReview>(BLANK_REVIEW);

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

  const pullReviews = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch('/api/team/reviews', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) { const j = (await res.json()) as { items?: TReview[] }; setTestimonials(j.items ?? []); }
    } finally {
      setReviewsLoaded(true);
    }
  }, [token]);

  // Publishing a testimonial. A separate path from mutate() above, because it writes to the reviews
  // route rather than the studio one, and because nothing about this may borrow the studio's copy.
  async function addReview() {
    if (busy.__review) return;
    if (!newReview.quote.trim() || !newReview.name.trim() || !newReview.trade.trim()) return;
    setBusy((b) => ({ ...b, __review: true }));
    setErr(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, __review: false })); return; }
    try {
      const res = await fetch('/api/team/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(newReview),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) { setNote('Testimonial added. It is live on the homepage.'); setNewReview(BLANK_REVIEW); await pullReviews(); }
      else setErr(reviewError(j.error));
    } catch {
      setErr('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, __review: false }));
  }

  // Hide or show one, without destroying the record that it was said.
  async function toggleReview(id: string, published: boolean) {
    const key = `tp${id}`;
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setErr(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [key]: false })); return; }
    try {
      const res = await fetch('/api/team/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ id, published }),
      });
      if (res.ok) { setNote(published ? 'Shown on the homepage.' : 'Hidden from the homepage.'); await pullReviews(); }
      else setErr('That did not go through.');
    } catch {
      setErr('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  // Remove one for good, e.g. when permission is withdrawn.
  async function removeReview(id: string) {
    const key = `td${id}`;
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setErr(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [key]: false })); return; }
    try {
      const res = await fetch('/api/team/reviews', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) { setNote('Testimonial deleted.'); await pullReviews(); }
      else setErr('That did not go through.');
    } catch {
      setErr('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  // Read the callback's verdict off the URL once, say it, and take it back out of the address bar so
  // a refresh does not re-announce a thing that happened ten minutes ago.
  //
  // ⚠️ THE DISABLE IS DELIBERATE AND HERE IS THE ARGUMENT, because a bare disable is how a rule
  // stops meaning anything. The rule is right in general: setState in an effect body costs an extra
  // render pass, and a chain of them is a real performance bug. This is the one case where it is
  // the correct pattern rather than a lazy one.
  //
  // window.location does not exist on the server, so it cannot be read during render. Moving it
  // into a lazy useState initialiser (`useState(() => ...)`) reads it on the client and returns
  // null on the server, which is a HYDRATION MISMATCH: React renders one tree, finds another, and
  // warns. Trading a warning nobody can fix for one extra render on first paint, on an internal
  // page one person opens, is the wrong trade.
  //
  // It also cannot cascade. The dependency array is empty, so it runs exactly once on mount, and
  // the state it sets is a dismissable banner nothing else reads.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const good = q.get('connected');
    const bad = q.get('connect_error');
    /* eslint-disable react-hooks/set-state-in-effect */
    if (good) setFlash({ ok: true, text: `${CONNECTOR_LABEL[good] || good} is connected.` });
    else if (bad) setFlash({ ok: false, text: explain(bad) });
    /* eslint-enable react-hooks/set-state-in-effect */
    if (good || bad) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) { await pull(); await pullConns(); await pullReviews(); } })();
    const id = setInterval(pull, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [pull, pullConns, pullReviews]);

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

  const assets = useMemo(() => data?.assets ?? [], [data]);
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
        {flash ? (
          <div style={{
            marginTop: 14, padding: '13px 15px', borderRadius: 12, fontSize: 13.2, lineHeight: 1.55, fontWeight: 600,
            background: flash.ok ? C.greenTint : C.redTint,
            border: `1px solid ${flash.ok ? '#BEDFCE' : '#F0C8C2'}`,
            color: flash.ok ? '#0B5C3B' : '#8C2A20',
          }}>
            {flash.text}
          </div>
        ) : null}
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

      {/* TESTIMONIALS */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Testimonials</h2>
          <span style={U.sectionNote}>
            {!reviewsLoaded ? 'reading…' : `${testimonials.filter((t) => t.published).length} live on the homepage`}
          </span>
        </div>
        <p style={{ ...T.tiny, color: C.faint, marginTop: 0, marginBottom: 12 }}>
          Only a quote a real customer said and agreed to see printed with their name. You hold the
          evidence and the permission. Nothing here writes a word for you, and a quote nobody gave is
          the one thing this section must never hold.
        </p>
        <div style={card}>
          <textarea
            value={newReview.quote}
            onChange={(e) => setNewReview({ ...newReview, quote: e.target.value })}
            placeholder="The quote, in their words"
            aria-label="Quote"
            style={{ ...input, minHeight: 74, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input value={newReview.name} onChange={(e) => setNewReview({ ...newReview, name: e.target.value })} placeholder="Name" aria-label="Name" style={{ ...input, flex: '1 1 130px' }} />
            <input value={newReview.trade} onChange={(e) => setNewReview({ ...newReview, trade: e.target.value })} placeholder="Trade and place, e.g. Electrician, Leeds" aria-label="Trade and place" style={{ ...input, flex: '1 1 200px' }} />
            <input value={newReview.source} onChange={(e) => setNewReview({ ...newReview, source: e.target.value })} placeholder="Source, e.g. in person (optional)" aria-label="Source" style={{ ...input, flex: '1 1 150px' }} />
            <select value={newReview.rating} onChange={(e) => setNewReview({ ...newReview, rating: Number(e.target.value) })} aria-label="Rating" style={sel}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} out of 5</option>)}
            </select>
            <button
              disabled={busy.__review || !newReview.quote.trim() || !newReview.name.trim() || !newReview.trade.trim()}
              onClick={addReview}
              style={{ ...btn, ...btnDark, opacity: busy.__review || !newReview.quote.trim() || !newReview.name.trim() || !newReview.trade.trim() ? 0.5 : 1 }}
            >{busy.__review ? 'Adding…' : 'Add'}</button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {!reviewsLoaded ? (
            <div style={U.honest}>Reading…</div>
          ) : testimonials.length === 0 ? (
            <div style={U.honest}>No testimonials yet. The homepage section stays hidden until you add one.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {testimonials.map((t) => (
                <div key={t.id} style={{ ...card, opacity: t.published ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={chip}>{t.rating} out of 5</span>
                    <span style={{ fontSize: 14.5, fontWeight: 750, color: C.ink }}>{t.name}</span>
                    <span style={{ ...T.tiny, color: C.faint }}>{t.trade}</span>
                    <span style={{ ...chip, marginLeft: 'auto', color: t.published ? C.green : C.faint }}>
                      {t.published ? 'Live' : 'Hidden'}
                    </span>
                  </div>
                  <p style={{ ...T.small, color: C.ink2, margin: '10px 0 0' }}>&ldquo;{t.quote}&rdquo;</p>
                  <div style={{ ...T.tiny, color: C.faint, marginTop: 6 }}>
                    {t.source ? `via ${t.source}` : 'source not noted'}
                    {t.created_by ? ` · added by ${t.created_by}` : ''}
                    {t.created_at ? ` · ${shortDate(t.created_at)}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      disabled={busy[`tp${t.id}`]}
                      onClick={() => toggleReview(t.id, !t.published)}
                      style={{ ...btn, ...btnGhost }}
                    >{busy[`tp${t.id}`] ? 'Working…' : t.published ? 'Hide' : 'Show'}</button>
                    <button
                      disabled={busy[`td${t.id}`]}
                      onClick={() => removeReview(t.id)}
                      style={{ ...btn, ...btnGhost, color: C.red, marginLeft: 'auto' }}
                    >{busy[`td${t.id}`] ? 'Working…' : 'Delete'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
