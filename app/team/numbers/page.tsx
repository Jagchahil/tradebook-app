'use client';

// /team/numbers — the finance desk. The four charts (signups, trial to paid, which channel pays, MRR),
// off the front page. A MOVE of the existing <Numbers /> that used to sit stacked on the overview.

import TeamShell from '../TeamShell';
import Numbers from '../Numbers';

export default function NumbersPage() {
  return (
    <TeamShell title="Numbers">
      <Numbers />
    </TeamShell>
  );
}
