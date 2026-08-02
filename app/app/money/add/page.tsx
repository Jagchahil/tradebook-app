import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { accountHasRental } from '../../../../lib/supabase';
import { bankFeedOffered } from '../../../../lib/bankfeed';
import { CATEGORIES } from '../../../../lib/categories';
import { isMonthKey } from '../../../../lib/moneylog';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import { controlChoice } from '../../../../lib/control';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ADD AN ENTRY. The screen for money the bank never saw.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN EXISTS WHEN THE WHOLE PRODUCT IS BUILT TO REMOVE TYPING.
//
// The bank feed and the WhatsApp capture cover everything that leaves a trace. A cash job does
// not: a customer pays notes into a hand, a bag of fittings is bought at a market stall, and no
// feed on earth ever hears about either. Until this page, a web customer with no WhatsApp bound
// had NO WAY to put a single transaction into his own books. A bookkeeping product a man cannot
// put a cash job into is not keeping his books, it is keeping some of them.
//
// Typing stays the last resort it always was. This screen is for the money that has no other
// door, and it says so rather than advertising itself as the way in.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THE FORM POST IS THE APPROVAL. Nothing here is parsed, guessed or read by a model: every
// field is his own typing, and the press is his own hand. That is why the entry lands confirmed
// where a receipt photo lands waiting: a machine's READING of his money always waits for him,
// his own typed statement of it does not need him to agree with himself.
//
// ⚠️ AND MONEY IN CARRIES ITS WEIGHT ON THE SCREEN. A payment in goes straight into his income
// figures, and the one way rule on /app/money means no button will ever quietly take it out
// again. Understating income is the one direction of error this product must never make easy,
// so the screen says what the press does before he presses it.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT. Same reasoning as every screen under app/app: he is on
// a cheap Android on a bad signal, and a form that cannot submit until JavaScript arrives is a
// form that cannot submit. The browser's own required, min and max attributes do the first pass
// of validation with no script at all, and /api/money/manual repeats every check server side
// because attributes are a courtesy, not a guard.

function notice(done: string | undefined, problem: string | undefined): string | null {
  switch (done) {
    case 'out':
      return 'Logged. It is in your figures.';
    case 'in':
      return 'Logged as money in. It is in your income figures.';
    case 'rent':
      return 'Logged as rent. It is in your property stream, kept separate from your trade.';
  }
  switch (problem) {
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    case 'date':
      return 'That date did not look right. Any day from the last two years up to today works.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    default:
      return null;
  }
}

