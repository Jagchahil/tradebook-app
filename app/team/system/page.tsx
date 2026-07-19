'use client';

// /team/system — Mistri's desk. Uptime, deploys and security. A stub for now: the CTO watchdogs land
// here (health history, last deploys, RLS advisors). The overview already shows the live health pills,
// so this page is where the detail grows, not a blocker.

import TeamShell from '../TeamShell';
import { T, S as U } from '../ui';

export default function SystemPage() {
  return (
    <TeamShell title="System">
      <div style={U.honest}>
        <b>Mistri&apos;s watch, coming soon.</b>
        <p style={{ margin: '8px 0 0', fontWeight: 400 }}>
          Uptime history, the last deploys, the tax-parity CI, and the Supabase security advisors will live
          here once the CTO watchdogs are wired. For now the live status is on the overview.
        </p>
      </div>
    </TeamShell>
  );
}
