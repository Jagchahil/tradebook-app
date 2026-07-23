'use client';

// /team/growth — SAUDAGAR'S DESK. The old two — Hoka (marketing) and Saudagar (CRM) — are one worker
// now: the whole funnel in one room. Channels bring people in, the studio publishes, the pipeline
// works them to paid, and the money lands. It reads live from three team-gated endpoints already in
// the app (overview, connectors, studio/overview) and shows the CEO exactly what needs a human, in the
// same approve/needs language as the front-page list. It never shows a customer's receipts, income,
// tax figures or phone number — the same promise as the rest of the console.

import { useEffect, useMemo, useState } from 'react';
import TeamShell from '../TeamShell';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U, FONT, gbp, shortDate } from '../ui';
import { sourceLabel } from '../../../lib/team';
import type { TeamOverview, AcquisitionSource } from '../../../lib/team';
import {
  deriveActions, pipelineFrom, channelLabel, channelState, sourceShare, CHANNEL_FOR,
  type GrowthAction,
} from '../../../lib/growth';

interface Platform { platform: string; configured: boolean; connected: boolean; }
interface StudioAsset { id: string; title: string; format: string; state: string; scheduled_for: string | null; platforms: string[]; }
interface CalPost { asset_id: string; title: string; format: string; scheduled_for: string | null; platforms: string[]; }
interface RecentLead { email: string; name: string | null; business: string | null; stage: string; created_at: string | null; }

export default function GrowthPage() {
  return (
    <TeamShell title="Growth · Saudagar">
      <GrowthInner />
    </TeamShell>
  );
}

