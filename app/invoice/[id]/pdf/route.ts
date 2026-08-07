import { NextRequest, NextResponse } from 'next/server';
import { getPublicInvoice } from '../../../../lib/supabase';
import { buildInvoicePdf, invoiceFileName } from '../../../../lib/invoicepdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE INVOICE AS A FILE. The same document as the page beside it, in something he can forward.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ SAME DOOR AS THE PAGE, ON PURPOSE. app/invoice/[id]/page.tsx opens for anybody holding the
// link, with no session, because that is what an invoice is: a paper you send to somebody who
// has never heard of us and may open it months later from their accountant's inbox. This route
// hands the same row to the same reader in a different format, so giving it a different or
// stricter door would mean a customer who can read the invoice cannot save it, which is not a
// security boundary, it is an annoyance dressed as one.
//
// The id in the URL is the capability, exactly as on the page, and the id is a v4 uuid that
// nobody guesses. Nothing else about the account is reachable from here: getPublicInvoice
// selects one invoice and the trader's business details, and no other row of his exists in the
// response.
//
// ⚠️ WHY THIS IS NOT IN lib/gate.ts. That table covers MUTATING routes, and the build fails on a
// mutating route it has never heard of. This one only reads. And on the judgement the table
// itself makes for /api/income-proof and /api/quarter-pack: getting a document OUT is never
// gated, because a man who has stopped paying still has to be able to hand his invoice to
// somebody. Reading is not the work; producing it was, and it is done.
//
// 🔴 Content-Disposition IS attachment, NOT inline. On a phone, inline hands the PDF to the
// browser's own viewer and the man then hunts for a share button that may not exist. attachment
// puts a file in his downloads and in the share sheet, which is the entire point: he is trying
// to forward it to a customer on WhatsApp.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const invoice = await getPublicInvoice(id).catch(() => null);

  // ⚠️ THE SAME WORDS THE PAGE USES FOR A MISSING INVOICE, and a 404 rather than anything that
  // would tell somebody probing ids apart from a real one and a revoked one.
  if (!invoice) {
    return new NextResponse('This invoice could not be found.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let pdf: Buffer;
  try {
    pdf = buildInvoicePdf(invoice);
  } catch {
    // A document we cannot build is never half a document. He gets an honest failure and the
    // page beside this one still works, so he is not stuck.
    return new NextResponse('We could not build that invoice just now. Try again in a minute.', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceFileName(invoice)}"`,
      'Content-Length': String(pdf.length),
      // Same posture as every other document route: never cached by a shared cache, never
      // indexed, and no referrer, so the id cannot leak out through a link he opens next.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
