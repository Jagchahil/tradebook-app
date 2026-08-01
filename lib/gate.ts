// lib/gate.ts. WHAT A MAN MAY DO WHEN HE HAS NOT PAID US.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TRIAL DID NOT END. Found 30 July 2026, and it is the launch one revenue hole.
//
// lib/entitlement.ts has held the rule since 13 July and it is a good rule. `isEntitled` is called
// by exactly two routes, /api/billing/trial and /api/billing/status, and both of them only REPORT
// it as a field in a JSON body. Nothing under app/app/ reads it. No page, no route, no WhatsApp
// handler ever refused anything on the strength of it.
//
// The mobile app does gate: app/(tabs)/_layout.tsx redirects to /paywall. So the paywall was built,
// on the one surface we are not launching. Launch one is the web on 10 August, which means a
// customer signs up, his seven days expire, and he keeps the entire product for ever.
//
// This file is the missing half. lib/entitlement.ts decides WHETHER he is entitled. This decides
// WHAT THAT MEANS, and it is deliberately not the same question.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ READ ONLY, NOT DARK, AND THAT IS THE WHOLE SHAPE OF IT.
//
// The obvious build is a wall: no subscription, no app. It is also wrong, in two separate ways.
//
// His RECORDS are his. He gave us his receipts, his income and his bank lines, and the fact that he
// has stopped paying does not make them ours. Under UK GDPR he has a right of access to them, so a
// product that hides them behind a card form is not merely unkind, it is a compliance problem we
// would have built on purpose.
//
// And the thing he is buying is not the storage, it is the WORK: reading receipts, sorting the
// pile, computing the quarter, answering questions, finding what he can claim. Stopping the work is
// the honest expression of "you are not paying us". Hiding the results of work he already paid for
// is not.
//
// So: he can always SEE. What stops is anything that makes us do something new for him.
//
// ⚠️ AND lib/entitlement.ts'S ASYMMETRY GOVERNS EVERY AMBIGUOUS CASE, quoted from its own header
// because it is the sentence that should decide arguments about this file too:
//
//     "LOCKING A MAN OUT OF HIS OWN RECORDS IS WORSE THAN LETTING HIM HAVE ANOTHER FORTNIGHT FREE.
//      One costs us £12.99. The other costs him his books on the morning his tax is due, and costs
//      us him."
//
// Every unknown here therefore fails OPEN.

// 'open'     everything works
// 'readonly' he can see his books and get them out. Nothing new is done for him.
export type Gate = 'open' | 'readonly';

// What we could actually establish about his subscription, which is NOT the same as what it says.
//
// 🔴 'unreadable' AND 'none' ARE DIFFERENT AND CONFLATING THEM IS THE BUG THIS TYPE PREVENTS.
// getSubscriptionByUser returns null both when the query failed and when the man has no row. One of
// those is our infrastructure having a bad minute and the other is a real fact about him. Treating
// a failed read as "not entitled" would lock out every customer we have during a Supabase blip, at
// the exact moment we are least able to notice.
export type SubscriptionRead =
  | { kind: 'read'; status: string | null; current_period_end?: string | null }
  | { kind: 'none' }
  | { kind: 'unreadable' };

// How long an account with NO subscription row at all is still let through.
//
// ⚠️ THIS EXISTS BECAUSE OF A REAL POPULATION, NOT AS A COURTESY.
//
// A brand new customer normally gets a trial row at the moment he proves his email. Two kinds of
// man end up without one:
//
//   . the repeat identity. grantTrialWithIdentity refuses a second trial per person, and
//     normaliseEmail strips plus aliases, so every jag+barber1..N account is one person who has
//     already had his week. He should be read only, and he is.
//   . the man whose grant simply failed. A blip between minting his account and writing his
//     subscription row leaves a legitimate new customer with nothing, and locking him out on day
//     one over OUR failed write is the worst first impression this product could make.
//
// We cannot tell those two apart from the absence of a row. We CAN tell them apart by the age of
// the account: nobody is in his first week twice. So a new account with no row is let through, and
// an old one is not. The window is the trial length, so it moves when the trial moves.
export function noRowGrace(accountAgeDays: number | null, trialDays: number): Gate {
  // An unreadable age is our data being thin, not his entitlement being false.
  if (accountAgeDays === null || !Number.isFinite(accountAgeDays)) return 'open';
  return accountAgeDays <= trialDays ? 'open' : 'readonly';
}

