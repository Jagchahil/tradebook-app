'use client';

// /team/knowledge — Gyani's desk. The tax brain, off the front page. Renders the existing Brain view
// (the constellation and the domains it watches), and below it Khoji's MEMORY: what every number used
// to be and when it changed (the pocket). Both read-only, team-gated, no customer data.

import TeamShell from '../TeamShell';
import Brain from '../Brain';
import Memory from '../Memory';

export default function KnowledgePage() {
  return (
    <TeamShell title="Knowledge">
      <Brain />
      <Memory />
    </TeamShell>
  );
}
