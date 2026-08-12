import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, SURFACE,
  edge,
} from '../../../../lib/apptheme';
import { phoneTailForUser } from '../../../../lib/supabase';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// HIS DATA, OUT, AND HIS RIGHT TO LEAVE. THE TWO DOORS THAT EXISTED AND WERE LINKED FROM
// NOWHERE.
//
// 🔴 THE INCIDENT. 11 August 2026. A customer typed "delete all my data" into the in app chat.
// He was handed an expenses card about phone bills, which is a fault of its own and is fixed in
// lib/claimrules.data.ts. Then he went looking for the door itself, on every screen we have, and
// there was not one. Not in Settings, not on the profile, not on the billing page.
//
// 🔴 AND THE MACHINERY HAD BEEN WORKING THE WHOLE TIME. POST /api/account/delete walks every
// table in USER_DATA_TABLES and empties his storage bucket. GET /api/account/export hands back
// the same manifest as a file. Both were proved on 10 August. Both are deliberately exempt from
// the paywall, and lib/gate.ts says why in capitals: "HIS RIGHT TO LEAVE. Gating erasure behind
// payment is a UK GDPR problem, not a growth tactic." A grep for `api/account` across the repo
// returned lib/gate.ts and two test files. Zero pages. Zero forms. Zero fetches.
//
// So the rights were real, the code was real, the tests were green, and the only way a customer
// could use either of them was to email us and wait, which is what /privacy told him to do. A
// door nothing links to is not a door. That is the whole reason this page exists.
//
// ⚠️ IT SAYS NO MORE THAN /privacy SAYS. Two surfaces describing one legal promise in two
// different strengths is how a company ends up arguing with its own policy in front of the ICO,
// so the retention sentence here is the privacy page's sentence: some records we may have to
// keep, for the period required by UK tax and accounting rules. The erasure this product runs is
// in fact wider than that, and it is still worded to the policy, because promising less than you
// do is the only safe direction to be wrong in.
//
// ⚠️ NO CLIENT SCRIPT, LIKE EVERY OTHER SCREEN. He is on a cheap Android on a bad signal. Both
// steps are a plain form and the confirmation is decided on the server, so this works with
// scripting switched off.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE APPROVAL GATE, BUILT BEFORE THE THING IT GUARDS. CLAUDE.md, the irreversible actions
// rule, in its own words: "Build the approval gate BEFORE the automation it guards."
//
// This is the most destructive button in the product. Everything else a man presses here can be
// undone: an entry unconfirmed, a share link revoked, a VAT record put back, a subscription
// restarted. This one ends with his books gone and no version of us that can fetch them back.
// A single tap cannot be what stands between a fat thumb on a ladder and that.
//
// So it is TWO STEPS AND A TYPED WORD, and the typed word is checked HERE, on the server, in
// this component. The button that posts to /api/account/delete is not styled out of the way or
// hidden behind a details element: until the word comes back matching, IT IS NOT IN THE HTML AT
// ALL. There is nothing to press, nothing for a stray tap to find, and nothing a screen reader
// can walk onto by accident.
//
// ⚠️ THE WORD RIDES IN THE URL AND THE ERASURE NEVER COULD. Step one is a GET form, so the
// confirmation lands as ?erase=DELETE and a crafted link can arm this page. That is deliberate
// and it is safe, because arming it destroys nothing: a GET on this product never changes
// anything, and the erasure itself is a POST that he still has to press. The one rule that makes
// that trade sound is the one the sign out row on /app/you already states: a GET that ends
// something is a GET any other site can fire for him with an image tag.
//
// ⚠️ AND NOTHING PERSONAL IS IN THAT URL. lib/websession.ts keeps his address out of the sign in
// URL on purpose, because a URL is written into history, into Referer headers and into every
// error report. What travels here is a fixed English word that is the same for every customer.
//
// ⚠️ CASE AND SPACE ARE FORGIVEN, THE WORD IS NOT. A phone keyboard capitalises the first letter
// on its own and adds a trailing space after a word, so a man who typed exactly what we asked for
// would be refused by his own keyboard. Refusing him teaches him nothing about how serious this
// is; it teaches him the form is broken. The deliberateness is in typing the word at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CONFIRM_WORD = 'DELETE';

