import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import { readVatProfile } from '../../../../lib/supabase';
import { rateLabel, reverseChargeApplies, type VatRateKey } from '../../../../lib/vat';
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
//
// ⚠️ AND MOST MEN NEVER SEE A WORD ABOUT VAT ON IT (1 August 2026). Doc 103's standing question,
// asked before a single control went on: what did we take out to make room for it? Nothing, and
// nothing had to be, because for a man who is not VAT registered this form is EXACTLY what it was
// yesterday. No rate boxes, no questions about his customer, not a word. He cannot charge VAT and
// the answer is decided rather than asked. Only a VAT registered man gets the rate picker, and
// only a VAT registered CIS subcontractor gets the three reverse charge questions, because he is
// the one man in this product whose commonest invoice carries no VAT at all and has to say so.
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
    case 'vat':
      return 'We could not check your VAT position, so nothing was made. An invoice with the wrong VAT on it is worse than one you have to make twice. Try it again in a minute.';
    case 'vatasked':
      return 'That was missing the three answers about your customer, so nothing was made. They decide whether you charge VAT on this job at all, so the form below asks them again.';
    default:
      return null;
  }
}

// The four rates a man on this form can put on a line. 'outside the scope' is real and is not one
// of them: it is a judgement about whether a supply is in the VAT system at all, and it belongs in
// a conversation, not in a box on a job sheet.
const RATES: readonly VatRateKey[] = ['standard', 'reduced', 'zero', 'exempt'];

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

  // 🔴 NULL IS A FAILED READ, NOT "HE IS NOT REGISTERED". A form drawn on that guess would take a
  // VAT registered man's work and post it with no rate on any line, and the route would be right
  // to refuse it. So the form is not drawn at all and the page says why.
  const vatProfile = locked ? null : await readVatProfile(user.id);
  const vatUnknown = !locked && vatProfile === null;
  const registered = Boolean(vatProfile?.registered);
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 EVERY VAT REGISTERED TRADER IS ASKED. This read `registered && cisSubcontractor`, and that
  // flag is `not null default false`, set by one radio on /app/you/vat that nothing pointed him
  // at. So the commonest customer this product has never saw these questions and silently charged
  // 20% on the one invoice that must carry none. Proven live on 2 August with a control: same
  // customer, same work, same day, £3,013.50 against £3,616.20.
  //
  // The flag is now what it should always have been: the DEFAULT on the first question, so a man
  // who has told us he works under CIS is not answering the same thing every week.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const asksReverseCharge = registered;
  const cisByDefault = Boolean(vatProfile?.cisSubcontractor);
  // What the form put to him, sent with it. The route works out what it should have been and
  // refuses the mismatch rather than making an invoice out of questions nobody answered.
  const vatFormShape = registered ? (asksReverseCharge ? 'rc' : 'rates') : 'none';

  // The outcome, in lib/vat.ts's own words rather than a second copy of the rule written here. A
  // live verdict would need script and this page has none, so the rule is stated plainly instead,
  // for the answers that actually turn it on.
  const rcVerdict = reverseChargeApplies({
    supplierRegistered: true,
    withinCis: true,
    customerVatRegistered: true,
    customerCisRegistered: true,
    customerIsEndUser: false,
    rateKey: 'standard',
  });

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
      ) : vatUnknown ? (
        <section className="lek-card">
          <h1 className="lek-title">Make an invoice</h1>
          <p style={S.sub}>
            We could not check your VAT position just now, so the form is not here. Whether this
            invoice carries VAT, and how much, depends on it, and a document your customer pays
            from is the last place to guess. Give it a minute and open this page again.
          </p>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-title">Make an invoice</h1>
          {/* The pay wording returns with payouts. See hasInvoicePayoutRoute in lib/stripe.ts. */}
          <p style={S.sub}>
            It comes out numbered and dated, due fourteen days from today, with a link your
            customer can open and see.
          </p>

          <form action="/api/invoices" method="post">
            {/* What this form actually asked him. Not a decision, a statement of fact about the
                screen he filled in, so the route can refuse a form that predates his own VAT
                details rather than reading its silence as three noes. */}
            <input type="hidden" name="vatform" value={vatFormShape} />

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
                <div key={i} style={registered ? S.lineRowVat : S.lineRow}>
                  <input
                    name="item"
                    type="text"
                    maxLength={200}
                    required={i === 0}
                    aria-label={`Line ${i + 1}, the work`}
                    placeholder={i === 0 ? 'Bathroom rewire' : ''}
                    className={registered ? 'lek-field lek-descvat' : 'lek-field lek-desc'}
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
                  {/* A plain server rendered select, one per line, and nothing recalculates as he
                      touches it. The figures are worked out once, by lib/vat.ts, on the far side
                      of the press. The labels come from rateLabel so they cannot drift from the
                      rates the arithmetic actually uses. */}
                  {registered ? (
                    <select
                      name="rate"
                      defaultValue="standard"
                      aria-label={`Line ${i + 1}, the VAT rate`}
                      className="lek-field lek-rate"
                    >
                      {RATES.map((key) => (
                        <option key={key} value={key}>{rateLabel(key)}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ))}
              {registered ? (
                <p style={S.fieldNote}>
                  The VAT rate sits on each line. It is 20% unless you know that bit of work is
                  something else.
                </p>
              ) : null}
            </fieldset>

            {/* ⚠️ THREE QUESTIONS, AND ONLY FOR THE MAN THEY BELONG TO. This is the CIS domestic
                reverse charge, VATA 1994 s55A, and it decides whether he charges VAT on this job
                at all. Nothing we can see tells us: the end user answer in particular has to come
                from the customer in writing. So it is asked, in the words he would use, and it is
                asked of nobody else. */}
            {asksReverseCharge ? (
              <fieldset style={S.fieldset}>
                <legend style={S.label}>About your customer</legend>
                <p style={S.fieldNote}>
                  On construction work for a contractor you often charge no VAT at all. He pays it
                  to HMRC himself. These answers decide it, and the man who gave you the job
                  will know them.
                </p>
                {/* ⚠️ ASKED ABOUT THE JOB, NOT ABOUT HIM, and it used to be neither: withinCis was
                    hardcoded true in the route. A sparky who wires a house one week and hires out
                    a cherry picker the next has one job inside the scheme and one outside it. */}
                <fieldset style={S.ask}>
                  <legend style={S.askQ}>Is this job construction work reported under CIS?</legend>
                  <span style={S.askWhy}>
                    Building, plumbing, sparks, groundwork and the rest of it, done for a
                    contractor rather than for a householder. Say no for anything else, including
                    plant you hired out without an operator.
                  </span>
                  <span style={S.askRow}>
                    <label style={S.pick}>
                      <input type="radio" name="within_cis" value="yes" defaultChecked={cisByDefault} required /> Yes
                    </label>
                    <label style={S.pick}>
                      <input type="radio" name="within_cis" value="no" defaultChecked={!cisByDefault} required /> No
                    </label>
                  </span>
                </fieldset>
                <p style={S.fieldNote}>
                  If it is, these three decide the rest. If it is not, you charge VAT the normal
                  way and they are ignored.
                </p>
                <p style={S.fieldNote}>
                  Yes, yes and no is the reverse charge. {rcVerdict.because} Any other set of
                  answers and you charge VAT the normal way.
                </p>

                {[
                  {
                    name: 'customer_vat',
                    q: 'Is your customer VAT registered?',
                    why: 'A business with its own VAT number, one that puts VAT on the invoices it sends out. A householder is not.',
                  },
                  {
                    name: 'customer_cis',
                    q: 'Is he registered for CIS?',
                    why: 'The Construction Industry Scheme. A main contractor who takes tax off the subcontractors he pays is registered for it.',
                  },
                  {
                    name: 'end_user',
                    q: 'Has he told you in writing that he is the end user?',
                    why: 'The end user is having the work done for himself rather than selling it on as part of his own building job. It only counts if he has put it in writing.',
                  },
                ].map((ask) => (
                  // Its own fieldset and legend, which is what a pair of radios is: a screen
                  // reader then reads the question before it reads Yes and No, rather than two
                  // loose words in the middle of a form about invoices.
                  <fieldset key={ask.name} style={S.ask}>
                    <legend style={S.askQ}>{ask.q}</legend>
                    <span style={S.askWhy}>{ask.why}</span>
                    <span style={S.askRow}>
                      <label style={S.pick}>
                        {/* ⚠️ NOT `required`. The route demands these ONLY when the job is within
                            CIS, because outside it they decide nothing. Marking them required here
                            would block a VAT registered trader from invoicing ordinary work. */}
                        <input type="radio" name={ask.name} value="yes" /> Yes
                      </label>
                      <label style={S.pick}>
                        <input type="radio" name={ask.name} value="no" /> No
                      </label>
                    </span>
                  </fieldset>
                ))}
              </fieldset>
            ) : null}

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
  // With a rate on the row the work takes a line of its own, so the price and the rate sit side
  // by side underneath it and nothing is squeezed to nothing on a phone held in one hand.
  `.lek-descvat{flex:1 1 100%;min-width:0}`,
  `.lek-amount{flex:0 0 112px;width:112px}`,
  `.lek-rate{flex:0 0 128px;width:128px;appearance:none;-webkit-appearance:none}`,
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
  lineRowVat: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },

  ask: { border: 'none', margin: '14px 0 0', padding: 0 },
  askQ: { display: 'block', fontSize: TYPE.body, fontWeight: 700, color: INK, padding: 0 },
  askWhy: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '4px 0 8px' },
  askRow: { display: 'flex', gap: 10 },
  pick: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: TYPE.body, fontWeight: 700, color: INK, background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 16px', cursor: 'pointer' },

  weight: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
