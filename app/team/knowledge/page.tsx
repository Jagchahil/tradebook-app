'use client';

// /team/knowledge — Gyani's desk. The tax brain, off the front page. Renders the existing Brain view
// (which already carries the constellation and the domains it watches). Nothing new to build here, it
// is a MOVE: this is the <Brain /> that used to sit stacked on the overview.

import TeamShell from '../TeamShell';
import Brain from '../Brain';

export default function KnowledgePage() {
  return (
    <TeamShell title="Knowledge">
      <Brain />
    </TeamShell>
  );
}
