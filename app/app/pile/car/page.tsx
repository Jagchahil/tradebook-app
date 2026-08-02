import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { pileEntries, readOwnNames } from '../../../../lib/supabase';
import { buildPile } from '../../../../lib/reviewpile';
import { normaliseVendor } from '../../../../lib/memory';
import { categoriseBankLine } from '../../../../lib/categories';
import { gateForUser } from '../../../../lib/gateserver';
import { gbp0 } from '../../../../lib/money';
// ⚠️ useBandLabel IS ALIASED, AND IT IS NOT STYLE. eslint react-hooks reads any exported function
// beginning with "use" as a React Hook, so calling useBandLabel inside a .map() callback is a
// rules-of-hooks error even though it is a pure string lookup with no React in it. The same trap
// caught useOfHomeToDate in app/app/you/elections. Aliasing at the import is the codebase's
// existing answer; renaming the export would drag lib/capital.ts and its tests along for a lint rule.
import {
  USE_BANDS, capitalOptions, capitalRelief, isCapitalKind, useBandLabel as bandLabel,
  type CapitalKind,
} from '../../../../lib/capital';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SAFFRON_DEEP, SAFFRON_TINT,
  SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SCREEN A MAN SEES THE MOMENT HE TELLS US HE BOUGHT A CAR.
//
// 🔴 WHY IT IS A SCREEN AND NOT A SECOND DROPDOWN ON THE PILE CARD.
//
// Two reasons, and the second is the important one.
//
// The mechanical reason: the pile ships no client script, so a question that only applies once he
// has answered the one above it cannot appear on the same card without JavaScript. The choice was
// a business use dropdown drawn on every large payment, defaulted to 100%, or a second screen.
// A defaulted 100% is CAA 2001 s205 answered by a machine on a man's behalf, in the direction that
// over claims, which is the exact class of error this whole feature exists to remove.
//
// The real reason: HE IS ABOUT TO LEARN SOMETHING THAT COSTS HIM £50,000 OF EXPECTATION, AND THAT
// DESERVES A SCREEN. A man who has just spent £60,000 on a car believes the whole lot comes off his
// tax. It does not. GOV.UK, claim capital allowances, business cars: "Cars do not qualify for:
// annual investment allowance (AIA)." Year one is about £3,600. Telling him that in a footnote
// under a dropdown, on a screen whose job is to be cleared quickly, is telling him nowhere.
//
// ⚠️ NOTHING HAS BEEN FILED WHEN HE ARRIVES HERE, AND THAT IS DELIBERATE. /api/pile sends him
// here INSTEAD of filing, so a man who closes the tab has a row still sitting in his pile rather
// than a £60,000 deduction in his books. The only way out that writes anything is a button on
// this page, and one of those buttons is "it was not a car after all".
//
// ⚠️ IT WRITES NOTHING ITSELF. Both forms post back to /api/pile, which owns the order the two
// writes have to happen in. A page that also wrote would be a second implementation of the most
// dangerous sequence in the product.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

