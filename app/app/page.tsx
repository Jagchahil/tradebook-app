import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../lib/webauth';
import { SESSION_COOKIE } from '../../lib/websession';
import {
  getOptimiserInput, weeklyTotals, weeklyUpdateFactsFor, readAnnouncementSources,
} from '../../lib/supabase';
import { ledgerFor, headline } from '../../lib/ledger';
import { weeklyInput, weeklyFigures, weeklyLine } from '../../lib/weeklyupdate';
import { selectAnnouncements, appliedLineFor, tagFor } from '../../lib/announcements';
import { AnnouncementsBanner, type BannerItem } from '../_shared/AnnouncementsBanner';
import { A11Y_CSS, FONT, GREEN, INK, LINE, MUTED, PAPER, RADIUS, RIVER, RIVER_DEEP } from '../../lib/tokens';

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

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export default async function MoneyPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  // Everything at once. Three round trips in parallel rather than three in a row, because the
  // budget for this page is one bad-signal second, not three.
  const [optimiser, totals, factsMap, sources] = await Promise.all([
    getOptimiserInput(user.id),
    weeklyTotals(user.id),
    weeklyUpdateFactsFor([user.id]).catch(() => null),
    readAnnouncementSources(user.id).catch(() => null),
  ]);

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
      <AnnouncementsBanner items={items} />

      <section style={S.card}>
        <h1 style={S.h1}>{headline(l)}</h1>

        {l.enough ? (
          <>
            <div style={S.two}>
              <div>
                <div style={S.small}>Without Lekhio</div>
                <div style={S.big}>{money(l.withoutLekhio)}</div>
              </div>
              <div>
                <div style={S.small}>With Lekhio</div>
                <div style={{ ...S.big, color: GREEN }}>{money(l.withLekhio)}</div>
              </div>
            </div>

            {/* WHERE THE MONEY CAME FROM. The ledger's whole job is that he can check our working,
                so every line carries its own plain English basis rather than a number on its own. */}
            <ul style={S.lines}>
              {l.lines.map((line) => (
                <li key={line.key} style={S.line}>
                  <div style={S.lineTop}>
                    <span style={S.lineLabel}>{line.label}</span>
                    <span style={S.lineSaved}>{money(line.saved)} saved</span>
                  </div>
                  <div style={S.basis}>{money(line.deducted)} off your profit. {line.basis}</div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          // NOT ENOUGH IS NOT ZERO. lib/ledger.ts refuses to draw a confident number off three
          // weeks of data, and this screen says why rather than showing a proud and silly £14.
          <p style={S.note}>{l.note}</p>
        )}

        {/* HIS OWN MONEY, HELD BY HMRC. Its own number, never added to what we saved him. This
            product has already once quoted a man a CIS refund that did not exist. */}
        {l.refundDue > 0 && (
          <p style={S.refund}>
            <b>{money(l.refundDue)}</b> of CIS has been taken off your pay this year. That is your
            money, and it comes back to you when your return is filed.
          </p>
        )}
      </section>

      <section style={S.card}>
        <h2 style={S.h2}>Your week</h2>
        <p style={S.week}>
          {money(figures.income)} in, {money(figures.expenses)} out.{' '}
          {figures.profit >= 0
            ? `That leaves ${money(figures.profit)}.`
            : `That is ${money(Math.abs(figures.profit))} more out than in.`}
        </p>
        {/* THE SAME SENTENCE WHATSAPP SENDS, from the same function. If he asks for his weekly
            summary by text and then opens this page, the two must not disagree by a word. */}
        <p style={S.line2}>{weeklyLine(week)}</p>
      </section>

      <p style={S.foot}>
        Everything here is money you have confirmed. Send a receipt on WhatsApp any time and it
        lands on this page.
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
};
