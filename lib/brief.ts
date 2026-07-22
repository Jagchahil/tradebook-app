// THE BRIEF. The front of Hoka's make loop. A plain marketing brief becomes a deterministic slate of
// things to draft. It sits above studioagent, which turns one line into a storyboard, and it spends
// nothing and touches no database, so the strategy a brief produces is fully testable and never
// surprises us at run time.
//
// Doc 111 rule this encodes: every run carries the message across all three promises, and money
// leads because it is the wedge. A brief that asks for one asset still lands a promise. A brief that
// asks for a slate spreads the promises and the trades evenly, so we never ship five money videos
// and forget the honesty cut that is the whole reason a tradesperson trusts us.

import type { Format, Promise3 } from './studio';
import type { DraftInput } from './studioagent';

// The order promises are handed out in. Money leads. Honesty is never dropped: buildStrategy
// guarantees it appears at least once in any slate of three or more.
export const PROMISE_ORDER: Promise3[] = ['money', 'zero_habit', 'honesty'];

// The default format mix for a slate, in order. Video carries the message, the carousel is the one
// people save, the tip is the free value that earns the follow. We lead on video and salt the rest.
export const FORMAT_MIX: Format[] = ['video', 'video', 'carousel', 'video', 'tip'];

// A slate never runs longer than this many assets, whatever a brief asks for. The render caps in
// lib/higgsfield.ts are the spend guard. This is the composition guard, so one brief cannot ask the
// team to draft a hundred storyboards in a sitting.
export const MAX_SLATE = 24;

export interface Brief {
  // What this run is for, in the operator's words. Kept for the record. It is never handed to a model
  // as an instruction, because the rails live in studioagent, not in free text a brief could smuggle.
  goal?: string | null;
  // The trades to speak to. Empty means speak to every trade with one 'any' asset.
  trades: string[];
  // Optional overrides. Left unset, the deterministic defaults above are used.
  promises?: Promise3[];
  formats?: Format[];
  // How many assets this slate should hold. Clamped to 1 to MAX_SLATE.
  count: number;
}

export interface StrategySlot extends DraftInput {
  // Where this slot sits in the run, 1 based, so the calendar can space the slate later.
  slot: number;
}

export interface Strategy {
  slate: StrategySlot[];
  // A one line note on how the slate was composed, for the operator. Never for a model.
  note: string;
}

// Lower case, de duplicated, never empty. An empty trade list means speak to everyone once.
function cleanTrades(trades: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of trades || []) {
    const v = (t || '').trim().toLowerCase();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out.length ? out : ['any'];
}

// A deterministic working title. The storyboard prompt reads this as the idea to work from, so it
// only has to point the draft, not be the final line. Dash free by construction.
function titleFor(trade: string, promise: Promise3): string {
  const who = trade === 'any' ? 'tradespeople' : `${trade}s`;
  if (promise === 'money') return `The money ${who} leave on the table`;
  if (promise === 'zero_habit') return `For ${who}, it is a text not a form`;
  return 'The honest cut, we never file or spend without you';
}

// Compose a brief into a slate. Pure and deterministic: the same brief always yields the same slate,
// which is what lets a test pin the composition and what stops a run drifting between calls.
export function buildStrategy(brief: Brief): Strategy {
  const trades = cleanTrades(brief.trades);
  const promises = brief.promises && brief.promises.length ? brief.promises : PROMISE_ORDER;
  const formats = brief.formats && brief.formats.length ? brief.formats : FORMAT_MIX;
  const count = Math.max(1, Math.min(MAX_SLATE, Math.floor(brief.count) || 1));

  const slate: StrategySlot[] = [];
  for (let i = 0; i < count; i++) {
    const trade = trades[i % trades.length];
    const promise = promises[i % promises.length];
    const format = formats[i % formats.length];
    slate.push({
      slot: i + 1,
      title: titleFor(trade, promise),
      trade: trade === 'any' ? null : trade,
      format,
      promise,
    });
  }

  // Doctrine guarantee: any slate of three or more must carry the honesty promise at least once. The
  // default promise order already does this, so the fix only fires when a brief overrode the order.
  if (count >= 3 && !slate.some((s) => s.promise === 'honesty')) {
    const last = slate[slate.length - 1];
    last.promise = 'honesty';
    last.title = titleFor(last.trade || 'any', 'honesty');
  }

  const note =
    `${count} asset${count === 1 ? '' : 's'} across ${trades.length} trade${trades.length === 1 ? '' : 's'}, ` +
    `promises spread ${promises.join(', ')}.`;
  return { slate, note };
}
