import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { getConfirmedTransactionsForRange, getBusinessName, getBusinessProfile, capitalAllowanceForYear } from '../../../lib/supabase';
import { buildIncomeProof } from '../../../lib/incomeproof';
import { gbp2 } from '../../../lib/money';
import { A11Y_CSS, APP_CSS, BREAK, FONT, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PROOF OF INCOME. The one page a landlord, a lender or a mortgage broker asks a self employed
// man for, printed straight from the books he already keeps.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ EVERY FIGURE COMES FROM lib/incomeproof.ts, the same buildIncomeProof the API route and
// the phone app hand out. This page draws the document, it computes nothing: two readers over
// one number drift, and the copy his lender holds must never disagree with the one his phone
// shows.
//
// ⚠️ PRINTABLE, WITH NO SCRIPT. The API route's HTML document carries a "Save as PDF" button
// wired to a click handler, which the app pages are not allowed: the whole web app ships zero
// client JavaScript. So this page carries a print stylesheet instead. His browser's own print
// menu does the rest, and the sheet strips the nav and the controls so what lands on paper is
// the document and only the document.
//
// ⚠️ IT SAYS WHAT IT IS NOT, in print as well as on screen: not an HMRC document, not an SA302,
// not a filed return. A lender-facing page that oversold itself would be the exact kind of
// implied endorsement docs/05 exists to forbid.
//
// ⚠️ AND A YEAR WITH NOTHING CONFIRMED GETS AN HONEST SENTENCE, NOT A PAGE OF ZEROS. A zero
// document with our name on it, handed to a landlord, reads as "this man earns nothing", which
// is worse than no document at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Opening year of the tax year that d falls in (6 April boundary). The same two lines
// app/api/income-proof/route.ts uses; a date fact, not a rule that can drift.
function currentTaxYear(d: Date): number {
  return d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

export default async function ProofOfIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const now = new Date();
  const thisYear = currentTaxYear(now);
  // The year is a public fact, not an id: a query string carrying 2025 grants nothing and can
  // only ever select which of HIS OWN years is summarised. Anything unreadable is this year.
  const asked = Number(one('y'));
  const year = Number.isInteger(asked) && asked >= 2015 && asked <= thisYear ? asked : thisYear;

  const startISO = `${year}-04-06`;
  const yearEndISO = `${year + 1}-04-05`;
  const todayISO = now.toISOString().slice(0, 10);
  const endISO = todayISO < yearEndISO ? todayISO : yearEndISO;

  const [rows, businessName, biz, capAllow] = await Promise.all([
    getConfirmedTransactionsForRange(user.id, startISO, endISO),
    getBusinessName(user.id),
    // \U0001F534 THIS PAGE NEVER ASKED WHO HE WAS, and it is the one sheet that leaves the building.
    // A 50% partner was handed the WHOLE firm's income as his own, over our name, on a document
    // headed "for income verification". A failed read is null, which is unknown, which gets exactly
    // the proof this page drew before. See lib/incomeproof.ts for the argument.
    getBusinessProfile(user.id).catch(() => null),
    // The car's writing down allowance for the year, so this document's taxable profit matches the
    // Overview and the tax summary. Zero for a man with no car; a failed read is zero, which shows
    // profit before the allowance rather than blocking the sheet.
    capitalAllowanceForYear(user.id, year).catch(() => 0),
  ]);
  const proof = buildIncomeProof(rows, businessName, year, now, biz
    ? { type: biz.businessType, sharePercent: biz.partnershipShare }
    : null, capAllow);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <div className="lek-noprint">
        <AppNav current="/app/proof-of-income" />
      </div>

      <div className="lek-noprint" style={S.yearRow}>
        {[thisYear, thisYear - 1].map((y) => (
          y === year ? (
            <span key={y} className="lek-year on">{y === thisYear ? 'This tax year' : 'Last tax year'}</span>
          ) : (
            <a key={y} className="lek-year" href={`/app/proof-of-income?y=${y}`}>
              {y === thisYear ? 'This tax year' : 'Last tax year'}
            </a>
          )
        ))}
      </div>

      {proof.txCount === 0 ? (
        <section className="lek-card lek-noprint">
          <p style={S.leadLine}>Nothing is confirmed for the {proof.taxYear} tax year yet.</p>
          <p style={S.quiet}>
            This page fills itself in as your books do. A summary of zeros with our name on it
            would tell a lender something false about you, so we do not draw one.
          </p>
        </section>
      ) : (
        <>
          <section className="lek-card lek-sheet">
            <div style={S.brandRow}>
              <span style={S.brandMark}>L</span>
              <span style={S.brandName}>Lekhio</span>
            </div>

            <h1 className="lek-doctitle">Income summary</h1>
            <p style={S.docSub}>
              {proof.businessName} {'·'} tax year {proof.taxYear} ({proof.periodLabel})
            </p>

            <dl style={S.table}>
              <div style={S.tr}>
                <dt style={S.th}>Gross income</dt>
                <dd style={S.td}>{gbp2(proof.income)}</dd>
              </div>
              <div style={S.tr}>
                <dt style={S.thMut}>Allowable expenses</dt>
                <dd style={S.tdMut}>{gbp2(proof.expenses)}</dd>
              </div>
              <div style={S.tr}>
                <dt style={S.thBold}>Net profit</dt>
                <dd style={S.tdBold}>{gbp2(proof.profit)}</dd>
              </div>
              <div style={S.trLast}>
                {/* 🔴 THE LABEL COMES FROM THE ENGINE, BECAUSE IT IS NOT ALWAYS TRUE. This said
                    "Estimated Income Tax and National Insurance" for everybody, on a document that
                    goes to a mortgage broker. Rental profit attracts no Class 4 National Insurance,
                    so for a landlord that line named a tax he does not pay, and the figure under it
                    included it. lib/incomeproof.ts now splits trade from property and hands back
                    the honest wording with the honest number. */}
                {/* \U0001F534 AND NO PERSONAL TAX ESTIMATE ON A COMPANY'S PROFIT. Running the sole trader
                    rates over a director's company turnover charges him income tax and Class 4 on
                    money that is taxable IN THE COMPANY, and prints the words on a page he hands a
                    lender. The row goes rather than being reworded, and the note below says where
                    the answer actually lives. */}
                {proof.companyExcluded ? null : (
                  <>
                    <dt style={S.thMut}>{proof.estimatedTaxLabel}</dt>
                    <dd style={S.tdMut}>{gbp2(proof.estimatedTax)}</dd>
                  </>
                )}
              </div>
            </dl>

            {/* 🔴 A CAR IS NOT AN ALLOWABLE EXPENSE IN THE YEAR, AND SAYING SO KEEPS THIS DOCUMENT
                HONEST. The engine holds it out of Out above (GOV.UK, business cars: cars do not
                qualify for the annual investment allowance), so without this line a lender would see
                the money leave the account in the books and never learn why it is not in expenses.
                lib/incomeproof.ts decides the figure off the same writtenDown boolean lib/quarterpack
                .ts uses, so the printed sheet and /app/tax/summary cannot drift. */}
            {proof.capitalCost > 0 ? (
              <p style={S.capital}>
                {gbp2(proof.capitalCost)} more left the account on{' '}
                {proof.capitalCount === 1 ? 'a car' : `${proof.capitalCount} cars`}, which is not an
                allowable expense in one year. A car comes off over several years rather than all at
                once, so it is not in the figures above.
                {proof.capitalAllowance > 0
                  ? ` This year's writing down allowance of ${gbp2(proof.capitalAllowance)} is already taken off the profit above.`
                  : ''}
              </p>
            ) : null}

            {/* The sentence that says whose figures these are. Null for a sole trader, whose figures
                are simply his, so nothing is added to the one page he wants to keep short. */}
            {proof.shareNote ? <p style={S.shareNote}>{proof.shareNote}</p> : null}
            {proof.companyExcluded ? (
              <p style={S.shareNote}>
                These are the company&apos;s figures, not this person&apos;s personal income. A
                company pays Corporation Tax on its own return, and the director is paid in salary
                and dividends, which are not shown here.
              </p>
            ) : null}

            <p style={S.stamp}>
              Prepared by Lekhio {'·'} {longDate(proof.generatedAt.slice(0, 10))} {'·'} {proof.txCount} entries
            </p>

            <p style={S.note}>
              This is a summary prepared from the figures {proof.businessName} has recorded and
              confirmed in Lekhio, for income verification. It is not an HMRC document, an SA302,
              or a filed tax return, and it is only as complete as the records kept. The estimated
              tax figure, where one is shown, is guidance based on the published {proof.taxYear}{' '}
              rates and does not include any other income, reliefs or allowances the person may
              have. For an official
              SA302 or tax year overview, the person can log in to their HMRC account. Some
              lenders ask for HMRC documents as well as a summary like this.
            </p>
          </section>

          <p className="lek-noprint" style={S.printHint}>
            To hand it over, print this page or save it as a PDF from your browser&apos;s print menu.
            The nav and these notes stay off the paper. It is your document: you send it, we do
            not.
          </p>
        </>
      )}
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-doctitle{font-size:${TYPE.stat}px;letter-spacing:-0.03em;font-weight:800;margin:${SPACE.lg}px 0 2px}`,
  `.lek-year{display:inline-block;padding:7px 14px;font-size:${TYPE.note}px;font-weight:700;font-family:${FONT};color:${MUTED};background:${SURFACE};border-radius:${RADIUS.pill}px;text-decoration:none}`,
  `.lek-year.on{color:${RIVER_DEEP};background:${RIVER_TINT}}`,
  // The print sheet. What lands on paper is the document alone, on white, with the browser's
  // own page margins doing the framing.
  `@media print{
    .lek-noprint{display:none !important}
    main{background:${PANEL} !important;padding:0 !important}
    .lek-sheet{border:none !important;animation:none !important}
    @page{margin:18mm}
  }`,
  `@media(min-width:${BREAK.desk}px){
    .lek-doctitle{font-size:${TYPE.title}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  yearRow: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' },

  brandRow: { display: 'flex', alignItems: 'center', gap: 10 },
  brandMark: { width: 28, height: 28, borderRadius: 8, background: RIVER, color: ON_RIVER, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: TYPE.body },
  brandName: { fontWeight: 800, fontSize: TYPE.strong, letterSpacing: '-0.02em' },

  docSub: { fontSize: TYPE.note, color: MUTED, margin: '0 0 18px' },

  table: { margin: 0 },
  tr: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', borderBottom: `1px solid ${LINE}`, padding: '11px 0' },
  trLast: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', padding: '11px 0' },
  th: { fontSize: TYPE.body, fontWeight: 600, margin: 0 },
  thMut: { fontSize: TYPE.body, fontWeight: 600, color: MUTED, margin: 0 },
  thBold: { fontSize: TYPE.body, fontWeight: 800, margin: 0 },
  td: { fontSize: TYPE.body, fontWeight: 700, margin: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  tdMut: { fontSize: TYPE.body, fontWeight: 700, color: MUTED, margin: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  tdBold: { fontSize: TYPE.body, fontWeight: 800, margin: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },

  // Sits under the table, above the stamp, in the document's own ink rather than muted: it is a
  // statement about what the figures ARE, not a footnote about them.
  shareNote: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, margin: `${SPACE.md}px 0 0`, maxWidth: '62ch' },
  // The capital line sits under the table in muted ink: it explains where money that is not in
  // expenses went, without competing with the figures a lender reads first.
  capital: { fontSize: TYPE.label, lineHeight: 1.6, color: MUTED, margin: `${SPACE.sm}px 0 0`, maxWidth: '62ch' },
  stamp: { display: 'inline-block', marginTop: 18, background: SURFACE, borderRadius: RADIUS.sm, padding: '8px 12px', fontSize: TYPE.label, fontWeight: 700, color: RIVER_DEEP },
  note: { fontSize: TYPE.label, color: MUTED, lineHeight: 1.6, margin: '18px 0 0' },

  leadLine: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  printHint: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
