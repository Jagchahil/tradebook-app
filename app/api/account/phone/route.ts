import { NextRequest, NextResponse } from 'next/server';
import { disconnectPhone } from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';

export const runtime = 'nodejs';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UNPLUG MY PHONE. The door RUN 1 proved did not exist anywhere in the product.
//
// 🔴 THE STORY. A customer's number was bound to an account. He tried to connect it to another
// one and WhatsApp refused: "This number is already connected to a Lekhio account." Correct
// security, and a dead end, because there was no unbind ANYWHERE: not on the web, not on
// WhatsApp, not in settings. lib/walink.ts bindingVerdict returns 'taken' the moment any users
// row holds the number, so one stale binding takes a real handset out of the product for good.
//
// The refusal's own advice was to reply SUPPORT, which fell through to the receipt parser (fixed
// separately), and even a human could only have done this by hand in the database.
//
// ⚠️ IT UNBINDS HIS OWN NUMBER FROM HIS OWN ACCOUNT AND NOTHING ELSE. It never moves a number
// between accounts. That distinction is the whole security model here and it is why this is safe
// to make self service when a takeover never can be: the comment above bindingVerdict argues,
// correctly, that whoever asks to MOVE a number may be the man who wants his colleague's books.
// Nobody has that problem with his own. He proves he holds the account by being signed into it,
// and once he lets go, the number is free for whoever can prove they hold the handset, which is
// what the connect code has always been for.
//
// So the two sided proof the old refusal promised now happens by itself, in the right order and
// with no queue in the middle: the account side lets go here, the handset side claims it there.
//
// ⚠️ NOT GATED BY THE PAYWALL, DELIBERATELY. Same reasoning as erasure and export in lib/gate.ts:
// letting go of a connection is not a feature he can be charged for, and a man whose trial ended
// must not be left holding a number he cannot use and cannot release.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // disconnectPhone clears everything keyed by the number BEFORE unsetting it, and returns false
  // rather than leaving that half done. See its header: doing those two steps the other way round
  // is a GDPR hole this codebase wrote itself a warning about months ago.
  const ok = await disconnectPhone(user.id);

  const form = (req.headers.get('content-type') ?? '').includes('form');
  if (form) {
    return NextResponse.redirect(
      new URL(`/app/you/data?done=${ok ? 'unplugged' : 'unplugfailed'}`, req.url),
      303,
    );
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