export default async function AddEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('done'), one('problem'));
  // The month the entry just landed in, so the confirmation can offer the page that proves it.
  // Validated with the same function /app/money validates its own query string with.
  const landedMonth = isMonthKey(one('m')) ? (one('m') as string) : null;

  // Whether the rent choice is drawn at all. lib/supabase.ts owns the question: he said he has
  // rental property (at signup or in setup), or he has already logged confirmed rent. For everyone
  // else the form stays exactly two choices, doc 103's empty test.
  const [gate, rental] = await Promise.all([gateForUser(user.id), accountHasRental(user.id)]);
  const locked = gate === 'readonly';

  // Today and the oldest day the server will accept. The WINDOW is owned by clampReceiptDate in
  // lib/waintents.ts, which /api/money/manual enforces; these two attributes only let the
  // browser say no politely before a post that was always going to be refused.
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const floor = new Date(now);
  floor.setFullYear(floor.getFullYear() - 2);
  const oldest = floor.toISOString().slice(0, 10);

  // lib/control.ts, as a pair. See the block above the first field.
  const choice = controlChoice();

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money/add" />

      {said ? (
        <p style={S.said}>
          {said}
          {one('done') && landedMonth ? (
            <>
              {' '}
              <a href={`/app/money?m=${landedMonth}`} style={S.saidLink}>See the month.</a>
            </>
          ) : null}
        </p>
      ) : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-title">Add an entry</h1>
          <p style={S.sub}>
            Cash never reaches your bank, so it never reaches me. Put it down here and it is in
            your books like everything else.
          </p>

          {/* 🔴 WHICH WAY EACH KIND OF MONEY CUTS, SAID TO HIM RATHER THAN TO THE NEXT DEVELOPER.
              The header of this file has asserted since it was written that understating income is
              "the one direction of error this product must never make easy". That sentence was
              addressed to whoever opened the source next. HE never read it, and he is the one
              deciding what to type. lib/control.ts owns the words; the title and the bank
              connection framing stay on the upload screen, because they are about a choice he made
              before he got here. ⚠️ The two sentences arrive as a pair from controlChoice() and
              cannot be split: "what you claim is yours to decide", alone, is a different product. */}
          <p style={S.control}>{choice.costs}</p>
          <p style={S.control}>{choice.income}</p>

          <form action="/api/money/manual" method="post">
            <fieldset style={S.fieldset}>
              <legend style={S.label}>Which way did it go</legend>
              <label style={S.radioRow}>
                <input type="radio" name="direction" value="out" defaultChecked style={S.radio} />
                <span>
                  <span style={S.radioTop}>Money out</span>
                  <span style={S.radioHint}>You paid for something.</span>
                </span>
              </label>
              <label style={S.radioRow}>
                <input type="radio" name="direction" value="in" style={S.radio} />
                <span>
                  <span style={S.radioTop}>Money in</span>
                  <span style={S.radioHint}>You got paid.</span>
                </span>
              </label>
              {/* THE RENT DOOR. Drawn only for an account with a rental stream, because for anyone
                  else it is a choice with no sensible answer. Rent must be distinguishable from
                  trade income AT ENTRY: HMRC taxes the two streams differently (no National
                  Insurance on rent, Section 24 on the mortgage interest), and a rent receipt filed
                  as trade income overstates his Class 4 bill. Nothing existing is ever reclassified
                  by this: the choice only shapes the row he is creating right now. */}
              {rental ? (
                <label style={S.radioRow}>
                  <input type="radio" name="direction" value="rent" style={S.radio} />
                  <span>
                    <span style={S.radioTop}>Rent in, from a property</span>
                    <span style={S.radioHint}>
                      Money in from your rental property. Kept in its own stream and taxed its own
                      way, never mixed with your trade.
                    </span>
                  </span>
                </label>
              ) : null}
            </fieldset>

            <label htmlFor="amount" style={S.label}>How much, in pounds</label>
            <input
              id="amount"
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              max="1000000"
              required
              className="lek-field"
            />

            <label htmlFor="who" style={S.label}>Who. The shop, or whoever paid you</label>
            <input id="who" name="vendor" type="text" maxLength={120} required className="lek-field" />

            <label htmlFor="when" style={S.label}>When</label>
            <input
              id="when"
              name="date"
              type="date"
              defaultValue={today}
              min={oldest}
              max={today}
              required
              className="lek-field"
            />

            {/* ONE list, from lib/categories.ts, exactly as the pile renders it. A second list here
                is the drift that broke the undo once already, so there is no second list. Money in
                ignores this on the server: income is income, and asking him to categorise it would
                be a question with one sensible answer. */}
            <label htmlFor="cat" style={S.label}>What it was, if it went out</label>
            <select id="cat" name="category" defaultValue="" className="lek-field">
              <option value="">Nothing fits. File it as other</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Said before the press, not after. The one way rule on /app/money means money in
                cannot be struck out with one tap later, on purpose, so he hears the weight of the
                button from the button. */}
            <p style={S.weight}>
              Money in goes straight into your income figures, and nothing takes it out again
              quietly. That is on purpose. Your tax is worked out from what lands here.
            </p>

            <button type="submit" className="lek-primary">Put it in my books</button>
          </form>
        </section>
      )}

      {/* The bank sentence returns with bankFeedOffered(). */}
      <p style={S.foot}>
        {bankFeedOffered()
          ? 'Anything that went through your bank arrives on its own once your bank is connected. This page is for the money that never did.'
          : 'Anything that went through your bank can come in from a statement upload. This page is for the money that never did.'}
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  // 16px is pinned, not a stray off the type scale: under 16 iOS Safari zooms the whole page the
  // moment a field is focused, and he never asked to be zoomed. Same rule as the pile's select.
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL}}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-field{max-width:420px}
    .lek-primary{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },
  saidLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' },
  // Quieter than the lead and darker than the muted sub: it is a fact about how his figures work,
  // not an instruction and not an aside he can skip.
  control: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, margin: '10px 0 0' },

  fieldset: { border: 'none', margin: 0, padding: 0 },
  radioRow: { display: 'flex', gap: 10, alignItems: 'flex-start', background: SURFACE, borderRadius: RADIUS.md, padding: '11px 12px', marginBottom: 8, cursor: 'pointer' },
  radio: { marginTop: 3 },
  radioTop: { display: 'block', fontSize: TYPE.body, fontWeight: 800 },
  radioHint: { display: 'block', fontSize: TYPE.note, color: MUTED, marginTop: 1 },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '12px 0 6px' },
  weight: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
