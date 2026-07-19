'use client';

// The wrapper every subsection page uses: the same dark header, a back link to the overview, and the
// SAME team gate as the console. Sign in still happens only on /team; a subsection just checks you are
// on the team and, if not, points you back rather than showing an empty screen.

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { C, T, S as U } from './ui';

export default function TeamShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'out'>('loading');

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) { setState('out'); return; }
      const res = await fetch('/api/team/overview', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) { await browserSupabase.auth.signOut(); setState('out'); }
      else if (!res.ok) { setState('out'); }
      else setState('ok');
    })();
  }, []);

  if (state === 'loading') {
    return <main style={{ ...U.page, padding: '48px 26px' }}><p style={T.small}>One moment.</p></main>;
  }
  if (state === 'out') {
    return (
      <main style={{ ...U.page, padding: '48px 26px' }}>
        <p style={T.body}>Sign in on the <a href="/team" style={{ color: C.river, fontWeight: 650 }}>console</a> to view this.</p>
      </main>
    );
  }

  return (
    <div style={U.page}>
      <header style={U.header}>
        <div style={U.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={U.wordmark}>Lekhio</span>
            <span style={U.accent} aria-hidden="true" />
            <span style={{ ...U.headerRole, marginLeft: 6 }}>{title}</span>
          </div>
          <a href="/team" style={{ ...U.headerBtn, textDecoration: 'none' }}>&larr; Overview</a>
        </div>
      </header>
      <main style={U.main}>{children}</main>
    </div>
  );
}
