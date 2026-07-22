// GROWTH — the single CRM + Marketing desk (Saudagar). One worker that both brings people in
// (marketing, the old Hoka) and works them to paid (CRM, the old Saudagar). This file is the PURE
// core: the identity of the desk, the channel roster, and the one thing the CEO actually needs from
// it — a derived list of what needs a human, computed from live state, so the console never invents a
// task and never hides a real one. No network here; the reads live in the API route and the writes
// nowhere, because this desk proposes and the CEO approves.

import type { AcquisitionSource } from './team';

// --- the desk's identity (mirrors the merged BuddyDef in app/team/buddies.ts) -------------------
export const GROWTH_KEY = 'saudagar';
export const GROWTH_NAME = 'Saudagar';
export const GROWTH_ROLE = 'CGO · Growth';
export const GROWTH_HREF = '/team/growth';

// --- channels -----------------------------------------------------------------------------------
// Every connector platform, with the human label and what it is FOR on the growth desk. The status
// itself (connected / configured / in-review) is live and comes from the connector layer; this is
// only the naming, so one place answers "what is X for".
export const CHANNEL_LABEL: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  linkedin: 'LinkedIn',
  twitter: 'X',
};
export const CHANNEL_FOR: Record<string, string> = {
  meta: 'Facebook, Instagram and paid social',
  tiktok: 'Short vertical video',
  google: 'Search ads, YouTube and SEO',
  linkedin: 'Posts and professional reach',
  twitter: 'Posts and reach on X',
};
export function channelLabel(p: string): string { return CHANNEL_LABEL[p] ?? p; }

// A channel's one-word state, from the two facts the connector layer returns. `connected` means a
// token is stored; `configured` means the keys are present but nobody has connected yet; neither
// means we have not set it up. In-review platforms read as configured-not-connected until their
// platform approval clears, which is honest: the app exists, the door is not open yet.
export type ChannelState = 'connected' | 'configured' | 'off';
export function channelState(c: { configured: boolean; connected: boolean }): ChannelState {
  if (c.connected) return 'connected';
  if (c.configured) return 'configured';
  return 'off';
}

// --- the pipeline the CRM works ----------------------------------------------------------------
// The lifecycle a contact moves through (from lib/crm.ts). Only two stages are measured from our own
// records today: trial and paid, straight off the subscription. The earlier stages need per-contact
// event tracking that is not queryable yet, so they are honestly null — "not tracked yet", never a
// confident zero. A confident zero on a funnel is how a marketing budget goes to the wrong place.
export interface PipelineCounts {
  lead: number | null;
  warming: number | null;
  checkout: number | null;
  trial: number;
  paid: number;
}
export function pipelineFrom(
  o: { trialing: number; active: number; pastDue: number },
  earlier?: { lead?: number | null; warming?: number | null; checkout?: number | null },
): PipelineCounts {
  return {
    lead: earlier?.lead ?? null,
    warming: earlier?.warming ?? null,
    checkout: earlier?.checkout ?? null,
    trial: o.trialing,
    paid: o.active + o.pastDue,
  };
}

// --- the CEO brief: what needs a human ---------------------------------------------------------
// The whole point of "connect it to the CEO". Two kinds, the exact model the console already uses:
//   approve  a bot has prepared it and finishes on a yes (drafts to publish, a win-back to send).
//   needs    only the CEO can (connect a channel, finish a platform review).
// Priority: hi is time-sensitive or blocks revenue, md is worth today, lo is a nudge.

export type GrowthActionKind = 'approve' | 'needs';
export type GrowthPrio = 'hi' | 'md' | 'lo';
export interface GrowthAction {
  id: string;
  kind: GrowthActionKind;
  text: string;
  detail: string;
  prio: GrowthPrio;
}

export interface GrowthInputs {
  isOwner: boolean;
  enabled: boolean;                                   // the connector layer switch (CONNECTORS_ENABLED)
  platforms: Array<{ platform: string; configured: boolean; connected: boolean }>;
  assetStates: string[];                              // every studio asset's state
  cancelRequested: number;
  trialing: number;
  paying: number;
  scheduledCount: number;                             // approved posts queued to go live
}

// Derive the action list from live state. PURE and total: same input, same list, every time, so it is
// unit tested and the CEO's morning brief cannot drift from what is true. Ordered hi -> lo so the
// screen puts the thing that matters first.
export function deriveActions(i: GrowthInputs): GrowthAction[] {
  const out: GrowthAction[] = [];

  // 1. Posts sitting at the approval gate. A bot publishes them the moment the CEO says yes.
  const awaiting = i.assetStates.filter((s) => s === 'awaiting_approval').length;
  if (awaiting > 0) {
    out.push({
      id: 'approve-posts',
      kind: 'approve',
      text: `${awaiting} ${awaiting === 1 ? 'post is' : 'posts are'} ready to publish`,
      detail: 'Approved, they schedule themselves onto the go-live calendar.',
      prio: 'hi',
    });
  }

  // 2. A customer asked to cancel. The win-back is a prepared message; a yes sends it.
  if (i.cancelRequested > 0) {
    out.push({
      id: 'winback',
      kind: 'approve',
      text: `${i.cancelRequested} ${i.cancelRequested === 1 ? 'customer' : 'customers'} asked to cancel`,
      detail: 'A win-back note is drafted for each. Approve to send.',
      prio: 'hi',
    });
  }

  // 3. Channels that are configured but not connected: only the CEO can grant the connection.
  //    (Owner-only: a non-owner cannot connect, so we do not put a door they cannot open in their list.)
  if (i.isOwner) {
    for (const p of i.platforms) {
      if (p.configured && !p.connected) {
        out.push({
          id: `connect-${p.platform}`,
          kind: 'needs',
          text: `Connect ${channelLabel(p.platform)}`,
          detail: 'Keys are in. One authorise on Mistri’s desk opens the channel.',
          prio: 'md',
        });
      }
    }

    // 4. The whole layer is still dark. Nothing publishes until it is switched on.
    if (!i.enabled) {
      out.push({
        id: 'enable-layer',
        kind: 'needs',
        text: 'Turn the publishing layer on',
        detail: 'Channels are wired but CONNECTORS_ENABLED is still off, so nothing goes out yet.',
        prio: 'lo',
      });
    }
  }

  const rank: Record<GrowthPrio, number> = { hi: 0, md: 1, lo: 2 };
  return out.sort((a, b) => rank[a.prio] - rank[b.prio]);
}

// The one number the CEO's overview card shows: how many things this desk needs a human for. Kept
// here, not in the component, so the count on the front page and the list on the desk can never say
// different things.
export function actionCount(actions: GrowthAction[]): number {
  return actions.length;
}

// A tiny, honest source-mix helper for the "where they came from" strip: percentage of the whole,
// rounded, with a guard so an empty database is 0% everywhere rather than NaN.
export function sourceShare(bySource: Record<AcquisitionSource, number>): Array<{ source: AcquisitionSource; count: number; pct: number }> {
  const entries = Object.entries(bySource) as Array<[AcquisitionSource, number]>;
  const total = entries.reduce((n, [, c]) => n + c, 0);
  return entries
    .map(([source, count]) => ({ source, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}
