import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readOptimiserOrNull } from '../../../../lib/supabase';
import { findOptimisations } from '../../../../lib/taxoptimiser';
import { TAX_YEAR } from '../../../../lib/taxengine';
import { gbp0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import { GREEN_TINT, INK, MUTED, ON_GREEN_TINT, PAPER, SURFACE } from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';
import { RecordsUnreadable } from '../../RecordsUnreadable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WAYS TO SAVE. The optimiser's findings, rendered honestly, one card per lever.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THERE IS NO TOTAL AT THE TOP OF THIS PAGE, AND THAT IS THE PAGE'S WHOLE DISCIPLINE.
//
// The reveal on /app/setup holds the rule this screen inherits: never sum reliefs that hang on
// facts we do not hold. lib/taxoptimiser.ts carries Marriage Allowance at £0 until a man has
// actually said yes to being married, for exactly this reason, and a headline that added "up to
// £252" to "up to £3,000" would be a promise built on maybes, on the screen whose job is to prove
// we are worth £12.99. Each lever stands alone, with its own estimate where one can honestly be
// made and no number where it cannot.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ EVERY WORD OF EVERY SUGGESTION COMES FROM lib/taxoptimiser.ts. The detail sentences carry
// his own figures and the conditions welded in ("as long as they pay basic rate tax"), and what
// we are willing to claim about a man's tax is not a presentation decision. This file draws cards
// around sentences the engine wrote, and that is all it does.
//
// ⚠️ AND THE MONEY LEVERS ARE HIS TO PULL, NEVER OURS. A pension contribution or a purchase is
// irreversible, so the engine classes them draft-only and the footer here says the standing rule
// out loud. Lekhio never moves money.

export default async function WaysToSavePage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fways-to-save');

  const optimiser = await readOptimiserOrNull(user.id);

  // 🔴 B24. A FAILED READ IS NOT A YEAR OF ZEROS, AND UNTIL TODAY THIS PAGE COULD NOT TELL THE
  // TWO APART. readOptimiserOrNull folds the thrown read and the unreadable rows into ONE null, and
  // the line goes up INSTEAD OF the figures rather than a confident zero he cannot argue with.
  if (!optimiser) return <RecordsUnreadable current="/app/tax/ways-to-save" title="Ways to save" />;
  const opts = findOptimisations(optimiser);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax/ways-to-save" />

      <section className="lek-card">
        <h1 className="lek-h2">Ways to save</h1>
        <p style={S.body}>
          {opts.length === 0
            ? 'Nothing to suggest right now.'
            : opts.length === 1
              ? 'One thing worth a look, from your own figures.'
              : `${opts.length} things worth a look, from your own figures.`}
        </p>
        <p style={S.quiet}>
          These are the published rules applied to what you have confirmed, richest first. There is
          no total at the top on purpose: some of these hang on facts only you know, and a total
          built on maybes is not a figure you could stand behind.
        </p>
      </section>

      {opts.length === 0 ? (
        <section className="lek-card">
          <p style={S.quiet}>
            When your figures open something up, it appears here on its own. You do not need to
            check back: anything worth money finds its way to you.
          </p>
        </section>
      ) : (
        opts.map((o) => (
          <section key={o.key} className="lek-card">
            <div style={S.cardTop}>
              <h2 style={S.title}>{o.title}</h2>
              {/* An estimate only where the engine could make one from facts it holds. An info
                  item gets a quiet word instead of a number, never a zero dressed as a saving. */}
              {o.estSaving > 0 ? (
                <span style={S.saving}>about {gbp0(o.estSaving)}</span>
              ) : o.info ? (
                <span style={S.infoChip}>worth knowing</span>
              ) : null}
            </div>
            <p style={S.detail}>{o.detail}</p>
          </section>
        ))
      )}

      <p style={S.foot}>
        Worked out from your confirmed figures and the published {TAX_YEAR} rules. Anything that
        moves money, a pension, a purchase, is yours to do and never ours: Lekhio never spends for
        you.
      </p>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns only the card header row.
const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.lead, lineHeight: 1.45, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },

  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' },
  title: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  saving: { flex: '0 0 auto', fontSize: TYPE.note, fontWeight: 800, color: ON_GREEN_TINT, background: GREEN_TINT, borderRadius: RADIUS.pill, padding: '4px 12px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  infoChip: { flex: '0 0 auto', fontSize: TYPE.label, fontWeight: 700, color: MUTED, background: SURFACE, borderRadius: RADIUS.pill, padding: '4px 12px', whiteSpace: 'nowrap' },
  detail: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `${SPACE.xs}px 0 0`, maxWidth: '68ch' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
