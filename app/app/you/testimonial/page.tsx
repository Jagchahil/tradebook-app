import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import {
  readOwnTestimonial, readIdentityCard, testimonialByline, TESTIMONIAL_ANON,
} from '../../../../lib/supabase';
import { AppNav } from '../../AppNav';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN_TINT, INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, SURFACE,
  edge,
} from '../../../../lib/apptheme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HIS WORDS, HIS TO WRITE AND HIS TO TAKE BACK. 9 August 2026.
//
// Testimonials could only be typed in by somebody at Lekhio, into a table with no identity column
// at all: only created_by, the TEAM MEMBER who entered it. A customer's name and his words went on
// the PUBLIC HOMEPAGE and there was no request he could make that would take them down, because
// nothing left in the database remembered they were his. The GDPR erasure walked past them.
//
// The proposal on the table was a "customer email" box on the team console. Jag's answer was
// better: let him write it himself. The user id is then on the row BY CONSTRUCTION rather than
// because a team member remembered to paste an address, consent is given by the person in his own
// words at a moment he chose (which is what CAP 3.47 and the DMCC Act 2024 want from a
// testimonial), and withdrawal is a button on this page rather than a support request (which is
// what Article 7(3) wants from consent: as easy to withdraw as to give).
//
// ⚠️ IT IS NOT LIVE WHEN HE PRESSES SAVE, AND THIS PAGE SAYS SO BEFORE HE TYPES. Anything else is
// a text box on the front page of lekhio.app that anyone who can open an account can type into.
//
// ⚠️ IT LIVES HERE AND NOT IN /app/you/settings. That page's own header says why: every switch on
// it is a promise that a message exists behind it, and it holds the line at two rows. This is not
// a switch, it is something only he can say, which is the same shelf as his circumstances and his
// allowances.
//
// ⚠️ A FAILED READ DRAWS NO FORM. Showing him an empty box over a testimonial we could not read
// would invite him to write a second one and quietly replace the first. Same for a failed read of
// his own details, because every by-line this page can offer is built out of them.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HE DOES NOT TYPE HIS NAME OR HIS TRADE. WE ALREADY HOLD BOTH, AND HE TICKS.
//
// Two reasons and the second one is the one that matters. First, a product whose whole promise is
// that it holds his details should not open by asking him to retype them. Second, a name that
// arrives in a request body is a name he CHOSE rather than a name he HAS, and a form that posts a
// name lets any account publish a quote signed as somebody else. So the form sends two booleans
// and lib/supabase decides what they mean off his own users row.
//
// 🔴 BOTH SWITCHES START OFF, AND THAT IS NOT A UX PREFERENCE.
//
// Putting a man's name on the public web is processing personal data on the basis of consent, and
// consent has to be a positive act. A pre-ticked box is expressly NOT consent: Recital 32, and the
// CJEU said it in terms in Planet49 (C-673/17). Ticked by us and shipped is a consent we would
// have to defend as freely given, and we could not. So he arrives at "Lekhio user" and the switch
// is his to throw. An account that ALREADY has a review is different: those two positions are what
// HE chose last time, and reading them back is not us pre-ticking anything.
//
// ⚠️ THE PREVIEW IS CSS AND CARRIES NO JAVASCRIPT. Every write surface in this app is a plain
// form; a sibling selector off :checked does the swap. Both strings in it are rendered on the
// server by testimonialByline, the SAME function the writer uses, so the preview cannot promise a
// by-line the row will not carry. That mattered enough to be a shared function rather than two
// tidy copies of one rule.
//
// ⚠️ AND A SWITCH WE CANNOT HONOUR IS DISABLED RATHER THAN DRAWN. If we hold no trade for him,
// ticking "show my trade" would do nothing at all, and a control that does nothing is worse than
// no control: he thinks he asked and we ignored him. It says what is missing and where to add it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const PROBLEMS: Record<string, string> = {
  noquote: 'Add what you want to say, and it is yours again.',
  toolong: 'That is longer than we can put on a page. Shorten it a little and it will save.',
  rating: 'Pick a star rating from one to five.',
  style: 'One of the dashes in that will not render properly on our pages. Take it out and it will save.',
  slow: 'That was a few too many in a row. Give it a minute.',
  bad: 'That did not come through. Try it again.',
  unavailable: 'We could not save that just now, and nothing has changed. Give it a moment and try again.',
};

