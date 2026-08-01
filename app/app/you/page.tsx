import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie, identityForUser } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  readIdentityCard, getBusinessProfile, readCircumstances, readSignupCompany, readVatProfile,
  type SignupCompany, type VatProfileRow,
} from '../../../lib/supabase';
import { formatVrn } from '../../../lib/vat';
import { registrationLine } from '../../../lib/companieshouse';
import {
  household, notHousehold, mtdQuestions, progressIn, type IncomeShape,
} from '../../../lib/circumstances';
import { maskEmail, bindNotice, BOUND_LINE } from './identity';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  GREEN_TINT, INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, SURFACE,
  edge,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WHO WE THINK HE IS. The page that says it to his face, and the doors to correct it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ NOT ONE MONEY FIGURE ON THIS SCREEN, AND THAT IS A RULE RATHER THAN AN OMISSION.
//
// Every other surface answers "what do I owe" or "who owes me". This one answers "who do you
// think I am", and mixing the two would put a second copy of a money figure on a page whose job
// is names and contact points. The Overview and the tax hub already draw his figures from the one
// reader; a number printed here would be the second reader /api/ledger's header warns about.
//
// ⚠️ EVERYTHING SHOWN IS READ FROM WHAT HE HAS ALREADY TOLD US. Nothing on this page computes,
// guesses or enriches: the name and trade come off his users row, the structure from
// getBusinessProfile, the VAT from vat_profiles with the circumstances log behind it, the contact
// points from the auth store. A page about him that embellished would be a page he stops trusting,
// and he only has to catch us once.
//
// ⚠️ AND THE VAT PART IS ONE SENTENCE AND ONE DOOR, ON PURPOSE. It used to be all this page could
// say, three sentences built from a stored 'yes'. Since 1 August 2026 /app/you/vat holds the
// number, the date he registered and his scheme, so this says what we know and gets out of the
// way. A hub that repeats a page is a hub he has to read twice.
//
// 🔴 THE EMAIL IS PRINTED MASKED, AND THE ADD FLOW LIVES HERE. A page read over a shoulder on a
// site, cached, screenshotted for support: the full address adds nothing its owner does not
// already know. The add flow is the delicate one: the 29 July takeover fix is law, so the send
// and the bind both live in /api/you/email, the address rides a signed cookie between the two
// steps, and every sentence this page can say about it is a fixed string in ./identity.ts that
// structurally cannot carry another man's details. See those files before touching the forms.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// How he trades, said in his words. The profile defaults an unset structure to sole trader, which
// is the engine's safe guess, so the sentence says "we have it as" rather than "you told us".
//
// 🔴 THE COMPANY SENTENCE IS EARNED, NOT ASSUMED. This used to say "registered at Companies House"
// for ANY ltd account, when the signup lookup may have searched the register and found nothing.
// lib/companieshouse.ts writes the sentence now, from what the lookup actually recorded: the
// number when there was a match, a plain "we could not find this name" when there was not, and no
// claim about the register at all when we never managed to look.
function structureLine(
  p: { businessType: string; partnershipShare: number } | null,
  company: SignupCompany | null,
): string {
  if (!p) return '';
  switch (p.businessType) {
    case 'partnership':
      return `A partnership. We work your tax out on your share of the profit, which we have as ${p.partnershipShare}%.`;
    case 'limited_company':
      return registrationLine(company?.lookup ?? null, company?.companyNumber ?? null);
    default:
      return 'Just you. Self employed, taxed as a sole trader, whatever name you trade under.';
  }
}

// The first letter up, for a trade stored in lower case. Nothing else is touched: a trade he
// typed himself is his own word for what he does.
function tidyTrade(raw: string | null): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return t[0].toUpperCase() + t.slice(1);
}

