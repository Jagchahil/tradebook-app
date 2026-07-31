'use client';

import { useEffect, useState } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { pencePretty } from '../../lib/messagecost';
import { C, T, S as U } from './ui';

// COST PER CUSTOMER, BY NAME. The founder's settled policy, on a screen: the floor is 80 percent,
// and the cost we spend on each customer must be visible here BEFORE a Meta invoice says it in
// aggregate. From 1 October 2026 Meta bills service replies per message, so the cost of being
// loved lands on the customers who use the product most. This desk exists so that day arrives as
// a number we have been watching, not a surprise on a statement.
//
// TWO RULES, both about not lying.
//
// 1. THE PRIVACY WALL HOLDS. Every figure here is OURS: what WE spent on him in AI calls and
//    messages. Never his phone, never his money. The rows pass the same allowlist discipline as
//    the customer list (COST_ROW_FIELDS in lib/messagecost.ts, tested).
//
// 2. MODELLED AND OBSERVED ARE NOT BLURRED. AI calls and inbound messages are observed counters.
//    Reply COSTS are modelled (one reply per inbound message, at a per message rate Meta has not
//    yet published). The table says which is which, in words, on the screen.

interface Row {
  id: string;
  name: string | null;
  aiCalls: number;
  inboundMessages: number;
  serviceRepliesModelled: number;
  aiPence: number;
  messagePenceNow: number;
  messagePenceFromOct: number;
  marginNowPct: number;
  marginFromOctPct: number;
  repliesWithinFloor: number;
}

interface Payload {
  month: string;
  rows: Row[];
  floorPct: number;
  targetPct: number;
  perMessagePence: number;
  perMessageInferred: boolean;
  regimeLive: boolean;
  regimeFrom: string;
}

export default function CostPerCustomer() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await browserSupabase.auth.getSession();
      const token = s.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/team/costs', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 503) {
        setErr('Could not read the cost counters. This is NOT "nobody costs anything".');
        return;
      }
      if (!res.ok) { setErr('Could not load cost per customer.'); return; }
      setD((await res.json()) as Payload);
    })();
  }, []);

  return (
    <section style={U.section}>
      <div style={U.sectionHead}>
        <h2 style={T.h2}>Cost per customer</h2>
        <span style={U.sectionNote}>this month, heaviest first, read against the 80% floor</span>
      </div>
      <div style={U.panel}>
        {err ? (
          <p style={{ ...U.alarm }}>{err}</p>
        ) : !d ? (
          <div style={{ height: 80 }} aria-busy="true" />
        ) : d.rows.length === 0 ? (
          <p style={S.muted}>No usage recorded this month yet.</p>
        ) : (
          <>
            <table style={U.table}>
              <thead>
                <tr>
                  <th style={U.th}>Customer</th>
                  <th style={U.th}>AI calls</th>
                  <th style={U.th}>AI cost</th>
                  <th style={U.th}>Messages in</th>
                  <th style={U.th}>{d.regimeLive ? 'Reply cost' : 'Reply cost from 1 Oct'}</th>
                  <th style={U.th}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const margin = d.regimeLive ? r.marginNowPct : r.marginFromOctPct;
                  const tone = margin < d.floorPct ? C.red : margin < d.targetPct ? C.amber : C.green;
                  return (
                    <tr key={r.id}>
                      <td style={{ ...U.td, fontWeight: 650 }}>{r.name || 'No name yet'}</td>
                      <td style={U.td}>{r.aiCalls}</td>
                      <td style={U.td}>{pencePretty(r.aiPence)}</td>
                      <td style={U.td}>{r.inboundMessages}</td>
                      <td style={U.td}>{pencePretty(d.regimeLive ? r.messagePenceNow : r.messagePenceFromOct)}</td>
                      <td style={{ ...U.td, color: tone, fontWeight: 700 }}>{margin.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={S.legend}>
              AI calls and messages in are <b style={{ color: C.ink }}>observed</b> counters. Reply
              costs are <b style={{ color: C.ink }}>modelled</b>: one reply per inbound message at{' '}
              {pencePretty(d.perMessagePence)} each{d.perMessageInferred
                ? ', a rate inferred from industry sources until Meta publishes UK figures by 1 September'
                : ''}. Outbound sends are not yet logged per customer, so nothing here is an invoice
              figure yet.{!d.regimeLive
                ? ' Today these replies are free. The margin column shows this same month as it will be billed from 1 October, which is the point of looking now.'
                : ''}{' '}
              A red row is never a customer to cap. It is a conversation to route into the app.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  muted: { color: C.muted, fontSize: 14 },
  legend: { ...T.small, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` },
};
