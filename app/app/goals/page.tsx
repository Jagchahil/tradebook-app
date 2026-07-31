import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { listGoals } from '../../../lib/supabase';
import { normaliseGoalRow, splitGoals, capitalNote, targetPhrase } from '../../../lib/goals';
import { gbp0 } from '../../../lib/money';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, INK, LINE, MOTION, MUTED, ON_RIVER, PANEL, PAPER, RADIUS,
  RIVER, RIVER_DEEP, RIVER_TINT, SPACE, SURFACE, TYPE,
} from '../../../lib/tokens';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HIS GOALS. What he is saving for, written down, so the planning can reason about it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE ONE TAX SENTENCE ON THIS PAGE COMES FROM lib/goals.ts AND IS DETERMINISTIC. A van or
// tools goal with a figure he typed earns the honest statement of published rule: capital items
// can come off profit through capital allowances, and buying before the year end brings the
// relief into this year's bill. No figures are computed here and none are invented: what the
// relief is worth against his own numbers is lib/taxoptimiser.ts's job, so the card points at
// /app/tax/ways-to-save rather than doing sums of its own. Two calculators that could disagree
// about one relief is the house disease.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, ids in form bodies only, and a failed read said
// plainly, all exactly as /app/diary. The two pages are the same shape on purpose.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    case 'missing':
      return 'We could not find that goal. If it is still in the list, load the page again.';
    default:
      return null;
  }
}

function saidDone(code: string | undefined): string | null {
  switch (code) {
    case 'added':
      return 'Written down.';
    case 'done':
      return 'Marked done. Good going.';
    case 'removed':
      return 'Removed.';
    default:
      return null;
  }
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = saidDone(one('done')) ?? notice(one('problem'));
  const locked = one('locked') === '1';

  const raw = await listGoals(user.id);
  const read = raw !== null;
  const goals = read ? raw.map(normaliseGoalRow).filter((g): g is NonNullable<typeof g> => g !== null) : [];
  const { open, done } = splitGoals(goals);
  const capital = capitalNote(goals);

  // The quiet line under a goal: his figure if he gave one, his date if he gave one, nothing
  // invented in either gap.
  const quietLine = (g: (typeof goals)[number]): string | null => {
    const parts: string[] = [];
    if (g.amountPence !== null) parts.push(gbp0(g.amountPence / 100));
    const by = targetPhrase(g.targetDate);
    if (by) parts.push(by);
    return parts.length ? parts.join(', ') : null;
  };

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/goals" />

      {said ? <p style={S.said}>{said}</p> : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : null}

      {!read ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read your goals just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : (
        <>
          {open.length > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">What you are saving for</h2>
              <ul style={S.list}>
                {open.map((g) => (
                  <li key={g.id} style={S.row}>
                    <div style={S.rowMain}>
                      <span style={S.title}>{g.label}</span>
                      {quietLine(g) ? <span style={S.note}>{quietLine(g)}</span> : null}
                    </div>
                    <div style={S.acts}>
                      <form action="/api/goals" method="post">
                        <input type="hidden" name="action" value="done" />
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="lek-act">Done</button>
                      </form>
                      <form action="/api/goals" method="post">
                        <input type="hidden" name="action" value="remove" />
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="lek-act">Remove</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Only when a goal earns it. A tax paragraph under a pension goal it does not apply
              to would be a row that says nothing, which is the empty test failed with words. */}
          {capital ? (
            <section style={S.capital}>
              <p style={S.capitalBody}>{capital}</p>
              <a href="/app/tax/ways-to-save" style={S.capitalLink}>
                Ways to save works it against your own figures
              </a>
            </section>
          ) : null}

          {goals.length === 0 ? (
            <section className="lek-card">
              <p style={S.empty}>No goals written down yet.</p>
              <p style={S.quiet}>
                Write one down below. A van or tools with a figure on it changes what the tax
                planning can find you, and the rest keeps what you are working towards in one place.
              </p>
            </section>
          ) : null}

          <section className="lek-card">
            <h2 className="lek-h2">Write one down</h2>
            <form action="/api/goals" method="post">
              <input type="hidden" name="action" value="add" />

              <label htmlFor="kind" style={S.label}>What is it for</label>
              <select id="kind" name="kind" className="lek-field" defaultValue="van">
                <option value="van">A van</option>
                <option value="tools">Tools</option>
                <option value="pension">Pension</option>
                <option value="income">Income</option>
                <option value="other">Something else</option>
              </select>

              <label htmlFor="label" style={S.label}>Call it</label>
              <input id="label" name="label" type="text" maxLength={120} required className="lek-field" placeholder="New Transit" />

              <label htmlFor="amount" style={S.label}>How much, if you know</label>
              <input
                id="amount" name="amount" type="number" inputMode="decimal" step="0.01" min="0.01"
                max="1000000" className="lek-field" placeholder="24000"
              />
              {/* Said at the field: the figure is his or it is nothing. */}
              <p style={S.fieldNote}>In pounds. Leave it empty if you have not priced it yet, we never fill a figure in for you.</p>

              <label htmlFor="target" style={S.label}>By when, if there is a date on it</label>
              <input id="target" name="target" type="date" className="lek-field" />

              <button type="submit" className="lek-primary">Write it down</button>
            </form>
          </section>

          {done.length > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Done</h2>
              <ul style={S.list}>
                {done.map((g) => (
                  <li key={g.id} style={S.row}>
                    <div style={S.rowMain}>
                      <span style={S.titleDone}>{g.label}</span>
                    </div>
                    <div style={S.acts}>
                      <form action="/api/goals" method="post">
                        <input type="hidden" name="action" value="remove" />
                        <input type="hidden" name="id" value={g.id} />
                        <button type="submit" className="lek-act">Remove</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p style={S.foot}>
        A goal here changes nothing on its own and spends nothing. It tells the planning what you
        are working towards, and anything worth money finds its way to you.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  // 16px pinned on every field: under 16 iOS Safari zooms the page the moment one is focused.
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%}`,
  `.lek-primary{width:100%;margin-top:${SPACE.md}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-act{padding:7px 12px;font-size:${TYPE.note}px;font-weight:700;font-family:${FONT};color:${INK};background:${SURFACE};border:1px solid ${LINE};border-radius:${RADIUS.pill}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `@media(min-width:${BREAK.desk}px){.lek-primary{width:auto;min-width:264px}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  empty: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, padding: `${SPACE.sm}px 0`, borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  title: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em' },
  titleDone: { fontSize: TYPE.body, fontWeight: 700, color: MUTED },
  note: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, fontVariantNumeric: 'tabular-nums' },
  acts: { display: 'flex', gap: SPACE.xs, alignItems: 'center', flexWrap: 'wrap' },

  capital: { display: 'block', background: RIVER_TINT, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: SPACE.sm },
  capitalBody: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '68ch' },
  capitalLink: { display: 'inline-block', marginTop: SPACE.xs, fontSize: TYPE.body, fontWeight: 700, color: RIVER_DEEP },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '12px 0 6px' },
  fieldNote: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '6px 0 0' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
