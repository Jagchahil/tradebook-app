import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { readAllKb } from '../../../../../lib/supportkb';

export const runtime = 'nodejs';

// PLAYBOOK EXPORT, for the vault mirror. support_kb is the source of truth (edited on /team/playbook);
// the mini mirror job reads this and writes each entry as a readable .md note into the "Lekhio Support"
// folder of Jag's Obsidian vault, so his brain always holds a current copy. Secret-gated the same way as
// the Bridge and the KB ingest (constant-time compare of x-munshi-secret against MUNSHI_SECRET), so only
// the mini can read it. No customer data — only our own playbook.
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

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rows = await readAllKb();
  return NextResponse.json({
    entries: rows.map((r) => ({ slug: r.slug, title: r.title, keywords: r.keywords, body: r.body, updatedAt: r.updated_at })),
  });
}
