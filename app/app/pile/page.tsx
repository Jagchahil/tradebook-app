import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { pileEntries, readOwnNames, readAccountUse, readCircumstances, getBusinessProfile, accountHasRental, readVatProfile } from '../../../lib/supabase';
import { buildPile, summarisePile, partitionPile, waitingCount, cisToAsk, CIS_RATES } from '../../../lib/reviewpile';
import { UNCERTAIN_SECTION_TITLE, UNCERTAIN_SECTION_NOTE, uncertainAmountLine } from '../../../lib/receiptconfidence';
import { inputVatNote } from '../../../lib/vat';
import { household, notHousehold, mtdQuestions, progressIn, openQuestionsLead, worksUnderCis } from '../../../lib/circumstances';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES, categoriseBankLine } from '../../../lib/categories';
// RUN 2: money out reaches the property stream now. Drawn only for a customer who lets something,
// exactly as the "It was rent" button below already is. See lib/propertylanes.ts.
import { categoriesFor } from '../../../lib/propertylanes';
import { capitalOptions, capitalQuestion, capitalWhy, shouldAskCapital } from '../../../lib/capital';
import { gbp0, gbp2 } from '../../../lib/money';
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
    // 🔴 THE ONE FAILURE THAT REFUSES TO FILE RATHER THAN FILING WRONGLY. See setCapitalKind in
    // lib/supabase.ts: recording that a purchase was a car has to land BEFORE the row is confirmed,
    // because a confirmed car with its answer lost is a £60,000 deduction. So nothing was filed,
    // the row is still here, and he is told plainly rather than being shown a success he did not get.
    case 'carfailed':
      return 'We could not save what that purchase was, so we have not filed it. It is still here. Please try again in a moment.';
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
    // 🔴 VAT GETS ITS OWN WORDS, AND THEY SAY THE HALF THAT IS STILL MISSING. Confirming the VAT
    // does not file the payment, and the reclaim needs both. Telling him it is "claimed" when the
    // cost itself is still waiting would be the one sentence on this screen that is not true.
    case 'vat':
      return 'Saved. That is the VAT we will use, and it counts towards what you claim back once you have filed the payment itself.';
    case 'vatbad':
      return 'That VAT figure does not fit the payment. It cannot be more than the payment, and at the standard rate it cannot be more than a sixth of it.';
    case 'novat':
      return 'We have you down as not VAT registered, so there is nothing to reclaim here. If that is wrong, put it right under You.';
    // 🔴 A CIS ANSWER IS TWO COLUMNS AND WE WILL NOT WRITE ONE OF THEM ON ITS OWN. See the branch
    // in app/api/pile/route.ts: raising the payment to the gross without recording the tax already
    // taken would put his turnover right and leave the money HMRC is holding nowhere at all, which
    // is a half fix that reads as a finished one. So nothing was filed and nothing moved.
    case 'cishold':
      return 'We could not record what was taken off that payment, so nothing has been filed. It is still here, exactly as it was, and none of your figures have moved.';
    case 'nothing':
      return 'Nothing was changed. Try that again.';
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE PILE ROW, PLUS THE TWO VAT COLUMNS supabase/APPLY_2026-08-01_vat.sql ADDED.
//
// 🔴 THEY ARE OPTIONAL HERE, AND THAT IS NOT DEFENSIVENESS, IT IS THE HONEST SHAPE.
//
// pileEntries names its columns one by one and does not yet name these two, so today they arrive
// undefined and this whole section draws nothing at all. Nobody sees a wrong figure and nobody
// sees a broken screen. Adding vat_amount and vat_confirmed to that select in lib/supabase.ts is
// what switches it on, and it is the one line this file is not allowed to write for itself.
//
// ⚠️ A STRING IS ALLOWED FOR A REASON. PostgREST hands back a numeric column as a JSON number on
// some builds and as a string on others, and a silent NaN in a VAT figure is worse than any
// amount of belt and braces here.
interface RowWithVat {
  id: string;
  vendor: string | null;
  description?: string | null;
  amount: number;
  category: string | null;
  vat_amount?: number | string | null;
  vat_confirmed?: boolean | null;
}

interface VatQuestion {
  id: string;
  vendor: string;
  gross: number;
  read: number;
  category: string | null;
  text: string;
}

