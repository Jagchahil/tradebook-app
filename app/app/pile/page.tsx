import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { pileEntries, readOwnNames, readAccountUse, readCircumstances, getBusinessProfile, accountHasRental } from '../../../lib/supabase';
import { buildPile, summarisePile, partitionPile, waitingCount } from '../../../lib/reviewpile';
import { household, notHousehold, mtdQuestions, progressIn, openQuestionsLead } from '../../../lib/circumstances';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES, categoriseBankLine } from '../../../lib/categories';
import { gbp0 } from '../../../lib/money';
import { bankFeedOffered } from '../../../lib/bankfeed';
import { gateForUser } from '../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SAFFRON_DEEP, SAFFRON_TINT,
  SURFACE, edge,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE PILE, ON THE WEB. What is waiting on him, and the one screen that lets him answer it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS IS THE SCREEN THAT HAD TO COME BEFORE THE ACKNOWLEDGEMENT EMAIL.
//
// From 28 July, a receipt landing on WhatsApp is answered by an email saying "new transaction,
// please confirm". Until this page existed there was nowhere on the web to confirm anything, so
// that email would have linked a man to a money screen with no button on it. An email that tells
// somebody to do a thing he then cannot do is worse than no email.
//
// It is also what makes the money screen true. ledgerFor() reads CONFIRMED rows only, so an
// unconfirmed pile is money he has spent that his own figures do not know about.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NOT ONE THING ON THIS SCREEN IS DECIDED HERE.
//
// buildPile(), summarisePile() and canBulkConfirm() are the SAME functions /api/pile calls, which
// are the same ones the phone app renders. The grouping, the ordering, the careful-first rule and
// the "is the fast path even on offer" rule all live in lib/reviewpile.ts. This file is a surface.
//
// ⚠️ AND IT SHIPS NO CLIENT SCRIPT. Every decision is a plain form post, because he is on a cheap
// Android on a bad signal and a page that cannot act until JavaScript arrives is a page that cannot
// act. The cost is a full page load per decision, which on this screen is the honest trade: he is
// answering a handful of questions, not dragging a slider.

const dec = (n: number) => (n === 1 ? '1 thing' : `${n} things`);

function message(code: string | undefined, n: string | undefined): string | null {
  const count = Number(n);
  switch (code) {
    case 'filed':
      return Number.isFinite(count) && count > 0
        ? `Filed ${dec(count)}. That is in your figures now.`
        : 'Filed.';
    case 'personal':
      return Number.isFinite(count) && count > 0
        ? `Marked ${dec(count)} as not business money. They stay in your list, struck through, and you can put them back.`
        : 'Marked as not business money.';
    // ⚠️ THE HONEST ONE. confirm_pile re-applies its rules in SQL, so a group that looks like it
    // might not be business money files fewer rows than were asked for. Reporting success on 11 of
    // 14 is how a man ends up with three transactions he believes are filed.
    case 'partial':
      return 'Some of those were left alone, because they look like they might not be business money. Have a look at them on their own.';
    // 🔴 MONEY IN GETS ITS OWN WORDS, because "filed" says nothing about which side of his books it
    // landed on, and the whole point of the income section is that a payment in is not a cost.
    case 'incomefiled':
      return Number.isFinite(count) && count > 0
        ? `Filed ${dec(count)} as money in. It is in your income figures now.`
        : 'Filed as money in.';
    case 'rent':
      return Number.isFinite(count) && count > 0
        ? `Filed ${dec(count)} as rent. It is in your property stream, kept separate from your trade.`
        : 'Filed as rent.';
    case 'nothing':
      return 'Nothing was changed. Try that again.';
    default:
      return null;
  }
}

