// Khoji distillation. Turns a raw GOV.UK / HMRC update into a clean, sourced
// summary. This is the ONLY part that costs Anthropic credit, and it is dormant
// by default: with KHOJI_DISTILL not set to "on", or no ANTHROPIC_API_KEY, every
// call returns null and the item stays status = needs_distillation, to be picked
// up on a later run once credit is on. Nothing is wasted, nothing is blocked.
//
// Model IDs match the rest of Lekhio (lib/claude.ts): Haiku for the cheap
// classify-and-extract pass. We never send anything but the public feed text.

const MODEL = process.env.KHOJI_MODEL || 'claude-haiku-4-5-20251001';

export function distillEnabled() {
  return process.env.KHOJI_DISTILL === 'on' && Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = [
  'You summarise UK tax and HMRC updates for a bookkeeping tool that serves self employed tradespeople and landlords.',
  'You are given the title and text of one government update. Return STRICT JSON only, no prose, with keys:',
  'summary (one or two plain English sentences, no jargon, no dashes),',
  'effective_date (YYYY-MM-DD or null if not stated),',
  'affects (a short phrase: who this affects, e.g. "CIS subcontractors", "landlords", "all self employed", or "nobody / not relevant"),',
  'confidence (0 to 1, how sure you are this is a real, relevant change),',
  'engine_impact (true only if this changes a tax RATE, THRESHOLD, ALLOWANCE or RULE that a calculator must reflect, else false).',
  'If the update is not actually about UK tax for our users, set affects to "not relevant" and confidence low.',
].join(' ');

// What status a distilled item should land at. The best button is no button (docs/103).
//
// THE PILE. On 12 July 2026 the queue held 65 items and 48 of them were rubbish Khoji had ALREADY
// judged rubbish: "VAT online: service availability and issues", "Teenager turning 16? Don't miss
// out on Child Benefit", average confidence 0.12, `affects: not relevant`. Every one of those was
// sitting there as a decision waiting for a human. That is not a queue. That is Khoji having
// already decided and us refusing to listen to it. So it bins them itself.
//
// ⚠️ AND HERE IS THE TRAP, WHICH IS THE WHOLE REASON THIS FUNCTION IS SEVEN LINES AND NOT ONE.
//
// The obvious rule is "auto-dismiss anything below 0.5 confidence". THE MILEAGE ROW WAS 0.15.
// The single most important item this database has ever held, the one carrying the number our tax
// engine had wrong, would have been silently deleted by that rule. The model's confidence has been
// PROVEN to run backwards on watched pages: 0.95 on three pages we already had right, 0.15 on the
// one we had wrong.
//
// So: a WATCHED PAGE is never auto-dismissed. Not at any confidence. Not ever. Only news feed
// items are, and only when the model says outright that they affect nobody.
//
// (Page items carry a content hash after a # in their source_url. Feed items do not. That is the
// only way to tell them apart, so if you ever change how pageItem() builds a URL, change this.)
// ⚠️ AND THE SECOND GUARD, WHICH I ONLY ADDED AFTER A DRY RUN CAUGHT ME ABOUT TO DELETE THE MOAT.
//
// The first version of this binned any news item the model called irrelevant. Run against the real
// vault, here is what it wanted to throw away:
//
//     employment-income-manual.md
//     cotax-manual.md
//     cwg2-further-guide-to-paye-and-national-insurance-contributions.md
//
// HMRC'S INTERNAL MANUALS. Not news. The Phase 3 depth corpus. The thing doc 104 calls the actual
// moat, the thing no competitor has, the entire reason Khoji exists beyond checking rates. The
// distiller scored them "not relevant" at under 0.3, because it is a summariser being asked a
// question about our business that it has no way to answer.
//
// THAT IS THE THIRD TIME TONIGHT. Mileage: 0.15, "not relevant", held the number we had wrong.
// Student loans: 0.05, "not relevant", nothing was checking it. Now the manuals. The model's
// confidence is not merely unreliable, it is ANTI-CORRELATED with what matters to us, and every
// time it is allowed to decide something we lose the most valuable thing in the pile.
//
// So a manual is never binned. Ever. Whatever the model thinks of it.
export function isManual(item) {
  const url = String(item.source_url || '');
  const title = String(item.title || '');
  return /hmrc-internal-manuals/i.test(url) || /\bmanual\b/i.test(title);
}

export function triageStatus(item, d) {
  if (!d) return 'needs_distillation';

  // 1. A watched rates page. Never binned, at any confidence. The mileage row was 0.15.
  const isWatchedPage = String(item.source_url || '').includes('#');
  if (isWatchedPage) return 'distilled';

  // 2. An HMRC manual. Never binned, at any confidence. This IS the depth corpus.
  if (isManual(item)) return 'distilled';

  // 3. Otherwise: news the model itself says affects nobody, and is unsure about, is rubbish.
  const saysNobody = /not relevant|nobody/i.test(d.affects || '');
  const unsure = typeof d.confidence === 'number' && d.confidence < 0.3;
  return saysNobody && unsure ? 'dismissed' : 'distilled';
}

// Distil one item. Returns the structured fields, or null when dormant or on any
// error (the caller then leaves the row as needs_distillation).
export async function distill(item) {
  if (!distillEnabled()) return null;
  const text = `${item.title || ''}\n\n${(item.raw && (item.raw.summary || item.raw.content)) || ''}`.slice(0, 6000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Title: ${item.title}\nSource: ${item.source_url}\n\n${text}` }],
      }),
    });
    if (!res.ok) {
      console.error(`[khoji] distill HTTP ${res.status} for ${item.source_url}`);
      return null;
    }
    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? '';
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(jsonStr);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 1000) : null,
      effective_date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.effective_date) ? parsed.effective_date : null,
      affects: typeof parsed.affects === 'string' ? parsed.affects.slice(0, 200) : null,
      confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : null,
      engine_impact: parsed.engine_impact === true,
    };
  } catch (err) {
    console.error(`[khoji] distill failed for ${item.source_url}:`, err.message);
    return null;
  }
}
