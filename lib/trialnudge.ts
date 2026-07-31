// THE TRIAL IS ENDING. TELL HIM BEFORE HE FINDS OUT BY BEING LOCKED OUT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS FILE WAS WRITTEN FOR A FOURTEEN DAY TRIAL AND THE TRIAL BECAME SEVEN ON 29 JULY.
//
// Nothing here failed. Every comment still said "day 11 of 14" and "Day 14: it has ended", the
// constant still said three days, and three days before the end of a SEVEN day trial is DAY FOUR.
// So a man who had barely used the product was being told it was nearly over, and the message that
// was supposed to arrive when he was ready to decide arrived while he was still setting up.
//
// That is the whole species: a number that was right about a thing that changed underneath it. It
// was found by reading the file, not by a test, because test/trialnudge.test.mjs asserted the wrong
// value on purpose and was perfectly green.
//
// ⚠️ THE RULE THIS LEAVES BEHIND: the warning is expressed in DAYS BEFORE THE END, and the trial
// length lives in lib/entitlement.ts as TRIAL_DAYS. If TRIAL_DAYS ever moves again, read this file.
// The test now asserts the two AGAINST EACH OTHER, so a change to one without the other goes red.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ---------------------------------------------------------------------------------------------
// WHY WE MAY SAY THIS AT ALL, AND WHY THE SAME WORDS INSIDE THE APP WOULD GET US REJECTED
//
// The app may not contain a price, a checkout, or any nudge towards paying us. That is App Store
// Review Guideline 3.1.3(f), and it is the rule that lets us keep 82% of the subscription instead
// of 70%. But Apple draws the line at the app, not at the customer. Guideline 3.1.3, in Apple's
// own words: "Developers can send communications outside of the app to their user base about
// purchasing methods other than in-app purchase." An email or a WhatsApp message is outside.
//
// ---------------------------------------------------------------------------------------------
// 🔴 ONE MESSAGE ON DAY SIX, NOT TWO, AND JAG'S REASONING IS THE BETTER ARGUMENT.
//
// The weekly summary and "your trial ends tomorrow" both land on day six of seven. They were going
// to be two messages. Jag, 30 July: one is enough, "because I want them to actually use the app
// without having too much of a salesy approach on the trial, so they don't get anything from us
// until they need to, i.e. the day before the trial ends."
//
// So the whole trial is silent until day six, and then ONE message arrives that leads with HIS
// MONEY and mentions ours last. The summary is the message. The trial line is the last sentence.
//
// ⚠️ IT NEVER PRICES ON THE SAVING. Doc 108 is explicit and this is the exact place the temptation
// lives: "we found you £84, that is six months of Lekhio" would be the obvious next sentence and it
// is forbidden. We show him what we found. We do not do the arithmetic that turns it into a pitch.
//
// ---------------------------------------------------------------------------------------------
// ONLY OUR OWN TRIALS. NEVER A STRIPE ONE.
//
// A trial with a stripe_subscription_id is a man who has already handed over a card. He rolls onto
// a paid plan by himself and Stripe emails him about it. Telling him to "add a card" would be
// confusing and slightly insulting. This only ever speaks to the local, no card grants that
// grantTrialIfNone() hands out.

export interface TrialRow {
  // ⚠️ NULLABLE, AND NO LONGER A REASON TO SAY NOTHING. See decideTrialNudge.
  phone: string | null;
  status: string | null;
  current_period_end: string | null;
  stripe_subscription_id?: string | null;
  trial_warn_sent_at?: string | null;
  trial_end_sent_at?: string | null;
  // The account this trial belongs to. Added 30 July: without it there is no way to reach a web
  // customer, because a web customer has no phone until he binds one.
  user_id?: string | null;
}

export type Nudge = 'warn' | 'ended' | null;

// 🔴 ONE DAY BEFORE THE END, WHICH ON A SEVEN DAY TRIAL IS DAY SIX.
//
// Not three, which was right for fourteen days and is day four of seven. Not two, which would be
// day five and is a day he is still forming the habit on. Jag's call, 30 July: the day before.
export const WARN_DAYS_BEFORE = 1;

const DAY = 24 * 3600 * 1000;

export function daysLeft(end: string | null | undefined, now: Date = new Date()): number | null {
  if (!end) return null;
  const t = new Date(end).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now.getTime()) / DAY);
}