export default async function TestimonialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Ftestimonial');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const problem = one('problem') ? PROBLEMS[one('problem') as string] ?? PROBLEMS.bad : null;
  const saved = one('saved') === '1';
  const removed = one('removed') === '1';

  const [mine, card] = await Promise.all([
    readOwnTestimonial(user.id),
    readIdentityCard(user.id).catch(() => null),
  ]);
  const unreadable = mine === 'unreadable';
  const existing = unreadable ? null : mine;

  // The two by-lines, both built by the writer's own function so the preview cannot drift from the
  // row. `on` is what each switch produces when it is thrown; `off` is the anonymous position.
  const on = testimonialByline(card, true, true);
  const haveName = on.name !== TESTIMONIAL_ANON;
  const haveTrade = on.trade !== '';

  // What HE chose last time, read back off the row rather than defaulted by us. See the header.
  //
  // ⚠️ AND A SWITCH WE CANNOT HONOUR IS DRAWN OFF AS WELL AS DISABLED. A disabled checkbox does not
  // submit even when it is ticked, so a ticked-and-disabled one would show him a position the save
  // would not carry. That is the case where he had a name, used it, then cleared it from his
  // details: the old row still says his name, and we no longer hold it.
  const nameWasOn = haveName && existing !== null && existing.name !== TESTIMONIAL_ANON;
  const tradeWasOn = haveTrade && existing !== null && (existing.trade ?? '').trim() !== '';

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you" />

      <section className="lek-card">
        <h1 className="lek-eyebrow">Your review</h1>
        <p style={S.blurb}>
          If Lekhio has been worth having, say so in your own words and we may put it on our site.
          {' '}<strong>Nothing you write here goes anywhere until we publish it</strong>, and you can
          take it down again from this page whenever you like, published or not.
        </p>

        {problem ? <p style={S.warn}>{problem}</p> : null}
        {saved ? <p style={S.good}>Saved. Thank you. We will have a look at it.</p> : null}
        {removed ? <p style={S.good}>Taken down. It is gone from our records.</p> : null}

        {unreadable ? (
          <p style={S.warn}>
            We could not read your review just this minute, so the form is not here: showing you an
            empty box over something you have already written would invite you to replace it by
            accident. Nothing has changed. Give it a moment and load the page again.
          </p>
        ) : card === null ? (
          <p style={S.warn}>
            We could not read your details just this minute, and the name on a review is built out
            of them, so the form is not here rather than here and guessing. Nothing has changed.
            Give it a moment and load the page again.
          </p>
        ) : (
          <>
            {existing ? (
              <div style={S.current}>
                <p style={S.quote}>{existing.quote}</p>
                <p style={S.who}>
                  {existing.name}{(existing.trade ?? '').trim() ? `, ${existing.trade}` : ''}
                  {' '}{'·'} {existing.rating} of 5
                </p>
                <p style={S.state}>
                  {existing.published
                    ? 'This is live on our site.'
                    : 'This is with us and is not on our site yet.'}
                </p>
                {/* His to take back, and not gated on anything he pays for. See the header on
                    /api/testimonial: a lapsed subscription must not hold a man's name on a
                    marketing page. */}
                <form action="/api/testimonial" method="post" style={S.rowForm}>
                  <input type="hidden" name="intent" value="remove" />
                  <button type="submit" style={S.remove}>Take it down</button>
                </form>
              </div>
            ) : null}

            {/* ⚠️ THE TWO CHECKBOXES ARE DIRECT CHILDREN OF THE FORM AND SIT BEFORE THE PREVIEW.
                That is what makes the CSS sibling selector reach it. Moving either inside its own
                label breaks the preview silently, so the ratchet pins the shape. */}
            <form action="/api/testimonial" method="post" style={S.form}>
              <label htmlFor="quote" style={S.label}>
                {existing ? 'Write a new one, and it replaces the one above' : 'What would you say?'}
              </label>
              <textarea
                id="quote"
                name="quote"
                rows={4}
                maxLength={280}
                required
                defaultValue=""
                placeholder="It does my books off a photo of a receipt. I have not opened a spreadsheet since March."
                className="lek-field"
              />

              <p style={S.sub}>What goes under it</p>

              <input
                type="checkbox"
                id="showname"
                name="showname"
                value="1"
                defaultChecked={nameWasOn}
                disabled={!haveName}
                className="lek-sw"
              />
              <label htmlFor="showname" style={S.toggle} className="lek-hit">
                <span style={S.toggleText}>
                  <span style={S.toggleTitle}>Use my name</span>
                  <span style={S.toggleNote}>
                    {haveName
                      ? `We have you as ${on.name}. Off, it reads ${TESTIMONIAL_ANON}.`
                      : `We do not hold a name for you, so this would change nothing. Add one under Your details and it will be here.`}
                  </span>
                </span>
                <span style={S.track} className="lek-track"><span style={S.knob} className="lek-knob" /></span>
              </label>

              <input
                type="checkbox"
                id="showtrade"
                name="showtrade"
                value="1"
                defaultChecked={tradeWasOn}
                disabled={!haveTrade}
                className="lek-sw"
              />
              <label htmlFor="showtrade" style={S.toggle} className="lek-hit">
                <span style={S.toggleText}>
                  <span style={S.toggleTitle}>Say what I do</span>
                  <span style={S.toggleNote}>
                    {haveTrade
                      ? `We have you as ${on.trade}. Off, nothing appears in its place.`
                      : 'We do not hold a trade for you, so this would change nothing. Add one under Your details and it will be here.'}
                  </span>
                </span>
                <span style={S.track} className="lek-track"><span style={S.knob} className="lek-knob" /></span>
              </label>

              {/* The by-line, exactly as it would print. Both strings come off the server. */}
              <div style={S.preview} className="lek-prev">
                <span style={S.previewLabel}>It would go out as</span>
                <span style={S.previewLine}>
                  <b className="lek-anon">{TESTIMONIAL_ANON}</b>
                  <b className="lek-name">{on.name}</b>
                  <span className="lek-trade" style={S.previewTrade}>{on.trade}</span>
                </span>
              </div>

              <select
                name="rating"
                defaultValue={String(existing?.rating ?? 5)}
                aria-label="Stars out of five"
                className="lek-pick"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} of 5</option>
                ))}
              </select>

              <button type="submit" style={S.save}>{existing ? 'Replace it' : 'Send it to us'}</button>
            </form>
          </>
        )}
      </section>

      <p style={S.foot}>
        We only ever publish what a real customer actually said, and only what they asked us to put
        under it, because anything else is against the rules and worth nothing to the next person
        reading it.
      </p>
    </main>
  );
}

