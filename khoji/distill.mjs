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
