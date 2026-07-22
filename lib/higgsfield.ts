// THE RENDER CONTRACT. Every faceless, animated render Hoka commissions passes through this one file,
// the same way every Anthropic call goes through lib/claude.ts and every WhatsApp send through
// lib/whatsapp.ts. Two reasons. One, spend: generation costs credits, so the caps and the kill
// switch live in ONE place a person can find. Two, honesty: the faceless, animated, no real person
// rule is burned into the request here, deterministically, so a storyboard that forgets it still
// cannot become a talking head.
//
// It has NO network in it. The generation itself runs on the Higgsfield MCP, driven by the Hoka
// worker on the mac mini, not by the Vercel app, which cannot reach an MCP. This file is the
// contract between the two: it builds the request the worker executes, enforces the per run and per
// day caps before a credit is touched, and validates the file_url the worker hands back before it is
// ever stored on an asset. That is why the whole module tests with no key and no network.
//
// It ships DARK. STUDIO_GEN_ENABLED is off by default, so acceptRenderResult refuses every url with
// reason 'disabled' and nothing is stored or spent until Jag flips one env line.

import type { Asset, Format } from './studio';
import { houseCopy } from './housestyle';

// --- flags and caps -----------------------------------------------------------------------------

// The one switch that lets any render happen at all. Off by default. The worker reads this through
// the pending endpoint, so with it off the worker is handed nothing to render and spends nothing.
export function STUDIO_GEN_ENABLED(): boolean {
  return (process.env.STUDIO_GEN_ENABLED || '').trim().toLowerCase() === 'true';
}

// A configured Higgsfield key. Separate from the switch on purpose: a key can be present while the
// switch is off, which is the normal dark state before launch.
export function higgsfieldConfigured(): boolean {
  return Boolean((process.env.HIGGSFIELD_API_KEY || '').trim());
}

function intEnv(name: string, fallback: number): number {
  const n = parseInt((process.env[name] || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// The standing spend caps. One brief commissions at most genMaxPerBrief renders, a day at most
// genMaxPerDay, whatever the briefs ask for. Cautious defaults, changed in one env line each.
export function genMaxPerBrief(): number { return intEnv('STUDIO_GEN_MAX_PER_BRIEF', 8); }
export function genMaxPerDay(): number { return intEnv('STUDIO_GEN_MAX_PER_DAY', 24); }

// --- vocabulary ---------------------------------------------------------------------------------

// A rough weight per format, carried on the request for telemetry and future weighted caps. Video is
// the expensive one. The count cap is what actually guards spend today.
export const RENDER_WEIGHT: Record<Format, number> = { video: 3, carousel: 2, tip: 1 };

export function renderWeight(format: Format): number {
  return RENDER_WEIGHT[format] ?? 1;
}

// The faceless, animated rule, stated once and cited by every request. This is the compliance spine
// of the marketing engine turned into a render directive.
export const FACELESS_RULE =
  'Faceless and animated only. Never a real person and never a face on camera. An illustrated or ' +
  'animated character may voice the situation. Vertical, natural trade setting, and it must read on mute.';

// Aspect per format. Vertical for the feed video and the tip card, portrait for the saved carousel.
export function aspectFor(format: Format): '9:16' | '4:5' {
  return format === 'carousel' ? '4:5' : '9:16';
}

export interface RenderFrame {
  n: number;
  visual: string;
  caption: string;
  vo: string | null;
  seconds: number | null;
}

export interface RenderRequest {
  asset_id: string;
  format: Format;
  aspect: '9:16' | '4:5';
  // Scene direction and frames, every visible string cleaned through house style so no dash reaches a
  // caption even if the storyboard carried one.
  scene: string;
  frames: RenderFrame[];
  // The single rule the render must obey no matter what the frames say.
  directive: string;
  weight: number;
}

// --- pure request building ----------------------------------------------------------------------

// Turn an asset and its storyboard into a clean provider request. Pure. Applies house style to every
// visible string and stamps the faceless directive. Never reads env, never spends.
export function buildRenderRequest(
  asset: Pick<Asset, 'id' | 'format' | 'scene' | 'storyboard'>,
): RenderRequest {
  const frames: RenderFrame[] = (asset.storyboard || []).map((f) => ({
    n: f.n,
    visual: houseCopy(f.visual) || '',
    caption: houseCopy(f.caption) || '',
    vo: houseCopy(f.vo ?? null),
    seconds: f.seconds ?? null,
  }));
  return {
    asset_id: asset.id,
    format: asset.format,
    aspect: aspectFor(asset.format),
    scene: houseCopy(asset.scene) || '',
    frames,
    directive: FACELESS_RULE,
    weight: renderWeight(asset.format),
  };
}

// --- the cap, enforced before any spend ---------------------------------------------------------

export interface PlanInput {
  asset_id: string;
  format: Format;
}

export interface PlanResult {
  accepted: PlanInput[];
  skipped: { asset_id: string; reason: string }[];
}

// Decide which assets in a brief may be rendered. The caller orders the assets by priority first;
// here we fill the smaller of the per brief cap and what is left of the day, and mark the rest
// skipped with reason 'over_cap'. Pure, so the spend ceiling is testable without a provider.
export function planRenders(
  assets: PlanInput[],
  opts?: { maxPerBrief?: number; alreadyToday?: number; maxPerDay?: number },
): PlanResult {
  const perBrief = opts?.maxPerBrief ?? genMaxPerBrief();
  const perDay = opts?.maxPerDay ?? genMaxPerDay();
  const usedToday = Math.max(0, opts?.alreadyToday ?? 0);
  const dayLeft = Math.max(0, perDay - usedToday);
  const limit = Math.max(0, Math.min(perBrief, dayLeft));

  const accepted: PlanInput[] = [];
  const skipped: { asset_id: string; reason: string }[] = [];
  for (const a of assets || []) {
    if (accepted.length < limit) accepted.push(a);
    else skipped.push({ asset_id: a.asset_id, reason: 'over_cap' });
  }
  return { accepted, skipped };
}

// --- result ingest, the gate before a url is stored ---------------------------------------------

export interface RenderResult {
  ok: boolean;
  file_url: string | null;
  // When not ok: disabled, no_key, or bad_url.
  reason: string | null;
}

// Validate a file_url the render worker hands back before it is stored on an asset. It must be a real
// https url. We never store a data url or a plain http link on a customer facing post. The dark
// switch and the missing key both refuse here too, so a stray result cannot slip in while off. Pure.
export function acceptRenderResult(
  url: string | null | undefined,
  opts?: { enabled?: boolean; configured?: boolean },
): RenderResult {
  const enabled = opts?.enabled ?? STUDIO_GEN_ENABLED();
  const configured = opts?.configured ?? higgsfieldConfigured();
  if (!enabled) return { ok: false, file_url: null, reason: 'disabled' };
  if (!configured) return { ok: false, file_url: null, reason: 'no_key' };
  const u = (url || '').trim();
  if (!/^https:\/\/[^\s]+$/i.test(u)) return { ok: false, file_url: null, reason: 'bad_url' };
  return { ok: true, file_url: u, reason: null };
}
