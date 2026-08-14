import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  readIdentityCard, getBusinessProfile, readCircumstances, readSignupCompany, readVatProfile,
  listDiaryJobs,
  type SignupCompany, type VatProfileRow,
} from '../../../lib/supabase';
import {
  normaliseDiaryRow, splitDiary, weekStrip, jobsOnDay, whenPhrase, durationPhrase,
} from '../../../lib/diary';
import { formatVrn } from '../../../lib/vat';
import { registrationLine } from '../../../lib/companieshouse';
import {
  household, notHousehold, mtdQuestions, progressIn, type IncomeShape,
} from '../../../lib/circumstances';
import { A11Y_CSS, APP_CSS, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
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
// 🔴 THE CONTACT POINTS MOVED TO SETTINGS ON 14 AUGUST 2026, AND THIS PARAGRAPH USED TO SAY THE
// OPPOSITE. The email, masked, and the add flow now live on /app/you/settings, because an address
// a man sets once in his life was costing every customer a card at the top of the screen he opens
// to see his diary. The 29 July takeover fix did not move with it: the send and the bind still
// live in /api/you/email, the address still rides a signed cookie between the two steps, and every
// sentence about it is still a fixed string in ./identity.ts that structurally cannot carry
// another man's details. What changed is which page draws the form and where the route lands.
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
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fyou');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const [card, profile, rows, company, vatProfile, diaryRows] = await Promise.all([
    readIdentityCard(user.id),
    getBusinessProfile(user.id).catch(() => null),
    readCircumstances(user.id),
    // What the signup lookup recorded about his company, read from the signups row itself so this
    // page cannot assert a registration the lookup never found. Null on any failure, which makes
    // the sentence LESS assertive, never more.
    readSignupCompany(user.id).catch(() => null),
    // His VAT position. Null is an unreadable read, never "not registered", so vatLine falls back
    // to the logged answer rather than telling a registered man his invoices carry no VAT.
    readVatProfile(user.id).catch(() => null),
    // His diary, which is the hero of this page. null is a failed read and is said plainly
    // rather than drawn as an empty week he did not empty.
    listDiaryJobs(user.id).catch(() => null),
  ]);

  // ⚠️ EVERY DIARY DECISION IS MADE IN lib/diary.ts, ON FIXTURES A TEST CAN ATTACK. Which day a
  // job belongs to, what the seven cells are, which jobs are still coming: none of it is worked
  // out on this page. The page reads rows and draws what comes back, which is the same contract
  // /app/diary keeps.
  const now = new Date();
  const diaryRead = diaryRows !== null;
  const jobs = diaryRead
    ? diaryRows.map(normaliseDiaryRow).filter((j): j is NonNullable<typeof j> => j !== null)
    : [];
  const week = weekStrip(jobs, now);
  const today = jobsOnDay(jobs, week[0]?.day ?? '');
  const { upcoming, awaiting } = splitDiary(jobs, now);
  // The Jobs tab shows what is still live: what is coming and what has wrapped up and is waiting
  // on an invoice. Invoiced history stays on /app/diary, because a hub that carried his whole
  // back catalogue would be a hub he has to scroll past to reach today.
  const tab = one('tab') === 'jobs' ? 'jobs' : 'diary';

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

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          THE DIARY, AS THE HERO OF THIS PAGE. Jag's own layout call, 13 August 2026.

          🔴 WHAT CAME OUT TO MAKE ROOM, because doc 103 says that question gets answered rather
          than dodged. Two things. "How we reach you" was a whole card on this screen for an
          address he sets once in his life and a phone he binds once: it has moved into Settings,
          which is one tap away and outside the folds. And nine doors that were nine equal rows
          are now two folds and one row, so the thing he opens this page to see is at the top
          rather than tenth.

          ⚠️ IT IS A SUMMARY AND NOT A SECOND DIARY. Seven cells, today's jobs, and a way in.
          Every write, every photograph and every figure lives on /app/diary, because two screens
          that both let him change a booking are two screens that disagree about one the moment
          one of them is edited.

          ⚠️ THE TABS ARE A QUERY PARAMETER, not a script. Every screen under app/app is server
          rendered with no client JavaScript, so a tab is a link that reloads the page. It costs
          a round trip and it means the back button does what he expects.
          ═════════════════════════════════════════════════════════════════════════════════════ */}
      <section className="lek-card">
        <div style={S.tabs}>
          <a href="/app/you" style={tab === 'diary' ? S.tabOn : S.tab} className="lek-hit">Diary</a>
          <a href="/app/you?tab=jobs" style={tab === 'jobs' ? S.tabOn : S.tab} className="lek-hit">Jobs</a>
        </div>

        {!diaryRead ? (
          <p style={S.warn}>
            We could not read your diary just this minute. Nothing is lost. Give it a moment and
            reload.
          </p>
        ) : tab === 'diary' ? (
          <>
            {/* ── THE WEEK. Seven cells starting today, so every one of them is a day he can
                still do something about. A day with nothing on it carries no count at all:
                a row of zeroes is seven pieces of nothing to read and dismiss. ─────────────── */}
            <ol style={S.week}>
              {week.map((c) => (
                <li key={c.day} style={c.isToday ? S.cellNow : S.cell}>
                  <span style={S.cellDay}>{c.letter}</span>
                  <span style={S.cellDate}>{c.date}</span>
                  {c.count > 0 ? <span style={S.dot} aria-label={`${c.count} booked`} /> : null}
                </li>
              ))}
            </ol>

            <h2 className="lek-h2">Today</h2>
            {today.length === 0 ? (
              <p style={S.rowBody}>
                Nothing booked today.{upcoming.length > 0
                  ? ` Next is ${upcoming[0].title}, ${whenPhrase(upcoming[0].startsAt, now)}.`
                  : ''}
              </p>
            ) : (
              <ul style={S.jobs}>
                {today.map((j) => (
                  <li key={j.id} style={S.job}>
                    <a href={`/app/diary?job=${encodeURIComponent(j.id)}`} style={S.jobLink} className="lek-hit">
                      <span style={S.jobTitle}>{j.title}</span>
                      <span style={S.rowBody}>
                        {whenPhrase(j.startsAt, now)}, {durationPhrase(j.startsAt, j.endsAt)}
                        {j.customerName ? `, for ${j.customerName}` : ''}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <h2 className="lek-h2">Coming up</h2>
            {upcoming.length === 0 ? (
              <p style={S.rowBody}>Nothing booked yet.</p>
            ) : (
              <ul style={S.jobs}>
                {upcoming.slice(0, 5).map((j) => (
                  <li key={j.id} style={S.job}>
                    <a href={`/app/diary?job=${encodeURIComponent(j.id)}`} style={S.jobLink} className="lek-hit">
                      <span style={S.jobTitle}>{j.title}</span>
                      <span style={S.rowBody}>
                        {whenPhrase(j.startsAt, now)}, {durationPhrase(j.startsAt, j.endsAt)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {/* ⚠️ SHOWN WHEN THERE IS SOMETHING IN IT AND HIDDEN WHEN THERE IS NOT, which is
                doc 103's empty test. Every one of these is work he has finished and not yet
                asked to be paid for, which is the only heading on this page worth interrupting
                him for. A permanent "nothing waiting" row would teach him to stop looking. */}
            {awaiting.length > 0 ? (
              <>
                <h2 className="lek-h2">Wrapped up, not invoiced</h2>
                <ul style={S.jobs}>
                  {awaiting.slice(0, 5).map((j) => (
                    <li key={j.id} style={S.job}>
                      <a href={`/app/diary?job=${encodeURIComponent(j.id)}`} style={S.jobLink} className="lek-hit">
                        <span style={S.jobTitle}>{j.title}</span>
                        <span style={S.rowBody}>one press from an invoice</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}

        <a href="/app/diary" style={S.add} className="lek-hit">Put a job in</a>
      </section>

      {/* ── THE DOORS DOWN, FOLDED. Each answers one question well; this page repeats none of
          them, and since 14 August it does not print all nine at once either.

          ⚠️ A FOLD IS A COST AND IT IS PAID HERE ON PURPOSE. Doc 103 says folding a section is
          exactly how a claim stops being checked, which is why the CIRCUMSTANCES COUNT IS PRINTED
          ON THE CLOSED SUMMARY rather than hidden behind it: the one thing in here that is worth
          interrupting him for is money or standing he cannot get until he answers, and that stays
          visible with the fold shut. Everything else in these two groups is a door he opens when
          he has a reason, and nine equal rows above his diary was nine things to read and reject
          before reaching what he came for.

          ⚠️ <details> AND NOT A SCRIPT. Every screen under app/app is server rendered with no
          client JavaScript, and the browser has had this element for a decade. ─────────────── */}
      <details className="lek-card lek-fold" style={S.fold}>
        <summary className="lek-fold-top" style={S.foldTop}>
          <span style={S.foldLabel}>Yours to change</span>
          {asked && asked.askable - asked.answered > 0 ? (
            <span style={S.foldCount}>
              {asked.askable - asked.answered} still worth answering
            </span>
          ) : null}
        </summary>
        <div style={S.doors}>
          <a href="/app/you/circumstances" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Your circumstances</span>
            <span style={S.rowBody}>
              {asked
                ? `${asked.answered} answered, ${asked.askable - asked.answered} still worth answering. Each open one is money or standing we cannot get you until you tell us.`
                : 'What you have told us about yourself, and the questions still waiting.'}
            </span>
          </a>
          {/* ⚠️ IT LIVES HERE RATHER THAN IN THE NAV, and that is doc 103's once test doing its job.
              An election is a choice a man makes at most once a tax year. A permanent rail row for
              it would cost every customer a line to read and reject on every screen, for ever, to
              save two of them one tap in April. The circumstances question above is what sends him
              here in the first place. */}
          <a href="/app/you/elections" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Allowances</span>
            <span style={S.rowBody}>
              Working from home, and the flat trading allowance. The two we cannot decide for you,
              because the answer is something only you know.
            </span>
          </a>
          {/* Not /account, which needs an SMS code a web account cannot get. This door rides the
              session he is already in. */}
          <a href="/app/you/billing" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Billing</span>
            <span style={S.rowBody}>Your card, your invoices from us, and cancelling.</span>
          </a>
          {/* ⚠️ IT IS ON THIS SHELF AND NOT INSIDE SETTINGS, and the Settings row above is why:
              every switch on that page is a promise that a message exists behind it, and it holds
              the line at two rows. A review is not a switch, it is something only he can say, which
              puts it beside his circumstances and his allowances. And the row promises nothing
              about publishing, because the page behind it cannot publish and says so in its first
              paragraph: a door that oversold what was through it would be the thing that made him
              feel tricked, on the one screen where he is doing us a favour. */}
          <a href="/app/you/testimonial" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Your review</span>
            <span style={S.rowBody}>
              If Lekhio has been worth having, say so in your own words. Yours to take back whenever
              you like, and nothing goes on our site until we publish it.
            </span>
          </a>
        </div>
      </details>

      {/* ── SETTINGS, OUTSIDE THE FOLDS, ALWAYS ONE TAP. Jag's own call, and the argument is that
          it is the only door here a man is SENT to rather than one he goes looking for: a message
          arrives, he wants it to stop, and hunting for the off switch inside a closed drop down is
          the moment he stops believing there is one. It also now holds how we reach him, which is
          the other thing he arrives at this page already looking for. ────────────────────────── */}
      <a href="/app/you/settings" style={S.settings} className="lek-hit">
        <span style={S.doorLabel}>Settings</span>
        <span style={S.rowBody}>
          What Lekhio sends you without being asked and how to stop it, your email, and your
          connected phone.
        </span>
      </a>

      {/* ── YOURS. The documents and doors that are his rather than about him: invoices, the
          diary they are raised from, and the two papers he hands to somebody else. These rows
          came off the old sidebar when the shell became the bottom bar, and this hub is their
          home now, in the same shape as the rows above so the page reads as one system. ──────── */}
      <details className="lek-card lek-fold" style={S.fold}>
        <summary className="lek-fold-top" style={S.foldTop}>
          <span style={S.foldLabel}>Yours</span>
        </summary>
        <div style={S.doors}>
          <a href="/app/invoices" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Every invoice</span>
            <span style={S.rowBody}>Who owes you, what is late, and the door to raising a new one.</span>
          </a>
          <a href="/app/diary" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Jobs diary</span>
            <span style={S.rowBody}>What is booked, and one press to invoice it.</span>
          </a>
          <a href="/app/proof-of-income" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Proof of income</span>
            <span style={S.rowBody}>The summary a landlord or lender asks for.</span>
          </a>
          <a href="/app/share-books" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Share your books</span>
            <span style={S.rowBody}>A read only link you can take back whenever you like.</span>
          </a>
          {/* ⚠️ ONE QUIET ROW, AT THE BOTTOM, AND THAT IS THE WHOLE PLACEMENT ARGUMENT.
              Doc 103's once test: a man takes a copy of his data perhaps twice in his life and
              deletes his account exactly once. A louder treatment would put leaving in front of
              every customer who never intends to, on the screen where he came to fix his trade or
              his email, and a row shaped like a warning would read as us bracing for it.

              🔴 IT IS HERE BECAUSE ON 11 AUGUST 2026 IT WAS NOWHERE. A customer asked the chat to
              delete all his data, then looked for the door on every screen we have. There was
              none. /api/account/delete and /api/account/export both worked, both were exempt from
              the paywall on purpose (lib/gate.ts: "HIS RIGHT TO LEAVE"), and a grep for
              `api/account` across the whole repo found lib/gate.ts and two test files. Nothing
              linked to either. The hub listed nine doors and neither of these was among them.

              ⚠️ IT IS IN "Yours" RATHER THAN "Yours to change", and the section header is the
              reason: the rows above are doors that are HIS rather than about him, his invoices
              and his diary and the two papers he hands somebody else. His data is the oldest
              thing on that list and the only one with a law behind it.

              ⚠️ WHAT CAME OUT TO MAKE ROOM. Nothing on this screen, and that is answered rather
              than dodged: what this row removes is a support email and a wait. /privacy told him
              to write to info@lekhio.app to use either right, so a rights request cost him a
              message and cost us somebody running an erasure by hand. */}
          <a href="/app/you/data" style={S.door} className="lek-hit">
            <span style={S.doorLabel}>Your data</span>
            <span style={S.rowBody}>
              Take a copy of everything we hold, or tell us to delete it.
            </span>
          </a>
        </div>
      </details>

      {/* ── SIGNING OUT, AS A ROW ON THE PROFILE. It lived on the old sidebar, and a door that
          disappears with a redesign is a door a man rattles. Still a form and never a link: a GET
          that ends a session is a session any other site can end for him with an image tag. ──── */}
      <form action="/api/auth/signout" method="post" style={S.outForm}>
        <button type="submit" style={S.outBtn} className="lek-hit">Sign out</button>
      </form>

    </main>
  );
}

// The column, the card and the desk composition come whole from APP_CSS. Declared here is only
// what this screen alone owns.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE TWO FOLDS HAD NO DISCLOSURE MARKER AT ALL, AND NINE DOORS READ AS TWO EMPTY CARDS.
  // Run 6, 14 August 2026, found by a customer walking this page for the first time.
  //
  // A <summary> is display:list-item by default, and THAT is what generates the ::marker box the
  // browser paints the disclosure triangle into. S.foldTop sets display:flex, which removes the
  // box. Read live off production that morning:
  //
  //   { label: "Yours to change", summaryDisplay: "flex",
  //     listStyleType: "disclosure-closed", after: "none", before: "none", cls: "(none)" }
  //
  // The computed list-style-type is STILL disclosure-closed, so the browser still wants a triangle
  // and has nowhere to put it. And the element carried NO class, so no stylesheet could reach it
  // to draw a replacement.
  //
  // Behind those two headings: circumstances, allowances, billing, the review, every invoice, the
  // jobs diary, proof of income, share books, and the whole data rights lane. A customer who
  // cannot find /app/you/data cannot exercise a right this product promises "neither one needs our
  // permission".
  //
  // ⚠️ AND THE PATTERN ALREADY EXISTED, TWICE, IN THIS CODEBASE. app/app/tax/page.tsx kills the
  // native marker and draws its own chevron with ::after, and AppNav.tsx carries the warning in as
  // many words: "and ::-webkit-details-marker, and none of those exist in a React style object."
  // The rule was known, written down and correct. It was simply never pointed at this page.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  `.lek-fold-top{list-style:none}`,
  `.lek-fold-top::-webkit-details-marker{display:none}`,
  `.lek-fold-top::after{content:'';flex:none;margin-left:auto;align-self:center;width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.55;transition:transform ${MOTION.enter} ${MOTION.ease}}`,
  `.lek-fold[open]>.lek-fold-top::after{transform:rotate(-135deg) translateY(2px)}`,
  `@media(prefers-reduced-motion:reduce){.lek-fold-top::after{transition:none}}`,
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

  // ── The diary hero, added 14 August 2026 ───────────────────────────────────────────────────
  tabs: { display: 'flex', gap: SPACE.xs, marginBottom: SPACE.sm },
  tab: { textDecoration: 'none', fontSize: TYPE.note, fontWeight: 800, color: MUTED, background: SURFACE, borderRadius: RADIUS.pill, padding: '8px 16px' },
  tabOn: { textDecoration: 'none', fontSize: TYPE.note, fontWeight: 800, color: ON_RIVER, background: RIVER, borderRadius: RADIUS.pill, padding: '8px 16px' },

  // Seven cells and nothing else. A day with no jobs draws no dot, because a row of empty
  // markers is seven pieces of nothing to read past.
  week: { listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, margin: `0 0 ${SPACE.md}px`, padding: 0 },
  cell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0', borderRadius: RADIUS.sm, background: SURFACE },
  cellNow: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0', borderRadius: RADIUS.sm, background: RIVER, color: ON_RIVER },
  cellDay: { fontSize: TYPE.label, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' },
  cellDate: { fontSize: TYPE.body, fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
  dot: { display: 'block', width: 5, height: 5, borderRadius: 999, background: 'currentColor' },

  jobs: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: SPACE.xs },
  job: { margin: 0 },
  jobLink: { display: 'block', textDecoration: 'none', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px' },
  jobTitle: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP, marginBottom: 3 },
  add: { display: 'inline-block', marginTop: SPACE.sm, textDecoration: 'none', fontSize: TYPE.note, fontWeight: 800, color: RIVER, background: SURFACE, borderRadius: RADIUS.pill, padding: '10px 18px' },

  // ── The two folds, and the one row that is never folded ────────────────────────────────────
  fold: { marginBottom: SPACE.md },
  foldTop: { cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: SPACE.xs, flexWrap: 'wrap' },
  foldLabel: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', color: INK },
  // ⚠️ PRINTED ON THE CLOSED SUMMARY ON PURPOSE. Doc 103: folding a section is exactly how a claim
  // stops being checked, so the one item in there that is money or standing he cannot get until he
  // answers stays visible with the fold shut. It shows NOTHING when there is nothing owed, because
  // a count we cannot justify is a red dot that teaches him to ignore red dots.
  foldCount: { fontSize: TYPE.note, fontWeight: 700, color: RIVER_DEEP },

  settings: { display: 'block', textDecoration: 'none', background: PANEL, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '14px', marginBottom: SPACE.md },

  doors: { display: 'grid', gridTemplateColumns: '1fr', gap: SPACE.xs },
  door: { display: 'block', textDecoration: 'none', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px' },
  doorLabel: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP, marginBottom: 3 },
  rowBody: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },

  // Signing out, shaped like the rows above it so the page stays one system, and quiet rather
  // than red: leaving is not a warning.
  outForm: { margin: `0 0 ${SPACE.md}px` },
  outBtn: { display: 'block', width: '100%', textAlign: 'left', background: PANEL, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '14px', fontSize: TYPE.body, fontWeight: 800, fontFamily: FONT, color: MUTED, cursor: 'pointer' },
};