export default async function PilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const note = message(one('done'), one('n'));

  const [rows, ownNames, accountUse, gate, circRows, profile, rental] = await Promise.all([
    pileEntries(user.id), readOwnNames(user.id), readAccountUse(user.id), gateForUser(user.id),
    // The SAME source /app/you reads for "N still worth answering": his answers and his structure,
    // counted by lib/circumstances.ts, never worked out here. A failed read passes null and the
    // footnote below simply does not draw, which is the honest shape for a nicety.
    readCircumstances(user.id).catch(() => null),
    getBusinessProfile(user.id).catch(() => null),
    // Whether the money in section offers the rent door at all. The SAME question /app/money/add
    // asks, from the same function, so the two screens can never disagree about whether this man
    // has a property stream. False on a failed read, which draws one button instead of two: a
    // payment filed as plain income is right for almost everybody and is his to correct, while a
    // rent door for a man with no rental is a question with one sensible answer.
    accountHasRental(user.id).catch(() => false),
  ]);
  // 🔴 THE PILE IS STILL DRAWN IN FULL WHEN THE TRIAL HAS ENDED. What stops is answering it.
  //
  // These are HIS bank lines and HIS receipts. lib/gate.ts's header is the argument, and this is the
  // screen it was written about: hiding the list would be hiding his own records to make a point
  // about £12.99. /api/pile refuses the POST regardless, so hiding it would only mean he could not
  // see what he was being refused, which is the worse of the two.
  const locked = gate === 'readonly';
  const groups = buildPile(rows, normaliseVendor, ownNames, categoriseBankLine);
  const summary = summarisePile(groups);

  // FOUR PILES, from lib/reviewpile.ts.
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 MONEY IN USED TO BE COUNTED IN ONE SENTENCE AND RENDERED NOWHERE, AND THAT WAS A HOLE.
  //
  // The reasoning here was: confirm_pile refuses a credit outright, so listing rows he cannot act
  // on would fail doc 103's empty test on every visit. That is right about the screen and wrong
  // about the money. Walking a real statement import on 31 July 2026 showed what it cost: two
  // payments totalling £420 read correctly, kept out of the expense queue correctly, described as
  // "kept separate and not waiting on you here", and then waiting nowhere else either. /app/money
  // lists only what he has confirmed. The dashboard counted four things, not six. There was no
  // screen in the product that listed unconfirmed income at all.
  //
  // Understating income is the one direction of error this product must never make easy
  // (app/app/money/add says so in those words), so the answer was never to hide it more tidily. It
  // was to build the door: confirm_income, one payer at a time, in supabase/APPLY_2026-07-31.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const { known, unknown, careful, income } = partitionPile(groups, accountUse);
  const decidable = waitingCount({ known, unknown, careful, income });
  const knownRows = known.reduce((n, g) => n + g.count, 0);
  const incomeRows = income.reduce((n, g) => n + g.count, 0);

  // What is still open ABOUT HIM, same count as /app/you: progressIn over every group, so the
  // empty state below cannot say "everything is filed and counted" while his questions wait.
  //
  // ⚠️ THE WHOLE PERSONA, NOT JUST THE STRUCTURE, SINCE WAVE NINE. A question that does not exist
  // for a landlord is not one still waiting on him, and counting it here would put a number on
  // this screen that his own circumstances page disagrees with. Both facts come from the one
  // profile read; null on either is unknown, which counts everything, the safe direction.
  const asked = circRows === null
    ? null
    : progressIn([...household(), ...notHousehold(), ...mtdQuestions()], circRows, {
      structure: profile?.businessType ?? null,
      income: profile?.incomeShape ?? null,
    });
  const openLead = asked ? openQuestionsLead(asked.askable - asked.answered) : null;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/pile" />

      {/* The queue is a run of questions, and a question is read down a narrow page. On a desk
          the column around it widens with the other two screens but the queue itself holds a
          reading width, centred, rather than stretching a decision across a whole monitor. */}
      <div className="lek-queue">

      {note && <p style={S.note}>{note}</p>}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : null}

      {decidable === 0 ? (
        <section className="lek-card">
          <h1 className="lek-title">Nothing is waiting on you.</h1>
          {/* 🔴 THE SWEEP OF 31 JULY MISSED THIS ONE, AND WALKING THE LIVE SITE FOUND IT.
              Wave seven put every dead bank sentence behind bankFeedOffered() and this line still
              told a man his spending lands here from a bank feed that has no provider. It is the
              empty state of the pile, so it is read by exactly the customer who has nothing yet and
              is looking for the way in. The bank sentence returns with bankFeedOffered(). */}
          <p style={S.sub}>
            {bankFeedOffered()
              ? 'Everything we have is filed and counted. New spending lands here from a statement upload, a receipt, or your bank feed.'
              : 'Everything we have is filed and counted. New spending lands here from a statement upload or a receipt.'}
          </p>
          {openLead ? (
            <p style={S.aside}>
              {openLead}<a href="/app/you/circumstances" style={S.crossLink}>Circumstances</a>.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {/* ⚠️ THE TRUTH ABOUT WHAT THIS COSTS HIM, BEFORE HE STARTS, AND THE WIN NAMED FIRST.
              He went to the same merchant many times: that is one question, not many. And the ones
              we already recognise are not a question at all, they are a yes. Saying so up front is
              the difference between a screen he works through and a screen he closes. */}
          <section className="lek-card">
            <h1 className="lek-title">
              {summary.entries} to check, and {decidable === 1 ? 'one question' : `only ${decidable} questions`}.
            </h1>
            <p style={S.sub}>
              We have grouped them by who you paid. Answer once for a shop and we will file every
              future payment there the same way, without asking again.
            </p>
            {income.length > 0 && (
              <p style={S.aside}>
                {incomeRows === 1 ? 'One of them is' : `${incomeRows} of them are`} money in rather
                than money out. Those are kept separate from your spending and asked on their own,
                at the bottom.
              </p>
            )}
          </section>

          {/* ── 1. THE ONES WE KNOW ──────────────────────────────────────────────────────────
              No dropdown. A category he can read, and ONE button for the lot. Rendering a twenty
              four option select next to a merchant we already recognise is asking a question we
              have already answered, and doing it twenty times is what made this screen feel like
              work. He only needs the dropdown when he DISAGREES, which is what the row link is. */}
          {known.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">We recognise {known.length === 1 ? 'this one' : `these ${known.length}`}</h2>
              <p style={S.sub}>
                {knownRows === 1 ? 'One payment' : `${knownRows} payments`}, and we are confident
                about {known.length === 1 ? 'it' : 'them'}. Have a read, then file the lot in one go.
              </p>
              <ul style={S.lines}>
                {known.map((g) => (
                  <li key={g.key} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{g.vendor}</span>
                      <span style={S.amount}>{gbp0(g.total)}</span>
                    </div>
                    <p style={S.meta}>
                      {g.count === 1 ? 'One payment' : `${g.count} payments`}, filed as{' '}
                      <b style={S.cat}>{g.suggested}</b>.
                    </p>
                  </li>
                ))}
              </ul>
              {/* THE CLIENT SENDS NO IDS. The server rebuilds the pile and works out for itself
                  which groups it was confident about. See the comment in app/api/pile/route.ts:
                  this is the one tap that files many rows, so nothing about it trusts the browser. */}
              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="verdict" value="confirm_known" />
                <button type="submit" className="lek-primary">
                  Yes, file {known.length === 1 ? 'it' : `all ${knownRows}`}
                </button>
              </form>
              <p style={S.hint}>
                Anything you disagree with, sort it below after. Nothing here is final.
              </p>
            </section>
          )}

          {/* ── 2. THE ONES THAT NEED HIM ────────────────────────────────────────────────────
              Few, and they are the ones that cost him if he gets them wrong, so they sit above the
              long tail where he will actually see them. Never bulk, always the reason in his words. */}
          {careful.map((g) => (
            <section key={g.key} className="lek-card lek-careful">
              <div style={S.rowTop}>
                <span style={S.vendor}>{g.vendor}</span>
                <span style={S.amount}>{gbp0(g.total)}</span>
              </div>
              <p style={S.meta}>{g.count === 1 ? 'One payment' : `${g.count} payments`}.</p>
              <p style={S.reason}>{looksPersonal(g.vendor, null, ownNames)?.why ?? g.reason}</p>
              <p style={S.aside}>
                We will not file {g.count === 1 ? 'this' : 'these'} for you in one go, because getting
                it wrong costs you. If it really is business, confirm it on its own.
              </p>
              <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="personal" />
                <button type="submit" className="lek-ghost">Not business money</button>
              </form>
            </section>
          ))}

          {/* ── 3. THE ONES WE HAVE NEVER SEEN ───────────────────────────────────────────────
              ⚠️ THE EASY QUESTION FIRST. "Is this business at all" is a far easier thing to answer
              than "which of twenty four categories", and on a feed with a lot of personal spending
              in it, answering it clears most of the pile without categorising anything. So Not
              business money is the FIRST thing on the card, and the category is underneath for the
              ones he keeps. */}
          {/* ⚠️ NOT "we have not seen these before" ANY MORE, AND THE WORDING MATTERED.
              After the merchant rule landed, this section holds two different things: merchants we
              have genuinely never seen, AND merchants we know perfectly well whose category depends
              on the circumstance rather than the shop. Trainline is travel, and whether that travel
              is claimable depends on the journey. Telling a man we have not seen Trainline before is
              simply untrue, and he can see that it is. */}
          {unknown.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">{unknown.length === 1 ? 'This one needs' : 'These need'} you</h2>
              <p style={S.sub}>
                Quickest way through: knock out anything that was not business first, then say what
                the rest were. Where we have a good idea we have filled it in for you.
              </p>
            </section>
          )}
          {unknown.map((g) => (
            <section key={g.key} className="lek-card">
              <div style={S.rowTop}>
                <span style={S.vendor}>{g.vendor}</span>
                <span style={S.amount}>{gbp0(g.total)}</span>
              </div>
              {/* ⚠️ REFUSING TO BULK FILE IT IS NOT THE SAME AS NOT KNOWING WHAT IT IS.
                  Trainline is travel. We will not file it in a screenful because whether the journey
                  was work is his to say, not the shop's. But making him hunt "travel" out of twenty
                  four options when we already know is throwing away the one thing we do know, and it
                  is the exact tedium that made him stop the first time. So the answer is filled in
                  and he presses once. */}
              <p style={S.meta}>
                {g.count === 1 ? 'One payment' : `${g.count} payments`}
                {g.suggested ? `, and this looks like ${g.suggested}. Only you know if it was work.` : '.'}
              </p>

              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="personal" />
                <button type="submit" className="lek-quiet">Not business money</button>
              </form>

              <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="business" />
                <label htmlFor={`cat-${g.key}`} style={S.label}>
                  {g.suggested ? 'Or it was work, file it as' : 'Or file it as'}
                </label>
                <select id={`cat-${g.key}`} name="category" defaultValue={g.suggested ?? ''} className="lek-select" required>
                  {!g.suggested && <option value="">Choose one</option>}
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="submit" className="lek-ghost">
                  File {g.count === 1 ? 'it' : `all ${g.count}`}
                </button>
              </form>
            </section>
          ))}

          {/* ── 4. MONEY IN ──────────────────────────────────────────────────────────────────
              🔴 ONE PAYER AT A TIME, AND NEVER IN THE BULK CONFIRM. confirm_pile refuses a credit
              outright and always will: "Income is what HMRC cares about and it is always asked."
              This section is the asking. It is at the BOTTOM rather than the top on purpose: it is
              the smallest part of a real pile and the least ambiguous, so it does not deserve the
              position that the questions which actually cost him money get. But it is on the page,
              which until 31 July 2026 it was not, and a payment in that no screen lists is income
              that never reaches his tax figures.

              THE DEFAULT IS THAT IT IS HIS. Money in is his income unless he says otherwise, so the
              confirming button is the plain one and "not business money" is the quiet one. That is
              the opposite way round from the spending sections above, where the easy question is
              "was this business at all", and it is deliberate: for a cost, the cheap mistake is
              claiming something he should not. For a payment in, the expensive mistake is striking
              out income, so the effort sits on that side. */}
          {income.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">Money in</h2>
              <p style={S.sub}>
                {incomeRows === 1 ? 'One payment' : `${incomeRows} payments`} into your account.
                {' '}Money in goes straight into your income figures and nothing takes it out again,
                so we ask about {income.length === 1 ? 'it' : 'each of these'} on its own rather than
                filing {income.length === 1 ? 'it' : 'them'} with everything else.
              </p>
            </section>
          )}
          {income.map((g) => (
            <section key={g.key} className="lek-card">
              <div style={S.rowTop}>
                <span style={S.vendor}>{g.vendor}</span>
                <span style={S.amount}>{gbp0(g.total)}</span>
              </div>
              <p style={S.meta}>
                {g.count === 1 ? 'One payment' : `${g.count} payments`} in.
              </p>

              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="income" />
                <input type="hidden" name="category" value="income" />
                <button type="submit" className="lek-primary">
                  Yes, {g.count === 1 ? 'this is' : 'these are'} money in
                </button>
              </form>

              {/* THE RENT DOOR, drawn only for an account with a rental stream, exactly as
                  /app/money/add draws it. HMRC taxes the two differently (no National Insurance on
                  rent, Section 24 on the mortgage interest), so a rent payment filed as trade income
                  overstates his Class 4 bill. For a man with no rental stream this would be a
                  question with only one sensible answer, which doc 103 says never to ask. */}
              {rental && (
                <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                  <input type="hidden" name="ids" value={g.ids.join(',')} />
                  <input type="hidden" name="vendor" value={g.vendor} />
                  <input type="hidden" name="verdict" value="income" />
                  <input type="hidden" name="category" value="rent" />
                  <button type="submit" className="lek-ghost">
                    {g.count === 1 ? 'It was rent' : 'They were rent'}
                  </button>
                </form>
              )}

              <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="personal" />
                <button type="submit" className="lek-quiet">Not business money</button>
              </form>
            </section>
          ))}
        </>
      )}
      </div>
    </main>
  );
}

