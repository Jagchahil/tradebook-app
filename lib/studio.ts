// THE CONTENT STUDIO. The shared brain of the marketing engine, with no React and no database in
// it, so both the server routes and the client screen import the SAME types and the SAME rules.
//
// This file is docs 110, 111 and 112 turned into code. It holds:
//   - the vocabulary (formats, the three promises, the platforms, the lifecycle states),
//   - the ONE forward only state machine that the server owns,
//   - and a couple of pure helpers the scoreboard needs.
//
// The AI copy generator and its seeded bible storyboards were removed on 31 Jul 2026. Marketing is
// made by hand now, so nothing in here invents a word: these are the shapes a piece Jag wrote
// himself travels in, and the one forward only state machine that moves it.
//
// THE RULE THAT OUTRANKS EVERYTHING IN HERE: nothing in this file is a claim about any customer.
// A storyboard is our creative. A source_tag is our own attribution label. Not one field is a fact
// about a person's money. That is what lets the studio live inside the team console (lib/team.ts).

// --- vocabulary ---------------------------------------------------------------------------------

export type Format = 'video' | 'carousel' | 'tip';
export type Promise3 = 'money' | 'zero_habit' | 'honesty';
export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'linkedin';

// The make loop, in order. doc 111. The server advances an asset along THIS array and no other way,
// so a client can never post a state string it invented.
export const STATES = [
  'idea',
  'scripting',
  'awaiting_approval',
  'scheduled',
  'live',
  'measured',
] as const;
export type AssetState = (typeof STATES)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  video: 'Video',
  carousel: 'Carousel',
  tip: 'Free tip',
};

// The three promises every asset must land one of (doc 111). Said plainly, because the label is
// what a team member picks from a menu, and a menu of jargon is how the message drifts.
export const PROMISE_LABEL: Record<Promise3, string> = {
  money: 'The money you are missing',
  zero_habit: 'It is a text, not a form',
  honesty: 'It never files or spends without you',
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export const STATE_LABEL: Record<AssetState, string> = {
  idea: 'Idea',
  scripting: 'Scripting',
  awaiting_approval: 'Awaiting approval',
  scheduled: 'Scheduled',
  live: 'Live',
  measured: 'Measured',
};

// The default channels a format goes out on. A starting point a human can change per asset, never a
// cage. Short video leads on the vertical platforms, the carousel on the ones people save from.
export function defaultPlatforms(format: Format): Platform[] {
  if (format === 'carousel') return ['instagram', 'facebook', 'linkedin'];
  if (format === 'tip') return ['instagram', 'tiktok', 'linkedin'];
  return ['tiktok', 'instagram', 'youtube'];
}

// --- the state machine, the only way an asset moves --------------------------------------------
//
// Forward only, one step at a time. There is no "jump to live". The gate lives between
// scripting and scheduled: an asset only leaves awaiting_approval because a publish approval was
// recorded, and that check is enforced in the API route, not here, because only the route knows who
// is asking.

export function stateIndex(s: AssetState): number {
  return STATES.indexOf(s);
}

// The next state in the loop, or null at the end. Used to render the one button that moves a card.
export function nextState(s: AssetState): AssetState | null {
  const i = stateIndex(s);
  return i >= 0 && i < STATES.length - 1 ? STATES[i + 1] : null;
}

// Is `to` exactly one step forward from `from`? The server refuses anything else.
export function isLegalAdvance(from: AssetState, to: AssetState): boolean {
  return nextState(from) === to;
}

// The move out of awaiting_approval is the publish gate. Naming it once means the route and the UI
// agree on which transition needs a yes from Jag.
export function isPublishGate(from: AssetState, to: AssetState): boolean {
  return from === 'awaiting_approval' && to === 'scheduled';
}

// --- shapes (mirror the SQL in APPLY_2026-07-15_content_studio.sql) ----------------------------

// One frame of a storyboard. `visual` is what we see, `caption` is the words burned on screen, `vo`
// is the voiceover or line spoken, `seconds` is how long it holds. A carousel frame uses the same
// shape: `visual` is the illustration, `caption` is the big type, `vo` is empty.
export interface Frame {
  n: number;
  visual: string;
  caption: string;
  vo?: string | null;
  seconds?: number | null;
}
export type Storyboard = Frame[];

export interface Asset {
  id: string;
  idea_id: string | null;
  title: string;
  trade: string | null;
  format: Format;
  promise: Promise3;
  script: string | null;
  scene: string | null;
  caption: string | null;
  file_url: string | null;
  platforms: Platform[];
  source_tag: string | null;
  state: AssetState;
  scheduled_for: string | null;
  storyboard: Storyboard;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  asset_id: string;
  kind: 'publish' | 'promote';
  decision: 'approve' | 'reject' | 'changes';
  note: string | null;
  spend_cap_pence: number | null;
  decided_by: string;
  created_at: string;
}

export interface Metric {
  id: string;
  asset_id: string;
  platform: Platform;
  as_of: string;
  reach: number;
  saves: number;
  shares: number;
  clicks: number;
  trials: number;
  entered_by: string | null;
  created_at: string;
}

// --- pure helpers the scoreboard uses ----------------------------------------------------------

export interface MetricTotals {
  reach: number;
  saves: number;
  shares: number;
  clicks: number;
  trials: number;
}

export function emptyTotals(): MetricTotals {
  return { reach: 0, saves: 0, shares: 0, clicks: 0, trials: 0 };
}

// Sum a pile of metric rows into one total per asset. The platform breakdown is kept in the rows;
// the scoreboard's headline is the sum, because the question "did this post work" is answered across
// every channel it ran on, not one at a time.
export function totalsByAsset(metrics: Metric[]): Record<string, MetricTotals> {
  const out: Record<string, MetricTotals> = {};
  for (const m of metrics) {
    const t = (out[m.asset_id] ??= emptyTotals());
    t.reach += m.reach;
    t.saves += m.saves;
    t.shares += m.shares;
    t.clicks += m.clicks;
    t.trials += m.trials;
  }
  return out;
}

// A scoreboard row: one live asset, what it did, and the REAL money number, trials and paying
// customers attributed to its source_tag from our own records. The paying figure is a count of
// people, never a figure about any one of them.
export interface ScoreRow {
  asset: Asset;
  totals: MetricTotals;
  realTrials: number;   // users whose acquisition_source matches this asset's source_tag
  realPaying: number;   // of those, how many are paying us now
}
