'use client';

// THE CONSOLE TABS. Two views of the same morning: "Today" (your list, the business, the team grid) and
// the live "CEO brief" (a one-line read on every worker, updating as they report). A segmented control,
// the Apple way — one lit pill, the rest quiet — so it reads as a place you switch, not a menu you hunt.

import { C, FONT } from './ui';

const TABS: Array<{ key: 'today' | 'ceo'; label: string; href: string }> = [
  { key: 'today', label: 'Today', href: '/team' },
  { key: 'ceo', label: 'CEO brief', href: '/team/ceo' },
];

export default function TeamTabs({ active }: { active: 'today' | 'ceo' }) {
  return (
    <div style={wrap} role="tablist" aria-label="Console view">
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <a key={t.key} href={t.href} role="tab" aria-selected={on} style={{ ...tab, ...(on ? tabOn : {}) }}>
            {t.label}
          </a>
        );
      })}
    </div>
  );
}

const wrap: React.CSSProperties = {
  display: 'inline-flex', gap: 4, padding: 4, marginTop: 22,
  background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 12,
};
const tab: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 650,
  color: C.muted, textDecoration: 'none', fontFamily: FONT, whiteSpace: 'nowrap',
};
const tabOn: React.CSSProperties = {
  background: C.panel, color: C.ink, boxShadow: '0 1px 2px rgba(17,17,17,.06)',
};