// ⚠️ THE PREVIEW SWAP AND THE SWITCH ARE ONE BLOCK OF CSS AND NO SCRIPT.
// .lek-name and .lek-trade are hidden until their box is ticked; .lek-anon is shown until the name
// box is. The general sibling combinator only reaches forward, which is why both inputs are
// rendered above the preview in the markup.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  // The checkbox itself is off screen rather than display:none, so it keeps its place in the tab
  // order and a screen reader still announces it. Its label is the visible control.
  `.lek-sw{position:absolute;opacity:0;width:1px;height:1px;margin:0}`,
  `.lek-sw:focus-visible + label .lek-track{outline:2px solid ${RIVER};outline-offset:2px}`,
  `.lek-sw:checked + label .lek-track{background:${RIVER};border-color:${RIVER}}`,
  `.lek-sw:checked + label .lek-knob{transform:translateX(18px)}`,
  `.lek-sw:disabled + label{opacity:0.55;cursor:default}`,
  `.lek-name,.lek-trade{display:none}`,
  `#showname:checked ~ .lek-prev .lek-anon{display:none}`,
  `#showname:checked ~ .lek-prev .lek-name{display:inline}`,
  `#showtrade:checked ~ .lek-prev .lek-trade{display:inline}`,
  // ⚠️ 16px IS PINNED RATHER THAN TAKEN OFF THE TYPE SCALE, exactly as /app/you/vat pins it. Under
  // 16 iOS Safari zooms the whole page the moment a field takes focus, and a man writing us a
  // review on a phone would watch the screen jump under his thumb. TYPE.body is 15.
  `.lek-field{width:100%;box-sizing:border-box;font-size:16px;font-family:${FONT};line-height:1.5;color:${INK};background:${PANEL};border:1.5px solid ${LINE};border-radius:${RADIUS.sm}px;padding:11px 12px}`,
  `.lek-pick{font-size:16px;font-family:${FONT};color:${INK};background:${PANEL};border:1.5px solid ${LINE};border-radius:${RADIUS.sm}px;padding:11px 12px;align-self:flex-start}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  blurb: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },
  good: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },

  current: { background: SURFACE, borderRadius: RADIUS.md, padding: '14px 14px', margin: `0 0 ${SPACE.md}px` },
  quote: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '0 0 8px', maxWidth: '52ch' },
  who: { fontSize: TYPE.note, fontWeight: 700, color: INK, margin: '0 0 4px' },
  state: { fontSize: TYPE.label, fontWeight: 800, color: MUTED, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' },

  form: { display: 'flex', flexDirection: 'column', gap: SPACE.sm, margin: 0, position: 'relative' },
  label: { fontSize: TYPE.note, fontWeight: 700, color: INK },
  sub: { fontSize: TYPE.label, fontWeight: 800, color: MUTED, margin: `${SPACE.xs}px 0 0`, textTransform: 'uppercase', letterSpacing: '0.05em' },
  toggle: { display: 'flex', alignItems: 'center', gap: SPACE.sm, background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', cursor: 'pointer' },
  toggleText: { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 },
  toggleTitle: { fontSize: TYPE.body, fontWeight: 700, color: INK },
  toggleNote: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, maxWidth: '48ch' },
  track: { flex: '0 0 auto', width: 38, height: 22, borderRadius: 999, background: SURFACE, border: `1.5px solid ${LINE}`, display: 'inline-flex', alignItems: 'center', padding: 1, boxSizing: 'border-box' },
  // ⚠️ NO RAW rgba HERE, AND THE BORDER DOES THE JOB A SHADOW WOULD. A shadow is invisible on a
  // dark panel, which is the rule test/phonewidth.test.mjs holds every screen to: dark has to
  // invert by construction, so nothing may carry a colour the theme cannot repoint.
  knob: { width: 16, height: 16, borderRadius: 999, background: PAPER, border: `1px solid ${LINE}`, boxSizing: 'border-box', transition: 'transform .12s ease' },

  preview: { background: SURFACE, borderRadius: RADIUS.sm, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 3 },
  previewLabel: { fontSize: TYPE.label, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' },
  previewLine: { fontSize: TYPE.body, color: INK },
  previewTrade: { color: MUTED, marginLeft: 6 },

  input: { alignSelf: 'flex-start', fontFamily: FONT, fontSize: TYPE.body, color: INK, background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', boxSizing: 'border-box' },
  save: { alignSelf: 'flex-start', background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '12px 18px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  rowForm: { margin: 0 },
  remove: { background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '10px 15px', fontSize: TYPE.note, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
