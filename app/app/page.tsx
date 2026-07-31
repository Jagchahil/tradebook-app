import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../lib/webauth';
import { SESSION_COOKIE } from '../../lib/websession';
import {
  getOptimiserInput, weekRows, weeklyUpdateFactsFor, readAnnouncementSources,
  readOnboardingProgress, readProvedPhone, pileEntries, readOwnNames, readAccountUse,
  getBusinessProfile,
} from '../../lib/supabase';
import { shareCaption, wholeFirmCaption } from '../../lib/position';
import { toStep, isDone, stepTitle, stepNumber, stepCount } from '../../lib/onboarding';
import { appStoreLive, APP_STORE_URL, PLAY_STORE_URL, WHATSAPP_NUMBER } from '../../lib/features';
import { waLinksConfigured } from '../../lib/walink';
import { gateForUser } from '../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../lib/gate';
import { ledgerFor, headline } from '../../lib/ledger';
import { taxPosition, setAsideBasisLine } from '../../lib/taxoptimiser';
import { weeklyInput, weeklyLine } from '../../lib/weeklyupdate';
import { weekOf } from '../../lib/weekchart';
import { buildPile, partitionPile } from '../../lib/reviewpile';
import { normaliseVendor } from '../../lib/memory';
import { categoriseBankLine } from '../../lib/categories';
import { selectAnnouncements } from '../../lib/announcements';
import { gbp0, gbpAbs0 } from '../../lib/money';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, GREEN, INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RADIUS, RIVER,
  RIVER_DEEP, RIVER_TINT, SAFFRON_DEEP, SAFFRON_TINT, SPACE, SURFACE, TYPE, WHATSAPP,
} from '../../lib/tokens';
import { AppNav } from './AppNav';
import { Announcements } from './Announcements';
import { WeekChart } from './WeekChart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE OVERVIEW. The screen a man opens when he wants to know what he owes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ SERVER RENDERED, AND THAT IS THE WHOLE POINT OF THE WEB APP.
//
// He is on a cheap Android on a bad signal, standing in somebody's kitchen with one hand on a
// ladder. Every kilobyte of JavaScript is a second he spends looking at a white screen wondering
// whether we have taken his money and broken. So his figures are already IN the HTML when it
// arrives. There is no loading spinner on this page because there is nothing to load, and as of
// 30 July there is no client component on it either: the announcements banner was the last one.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT ONE FIGURE ON THIS SCREEN IS COMPUTED HERE.
//
// The ledger comes from ledgerFor(), the tax from taxPosition(), the week from weekOf() and
// weeklyLine(), what is waiting from buildPile(), the banner from selectAnnouncements(). Every one
// of them is the SAME function the API routes call, which are the same ones the phone app and the
// WhatsApp reply read. That is not tidiness. /api/ledger's own header lists three separate times
// this codebase was caught with two readers over one number, and the lesson it draws is that the
// one which drifts is the one he believes.
//
// ⚠️ AND THE USER ID COMES FROM THE SESSION ROW, NEVER FROM THE URL.
//
// There is no id in the path and no id in the query, so there is nothing to change. See
// lib/webauth.ts and test/webauth.test.mjs, which fails the build if any page under app/app starts
// reading one.
//
// ⚠️ NO LOCAL MONEY FORMATTER HERE. This page had one, written the same day lib/money.ts was
// created to replace the seventeen the 28 July sweep found. It would print "£-33" for a negative,
// which is the exact bug that sweep existed to remove.
//
// THE ORDER OF THIS SCREEN, AND WHY IT IS THIS ORDER.
//
// Doc 103: he is up a ladder with one hand on the rail, he is not exploring. So the question he
// came with is answered first and everything else earns its place under it.
//
//   1. Anything stopping him using the product   the read only banner, unfinished setup
//   2. What to put by for tax                    the question. One number.
//   3. In, out, profit                           where that number came from
//   4. What is waiting on him                    the only reason 2 and 3 are not the whole truth
//   5. His week                                  the habit, in words and as a picture
//   6. What Lekhio saved him                     the proof he is getting his money's worth
//
// The standing question, whenever anything is added: what did we take out to make room for it?
// The "Worth knowing" carousel came out. On the live site it was offering a barber the VAT grouping
// rules, the Capital Goods Scheme and an archived page about wine duty.

