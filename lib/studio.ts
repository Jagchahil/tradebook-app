// THE CONTENT STUDIO. The shared brain of the marketing engine, with no React and no database in
// it, so both the server routes and the client screen import the SAME types and the SAME rules.
//
// This file is docs 110, 111 and 112 turned into code. It holds:
//   - the vocabulary (formats, the three promises, the platforms, the lifecycle states),
//   - the ONE forward only state machine that the server owns,
//   - a couple of pure helpers the scoreboard needs,
//   - and the bible content, seeded as storyboards, so the studio is never an empty room.
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

export interface Idea {
  id: string;
  title: string;
  trade: string | null;
  format: Format;
  promise: Promise3;
  note: string | null;
  votes: number;
  status: 'open' | 'promoted' | 'parked';
  author: string | null;
  created_at: string;
}

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

// --- the seed. The bible, as storyboards, so the room is never empty. --------------------------
//
// These are inserted once, only if there are no assets yet (the server checks). They arrive in
// `awaiting_approval`, because in this connector free phase the storyboard IS the thing Jag reviews,
// and approving it is the gate that would, later, release a generation credit. Nothing here is a
// finished file; file_url is null until something is actually made.

export interface SeedAsset {
  title: string;
  trade: string;
  format: Format;
  promise: Promise3;
  caption: string;
  scene: string;
  source_tag: string;
  storyboard: Storyboard;
}

const DOOR = 'Text it. It is in your Lekhio. Free for 14 days, no card.';