export default async function CarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const kindRaw = one('kind');
  const kind: CapitalKind | null = isCapitalKind(kindRaw) ? kindRaw : null;
  const id = (one('id') ?? '').trim();
  const category = (one('cat') ?? '').trim().toLowerCase();

  // A stale link, a hand typed one, a bookmark gone cold, or the row filed in another tab all land
  // in the same place: his pile. Not an error page. Every one of those is ordinary.
  if (!kind || kind === 'not_a_car' || !id || !category) redirect('/app/pile');

  // 🔴 OWNERSHIP IS PROVED FROM HIS OWN PILE, NOT FROM THE URL. pileEntries is scoped to his user
  // id, so a row that is not in this list is not his to answer for, whatever the query string says.
  // The amount comes from the SAME read rather than from a parameter, so the figure he is shown and
  // the figure the allowance is worked out from cannot be made to disagree by editing a link.
  const [rows, ownNames, gate] = await Promise.all([
    pileEntries(user.id), readOwnNames(user.id), gateForUser(user.id),
  ]);
  // Filing is 'entitled' work. A lapsed subscription reads his books and does nothing new, and
  // /api/pile would refuse the post anyway, so there is no point drawing a question he cannot answer.
  if (gate === 'readonly') redirect('/app/pile');

  const group = buildPile(rows, normaliseVendor, ownNames, categoriseBankLine)
    .find((g) => g.ids.includes(id));
  if (!group || group.kind === 'income') redirect('/app/pile');

  const cost = Math.abs(group.total);
  const options = capitalOptions();
  const chosen = options.find((o) => o.kind === kind);
  // Every band, priced, so the answer he gives is one he can see the consequence of. This is the
  // whole argument for the screen: four rows of arithmetic beat one paragraph of explanation.
  const priced = USE_BANDS.map((band) => ({ band, relief: capitalRelief(cost, kind, band) }));
  const atFull = capitalRelief(cost, kind, 100);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>
      <AppNav current="/app/pile" />

      <div className="lek-queue">
        <section className="lek-card">
          <div style={S.rowTop}>
            <span style={S.vendor}>{group.vendor}</span>
            <span style={S.amount}>{gbp0(cost)}</span>
          </div>
          <p style={S.meta}>{chosen ? chosen.label : 'A car'}</p>

          <h1 className="lek-title" style={{ marginTop: 14 }}>
            {atFull.inFull ? 'Good news, and it is worth reading.' : 'A car is not like your other kit.'}
          </h1>

          {/* The bad news first, in full, in his money. lib/capital.ts owns every word of this
              sentence, because the pile, the vehicle calculator and this screen all have to say
              the same thing about the same rule, and copy repeated in three files drifts in two. */}
          <p style={S.says}>{atFull.says}</p>

          {/* 🔴 THE MOST USEFUL SENTENCE IN THE PRODUCT, AND NOBODY TELLS HIM IT. The same money
              spent on a VAN is plant and machinery, inside the AIA, and comes off in full this
              year. That is not a clever trick, it is the plain difference between two things he
              might buy. Only shown where it is TRUE: on a new zero emission car the relief is
              already the whole cost, so there would be nothing to compare. */}
          {!atFull.inFull && (
            <p style={S.compare}>
              For what it is worth: the same {gbp0(cost)} spent on a van would have come off your
              profit in full this year. A van is plant and machinery and a car is not, and that is
              the whole of the difference.
            </p>
          )}
        </section>

        <section className="lek-card">
          <h2 className="lek-h2">How much of the driving is for work?</h2>
          <p style={S.sub}>
            HMRC only lets you claim the business share of a vehicle, so this is the last thing we
            need. A rough answer is the right answer. Nobody knows their exact split and a made up
            precise number is worth less than an honest round one.
          </p>

          <form action="/api/pile" method="post" style={S.form}>
            <input type="hidden" name="ids" value={group.ids.join(',')} />
            <input type="hidden" name="vendor" value={group.vendor} />
            <input type="hidden" name="verdict" value="business" />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="capital_kind" value={kind} />

            {/* Radios rather than a select, because each answer carries a figure and a select
                hides three quarters of them behind a tap. He is choosing between four amounts of
                money, so he should be able to see four amounts of money. */}
            <fieldset style={S.fieldset}>
              <legend style={S.legend}>Pick the closest</legend>
              {priced.map(({ band, relief }, i) => (
                <label key={band} htmlFor={`band-${band}`} style={S.band}>
                  <input
                    type="radio"
                    id={`band-${band}`}
                    name="business_use_pct"
                    value={band}
                    defaultChecked={i === 0}
                    style={S.radio}
                  />
                  <span style={S.bandText}>
                    <span style={S.bandLabel}>{bandLabel(band)}</span>
                    <span style={S.bandMoney}>
                      {gbp0(relief.thisYear)} off your profit this year
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <button type="submit" className="lek-primary">File it</button>
          </form>
        </section>

        {/* 🔴 THE WAY OUT. He picked the wrong thing in a dropdown, or he has realised the pickup
            he bought is not a car. Without this the only escape from a mis-click is the back
            button, and a man who cannot undo an answer stops giving answers. It files exactly as
            the pile would have: an ordinary cost, in full, under the category he already chose. */}
        <section className="lek-card">
          <h2 className="lek-h2">It was not a car</h2>
          <p style={S.sub}>
            A van, a pickup, a machine or a set of tools. Say so and we will put it through in full
            this year, the way everything else on your books goes through.
          </p>
          <form action="/api/pile" method="post" style={S.form}>
            <input type="hidden" name="ids" value={group.ids.join(',')} />
            <input type="hidden" name="vendor" value={group.vendor} />
            <input type="hidden" name="verdict" value="business" />
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="capital_kind" value="not_a_car" />
            <button type="submit" className="lek-quiet">It was not a car, file it in full</button>
          </form>
          <p style={S.hint}>
            <a href="/app/pile" style={S.crossLink}>Leave it for now</a>
          </p>
        </section>
      </div>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `select:focus,button:focus,input:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  `.lek-primary{width:100%;margin-top:${SPACE.md}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-quiet{width:100%;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${INK};background:${SURFACE};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;cursor:pointer}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-queue{max-width:760px;margin:0 auto}
    .lek-title{font-size:${TYPE.stat}px}
    .lek-primary,.lek-quiet{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },
  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: 0 },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  vendor: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em' },
  amount: { fontSize: TYPE.strong, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  meta: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '4px 0 0' },
  says: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '0 0 12px' },
  // The van comparison. Tinted, because it is the one thing on the screen he did not come looking
  // for and the one thing he will repeat to somebody else.
  compare: {
    background: SAFFRON_TINT, border: `1px solid ${edge(SAFFRON_DEEP, 27)}`, borderRadius: RADIUS.md,
    padding: 14, fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: 0,
  },
  form: { margin: '14px 0 0' },
  fieldset: { border: 'none', padding: 0, margin: 0 },
  legend: { fontSize: TYPE.label, fontWeight: 700, color: MUTED, padding: 0, marginBottom: 8 },
  band: {
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', cursor: 'pointer',
    background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, marginBottom: 8,
  },
  radio: { marginTop: 3, width: 20, height: 20, flexShrink: 0, accentColor: RIVER },
  bandText: { display: 'flex', flexDirection: 'column', gap: 2 },
  bandLabel: { fontSize: TYPE.body, lineHeight: 1.4, fontWeight: 700, color: INK },
  bandMoney: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, fontVariantNumeric: 'tabular-nums' },
  hint: { fontSize: TYPE.label, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: '14px 0 0' },
  crossLink: { color: RIVER_DEEP, fontWeight: 700 },
};