export default async function OverviewPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const now = new Date();

  // Everything at once. Round trips in parallel rather than in a row, because the budget for this
  // page is one bad-signal second, not eight.
  const [
    optimiser, rows, factsMap, sources, progress, proved, gate, pileRows, ownNames, accountUse, biz,
  ] = await Promise.all([
    getOptimiserInput(user.id),
    weekRows(user.id),
    weeklyUpdateFactsFor([user.id]).catch(() => null),
    readAnnouncementSources(user.id).catch(() => null),
    readOnboardingProgress(user.id).catch(() => null),
    readProvedPhone(user.id).catch(() => null),
    // ⚠️ IN THE SAME ROUND TRIP AS EVERYTHING ELSE. This runs on the screen a man opens to find out
    // what he owes, on a bad signal, so it may not add a serial wait to it.
    gateForUser(user.id),
    pileEntries(user.id).catch(() => []),
    readOwnNames(user.id).catch(() => [] as string[]),
    readAccountUse(user.id).catch(() => 'mixed' as const),
    // For the partnership captions below. Same source /app/pay-yourself reads the share from, so
    // no two screens can disagree about what his share is. A failed read draws no caption, which
    // is the safe direction: an unlabelled figure beats a wrong label.
    getBusinessProfile(user.id).catch(() => null),
  ]);

  // ⚠️ THE RESUME LINE, AND DOC 103'S EMPTY TEST DECIDES WHEN IT IS ON SCREEN.
  //
  // A row that says "nothing to do" most of the time teaches him to stop looking, and then he misses
  // the week it matters. So this is drawn while his setup is genuinely unfinished and NEVER once it
  // is done. He is never redirected into it either: this is his money screen, and a wizard that will
  // not let him past it is a wizard that owns his books.
  //
  // A failed read draws nothing. Telling a man who finished setting up last week that he has not is
  // worse than saying nothing, because the line he cannot dismiss is the one he learns to ignore.
  const setup = progress && !progress.completedAt ? toStep(progress.step) : null;
  const resumeAt = setup && !isDone(setup) ? setup : null;

  // ⚠️ THE WHATSAPP ROW, AND DOC 103'S EMPTY TEST DECIDES WHEN IT IS ON SCREEN, exactly as it does
  // for the resume line above. It is drawn while his phone is NOT connected and disappears the
  // moment it is. A permanent row saying "connected" is a row he reads and rejects every time he
  // opens the one screen he came to for a number.
  const offerWhatsApp = proved !== null && !proved.phone
    && waLinksConfigured() && WHATSAPP_NUMBER.length >= 8;

  const l = ledgerFor(optimiser);
  const tax = taxPosition(optimiser);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A PARTNER'S TWO KINDS OF FIGURE, LABELLED. NOTHING COUNTED CHANGES.
  //
  // getOptimiserInput scales the shared books to HIS SHARE before any tax is worked out, so the
  // year grid and the tax card above the fold are share figures. weekRows reads the raw
  // transactions, so the week card is the WHOLE FIRM. Both are right, and on a 50% partner's
  // screen "In £500" sat directly above "£1,000 in" with not one word saying why. The captions
  // come from lib/position.ts, one sentence each, and draw for a partnership only: a sole
  // trader's figures are simply his, and a caption about a share he does not have fails doc
  // 103's empty test.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const shareCap = biz ? shareCaption(biz.businessType, biz.partnershipShare) : null;
  const firmCap = biz ? wholeFirmCaption(biz.businessType) : null;

  // HIS BUSINESS MONEY THIS TAX YEAR, trade and property together, because a landlord looking at
  // "£0 in" would be looking at a screen that does not know about his rent. The ledger card lower
  // down is trade only and says so: it answers a different question.
  const moneyIn = Math.max(0, optimiser.ytdTradeIncome) + Math.max(0, optimiser.ytdPropertyIncome ?? 0);
  const moneyOut = Math.max(0, optimiser.ytdTradeExpenses) + Math.max(0, optimiser.ytdPropertyExpenses ?? 0);
  const profit = moneyIn - moneyOut;

  // ⚠️ A READ THAT FAILED IS NOT A QUIET WEEK, AND THIS SCREEN IS ALLOWED TO KNOW THE DIFFERENCE.
  // weekRows returns null when Supabase could not answer. Printing "£0 in, £0 out" over a timeout
  // is a lie with his own money in it.
  const weekRead = rows !== null;
  const week = weekOf(rows ?? [], now);
  const weekProfit = week.income - week.expenses;
  const weekSaid = weeklyInput({ income: week.income, expenses: week.expenses }, factsMap?.get(user.id), now);

  // WHAT IS WAITING, from the same three functions /app/pile and /api/pile use. Money in is never
  // in this count: confirm_pile refuses it outright, so counting it would promise him a decision he
  // is not offered.
  const { known, unknown, careful } = partitionPile(
    buildPile(pileRows, normaliseVendor, ownNames, categoriseBankLine),
    accountUse,
  );
  const waiting = known.length + unknown.length + careful.length;

  const items = sources
    ? selectAnnouncements({
        knowledge: sources.knowledge,
        manual: sources.manual,
        appliedItemIds: sources.appliedItemIds,
        dismissedKeys: sources.dismissedKeys,
      })
    : [];

  // The tax card is drawn once there is money to tax. A proud "£0 to put by" on the first screen a
  // new customer ever sees is doc 103's empty test failing on day one: it teaches him this screen
  // has nothing on it. The ledger's own headline already tells an empty account what to do.
  const showTax = moneyIn > 0;
  const basis = setAsideBasisLine(optimiser, tax);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app" />

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE TRIAL HAS ENDED, AND HE CAN STILL SEE EVERY FIGURE ON THIS PAGE.
          lib/gate.ts's header is the argument: his records are his, the work is what he was buying,
          and a product that hides finished work behind a card form is taking back something he has
          already paid for. Under UK GDPR it is also a right of access problem we would have built
          on purpose. So this is a banner, not a wall. Nothing below it is removed.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {gate === 'readonly' ? (
        <section style={S.notice}>
          <span style={S.noticeTop}>{READONLY_TITLE}</span>
          <span style={S.noticeBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.primaryBtn}>Add a card</button>
          </form>
        </section>
      ) : null}

      <Announcements items={items} />

      {resumeAt ? (
        <a href={`/app/setup?step=${resumeAt}`} style={S.resume} className="lek-hit">
          <span style={S.noticeTop}>Finish setting up &middot; step {stepNumber(resumeAt)} of {stepCount()}</span>
          <span style={S.noticeBody}>
            You stopped at {stepTitle(resumeAt).toLowerCase()}. Everything you answered is saved, and
            the rest is where the money we can find you comes from.
          </span>
        </a>
      ) : null}

      {/* ── 1. WHAT TO PUT BY ──────────────────────────────────────────────────────────────────
          The question he came with, answered in one number before anything else on the screen.
          taxPosition() is his WHOLE tax across every stream we know about, minus what PAYE has
          already taken, plus the student loan that Self Assessment collects in January. */}
      {showTax ? (
        <section className="lek-card lek-tax">
          <h1 className="lek-eyebrow">Put by for tax</h1>
          <div className="lek-hero">{gbp0(tax.setAside)}</div>
          <p className="lek-heronote">
            {tax.projected
              ? 'What your figures are heading for across the full tax year.'
              : 'What the year so far has built up. Too early to call the whole year yet.'}
            {' '}It moves as you earn, and it is due by 31 January.
          </p>
          {/* ⚠️ WHAT IS IN THE NUMBER, WHENEVER IT IS MORE THAN THE BUSINESS.
              On the live site this card read £26,579 with "Profit £12,307" directly underneath it.
              Both figures were right and together they were unreadable, because this one is his
              whole personal tax and that one is his business. lib/taxoptimiser.ts writes the
              sentence, so what we are willing to claim about a man's tax stays in one place. */}
          {basis ? <p style={S.heroBasis}>{basis}</p> : null}
          {/* Whose money the figure is worked out on. For a partner the set aside is on his slice,
              and saying so here is what stops it contradicting the whole firm week below. */}
          {shareCap ? <p style={S.heroBasis}>{shareCap}</p> : null}
        </section>
      ) : null}

      {/* ── 2. WHERE THAT NUMBER CAME FROM ─────────────────────────────────────────────────────
          Three figures, no cleverness. The sum he would do on the back of an envelope, done. */}
      <section className="lek-card">
        <h2 className="lek-h2">Your business this year</h2>
        <div className="lek-grid">
          <div className="lek-tile">
            <div className="lek-tile-label">In</div>
            <div className="lek-tile-value" style={{ color: GREEN }}>{gbp0(moneyIn)}</div>
          </div>
          <div className="lek-tile">
            <div className="lek-tile-label">Out</div>
            <div className="lek-tile-value" style={{ color: RIVER }}>{gbp0(moneyOut)}</div>
          </div>
          <div className="lek-tile">
            <div className="lek-tile-label">Profit</div>
            <div className="lek-tile-value">{gbp0(profit)}</div>
          </div>
        </div>
        <p style={S.quiet}>
          Since 6 April, on everything you have confirmed.{shareCap ? ` ${shareCap}` : ''}
        </p>
      </section>

      {/* ── 3. WHAT IS WAITING ─────────────────────────────────────────────────────────────────
          Doc 103's empty test again: this is the ONLY reason the figures above are not the whole
          truth, so it is loud when it matters and absent when it does not. A permanent "nothing
          waiting" row is a row he learns to stop reading. */}
      {waiting > 0 ? (
        <a href="/app/pile" style={S.waiting} className="lek-hit">
          <span style={S.waitingCount}>{waiting}</span>
          <span>
            <span style={S.waitingTop}>
              {waiting === 1 ? 'One thing is waiting on you' : `${waiting} things are waiting on you`}
            </span>
            <span style={S.waitingBody}>
              Until you answer, none of it counts towards the figures above. Most are one question
              covering several payments.
            </span>
          </span>
        </a>
      ) : null}

      {/* ── 4 AND 5, PAIRED ON A DESK ──────────────────────────────────────────────────────────
          His week and what Lekhio saved him are the two cards that reflect rather than answer, so
          they are the one pairing on this screen that are true siblings. On a phone they stack in
          the doc 103 order. On a desk they sit side by side, which also keeps the week chart at a
          width where a bar still looks like a bar. align-items:start, because stretching the
          shorter card to match the taller one fills it with space that says nothing. */}
      <div className="lek-duo">
      {/* ── 4. HIS WEEK ────────────────────────────────────────────────────────────────────────
          The same sentence WhatsApp sends, from the same function, and the same seven days drawn
          from the same rows. See lib/weekchart.ts: the picture and the words cannot disagree,
          because the words are summed from the picture. */}
      <section className="lek-card">
        <h2 className="lek-h2">Your week</h2>
        {weekRead ? (
          <>
            <p className="lek-week-line">
              {gbp0(week.income)} in, {gbp0(week.expenses)} out.{' '}
              {weekProfit >= 0
                ? `That leaves ${gbp0(weekProfit)}.`
                : `That is ${gbpAbs0(weekProfit)} more out than in.`}
            </p>
            <p style={S.quiet}>{weeklyLine(weekSaid)}</p>
            {/* The week is drawn from the raw rows, so for a partnership it is the whole firm's
                money, unlike the share figures above. Said out loud, or the two contradict. */}
            {firmCap ? <p style={S.quiet}>{firmCap}</p> : null}
            {/* A chart of seven empty days says nothing the sentence has not already said better. */}
            {week.anyMoney ? <WeekChart week={week} /> : null}
          </>
        ) : (
          <p style={S.quiet}>
            We could not read your week just now. Nothing is lost, your figures are safe, and this
            fills itself in on the next load.
          </p>
        )}
      </section>

      {/* ── 5. THE PROOF ───────────────────────────────────────────────────────────────────────
          "£12.99 saves you £2,000" is a specification, not a slogan. If we cannot show him the
          £2,000 we have not earned the £12.99. lib/ledger.ts holds the argument. */}
      <section className="lek-card">
        <h2 className="lek-h2">What Lekhio has saved you</h2>
        <p style={S.headline}>{headline(l)}</p>

        {l.enough ? (
          <>
            {/* ⚠️ THE SCOPE, SAID OUT LOUD. These two are the tax his TRADE adds to his bill, and
                on a man with a job the second one can legitimately be small while he still owes
                thousands overall. Unlabelled, beside the set aside figure above, that reads as a
                contradiction rather than as two answers to two questions. */}
            <p style={S.scope}>Tax your business adds to your bill, before and after what you claimed.</p>
            <div className="lek-two">
              <div>
                <div className="lek-tile-label">Without Lekhio</div>
                <div className="lek-big">{gbp0(l.withoutLekhio)}</div>
              </div>
              <div>
                <div className="lek-tile-label">With Lekhio</div>
                <div className="lek-big" style={{ color: GREEN }}>{gbp0(l.withLekhio)}</div>
              </div>
            </div>

            {/* WHERE THE MONEY CAME FROM. The ledger's whole job is that he can check our working,
                so every line carries its own plain English basis rather than a number on its own. */}
            <ul style={S.lines}>
              {l.lines.map((line) => (
                <li key={line.key} style={S.line}>
                  <div style={S.lineTop}>
                    <span style={S.lineLabel}>{line.label}</span>
                    <span style={S.lineSaved}>{gbp0(line.saved)} saved</span>
                  </div>
                  <div style={S.basis}>{gbp0(line.deducted)} off your profit. {line.basis}</div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          // NOT ENOUGH IS NOT ZERO. lib/ledger.ts refuses to draw a confident number off three
          // weeks of data, and this screen says why rather than showing a proud and silly £14.
          //
          // ⚠️ AND IT IS NOT SAID TWICE. headline() falls back to l.note when there is not enough
          // to be confident, so rendering the note underneath printed the identical sentence twice.
          l.note && l.note !== headline(l) ? <p style={S.quiet}>{l.note}</p> : null
        )}

        {/* HIS OWN MONEY, HELD BY HMRC. Its own number, never added to what we saved him. This
            product has already once quoted a man a CIS refund that did not exist. */}
        {l.refundDue > 0 && (
          <p style={S.refund}>
            <b>{gbp0(l.refundDue)}</b> of CIS has been taken off your pay this year. That is your
            money, and it comes back to you when your return is filed.
          </p>
        )}
      </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE ONE PLACE THAT OFFERS WHATSAPP, AND IT IS BEHIND THE FRONT DOOR TOO.
          test/frontdoor.test.mjs used to forbid the word WhatsApp anywhere under app/app, because
          inbound resolves a message BY PHONE NUMBER and a web customer's number is deliberately
          unproved: every mention was an instruction he could not follow. Binding is what makes it
          followable, so the rule narrows rather than disappearing. This row and /app/connect are
          the only two places allowed to say it, and only while he genuinely can act on it.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {offerWhatsApp ? (
        <a href="/app/connect" style={S.connect} className="lek-hit">
          <span style={S.connectTop}>Add WhatsApp</span>
          <span style={S.noticeBody}>
            Photograph a receipt, say what you spent, or ask what you owe, from the chat app you
            already have open. Connecting your phone takes about a minute.
          </span>
        </a>
      ) : null}

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE ONLY PLACE IN THE PRODUCT THAT OFFERS THE APP, AND IT IS BEHIND THE FRONT DOOR.
          Jag's call, 30 July: nobody downloads the app before he is in the web app. Everyone goes
          through the same door, in the same order, and the phone is something he adds afterwards
          rather than a second way in that skips setting up.
          ⚠️ AND ONLY WHEN THE STORES REALLY HAVE IT. A dimmed "soon" chip is doc 103's third test
          exactly: a button whose only function is to say the feature does not exist yet is an advert
          for our roadmap. So until NEXT_PUBLIC_APP_STORE_LIVE is true this renders nothing at all.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {appStoreLive() && APP_STORE_URL && PLAY_STORE_URL ? (
        <section style={S.stores}>
          <p style={S.quiet}>
            Lekhio is on your phone too. Same books, same figures, and the two stay in step.
          </p>
          <div style={S.storeRow}>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={S.badge}>App Store</a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={S.badge}>Google Play</a>
          </div>
        </section>
      ) : null}

      {/* The footer changes with the screen above it. Saying "anything waiting on you is not
          counted" underneath a card that has just said it in bigger letters is the same sentence
          twice, and a screen that repeats itself is a screen he skims. */}
      <p style={S.foot}>
        {waiting > 0
          ? 'Everything above is money you have confirmed. New spending lands in your bank feed on its own.'
          : 'Everything here is money you have confirmed. Connect your bank and new spending lands here on its own, ready for you to check.'}
      </p>
    </main>
  );
}

// The column, the card, the tile and the desk composition come whole from APP_CSS in
// lib/tokens.ts, one sheet for all three money screens. What is declared here is only what this
// screen alone owns: the tax card, and the one pairing of true siblings.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-tax{background:${RIVER_TINT};border-color:${RIVER}33}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  // The one number he came for. Tabular figures, because a money column that wobbles as its
  // digits change is a money column he learns to distrust.
  `.lek-hero{font-size:${TYPE.hero}px;line-height:1.02;font-weight:800;letter-spacing:-0.035em;color:${RIVER_DEEP};font-variant-numeric:tabular-nums}`,
  // Capped in characters, not pixels. On a desk the card is wide and a sentence let run the full
  // width of it stops being read as belonging to the number above.
  `.lek-heronote{font-size:${TYPE.note}px;line-height:1.55;color:${INK};margin:${SPACE.sm}px 0 0;max-width:56ch}`,
  `.lek-duo{display:grid;grid-template-columns:1fr;align-items:start}`,
  `.lek-two{display:grid;grid-template-columns:1fr 1fr;gap:${SPACE.md}px;margin-bottom:${SPACE.md}px}`,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
  `.lek-week-line{font-size:${TYPE.strong}px;font-weight:700;margin:0}`,
  // The desk composition. The tax figure takes the display step and the room around it grows with
  // it: presence is the size AND the space, and only ever for this one number.
  `@media(min-width:${BREAK.desk}px){
    .lek-tax{padding:${SPACE.xxl}px}
    .lek-hero{font-size:${TYPE.display}px}
    .lek-heronote{font-size:${TYPE.body}px}
    .lek-duo{grid-template-columns:1fr 1fr;gap:${SPACE.lg}px;margin-bottom:${SPACE.lg}px}
    .lek-duo>.lek-card{margin-bottom:0}
    .lek-big{font-size:${TYPE.title}px}
    .lek-week-line{font-size:${TYPE.lead}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  heroBasis: { fontSize: TYPE.note, lineHeight: 1.55, color: RIVER_DEEP, margin: '8px 0 0' },
  scope: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '0 0 14px' },

  headline: { fontSize: TYPE.lead, lineHeight: 1.35, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 16px' },

  lines: { listStyle: 'none', margin: 0, padding: 0 },
  line: { borderTop: `1px solid ${LINE}`, padding: '12px 0 0', marginTop: 12 },
  lineTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  lineLabel: { fontSize: TYPE.body, fontWeight: 700 },
  lineSaved: { fontSize: TYPE.body, fontWeight: 800, color: GREEN, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  basis: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '4px 0 0' },

  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  refund: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: 14, margin: '18px 0 0' },

  waiting: { display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none', background: PANEL, border: `1px solid ${LINE}`, borderLeft: `3px solid ${SAFFRON_DEEP}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  waitingCount: { flex: '0 0 auto', minWidth: 40, height: 40, borderRadius: RADIUS.pill, background: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: TYPE.strong, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums' },
  waitingTop: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: INK, marginBottom: 3 },
  waitingBody: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },

  notice: { display: 'block', background: SAFFRON_TINT, border: `1px solid ${SAFFRON_DEEP}44`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  noticeTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: SAFFRON_DEEP, marginBottom: 5 },
  noticeBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  resume: { display: 'block', textDecoration: 'none', background: SAFFRON_TINT, border: `1px solid ${SAFFRON_DEEP}44`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  primaryBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  connect: { display: 'block', textDecoration: 'none', background: PANEL, border: `1px solid ${LINE}`, borderLeft: `3px solid ${WHATSAPP}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  connectTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: GREEN, marginBottom: 5 },

  stores: { textAlign: 'center', marginTop: 18 },
  storeRow: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 },
  badge: { display: 'inline-block', background: INK, color: PANEL, fontSize: TYPE.note, fontWeight: 600, padding: '10px 16px', borderRadius: RADIUS.md, textDecoration: 'none' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
