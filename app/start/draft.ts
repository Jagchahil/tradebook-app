// app/start/draft.ts. THE SIX ANSWERS, HELD FOR THE LENGTH OF ONE BROWSER TAB.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `/app/setup` never loses an answer because every screen posts to the server before the next
// one draws, so a refresh finds a row already saved. `/start` runs BEFORE an account exists, so
// there is no user_id to hang a server row off, and no table for it either: a new table would
// need to join USER_DATA_TABLES in lib/supabase.ts for the GDPR export and erasure sweep, and
// that file is reserved on this change (see the report this shipped with). So the six answers
// are held in THIS BROWSER TAB only, via sessionStorage, never localStorage.
//
// ⚠️ WHY SESSION AND NOT LOCAL, WEIGHED RATHER THAN ASSUMED. These six answers can carry his
// name, his trade and his email, and UK GDPR applies to this product the same as everywhere else
// in it. localStorage keeps writing until somebody clears it by hand, which on a shared or
// family computer means the next person to open lekhio.app/start sees a stranger's half finished
// signup. sessionStorage is scoped to the tab and is gone the moment that tab closes, which is
// exactly the boundary a shared machine needs and still survives every case Jag named: a
// refresh, a crashed tab the browser offers to restore, a call that backgrounds the browser and
// is returned to in the same tab. What it does NOT survive is the tab being closed outright, and
// that is accepted: on a shared machine, closing the tab is also the moment the risk should end.
//
// REJECTED: a server side draft. Blocked by the reserved file above, and it would also be a
// SECOND copy of an unfinished answer sitting behind no account yet, for a system that already
// warns (test/onboardingweb.test.mjs, item 1) against exactly that shape once an account exists.
// REJECTED: localStorage. Unbounded lifetime on a device this product does not control.
//
// 🔴 CLEARED THE MOMENT THE FLOW COMPLETES. Once he reaches the code screen the six answers have
// already been posted to /api/onboard, so the draft has nothing left to protect, and
// clearDraft() runs before that screen shows. It is also never written with the honeypot field:
// `hp` is a bot trap in page.tsx and must always start empty for a real visitor, restored or not,
// so it has no field here at all.
//
// Kept in its own module, with no JSX and no relative import that needs an extension, so
// test/startdraft.test.mjs can import it directly under bare node the same way every lib/*.ts
// guard test does, and actually exercise the read/write/restore cycle rather than just reading
// the source as text.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const DRAFT_KEY = 'lekhio-start-draft-v1';

// The six question wizard. Named here, once, so page.tsx and this module cannot disagree about
// how many steps a restored draft is allowed to claim to be on.
export const TOTAL = 6;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 'partnership' WAS MISSING HERE ONCE, AND app/app/setup HAS BEEN ASKING FOR IT SINCE 31 JULY.
//
// The web signup used to offer three answers and a partnership was not one of them, so two
// people running a business together picked "A business name", and tradeTypeToBusinessType in
// lib/supabase.ts folded that to sole_trader. The consequences are not cosmetic: he is taxed on
// his share of the firm's profit, not all of it, and stored as a sole trader every figure the
// product shows him is the WHOLE firm's, including the income summary a mortgage lender reads.
// page.tsx's step 2 is where the share itself is asked, not left for later, because
// getBusinessProfile reads an unanswered share as 100%, which is right for everyone except the
// one man it is wrong for.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type TradeType = 'sole' | 'business' | 'ltd' | 'partnership' | null;
const TRADE_TYPES: readonly TradeType[] = ['sole', 'business', 'ltd', 'partnership', null];

export interface StartDraft {
  v: 1;
  t0: number;
  step: number;
  phone: string;
  email: string;
  tradeType: TradeType;
  share: string;
  name: string;
  personName: string;
  trade: string;
  customTrade: string;
  postcode: string;
  address: string;
  vat: boolean | null;
  streams: string[];
}

// Never trusts what comes back. A hand edited or half written value in storage restores to the
// same safe default the field would have had on a first visit, rather than crash the page.
export function readDraft(): StartDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (!d || d.v !== 1) return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      v: 1,
      t0: typeof d.t0 === 'number' && d.t0 > 0 ? d.t0 : Date.now(),
      step: typeof d.step === 'number' && d.step >= 1 && d.step <= TOTAL ? d.step : 1,
      phone: str(d.phone),
      email: str(d.email),
      tradeType: TRADE_TYPES.includes(d.tradeType as TradeType) ? (d.tradeType as TradeType) : null,
      share: str(d.share),
      name: str(d.name),
      personName: str(d.personName),
      trade: str(d.trade),
      customTrade: str(d.customTrade),
      postcode: str(d.postcode),
      address: str(d.address),
      vat: d.vat === true || d.vat === false ? d.vat : false,
      streams: Array.isArray(d.streams) ? d.streams.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

// The only place anything is written. Swallows a full or unavailable store (some private
// browsing modes) rather than let a storage failure take the signup page down with it: he loses
// the safety net for this tab, not the ability to sign up.
export function writeDraft(d: StartDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // Nothing to do. The flow still works without it; it just cannot survive a reload.
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear if storage was never available in the first place.
  }
}
