'use client';

// /team/knowledge. Gyani's desk. The tax brain, off the front page. Renders the existing Brain view
// (the constellation and the domains it watches), and below it Khoji's MEMORY: what every number used
// to be and when it changed (the pocket). Both read-only, team-gated, no customer data.

import TeamShell from '../TeamShell';
import Brain from '../Brain';
import Memory from '../Memory';
import Learnings from '../Learnings';
import { C, T, S as U } from '../ui';
import { TNA_ACKNOWLEDGEMENT, TNA_PARTIAL_REPRESENTATION } from '../../../lib/lawsources';

export default function KnowledgePage() {
  return (
    <TeamShell title="Knowledge">
      {/* 🔴 WHERE APPROVING SOMETHING FINALLY GOES SOMEWHERE.
          Until 27 July, approving a finding on this desk moved a number in the tax engine and told
          the man who pays us nothing at all. The announcements banner is the other end of that wire,
          so the link to it belongs here, next to the button, not buried in a menu. */}
      <section style={U.card}>
        <h2 style={T.h2}>Where an approved finding goes</h2>
        <p style={{ ...T.small, marginTop: 6 }}>
          Approving a card below moves the figure in the engine and puts it in front of customers as
          a sentence they can read, with its source. Only approved findings ever get there.
        </p>
        <a href="/team/announcements" style={{ ...T.body, color: C.river, fontWeight: 700, textDecoration: 'none' }}>
          See what a customer sees &rarr;
        </a>
      </section>

      {/* What it has actually learned, in plain words, first. Then the shape of the brain (the
          constellation), then the memory of every number that changed. Content, then form, then history. */}
      <Learnings />
      <Brain />
      <Memory />

      {/* 🔴 THIS IS THE SCREEN THE LICENSED MATERIAL IS ACTUALLY SHOWN ON, so this is where the
          acknowledgement most obviously belongs. A tribunal card on this desk carries the judge's
          own catchwords, and that is the only place in the whole product Licensed Material appears
          as prose. The public copy on /terms discharges "a prominent location" for anyone who is
          not us. This one discharges it in front of the material itself.

          Both strings come from lib/lawsources.ts. Never retype either of them. The licence holds
          us to a form of words, so a hand typed second copy is the breach waiting to happen. */}
      <section style={{ ...U.card, marginTop: 24 }}>
        <h2 style={T.h2}>Find Case Law</h2>
        <p style={{ ...T.small, marginTop: 6 }}>{TNA_ACKNOWLEDGEMENT}</p>
        <p style={{ ...T.small, marginTop: 6 }}>{TNA_PARTIAL_REPRESENTATION}</p>
        <p style={{ ...T.small, marginTop: 6 }}>
          A judgment never reaches a customer. It is read here, by a person, and what a customer sees
          is a citation and the underlying legislation, never the holding.
        </p>
      </section>
    </TeamShell>
  );
}