// ⚠️ THE PHONE IS NO LONGER CHECKED HERE, AND THAT IS THE SECOND HALF OF THE BUG.
//
// This used to open with `if (!row.phone) return null`, which read as a sensible guard and was in
// fact a policy decision smuggled into a channel check: no WhatsApp number meant no trial warning
// AT ALL, by any route. Every web customer has no phone until he binds one, and launch one is the
// web, so on 10 August this would have warned nobody about anything.
//
// Whether we can REACH him is lib/routing.ts's question, asked per channel, at the moment of
// sending. Whether he is DUE something is this function's question. Keeping the two apart is what
// let the email channel be added without touching a line of policy.
export function decideTrialNudge(row: TrialRow, now: Date = new Date()): Nudge {
  if ((row.status || '').toLowerCase() !== 'trialing') return null;

  // A card is on file. Stripe owns this conversation, not us.
  if (row.stripe_subscription_id) return null;

  const left = daysLeft(row.current_period_end, now);
  if (left === null) return null; // no end date: we do not know, so we say nothing

  // It has ended.
  if (left <= 0) {
    if (row.trial_end_sent_at) return null; // already told him. Once is enough.
    return 'ended';
  }

  // It is about to end.
  if (left <= WARN_DAYS_BEFORE) {
    if (row.trial_warn_sent_at) return null;
    return 'warn';
  }

  return null;
}

// The date he will read, in the form a man in Britain reads it. Never an ISO string.
export function humanDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DAY SIX MESSAGE. His week, and one sentence about ours.
//
// ⚠️ THE FIGURES ARE PASSED IN, NEVER COMPUTED HERE, and that is CLAUDE.md's one engine rule.
// weeklyFigures() and ledgerFor() are the same functions /app renders and the WhatsApp reply
// answers with. A second piece of arithmetic in here would be a fourth reader of one number, and
// /api/ledger's header lists the three times this codebase has already been caught that way.
//
// So this module composes SENTENCES out of figures somebody else worked out. It stays pure, it
// stays import free, and test/trialnudge.test.mjs can attack the wording directly.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface TrialWeek {
  income: number;
  expenses: number;
  profit: number;
  // What Lekhio found him, in pounds, or null when the ledger does not have enough to be
  // confident. NULL AND ZERO ARE DIFFERENT and the difference is a whole sentence: null means we
  // are not going to claim anything, zero means we looked and found nothing. Both omit the line.
  saved: number | null;
  // Whether anything at all has reached his books yet. Drives the honest empty version.
  hasAnything: boolean;
}

// Whole pounds, British formatting, negatives with the sign in front of the symbol. Deliberately a
// local copy of lib/money.ts's rule rather than an import, because this module must stay loadable
// by a bare `node test/x.test.mjs` and an extensionless relative import breaks that. The test
// asserts the two agree, so the copy cannot drift.
function gbp(n: number): string {
  const r = Math.round(Number.isFinite(n) ? n : 0) || 0;
  const abs = Math.abs(r).toLocaleString('en-GB');
  return r < 0 ? `-£${abs}` : `£${abs}`;
}

export const TRIAL_WEEK_SUBJECT = 'Your first week with Lekhio';

// 🔴 THE TRIAL SENTENCE, WRITTEN ONCE, AND IT TAKES THE PRESSURE OFF ON PURPOSE.
//
// "If you would rather not, you do not need to do anything" is not softness, it is the honest
// description of a no card trial: there is no card, so nothing happens unless he acts. A message
// that implied otherwise would be manufacturing urgency out of a fact that does not exist.
const TRIAL_TAIL = [
  'Your free trial ends tomorrow. If you want to carry on, add a card and nothing else changes.',
  'If you would rather not, you do not need to do anything. Nothing gets deleted and your figures stay where they are.',
].join(' ');

// The door for questions is the Lekhio chats on the web, where the answers come off his own rows.
// The link is built from NEXT_PUBLIC_APP_URL per the house rule in CLAUDE.md, never a written out
// domain, and never lekhio.com, a domain we do not own. The env read keeps this module loadable by
// a bare node test, where it simply falls back to the real site.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
const CHATS_LINE = `Any questions about your figures, ask in your Lekhio chats: ${APP_URL}/app/thread`;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 31 JULY: THE ONE MESSAGE OF THE WHOLE TRIAL SENT HIM AT A DOOR THAT DOES NOT OPEN.
//
// There is no bank provider. TrueLayer declined production authorisation on 30 July and Finexer
// want £650 a month before a single connection, so bankFeedOffered() went into lib/bankfeed.ts,
// default OFF, and every dead bank sentence in app/ went behind it. This one did not, because it is
// copy in a lib rather than copy on a screen.
//
// And this is the worst place in the product to leave one. The empty week message exists for the
// man who reached day six with nothing in his books, so this single sentence is the whole of what
// we ask him to do, on the only day we speak to him, one day before he decides whether to pay us.
// Sending him to a connect screen that cannot connect is how that day ends in a cancellation.
//
// So when the offer is off the sentence names a door that opens TODAY. The statement import is the
// closest substitute for a feed, it fills an empty week in one go, and it reads what eleven UK
// banks hand out (lib/statementimport.ts BANKS). The bank sentence returns unchanged when the flag
// comes back on.
//
// ⚠️ RE-DECLARED, NOT IMPORTED. This module is staged into a temp directory by
// test/trialnudge.test.mjs with a fixed dependency list, because Node's type stripping cannot
// resolve an extensionless relative import, so importing lib/bankfeed.ts would break that suite on
// a module resolution error rather than on anything real. It reads the SAME env var, at call time,
// and only the exact string 'true' switches it on. test/wave9_nudges.test.mjs pins the two against
// each other so they cannot drift apart in silence.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function bankFeedOffered(): boolean {
  return process.env.BANK_FEED_OFFERED === 'true';
}

