'use client';

// YOUR LIST. The team prepares everything, then the list sorts itself the way Jag works:
//   Approve, the team handles it  -> a bot finishes it on his yes (approve -> hand off -> done).
//   Needs you                     -> only he can, he ticks it off.
// This is the live face of Munshi's "Needs you" surface (doc 114) and the approval gate: an approve
// item is a prepared action a bot may execute once approved, a needs item is human only.
//
// Data: pass `items`. Today it is SEED_TODOS from ./buddies; later it is GET /api/team/todos with the
// same shape. Approving here just clears the row in the UI. When the endpoint exists, onApprove should
// POST the approval so the bot actually runs; the prop is already here for that.

import { useMemo, useState } from 'react';
import { C, T } from './ui';
import Buddy from './Buddy';
import { buddy, type TodoItem } from './buddies';

const PRIO: Record<string, string> = { hi: '#C0392B', md: C.amber, lo: '#C9C4B8' };

export default function WorkforceTodo({
  items, onApprove, onDoneToggle,
}: {
  items: TodoItem[];
  onApprove?: (id: string) => Promise<void> | void;
  onDoneToggle?: (id: string, done: boolean) => void;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());       // needs-you ticked
  const [working, setWorking] = useState<Set<string>>(new Set()); // approve in flight
  const [handled, setHandled] = useState<Set<string>>(new Set()); // approve finished

  const approve = items.filter((i) => i.kind === 'approve');
  const needs = items.filter((i) => i.kind === 'needs');

  const cleared = (id: string) => done.has(id) || handled.has(id);
  const openCount = useMemo(
    () => items.filter((i) => !cleared(i.id)).length,
    [items, done, handled], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function doApprove(item: TodoItem) {
    if (working.has(item.id) || handled.has(item.id)) return;
    setWorking((s) => new Set(s).add(item.id));
    try { await onApprove?.(item.id); } catch { /* leave it open, do not lie that it ran */ }
    // a short, honest beat so the hand-off reads as the bot taking over
    setTimeout(() => {
      setWorking((s) => { const n = new Set(s); n.delete(item.id); return n; });
      setHandled((s) => new Set(s).add(item.id));
    }, 1100);
  }

  function toggleDone(item: TodoItem) {
    setDone((s) => {
      const n = new Set(s);
      const nowDone = !n.has(item.id);
      nowDone ? n.add(item.id) : n.delete(item.id);
      onDoneToggle?.(item.id, nowDone);
      return n;
    });
  }

  return (
    <div style={S.card}>
      <div style={S.head}>
        <div>
          <div style={S.title}>Your list</div>
          <div style={S.sub}>Approve what the team can finish. Do what only you can.</div>
        </div>
        <span style={{ ...S.counter, ...(openCount === 0 ? S.counterZero : {}) }}>
          {openCount === 0 ? 'all clear' : `${openCount} to clear`}
        </span>
      </div>

      {/* GROUP A */}
      <div style={S.grp}>
        <div style={S.grpHead}>
          <span style={{ ...S.glabel, color: C.river }}>Approve, the team handles it</span>
          <span style={S.hint}>say yes and a buddy does the rest</span>
          <span style={S.gcount}>{approve.filter((i) => !cleared(i.id)).length} left</span>
        </div>
        {approve.map((item) => {
          const b = buddy(item.buddyKey);
          const isWorking = working.has(item.id);
          const isHandled = handled.has(item.id);
          return (
            <div key={item.id} style={{ ...S.row, opacity: isHandled ? 0.72 : 1 }}>
              <span style={{ ...S.prio, background: PRIO[item.prio] }} />
              <span style={S.who}><Buddy def={b} size={34} showBadge={false} stat /></span>
              <div style={S.body}>
                <div style={{ ...S.txt, color: isHandled ? C.muted : C.ink }}>{item.text}</div>
                <div style={S.meta}><span style={S.from}>{item.from}</span></div>
              </div>
              <div style={S.ctl}>
                {isHandled ? (
                  <span style={S.doneby}>{(item.doneLabel ?? `Done by ${b.name}`)} ✓</span>
                ) : isWorking ? (
                  <span style={S.doing}><span style={S.spin} /> {b.name} is on it</span>
                ) : (
                  <button style={S.approveBtn} onClick={() => doApprove(item)}>Approve</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* GROUP B */}
      <div style={{ ...S.grp, borderTop: `1px solid ${C.line}` }}>
        <div style={S.grpHead}>
          <span style={{ ...S.glabel, color: C.amber }}>Needs you</span>
          <span style={S.hint}>only you can do these</span>
          <span style={S.gcount}>{needs.filter((i) => !cleared(i.id)).length} left</span>
        </div>
        {needs.map((item) => {
          const b = buddy(item.buddyKey);
          const isDone = done.has(item.id);
          return (
            <div key={item.id} style={{ ...S.row, opacity: isDone ? 0.5 : 1 }}>
              <span style={{ ...S.prio, background: PRIO[item.prio] }} />
              <span style={S.who}><Buddy def={b} size={34} showBadge={false} stat /></span>
              <div style={S.body}>
                <div style={{ ...S.txt, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? C.muted : C.ink }}>{item.text}</div>
                <div style={S.meta}>
                  <span style={S.from}>{item.from}</span>
                  {item.where ? <span style={S.where}>{item.where}</span> : null}
                </div>
              </div>
              <div style={S.ctl}>
                <button aria-label="Mark done" onClick={() => toggleDone(item)}
                  style={{ ...S.check, ...(isDone ? S.checkOn : {}) }}>
                  <svg viewBox="0 0 20 20" style={{ width: 15, height: 15, stroke: '#fff', strokeWidth: 3.4, fill: 'none', opacity: isDone ? 1 : 0 }}><path d="M4 10l4 4 8-9" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {openCount === 0 && (
        <div style={S.celebrate}>
          <div style={{ fontSize: 22 }}>🎉</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.green }}>List clear. Nice one.</div>
          <div style={{ ...T.small, marginTop: 4 }}>The team will refill it tomorrow morning. Go build.</div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 4px rgba(17,17,17,.03)' },
  head: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}`, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: 800, letterSpacing: -0.3 },
  sub: { ...T.small, color: C.muted },
  counter: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, background: C.saffronTint, color: C.amber, fontSize: 12.5, fontWeight: 750, padding: '6px 12px', borderRadius: 999 },
  counterZero: { background: C.greenTint, color: C.green },

  grp: { padding: '4px 0 8px' },
  grpHead: { display: 'flex', alignItems: 'center', gap: 9, padding: '14px 20px 4px' },
  glabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' },
  hint: { fontSize: 11.5, color: C.faint, fontWeight: 500 },
  gcount: { marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: C.faint },

  row: { display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 20px', borderTop: `1px solid ${C.lineSoft}`, transition: 'opacity .3s' },
  prio: { width: 7, height: 7, borderRadius: 5, flex: '0 0 auto', marginTop: 6 },
  who: { flex: '0 0 auto' },
  body: { flex: 1, minWidth: 0 },
  txt: { fontSize: 13.8, fontWeight: 600, lineHeight: 1.4 },
  meta: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' },
  from: { fontSize: 11, color: C.faint },
  where: { fontSize: 10.5, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 6, padding: '2px 6px' },
  ctl: { flex: '0 0 auto', marginLeft: 6, minWidth: 92, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' },

  approveBtn: { border: `1.5px solid ${C.river}`, color: C.river, background: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 750, padding: '7px 14px', borderRadius: 9, cursor: 'pointer' },
  doing: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 750, color: C.river, whiteSpace: 'nowrap' },
  spin: { width: 13, height: 13, border: `2px solid ${C.riverTint}`, borderTopColor: C.river, borderRadius: '50%', display: 'inline-block', animation: 'lkSpin .7s linear infinite' },
  doneby: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 750, color: C.green, whiteSpace: 'nowrap' },

  check: { width: 26, height: 26, borderRadius: 8, border: `2px solid ${C.line}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  checkOn: { background: C.green, borderColor: C.green },

  celebrate: { padding: '22px 20px', textAlign: 'center' },
};