// Which rows carry a VAT reading he has not yet agreed to.
//
// ⚠️ A STORED ZERO IS NOT ASKED ABOUT. Zero means the receipt printed no VAT, and asking a man to
// agree that nothing was nothing is a question with one sensible answer, which doc 103 says never
// to ask. It also adds not a penny to anything he claims back.
function vatToCheck(rows: RowWithVat[]): VatQuestion[] {
  const out: VatQuestion[] = [];
  for (const r of rows) {
    if (r.vat_confirmed) continue;
    if (!(r.amount < 0)) continue; // input tax is on what he BOUGHT. A credit has none.
    const raw = r.vat_amount === null || r.vat_amount === undefined ? null : Number(r.vat_amount);
    if (raw === null || !Number.isFinite(raw) || raw <= 0) continue;
    const gross = Math.abs(r.amount);
    out.push({
      id: r.id,
      vendor: (r.vendor ?? '').trim() || 'Unknown',
      gross,
      // Never offer him a figure larger than the payment. lib/claude.ts clamps it on the way in
      // and /api/pile refuses it on the way out, and this is the third: a screen that can print
      // an impossible number is a screen that will, on the one row where it matters.
      read: Math.min(raw, gross),
      category: r.category,
      text: `${r.vendor ?? ''} ${r.description ?? ''}`.trim(),
    });
  }
  return out;
}

// What HMRC says about the VAT on this KIND of cost, where there is anything to say.
//
// lib/vat.ts owns every word of it: entertaining a customer is blocked outright, a van comes back
// and a car does not, insurance carries no VAT at all, and a subcontractor invoicing under the
// reverse charge charged him none to reclaim. It returns null for most costs, which is the point.
// Drawn for a VAT registered customer and for nobody else.
function VatNote({ show, category, text }: { show: boolean; category: string | null; text: string }) {
  if (!show) return null;
  const note = inputVatNote(category, text);
  if (!note) return null;
  return <p style={S.vatNote}>{note.says}</p>;
}

