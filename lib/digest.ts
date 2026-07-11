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

// THE CUT THE DOCTRINE DEMANDS (doc 104, section 3).
//
// "Lekhio decides everything that is reversible. The user decides everything that
// is not."
//
// If a man has already told us Screwfix is materials, and his bank sends us a
// Screwfix payment, and nothing about it looks off, then asking him again is asking
// a question he has already answered. That is not an approval gate. It is an admin
// task we invented and then handed back to him.
//
// So we FILE what he has already taught us, and we ASK only about what is genuinely
// new. One question, about the one thing that is actually a question.
//
// The limits, and they are not negotiable:
//   . only a rule HE taught us counts. The crowd's guess is not his answer.
//   . nothing that looks personal is ever auto filed (a benefit, a refund, a bet).
//   . the FILING to HMRC still asks. Every time. That is the irreversible one.
//   . he is told exactly what was filed, and can undo any of it.
export interface DigestSplit {
  // Filed on his behalf, because he had already told us about these vendors.
  filed: DigestEntry[];
  // Genuinely new. These are what he is asked about.
  asking: DigestEntry[];
}

// SHOULD WE FILE THIS WITHOUT ASKING HIM?
//
// This is the most dangerous function in the file, so it lives here in the open,
// with tests, instead of buried inline in the sync where nobody could check it.
//
// Getting it wrong in one direction is an inconvenience: we ask him about a shop he
// has already told us about, and he is mildly annoyed. Getting it wrong in the OTHER
// direction puts a child tax credit into a man's taxable income without him ever
// seeing it. Those are not the same mistake, so this fails towards ASKING.
//
// Four conditions. ALL of them must hold.
export function shouldAutoFile(input: {
  // Where our knowledge of this vendor came from. Only 'user' counts: the crowd's
  // opinion is a guess, not his answer.
  source: 'user' | 'crowd' | 'none';
  // Whether he told us this vendor is not business money.
  knownPersonal: boolean | null;
  // Whether the personal detector thinks this looks like a benefit, a refund, a bet
  // or a personal transfer. Pass the result of looksPersonal() from lib/personal.ts.
  looksPersonal: boolean;
}): boolean {
  // 1. HE taught us this, not the crowd. A stranger's vote is not his decision.
  if (input.source !== 'user') return false;

  // 2. If he already said it is not business money, it is not something to file into
  //    his books at all.
  if (input.knownPersonal === true) return false;

  // 3. Anything that smells like a benefit, a refund, a bet or a transfer from a
  //    person NEVER gets filed silently, however well we think we know the vendor.
  //    This is the guard that stops the exact bug we found in the real books.
  if (input.looksPersonal) return false;

  return true;
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

// "Screwfix, £84.30, materials"
function line(e: DigestEntry): string {
  const name = (e.vendor ?? '').trim() || 'Something';
  const cat = (e.category ?? '').trim();
  return `${name}, ${gbp(e.amount)}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;
}

// The message. It says what we DID, and then asks about the one thing that is
// actually a question.
//
// It never dresses up a decision as a question, and it never hides one either. If we
// filed something on his behalf, he is told, in the same breath, with the shop and
// the money and the category, and one word undoes it.
export function buildDigest(split: DigestSplit): string | null {
  const { filed, asking } = split;
  if (filed.length === 0 && asking.length === 0) return null;

  const parts: string[] = [];

  if (filed.length > 0) {
    const shown = filed.slice(0, MAX_LINES);
    const more = filed.length - shown.length;
    parts.push(
      filed.length === 1
        ? 'I filed one thing for you today, because you have told me about it before.'
        : `I filed ${filed.length} things for you today, because you have told me about them before.`,
    );
    parts.push(shown.map((e) => `• ${line(e)}`).join('\n') + (more > 0 ? `\n• and ${more} more` : ''));
  }

  if (asking.length > 0) {
    const shown = asking.slice(0, MAX_LINES);
    parts.push(asking.length === 1 ? 'One I do not recognise:' : `${asking.length} I do not recognise:`);
    parts.push(shown.map((e) => `• ${line(e)}`).join('\n'));
    parts.push('Reply YES to file those too, or tell me what they were and I will remember.');
  } else if (filed.length > 0) {
    // Nothing to ask, so we do not ask. We say what we did and get out of the way.
    // That is the whole point.
    parts.push('Nothing needs you. Reply NO if any of that looks wrong.');
  }

  return parts.join('\n\n');
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
