import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { replaceKb, type KbInput } from '../../../../../lib/supportkb';

export const runtime = 'nodejs';
export const maxDuration = 30;

// SUPPORT KB INGEST. The mini sync reads the "Lekhio Support" folder in Jag's Obsidian vault, parses each
// note into { slug, title, keywords, body }, and POSTs the whole set here. Gated by the same shared
// secret as the Bridge and Dakiya (constant-time compare of x-munshi-secret against MUNSHI_SECRET), so
// only the mini can write. We REPLACE the table each run: the vault is the source of truth.
function authorised(req: NextRequest): boolean {
  const secret = process.env.MUNSHI_SECRET;
  if (!secret) return false;
  const given = req.headers.get('x-munshi-secret') || '';
  if (given.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { items?: KbInput[] };
  try {
    body = (await req.json()) as { items?: KbInput[] };
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  const ok = await replaceKb(items);
  if (!ok) return NextResponse.json({ error: 'store failed' }, { status: 503 });
  return NextResponse.json({ ok: true, stored: items.length });
}
