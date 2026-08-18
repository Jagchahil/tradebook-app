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
// ⚠️ IT USED TO BE IMPORT FREE, "so the node runner can test it directly", AND THAT PROPERTY WAS
// TRADED AWAY DELIBERATELY ON 18 AUGUST 2026 BY B30. The one import is lib/money.ts, which is
// itself pure and exists precisely so that a sweep never finds seventeen money formatters again.
// The local one here was the eighteenth: `£${Math.abs(n).toFixed(2)}` printed "£1034.30", with no
// thousands separator, which is neither of this product's two money families. Keeping the property
// meant keeping a private formatter, which is the thing lib/money.ts was written to stop.
//
// test/digest.test.mjs now stages this module and lib/money.ts the way eight other suites already
// stage their chain, because Node's type stripping cannot resolve an extensionless relative import.
// That is the whole cost.

import { gbpAbs2 } from './money';

// Meta's free window: 24 hours from the user's last inbound message.
const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

// More than this in one message is a wall of text nobody reads.
//
// ⚠️ AND IT APPLIES TO WHAT HE IS TOLD, NEVER TO WHAT HE IS ASKED. B30, 18 August 2026, signed off
// by Jag. Until today it capped BOTH lists, so a man with twelve unrecognised entries read "12 I do
// not recognise:", saw eight of them, and then read "Reply YES to file those too". Four rows he was
// never shown, in the one message in this product whose entire job is to ask.
//
// The reason for the cap is a good reason for the FILED list, which he is only being told about and
// can undo. It is not a reason on the ASKING list. handleAck's own comment says "He can only
// approve what he was shown", and this cap was what made that false. The list is bounded at twenty
// by bankEntriesForDigestMany, so the worst case is twenty lines, and twenty lines he must decide
// about beats eight lines and four decisions taken for him.
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE LINE CARRIES THE DIRECTION NOW, AND UNTIL 18 AUGUST 2026 IT COULD NOT. B30.
//
// supabase/schema.sql, line 627, verbatim: "Income vs expense is the sign of `amount`. Expenses are
// negative." The old local formatter was `£${Math.abs(n).toFixed(2)}`, so the sign, which is the
// ONLY thing in the row saying which way the money went, was thrown away before it reached the
// sentence. A £900 sale and a £900 spend both printed "Wickes, £900.00, labour".
//
// And it is reachable, not theoretical: bankEntriesForDigestMany filters source_type, confirmed and
// is_personal, and nothing else. A bank statement import carries credits as well as debits, so
// money IN has been landing in that list since the importer was built.
//
// ⚠️ gbpAbs2 RATHER THAN gbp2, AND lib/money.ts's OWN WARNING IS WHY: the magnitude only formatters
// may be used "only where the sentence carries the direction". So the sentence carries it. "in" is
// this product's word for it already: lib/agent.ts's Monday brief says "£22,910 in, £5,286 out".
// Expenses say nothing extra, because they are the common case and reading them was never wrong.
//
// ⚠️ `>= 0` IS INCOME, TAKEN FROM THE SCHEMA'S OWN SQL rather than chosen here: the year to date
// views read `case when t.amount >= 0 then t.amount end as income`. A zero row is neither, and
// calling it money in is harmless and keeps this expression identical to the one the database uses.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// "Screwfix, £84.30, materials", and "Wickes, £900.00 in, labour"
function line(e: DigestEntry): string {
  const name = (e.vendor ?? '').trim() || 'Something';
  const cat = (e.category ?? '').trim();
  const direction = e.amount >= 0 ? ' in' : '';
  return `${name}, ${gbpAbs2(e.amount)}${direction}${cat && cat.toLowerCase() !== 'other' ? `, ${cat}` : ''}`;
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

    // NOTE THE WORDING, IT IS LOAD BEARING.
    //
    // This said "I filed 3 things FOR YOU today, because you have told me about them
    // before." Both halves could be false. `filed` is every confirmed bank entry from
    // the last day, and a man who opened the app and tapped confirm himself confirmed
    // them himself. We would then have taken the credit for his work, and invented a
    // reason ("you told me before") for a decision he made, not us.
    //
    // Nobody would ever have reported it. He would just have quietly learned that the
    // thing narrating his money does not know what happened, and stopped reading it.
    //
    // So we say the only thing we know for certain is true: it landed, and it counts.
    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🔴 AND THE SENTENCE ABOVE WAS STILL NOT TRUE. RUN 2, 13 August 2026, 00:00.
    //
    // A florist who had uploaded a YEAR of bank statements that afternoon was told at midnight:
    // "20 things landed from your bank today, and they count", followed by six SumUp payouts, a
    // Porters run dated 6 August and a Biffa bill.
    //
    // Two words were wrong and each was wrong on its own.
    //
    //   "FROM YOUR BANK"   There is no bank feed. CLAUDE.md's control doctrine says so as a
    //                      POSITION: "We have no bank provider, and that is a position rather
    //                      than an apology. Nothing enters your books that you did not put
    //                      there." She put these there, by hand, through the upload door. The
    //                      one sentence this product should never say is the one that describes
    //                      a feed it has deliberately not built, and it was saying it nightly.
    //                      (bankEntriesForDigestMany filters source_type = 'bank_feed', which is
    //                      the value insertBankTransactions writes for a CSV IMPORT too. The
    //                      column name is the whole of the mistake.)
    //
    //   "TODAY"            The query is created_at within 24 hours, which for an import is the
    //                      moment the file was read, not the day the money moved. Her rows were
    //                      dated across twelve months. Not one of them landed today.
    //
    // ⚠️ THE FIX IS THE SAME ONE THIS COMMENT BLOCK ALREADY MADE ONCE, APPLIED AGAIN. The note
    // above records taking out "I filed 3 things FOR YOU" because we would have been claiming
    // his work. This is the identical error one clause along: claiming a CHANNEL we do not have,
    // for money that arrived on a day it did not. So it says the only thing we know for certain
    // is true again: these are in his books, and they count.
    // ═══════════════════════════════════════════════════════════════════════════════════
    parts.push(
      filed.length === 1
        ? 'One thing is in your books and counting:'
        : `${filed.length} things are in your books and counting:`,
    );
    parts.push(shown.map((e) => `• ${line(e)}`).join('\n') + (more > 0 ? `\n• and ${more} more` : ''));
  }

  if (asking.length > 0) {
    // 🔴 NO SLICE. See MAX_LINES above: the count in the heading and the number of lines below it
    // are the same number, always, because he is about to be asked a question about them.
    parts.push(asking.length === 1 ? 'One I do not recognise:' : `${asking.length} I do not recognise:`);
    parts.push(asking.map((e) => `• ${line(e)}`).join('\n'));
    parts.push('Reply YES to file those too, or tell me what they were and I will remember.');
  } else if (filed.length > 0) {
    // ═══════════════════════════════════════════════════════════════════════════════════
    // 🔴 "NOTHING NEEDS YOU" WAS A FALSE ALL CLEAR ABOUT MONEY. RUN 2, 13 August 2026.
    //
    // `asking` is scoped to source_type = 'bank_feed', so it can only ever see one door. At
    // midnight this said "Nothing needs you" to a customer with £380 sitting in her pile,
    // waiting for a decision, because that row came from the chat and not from a statement.
    //
    // A digest that says nothing needs you is the ONE sentence a busy person acts on: it is
    // permission to close the phone. Saying it while money waits is worse than saying nothing,
    // and it is worse the more the customer trusts it.
    //
    // ⚠️ SO IT NAMES ITS OWN SCOPE. We cannot widen the query from here (this file is pure and
    // takes what it is given), and widening it upstream would change which rows the digest
    // ASKS about, which is a bigger decision than a wording fix. What we can do is stop the
    // sentence claiming more than it checked. "Nothing here needs you" is true of what it saw.
    // The full scope fix is written up as R2-F22 and is not this packet's to make.
    // ═══════════════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 AND IT NO LONGER CONTRADICTS THE 08:00 TEXT. B30, 18 August 2026, signed off by Jag.
    //
    // This said "Nothing here needs you. Reply NO if any of that looks wrong." at 00:01. The agent
    // alert's approved template says "You approve everything, nothing sends itself." at 08:00, to
    // the same man, on the same phone. Read one after the other they disagree about whether his
    // books move without him, and they are both trying to say the same true thing.
    //
    // They do move. Entries land, and that is the product working: doc 104, "Lekhio decides
    // everything that is reversible. The user decides everything that is not." What never moves
    // without him is the irreversible half, and naming it is what makes both sentences true.
    //
    // ⚠️ THE WORD "here" STAYS, AND IT IS NOT A FILLER. R2-F22 put it there because `asking` is
    // scoped to one door, so this sentence can only ever be true of what it looked at. "Nothing
    // needs you" without it was a false all clear to a woman with £380 waiting in another pile.
    //
    // ⚠️ AND THE 08:00 SIDE WAS DELIBERATELY LEFT ALONE. Its words live in a Meta approved
    // template, so changing them means a re approval, and the AGENT_TEMPLATES_APPROVED gate shuts
    // while it is pending. This side is sendText, free form, and costs nothing. Jag's call.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    parts.push('Nothing here needs you tonight. Entries land in your books on their own; nothing reaches HMRC without your yes. Reply NO if any of that looks wrong.');
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

// WHAT A BARE "YES" MEANS: see matchAck in lib/waintents.ts. It lives there, once.
//
// There used to be a readReply() here that did the same job, and did it WRONG: it read
// "ok", "sure" and 👍 as a blanket CONFIRM. It had no callers, so it was never the bug
// that bit us. It was the bug waiting to be wired up by the next person who found it,
// searched for "digest reply", and reasonably assumed the function named readReply in
// the digest file was the one to call.
//
// Dead code that looks correct is worse than no code. Deleted on purpose.
