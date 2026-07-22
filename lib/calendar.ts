// THE GO LIVE CALENDAR. Pure date math and per platform captions, no database and no network, so the
// spacing of a slate and the shape of every caption are testable and never drift with a server clock.
//
// It answers two questions. When does an approved post go out, and what does its caption say on each
// platform it runs on. UTC throughout. Every caption passes house style, so a dash can never reach a
// feed even if a storyboard carried one.

import type { Asset, Platform } from './studio';
import { houseCopy } from './housestyle';

// The posting cadence. How many go live slots a day, the first slot hour in UTC, the gap between
// slots in hours, and which weekdays are allowed. Gentle on purpose: a trade audience does not want
// six posts a day, and a calm calendar is easier for one person to approve.
export interface Cadence {
  perDay: number;
  firstHour: number;
  gapHours: number;
  days: number[]; // 0 Sunday to 6 Saturday
}

export const DEFAULT_CADENCE: Cadence = { perDay: 1, firstHour: 9, gapHours: 6, days: [1, 2, 3, 4, 5] };

function normCadence(c?: Partial<Cadence>): Cadence {
  const d = DEFAULT_CADENCE;
  const perDay = Math.max(1, Math.min(6, Math.floor(c?.perDay ?? d.perDay)));
  const firstHour = Math.max(0, Math.min(23, Math.floor(c?.firstHour ?? d.firstHour)));
  const gapHours = Math.max(1, Math.min(24, Math.floor(c?.gapHours ?? d.gapHours)));
  const days = (c?.days && c.days.length ? c.days : d.days).filter((n) => n >= 0 && n <= 6);
  return { perDay, firstHour, gapHours, days: days.length ? days : d.days };
}

// Enumerate the first n go live slots at or after fromISO, following the cadence. Pure and
// deterministic: same inputs, same slots.
export function enumerateSlots(fromISO: string, n: number, cadence?: Partial<Cadence>): string[] {
  const c = normCadence(cadence);
  const from = new Date(fromISO);
  const fromMs = from.getTime();
  const out: string[] = [];
  if (!Number.isFinite(fromMs) || n <= 0) return out;
  let day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let guard = 0;
  while (out.length < n && guard < 4000) {
    guard++;
    if (c.days.includes(day.getUTCDay())) {
      for (let k = 0; k < c.perDay && out.length < n; k++) {
        const hour = Math.min(23, c.firstHour + k * c.gapHours);
        const when = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0, 0);
        if (when >= fromMs) out.push(new Date(when).toISOString());
      }
    }
    day = new Date(day.getTime() + 86_400_000);
  }
  return out;
}

// The next slot that is not already taken. Used at approval time to drop one newly approved asset
// onto the calendar without landing on top of one already scheduled. Pure.
export function nextFreeSlot(taken: string[], fromISO: string, cadence?: Partial<Cadence>): string {
  const takenSet = new Set(taken);
  const slots = enumerateSlots(fromISO, takenSet.size + 1, cadence);
  for (const s of slots) if (!takenSet.has(s)) return s;
  return slots[slots.length - 1] ?? new Date(fromISO).toISOString();
}

export interface Booking { asset_id: string; when: string; }

// Assign consecutive slots to a list of assets, in order. One booking per asset. For booking a whole
// slate at once.
export function planCalendar(assetIds: string[], fromISO: string, cadence?: Partial<Cadence>): Booking[] {
  const slots = enumerateSlots(fromISO, assetIds.length, cadence);
  const tail = slots[slots.length - 1] ?? new Date(fromISO).toISOString();
  return assetIds.map((id, i) => ({ asset_id: id, when: slots[i] ?? tail }));
}

// --- captions, tuned per platform --------------------------------------------------------------

// A gentle per platform character budget. The body is the asset's own caption, the tail is a small
// platform hashtag set. Both pass house style so no dash ever ships.
const CAPTION_LIMIT: Record<Platform, number> = {
  tiktok: 150, instagram: 200, youtube: 100, facebook: 280, linkedin: 700,
};
const HASHTAGS: Record<Platform, string> = {
  tiktok: '#trades #selfemployed #uktax',
  instagram: '#trades #selfemployed #tax',
  youtube: '#shorts #trades',
  facebook: '',
  linkedin: '#selfemployed #tradespeople #tax',
};

function trimToWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

// One platform's caption for a base caption. Deterministic and dash free.
export function captionFor(base: string | null | undefined, platform: Platform): string {
  const clean = houseCopy(base || '') || '';
  const tag = HASHTAGS[platform] || '';
  const limit = CAPTION_LIMIT[platform] ?? 200;
  const room = tag ? limit - (tag.length + 1) : limit;
  const body = trimToWord(clean, Math.max(0, room));
  return tag ? (body ? `${body} ${tag}` : tag) : body;
}

// Every platform an asset runs on, with its tuned caption. For the calendar view.
export function platformCaptions(asset: Pick<Asset, 'caption' | 'platforms'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of asset.platforms || []) out[p] = captionFor(asset.caption, p);
  return out;
}