export const SEED_ASSETS: SeedAsset[] = [
  {
    title: 'The electrician: filing is the easy bit',
    trade: 'electrician',
    format: 'video',
    promise: 'money',
    caption: 'Filing your tax is the easy bit. Claiming what you are owed is the money. ' + DOOR,
    scene: 'Half boarded loft, natural light, handheld. Blunt, a bit tired, real.',
    source_tag: 'organic_electrician_money_v1',
    storyboard: [
      { n: 1, visual: 'Gloved hand, cable in a half boarded loft', caption: 'Everyone thinks tax is filing on time', vo: 'Everyone reckons doing your tax is filing it on time.', seconds: 3 },
      { n: 2, visual: 'He looks up from the work', caption: 'Filing is the easy bit', vo: 'Filing is the easy bit. A spreadsheet does that.', seconds: 4 },
      { n: 3, visual: 'Quick cuts: van, drill, a Screwfix receipt', caption: 'Van. Tools. Mileage. The March course.', vo: 'The van, the tools, the mileage to three jobs a day, the training course in March. All of that comes off before they tax you.', seconds: 6 },
      { n: 4, visual: 'Phone snaps the receipt in WhatsApp', caption: 'Snap it. Logged. Sorted.', vo: 'Miss it and you pay tax on money you already spent. I text a photo and it is logged.', seconds: 5 },
      { n: 5, visual: 'Reply appears, then the logo', caption: 'You approve everything', vo: 'It never sends a thing to HMRC without me. Text it. It is in your Lekhio.', seconds: 4 },
    ],
  },
  {
    title: 'The plumber: the CIS refund nobody claims',
    trade: 'plumber',
    format: 'video',
    promise: 'money',
    caption: 'If you are a subbie on CIS, HMRC may owe you money back. Most never claim it. ' + DOOR,
    scene: 'Under a sink, torch light, close and real.',
    source_tag: 'organic_plumber_money_v1',
    storyboard: [
      { n: 1, visual: 'Under a sink, spanner in hand', caption: 'On CIS? They take 20% off you', vo: 'If a contractor takes twenty percent off you under CIS,', seconds: 4 },
      { n: 2, visual: 'He turns to camera', caption: 'HMRC may owe YOU', vo: 'there is a good chance HMRC owes you money back at the end of the year.', seconds: 4 },
      { n: 3, visual: 'A deduction statement on the van seat', caption: 'Most lads never claim it', vo: 'Most never claim it because working it out is a nightmare. That is the bit worth real money.', seconds: 6 },
      { n: 4, visual: 'Phone photographs the statement', caption: 'It works out what you are owed', vo: 'Snap the statements, it works out what you are owed, you check it and approve it.', seconds: 5 },
      { n: 5, visual: 'Logo and door line', caption: 'You approve it', vo: DOOR, seconds: 3 },
    ],
  },
  {
    title: 'The barber: you are not bad with money',
    trade: 'barber',
    format: 'video',
    promise: 'money',
    caption: 'Chair rent, clippers, products, card fees. All off your tax. ' + DOOR,
    scene: 'Between cuts, cape over the empty chair, warm shop light.',
    source_tag: 'organic_barber_money_v1',
    storyboard: [
      { n: 1, visual: 'Barber wiping down clippers between cuts', caption: 'Chair rent. Clippers. Products.', vo: 'Chair rent, clippers, the products, the card machine fees.', seconds: 4 },
      { n: 2, visual: 'Gestures around the shop', caption: 'Every one comes off your tax', vo: 'Every one of those comes off your tax and half of you are not putting them down.', seconds: 5 },
      { n: 3, visual: 'Direct to camera', caption: 'You are not bad with money', vo: 'You are not bad with money. You are cutting hair eleven hours a day.', seconds: 4 },
      { n: 4, visual: 'Snaps a receipt on the counter', caption: 'Text the receipt. It sorts it.', vo: 'Submitting on time does nothing for that. Claiming the lot does. Text the receipt, it sorts it, you approve it.', seconds: 6 },
      { n: 5, visual: 'Logo and door line', caption: 'Free for two weeks', vo: DOOR, seconds: 3 },
    ],
  },
  {
    title: 'The builder: the job does not finish in the van',
    trade: 'builder',
    format: 'video',
    promise: 'zero_habit',
    caption: 'The quote unsent, the invoice unchased, a glovebox of receipts. Put it down, text it instead.',
    scene: 'End of day, sat on the tailgate, low sun.',
    source_tag: 'organic_builder_habit_v1',
    storyboard: [
      { n: 1, visual: 'On the tailgate at dusk, tired', caption: 'The job does not finish in the van', vo: 'The job does not finish when you get in the van.', seconds: 4 },
      { n: 2, visual: 'Glovebox open, full of paper', caption: 'The quote. The invoice. The receipts.', vo: 'The quote you did not send, the invoice you did not chase, a glovebox of receipts you will sort on Sunday.', seconds: 6 },
      { n: 3, visual: 'A wry look', caption: 'You will not', vo: 'You will not. Filing the return is not the hard part. Carrying all of it is.', seconds: 4 },
      { n: 4, visual: 'Snaps a receipt as he buys materials', caption: 'Text it when you buy the stuff', vo: 'Text the receipt when you buy the stuff and it is done, logged, ready. You still approve everything.', seconds: 6 },
      { n: 5, visual: 'Logo and door line', caption: 'It is in your Lekhio', vo: DOOR, seconds: 3 },
    ],
  },
  {
    title: 'The honesty cut: any app that says it does your tax is lying',
    trade: 'any',
    format: 'video',
    promise: 'honesty',
    caption: 'HMRC holds you responsible. Always has. We prepare it, you press approve. That never changes.',
    scene: 'Any trade, direct to camera, plain and straight.',
    source_tag: 'organic_any_honesty_v1',
    storyboard: [
      { n: 1, visual: 'Direct to camera, no music', caption: 'Here is the honest version', vo: 'Here is the honest version.', seconds: 2 },
      { n: 2, visual: 'Hold on the face', caption: 'Any app that says it does your tax is lying', vo: 'Any app that tells you it will do your tax for you is having you on.', seconds: 4 },
      { n: 3, visual: 'Steady', caption: 'HMRC holds YOU responsible', vo: 'HMRC holds you responsible, it always has.', seconds: 3 },
      { n: 4, visual: 'A small nod', caption: 'We prepare it. You press approve.', vo: 'What we do is prepare it, catch what you are owed, and hand it to you to approve.', seconds: 5 },
      { n: 5, visual: 'Logo and door line', caption: 'It will never spend a penny without you', vo: 'It will never file or spend a penny without you pressing yes. Not once. ' + DOOR, seconds: 5 },
    ],
  },
  {
    title: 'The journey of an electrician (carousel)',
    trade: 'electrician',
    format: 'carousel',
    promise: 'money',
    caption: 'Filing was always the easy bit. Keeping his money was the point.',
    scene: 'Flat illustration, blue colour world, gentle parallax per frame. Reads on mute.',
    source_tag: 'organic_electrician_journey_v1',
    storyboard: [
      { n: 1, visual: 'Danny proud outside his first van', caption: 'Danny went out on his own. Best decision he ever made.', vo: null, seconds: null },
      { n: 2, visual: 'Mid job, in flow, wiring a board', caption: 'The work was never the problem. He is good at the work.', vo: null, seconds: null },
      { n: 3, visual: 'Slumped at 11pm, receipts everywhere', caption: 'It was everything after. Receipts in the glovebox. A number he could not see.', vo: null, seconds: null },
      { n: 4, visual: 'A brown envelope, a worried look', caption: 'MTD means more submissions. But submitting never cost him. Overpaying did.', vo: null, seconds: null },
      { n: 5, visual: 'Texting a receipt, lighter', caption: 'So he stopped filling forms and started sending texts. Snap it. Approve it.', vo: null, seconds: null },
      { n: 6, visual: 'Back outside the van, sorted', caption: 'Filing was the easy bit. Keeping his money was the point. ' + DOOR, vo: null, seconds: null },
    ],
  },
  {
    title: 'Free tip: can a plumber claim his boots?',
    trade: 'plumber',
    format: 'tip',
    promise: 'money',
    caption: 'Yes, if they are protective and for work. We built a free tool that checks. Link in bio.',
    scene: 'Clean type card, one tip, one answer.',
    source_tag: 'organic_plumber_tip_boots_v1',
    storyboard: [
      { n: 1, visual: 'Bold question card', caption: 'Can a plumber claim his boots?', vo: null, seconds: null },
      { n: 2, visual: 'Plain answer', caption: 'Yes. If they are protective and for the job.', vo: null, seconds: null },
      { n: 3, visual: 'Soft door to the free tool', caption: 'We built a free tool that checks what you can claim. Link in bio.', vo: null, seconds: null },
    ],
  },
];
