// "Screwfix, £84.30, materials. Reply YES."
//
// The daily digest of what the bank feed picked up, and the one word that confirms
// it. This is the product working the way it promises: text it, it is in your
// Lekhio, and you never open an app.
//
// WHY A DIGEST AND NOT A PING PER TRANSACTION.
//
// A ping per card payment is the nicer feeling and we cannot afford it. A working
// tradesperson has five to fifteen card payments a week, so pinging each one is
// twenty to sixty WhatsApp sends a month. Our entire WhatsApp budget is 57.8p per
// user per month, which is NINETEEN sends (lib/margin.ts). Per transaction pings
// would cost between 60p and £1.80 and take the margin under 80%, which is the one
// number the whole business is built on.
//
// One message a day, listing everything that landed, is twelve to twenty sends. It
// fits.
//
// AND IT CAN BE FREE. Meta does not charge for a message sent inside the 24 hour
// window that opens when the USER last messaged you. So:
//
//     we send the digest  ->  he replies YES  ->  the window reopens
//     ->  tomorrow's digest is FREE
//
// A man who confirms his books each day costs us NOTHING in WhatsApp. The
// confirmation loop pays for itself. Only the first digest after a quiet spell is a
// paid template, and that goes through the existing budget cap and kill switch
// (lib/wabudget.ts), so it can never run away.
//
// Import free, so the node runner can test it directly.

// Meta's free window: 24 hours from the user's last inbound message.
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

// More than this in one message is a wall of text nobody reads.
const MAX_LINES = 8;

export interface DigestEntry {
  id: string;
  vendor: string | null;
  amount: number;
  category: string | null;
}

export function isWindowOpen(lastInboundAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < FREE_WINDOW_MS;
}

function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

// The message itself. Plain, scannable, and it never pretends to have done
// something it has not: these entries are CAPTURED, not counted. Nothing reaches a
// tax figure until he says yes.
export function buildDigest(entries: DigestEntry[]): string | null {
  if (entries.length === 0) return null;

  const shown = entries.slice(0, MAX_LINES);
  const lines = shown.map((e) => {
    const name = (e.vendor ?? '').trim() || 'Something';
    const cat = (e.category ?? '').trim();
    // "Screwfix, £84.30, materials"
    return `${name}, ${gbp(e.amount)}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;
  });

  const more = entries.length - shown.length;
  const head =
    entries.length === 1
      ? 'One thing landed from your bank today.'
      : `${entries.length} things landed from your bank today.`;

  const tail =
    more > 0
      ? `\n\nand ${more} more in the app.`
      : '';

  return (
    `${head}\n\n` +
    lines.map((l) => `• ${l}`).join('\n') +
    tail +
    `\n\nReply YES and I will file the lot. Reply NO and I will leave them for you to check.`
  );
}

// Should we send at all, and will it cost us anything?
//
// The order of these checks matters. We never send an empty digest, we never send a
// second one on the same day, and when a send would cost money we only do it if the
// budget actually allows it. A user who is not worth 3p to reach today will simply
// find his entries in the app, which is where they were going anyway.
export type SendDecision =
  | { send: true; free: true }
  | { send: true; free: false }
  | { send: false; reason: 'nothing_new' | 'already_sent_today' | 'no_budget' | 'sends_disabled' };

export function decideDigest(input: {
  entryCount: number;
  lastInboundAt: string | null;
  lastDigestAt: string | null;
  budgetLeft: number; // paid sends still affordable right now
  sendsEnabled: boolean;
  now?: Date;
}): SendDecision {
  const now = input.now ?? new Date();

  if (input.entryCount === 0) return { send: false, reason: 'nothing_new' };
  if (!input.sendsEnabled) return { send: false, reason: 'sends_disabled' };

  // One a day. Two would be nagging, and nagging gets a business blocked.
  if (input.lastDigestAt) {
    const last = new Date(input.lastDigestAt);
    if (
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate()
    ) {
      return { send: false, reason: 'already_sent_today' };
    }
  }

  // FREE: he messaged us in the last 24 hours, so this is a reply, and Meta does not
  // charge for it. Send it regardless of budget, because it costs nothing.
  if (isWindowOpen(input.lastInboundAt, now)) {
    return { send: true, free: true };
  }

  // PAID: a business initiated template. Only if we can actually afford it.
  if (input.budgetLeft <= 0) return { send: false, reason: 'no_budget' };

  return { send: true, free: false };
}

// What a bare "yes" means when a digest is sitting unanswered.
//
// This used to be answered with a pointer to the app, which is exactly the thing we
// promise people they will not have to do. If he says yes, that IS his approval, and
// it is his to give. Nothing irreversible happens here: confirming an entry only
// says "this is really mine", it does not send anything to HMRC and it does not move
// any money. Those still ask, every time.
export type DigestReply = 'confirm' | 'reject' | 'none';

export function readReply(body: string): DigestReply {
  const t = (body ?? '').trim().toLowerCase().replace(/[^a-z ]/g, '');
  if (!t) return 'none';

  if (/^(yes|y|yep|yeah|yea|ok|okay|confirm|confirmed|correct|all good|thats right|sound|aye)$/.test(t)) {
    return 'confirm';
  }
  if (/^(no|n|nope|nah|wrong|not right)$/.test(t)) {
    return 'reject';
  }
  return 'none';
}