export function gateFor(
  read: SubscriptionRead,
  entitled: boolean,
  accountAgeDays: number | null,
  trialDays: number,
): Gate {
  // We could not see. That is our failure and he keeps his product while we find it.
  if (read.kind === 'unreadable') return 'open';
  if (read.kind === 'none') return noRowGrace(accountAgeDays, trialDays);
  return entitled ? 'open' : 'readonly';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE TABLE. One row per mutating route, and a decision beside each.
//
// ⚠️ WHY A TABLE AND NOT A CHECK IN EACH ROUTE.
//
// There are forty mutating handlers under app/api. Forty separate `if (!entitled) return 403` lines
// is forty chances to forget one, and the one that gets forgotten is invisible: the route keeps
// working, for everybody, for ever, and nothing goes red. That is exactly how lib/routing.ts came
// to describe a product we did not have.
//
// So the decision lives here, once, and test/gate.test.mjs walks app/api and FAILS THE BUILD if a
// mutating route exists that this table has never heard of. A new route cannot be shipped without
// somebody typing a line into this file, which is the point.
//
// 'always'   runs whatever he has paid. Never gate the way out, the way in, or the way to his data.
// 'entitled' this is the WORK. It stops when he stops paying.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type Rule = 'always' | 'entitled';

export interface GatedRoute {
  route: string;
  rule: Rule;
  why: string;
}

export const GATED_ROUTES: GatedRoute[] = [
  // ── The way in. No account yet, so there is nothing to gate. ──────────────────────────────
  { route: 'app/api/auth/start', rule: 'always', why: 'Signing in. A locked out man must still be able to reach his own account.' },
  { route: 'app/api/auth/verify', rule: 'always', why: 'Signing in, and the route that mints the users row. A man cannot be gated out of reaching his own account.' },
  { route: 'app/api/auth/signout', rule: 'always', why: 'Signing out. Gating this would trap a session open.' },
  { route: 'app/api/signup/code', rule: 'always', why: 'Signing up. There is no subscription to read yet.' },
  { route: 'app/api/signup/verify', rule: 'always', why: 'Signing up, and the route that grants the trial in the first place.' },
  { route: 'app/api/onboard', rule: 'always', why: 'The /start form, fired before an account exists.' },
  { route: 'app/api/waitlist', rule: 'always', why: 'A stranger leaving his name.' },
  { route: 'app/api/lead', rule: 'always', why: 'A stranger leaving his name.' },
  { route: 'app/api/unsubscribe', rule: 'always', why: '🔴 NEVER GATE AN UNSUBSCRIBE. Making a man pay to stop being emailed is the one thing here that is both wrong and unlawful.' },

  // ── The way out of the lock, and the way out of the product. ──────────────────────────────
  { route: 'app/api/billing/checkout', rule: 'always', why: '🔴 THE WAY OUT. Gating the card form behind having paid is the joke version of a paywall.' },
  { route: 'app/api/billing/portal', rule: 'always', why: 'Managing or cancelling a subscription. Must work most when it is broken.' },
  { route: 'app/api/billing/trial', rule: 'always', why: 'Reads and grants the trial. Gating it would make a trial impossible to start.' },
  { route: 'app/api/account/delete', rule: 'always', why: '🔴 HIS RIGHT TO LEAVE. Gating erasure behind payment is a UK GDPR problem, not a growth tactic.' },
  { route: 'app/api/share', rule: 'always', why: 'Getting his figures OUT, to an accountant or himself. His records are his, and this is the route that proves we mean it.' },
  { route: 'app/api/bank/disconnect', rule: 'always', why: 'Revoking our access to his bank. Never gate a withdrawal of consent.' },

  // ── Facts about HIM. Not work we do, and worth more to him than to us. ────────────────────
  //
  // ⚠️ These look gateable and are not. Answering "am I married" or "what do I trade as" is him
  // telling us about himself, which costs us nothing and improves the figures HE already owns. A
  // paywall in front of them would also mean a man who lapses mid setup can never finish, so we
  // would be holding his own tax position hostage to make a point about £12.99.
  { route: 'app/api/business', rule: 'always', why: 'How he trades. His own fact, and the engine is wrong without it.' },
  { route: 'app/api/circumstances', rule: 'always', why: 'Marriage, children, CIS and the rest. His own facts, and the log IS the defence under Finance Act 2026 Sch 22.' },
  // ⚠️ NOT WORK, EVEN THOUGH IT LOOKS TECHNICAL. His VAT number, the date he registered and his
  // scheme are three facts about him, in the same class as "am I married". We do nothing new for
  // him by writing them down, and the figures they correct are already his. A lapsed man who
  // cannot record that he registered for VAT is a lapsed man whose invoices we would keep drawing
  // without VAT on them, which is worse for him than for us. And the DELETE is the elections
  // shape: a fact he gave us and now wants gone is his to remove, whatever he pays.
  { route: 'app/api/vat', rule: 'always', why: 'His VAT number, the date he registered and his scheme. Facts about himself, not work we do, and the registration date is the anchor for the Reg 111 reclaim we promised him. A man whose trial has lapsed must still be able to correct his own record, and the DELETE is the elections shape: what he gave us and now wants gone is his to remove.' },
  { route: 'app/api/personal', rule: 'always', why: 'Marking a line personal. Correcting his own record, and refusing it would leave a wrong figure standing.' },
  { route: 'app/api/onboarding', rule: 'always', why: 'Which setup step he is on. One short string about him.' },
  { route: 'app/api/announcements', rule: 'always', why: 'Dismissing a banner. His own screen.' },
  { route: 'app/api/autonomy', rule: 'always', why: 'How much he lets us do without asking. A permission he grants us, so gating it is backwards.' },
  { route: 'app/api/company/members', rule: 'always', why: 'Who is on his company. Structure, not work.' },
  { route: 'app/api/hmrc/fraud', rule: 'always', why: 'Fraud prevention headers HMRC require. Ours to send, never his to buy.' },

  // ── THE WORK. This is what he is actually paying for. ─────────────────────────────────────
  { route: 'app/api/pile', rule: 'entitled', why: 'Confirming and filing what is waiting. The single most valuable thing we do, and the clearest thing to stop.' },
  { route: 'app/api/ask', rule: 'entitled', why: 'Answering a money question with AI. Work, and the only one here with a per use cost to us.' },
  // 🔴 MARKED 'always' BECAUSE IT CANNOT BE GATED, NOT BECAUSE IT SHOULD NOT BE, AND THAT IS A
  // FINDING RATHER THAN A DECISION.
  //
  // Drafting an invoice is work and it spends AI money, so by every rule in this file it belongs in
  // the group below. It has NO SESSION AT ALL: the phone app posts to it with no token and the only
  // protection is a per IP rate limit and a durable daily cap. There is no user to read a
  // subscription for, so there is nothing here to gate on.
  //
  // ⚠️ AND THE WALLET IS NOT AT RISK, WHICH IS A CORRECTION TO AN EARLIER READING OF THIS FILE.
  //
  // It was first written up here as an open AI drain. It is not. There is an in memory burst limit,
  // a durable per IP daily cap, and a DURABLE GLOBAL DAILY CEILING that fails closed, whose own
  // comment says it exists precisely because X-Forwarded-For can be spoofed. Somebody thought about
  // this properly.
  //
  // What is actually true is smaller and worth stating accurately, because a comment that cries
  // wolf sends the next reader chasing a problem that is not there: a lapsed customer can still
  // draft invoices, and a stranger can spend the day's global allowance and deny it to real ones.
  // A paywall leak and a feature level denial of service, not a wallet.
  //
  // Gate it the day it learns who is asking, which is the day the phone app is rebuilt.
  { route: 'app/api/draft-invoice', rule: 'always', why: 'Drafting an invoice IS work, but this route has no session to gate on: the phone app posts with no token. The spend is already bounded by a per IP cap and a global daily ceiling that fails closed, so this is a paywall leak rather than a wallet risk. Recorded rather than pretended away.' },
  { route: 'app/api/elections', rule: 'entitled', why: 'Claiming use of home. Us finding him money is the product. ⚠️ The POST is gated and the DELETE deliberately is not: he may always UNDO a claim on his own record, and refusing that would leave an election standing that he has asked us to drop.' },
  { route: 'app/api/diary', rule: 'entitled', why: 'The jobs diary. Adding a job and taking one to invoicing are the work: the reminder and the invoice nudge exist because the row does. ⚠️ Only those two actions are gated inside the route. Marking his own job done or removing his own row is him keeping his record straight, always allowed, the elections DELETE shape.' },
  { route: 'app/api/goals', rule: 'entitled', why: 'His goals. Adding one is the work, because the tax planning that reasons about a van or tools goal exists to find him money. ⚠️ Marking his own goal done or removing it is not gated inside the route, the elections DELETE shape: his record is his whatever he pays.' },
  { route: 'app/api/reconcile', rule: 'entitled', why: 'Matching his records up. Work.' },
  { route: 'app/api/learn', rule: 'entitled', why: 'Teaching the categoriser a vendor rule, which then does work for him for ever.' },
  { route: 'app/api/voice/complete', rule: 'entitled', why: 'A transcribed voice note becoming a logged transaction. Capture is work.' },
  { route: 'app/api/bank/connect', rule: 'entitled', why: 'Starting a bank feed, which is us doing his bookkeeping continuously. Disconnect is always allowed; only connecting is gated.' },
  { route: 'app/api/whatsapp/link', rule: 'entitled', why: 'Binding a phone so we will work for him by text. Pointless to allow when the work is stopped, and it would read as a promise we are not keeping.' },
  { route: 'app/api/agent/reassess', rule: 'entitled', why: 'Rakha recomputing his position. Work, and AI spend.' },

  // ── Reads. His own figures, and under read only he keeps every one of them. ───────────────
  //
  // ⚠️ THESE ARE IN THE TABLE EVEN THOUGH THE ANSWER IS ALWAYS THE SAME, and that is the point.
  // The first draft only walked POST, PATCH, PUT and DELETE, which missed twenty six routes
  // including THREE CUSTOMER OAUTH CALLBACKS THAT WRITE ON A GET. A completeness guard with a hole
  // in it is worse than none, because it reports coverage it does not have. Every route under
  // app/api now needs a line here, whatever its method.
  { route: 'app/api/ledger', rule: 'always', why: 'His money, computed from records he already gave us. The one screen he must never lose.' },
  { route: 'app/api/weekly', rule: 'always', why: 'His week. Same reasoning as the ledger.' },
  { route: 'app/api/optimise', rule: 'always', why: 'What we already found him. Hiding work he has paid for would be taking it back.' },
  { route: 'app/api/quarter-pack', rule: 'always', why: 'His quarterly figures to read. Reading is not the work; preparing them was, and it is done.' },
  { route: 'app/api/anomalies', rule: 'always', why: 'Things already flagged on his books.' },
  { route: 'app/api/income-proof', rule: 'always', why: 'Proof of income for a mortgage or a landlord. Gating this could cost him a house over £12.99.' },
  { route: 'app/api/account/export', rule: 'always', why: '🔴 HIS DATA, OUT, IN ONE FILE. Under UK GDPR this is a right, not a feature.' },
  { route: 'app/api/billing/status', rule: 'always', why: 'Whether he is entitled. Gating the answer to that question on the answer would be a loop.' },
  { route: 'app/api/bank/status', rule: 'always', why: 'Whether his bank is connected. A fact about his own account.' },
  { route: 'app/api/bank/institutions', rule: 'always', why: 'The bank picker list. Public information, and useless without connect, which is gated.' },
  { route: 'app/api/conversations', rule: 'always', why: 'His own messages. His records.' },
  { route: 'app/api/conversations/[id]', rule: 'always', why: 'One of his own conversations.' },
  { route: 'app/api/company/owners', rule: 'always', why: 'Who owns his company. Structure, not work.' },
  { route: 'app/api/companies-house', rule: 'always', why: 'A lookup on the public register. Rate limited on its own key, and not something he buys from us.' },
  { route: 'app/api/voice/pending', rule: 'always', why: 'Whether a voice note is still being written up. Status, not work. The work itself is voice/complete, which is gated.' },
  { route: 'app/api/health', rule: 'always', why: 'Ours. No customer, no session, no subscription.' },
  { route: 'app/api/lead/confirm', rule: 'always', why: 'Double opt in confirmation from an email link. A stranger, not a customer.' },

  // ── 🔴 THE THREE OAUTH CALLBACKS THAT WRITE ON A GET. ─────────────────────────────────────
  //
  // A provider redirects his browser back to us and we write a row. They are mutating routes that
  // do not look like mutating routes, which is exactly why the first draft of this table missed
  // them. None of them is gated, and each for its own reason.
  { route: 'app/api/bank/callback', rule: 'always', why: 'The bank redirecting him back after he consented. Refusing HERE would leave consent granted at his bank with nothing recorded our end, which is the worst of both. The gate belongs on bank/connect, which is where the journey starts, and it is there.' },
  { route: 'app/api/hmrc/callback', rule: 'always', why: 'HMRC redirecting him back. Same reasoning: never drop a token he has already authorised, and never leave an OAuth grant dangling.' },
  { route: 'app/api/connectors/[platform]/callback', rule: 'always', why: 'Our marketing connectors, ours not his.' },
  { route: 'app/api/connectors/[platform]/start', rule: 'always', why: 'Our marketing connectors, ours not his.' },
  { route: 'app/api/hmrc/connect', rule: 'always', why: 'Starting HMRC authorisation. His own relationship with HMRC, and we may never stand between a man and his tax office.' },

  // ── And the one that is not his at all. ───────────────────────────────────────────────────
  { route: 'app/api/pay/[id]', rule: 'always', why: '🔴 THIS IS HIS CUSTOMER PAYING HIS INVOICE, not him using Lekhio. Gating it on OUR subscription would stop a third party paying a tradesman money he is owed, which is indefensible.' },

  // ── Not a customer surface at all. ────────────────────────────────────────────────────────
  //
  // ⚠️ LISTED RATHER THAN EXCLUDED. A route that is simply absent from this file is indistinguishable
  // from one somebody forgot, and the test cannot tell the difference either. So the machine paths
  // are written down and marked, and the reason is on the line.
  { route: 'app/api/whatsapp', rule: 'always', why: 'Meta calls this, not a customer. The gate is applied per handler INSIDE it, because one inbound message can be capture (work) or a question about his account (never gated).' },
  { route: 'app/api/stripe/webhook', rule: 'always', why: 'Stripe calls this. Gating it on payment would be a loop.' },
  { route: 'app/api/webhooks/meta', rule: 'always', why: 'Meta marketing webhook. No customer session exists.' },
  { route: 'app/api/webhooks/tiktok', rule: 'always', why: 'TikTok webhook. No customer session exists.' },

  // ── The web input layer, 30 July 2026. Capture from the dashboard itself. ─────────────────
  { route: 'app/api/money/manual', rule: 'entitled', why: 'A typed cash entry becoming a logged transaction. Capture is work, the same judgement as voice/complete, and it stops when he stops paying.' },
  { route: 'app/api/money/receipt', rule: 'entitled', why: 'A receipt photograph read by a paid model and written into his books. The same work the WhatsApp capture does, with the same per call cost to us.' },
  { route: 'app/api/money/import', rule: 'entitled', why: 'A whole bank statement read into his books, deterministically and with no AI. It is the bank feed by another door while the feed has no provider, and continuous bookkeeping is the clearest work in the product, so it stops when he stops paying. His existing rows stay readable everywhere.' },

  // ── The invoices surface on the web, 30 July 2026. ────────────────────────────────────────
  { route: 'app/api/invoices', rule: 'entitled', why: 'Raising a new invoice through the same createInvoice path WhatsApp uses. Work, and unlike draft-invoice this door HAS a session to gate on, so it is gated. He sends the link himself; we never contact his customer. ⚠️ Only creation is gated inside the route. Marking his own invoice sent or paid is him keeping his record straight, always allowed, the elections DELETE shape.' },
  { route: 'app/api/share-books', rule: 'always', why: 'His figures going OUT to a broker, a landlord or an accountant, through the same lib machinery as app/api/share, and the same judgement: his records are his. Revoking a share is a withdrawal of consent and could never be gated anyway.' },

  // ── The You surface, 31 July 2026. His identity and his switches. ─────────────────────────
  //
  // ⚠️ ALL THREE ARE 'always' AND NONE OF THEM IS A NEAR MISS. A locked out man must still
  // control his own contact points: the email he adds here is the address his sign in codes go
  // to, so gating it would gate the way back into his own account, which is the first rule of
  // this whole table. And the reminder switches are opt outs. Making a man pay to stop being
  // messaged is the unsubscribe mistake wearing a different hat.
  { route: 'app/api/you/email/start', rule: 'always', why: 'Sending himself a code to prove a new email. His contact point, and the address his sign in codes arrive at, so gating it can gate him out of his own account.' },
  { route: 'app/api/you/email/verify', rule: 'always', why: 'Typing the code back and binding the proved address. The other half of the same door. Binding never creates an account and never moves a contact, so there is no work here to stop.' },
  { route: 'app/api/you/settings', rule: 'always', why: 'The reminder and weekly summary switches. Turning messages OFF is an opt out and may never sit behind a paywall (PECR), and turning them on costs us nothing.' },

  // ── The Lekhio thread, 31 July 2026. The conversation, on our own turf. ───────────────────
  //
  // ⚠️ ONE ROW, AND THE SPLIT IS THE POINT. Reading the thread is /app/thread, a page, not a
  // route in this table: a locked account keeps every word, because his questions and the
  // answers he already paid for are his records. Posting is this route, and posting is the
  // work: the deterministic intents cost queries and the open questions spend real AI money.
  { route: 'app/api/thread', rule: 'entitled', why: 'Posting to a Lekhio chat. Answering is the work and the AI path spends money, the same judgement as /api/ask. Reading every chat stays free on the pages: his own words are his records.' },
  { route: 'app/api/thread/new', rule: 'entitled', why: 'Starting a new chat, which exists only to post into, and posting is the work. His old chats and everything Rakha flagged stay readable on the pages whatever he pays.' },
];

export function ruleFor(route: string): Rule | null {
  return GATED_ROUTES.find((r) => r.route === route)?.rule ?? null;
}

export function gatedRoutes(): string[] {
  return GATED_ROUTES.filter((r) => r.rule === 'entitled').map((r) => r.route);
}

// What he is told when the work has stopped. One sentence, and it never pretends his books are gone.
export const READONLY_TITLE = 'Your trial has ended';
export const READONLY_LINE =
  'Everything you have is still here and still yours to look at. Add a card and Lekhio gets back to work.';

// The same thing for an API caller, so a form post and the phone app say the same words.
export function readonlyPayload(): { error: string; message: string; entitled: false } {
  return { error: 'not_entitled', message: READONLY_LINE, entitled: false };
}
