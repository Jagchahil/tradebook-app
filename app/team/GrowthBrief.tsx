'use client';

// FROM THE GROWTH DESK, on the CEO's front page. Saudagar (CRM + Marketing) reports what needs a human
// straight onto the console, in the same approve / needs language as the list above it. It is derived
// live from the channel, content and pipeline state — never invented, never a fake glow — so the
// number the CEO sees here and the list on /team/growth can never disagree. Renders nothing at all
// when the desk is clear, because a section that is always there stops being read.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U } from './ui';
import { deriveActions, type GrowthAction } from '../../lib/growth';
import type { TeamOverview } from '../../lib/team';

interface Platform { platform: string; configured: boolean; connected: boolean; }

export default function GrowthBrief({ overview }: { overview: TeamOverview }) {
  const [actions, setActions] = useState<GrowthAction[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) { if (alive) setActions([]); return; }
      const h = { Authorization: `Bearer ${tok}` };
      const [cn, st] = await Promise.all([
        fetch('/api/team/connectors', { headers: h }),
        fetch('/api/team/studio/overview', { headers: h }),
      ]);
      let platforms: Platform[] = []; let enabled = false; let isOwner = false;
      if (cn.ok) { const j = await cn.json(); platforms = j.platforms ?? []; enabled = !!j.enabled; isOwner = !!j.isOwner; }
      let assetStates: string[] = []; let scheduledCount = 0;
      if (st.ok) { const j = await st.json(); assetStates = (j.assets ?? []).map((a: { state: string }) => a.state); scheduledCount = (j.calendar ?? []).length; }
      const list = deriveActions({
        isOwner, enabled, platforms, assetStates,
        cancelRequested: overview.cancelRequested,
        trialing: overview.trialing,
        paying: overview.active + overview.pastDue,
        scheduledCount,
      });
      if (alive) setActions(list);
    })();
    return () => { alive = false; };
  }, [overview]);

  // Nothing loaded yet, or a clear desk: draw nothing. The front page stays calm.
  if (!actions || actions.length === 0) return null;

  return (
    <section style={U.section}>
      <div style={U.sectionHead}>
        <h2 style={T.h2}>From your Growth desk</h2>
        <span style={U.sectionNote}>Saudagar · CRM &amp; marketing</span>
        <a href="/team/growth" style={{ marginLeft: 'auto', color: C.river, fontWeight: 700, fontSize: 12.8, textDecoration: 'none' }}>Open the desk &rarr;</a>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {actions.map((a) => (
          <a key={a.id} href="/team/growth" style={row}>
            <span style={{ ...tag, ...(a.kind === 'approve' ? approve : needs) }}>{a.kind === 'approve' ? 'Approve' : 'Needs you'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{a.text}</div>
              <div style={{ ...T.small, color: C.muted, marginTop: 2 }}>{a.detail}</div>
            </div>
            <span style={{ width: 8, height: 8, borderRadius: 5, background: a.prio === 'hi' ? C.red : a.prio === 'md' ? C.amber : C.faint, flex: '0 0 auto' }} />
          </a>
        ))}
      </div>
    </section>
  );
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, background: C.panel,
  border: `1px solid ${C.line}`, borderRadius: 13, padding: '13px 15px', textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const tag: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.3, padding: '4px 9px', borderRadius: 7, flex: '0 0 auto', textTransform: 'uppercase',
};
const approve: React.CSSProperties = { background: C.riverTint, color: C.river };
const needs: React.CSSProperties = { background: C.saffronTint, color: C.amber };