// What he does, in his own word for it, said so that it is true of a landlord as well.
//
// 🔴 THIS LINE READ "Landlord by trade." AND A LANDLORD CARRIES ON NO TRADE.
//
// Not a quibble about a word. It is the whole of wave nine: early trade losses (ITA 2007 s72),
// voluntary Class 2 (NIM74250, a landlord's ordinary activities are not gainful employment for
// self employed NICs) and the use of home flat rate (ITTOIA 2005 s94H) are all TRADE provisions,
// and every one of them was being offered to a man whose business is letting, because the Landlord
// chip on /start stores him as a sole trader. The page that tells him who we think he is was
// stating the mistake back to his face.
//
// An unknown shape keeps the old sentence. This is prose rather than a gate, and the wording that
// is true of every customer we have on record is the right default until he tells us otherwise.
function tradeLine(trade: string, income: IncomeShape | null): string {
  return income === 'property_only' ? `${trade}. Letting is the business.` : `${trade} by trade.`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// HIS VAT, IN ONE SENTENCE, WITH THE DOOR TO THE REST OF IT.
//
// This page used to say all it could about VAT, which was three sentences built from a single
// stored 'yes'. Since 1 August 2026 there is a screen that holds the number, the date he
// registered and his scheme, so the hub says what we know and gets out of the way. A hub that
// repeats a page is a hub a man has to read twice.
//
// ⚠️ THE PROFILE LEADS AND THE LOGGED ANSWER IS THE FALLBACK. vat_profiles is what the engine
// reads and what /app/you/vat writes. The circumstance is the logged question and answer, and it
// is all we have for a man who answered at signup or over WhatsApp. A failed profile read comes
// back null, and null falls back to the log rather than asserting he is not registered.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SCHEME_WORDS: Record<string, string> = {
  standard: 'standard',
  flat_rate: 'flat rate',
  cash: 'cash accounting',
  annual: 'annual accounting',
};

function sayDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  // UTC named on purpose: a stored day is a day, not an instant, and read in a negative offset it
  // would print as the day before.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

function vatLine(vat: VatProfileRow | null, answer: string | null): string {
  if (vat?.registered) {
    const since = sayDate(vat.registeredOn);
    const said = [since ? `VAT registered since ${since}` : 'VAT registered, as you told us'];
    const number = formatVrn(vat.vrn);
    if (number) said.push(number);
    if (vat.scheme !== 'standard') said.push(`on the ${SCHEME_WORDS[vat.scheme] ?? vat.scheme} scheme`);
    return `${said.join(', ')}.`;
  }
  if (answer === 'yes') return 'VAT registered, as you told us.';
  if (answer === 'no') return 'Not VAT registered, as you told us.';
  // A longer answer came in over WhatsApp in his own words and is shown as he gave it. Paraphrasing
  // what a man told us about his tax is how the record and his memory drift apart.
  if (answer) return `On VAT you told us: ${answer}.`;
  return 'You have not told us about VAT yet, and the answer can reach back four years.';
}

// What the door says, which is where the nudging belongs: a registered man with no date on file is
// missing the one fact the whole pre registration reclaim is measured from.
function vatDoor(vat: VatProfileRow | null, answer: string | null): string {
  if (vat?.registered && !vat.registeredOn) return 'Add the date you registered';
  if (vat?.registered || answer === 'yes') return 'Your VAT details';
  return 'VAT';
}

