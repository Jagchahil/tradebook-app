'use client';

// PLAYBOOK — the support brain. Every common issue and its answer, the same entries that ground the
// Claude drafts and fill the pick-list on the Support desk. Read-only here: you write these as notes in
// the "Lekhio Support" folder of your Obsidian vault, and they sync in, so the vault stays the single
// source of truth. This is the "what the front desk knows" node — FAQs, common issues, the answers your
// team gives again and again, in one place.

import { useEffect, useState, useCallback } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

interface Entry {
  id: string;
  title: string;
  body: string;
  keywords: string[];
  updatedAt: string;
}

export default function PlaybookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const token = useCallback(async () => {
    const { data } = await browserSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const pull = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch('/api/team/support-kb', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const j = (await res.json()) as { entries?: Entry[] };
        setEntries(j.entries ?? []);
      }
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await pull(); })();
    return () => { alive = false; };
  }, [pull]);

  return (
    <TeamShell title="Playbook · Common issues">
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...T.h2, margin: 0 }}>Support playbook</h2>
          <span style={{ ...T.small, color: C.muted }}>{entries.length ? `${entries.length} ${entries.length === 1 ? 'issue' : 'issues'}` : 'empty'}</span>
        </div>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 0, color: C.faint }}>
          The common issues and answers the front desk knows. These ground the drafted replies and fill
          the one-tap pick-list on the Support desk. Write them as notes in the &ldquo;Lekhio Support&rdquo;
          folder of your Obsidian vault — they sync in, so your brain stays the source of truth.
        </p>
      </section>

      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Common issues</h2>
          <span style={U.sectionNote}>{entries.length ? `${entries.length} in the brain` : ''}</span>
        </div>
        {entries.length === 0 ? (
          <div style={U.honest}>
            {loaded
              ? 'The playbook is empty. Add a note to the "Lekhio Support" folder in your vault — a title, some keywords, and the answer — and it appears here and starts helping the desk within the hour.'
              : 'Reading the brain…'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {entries.map((e) => (
              <div key={e.id} style={card}>
                <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: -0.2, color: C.ink }}>{e.title}</div>
                {e.keywords && e.keywords.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {e.keywords.slice(0, 8).map((k, i) => (
                      <span key={i} style={kw}>{k}</span>
                    ))}
                  </div>
                ) : null}
                <div style={{ ...T.small, color: C.ink2, whiteSpace: 'pre-wrap', marginTop: 10, lineHeight: 1.6 }}>{e.body}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </TeamShell>
  );
}

const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18,
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const kw: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 650, color: C.muted, background: C.paper,
  border: `1px solid ${C.line}`, borderRadius: 999, padding: '2px 9px',
};
