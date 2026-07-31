import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie, identityForUser } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import {
  getPhoneForUser, getStripeCustomerForAccount, getSubscriptionByPhone, getSubscriptionByUser,
} from '../../../../lib/supabase';
import { gateForUser } from '../../../../lib/gateserver';
import { hasStripeConfig, PRICE_PENCE } from '../../../../lib/stripe';
import { gbp0, gbp2 } from '../../lib/money';
import {
  NO_CARD_LINE, NO_CARD_LOCKED_LINE, PORTAL_BUTTON, PORTAL_UNDER, portalNotice, standingFor,
} from './words';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HIS BILLING, THROUGH THE DOOR HE IS ALREADY STANDING IN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 UNTIL 31 JULY THE RAIL SENT A WEB CUSTOMER TO /account, WHICH DEMANDS A PHONE SMS CODE.
// A web account has no proved phone by design (see /api/signup/verify), so the one page offering
// his card, his invoices from us and cancelling was a page he could never get through. This page
// rides the web session he is already signed in with, and /account stays for the phone era
// customers who still use it.
//
// ⚠️ READ ONLY, NEVER DARK, AND THIS PAGE IS THE PROOF. A lapsed account MUST reach this screen
// and its button, because the man most in need of managing a card or cancelling is the man whose
// payment has stopped. Nothing here consults the gate to refuse; the gate only chooses sentences.
//
// ⚠️ EVERYTHING SHOWN IS READ, NEVER GUESSED. The standing comes off the subscription row,
// account key first then phone, the same two key read /api/billing/status has always done, and a
// row that carries no date gets a sentence with no date in it. The sentences themselves live in
// ./words.ts where test/billingweb.test.mjs holds every one of them still.
//
// ⚠️ THE CARD NUMBERS NEVER COME NEAR US. The one button posts to /api/billing/portal, which
// answers with a 303 to Stripe's own hosted portal. Changing a card, downloading our invoices
// and cancelling all happen on Stripe's page, which is the safe place for them.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const notice = portalNotice(one('problem'));

  const [gate, byAccount, identity] = await Promise.all([
    gateForUser(user.id),
    getSubscriptionByUser(user.id),
    identityForUser(user),
  ]);

  // Account first, then phone: the same order as /api/billing/status, because most rows written
  // before 29 July are keyed to a phone and a legacy customer must not read as unsubscribed.
  let row = byAccount;
  if (!row) {
    const phone = await getPhoneForUser(user.id);
    if (phone) row = await getSubscriptionByPhone(phone);
  }

  // Whether a Stripe customer exists, resolved EXACTLY as /api/billing/portal will resolve it, so
  // the button is only drawn when the post behind it can succeed. One resolver, in lib/supabase.ts.
  const customerId = await getStripeCustomerForAccount(
    user.id,
    (identity.email ?? '').trim().toLowerCase() || null,
    (identity.phone ?? '').trim() || null,
  );

  const standing = standingFor(row, gate, new Date());

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you/billing" />

      <section className="lek-card">
        <h1 className="lek-eyebrow">Billing</h1>

        {notice ? <p style={S.warn}>{notice}</p> : null}

        {standing.lines.map((line) => (
          <p key={line} style={S.fact}>{line}</p>
        ))}

        <div style={S.doorRow}>
          {customerId ? (
            <>
              <form action="/api/billing/portal" method="post" style={S.form}>
                <button type="submit" style={S.submit}>{PORTAL_BUTTON}</button>
              </form>
              <p style={S.quiet}>{PORTAL_UNDER}</p>
            </>
          ) : (
            <>
              <p style={S.fact}>{gate === 'readonly' ? NO_CARD_LOCKED_LINE : NO_CARD_LINE}</p>
              {/* The EXISTING checkout door, the same one the end of setting up offers, drawn only
                  when Stripe is configured, exactly as the reveal draws it. One form per plan so
                  choosing IS the action. The step name only shapes where Stripe sends him back:
                  success lands on the overview with the card confirmed, cancel lands on the reveal
                  screen, which is the screen that owns the card ask. No new checkout is built here.
                  The prices come from PRICE_PENCE, the one place the amounts live. */}
              {hasStripeConfig() ? (
                <div style={S.stack}>
                  {([
                    ['monthly', `${gbp2(PRICE_PENCE.monthly.standard / 100)} a month`, 'Cancel any time.'],
                    ['annual', `${gbp0(PRICE_PENCE.annual.standard / 100)} a year`, 'Two months cheaper than paying monthly.'],
                  ] as const).map(([plan, price, note]) => (
                    <form key={plan} action="/api/billing/checkout" method="post" style={S.optForm}>
                      <input type="hidden" name="plan" value={plan} />
                      <input type="hidden" name="step" value="reveal" />
                      <button type="submit" style={S.opt}>
                        <span style={S.optLabel}>{price}</span>
                        <span style={S.optNote}>{note} Your card goes to Stripe and never touches us.</span>
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <p style={S.foot}>
        Your receipts, your figures and everything you have logged stay yours to read whatever
        happens here.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  fact: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },

  doorRow: { borderTop: `1px solid ${LINE}`, marginTop: SPACE.md, paddingTop: SPACE.md },

  form: { margin: 0 },
  submit: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '12px 18px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.xs, marginTop: SPACE.sm },
  optForm: { margin: 0 },
  opt: { display: 'block', width: '100%', textAlign: 'left', background: SURFACE, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, padding: '14px 14px', cursor: 'pointer', fontFamily: FONT, color: INK },
  optLabel: { display: 'block', fontSize: TYPE.strong, fontWeight: 700 },
  optNote: { display: 'block', fontSize: TYPE.note, color: MUTED, marginTop: 2, lineHeight: 1.4 },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
