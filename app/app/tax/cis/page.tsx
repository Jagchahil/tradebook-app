import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput } from '../../../../lib/supabase';
import { ledgerFor } from '../../../../lib/ledger';
import { findOptimisations } from '../../../../lib/taxoptimiser';
import { FACTS, asPercent } from '../../../../lib/taxengine';
import { gbp0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, BREAK, FONT, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CIS. A tools screen, reached from the Tax hub's Tools row under doc 103's once test.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FIGURE HERE IS THE LEDGER'S refundDue, THE EXACT NUMBER THE OVERVIEW SHOWS, from the
// same ledgerFor() on the same getOptimiserInput(). Not a copy of the arithmetic, the same call.
// This product has already once quoted a man a CIS refund that did not exist, because two readers
// sat over one number. This screen is a second WINDOW, never a second reader.
//
// ⚠️ AND THE REFUND POSITION IS THE OPTIMISER'S OWN SENTENCE. Whether a refund is building, and
// how big, nets the student loan off and lives in lib/taxoptimiser.ts's cis_refund item. When the
// engine does not offer that item, this page says the position in words without a number, because
// a number the engine refused to stand behind is not one a page gets to invent.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function CisPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fcis');

  const optimiser = await getOptimiserInput(user.id);
  const l = ledgerFor(optimiser);
  const refundBuilding = findOptimisations(optimiser).find((o) => o.key === 'cis_refund') ?? null;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {l.refundDue > 0 ? (
        <>
          <section className="lek-card lek-cis">
            <h1 className="lek-eyebrow">CIS taken off your pay this year</h1>
            <div className="lek-hero">{gbp0(l.refundDue)}</div>
            <p className="lek-heronote">
              That is your money, already handed to HMRC by your contractors. It is credited
              against your bill when your return is filed, and whatever is left over comes back to
              you. Keep every deduction statement.
            </p>
          </section>

          <section className="lek-card">
            <h2 className="lek-h2">Where the refund stands</h2>
            {refundBuilding ? (
              // The engine's own sentence, with his figures in it and the student loan netted off.
              <p style={S.body}>{refundBuilding.detail}</p>
            ) : (
              <p style={S.body}>
                So far the year&apos;s bill is bigger than what has been deducted, so the
                deductions are paying your bill down rather than building a refund. If that flips
                as the year goes on, the refund appears here with the figure.
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="lek-card">
          <h1 className="lek-h2">CIS</h1>
          <p style={S.body}>No CIS deductions on your books this year.</p>
          <p style={S.quiet}>
            When a contractor deducts CIS from a payment you confirm, it is counted here on its
            own, credited against your tax, and never mixed into what Lekhio saved you.
          </p>
        </section>
      )}

      {/* The scheme itself, in one card, every rate named from the engine. */}
      <section className="lek-card">
        <h2 className="lek-h2">How the scheme works</h2>
        <p style={S.quiet}>
          A contractor deducts {asPercent(FACTS.cisRegisteredRate)}% from the labour part of your
          pay when you are registered for CIS, and {asPercent(FACTS.cisUnregisteredRate)}% when you
          are not. Materials are never deducted from. Gross status means nothing is taken at all.
          The deductions are tax paid in advance, which is why subcontractors are so often owed a
          refund at filing time.
        </p>
      </section>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns the one hero, drawn in the
// same shape as the Overview's tax card so the same number reads as the same number.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-cis{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  `.lek-hero{font-size:${TYPE.hero}px;line-height:1.02;font-weight:800;letter-spacing:-0.035em;color:${RIVER_DEEP};font-variant-numeric:tabular-nums}`,
  `.lek-heronote{font-size:${TYPE.note}px;line-height:1.55;color:${INK};margin:${SPACE.sm}px 0 0;max-width:56ch}`,
  `@media(min-width:${BREAK.desk}px){.lek-hero{font-size:${TYPE.title}px}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0, maxWidth: '62ch' },
};
