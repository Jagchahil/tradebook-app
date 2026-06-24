import { NextRequest, NextResponse } from 'next/server';
import { draftInvoice, hasClaudeConfig } from '../../../lib/claude';

// The mobile app calls this from a different origin, so allow cross origin use.
// It only drafts invoice text from a description. There is nothing sensitive here.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    if (!hasClaudeConfig()) {
      return NextResponse.json({ error: 'Drafting is not switched on yet.' }, { status: 503, headers: CORS });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: CORS });
    }

    const description = (body as { description?: unknown }).description;
    if (typeof description !== 'string' || description.trim().length < 3 || description.length > 2000) {
      return NextResponse.json({ error: 'Tell me a bit about the job.' }, { status: 400, headers: CORS });
    }

    const drafted = await draftInvoice(description.trim());
    if (!drafted) {
      return NextResponse.json({ error: 'Could not draft that.' }, { status: 502, headers: CORS });
    }

    return NextResponse.json(drafted, { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[draft-invoice] Exception:', message);
    return NextResponse.json({ error: 'Failed to draft.' }, { status: 500, headers: CORS });
  }
}
