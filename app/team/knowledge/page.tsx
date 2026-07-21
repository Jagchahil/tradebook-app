'use client';

// /team/knowledge — Gyani's desk. The tax brain, off the front page. Renders the existing Brain view
// (the constellation and the domains it watches), and below it Khoji's MEMORY: what every number used
// to be and when it changed (the pocket). Both read-only, team-gated, no customer data.

import TeamShell from '../TeamShell';
import Brain from '../Brain';
import Memory from '../Memory';
import Learnings from '../Learnings';

export default function KnowledgePage() {
  return (
    <TeamShell title="Knowledge">
      {/* What it has actually learned, in plain words, first — then the shape of the brain (the
          constellation), then the memory of every number that changed. Content, then form, then history. */}
      <Learnings />
      <Brain />
      <Memory />
    </TeamShell>
  );
}
