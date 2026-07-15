// THE STUDIO AGENT'S BRAIN, minus the actual Claude call and minus the database.
//
// This file is pure: it builds the prompt that turns an idea into a storyboard, it parses and
// SANITISES what the model gives back, and it decides which backlog ideas to draft next. The
// Anthropic call itself lives in lib/claude.ts (draftStoryboard), because every Claude call goes
// through that one file. Keeping the prompt and the parser here means both can be tested without a
// network, and the compliance rails live in code, not in a habit.
//
// THE RAILS ARE NOT OPTIONAL (docs 104, 108, 91). The prompt below hard-codes them, and the parser
// does not trust the model to have obeyed:
//   - never "we file your tax", never "we do your tax for you", never a promised saving number,
//   - never imply HMRC endorses us,
//   - a faceless character voices a situation, never poses as a real customer,
//   - no em dashes, no en dashes, no hyphens used as dashes.

import type { Format, Promise3, Storyboard, Frame, Idea, Asset } from './studio';
import { FORMAT_LABEL, PROMISE_LABEL } from './studio';

export interface DraftInput {
  title: string;
  trade: string | null;
  format: Format;
  promise: Promise3;
}

export interface DraftResult {
  caption: string;
  scene: string;
  source_tag: string;
  script: string | null;
  storyboard: Storyboard;
}

const DOOR = 'Text it. It is in your Lekhio. Free for 14 days, no card.';

// The one message, restated for the model every time so it never drifts.
const SPINE =
  'Lekhio is a WhatsApp back office for UK self employed tradespeople. The core message: filing a ' +
  'tax return is the easy bit, the money is in claiming what you are legally owed and not overpaying. ' +
  'We prepare it, the user approves it. Honest, blunt, British, like a smart mate who is sorted.';

const RAILS = [
  'Never write "we file your tax", "we do your tax for you", or "we slash your bill".',
  'Never promise a specific saving amount. Say "claim what you are entitled to" and "stop overpaying".',
  'Never imply HMRC endorses or approves Lekhio.',
  'The character illustrates a real situation. He must never claim to be a Lekhio customer or give a testimonial.',
  'No em dashes, no en dashes, and no hyphens used as dashes. Use full stops or commas.',
  'British trade voice. Say sorted, handled, logged. Do not say leverage, seamless, solution.',
].join(' ');

// How many frames each format wants, and what a frame means in it.
function formatBrief(format: Format): string {
  if (format === 'carousel') {
    return 'A 6 frame animated carousel that reads on mute. Each frame: "visual" is the illustration, ' +
      '"caption" is the big on screen line, "vo" is null, "seconds" is null. It should tell the journey ' +
      'of the trade, from the dream to the grind to sorted.';
  }
  if (format === 'tip') {
    return 'A 3 frame free tip card. Frame 1 a blunt question, frame 2 the plain answer, frame 3 a soft ' +
      'nudge to a free tool on the site. "vo" is null, "seconds" is null. Genuinely useful on its own.';
  }
  return 'A 5 frame short vertical video, 12 to 25 seconds total. Each frame: "visual" is what we see ' +
    '(real workplace, natural light, handheld), "caption" is the words burned on screen, "vo" is the ' +
    'voiceover line spoken, "seconds" is how long it holds (a small number). Hook in the first frame.';
}

// The full instruction handed to the model. It must return ONLY JSON.
export function storyboardPrompt(input: DraftInput): string {
  const trade = input.trade || 'a UK tradesperson';
  return [
    SPINE,
    '',
    `Write one ${FORMAT_LABEL[input.format]} for ${trade}. The angle to land: ${PROMISE_LABEL[input.promise]}.`,
    `Idea to work from: "${input.title}".`,
    '',
    formatBrief(input.format),
    `End on the door line: "${DOOR}"`,
    '',
    'RULES: ' + RAILS,
    '',
    'Return ONLY valid JSON, no prose around it, in exactly this shape:',
    '{',
    '  "caption": "the post caption, one or two sentences, ending on the door line",',
    '  "scene": "one line on the shot and the vibe",',
    '  "storyboard": [',
    '    { "n": 1, "visual": "...", "caption": "...", "vo": "..." or null, "seconds": 4 or null }',
    '  ]',
    '}',
  ].join('\n');
}

// A tag we can attach to the post and later match to a signup. Deterministic and clean, so the same
// idea always maps to the same tag family. e.g. organic_electrician_money_v1.
export function sourceTagFor(trade: string | null, promise: Promise3): string {
  const t = (trade || 'any').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'any';
  return `organic_${t}_${promise}_v1`;
}

function clampStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max);
}

function toFrame(raw: unknown, i: number): Frame | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const visual = clampStr(o.visual, 300).trim();
  const caption = clampStr(o.caption, 300).trim();
  if (!visual && !caption) return null;
  const voRaw = o.vo == null ? null : clampStr(o.vo, 500).trim();
  const secNum = Number(o.seconds);
  const seconds = Number.isFinite(secNum) && secNum > 0 && secNum <= 60 ? Math.round(secNum) : null;
  return { n: i + 1, visual, caption, vo: voRaw && voRaw.length ? voRaw : null, seconds };
}

// Parse the model output into a clean DraftResult, or null if it is unusable. Trusts nothing: it
// renumbers the frames, clamps every string, and drops anything empty.
export function parseStoryboardDraft(text: string, input: DraftInput): DraftResult | null {
  let jsonText = text.trim();
  // Strip a ```json fence if the model added one.
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  // Fall back to the first {...} block.
  if (!jsonText.startsWith('{')) {
    const brace = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (brace >= 0 && end > brace) jsonText = jsonText.slice(brace, end + 1);
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }

  const framesRaw = Array.isArray(obj.storyboard) ? obj.storyboard : [];
  const storyboard: Storyboard = [];
  for (let i = 0; i < framesRaw.length; i++) {
    const f = toFrame(framesRaw[i], storyboard.length);
    if (f) storyboard.push(f);
  }
  if (storyboard.length === 0) return null;

  const caption = clampStr(obj.caption, 600).trim() || null;
  const scene = clampStr(obj.scene, 400).trim() || null;
  // The script we keep is the spoken lines joined, handy for the team even before anything is made.
  const script = storyboard.map((f) => f.vo).filter(Boolean).join('\n') || null;

  return {
    caption: caption || DOOR,
    scene: scene || '',
    source_tag: sourceTagFor(input.trade, input.promise),
    script,
    storyboard,
  };
}

// Which backlog ideas to draft next. Open ideas first, most voted first, and never an idea that
// already has an asset made from it. Pure, so the agent and any test agree on the choice.
export function pickDraftIdeas(ideas: Idea[], assets: Asset[], count: number): Idea[] {
  const usedIdeaIds = new Set(assets.map((a) => a.idea_id).filter(Boolean) as string[]);
  return ideas
    .filter((i) => i.status === 'open' && !usedIdeaIds.has(i.id))
    .sort((a, b) => b.votes - a.votes || (a.created_at < b.created_at ? -1 : 1))
    .slice(0, Math.max(0, count));
}