function GrowthInner() {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [assets, setAssets] = useState<StudioAsset[] | null>(null);
  const [ideas, setIdeas] = useState<number>(0);
  const [calendar, setCalendar] = useState<CalPost[]>([]);
  const [crm, setCrm] = useState<{ pipeline: Record<string, number> | null; recent: RecentLead[] | null }>({ pipeline: null, recent: null });
  const [reloadKey, setReloadKey] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const h = { Authorization: `Bearer ${tok}` };
      const [ov, cn, st] = await Promise.all([
        fetch('/api/team/overview', { headers: h }),
        fetch('/api/team/connectors', { headers: h }),
        fetch('/api/team/studio/overview', { headers: h }),
      ]);
      if (ov.ok) { const j = await ov.json(); setOverview(j.overview); }
      else setErr('Could not read the business figures.');
      if (cn.ok) { const j = await cn.json(); setPlatforms(j.platforms ?? []); setEnabled(!!j.enabled); setIsOwner(!!j.isOwner); }
      if (st.ok) { const j = await st.json(); setAssets(j.assets ?? []); setIdeas((j.ideas ?? []).length); setCalendar(j.calendar ?? []); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) return;
      const r = await fetch('/api/team/growth', { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const j = await r.json(); setCrm({ pipeline: j.pipeline ?? null, recent: j.recent ?? null }); }
    })();
  }, [reloadKey]);

  const o = overview;
  const assetStates = useMemo(() => (assets ?? []).map((a) => a.state), [assets]);

  const actions: GrowthAction[] = useMemo(() => {
    if (!o || !platforms) return [];
    return deriveActions({
      isOwner, enabled, platforms,
      assetStates,
      cancelRequested: o.cancelRequested,
      trialing: o.trialing,
      paying: o.active + o.pastDue,
      scheduledCount: calendar.length,
    });
  }, [o, platforms, isOwner, enabled, assetStates, calendar.length]);

  const cp = crm.pipeline;
  const pipe = o ? pipelineFrom(o, cp ? { lead: cp.lead ?? null, warming: cp.warming ?? null, checkout: cp.checkout ?? null } : undefined) : null;
  const mix = o ? sourceShare(o.bySource) : [];

  const bucket = (states: string[]) => (assets ?? []).filter((a) => states.includes(a.state)).length;
  const studioCounts = {
    ideas,
    drafts: bucket(['scripting']),
    awaiting: bucket(['awaiting_approval']),
    scheduled: bucket(['scheduled']),
    live: bucket(['live', 'measured']),
  };

  return (
    <>
      <p style={{ ...T.body, color: C.muted, margin: '2px 0 0', maxWidth: 640 }}>
        The whole funnel, one desk. Bring people in, work them to paid, keep them. Below is live, and honest about what is not measured yet.
      </p>

      {/* THE GROWTH ENGINE */}
      <section style={U.section}>
        <div style={U.sectionHead}><h2 style={T.h2}>The growth engine</h2><span style={U.sectionNote}>first touch to paid</span></div>
        <div style={engineWrap}>
          <div style={engineLine} aria-hidden="true" />
          <Node emoji="📡" tone={C.river} label="Channels" big={platforms ? `${platforms.filter((p) => channelState(p) === 'connected').length}/${platforms.length}` : '—'} cap="wired & publishing" />
          <Node emoji="📣" tone={C.saffron} label="Content" big={assets ? String(studioCounts.live + studioCounts.scheduled) : '—'} cap={`${studioCounts.scheduled} scheduled`} />
          <Node emoji="🎯" tone="#7E5AC2" label="Pipeline" big={o ? String(o.trialing + o.active + o.pastDue) : '—'} cap="in play" />
          <Node emoji="🤝" tone={C.green} label="Customers" big={o ? String(o.customers) : '—'} cap={o ? `${o.trialing} trial · ${o.active + o.pastDue} paying` : ''} />
          <Node emoji="£" tone="#0E7C86" label="Revenue" big={o ? gbp(o.mrrPence) : '—'} cap="MRR, from Stripe" />
        </div>
      </section>

      {/* WHAT NEEDS YOU — the CEO brief */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>What needs you</h2>
          <span style={U.sectionNote}>Saudagar &rarr; the CEO</span>
        </div>
        {o && platforms ? (
          actions.length === 0 ? (
            <div style={U.honest}>Nothing from the growth desk needs you right now. Content, channels and win-backs are all clear.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {actions.map((a) => (
                <div key={a.id} style={briefRow}>
                  <span style={{ ...kindTag, ...(a.kind === 'approve' ? kindApprove : kindNeeds) }}>
                    {a.kind === 'approve' ? 'Approve' : 'Needs you'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{a.text}</div>
                    <div style={{ ...T.small, color: C.muted, marginTop: 2 }}>{a.detail}</div>
                  </div>
                  <span style={{ width: 8, height: 8, borderRadius: 5, background: a.prio === 'hi' ? C.red : a.prio === 'md' ? C.amber : C.faint, flex: '0 0 auto' }} />
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={U.honest}>Bringing the brief together&hellip;</div>
        )}
      </section>

      {/* THE PIPELINE */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>The pipeline</h2>
          <span style={U.sectionNote}>forward-only lifecycle</span>
          <a href="/team/customers" style={{ ...linkStyle, marginLeft: 'auto' }}>Open the CRM &rarr;</a>
        </div>
        <div style={board}>
          <Col stage="Lead" tone="#4d7fc4" count={pipe?.lead ?? null} />
          <Col stage="Warming" tone="#9670d8" count={pipe?.warming ?? null} />
          <Col stage="Checkout" tone={C.saffron} count={pipe?.checkout ?? null} />
          <Col stage="Trial" tone={C.river} count={pipe?.trial ?? null} />
          <Col stage="Paid" tone={C.green} count={pipe?.paid ?? null} highlight />
        </div>
      </section>

      {/* IN-PERSON CAPTURE — door to door B2B */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Add a lead (in person)</h2>
          <span style={U.sectionNote}>door to door &middot; B2B &middot; consent taken at the door</span>
        </div>
        <AddLeadForm onAdded={() => setReloadKey((k) => k + 1)} />
        {crm.recent && crm.recent.length > 0 ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...T.label, marginBottom: 8 }}>Recently added</div>
            <div style={{ ...U.panel, padding: 0, overflowX: 'auto' }}>
              <table style={U.table}>
                <thead><tr>
                  <th style={{ ...U.th, paddingLeft: 18 }}>Business</th><th style={U.th}>Contact</th>
                  <th style={U.th}>Stage</th><th style={{ ...U.th, paddingRight: 18 }}>Added</th>
                </tr></thead>
                <tbody>
                  {crm.recent.map((r) => (
                    <tr key={r.email}>
                      <td style={{ ...U.td, paddingLeft: 18, fontWeight: 650 }}>{r.business || <span style={{ color: C.faint, fontWeight: 400 }}>&mdash;</span>}</td>
                      <td style={{ ...U.td, color: C.muted }}>{r.name || '—'}</td>
                      <td style={U.td}><span style={{ fontSize: 12, fontWeight: 750, color: C.river }}>{r.stage}</span></td>
                      <td style={{ ...U.td, paddingRight: 18, color: C.muted }}>{shortDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* CONNECTED CHANNELS */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Connected channels</h2>
          <span style={U.sectionNote}>where Saudagar publishes</span>
          <a href="/team/system" style={{ ...linkStyle, marginLeft: 'auto' }}>Manage on Mistri&rsquo;s desk &rarr;</a>
        </div>
        {platforms ? (
          <div style={chanGrid}>
            {platforms.map((p) => {
              const st = channelState(p);
              const tone = st === 'connected' ? C.green : st === 'configured' ? C.amber : C.faint;
              const word = st === 'connected' ? 'Connected' : st === 'configured' ? 'Configured' : 'Not set up';
              return (
                <div key={p.platform} style={U.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${C.river}, ${C.saffron})`, color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
                      {channelLabel(p.platform).slice(0, 2)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 750 }}>{channelLabel(p.platform)}</div>
                  </div>
                  <div style={{ ...T.small, color: C.muted, marginTop: 10, minHeight: 34 }}>{CHANNEL_FOR[p.platform] ?? ''}</div>
                  <span style={{ ...U.pill, marginTop: 6 }}>
                    <span style={{ ...U.dot, background: tone }} />{word}
                  </span>
                </div>
              );
            })}
          </div>
        ) : <div style={U.honest}>Reading the channel layer&hellip;</div>}
      </section>

      {/* CONTENT IN FLIGHT */}
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Content in flight</h2>
          <span style={U.sectionNote}>brief &rarr; creative &rarr; approve &rarr; go-live</span>
          <a href="/team/studio" style={{ ...linkStyle, marginLeft: 'auto' }}>Open the studio &rarr;</a>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Stat label="Ideas" n={studioCounts.ideas} />
          <Stat label="Drafts" n={studioCounts.drafts} />
          <Stat label="Awaiting you" n={studioCounts.awaiting} tone={studioCounts.awaiting > 0 ? C.amber : undefined} />
          <Stat label="Scheduled" n={studioCounts.scheduled} tone={studioCounts.scheduled > 0 ? C.river : undefined} />
          <Stat label="Live" n={studioCounts.live} tone={studioCounts.live > 0 ? C.green : undefined} />
        </div>
        {calendar.length > 0 ? (
          <div style={calGrid}>
            {calendar.slice(0, 6).map((post) => (
              <div key={post.asset_id} style={U.card}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: C.saffron }}>{shortDate(post.scheduled_for)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, margin: '7px 0 9px', lineHeight: 1.35, color: C.ink }}>{post.title}</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {post.platforms.map((pl) => <span key={pl} style={miniPlat}>{pl}</span>)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={U.honest}>Nothing is scheduled yet. Approve a draft in the studio and it lands on the go-live calendar here.</div>
        )}
      </section>

      {/* WHERE THEY CAME FROM */}
      <section style={U.section}>
        <div style={U.sectionHead}><h2 style={T.h2}>Where they came from</h2><span style={U.sectionNote}>acquisition source of every real customer</span></div>
        {o && o.customers > 0 ? (
          <div style={U.panel}>
            <div style={{ display: 'flex', height: 15, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.line}` }}>
              {mix.filter((m) => m.count > 0).map((m) => (
                <div key={m.source} title={`${sourceLabel(m.source)} · ${m.count}`} style={{ width: `${m.pct}%`, background: SRC_COLOR[m.source] ?? C.faint }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
              {mix.filter((m) => m.count > 0).map((m) => (
                <span key={m.source} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.ink2 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: SRC_COLOR[m.source] ?? C.faint }} />
                  {sourceLabel(m.source)} · {m.count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={U.honest}>No customers to attribute yet. This fills the moment the first one arrives.</div>
        )}
      </section>

      {/* CEO INSIGHT BOX — a place data cannot see: what Jag noticed. */}
      <section style={U.section}>
        <div style={U.sectionHead}><h2 style={T.h2}>Drop an insight</h2><span style={U.sectionNote}>from Marketplace, a forum, a chat</span></div>
        <InsightBox />
      </section>

      {err ? <p style={{ ...U.alarm, marginTop: 22 }}>{err}</p> : null}

      <p style={{ ...T.tiny, marginTop: 44, maxWidth: 720 }}>
        This desk shows who our customers are, what they pay us, and the state of our own marketing. It never shows a customer&rsquo;s receipts, income, tax figures or phone number, and it never will.
      </p>
    </>
  );
}

function InsightBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (!text.trim() || busy) return;
    setBusy(true); setMsg(null);
    const { data: s } = await browserSupabase.auth.getSession();
    const tok = s.session?.access_token;
    try {
      const res = await fetch('/api/team/growth/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        setText('');
        setMsg({ ok: true, text: 'Saved.' });
      } else {
        const j = await res.json().catch(() => ({} as { error?: string }));
        setMsg({ ok: false, text: (j as { error?: string }).error || 'Could not save that.' });
      }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' });
    }
    setBusy(false);
  }

  return (
    <div style={U.panel}>
      <textarea
        aria-label="Add an insight"
        value={text}
        onChange={(e) => { setText(e.target.value); setMsg(null); }}
        placeholder="Something you noticed that the numbers wouldn't show…"
        rows={3}
        style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: FONT }}
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
        <button type="button" disabled={busy || !text.trim()} onClick={save} style={{ ...submitBtn, opacity: busy || !text.trim() ? 0.5 : 1 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <span style={{ fontSize: 13, fontWeight: 650, color: msg.ok ? C.green : C.red }}>{msg.text}</span> : null}
      </div>
    </div>
  );
}

const SRC_COLOR: Record<AcquisitionSource, string> = {
  meta: '#1B59A6', organic: '#0F7B4F', referral: '#E8973A', in_person: '#7E5AC2', billboard: '#0E7C86', unknown: '#9A968E',
};

function Node({ emoji, tone, label, big, cap }: { emoji: string; tone: string; label: string; big: string; cap: string }) {
  return (
    <div style={node}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${tone}, ${tone}cc)`, color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(17,17,17,.10)' }} aria-hidden="true">{emoji}</div>
      <div style={{ ...T.label, marginTop: 10 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.8, color: C.ink, marginTop: 3 }}>{big}</div>
      <div style={{ ...T.tiny, marginTop: 5, textAlign: 'center' }}>{cap}</div>
    </div>
  );
}

function Col({ stage, tone, count, highlight }: { stage: string; tone: string; count: number | null; highlight?: boolean }) {
  return (
    <div style={{ ...col, ...(highlight ? { borderColor: '#BDE7CE', background: C.greenTint } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: tone }}>{stage}</span>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.6, color: count === null ? C.faint : C.ink }}>
          {count === null ? '—' : count}
        </span>
      </div>
      <div style={{ height: 3, borderRadius: 3, background: tone, marginTop: 10, opacity: count === null ? 0.25 : 1 }} />
      <div style={{ ...T.tiny, marginTop: 10 }}>
        {count === null ? 'not tracked yet' : count === 0 ? 'none here yet' : stage === 'Paid' ? 'paying us now' : 'in this stage'}
      </div>
    </div>
  );
}

function Stat({ label, n, tone }: { label: string; n: number; tone?: string }) {
  return (
    <div style={{ ...U.chip, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <b style={{ color: tone ?? C.ink, fontSize: 14 }}>{n}</b>
    </div>
  );
}

function AddLeadForm({ onAdded }: { onAdded: () => void }) {
  const [f, setF] = useState({ businessName: '', contactName: '', email: '', whatsapp: '', leaflet: '', notes: '', emailConsent: true, waConsent: false, signedUp: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { data: s } = await browserSupabase.auth.getSession();
    const tok = s.session?.access_token;
    const res = await fetch('/api/team/growth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify(f),
    });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setMsg({ ok: true, text: j.enrolled ? 'Added and enrolled in the nurture flow.' : 'Added to the CRM.' });
      // Keep the leaflet code between entries — a rep works one batch at a time.
      setF((p) => ({ businessName: '', contactName: '', email: '', whatsapp: '', leaflet: p.leaflet, notes: '', emailConsent: true, waConsent: false, signedUp: false }));
      onAdded();
    } else {
      const j = await res.json().catch(() => ({} as { error?: string }));
      setMsg({ ok: false, text: (j as { error?: string }).error || 'Could not add that lead.' });
    }
  }

  return (
    <form onSubmit={submit} style={{ ...U.panel }}>
      <div style={formGrid}>
        <Field label="Business name"><input aria-label="Business name" style={fieldStyle} value={f.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ace Plumbing" /></Field>
        <Field label="Contact name"><input aria-label="Contact name" style={fieldStyle} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Ravi" /></Field>
        <Field label="Email (required)"><input aria-label="Email" style={fieldStyle} type="email" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="ravi@ace.co" /></Field>
        <Field label="Phone / WhatsApp"><input aria-label="Phone or WhatsApp" style={fieldStyle} value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+44 7700 900123" /></Field>
        <Field label="Leaflet code"><input aria-label="Leaflet code" style={fieldStyle} value={f.leaflet} onChange={(e) => set('leaflet', e.target.value)} placeholder="CAM-01" /></Field>
        <Field label="Notes"><input aria-label="Notes" style={fieldStyle} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="keen, van signage" /></Field>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
        <Check checked={f.emailConsent} onChange={(v) => set('emailConsent', v)}>Agreed to email</Check>
        <Check checked={f.waConsent} onChange={(v) => set('waConsent', v)}>Agreed to WhatsApp</Check>
        <Check checked={f.signedUp} onChange={(v) => set('signedUp', v)}>Started the app there</Check>
        <button type="submit" disabled={busy} style={{ ...submitBtn, opacity: busy ? 0.6 : 1, marginLeft: 'auto' }}>{busy ? 'Adding…' : 'Add lead'}</button>
      </div>
      <p style={{ ...T.tiny, marginTop: 12 }}>
        Consent is taken verbally at the door and recorded against the lead (who took it, when). Email consent enrols them straight into the flow — the verbal consent is the opt-in.
      </p>
      {msg ? <p style={{ marginTop: 10, fontSize: 13, fontWeight: 650, color: msg.ok ? C.green : C.red }}>{msg.text}</p> : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'block' }}><span style={{ ...T.label, display: 'block', marginBottom: 6 }}>{label}</span>{children}</label>;
}
function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.ink2, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.river }} />
      {children}
    </label>
  );
}

const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
const fieldStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', fontSize: 14, color: C.ink, border: `1.5px solid ${C.line}`, borderRadius: 10, background: C.panel, outline: 'none', fontFamily: FONT };
const submitBtn: React.CSSProperties = { padding: '11px 22px', fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: FONT, background: `linear-gradient(135deg, ${C.river}, ${C.riverDeep})`, border: 0, borderRadius: 10, cursor: 'pointer' };

const linkStyle: React.CSSProperties = { color: C.river, fontWeight: 700, fontSize: 12.8, textDecoration: 'none' };

const engineWrap: React.CSSProperties = {
  position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: '22px 18px',
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const engineLine: React.CSSProperties = {
  position: 'absolute', left: '11%', right: '11%', top: 44, height: 2, borderRadius: 2,
  background: `linear-gradient(90deg, ${C.river}, #7E5AC2, ${C.green})`, opacity: 0.35, zIndex: 0,
};
const node: React.CSSProperties = { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' };

const board: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 };
const col: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: '14px 15px', minHeight: 96,
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};

const briefRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, background: C.panel,
  border: `1px solid ${C.line}`, borderRadius: 13, padding: '13px 15px',
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const kindTag: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.3, padding: '4px 9px', borderRadius: 7, flex: '0 0 auto', textTransform: 'uppercase',
};
const kindApprove: React.CSSProperties = { background: C.riverTint, color: C.river };
const kindNeeds: React.CSSProperties = { background: C.saffronTint, color: C.amber };

const chanGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 };
const calGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 11 };
const miniPlat: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, padding: '2px 6px', borderRadius: 5,
  background: C.lineSoft, color: C.ink2, textTransform: 'uppercase',
};
