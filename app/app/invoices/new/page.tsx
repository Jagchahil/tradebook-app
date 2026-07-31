import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// MAKE AN INVOICE. The web door into the same createInvoice path WhatsApp walks.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FORM ENDS WHERE THE SHARE STEP BEGINS. Pressing the button makes and saves the
// invoice, and the NEXT screen is the invoice itself with its link rendered for him to send.
// Nothing on this page or behind it ever contacts his customer: sending is his, in his own
// apps, always. The page says so before the press, not after.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, same reasoning as every screen under app/app. Four
// plain line item rows instead of an "add a row" button, because an add-row button is client
// script and a four line invoice covers the trade jobs this product is for. The WhatsApp flow
// has no ceiling worth speaking of, and it is one message away.
//
// ⚠️ NO AI IS SPENT HERE. The WhatsApp flow needs draftInvoice to read "rewire 450, materials
// 80" out of one breath of chat. A form already has the amounts in boxes. Deterministic in,
// deterministic out, and the route refuses a half typed line rather than guessing at it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'customer':
      return 'It needs a name to be addressed to. Nothing was saved, so have another go.';
    case 'line':
      return 'Every line needs both the work and the price, in numbers. Nothing was saved, so have another go.';
    case 'lines':
      return 'That is more lines than an invoice here can carry. Six is the most.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    default:
      return null;
  }
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('problem'));

  // The diary's "Draft the invoice" press lands here with ?for=<name>: the customer name off his
  // own diary row, read back server side by /api/diary, never trusted from a form. It is a name
  // and not an id, so test/webauth.test.mjs's rule stands, and it only prefills a field he can
  // retype. ⚠️ THE WORK AND THE PRICE ARE NEVER PREFILLED. The diary knows no figures, and an
  // invented amount on an invoice is the one lie this product must never tell.
  const prefillFor = (one('for') ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 120);

  const gate = await gateForUser(user.id);
  const locked = gate === 'readonly';

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/invoices/new" />

      {said ? <p style={S.said}>{said}</p> : null}

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
          <h1 className="lek-title">Make an invoice</h1>
          <p style={S.sub}>
            It comes out numbered and dated, due fourteen days from today, with a link your
            customer can see it and pay it from.
          </p>

          <form action="/api/invoices" method="post">
            <label htmlFor="customer" style={S.label}>Who is it for</label>
            <input id="customer" name="customer" type="text" maxLength={120} required className="lek-field" defaultValue={prefillFor || undefined} />

            <label htmlFor="contact" style={S.label}>Their email or mobile, if you want it kept with the invoice</label>
            <input id="contact" name="contact" type="text" maxLength={160} className="lek-field" />
            {/* The weight of the field, said at the field: this is a note for him, never a send
                target for us. */}
            <p style={S.fieldNote}>Only so you have it to hand. We never contact your customer.</p>

            <fieldset style={S.fieldset}>
              <legend style={S.label}>The work, a line at a time</legend>
              {/* The first line is required, the spare rows are just spare. The route refuses a
                  line with only half its pair filled in, rather than quietly dropping the price
                  a man meant to charge. */}
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={S.lineRow}>
                  <input
                    name="item"
                    type="text"
                    maxLength={200}
                    required={i === 0}
                    aria-label={`Line ${i + 1}, the work`}
                    placeholder={i === 0 ? 'Bathroom rewire' : ''}
                    className="lek-field lek-desc"
                  />
                  <input
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    max="1000000"
                    required={i === 0}
                    aria-label={`Line ${i + 1}, the price in pounds`}
                    placeholder={i === 0 ? '450' : ''}
                    className="lek-field lek-amount"
                  />
                </div>
              ))}
            </fieldset>

            {/* Said before the press. The button makes and saves; nothing leaves the building. */}
            <p style={S.weight}>
              Pressing this makes the invoice and saves it. Nothing goes to your customer: the
              next screen has the link, and sending it is yours to do.
            </p>

            <button type="submit" className="lek-primary">Make the invoice</button>
          </form>
        </section>
      )}

      {/* The footer used to point at the chat flow by name. test/frontdoor.test.mjs is right to
          refuse that: a web customer may have no number bound, and naming a channel he cannot
          use is an instruction he cannot follow. So the footer points at what this surface
          itself will do for him next. */}
      <p style={S.foot}>
        If it goes unpaid, open it from your list once it is late. A reminder in your words is
        written and waiting there, and sending it is still yours.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  // 16px pinned for the same reason as every field in the app: under 16 iOS Safari zooms the
  // page the moment a field is focused.
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%}`,
  `.lek-desc{flex:1 1 auto;min-width:0}`,
  `.lek-amount{flex:0 0 112px;width:112px}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-primary{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '12px 0 6px' },
  fieldNote: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '6px 0 0' },
  fieldset: { border: 'none', margin: 0, padding: 0 },
  lineRow: { display: 'flex', gap: 8, marginBottom: 8 },

  weight: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