export default async function YourDataPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Fdata');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // 🔴 THE PHONE SECTION IS DRAWN FOR A MAN WITH A PHONE ON HERE, AND FOR NOBODY ELSE. Doc 103's
  // empty test. See phoneTailForUser in lib/supabase.ts for what shipping it unconditionally cost:
  // an unplug button, and a "that number is free to connect anywhere now" waiting behind it, on
  // accounts that have never had a number.
  const phoneTail = await phoneTailForUser(user.id).catch(() => null);

  const typed = (one('erase') ?? '').trim().toUpperCase();
  const armed = typed === CONFIRM_WORD;
  // He typed something and it was not the word. Say so plainly rather than redrawing the same
  // form with no explanation, which reads as the page having eaten what he typed.
  const mistyped = typed.length > 0 && !armed;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you" />

      <section className="lek-card">
        <h1 className="lek-eyebrow">Your data</h1>
        <p style={S.lede}>Everything we hold on you is yours.</p>
        <p style={S.blurb}>
          You can take a copy of it whenever you like, and you can tell us to destroy it. Neither
          one needs our permission and neither one costs anything, including when your account is
          locked or your trial has run out.
        </p>
      </section>

      {/* ── A COPY, FOR HIM. Article 15, and a plain link is the whole of it: one GET, already
          written, already scoped to his account by the session he is holding. ──────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">Take a copy</h2>
        <p style={S.fact}>
          Your books, your invoices, the questions you have asked us and the answers, your goals,
          your jobs and your account details. One file, straight away, in the format a machine
          reads, so an accountant or another product can take it in.
        </p>
        <p style={S.quiet}>
          Nothing changes on your account when you do this, and you can do it as often as you
          want.
        </p>
        <p style={{ margin: `${SPACE.sm}px 0 0` }}>
          <a href="/api/account/export" style={S.inlineLink}>Get a copy of my data</a>
        </p>
      </section>

      {/* ── THE WAY OUT. Article 17. Two steps, and the second one only exists once the first has
          been answered on the server. ───────────────────────────────────────────────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">Delete everything</h2>

        <p style={S.fact}>
          This closes your account and destroys what we hold: every entry in your books, every
          receipt photograph, your invoices, your jobs, your goals, the questions you have asked
          us, and the way you sign in. It happens straight away.
        </p>
        <p style={S.warnFlat}>
          <b>It cannot be undone.</b> There is no bin to take it back out of, and no copy of it
          here afterwards for us to hand you. If you want your records, take a copy first.
        </p>
        <p style={S.quiet}>
          Some records we may have to keep, where UK tax and accounting rules require it. That is
          the same duty set out in our{' '}
          <a href="/privacy" style={S.inlineLink}>privacy policy</a>, and it is the only reason
          anything survives this.
        </p>
        {/* ═══════════════════════════════════════════════════════════════════════════════════
            🔴 THIS PARAGRAPH USED TO WARN HIM THAT LEAVING DOES NOT STOP THE MONEY, AND IT WAS
            TRUE FOR ABOUT A DAY. 12 August 2026.

            deleteUserData() emptied the subscriptions row and never told Stripe, so a man who
            erased himself kept a live monthly charge against an account that no longer existed,
            with no row left for the billing webhook to match it to. Told to cancel first, most
            people would not, and the ones who did not would be charged for ever.

            It now cancels the subscription outright before the walk, and this paragraph says so.

            ⚠️ THE COPY MOVED WITH THE CODE, ON THE SAME COMMIT, and test/datadoor.test.mjs holds
            them together: it asserted "the walk still makes no call to the payment provider, so
            the warning below is still true", and it went RED the moment the call was added. That
            is the assertion doing exactly what it was written for, on exactly the commit it was
            written for. A warning that outlives the thing it warns about is a lie with a good
            excuse. ═══════════════════════════════════════════════════════════════════════════ */}
        <p style={S.quiet}>
          If you are paying us, deleting your account cancels that too. We stop the subscription
          with our payment provider before anything else is touched, so there is no last payment
          after you have gone. You can see it in{' '}
          <a href="/app/you/billing" style={S.inlineLink}>Billing</a> until the moment you do this.
        </p>

        {mistyped ? (
          <p style={S.warn}>
            That did not match. Type {CONFIRM_WORD} on its own and we will show you the button.
          </p>
        ) : null}

        {armed ? (
          <>
            {/* ⚠️ THE STATEMENT IS MADE AGAIN HERE, AFTER THE TYPING, AND IT IS NOT A REPEAT FOR
                THE SAKE OF IT. He read the paragraphs above before he knew he was going through
                with it. This is the last sentence he reads with his finger over the button, so
                it says the irreversible part and nothing else. */}
            <p style={S.armed}>
              Pressing this destroys your books and closes your account. It cannot be undone.
            </p>
            <form action="/api/account/delete" method="post" style={S.form}>
              <button type="submit" style={S.destroy}>Delete everything and close my account</button>
            </form>
            {/* ⚠️ WHAT HE IS ABOUT TO SEE, SAID BEFORE HE SEES IT. The route answers with a plain
                machine readable line rather than a page, because by the time it answers there is
                no account left to draw one for. Told in advance it is an ending; found by
                surprise it reads as the product having broken while holding his life's records.
                The proper fix is the route redirecting to a farewell page and clearing the
                session cookie, which is a change to /api/account/delete and is reported rather
                than made here. */}
            <p style={S.quiet}>
              The page that answers is one plain line of text. That is the confirmation. There is
              no account left behind it to draw anything else.
            </p>
            <p style={S.quiet}>
              Changed your mind? <a href="/app/you/data" style={S.inlineLink}>Go back</a> and
              nothing happens. Nothing has been touched yet.
            </p>
          </>
        ) : (
          <form action="/app/you/data" method="get" style={S.form}>
            <label htmlFor="erase" style={S.label}>
              Type {CONFIRM_WORD} to carry on
            </label>
            <input
              id="erase"
              name="erase"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={24}
              required
              className="lek-field"
            />
            <button type="submit" style={S.carryOn}>Carry on</button>
          </form>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════
          UNPLUG THE PHONE. RUN 1 proved there was no way to do this anywhere in the product.

          A number bound to an account could not be released by anybody. WhatsApp refused a new
          pairing with "already connected to a Lekhio account", the only road it offered was a
          support queue, and there was no unbind on the web, on WhatsApp or in settings. One stale
          binding took a real handset out of Lekhio for good.

          ⚠️ IT IS HIS OWN NUMBER OFF HIS OWN ACCOUNT, never a move between two. That is what makes
          it safe to do himself: nobody needs proof of who owns a number he is giving up. Once he
          lets go, the handset side claims it with a connect code exactly as it always has.

          It sits on this page rather than under Connect, because the shape of it is the same as
          the two above: a thing he is entitled to do with his own data whenever he likes.
          ═══════════════════════════════════════════════════════════════════════════════════ */}
          {/* ⚠️ AND ONLY WHEN THERE IS A NUMBER TO LET GO OF. Doc 103's empty test, and this one
              fails it twice: a control with nothing to do, over a confirmation that would have
              said "that number is free to connect anywhere now" about a number that never was. */}
          {phoneTail ? (
            <>
              <h2 style={S.lede}>Unplug your phone</h2>
              <p style={S.fact}>
                {/* 🔴 THE NUMBER IS NAMED. Four digits, because the reason a man is standing here
                    is usually that the number on the account is one he cannot see from the handset
                    side, and a button over an unnamed thing is a guess with a full stop after it.
                    Four rather than all of it: the common case is a number that belongs to somebody
                    who has left, and that is not the account holder's to be handed in full. */}
                The number on this account ends {phoneTail}. Unplugging takes it off, and nothing
                else changes: every receipt and every entry you have sent us stays exactly where it
                is, and you can connect the same phone again, or a different one, whenever you like.
              </p>
              <p style={S.quiet}>
                Do this if that number is not yours any more, or if you want to use it on a
                different Lekhio account. A number can only be on one account at a time, so nobody
                else can connect that handset until you let go of it.
              </p>
              {one('done') === 'unplugfailed' ? <p style={S.warn}>Something went wrong our end and your number has NOT been unplugged. Nothing was changed. Try again in a minute.</p> : null}
              <form method="post" action="/api/account/phone">
                <button type="submit" style={S.carryOn} className="lek-hit">Unplug my phone</button>
              </form>
            </>
          ) : null}
          {/* ⚠️ THE SUCCESS LINE LIVES OUTSIDE THE GATE, because the gate is false by the time he
              reads it. The unplug worked, the number is gone, phoneTail is null, and a confirmation
              drawn inside the section would vanish on the very redirect that earned it. He would
              press the button and watch the whole thing disappear without a word. */}
          {one('done') === 'unplugged' ? <p style={S.armed}>Done. That number is free to connect anywhere now.</p> : null}

          <p style={S.foot}>
        Rather ask a person? Email info@lekhio.app and we will do either of these for you.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  // 16px is pinned rather than taken off the type scale: under 16 iOS Safari zooms the whole page
  // the moment a field is focused, and he never asked to be zoomed. Same rule as /app/you/vat.
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};letter-spacing:0.12em;text-transform:uppercase}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  lede: { fontSize: TYPE.lead, fontWeight: 800, letterSpacing: '-0.01em', margin: `0 0 ${SPACE.xs}px`, color: RIVER_DEEP },
  blurb: { fontSize: TYPE.note, lineHeight: 1.6, color: MUTED, margin: 0, maxWidth: '62ch' },

  fact: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  // The plain statement of no return. Tinted, not shouted: this is a right he is exercising, not
  // a mistake he is making, and a screen that shouts at him for leaving is a screen with an
  // opinion about it.
  warnFlat: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: `${SPACE.sm}px 0 0` },
  armed: { fontSize: TYPE.body, lineHeight: 1.6, fontWeight: 700, color: INK, background: RED_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `${SPACE.sm}px 0 0`, maxWidth: '62ch' },

  inlineLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },

  form: { margin: `${SPACE.sm}px 0 0`, background: SURFACE, borderRadius: RADIUS.md, padding: SPACE.sm },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: SPACE.xs },
  carryOn: { marginTop: SPACE.sm, background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '11px 18px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  // The only red filled button in the product, and it is only ever drawn once the word has been
  // typed and checked. Full width, so it is not a thing a thumb finds on the way to something
  // else: by the time it is on screen it is the only thing he came here to press.
  destroy: { display: 'block', width: '100%', background: RED, color: ON_RED, border: 'none', borderRadius: RADIUS.sm, padding: '14px 18px', fontSize: TYPE.body, fontWeight: 800, fontFamily: FONT, cursor: 'pointer' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0', maxWidth: '62ch', marginLeft: 'auto', marginRight: 'auto' },
};
