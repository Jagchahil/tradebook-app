import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie, identityForUser } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readNudgePrefs, readIdentityCard, getBusinessProfile } from '../../../../lib/supabase';
import { templateLegBlock } from '../../../../lib/routing';
import { settingsNotice, maskEmail, bindNotice, BOUND_LINE } from '../identity';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN_TINT, INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, SURFACE,
  edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HIS SWITCHES. The two messages we ever send off our own bat, each with its off switch.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ TWO ROWS, BECAUSE WE SEND TWO KINDS OF MESSAGE, AND THAT IS THE WHOLE PAGE. A settings
// screen grows a row every time somebody is helpful, and doc 103's once test is the reason this
// one must not: every switch here is a promise that a message exists behind it. The daily
// reminder and the weekly summary are the only proactive sends the product makes, so they are
// the only switches. When a third send exists, it brings its switch with it, not before.
//
// ⚠️ THE STATE SHOWN IS THE STATE READ, NEVER ASSUMED. readNudgePrefs keeps three answers
// apart: his saved choices, no row (which honestly means the defaults, both on), and a failed
// read. On a failed read this page refuses to draw switches at all, because drawing "on" over
// an opt out we could not read would show a man a promise we may be breaking (PECR). The route
// refuses the save on the same reasoning, so the page and the write cannot disagree.
//
// ⚠️ EACH SWITCH IS ITS OWN FORM POSTING THE OPPOSITE OF WHAT IS SHOWN. No save button, no
// checkbox state to accumulate: the press is the change, same as every choice in setup, and a
// 303 lands him back here looking at the new truth.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function Row({
  which, title, body, on,
}: {
  which: 'daily_nudges' | 'weekly_summary';
  title: string;
  body: string;
  on: boolean;
}) {
  return (
    <div style={S.row}>
      <div style={S.rowText}>
        <p style={S.rowTitle}>{title}</p>
        <p style={S.rowBody}>{body}</p>
        <p style={on ? S.stateOn : S.stateOff}>{on ? 'On' : 'Off'}</p>
      </div>
      <form action="/api/you/settings" method="post" style={S.rowForm}>
        <input type="hidden" name="which" value={which} />
        {/* The literal 'on' or 'off', compared server side against 'on'. A form posts strings,
            and 'false' is a truthy one, which is the lesson the route's header records. */}
        <input type="hidden" name="to" value={on ? 'off' : 'on'} />
        <button type="submit" style={on ? S.turnOff : S.turnOn}>
          {on ? 'Turn it off' : 'Turn it on'}
        </button>
      </form>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Fsettings');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const notice = settingsNotice(one('done') ?? one('e'));
  const saved = one('done') === 'saved';
  // The add email flow's own sentences, which came here with the card. bindNotice returns a fixed
  // string per code and structurally cannot carry another man's address, which is the whole point
  // of it living in ../identity.ts rather than being built here.
  const emailNotice = bindNotice(one('e'));
  const bind = one('bind');

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE DAILY REMINDER SWITCH SAID "ON" FOR A MESSAGE THAT IS NEVER SENT.
  //
  // The page opens with "These are the only messages Lekhio ever sends without you asking first",
  // then described a nudge at the end of a working day and showed it switched ON. It has never
  // gone out: app/api/cron/reminders bails at templateLegBlock('nudge') because the nudge's gate is
  // shut, and the cron says exactly that in its own skip reason.
  //
  // 🔴 AND EVEN APPROVED IT ONLY REACHES A CONNECTED PHONE. The nudge is sendTemplate(t.phone,
  // T_NUDGE), WhatsApp and nothing else, so a man who signed up on the web and never connected a
  // phone would still get nothing. Both conditions are asked here, because gating on the template
  // alone just defers the same lie to the day the template lands.
  //
  // \u26a0\ufe0f THE PREFERENCE IS NOT TOUCHED. Hiding the row hides the row; daily_nudges keeps
  // whatever he set, and the switch comes back saying what he already chose the day it can fire.
  //
  // \u26a0\ufe0f THE WEEKLY SUMMARY STAYS, because it is REAL: channelsFor('weekly_ready') routes it
  // by push and email with hasWhatsApp false, so it reaches a web only customer today. This page
  // was half true, which is the hardest kind to see.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const [prefs, card, identity, profile] = await Promise.all([
    readNudgePrefs(user.id),
    readIdentityCard(user.id).catch(() => null),
    // His contact points, for the card that moved here from /app/you on 14 August 2026.
    identityForUser(user),
    // Only to decide whether a business name is a thing he HAS. A sole trader trading under his
    // own name has no second name to hold, and drawing him an empty box for one is an invitation
    // to invent something that then prints on his invoices.
    getBusinessProfile(user.id).catch(() => null),
  ]);
  // ⚠️ NOT JUST THE STRUCTURE. A sole trader who picked "A business name" at /start step 2 is
  // stored as a sole trader and HAS a trading name, so the box is drawn whenever there is one on
  // file as well as whenever the structure implies one. What it must not do is draw an empty box
  // for a man trading under his own name: that is an invitation to invent a name that then prints
  // on his invoices.
  const businessShaped = profile?.businessType === 'limited_company'
    || profile?.businessType === 'partnership'
    || Boolean((card?.businessName ?? '').trim());
  // Unknown is not a promise. A failed read draws no daily row rather than claiming one.
  //
  // ⚠️ templateLegBlock, NOT templateSendable, SINCE 10 AUGUST 2026. This asked half the question:
  // it saw the Meta gate but not the WHATSAPP_SENDS_ENABLED kill switch, so with proactive sends
  // switched off this page still offered a switch for a message that could not leave the building.
  // The cron, the WhatsApp promise and this page now all read the one function, so a row here can
  // never again advertise something the sender has already decided not to do.
  const dailyCanFire = templateLegBlock('nudge') === null && Boolean(card?.phone);
  const current = prefs === null || prefs === 'none'
    ? { daily_nudges: true, weekly_summary: true }
    : prefs;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you/settings" />

      <section className="lek-card">
        <h1 className="lek-eyebrow">Settings</h1>
        <p style={S.blurb}>
          {dailyCanFire
            ? 'These are the only messages Lekhio ever sends without you asking first. Turn either off and it stops from the next one we would have sent.'
            : 'This is the only message Lekhio ever sends without you asking first. Turn it off and it stops from the next one we would have sent.'}
        </p>

        {notice ? <p style={saved ? S.good : S.warn}>{notice}</p> : null}

        {prefs === null ? (
          <p style={S.warn}>
            We could not read your choices just this minute, so the switches are not drawn: showing
            you a guess about what we send you would be worse than making you reload. Nothing has
            changed. Give it a moment and try again.
          </p>
        ) : (
          <div style={S.stack}>
            {dailyCanFire ? (
              <Row
                which="daily_nudges"
                title="The daily reminder"
                body="A nudge at the end of a working day when nothing has been logged, so a busy day does not become a lost day."
                on={current.daily_nudges}
              />
            ) : null}
            <Row
              which="weekly_summary"
              title="The weekly summary"
              body="One message on a Sunday saying your week's figures are ready to look at."
              on={current.weekly_summary}
            />
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          HOW WE REACH HIM. Moved here from /app/you on 14 August 2026.

          ⚠️ A THING YOU SET ONCE DOES NOT DESERVE A CARD ON THE HUB. An email address and a bound
          phone are set once each, and they were costing every customer a whole card at the top of
          the screen he opens to see his diary. Settings is one tap, sits outside the folds, and is
          exactly where a man looks for "where do my codes go".

          🔴 THE ADD FLOW IS THE DELICATE ONE AND IT DID NOT CHANGE. The 29 July takeover fix is
          law: the send and the bind both live in /api/you/email, the address rides a signed cookie
          between the two steps, and every sentence this page can say about it is a fixed string in
          ../identity.ts that structurally cannot carry another man's details. What moved is the
          markup and the redirect target. Nothing about the proof of ownership moved.
          ═════════════════════════════════════════════════════════════════════════════════════ */}
      <section className="lek-card">
        <h2 className="lek-h2">How we reach you</h2>

        {emailNotice ? <p style={S.warn}>{emailNotice}</p> : null}

        {identity.email ? (
          <>
            <p style={S.fact}>
              Your email is <b>{maskEmail(identity.email)}</b>. Codes for signing in go there, and
              you can sign in with the address itself.
            </p>
            {bind === 'done' ? <p style={S.good}>{BOUND_LINE}</p> : null}
          </>
        ) : bind === 'code' ? (
          <>
            <p style={S.fact}>
              We have emailed a six digit code to the address you just gave us. Type it here and
              the address is yours on this account.
            </p>
            <form action="/api/you/email/verify" method="post" style={S.form}>
              <label htmlFor="code" style={S.label}>The code from the email</label>
              <div style={S.formRow}>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  style={S.codeInput}
                />
                <button type="submit" style={S.submit}>Add this email</button>
              </div>
            </form>
            <p style={S.quiet}>
              Nothing arrived, or wrong address? <a href="/app/you/settings" style={S.inlineLink}>Start
              again</a> and we will send a fresh code. The code lasts ten minutes.
            </p>
          </>
        ) : (
          <>
            <p style={S.fact}>
              There is no email on your account yet. Add one and your sign in codes can come by
              email, and the address itself becomes a way back in if you ever change your phone.
            </p>
            <form action="/api/you/email/start" method="post" style={S.form}>
              <label htmlFor="email" style={S.label}>Your email address</label>
              <div style={S.formRow}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  style={S.emailInput}
                />
                <button type="submit" style={S.submit}>Send me a code</button>
              </div>
            </form>
            <p style={S.quiet}>
              We email a six digit code to prove the address is yours. Nothing is added until you
              type it back.
            </p>
          </>
        )}

        {/* ⚠️ THE WORD WHATSAPP IS DELIBERATELY NOT ON THIS SCREEN. test/frontdoor.test.mjs holds
            every screen but the connect page to that, because screens used to instruct actions a
            man with no bound number could not take. This reports the binding as the connect page's
            own copy does, "your phone", and the door leads where the word lives. */}
        {card?.phone ? (
          <p style={S.fact}>
            Your phone is connected. Messages from the number ending <b>{card.phone.slice(-4)}</b>{' '}
            come straight into your books.
          </p>
        ) : (
          <p style={S.fact}>
            Your phone is not connected yet. Connect it and a photo of a receipt is all it takes
            to log one.
          </p>
        )}
        <a href="/app/connect" style={S.inlineLink}>
          {card?.phone ? 'Manage your connected phone' : 'Connect your phone'}
        </a>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          HIS OWN DETAILS. NEW 17 AUGUST 2026, FROM THE B1 EMPTY ACCOUNT WALK.

          🔴 THERE WAS NO WAY TO CHANGE ANY OF THIS, AND NOTHING SAID SO. reconcileSignupToUser was
          the only writer of his name, his business name and his address in the whole repo, and it
          runs once, at first sign in. users.trade_type had no writer at all. So a man who tapped
          Continue on an optional step at /start, or made a typo in one, was stuck with it for good,
          while /start step 5 told him the opposite: "Optional. Tap Continue to skip and add it when
          you send your first invoice." The invoice screen never asked, and INV-0001 on the walked
          account went to a customer reading FROM his name with no address under it.

          ⚠️ WHY SETTINGS AND NOT THE HUB. Doc 103's once test, and the judgement this codebase had
          already made in writing: /app/you's own comment says an address he sets once in his life
          and a phone he binds once belong here rather than costing every customer a card at the top
          of the screen he opens to see his diary. /app/you/testimonial has pointed at "Your
          details" since it was written, so this section carries that name and its copy is now true.

          ⚠️ ONE FORM, EVERY BOX, ONE SAVE. Not the press-is-the-change shape of the switches above:
          a man correcting his address should not have four separate saves, and the route treats a
          box that was not drawn as one to leave alone rather than one to clear.
          ═════════════════════════════════════════════════════════════════════════════════════ */}
      <section className="lek-card">
        <h2 className="lek-h2">Your details</h2>
        <p style={S.blurb}>
          What your invoices are made out from, and what we call you. Change any of it and the next
          invoice you make carries the new version. Nothing here is sent anywhere.
        </p>

        <form action="/api/you/details" method="post" style={S.form}>
          <label htmlFor="name" style={S.label}>Your name</label>
          <input
            id="name"
            name="name"
            type="text"
            maxLength={120}
            defaultValue={card?.name ?? ''}
            className="lek-field"
            style={S.detailInput}
          />

          {businessShaped ? (
            <>
              <label htmlFor="business_name" style={S.detailLabel}>Your business name</label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                maxLength={120}
                defaultValue={card?.businessName ?? ''}
                className="lek-field"
                style={S.detailInput}
              />
            </>
          ) : null}

          <label htmlFor="trade" style={S.detailLabel}>What you do</label>
          <input
            id="trade"
            name="trade"
            type="text"
            maxLength={40}
            placeholder="Electrician"
            defaultValue={card?.trade ?? ''}
            className="lek-field"
            style={S.detailInput}
          />

          <label htmlFor="address" style={S.detailLabel}>Your business address</label>
          <textarea
            id="address"
            name="address"
            rows={3}
            maxLength={300}
            defaultValue={card?.address ?? ''}
            className="lek-field"
            style={S.detailArea}
          />
          <p style={S.quiet}>
            It goes at the top of every invoice you make. GOV.UK lists the supplier&rsquo;s address
            as one of the things an invoice must carry, and a VAT registered business has to show
            it. Leave it empty and your invoices go out without it.
          </p>

          <button type="submit" style={S.detailSubmit}>Save my details</button>
        </form>
      </section>

      <p style={S.foot}>
        Replies to things you send us are not switched here. Ask a question, get an answer, always.
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

  blurb: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },
  good: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },

  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.xs },

  row: { display: 'flex', alignItems: 'flex-start', gap: SPACE.sm, background: SURFACE, borderRadius: RADIUS.md, padding: '14px 14px', flexWrap: 'wrap' },
  rowText: { flex: '1 1 260px' },
  rowTitle: { fontSize: TYPE.body, fontWeight: 800, margin: '0 0 4px' },
  rowBody: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: 0, maxWidth: '52ch' },
  stateOn: { fontSize: TYPE.label, fontWeight: 800, color: RIVER_DEEP, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  stateOff: { fontSize: TYPE.label, fontWeight: 800, color: MUTED, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  rowForm: { margin: 0, flex: '0 0 auto', alignSelf: 'center' },
  turnOff: { background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 16px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  turnOn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '11px 16px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },

  // ── How we reach him, moved from /app/you on 14 August 2026 with its own styles ─────────────
  fact: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  inlineLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
  form: { margin: `${SPACE.sm}px 0 0`, background: SURFACE, borderRadius: RADIUS.md, padding: SPACE.sm },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: SPACE.xs },
  formRow: { display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' },
  emailInput: { flex: '1 1 220px', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.strong, fontFamily: FONT, color: INK },
  codeInput: { flex: '0 1 160px', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.stat, fontFamily: FONT, color: INK, letterSpacing: '0.2em', fontVariantNumeric: 'tabular-nums' },
  submit: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '11px 18px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  // ── His own details, new 17 August 2026 ────────────────────────────────────────────────────
  detailLabel: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  detailInput: { width: '100%', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.strong, fontFamily: FONT, color: INK, boxSizing: 'border-box' },
  detailArea: { width: '100%', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.strong, fontFamily: FONT, color: INK, boxSizing: 'border-box', resize: 'vertical' },
  detailSubmit: { marginTop: SPACE.sm, background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '12px 20px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
};
