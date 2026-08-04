import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS PAGE WAS A SECOND WEB LOGIN DOOR, ON SMS, AND IT COULD NOT OPEN FOR ANYBODY.
//
// It asked for a mobile number and posted from the BROWSER, with the anon key, straight to
// Supabase `auth/v1/otp` with `{ phone, create_user: false }`, then verified with `{ type: 'sms' }`.
// Three things were wrong with it and the third is why a paying customer was stuck.
//
//   1. IT CONTRADICTED A DECISION THIS CODEBASE HAD ALREADY WRITTEN DOWN. lib/logindoor.ts, in its
//      own header: "FROM 2 AUGUST 2026 THE WEB SCREEN OFFERS THE ADDRESS ONLY." The reasoning is
//      there too: a text is about 175 times dearer than an email for identical proof, and only the
//      text is worth attacking for money. This was a web screen offering the number only.
//
//   2. IT BYPASSED THE PRODUCT'S OWN FRONT DOOR ENTIRELY. /api/auth/start carries the rate limits,
//      the per target and per source send caps, the spend cap and the origin check. None of that is
//      reachable from a fetch the customer's own browser makes straight to Supabase.
//
//   3. 🔴 A WEB CUSTOMER HAS NO PHONE ON HIS AUTH USER, SO THE CODE COULD NEVER ARRIVE OR VERIFY.
//      Every admin/users write in lib/supabase.ts mints the auth user with { email, email_confirm }
//      and nothing else, at all three creation sites. app/api/signup/verify says so out loud: "the
//      auth user, then the users row WITHOUT a phone", and that omission is a deliberate security
//      property rather than an oversight. With create_user:false there was no user to match, so the
//      one page offering CANCELLATION, A CARD CHANGE AND INVOICES could never be got through.
//
// ⚠️ HALF OF THIS WAS FOUND ON 31 JULY AND ONLY HALF FIXED. app/app/you/billing was built to ride
// the web session the customer already holds, and its header records the same defect: "/account
// stays for the phone era customers who still use it." But the public FOOTER went on pointing here
// under the words "Manage subscription", on every page of the site, so the dead door was still the
// one a customer was handed. A page nobody links to is parked. A page the footer links to is live,
// whatever a comment says about it.
//
// ⚠️ AND THE PHONE ERA IT WAS KEPT FOR DOES NOT EXIST. lib/logindoor.ts again: "email is compulsory
// at signup and app/api/signup/verify.ts mints the auth user on the PROVED address, so every
// customer who has finished signing up already holds a working email door." There is no customer
// this page served and none it could serve.
//
// So it is not repaired, it is removed. Two hundred lines of duplicate sign in UI, a second code
// entry screen, a second brand palette hand typed in hex and a third local copy of WhatsApp's green
// went with it. Doc 103: the best button is no button, and the strongest version of one login is
// not two that agree, it is one.
//
// ⚠️ THE URL SURVIVES ON PURPOSE. It is in the site footer, it may be bookmarked, and Google has
// crawled it. A redirect keeps all of that working and lands on the door that opens.
// /app/you/billing sends a signed out visitor to /in by itself, so both states are handled without
// this file knowing anything about sessions.
//
// ⚠️ WHICH ALSO CLOSES THE SEARCH CONSOLE COMPLAINT. This was the ONE public page carrying neither
// a canonical nor a noindex, which is exactly what "Duplicate without user-selected canonical"
// means. It carries noindex now, and a redirect to a noindex page settles it either way.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AccountPage() {
  redirect('/app/you/billing');
}