const EMPTY_WEEK_DOOR = () =>
  bankFeedOffered()
    ? 'Connect your bank and everything you spend lands here on its own, with nothing for you to send us.'
    : `Import a bank statement and a whole month lands in your books in one go. Lekhio reads the ones eleven UK banks hand out: ${APP_URL}/app/money/import`;

export function trialWeekMessage(week: TrialWeek): { subject: string; body: string } {
  const lines: string[] = [];

  if (!week.hasAnything) {
    // ⚠️ THE HONEST EMPTY. The reveal learned this on 30 July: a proud "£0 in, £0 out" on the one
    // message of the whole trial is worse than saying nothing, because it reports our own emptiness
    // as if it were his week. So we say what is true and point at the one thing that fixes it.
    lines.push('Your first week is done and there is nothing in your books yet.');
    lines.push('');
    lines.push(EMPTY_WEEK_DOOR());
  } else {
    lines.push(`${gbp(week.income)} in, ${gbp(week.expenses)} out. That leaves ${gbp(week.profit)}.`);
    // Omitted entirely when there is nothing to say, rather than printed as a confident zero.
    if (week.saved !== null && week.saved > 0) {
      lines.push(`We have found ${gbp(week.saved)} you were not claiming.`);
    }
  }

  lines.push('');
  lines.push(CHATS_LINE);
  lines.push('');
  lines.push(TRIAL_TAIL);
  return { subject: TRIAL_WEEK_SUBJECT, body: lines.join('\n') };
}

export const TRIAL_ENDED_SUBJECT = 'Your Lekhio trial has ended';

// The day after. Jag's wording, 30 July, with one thing deliberately not said.
//
// ⚠️ IT NEVER IMPLIES WE ARE HOLDING HIS OWN RECORDS. Gating the product is fair. Suggesting his
// books are behind our paywall is not, and it would not be true: he has a right to his data
// whatever he pays us. So the first line is that they are safe, before anything about money.
export function trialEndedMessage(): { subject: string; body: string } {
  return {
    subject: TRIAL_ENDED_SUBJECT,
    body: [
      'Your trial has ended and your books are safe. Nothing has been deleted.',
      '',
      'Your week is ready to look at. Add a card and it opens back up, along with everything else.',
    ].join('\n'),
  };
}

// THE TEMPLATE PARAMETERS, for the WhatsApp half only. The words themselves live in Meta's
// dashboard, because a template must be approved before it can be sent outside the 24 hour window,
// and docs/39 holds the exact bodies so the thing we approve and the thing we mean stay the same.
//
// ⚠️ THE TEMPLATE CANNOT CARRY HIS FIGURES AND THAT IS FINE. A Meta template body is fixed text
// with numbered slots; putting a whole weekly summary through one would need approval for every
// shape it can take. So WhatsApp gets the short version with the date, EMAIL gets the full message
// above, and lib/routing.ts decides which of them he actually gets.
//
// lekhio_trial_ending   {{1}} = the date it ends, e.g. "27 July"
// lekhio_trial_ended    no parameters
import { T_TRIAL_ENDING, T_TRIAL_ENDED } from './watemplates';

export const TEMPLATE_WARN = T_TRIAL_ENDING;
export const TEMPLATE_ENDED = T_TRIAL_ENDED;

export function templateFor(n: Exclude<Nudge, null>): string {
  return n === 'warn' ? TEMPLATE_WARN : TEMPLATE_ENDED;
}

export function paramsFor(n: Exclude<Nudge, null>, row: TrialRow): string[] {
  return n === 'warn' ? [humanDate(row.current_period_end)] : [];
}
