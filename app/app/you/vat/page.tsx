import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readVatProfile, readCircumstances, type VatProfileRow } from '../../../../lib/supabase';
import { formatVrn, reg111Window } from '../../../../lib/vat';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
  edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HIS VAT, AND THE ONE DATE THE PRODUCT KEPT ASKING FOR AND THROWING AWAY.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SCREEN EXISTS. lib/circumstances.ts asked "Are you VAT registered, and when did you
// register?" and stored 'yes'. The date went nowhere, while the promise underneath it offered him
// the VAT back on kit he already owned "going back four years". That is Reg 111 of the VAT
// Regulations 1995, measured from the registration date and from nothing else, so the product was
// promising a calculation whose only input it discarded. The question is now one question about
// one fact, and the date, the number and the scheme are asked here.
//
// ⚠️ ONE QUESTION UNTIL HE IS REGISTERED, AND NOT ONE FIELD MORE. Doc 103's empty test: a man who
// is not VAT registered has no scheme, no number and no reverse charge, and a screen of boxes
// about them teaches him that our questions are not worth reading. He says yes, and then we ask.
//
// ⚠️ AND EACH ANSWER OPENS THE NEXT, WITH NO SCRIPT TO DO IT. The flat rate percentage is drawn
// only for a man whose STORED scheme is the flat rate scheme, because the page is redrawn by the
// server after every save. That is the whole of the conditional logic on this screen and it costs
// a page load, which is the honest trade on a cheap Android on a bad signal.
//
// 🔴 NOTHING HERE FILES A VAT RETURN AND NOTHING HERE MAY SAY IT DOES. lib/hmrc.ts asks for
// 'read:self-assessment write:self-assessment' and has no VAT scope at all. We hold what he tells
// us and we work out what it means. His return still goes to HMRC the way it goes today.
//
// 🔴 AND WE NEVER SAY A VAT NUMBER IS VERIFIED. lib/vat.ts checks the shape of it, both modulus 97
// variants, which catches a typo. It does not ask HMRC whose number it is, and claiming otherwise
// would be the same class of claim as implying HMRC recognition.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// What came back from /api/vat, said in his words. Two lists rather than one, because a save and a
// refusal are different news and a screen that blurs them leaves a man unsure what he holds.
function notice(done: string | undefined, problem: string | undefined): string | null {
  switch (done) {
    case 'saved':
      return 'Saved. It is on your record and every figure we work out for you uses it.';
    case 'not_registered':
      return 'Noted. You are down as not VAT registered, so your invoices carry no VAT.';
    case 'forgotten':
      return 'Gone. We hold nothing about your VAT now.';
  }
  switch (problem) {
    case 'vrn':
      return 'That VAT number did not look right, so nothing was saved. It is nine digits, and it is on your registration certificate.';
    case 'date':
      return 'That registration date did not look right, so nothing was saved. It is the date on your certificate, and it cannot be in the future.';
    case 'scheme':
      return 'That scheme did not read right, so nothing was saved. Pick one from the list and try again.';
    case 'percent':
      return 'A flat rate percentage is between 0 and 100, so nothing was saved. It is on the letter HMRC sent you when you joined.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so have another go.';
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    default:
      return null;
  }
}

// A date in the words a man says it in. The UTC time zone is named rather than left to the
// server's, because a stored day is a day and not an instant: read in a negative offset it would
// print as the day before, and a registration date that moves by one is a wrong date.
function sayDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

// 🔴 WHAT HIS REGISTRATION DATE ACTUALLY UNLOCKS, IN HIS OWN DATES.
//
// The promise lib/circumstances.ts has made since 14 July, finally said with real numbers in it.
// The window comes from reg111Window in lib/vat.ts, which is the only place the four years and the
// six months are counted, so this sentence cannot drift from the rule.
//
// ⚠️ "MAY STILL BE" AND NOT "IS". Goods have to have been STILL ON HAND at registration, which is
// a fact about his kit that no date can settle, and the VAT has to have been on a business cost in
// the first place. A screen that promised the money outright would be writing him a cheque HMRC
// has not agreed to.
function reclaimLine(registeredOn: string | null): string | null {
  const win = reg111Window(registeredOn);
  if (!win) return null;
  return `Anything you bought from ${sayDate(win.goodsFrom)} onward that you still had on the day you registered, and any services from ${sayDate(win.servicesFrom)}, may still be reclaimable. Goods have to have been on hand when you registered, so this is your kit rather than your fuel.`;
}

