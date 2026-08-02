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
import { capitalOptions, capitalRelief, isCapitalKind, type CapitalKind } from '../../../../lib/capital';
// 🔴 THE ARITHMETIC AND THE TWO PARAGRAPHS LIVE IN ONE PLACE. /app/entry asks the same question
// of a payment that was filed before we knew to ask it, and four figures of a man's money
// rendered from two copies is how the copy he is looking at becomes the one that drifted.
import { CarBands, CarVerdict, CAR_CSS } from '../../CarQuestion';
import { A11Y_CSS, APP_CSS, BREAK, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import { INK, LINE, MUTED, PAPER, RIVER, RIVER_DEEP, SURFACE } from '../../../../lib/apptheme';
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
  const chosen = capitalOptions().find((o) => o.kind === kind);
  // Only for the heading. The figures themselves come from <CarVerdict> and <CarBands>.
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

          {/* The bad news first, in full, in his money, and the van comparison under it. */}
          <CarVerdict cost={cost} kind={kind} />
        </section>

        <section className="lek-card">
          <h2 className="lek-h2">How much of the driving is for work?</h2>
          <p style={S.sub}>
            HMRC only lets you claim the business share of a vehicle, so this is the last thing we
            need. A rough answer is the right answer. Nobody knows their exact split and a made up
            precise number is worth less than an honest round one.
          </p>

          <CarBands
            cost={cost}
            kind={kind}
            action="/api/pile"
            hidden={{
              ids: group.ids.join(','),
              vendor: group.vendor,
              verdict: 'business',
              category,
              capital_kind: kind,
            }}
            submitLabel="File it"
          />
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
  CAR_CSS,
  `select:focus,button:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
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
  form: { margin: '14px 0 0' },
  hint: { fontSize: TYPE.label, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: '14px 0 0' },
  crossLink: { color: RIVER_DEEP, fontWeight: 700 },
};
