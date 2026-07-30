import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../lib/webauth';
import { SESSION_COOKIE } from '../../lib/websession';
import {
  getOptimiserInput, weeklyTotals, weeklyUpdateFactsFor, readAnnouncementSources,
  readOnboardingProgress, readProvedPhone,
} from '../../lib/supabase';
import { toStep, isDone, stepTitle, stepNumber, stepCount } from '../../lib/onboarding';
import { appStoreLive, APP_STORE_URL, PLAY_STORE_URL, WHATSAPP_NUMBER } from '../../lib/features';
import { waLinksConfigured } from '../../lib/walink';
import { gateForUser } from '../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../lib/gate';
import { ledgerFor, headline } from '../../lib/ledger';
import { weeklyInput, weeklyFigures, weeklyLine } from '../../lib/weeklyupdate';
import { selectAnnouncements, appliedLineFor, tagFor } from '../../lib/announcements';
import { AnnouncementsBanner, type BannerItem } from '../_shared/AnnouncementsBanner';
import { gbp0, gbpAbs0 } from '../../lib/money';
import {
  A11Y_CSS, FONT, GREEN, INK, LINE, MUTED, PAPER, RADIUS, RIVER, RIVER_DEEP, SAFFRON_DEEP,
  SAFFRON_TINT, WHATSAPP,
} from '../../lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE MONEY VIEW. The screen a man opens when he wants to know what he owes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ SERVER RENDERED, AND THAT IS THE WHOLE POINT OF THE WEB APP.
//
// He is on a cheap Android on a bad signal, standing in somebody's kitchen with one hand on a
// ladder. Every kilobyte of JavaScript is a second he spends looking at a white screen wondering
// whether we have taken his money and broken. So his figures are already IN the HTML when it
// arrives. There is no loading spinner on this page because there is nothing to load.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT ONE FIGURE ON THIS SCREEN IS COMPUTED HERE.
//
// The ledger comes from ledgerFor(), the week from weeklyInput() and weeklyLine(), the banner from
// selectAnnouncements(). All three are the SAME functions /api/ledger, /api/weekly and
// /api/announcements call, which are the same ones the phone app and the WhatsApp reply read. That
// is not tidiness. /api/ledger's own header lists three separate times this codebase was caught
// with two readers over one number, and the lesson it draws is that the one which drifts is the one
// he believes. A server rendered page that did its own arithmetic would be the fourth, and the
// first where the disagreement was between his screen and his quarter pack.
//
// ⚠️ AND THE USER ID COMES FROM THE SESSION ROW, NEVER FROM THE URL.
//
// There is no id in the path and no id in the query, so there is nothing to change. See
// lib/webauth.ts and test/webauth.test.mjs, which fails the build if any page under app/app starts
// reading one.

// ⚠️ NO LOCAL MONEY FORMATTER HERE. This page had one, written the same day lib/money.ts was
// created to replace the seventeen the 28 July sweep found. It would print "£-33" for a negative,
// which is the exact bug that sweep existed to remove, and it survived only because nothing on
// this screen happens to go negative today. A formatter that is correct by luck is the eighteenth.