export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const [card, profile, rows, identity, company, vatProfile] = await Promise.all([
    readIdentityCard(user.id),
    getBusinessProfile(user.id).catch(() => null),
    readCircumstances(user.id),
    identityForUser(user),
    // What the signup lookup recorded about his company, read from the signups row itself so this
    // page cannot assert a registration the lookup never found. Null on any failure, which makes
    // the sentence LESS assertive, never more.
    readSignupCompany(user.id).catch(() => null),
    // His VAT position. Null is an unreadable read, never "not registered", so vatLine falls back
    // to the logged answer rather than telling a registered man his invoices carry no VAT.
    readVatProfile(user.id).catch(() => null),
  ]);

  // The logged answer, which is what we have for a man who told us at signup or over WhatsApp and
  // has never opened the VAT screen.
  const vatAnswer = rows?.find((r) => r.key === 'vat_registered')?.answer ?? null;

  // What his business income actually is, read once and used twice below: the count of what is
  // still worth asking him, and the sentence about what he does. Null is unknown, which asks and
  // says everything, and that is the direction lib/persona.ts argues for.
  const income = profile?.incomeShape ?? null;
  const trade = tidyTrade(card?.trade ?? null);

  // How far through the questions he is, counted by lib/circumstances.ts against HIS answers,
  // never worked out here. The denominator is his: it grows as his answers open follow ups.
  //
  // ⚠️ BOTH HALVES OF WHO HE IS GO IN, NOT JUST THE STRUCTURE. Since wave nine a question that
  // does not exist for a landlord is not one still waiting on him, and a door promising "3 still
  // worth answering" that counts questions he can never be asked is a door that lies twice: once
  // here and again when he opens it and finds them gone.
  const asked = rows === null
    ? null
    : progressIn([...household(), ...notHousehold(), ...mtdQuestions()], rows, {
      structure: profile?.businessType ?? null,
      income,
    });

  const notice = bindNotice(one('e'));
  const bind = one('bind');

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you" />

      {/* ── WHO WE THINK HE IS. Facts, each from its own home, none computed here. ──────────── */}
      <section className="lek-card">
        <h1 className="lek-eyebrow">Who we think you are</h1>
        {card === null ? (
          <p style={S.warn}>
            We could not read your details just this minute. Nothing is lost. Give it a moment and
            reload.
          </p>
        ) : (
          <>
            <p style={S.name}>
              {card.name || card.businessName || 'We do not have your name yet.'}
            </p>
            {card.businessName && card.name ? (
              <p style={S.fact}>Trading as {card.businessName}.</p>
            ) : null}
            {trade ? <p style={S.fact}>{tradeLine(trade, income)}</p> : null}
            {profile ? <p style={S.fact}>{structureLine(profile, company)}</p> : null}
            <p style={S.fact}>
              {vatLine(vatProfile, vatAnswer)}{' '}
              <a href="/app/you/vat" style={S.inlineLink}>{vatDoor(vatProfile, vatAnswer)}</a>
            </p>
            <p style={S.quiet}>
              Wrong about any of this? How you trade is changed in{' '}
              <a href="/app/setup?step=business" style={S.inlineLink}>setup</a>, and the rest comes
              from what you tell us on the pages below.
            </p>
          </>
        )}
      </section>

      {/* ── HOW WE REACH HIM. The email, masked, and the WhatsApp binding. ─────────────────────
          The add email flow draws here because this is the page a man is on when he wonders where
          his codes go. Both forms are plain posts; the server does every check again. */}
      <section className="lek-card">
        <h2 className="lek-h2">How we reach you</h2>

        {notice ? <p style={S.warn}>{notice}</p> : null}

        {identity.email ? (
          <>
            <p style={S.fact}>
              Your email is <b>{maskEmail(identity.email)}</b>. Codes for signing in go there, and
              you can sign in with the address itself.
            </p>
            {bind === 'done' ? <p style={S.good}>{BOUND_LINE}</p> : null}
          </>
        ) : bind === 'code' ? (
          <>
            <p style={S.fact}>
              We have emailed a six digit code to the address you just gave us. Type it here and
              the address is yours on this account.
            </p>
            <form action="/api/you/email/verify" method="post" style={S.form}>
              <label htmlFor="code" style={S.label}>The code from the email</label>
              <div style={S.formRow}>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  style={S.codeInput}
                />
                <button type="submit" style={S.submit}>Add this email</button>
              </div>
            </form>
            <p style={S.quiet}>
              Nothing arrived, or wrong address? <a href="/app/you" style={S.inlineLink}>Start
              again</a> and we will send a fresh code. The code lasts ten minutes.
            </p>
          </>
        ) : (
          <>
            <p style={S.fact}>
              There is no email on your account yet. Add one and your sign in codes can come by
              email, and the address itself becomes a way back in if you ever change your phone.
            </p>
            <form action="/api/you/email/start" method="post" style={S.form}>
              <label htmlFor="email" style={S.label}>Your email address</label>
              <div style={S.formRow}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  style={S.emailInput}
                />
                <button type="submit" style={S.submit}>Send me a code</button>
              </div>
            </form>
            <p style={S.quiet}>
              We email a six digit code to prove the address is yours. Nothing is added until you
              type it back.
            </p>
          </>
        )}

        {/* ⚠️ THE WORD WHATSAPP IS DELIBERATELY NOT ON THIS SCREEN. test/frontdoor.test.mjs holds
            every screen but the connect page to that, because screens used to instruct actions a
            man with no bound number could not take. This card reports the binding as the connect
            page's own copy does, "your phone", and the door leads where the word lives. */}
        <div style={S.reachRow}>
          {card?.phone ? (
            <p style={S.fact}>
              Your phone is connected. Messages from the number ending <b>{card.phone.slice(-4)}</b>{' '}
              come straight into your books.
            </p>
          ) : (
            <p style={S.fact}>
              Your phone is not connected yet. Connect it and a photo of a receipt is all it takes
              to log one.
            </p>
          )}
          <a href="/app/connect" style={S.inlineLink}>
            {card?.phone ? 'Manage your connected phone' : 'Connect your phone'}
          </a>
        </div>
      </section>

      {/* ── THE DOORS DOWN. Each answers one question well; this page repeats none of them. ─── */}
      <section className="lek-card">
        <h2 className="lek-h2">Yours to change</h2>
        <div style={S.doors}>
          <a href="/app/you/circumstances" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Your circumstances</span>
            <span style={S.rowBody}>
              {asked
                ? `${asked.answered} answered, ${asked.askable - asked.answered} still worth answering. Each open one is money or standing we cannot get you until you tell us.`
                : 'What you have told us about yourself, and the questions still waiting.'}
            </span>
          </a>
          <a href="/app/you/settings" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Settings</span>
            <span style={S.rowBody}>The daily reminder and the weekly summary, on or off.</span>
          </a>
          {/* Not /account, which needs an SMS code a web account cannot get. This door rides the
              session he is already in. */}
          <a href="/app/you/billing" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Billing</span>
            <span style={S.rowBody}>Your card, your invoices from us, and cancelling.</span>
          </a>
        </div>
      </section>
    </main>
  );
}

// The column, the card and the desk composition come whole from APP_CSS. Declared here is only
// what this screen alone owns.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  name: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: `0 0 ${SPACE.xs}px` },
  fact: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.xs}px`, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },
  good: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `${SPACE.xs}px 0 0` },

  inlineLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },

  form: { margin: `${SPACE.sm}px 0 0`, background: SURFACE, borderRadius: RADIUS.md, padding: SPACE.sm },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: SPACE.xs },
  formRow: { display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' },
  emailInput: { flex: '1 1 220px', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.strong, fontFamily: FONT, color: INK },
  codeInput: { flex: '0 1 160px', background: PANEL, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: TYPE.stat, fontFamily: FONT, color: INK, letterSpacing: '0.2em', fontVariantNumeric: 'tabular-nums' },
  submit: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '11px 18px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  reachRow: { borderTop: `1px solid ${LINE}`, marginTop: SPACE.md, paddingTop: SPACE.md },

  doors: { display: 'grid', gridTemplateColumns: '1fr', gap: SPACE.xs },
  door: { display: 'block', textDecoration: 'none', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px' },
  doorLabel: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP, marginBottom: 3 },
  rowBody: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },
};
