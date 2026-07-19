'use client';

// /team/customers — the customer list and where they came from, off the front page. A MOVE of the table
// and the source filter that used to sit at the bottom of the overview. Same rule as everywhere on the
// console: who they are and what they pay US, never their receipts, figures or phone number.

import { useEffect, useMemo, useState } from 'react';
import TeamShell from '../TeamShell';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { sourceLabel, SOURCES } from '../../../lib/team';
import { C, T, S as U, FONT, gbp, shortDate } from '../ui';
import type { TeamCustomer, TeamOverview, AcquisitionSource } from '../../../lib/team';

export default function CustomersPage() {
  return (
    <TeamShell title="Customers">
      <CustomersInner />
    </TeamShell>
  );
}

function CustomersInner() {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [rows, setRows] = useState<TeamCustomer[]>([]);
  const [filter, setFilter] = useState<AcquisitionSource | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) return;
    const res = await fetch('/api/team/overview', { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 503) { setError('Could not read the database. This is NOT "no customers".'); return; }
    if (!res.ok) { setError('Could not load.'); return; }
    const data = await res.json();
    setOverview(data.overview);
    setRows(data.customers);
  }
  useEffect(() => { load(); }, []);

  async function saveSource(userId: string, source: string) {
    const before = rows;
    setRows(before.map((c) => (c.id === userId ? { ...c, source: source as AcquisitionSource } : c)));
    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    const res = await fetch('/api/team/source', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, source }),
    });
    if (!res.ok) { setRows(before); setError('Could not save that. It has been put back.'); }
    else { setError(null); load(); }
  }

  const customers = useMemo(
    () => (filter === 'all' ? rows : rows.filter((c) => c.source === filter)),
    [rows, filter],
  );
  const o = overview;

  return (
    <>
      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Where they came from</h2>
          <span style={U.sectionNote}>tap to filter</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All {o?.customers ?? 0}</Chip>
          {SOURCES.map((s) => (
            <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {sourceLabel(s)} {o?.bySource?.[s] ?? 0}
            </Chip>
          ))}
        </div>
      </section>

      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>Customers</h2>
          <span style={U.sectionNote}>{customers.length} shown</span>
        </div>
        <div style={{ ...U.panel, padding: 0, overflowX: 'auto' }}>
          <table style={U.table}>
            <thead>
              <tr>
                <th style={{ ...U.th, paddingLeft: 20 }}>Name</th>
                <th style={U.th}>Trade</th>
                <th style={U.th}>Joined</th>
                <th style={U.th}>Source</th>
                <th style={U.th}>Plan</th>
                <th style={U.th}>Status</th>
                <th style={{ ...U.th, paddingRight: 20 }}>Renews</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...U.td, paddingLeft: 20, fontWeight: 650 }}>
                    {c.name || <span style={{ color: C.faint, fontWeight: 400 }}>No name yet</span>}
                  </td>
                  <td style={{ ...U.td, color: C.muted }}>{c.trade || 'None'}</td>
                  <td style={{ ...U.td, color: C.muted }}>{shortDate(c.joined)}</td>
                  <td style={U.td}>
                    <select value={c.source} onChange={(e) => saveSource(c.id, e.target.value)} style={selectStyle}
                      aria-label={`Where ${c.name || 'this customer'} came from`}>
                      {SOURCES.map((s) => <option key={s} value={s}>{sourceLabel(s)}</option>)}
                    </select>
                  </td>
                  <td style={U.td}>
                    {c.plan ? <span style={{ color: C.ink2 }}>{c.plan}</span> : <span style={{ color: C.faint }}>None</span>}
                    {c.plan && c.amountPence > 0 ? <span style={{ color: C.faint }}> · {gbp(c.amountPence)}</span> : null}
                  </td>
                  <td style={U.td}><StatusTag status={c.status} /></td>
                  <td style={{ ...U.td, paddingRight: 20, color: C.muted }}>{shortDate(c.renews)}</td>
                </tr>
              ))}
              {customers.length === 0 ? (
                <tr><td style={{ ...U.td, paddingLeft: 20, color: C.faint }} colSpan={7}>Nobody in this group yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {error ? <p style={{ ...U.alarm, marginTop: 20 }}>{error}</p> : null}
      </section>
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...U.chip, ...(active ? U.chipOn : {}) }}>{children}</button>;
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  active: { bg: C.greenTint, fg: C.green }, trialing: { bg: C.riverTint, fg: C.river },
  past_due: { bg: C.amberTint, fg: C.amber }, canceled: { bg: '#F2F0EA', fg: C.faint }, none: { bg: '#F2F0EA', fg: C.faint },
};
function StatusTag({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.none;
  return <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 7, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 750 }}>{status}</span>;
}

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 8, border: `1px solid ${C.line}`,
  fontSize: 12.8, background: '#fff', color: C.ink2, fontFamily: FONT, cursor: 'pointer',
};