export default async function MoneyPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  // Everything at once. Three round trips in parallel rather than three in a row, because the
  // budget for this page is one bad-signal second, not three.
  const [optimiser, totals, factsMap, sources, progress, proved, gate] = await Promise.all([
    getOptimiserInput(user.id),
    weeklyTotals(user.id),
    weeklyUpdateFactsFor([user.id]).catch(() => null),
    readAnnouncementSources(user.id).catch(() => null),
    readOnboardingProgress(user.id).catch(() => null),
    readProvedPhone(user.id).catch(() => null),
    // ⚠️ IN THE SAME ROUND TRIP AS EVERYTHING ELSE. This runs on the screen a man opens to find out
    // what he owes, on a bad signal, so it may not add a serial wait to it.
    gateForUser(user.id),
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
  // for the resume line above.
  //
  // It is drawn while his phone is NOT connected and disappears the moment it is. A permanent row
  // saying "connected" is a row he reads and rejects every time he opens the one screen he came to
  // for a number, and doc 103's standing question is what we took out to make room for it.
  //
  // A failed read draws nothing, because telling a man who connected last week that he has not is
  // worse than saying nothing at all.
  const offerWhatsApp = proved !== null && !proved.phone
    && waLinksConfigured() && WHATSAPP_NUMBER.length >= 8;

  const l = ledgerFor(optimiser);
  const week = weeklyInput(totals, factsMap?.get(user.id), new Date());
  const figures = weeklyFigures(week);

  const items: BannerItem[] = sources
    ? selectAnnouncements({
        knowledge: sources.knowledge,
        manual: sources.manual,
        appliedItemIds: sources.appliedItemIds,
        dismissedKeys: sources.dismissedKeys,
      }).map((a) => ({
        key: a.key,
        source: a.source,
        tag: tagFor(a),
        kind: a.kind,
        title: a.title,
        body: a.body,
        sourceUrl: a.sourceUrl,
        effectiveDate: a.effectiveDate,
        // From the module, which refuses to produce this for an item it cannot prove. There is
        // nothing here for a caller to forget.
        appliedLine: appliedLineFor(a),
        at: a.at,
      }))
    : [];

  return (
    <main style={S.wrap}>
      <style>{CSS}</style>

      <header style={S.head}>
        <span style={S.logo}>Lekhio</span>
        {/* Signing out is a state change, so it is a form and not a link. A GET that ends a session
            is a session any other site can end for him with an image tag. */}
        <form action="/api/auth/signout" method="post">
          <button type="submit" style={S.out}>Sign out</button>
        </form>
      </header>

      {/* Item 1 finally has a customer surface. Khoji reads the law nightly and a human approves
          what matters, and until this line existed no customer ever saw it happen. */}
      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE TRIAL HAS ENDED, AND HE CAN STILL SEE EVERY FIGURE ON THIS PAGE.
          lib/gate.ts's header is the argument: his records are his, the work is what he was buying,
          and a product that hides finished work behind a card form is taking back something he has
          already paid for. Under UK GDPR it is also a right of access problem we would have built
          on purpose.
          So this is a banner, not a wall. Nothing below it is removed.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {gate === 'readonly' ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : null}

      <AnnouncementsBanner items={items} />

      {resumeAt ? (
        <a href={`/app/setup?step=${resumeAt}`} style={S.resume}>
          <span style={S.resumeTop}>Finish setting up &middot; step {stepNumber(resumeAt)} of {stepCount()}</span>
          <span style={S.resumeBody}>
            You stopped at {stepTitle(resumeAt).toLowerCase()}. Everything you answered is saved, and
            the rest is where the money we can find you comes from.
          </span>
        </a>
      ) : null}

      <section style={S.card}>
        <h1 style={S.h1}>{headline(l)}</h1>

        {l.enough ? (
          <>
            <div style={S.two}>
              <div>
                <div style={S.small}>Without Lekhio</div>
                <div style={S.big}>{gbp0(l.withoutLekhio)}</div>
              </div>
              <div>
                <div style={S.small}>With Lekhio</div>
                <div style={{ ...S.big, color: GREEN }}>{gbp0(l.withLekhio)}</div>
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
          // to be confident, so rendering the note underneath printed the identical sentence twice,
          // one above the other, on the first screen a new customer ever sees.
          l.note && l.note !== headline(l) ? <p style={S.note}>{l.note}</p> : null
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

      <section style={S.card}>
        <h2 style={S.h2}>Your week</h2>
        <p style={S.week}>
          {gbp0(figures.income)} in, {gbp0(figures.expenses)} out.{' '}
          {figures.profit >= 0
            ? `That leaves ${gbp0(figures.profit)}.`
            : `That is ${gbpAbs0(figures.profit)} more out than in.`}
        </p>
        {/* THE SAME SENTENCE WHATSAPP SENDS, from the same function. If he asks for his weekly
            summary by text and then opens this page, the two must not disagree by a word. */}
        <p style={S.line2}>{weeklyLine(week)}</p>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE ONE PLACE THAT OFFERS WHATSAPP, AND IT IS BEHIND THE FRONT DOOR TOO.
          test/frontdoor.test.mjs used to forbid the word WhatsApp anywhere under app/app, because
          inbound resolves a message BY PHONE NUMBER and a web customer's number is deliberately
          unproved: every mention was an instruction he could not follow. Binding is what makes it
          followable, so the rule narrows rather than disappearing. This row and /app/connect are
          the only two places allowed to say it, and only while he genuinely can act on it.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {offerWhatsApp ? (
        <a href="/app/connect" style={S.connect}>
          <span style={S.connectTop}>Add WhatsApp</span>
          <span style={S.connectBody}>
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
          They were on /start, on the code screen and on both Stripe return screens, which is the
          worst possible placement under that rule: offered to a man in the middle of signing up, as
          an alternative to finishing.
          ⚠️ AND ONLY WHEN THE STORES REALLY HAVE IT. A dimmed "soon" chip is doc 103's third test
          exactly: a button whose only function is to say the feature does not exist yet is an advert
          for our roadmap. So until NEXT_PUBLIC_APP_STORE_LIVE is true this renders nothing at all,
          anywhere, and nobody is told to wait for something.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {appStoreLive() && APP_STORE_URL && PLAY_STORE_URL ? (
        <section style={S.stores}>
          <p style={S.storeNote}>
            Lekhio is on your phone too. Same books, same figures, and the two stay in step.
          </p>
          <div style={S.storeRow}>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={S.badge}>App Store</a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" style={S.badge}>Google Play</a>
          </div>
        </section>
      ) : null}

      {/* THE WAY THROUGH TO THE PILE. Everything on the screen above is money he has CONFIRMED, so
          if anything is waiting on him this line is the only reason the figures are not the whole
          truth. It is a plain link because looking at a list changes nothing. */}
      <p style={S.foot}>
        Everything here is money you have confirmed. <a href="/app/pile" style={S.footLink}>Anything
        waiting on you</a> is not counted yet. Connect your bank and new spending lands here on its own.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  `.lek-app{max-width:640px;margin:0 auto}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK, padding: '18px 16px 40px', maxWidth: 640, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: RIVER_DEEP },
  out: { background: 'transparent', border: 'none', color: MUTED, fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: 6 },
  card: { background: '#fff', border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '20px 18px', marginBottom: 14 },
  h1: { fontSize: 21, lineHeight: 1.3, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 18px' },
  h2: { fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px', margin: '0 0 10px' },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 },
  small: { fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 4 },
  big: { fontSize: 26, fontWeight: 800, letterSpacing: '-0.8px' },
  lines: { listStyle: 'none', margin: 0, padding: 0 },
  line: { borderTop: `1px solid ${LINE}`, padding: '12px 0 0', marginTop: 12 },
  lineTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  lineLabel: { fontSize: 15, fontWeight: 700 },
  lineSaved: { fontSize: 15, fontWeight: 800, color: GREEN, whiteSpace: 'nowrap' },
  basis: { fontSize: 13.5, lineHeight: 1.5, color: MUTED, margin: '4px 0 0' },
  note: { fontSize: 15, lineHeight: 1.55, color: MUTED, margin: 0 },
  refund: { fontSize: 14, lineHeight: 1.55, color: INK, background: '#F2F0EA', borderRadius: RADIUS.md, padding: 14, margin: '18px 0 0' },
  week: { fontSize: 17, fontWeight: 700, margin: '0 0 8px' },
  line2: { fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: 0 },
  foot: { fontSize: 13, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
  stores: { textAlign: 'center', marginTop: 18 },
  storeNote: { fontSize: 13, color: MUTED, margin: '0 0 10px' },
  storeRow: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  badge: { display: 'inline-block', background: INK, color: '#fff', fontSize: 13.5, fontWeight: 600, padding: '10px 16px', borderRadius: RADIUS.md, textDecoration: 'none' },
  resume: { display: 'block', textDecoration: 'none', background: SAFFRON_TINT, border: `1px solid ${SAFFRON_DEEP}44`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  resumeTop: { display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.3px', color: SAFFRON_DEEP, marginBottom: 5 },
  resumeBody: { display: 'block', fontSize: 14.5, lineHeight: 1.55, color: INK },
  footLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
  locked: { display: 'block', background: SAFFRON_TINT, border: `1px solid ${SAFFRON_DEEP}44`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.3px', color: SAFFRON_DEEP, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: 14.5, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: '#fff', border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: 15, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },
  connect: { display: 'block', textDecoration: 'none', background: '#fff', border: `1px solid ${LINE}`, borderLeft: `3px solid ${WHATSAPP}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  connectTop: { display: 'block', fontSize: 12, fontWeight: 800, letterSpacing: '0.3px', color: GREEN, marginBottom: 5 },
  connectBody: { display: 'block', fontSize: 14.5, lineHeight: 1.55, color: INK },
};