// The four schemes, in the words HMRC uses and the words he uses, together. One control, so the
// explaining happens inside it rather than in a paragraph beside it.
const SCHEMES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'standard', label: 'Standard. You charge VAT and reclaim the VAT on what you buy' },
  { value: 'flat_rate', label: 'Flat rate. You pay a percentage of your VAT inclusive turnover' },
  { value: 'cash', label: 'Cash accounting. The VAT falls due when your customer pays you' },
  { value: 'annual', label: 'Annual accounting. You pay instalments and settle up once a year' },
];

// ONE QUESTION. The only thing on this screen for a man who is not registered, and still the first
// thing on it for a man who is, because people deregister and a record he cannot correct rots.
//
// The two forms are the pattern /app/you/circumstances already uses: the press IS the save, the
// route answers with a 303, and this page draws again from what was written.
function RegisteredQuestion({ answer }: { answer: 'yes' | 'no' | null }) {
  return (
    <section className="lek-card">
      <p style={S.ask}>Are you VAT registered?</p>
      <p style={S.why}>
        It decides whether your invoices carry VAT at all. And if you are, the date you registered
        opens a reclaim on the kit you already owned, which is the single most missed thing in this
        trade.
      </p>
      <div style={S.answers}>
        {(['yes', 'no'] as const).map((a) => {
          const on = answer === a;
          return (
            <form key={a} action="/api/vat" method="post" style={S.aForm}>
              <input type="hidden" name="registered" value={a} />
              <button
                type="submit"
                style={{ ...(a === 'yes' ? S.yes : S.no), ...(on ? S.pressed : null) }}
                aria-pressed={on}
              >
                {on ? '✓ ' : ''}{a === 'yes' ? 'Yes' : 'No'}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}

// EVERYTHING ELSE, AND ONLY FOR THE MAN IT IS TRUE OF. One form, one press, because four separate
// saves is four decisions handed to a man who came here to type one date.
function YourVatFacts({ p, today }: { p: VatProfileRow; today: string }) {
  const reclaim = reclaimLine(p.registeredOn);
  const shown = formatVrn(p.vrn);

  return (
    <>
      <section className="lek-card">
        <h2 className="lek-h2">What we hold</h2>
        {shown ? (
          <p style={S.fact}>Your VAT number is {shown}.</p>
        ) : (
          <p style={S.fact}>We do not have your VAT number yet. It goes on every invoice you send.</p>
        )}
        {p.registeredOn ? (
          <p style={S.fact}>You registered on {sayDate(p.registeredOn)}.</p>
        ) : (
          <p style={S.fact}>
            We do not have the date you registered, and it is the one that matters most. Without it
            we cannot work out what you could still reclaim on the kit you already owned.
          </p>
        )}
        {reclaim ? <p style={S.unlock}>{reclaim}</p> : null}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">Your details</h2>
        <form action="/api/vat" method="post">
          <label htmlFor="vrn" style={S.label}>Your VAT number</label>
          <input
            id="vrn"
            name="vrn"
            type="text"
            inputMode="numeric"
            maxLength={20}
            defaultValue={p.vrn ?? ''}
            className="lek-field"
          />
          {/* 🔴 THE HONEST SENTENCE ABOUT WHAT WE DO AND DO NOT KNOW. The check digits inside a UK
              VAT number catch a typo without asking anybody. They do not tell us whose number it
              is, and the word verified is not available to us. */}
          <p style={S.hint}>
            Nine digits, off your registration certificate. We check the shape of it, which catches
            a typo. We do not ask HMRC whether it is yours.
          </p>

          <label htmlFor="registeredOn" style={S.label}>The date you registered</label>
          <input
            id="registeredOn"
            name="registeredOn"
            type="date"
            defaultValue={p.registeredOn ?? ''}
            min="1973-04-01"
            max={today}
            className="lek-field"
          />
          <p style={S.hint}>
            On your certificate as the effective date of registration. It is what your first
            reclaim is measured back from.
          </p>

          <label htmlFor="scheme" style={S.label}>Which scheme you are on</label>
          <select id="scheme" name="scheme" defaultValue={p.scheme} className="lek-field">
            {SCHEMES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {/* Drawn for the man whose STORED scheme is the flat rate one, which is how a page with
              no script asks a follow up: he picks it, saves, and the next draw asks for the
              percentage. Doc 103's empty test again. Nobody else ever sees these two. */}
          {p.scheme === 'flat_rate' ? (
            <>
              <label htmlFor="flatRatePercent" style={S.label}>Your flat rate percentage</label>
              <input
                id="flatRatePercent"
                name="flatRatePercent"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="100"
                defaultValue={p.flatRatePercent ?? ''}
                className="lek-field"
              />
              {/* ⚠️ NO POUND FIGURE ON THIS SCREEN, AND THAT IS A RULE RATHER THAN AN OMISSION.
                  The join limit for the scheme was drafted in here and taken out: this page holds
                  facts about him, not money, and a threshold he cannot act on from here is a row
                  he has to read and reject. lib/vat.ts owns the limits and the screens that show
                  him figures ask it. */}
              <p style={S.hint}>
                Your trade sector percentage, off the letter HMRC sent you when you joined.
              </p>

              {/* Radios rather than a tick box, deliberately: an unticked box sends nothing, so a
                  man switching first year OFF would be sending us silence and we would keep the
                  old answer. A pair always sends one. */}
              <fieldset style={S.fieldset}>
                <legend style={S.label}>Is this your first year on the scheme?</legend>
                <label style={S.radioRow}>
                  <input type="radio" name="flatRateFirstYear" value="yes" defaultChecked={p.flatRateFirstYear} style={S.radio} />
                  <span>
                    <span style={S.radioTop}>Yes</span>
                    <span style={S.radioHint}>A point comes off your percentage for the first year.</span>
                  </span>
                </label>
                <label style={S.radioRow}>
                  <input type="radio" name="flatRateFirstYear" value="no" defaultChecked={!p.flatRateFirstYear} style={S.radio} />
                  <span>
                    <span style={S.radioTop}>No</span>
                    <span style={S.radioHint}>You have been on it more than a year.</span>
                  </span>
                </label>
              </fieldset>
            </>
          ) : null}

          {/* 🔴 THE QUESTION THAT DECIDES THE MOST COMMON INVOICE THIS AUDIENCE SENDS. A VAT
              registered subcontractor billing a main contractor charges NO VAT at all: the CIS
              domestic reverse charge, VATA 1994 s55A. Guessing it from a trade name would be
              guessing at a figure on a document a customer pays from, so it is asked, once, and
              a hairdresser never sees a word about it again. */}
          <fieldset style={S.fieldset}>
            <legend style={S.label}>Do you do construction work reported under CIS?</legend>
            <p style={S.hint}>
              It decides whether your invoices ever carry the reverse charge, where you charge your
              customer no VAT at all and he accounts for it himself.
            </p>
            <label style={S.radioRow}>
              <input type="radio" name="cisSubcontractor" value="yes" defaultChecked={p.cisSubcontractor} style={S.radio} />
              <span>
                <span style={S.radioTop}>Yes</span>
                <span style={S.radioHint}>Building, plumbing, sparks, groundwork, all of it under CIS.</span>
              </span>
            </label>
            <label style={S.radioRow}>
              <input type="radio" name="cisSubcontractor" value="no" defaultChecked={!p.cisSubcontractor} style={S.radio} />
              <span>
                <span style={S.radioTop}>No</span>
                <span style={S.radioHint}>Your work is not reported under CIS.</span>
              </span>
            </label>
          </fieldset>

          <button type="submit" className="lek-primary">Save my VAT details</button>
        </form>
      </section>
    </>
  );
}

export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Fvat');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('done'), one('problem'));

  // ⚠️ THE CIRCUMSTANCE IS READ ALONGSIDE THE PROFILE, AND ONLY TO KEEP THE SCREEN HONEST.
  //
  // readVatProfile gives registered: false both for a man who told us no and for a man who has
  // never been asked, because an absent row is an empty profile. Ticking No against a man who
  // never answered would be the screen stating an answer he did not give. So the tick comes from
  // the logged answer, and an unreadable log simply ticks nothing.
  const [profile, rows] = await Promise.all([
    readVatProfile(user.id),
    readCircumstances(user.id).catch(() => null),
  ]);

  // 🔴 A FAILED READ IS NOT "HE IS NOT VAT REGISTERED", and drawing the one question over one
  // would invite a registered man to answer it again while his real record sat unread. Said
  // plainly instead, with nothing else on the page to mislead him.
  if (profile === null) {
    return (
      <main className="lek-wrap" style={S.wrap}>
        <style>{CSS}</style>
        <AppNav current="/app/you" />
        <section className="lek-card">
          <h1 className="lek-eyebrow">VAT</h1>
          <p style={S.warn}>
            We could not read your VAT details just this minute. Nothing is lost. Give it a moment
            and reload.
          </p>
        </section>
      </main>
    );
  }

  const logged = rows?.find((r) => r.key === 'vat_registered')?.answer ?? null;
  const answered: 'yes' | 'no' | null = profile.registered
    ? 'yes'
    : logged === 'no' ? 'no' : null;

  // Whether we hold anything at all about his VAT, which is the only thing there is to take back.
  // Hidden when there is nothing, so a new customer sees one question and no housekeeping.
  const holds = profile.registered
    || !!profile.vrn
    || !!profile.registeredOn
    || profile.cisSubcontractor
    || profile.flatRatePercent !== null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you" />

      <section className="lek-card lek-head">
        <h1 className="lek-eyebrow">VAT</h1>
        <p style={S.lede}>
          {profile.registered ? 'You are VAT registered.' : 'One question, and it is worth answering.'}
        </p>
        <p style={S.blurb}>
          What you tell us here decides whether your invoices carry VAT, and how much of what you
          have already spent can come back to you.
        </p>
      </section>

      {said ? <p style={S.said}>{said}</p> : null}

      <RegisteredQuestion answer={answered} />

      {profile.registered ? <YourVatFacts p={profile} today={today} /> : null}

      {/* HIS TO TAKE BACK, and only drawn when there is something to take. The same reasoning as
          the /api/elections DELETE: a fact he gave us and now wants gone is his to remove, in one
          step, without asking us. */}
      {holds ? (
        <section className="lek-card">
          <h2 className="lek-h2">Take it off us</h2>
          <p style={S.quiet}>
            This removes your VAT number, the date you registered, your scheme and your answer to
            the question above. Nothing else on your account changes.
          </p>
          <form action="/api/vat" method="post" style={{ marginTop: SPACE.sm }}>
            <input type="hidden" name="intent" value="forget" />
            <button type="submit" style={S.forget}>Forget my VAT details</button>
          </form>
        </section>
      ) : null}

      <p style={S.foot}>
        We do not send VAT returns. Your VAT return goes to HMRC the way it does today, and what we
        do is keep the figures and the receipts behind them straight so it is quick when you do.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-head{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  // 16px is pinned rather than taken off the type scale: under 16 iOS Safari zooms the whole page
  // the moment a field is focused, and he never asked to be zoomed. Same rule as /app/money/add.
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};margin-bottom:${SPACE.xs}px}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  lede: { fontSize: TYPE.lead, fontWeight: 800, letterSpacing: '-0.01em', margin: `0 0 ${SPACE.xs}px`, color: RIVER_DEEP },
  blurb: { fontSize: TYPE.note, lineHeight: 1.6, color: MUTED, margin: 0, maxWidth: '62ch' },
  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: `0 0 ${SPACE.sm}px` },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: 0 },

  ask: { fontSize: TYPE.strong, lineHeight: 1.45, fontWeight: 700, margin: '0 0 7px' },
  why: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0, maxWidth: '62ch' },
  answers: { display: 'flex', gap: SPACE.xs, marginTop: 13 },
  aForm: { flex: 1, margin: 0 },
  yes: { width: '100%', background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  no: { width: '100%', background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  pressed: { outline: `2px solid ${RIVER_DEEP}`, outlineOffset: 1 },

  fact: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  unlock: { fontSize: TYPE.note, lineHeight: 1.6, color: RIVER_DEEP, background: RIVER_TINT, borderRadius: RADIUS.md, padding: '11px 13px', margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0, maxWidth: '62ch' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: SPACE.xs, marginTop: SPACE.sm },
  hint: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  fieldset: { border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `${SPACE.sm}px 0 0` },
  radioRow: { display: 'flex', gap: SPACE.xs, alignItems: 'flex-start', padding: '9px 0' },
  radio: { marginTop: 3, width: 20, height: 20, accentColor: RIVER },
  radioTop: { display: 'block', fontSize: TYPE.body, fontWeight: 700, color: INK },
  radioHint: { display: 'block', fontSize: TYPE.note, lineHeight: 1.45, color: MUTED },

  forget: { background: PANEL, color: INK, border: `1.5px solid ${LINE}`, borderColor: edge(RED, 30), borderRadius: RADIUS.sm, padding: '11px 16px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0', maxWidth: '62ch', marginLeft: 'auto', marginRight: 'auto' },
};