export default async function PilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fpile');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const note = message(one('done'), one('n'));

  const [rows, ownNames, accountUse, gate, circRows, profile, rental, vatProfile] = await Promise.all([
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
    // 🔴 THE ONE FACT EVERY VAT WORD ON THIS SCREEN HANGS OFF. Most of this audience is not VAT
    // registered and never will be, and a VAT row on the screen a man opens to clear his pile is
    // pure noise to him. It teaches him that some of this page is not for him, and then he stops
    // reading the part that is. Doc 103's empty test, applied to a whole feature.
    //
    // ⚠️ null MEANS THE READ FAILED, which is not "he is registered", so it draws nothing. Losing
    // a VAT question for one page load costs him a refresh. Drawing one for a man who has no
    // input tax to reclaim costs him his trust in the screen.
    readVatProfile(user.id).catch(() => null),
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

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A PHOTOGRAPH'S AMOUNT AND A BANK LINE'S AMOUNT ARE NOT THE SAME KIND OF THING.
  // RUN 2, 12 August 2026. See MACHINE_READ_SOURCES in lib/reviewpile.ts for the £110.55.
  //
  // buildPile keeps them in separate groups now, so this screen can say what each list actually
  // is. The confident list splits in two: what the bank told us, and what a machine read off
  // paper. Both still file in one press, because the founder quit at two files out of eight when
  // this product made him work one at a time and that finding stands.
  //
  // ⚠️ THE SPLIT IS THE POINT, NOT THE SLOWDOWN. What can no longer happen is a press about a
  // shop's CATEGORY silently confirming a machine's guess at an AMOUNT nobody has ever seen.
  const knownGiven = known.filter((g) => !g.readFromPhoto);
  // 🔴 AND THE READINGS SPLIT AGAIN, ON WHETHER WE COULD ACTUALLY READ THEM. R2, 13 August 2026.
  //
  // The list below already separates a photograph's amount from a bank line's. It did not separate
  // a photograph we read perfectly from one the machine itself said it struggled with, so a florist
  // with eight Porters receipts in one upload files the faded one with a press about the other
  // seven. That is the same collision R2-F3 fixed one level up, one level down.
  const knownRead = known.filter((g) => g.readFromPhoto && !g.uncertainAmount);
  const knownUnsure = known.filter((g) => g.readFromPhoto && g.uncertainAmount);

  const givenRows = knownGiven.reduce((n, g) => n + g.count, 0);
  const readRows = knownRead.reduce((n, g) => n + g.count, 0);
  const unsureRows = knownUnsure.reduce((n, g) => n + g.count, 0);
  const incomeRows = income.reduce((n, g) => n + g.count, 0);

  const vatRegistered = vatProfile !== null && vatProfile.registered;

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE VAT WE HAVE READ, AND HE HAS NOT AGREED.
  //
  // lib/claude.ts now pulls the VAT off a receipt photograph and /api/money/receipt writes it to
  // vat_amount with vat_confirmed left false. That is a machine's reading of a crumpled bit of
  // paper. A total read wrong shows up the moment he looks at his own money; a VAT figure read
  // wrong one time in seven goes quietly into a reclaim he has to stand behind at an inspection.
  // So it waits here, with the figure printed, until he has looked at it and said yes.
  //
  // ⚠️ AND IT IS ASKED BEFORE THE FILING QUESTIONS, not after, because a row that has been filed
  // leaves the pile and takes its unanswered VAT question with it.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const vatWaiting = vatRegistered ? vatToCheck(rows) : [];

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT A CONTRACTOR TOOK OFF BEFORE THE MONEY REACHED HIS BANK.
  //
  // Walked live as a groundworker on 11 August 2026: 401 imported rows, 62 of them contractor
  // payments totalling £34,400, and that £34,400 was NET. £4,400 and £2,800 had already gone to
  // HMRC across two tax years, and every one of those rows was filed as income at its bank value
  // after this screen asked the only question it had, which is whose money it is. His turnover was
  // understated by exactly the tax taken, and the tax already paid for him was nowhere.
  //
  // ⚠️ NOTHING NEW IS DRAWN FOR ANYBODY ELSE. cisToAsk returns an empty list unless he has told us
  // in so many words that contractors take CIS off him, and a failed read of his answers is not a
  // yes, so this whole section is absent from the screen of every man who is not in the scheme.
  // The rest of his pile is exactly the pile it was.
  //
  // ⚠️ AND IT IS ASKED ABOVE THE MONEY IN BUTTONS, for the same reason the VAT question is asked
  // above the filing ones: a row he files leaves the pile and takes its unanswered question with it.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const cisWaiting = cisToAsk(rows, worksUnderCis(circRows));

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE HEADLINE COUNTS WHAT IS ACTUALLY ON THE SCREEN. 12 August 2026.
  //
  // waitingCount took four partitions and the pile has drawn SIX kinds of question since the CIS
  // capture landed: the VAT confirm arrived on 1 August, the CIS one on 11 August, and neither was
  // ever added. So a subcontractor read "4 questions waiting" over five of them, and a headline
  // that disagrees with the list beneath it teaches him to distrust both.
  //
  // ⚠️ COMPUTED HERE, AFTER BOTH LISTS EXIST, and not a line earlier. It sat above cisWaiting for
  // about a minute while this was written, which is a temporal dead zone crash on every pile in
  // the product, and exactly the kind of thing a page that renders on the server fails loudly on.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const decidable = waitingCount({ known, unknown, careful, income }, vatWaiting.length + cisWaiting.length);

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
            {/* 🔴 THE PROMISE IS ABOUT SHOPS, AND IT IS NOW ONLY MADE WHEN A SHOP IS ON THE SCREEN.
                R2-F6, 13 August 2026. A florist's three wedding customers collapsed into one asking
                group, so this sentence was promising to file "every future payment there the same
                way" about three different households. It is a true and good promise about PORTERS.
                It is an overreach about a person, who is usually one job. lib/personal.ts's
                looksLikePerson decides which, and app/api/pile/route.ts stops learning the rule. A
                sentence the code no longer honours is worse than no sentence. */}
            <p style={S.sub}>
              We have grouped them by who you paid.{' '}
              {groups.some((g) => !g.personLike)
                ? 'Answer once for a shop and we will file every future payment there the same way, without asking again.'
                : 'Answer once and we will file the lot.'}
              {groups.some((g) => g.personLike)
                ? ' Where you were paid by a person rather than a shop, we file what is here and learn nothing: the next one is somebody else.'
                : ''}
            </p>
            {income.length > 0 && (
              <p style={S.aside}>
                {incomeRows === 1 ? 'One of them is' : `${incomeRows} of them are`} money in rather
                than money out. Those are kept separate from your spending and asked on their own,
                at the bottom.
              </p>
            )}
          </section>

          {/* ── 0. THE VAT WE READ AND HE HAS NOT AGREED ─────────────────────────────────────
              🔴 ABOVE THE FILING QUESTIONS ON PURPOSE. A row he files leaves the pile, and its
              unanswered VAT question leaves with it, so this cannot sit at the bottom the way
              money in does. Drawn only for a VAT registered customer, and only for rows where a
              receipt actually printed a figure, so for almost everybody it is not on the page. */}
          {vatWaiting.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">
                {vatWaiting.length === 1 ? 'One receipt showed VAT' : `${vatWaiting.length} receipts showed VAT`}
              </h2>
              <p style={S.sub}>
                We read {vatWaiting.length === 1 ? 'it' : 'them'} off the photograph, and a
                photograph is our reading rather than your word. So nothing here counts towards
                what you claim back until you have looked at the figure and said it is right.
                Change it if we have read it wrong.
              </p>
              <ul style={S.lines}>
                {vatWaiting.map((v) => (
                  <li key={v.id} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{v.vendor}</span>
                      <span style={S.amount}>{gbp2(v.gross)}</span>
                    </div>
                    <p style={S.meta}>
                      We read the VAT on this one as <b style={S.cat}>{gbp2(v.read)}</b>.
                    </p>
                    <VatNote show category={v.category} text={v.text} />
                    <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                      <input type="hidden" name="ids" value={v.id} />
                      <input type="hidden" name="verdict" value="vat" />
                      <label htmlFor={`vat-${v.id}`} style={S.label}>The VAT on this receipt</label>
                      {/* A plain text box rather than a number one, so a man who types the pound
                          sign he can see on the paper is not silently refused by his browser. The
                          route strips it, checks the figure against his own row, and says so in
                          words if it does not fit. */}
                      <input
                        id={`vat-${v.id}`}
                        name="vat"
                        type="text"
                        inputMode="decimal"
                        defaultValue={v.read.toFixed(2)}
                        className="lek-field"
                        required
                      />
                      <button type="submit" className="lek-ghost">Yes, that is the VAT</button>
                    </form>
                  </li>
                ))}
              </ul>
              <p style={S.hint}>
                This is only about the VAT. The payment itself is still a question of its own, below.
              </p>
            </section>
          )}

          {/* ── 1. THE ONES WE KNOW ──────────────────────────────────────────────────────────
              No dropdown. A category he can read, and ONE button for the lot. Rendering a twenty
              four option select next to a merchant we already recognise is asking a question we
              have already answered, and doing it twenty times is what made this screen feel like
              work. He only needs the dropdown when he DISAGREES, which is what the row link is. */}
          {knownGiven.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">We recognise {knownGiven.length === 1 ? 'this one' : `these ${knownGiven.length}`}</h2>
              <p style={S.sub}>
                {givenRows === 1 ? 'One payment' : `${givenRows} payments`} from your bank, and we
                are confident about {knownGiven.length === 1 ? 'it' : 'them'}. Have a read, then
                file the lot in one go.
              </p>
              <ul style={S.lines}>
                {knownGiven.map((g) => (
                  <li key={g.key} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{g.vendor}</span>
                      <span style={S.amount}>{gbp2(g.total)}</span>
                    </div>
                    <p style={S.meta}>
                      {g.count === 1 ? 'One payment' : `${g.count} payments`}, filed as{' '}
                      <b style={S.cat}>{g.suggested}</b>.
                    </p>
                    {/* The reverse charge line lands HERE and nowhere else, because a
                        subcontractor is a merchant we settle ourselves, so his invoices are in
                        this list rather than in the questions below. It is the single most
                        common VAT mistake in this trade: his invoice charged no VAT, so there
                        is none to reclaim, and a man who assumes otherwise reclaims a fifth of
                        every subcontractor payment he makes. */}
                    <VatNote show={vatRegistered} category={g.suggested} text={g.vendor} />
                  </li>
                ))}
              </ul>
              {/* THE CLIENT SENDS NO IDS. The server rebuilds the pile and works out for itself
                  which groups it was confident about. See the comment in app/api/pile/route.ts:
                  this is the one tap that files many rows, so nothing about it trusts the browser. */}
              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="verdict" value="confirm_known" />
                <button type="submit" className="lek-primary">
                  Yes, file {knownGiven.length === 1 ? 'it' : `all ${givenRows}`}
                </button>
              </form>
              <p style={S.hint}>
                Anything you disagree with, sort it below after. Nothing here is final.
              </p>
            </section>
          )}

          {/* ── 1b. THE ONES WE READ OFF PAPER ───────────────────────────────────────────────
              ═══════════════════════════════════════════════════════════════════════════════
              🔴 ITS OWN LIST, ITS OWN PRESS, AND ITS OWN SENTENCE. RUN 2, 12 August 2026.

              These amounts were read off photographs by a machine. The bank's figures are facts;
              these are readings, and one of them on this run was a faded receipt read confidently
              as £110.55 where the paper says £118.55.

              It used to sit in the same list as the bank rows for the same shop, so a press about
              a SHOP'S CATEGORY also confirmed a machine's guess at an AMOUNT. Two promises
              collided ("answer once for a shop", "nothing counts until you have said it is
              right") and the wrong one won.

              ⚠️ STILL ONE PRESS. The founder quit at two files out of eight when this product
              made him work one at a time, and that finding stands. What changed is that the list
              says what it is, prints the amount it read, and is filed by a press of its own.
              ═══════════════════════════════════════════════════════════════════════════════ */}
          {knownRead.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">
                {readRows === 1 ? 'One I read off a photograph' : `${readRows} I read off your photographs`}
              </h2>
              <p style={S.sub}>
                The shop and the total here are what I read off the paper, not what your bank told
                me. Have a look at the figures, then file them in one go.
              </p>
              <ul style={S.lines}>
                {knownRead.map((g) => (
                  <li key={g.key} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{g.vendor}</span>
                      <span style={S.amount}>{gbp2(g.total)}</span>
                    </div>
                    <p style={S.meta}>
                      {g.count === 1 ? 'One receipt' : `${g.count} receipts`}, filed as{' '}
                      <b style={S.cat}>{g.suggested}</b>.
                    </p>
                    <VatNote show={vatRegistered} category={g.suggested} text={g.vendor} />
                  </li>
                ))}
              </ul>
              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="verdict" value="confirm_read" />
                <button type="submit" className="lek-primary">
                  Yes, file {knownRead.length === 1 ? 'it' : `all ${readRows}`}
                </button>
              </form>
              <p style={S.hint}>
                If a total looks wrong, sort that one below. A photograph is a reading, so it is
                worth a glance.
              </p>
            </section>
          )}

          {/* ── 1c. THE ONES WE STRUGGLED TO READ ────────────────────────────────────────────
              ═══════════════════════════════════════════════════════════════════════════════
              🔴 THE OTHER HALF OF THE £110.55. RUN 2, 13 August 2026.

              R2-F3, above, stopped a machine's reading being confirmed by a press about a BANK
              ROW. It did not stop it being confirmed by a press about ANOTHER READING, and eight
              receipts from one shop in one upload is exactly that shape. It also did nothing at
              all about the reading being wrong, which the report said twice was the most
              important thing not done.

              The model is now asked, about every receipt, whether it could actually SEE the
              total: whether every digit was crisply legible or whether the paper was faded,
              creased, cut off or ambiguous. When it says it struggled, the row lands here.

              ⚠️ THIS IS NOT A REFUSAL AND IT IS NOT AN APOLOGY. The figure is still shown, still
              filed in one press, and he is never asked to retype it. What changes is that the
              press is about THESE amounts and the sentence tells him which number to glance at
              on paper he still has in his van.

              ⚠️ AND IT NEVER BLAMES HIS PHOTOGRAPH. "A clearer photograph usually does it" was
              what this product said to a florist twice about a perfectly printed till roll, when
              the fault was our own token ceiling. Some receipts are faded because they are
              receipts.
              ═══════════════════════════════════════════════════════════════════════════════ */}
          {knownUnsure.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">{UNCERTAIN_SECTION_TITLE}</h2>
              <p style={S.sub}>{UNCERTAIN_SECTION_NOTE}</p>
              <ul style={S.lines}>
                {knownUnsure.map((g) => (
                  <li key={g.key} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{g.vendor}</span>
                      <span style={S.amount}>{gbp2(g.total)}</span>
                    </div>
                    <p style={S.meta}>
                      {g.count === 1 ? 'One receipt' : `${g.count} receipts`}, filed as{' '}
                      <b style={S.cat}>{g.suggested}</b>.
                    </p>
                    <p style={S.meta}>{uncertainAmountLine(gbp2(g.total))}</p>
                    <VatNote show={vatRegistered} category={g.suggested} text={g.vendor} />
                  </li>
                ))}
              </ul>
              <form action="/api/pile" method="post" hidden={locked} style={S.form}>
                <input type="hidden" name="verdict" value="confirm_unsure" />
                <button type="submit" className="lek-primary">
                  {knownUnsure.length === 1
                    ? 'That figure is right, file it'
                    : `Those figures are right, file all ${unsureRows}`}
                </button>
              </form>
              <p style={S.hint}>
                If one of them is wrong, sort that one below instead and put the real figure in.
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
                <span style={S.amount}>{gbp2(g.total)}</span>
              </div>
              <p style={S.meta}>{g.count === 1 ? 'One payment' : `${g.count} payments`}.</p>
              <p style={S.reason}>{looksPersonal(g.vendor, null, ownNames, g.kind === 'income' ? g.total : -g.total)?.why ?? g.reason}</p>
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
                <span style={S.amount}>{gbp2(g.total)}</span>
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
              {/* Insurance carries no VAT to reclaim, a car is blocked and a van is not, fuel
                  depends on private use. One sentence, from lib/vat.ts, on the groups where
                  there is something true to say and silent on the rest. */}
              <VatNote show={vatRegistered} category={g.suggested} text={g.vendor} />

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
                  {/* ⚠️ THE LIST GROWS BY FOUR ONLY FOR SOMEBODY WHO LETS SOMETHING. A plumber in
                      a van has no property, so four extra rows are four decisions he reads past to
                      reach the one he wants (doc 103). The same `rental` gate the rent button uses,
                      so the two halves of the property story appear together or not at all. */}
                  {categoriesFor(CATEGORIES, rental).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* ═══════════════════════════════════════════════════════════════════════════
                    🔴 THE ONE QUESTION THAT WAS WORTH £52,000 AND WAS NOT BEING ASKED.
                    AUDI LEEDS, £60,000, one line on a real Monzo export. It went through this
                    exact form, was filed under a category, and came off his profit in full.
                    GOV.UK: "Cars do not qualify for: annual investment allowance (AIA)."
                    Year one on that car is about £3,600, not £60,000.
                    ⚠️ ONE PAYMENT, OVER £1,000, AND DEFAULTED TO "Not a car". lib/capital.ts
                    shouldAskCapital() owns both halves of that and the reason for each. On the
                    ten or twenty rows a year it draws on, the man whose £1,400 was a materials
                    order presses the button he was pressing anyway and nothing changes for him.
                    ⚠️ AND ANSWERING "a car" DOES NOT FILE IT. /api/pile sends him to
                    /app/pile/car, because the business use share is CAA 2001 s205 and assuming
                    100% would be the same over claim in a quieter voice. ══════════════════ */}
                {shouldAskCapital(g.total, g.count) && (
                  <>
                    <label htmlFor={`cap-${g.key}`} style={S.capLabel}>{capitalQuestion()}</label>
                    <select id={`cap-${g.key}`} name="capital_kind" defaultValue="not_a_car" className="lek-select">
                      {capitalOptions().map((o) => (
                        <option key={o.kind} value={o.kind}>{o.label}</option>
                      ))}
                    </select>
                    <p style={S.meta}>{capitalWhy()}</p>
                  </>
                )}

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
              {/* Drawn only for a man who has told us contractors take CIS off him, and only while
                  there is actually something to ask about, so it can never become a line that says
                  nothing on most visits. */}
              {cisWaiting.length > 0 && (
                <p style={S.aside}>
                  You told us the firms you work for take CIS off you first. What your bank shows is
                  what was left after that, so the payments below are asked about one at a time. What
                  they took is tax you have already paid, and it only counts once you tell us.
                </p>
              )}
            </section>
          )}

          {/* ── 4a. WHAT WAS TAKEN OFF BEFORE HE WAS PAID ────────────────────────────────────
              🔴 THE ARITHMETIC IS PRINTED AND THE BOX IS EMPTY, AND THAT IS THE WHOLE DESIGN.
              Danny, the customer section 6 of test/moneyspine.test.mjs is built on, turned over
              £25,400 and had £4,400 taken, which is 17.3 percent and not 20, because £3,400 of it
              was materials and materials come out before the deduction is worked out. Filling the
              box in for him would have put £850 of turnover he never earned into his return on a
              press he did not read. lib/control.ts: never take a number without a receipt for
              anything going to HMRC. So we do the sum, show it, and let him type.
              ⚠️ THE THREE RATES COME FROM lib/reviewpile.ts AND ARE NEVER RESTATED HERE. There are
              three of them, and a screen that says "20 percent" flattens a man on 30 percent and a
              man with gross payment status into a figure that is not his. */}
          {cisWaiting.length > 0 && (
            <section className="lek-card">
              <h2 className="lek-h2">
                {cisWaiting.length === 1
                  ? 'What was taken off this one'
                  : `What was taken off these ${cisWaiting.length}`}
              </h2>
              <p style={S.sub}>{CIS_RATES}</p>
              <ul style={S.lines}>
                {cisWaiting.map((c) => (
                  <li key={c.id} style={S.line}>
                    <div style={S.rowTop}>
                      <span style={S.vendor}>{c.vendor}</span>
                      <span style={S.amount}>{gbp2(c.proposal.net)}</span>
                    </div>
                    <p style={S.meta}>
                      That is what reached your bank. If it was labour only and you are
                      registered, <b style={S.cat}>{gbp2(c.proposal.deduction)}</b> was taken
                      and the job was <b style={S.cat}>{gbp2(c.proposal.gross)}</b> before it.
                    </p>
                    <p style={S.meta}>{c.proposal.assumes}</p>
                    <form action="/api/pile" method="post" hidden={locked} style={S.formTight}>
                      <input type="hidden" name="ids" value={c.id} />
                      <input type="hidden" name="verdict" value="cis" />
                      <label htmlFor={`cis-${c.id}`} style={S.label}>What they took off this one</label>
                      {/* Empty, never filled in. A figure we put there is a figure he agrees to
                          without reading it, and on a job with materials it is the wrong one. A
                          plain text box rather than a number one, so the pound sign he can see on
                          his statement is not silently refused by his browser. */}
                      <input
                        id={`cis-${c.id}`}
                        name="cis"
                        type="text"
                        inputMode="decimal"
                        className="lek-field"
                        required
                      />
                      <button type="submit" className="lek-ghost">That is what they took</button>
                    </form>
                  </li>
                ))}
              </ul>
              <p style={S.hint}>
                If nothing was taken off one of these, leave it here and file it as money in below.
              </p>
            </section>
          )}
          {income.map((g) => (
            <section key={g.key} className="lek-card">
              <div style={S.rowTop}>
                <span style={S.vendor}>{g.vendor}</span>
                <span style={S.amount}>{gbp2(g.total)}</span>
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
  // The VAT box. Same 16px pin as the select above, and for the same iOS Safari reason.
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};font-variant-numeric:tabular-nums}`,
  `input:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
  // On a desk a decision is a button sized to its words, not a bar the width of the monitor. A
  // full width press target earns its keep under a thumb and loses it under a mouse.
  `@media(min-width:${BREAK.desk}px){
    .lek-queue{max-width:760px;margin:0 auto}
    .lek-title{font-size:${TYPE.stat}px}
    .lek-primary,.lek-quiet,.lek-ghost{width:auto;min-width:264px}
    .lek-select,.lek-field{max-width:420px}
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
  // The input tax line. Quieter than a reason and louder than the meta, because it is a fact
  // about the rules rather than a question or a refusal.
  vatNote: { fontSize: TYPE.note, lineHeight: 1.55, color: INK, margin: '8px 0 0' },
  // The car question sits under the category select inside the same form, so it needs the top
  // margin the first label does not.
  capLabel: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '14px 0 6px' },
  form: { margin: '14px 0 0' },
  formTight: { margin: '10px 0 0' },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, marginBottom: 6 },
  cat: { color: RIVER_DEEP },
  lines: { listStyle: 'none', margin: '14px 0 0', padding: 0 },
  line: { borderTop: `1px solid ${LINE}`, padding: '12px 0 0', marginTop: 12 },
  hint: { fontSize: TYPE.label, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: '10px 0 0' },
};