// The column, the card and the desk composition come whole from APP_CSS in lib/tokens.ts, shared
// with the Overview and the money log. This block holds only what the queue alone owns: its
// headline, the careful tint, and the three buttons a decision can be.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `select:focus,button:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  `.lek-careful{background:${SAFFRON_TINT};border-color:${LINE};border-color:${edge(SAFFRON_DEEP, 27)}}`,
  `.lek-primary{width:100%;margin-top:${SPACE.xs}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-quiet{width:100%;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${INK};background:${SURFACE};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-ghost{width:100%;padding:12px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${MUTED};background:transparent;border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;cursor:pointer;transition:color ${MOTION.quick} ${MOTION.ease},border-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-ghost:hover{color:${INK}}`,
  // 16px is pinned, not a stray off the type scale: under 16 iOS Safari zooms the whole page the
  // moment the select is focused, and he never asked to be zoomed.
  `.lek-select{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL}}`,
  // On a desk a decision is a button sized to its words, not a bar the width of the monitor. A
  // full width press target earns its keep under a thumb and loses it under a mouse.
  `@media(min-width:${BREAK.desk}px){
    .lek-queue{max-width:760px;margin:0 auto}
    .lek-title{font-size:${TYPE.stat}px}
    .lek-primary,.lek-quiet,.lek-ghost{width:auto;min-width:264px}
    .lek-select{max-width:420px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },
  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: 0 },
  aside: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '12px 0 0' },
  crossLink: { color: RIVER_DEEP, fontWeight: 700 },
  note: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: 14, fontSize: TYPE.body, lineHeight: 1.5, margin: '0 0 14px' },
  locked: { display: 'block', background: SAFFRON_TINT, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  vendor: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em' },
  amount: { fontSize: TYPE.strong, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  meta: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '4px 0 0' },
  reason: { fontSize: TYPE.note, lineHeight: 1.55, color: INK, margin: '10px 0 0', fontWeight: 600 },
  form: { margin: '14px 0 0' },
  formTight: { margin: '10px 0 0' },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: 6 },
  cat: { color: RIVER_DEEP },
  lines: { listStyle: 'none', margin: '14px 0 0', padding: 0 },
  line: { borderTop: `1px solid ${LINE}`, padding: '12px 0 0', marginTop: 12 },
  hint: { fontSize: TYPE.label, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: '10px 0 0' },
};
