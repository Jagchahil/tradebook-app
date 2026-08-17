import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../../lib/ratelimit';
import { sessionUser } from '../../../../lib/webauth';
import { saveIdentityDetails, type IdentityDetails } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// WHO HE IS: his own name, his business name, his business address and his trade.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS ROUTE EXISTS. THE B1 EMPTY ACCOUNT WALK, 17 AUGUST 2026.
//
// Until today reconcileSignupToUser was the only writer of any of it, and it runs ONCE, at first
// sign in, off the signups row. There was no field for a name, a business name, an address or a
// trade anywhere in app/app. So an optional step tapped past at /start, or a typo made in one, was
// permanent, and /start step 5 promised the opposite in these words: "Optional. Tap Continue to
// skip and add it when you send your first invoice."
//
// The gate is 'always', for the reason /api/you/financials is: these are HIS OWN FACTS. Storing a
// man his own name is not work we do for him, and his address is a field GOV.UK asks every invoice
// to carry, so putting it behind a paywall would put a legal requirement behind a paywall.
//
// ⚠️ A BOX NOT DRAWN IS NOT A BOX CLEARED. This form posts every box it draws, and the business
// name box is only drawn for a business shaped structure. saveIdentityDetails leaves an absent key
// alone and writes an empty one as null, so a sole trader saving his address can never blank a
// business name he cannot see, and a man who clears his address on purpose gets it cleared.
//
// ⚠️ NO READ MERGE, DELIBERATELY, unlike /api/you/settings. Those two switches share one upsert so
// a write of one had to carry the other. Here each column is written on its own, so there is no
// second field to lose and nothing a failed read could overwrite with a default.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const DEST = '/app/you/settings';

function back(req: NextRequest, code: string): NextResponse {
  const key = code === 'details' ? 'done' : 'e';
  return NextResponse.redirect(new URL(`${DEST}?${key}=${code}`, req.url), 303);
}

// One line, whatever he typed. A textarea gives newlines and the invoice renderer splits the
// stored address on commas (see buildInvoicePdf), so the newlines become the commas it expects
// rather than being printed as one run on line on a document his customer reads.
function oneLine(raw: string): string {
  return raw
    .split(/[\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL(`/in?next=${DEST}`, req.url), 303);

  if (await userBurst('you-details', user.id)) return back(req, 'slow');

  const form = await req.formData().catch(() => null);
  if (!form) return back(req, 'unavailable');

  // Only the boxes that were actually posted. `has` is the whole test: it separates "he cleared
  // this" from "this form does not draw this", which is the difference the comment above turns on.
  const details: IdentityDetails = {};
  if (form.has('name')) details.name = oneLine(String(form.get('name') ?? ''));
  if (form.has('business_name')) details.businessName = oneLine(String(form.get('business_name') ?? ''));
  if (form.has('trade')) details.trade = oneLine(String(form.get('trade') ?? ''));
  if (form.has('address')) details.address = oneLine(String(form.get('address') ?? ''));

  if (Object.keys(details).length === 0) return back(req, 'unavailable');

  const ok = await saveIdentityDetails(user.id, details);
  // 303, so a refresh cannot write it twice.
  return back(req, ok ? 'details' : 'unavailable');
}
