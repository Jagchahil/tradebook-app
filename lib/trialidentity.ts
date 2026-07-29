// WHO HE IS, WHEN WE HAND HIM A FREE WEEK.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AT ALL.
//
// The old guard was one free trial per phone number, enforced by a partial unique index, and it
// was a good guard while the phone was the account key: proving a number cost a text message and
// a SIM. From 29 July 2026 an account is minted on a proved EMAIL and the number is typed, so the
// old guard now protects a field a man can change by typing.
//
// So the subscription records every identifier we hold at the moment of grant, and the grant
// refuses when it recognises him.
//
// ⚠️ THE HONEST LIMIT, WRITTEN DOWN SO NOBODY MISTAKES THIS FOR A WALL.
//
// Three of the four things we hold are typed by him and the fourth is an inbox he can create in a
// minute. This stops the lazy version and nothing more. The control that actually holds is Stripe
// fingerprinting the CARD at the end of onboarding, which refuses the same card a second trial.
// This file is the cheap first pass in front of that, not a substitute for it.
//
// PURE. No I/O, no database, no clock beyond a caller supplied default. The reads and writes live
// in lib/supabase.ts, per CLAUDE.md rule 2, so test/trialidentity.test.mjs can attack the rules
// directly.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Mailboxes where a dot in the local part is ignored by the provider, so dave@ and d.a.v.e@ are
// one person. This list is deliberately tiny. See normaliseEmail for why guessing is dangerous.
const DOTLESS_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

// Providers that alias one domain onto another. Same inbox, two spellings.
const DOMAIN_ALIASES: Record<string, string> = { 'googlemail.com': 'gmail.com' };

// ⚠️ TWO RULES HERE AND ONLY ONE OF THEM IS SAFE EVERYWHERE.
//
// STRIPPING A PLUS TAG IS ALWAYS SAFE. dave+lekhio@example.com and dave@example.com are delivered
// to the same mailbox by definition, so they cannot be two different people. Collapsing them can
// never refuse a genuine new customer, only a returning one.
//
// STRIPPING DOTS IS ONLY SAFE ON GMAIL. Google ignores dots in the local part. Almost nobody else
// does, so on a private domain d.ave@ and dave@ may well be two colleagues, and collapsing them
// would refuse a real man his trial because a workmate had one first. That is the mistake this
// whole file is written to avoid, so the dot rule is allowlisted rather than applied hopefully.
export function normaliseEmail(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return '';

  let local = value.slice(0, at);
  let domain = value.slice(at + 1);

  domain = DOMAIN_ALIASES[domain] ?? domain;

  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOTLESS_DOMAINS.has(domain)) local = local.replace(/\./g, '');

  if (!local) return '';
  return `${local}@${domain}`;
}

// A name, flattened enough that "Smith Electrical Ltd", "smith electrical limited" and
// "Smith  Electrical, Ltd." read as one thing. Used ONLY to raise a flag for a human, never to
// refuse, so being a little too eager here costs nothing.
const COMPANY_NOISE = /\b(ltd|limited|plc|llp|co|company|and|the)\b/g;

export function normaliseName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(COMPANY_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A UK number, digits only, so 07123 456789 and +447123456789 compare equal. Deliberately not
// lib/logindoor's toUkE164: that one decides what may be SENT to, and this one only decides what
// we have seen before. A number too malformed to send to is still perfectly good evidence that
// the same man is back.
export function normalisePhone(raw: string | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length >= 9 ? d : '';
}

// Who is asking for a trial.
export interface TrialIdentity {
  userId: string;
  email: string;
  signupPhone?: string | null;
  personName?: string | null;
  businessName?: string | null;
}

// A trial we have already granted, as read back from public.subscriptions.
export interface PriorGrant {
  user_id?: string | null;
  email_norm?: string | null;
  signup_phone?: string | null;
  person_name?: string | null;
  business_name?: string | null;
}

// 'account', 'email' and 'phone' REFUSE. 'name' and 'business' only flag.
export type MatchKind = 'account' | 'email' | 'phone' | 'name' | 'business';

export interface TrialDecision {
  grant: boolean;
  // Why we refused, when we did. One value, the most specific one we found.
  refusedOn: MatchKind | null;
  // Softer collisions worth a human eye. Never a reason on their own.
  flags: MatchKind[];
}

// ⚠️ WHAT REFUSES AND WHAT ONLY FLAGS, AND WHY THE LINE IS DRAWN HERE.
//
// lib/entitlement.ts already argues the asymmetry in writing: locking a man out of his own books
// is worse than letting him have another fortnight free. One costs us the price of a month. The
// other costs him his records on the morning his tax is due, and costs us him.
//
// An account id and a proved email identify ONE person, so refusing on them cannot hit a stranger.
// A typed phone is specific enough to be worth refusing on too: it is not proof of anything, but
// two men do not share a mobile by accident.
//
// A NAME DOES NOT IDENTIFY ANYONE. There are a great many Dave Smiths and more than one Smith
// Electrical, and a plumber who shares a name with a customer we already have must not be turned
// away by a string comparison. So those raise a flag a human can look at, and the man gets his
// week.
export function decideTrialGrant(identity: TrialIdentity, priors: PriorGrant[]): TrialDecision {
  const flags: MatchKind[] = [];
  if (!identity.userId) return { grant: false, refusedOn: 'account', flags };

  const email = normaliseEmail(identity.email);
  const phone = normalisePhone(identity.signupPhone);
  const person = normaliseName(identity.personName);
  const business = normaliseName(identity.businessName);

  let refusedOn: MatchKind | null = null;
  // Most specific wins, so the reason we show is the one that is actually true rather than
  // whichever row happened to come back first.
  const rank: Record<MatchKind, number> = { account: 4, email: 3, phone: 2, name: 1, business: 1 };
  function refuse(kind: MatchKind) {
    if (!refusedOn || rank[kind] > rank[refusedOn]) refusedOn = kind;
  }

  for (const p of priors) {
    if (p.user_id && p.user_id === identity.userId) refuse('account');
    if (email && normaliseEmail(p.email_norm) === email) refuse('email');
    if (phone && normalisePhone(p.signup_phone) === phone) refuse('phone');
    if (person && normaliseName(p.person_name) === person && !flags.includes('name')) flags.push('name');
    if (business && normaliseName(p.business_name) === business && !flags.includes('business')) flags.push('business');
  }

  return { grant: refusedOn === null, refusedOn, flags };
}

// What a refused man is told. Never "you have had one already, go away": he may genuinely have
// forgotten, and the answer he needs is how to get back into the account he already owns.
export function refusalNote(kind: MatchKind | null): string {
  switch (kind) {
    case 'account':
    case 'email':
      return 'You have had a free trial on this email already. Sign in and pick up where you left off, or add a card to carry on.';
    case 'phone':
      return 'You have had a free trial on this number already. Sign in and pick up where you left off, or add a card to carry on.';
    default:
      return 'You have had a free trial already. Sign in and pick up where you left off, or add a card to carry on.';
  }
}
