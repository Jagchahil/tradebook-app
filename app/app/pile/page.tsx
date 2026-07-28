import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { pileEntries, readOwnNames, readAccountUse } from '../../../lib/supabase';
import { buildPile, summarisePile, partitionPile } from '../../../lib/reviewpile';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES, categoriseBankLine } from '../../../lib/categories';
import { gbp0 } from '../../../lib/money';
import { A11Y_CSS, FONT, INK, LINE, MUTED, PAPER, RADIUS, RIVER, RIVER_DEEP, SAFFRON_TINT, SURFACE } from '../../../lib/tokens';

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

  const [rows, ownNames, accountUse] = await Promise.all([
    pileEntries(user.id), readOwnNames(user.id), readAccountUse(user.id),
  ]);
  const groups = buildPile(rows, normaliseVendor, ownNames, categoriseBankLine);
  const summary = summarisePile(groups);

  // THREE PILES, from lib/reviewpile.ts. Money in is never bundled with the spending and
  // confirm_pile refuses it outright, so it is counted in one honest line rather than listed as rows
  // he cannot act on, which would fail doc 103's empty test on every visit.
  const { known, unknown, careful, income } = partitionPile(groups, accountUse);
  const decidable = known.length + unknown.length + careful.length;
  const knownRows = known.reduce((n, g) => n + g.count, 0);

  return (
    <main style={S.wrap}>
      <style>{CSS}</style>

      <header style={S.head}>
        <a href="/app" style={S.logo}>Lekhio</a>
        <a href="/app" style={S.back}>Your money</a>
      </header>

      {note && <p style={S.note}>{note}</p>}

      {decidable === 0 ? (
        <section style={S.card}>
          <h1 style={S.h1}>Nothing is waiting on you.</h1>
          <p style={S.sub}>
            Everything we have is filed and counted. Send a receipt on WhatsApp whenever it happens.
          </p>
        </section>
      ) : (
        <>
          {/* ⚠️ THE TRUTH ABOUT WHAT THIS COSTS HIM, BEFORE HE STARTS, AND THE WIN NAMED FIRST.
              He went to the same merchant many times: that is one question, not many. And the ones
              we already recognise are not a question at all, they are a yes. Saying so up front is
              the difference between a screen he works through and a screen he closes. */}
          <section style={S.card}>
            <h1 style={S.h1}>
              {summary.entries} to check, and {decidable === 1 ? 'one question' : `only ${decidable} questions`}.
            </h1>
            <p style={S.sub}>
              We have grouped them by who you paid. Answer once for a shop and we will file every
              future payment there the same way, without asking again.
            </p>
            {income.length > 0 && (
              <p style={S.aside}>
                {income.length === 1 ? 'One of them is' : `${income.length} of them are`} money in
                rather than money out. Those are kept separate and are not waiting on you here.
              </p>
            )}
          </section>

          {/* ── 1. THE ONES WE KNOW ──────────────────────────────────────────────────────────
              No dropdown. A category he can read, and ONE button for the lot. Rendering a twenty
              four option select next to a merchant we already recognise is asking a question we
              have already answered, and doing it twenty times is what made this screen feel like
              work. He only needs the dropdown when he DISAGREES, which is what the row link is. */}
          {known.length > 0 && (
            <section style={S.card}>
              <h2 style={S.h2}>We recognise {known.length === 1 ? 'this one' : `these ${known.length}`}</h2>
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
              <form action="/api/pile" method="post" style={S.form}>
                <input type="hidden" name="verdict" value="confirm_known" />
                <button type="submit" style={S.primary}>
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
            <section key={g.key} style={{ ...S.card, ...S.careful }}>
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
              <form action="/api/pile" method="post" style={S.formTight}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="personal" />
                <button type="submit" style={S.secondary}>Not business money</button>
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
            <section style={S.card}>
              <h2 style={S.h2}>{unknown.length === 1 ? 'This one needs' : 'These need'} you</h2>
              <p style={S.sub}>
                Quickest way through: knock out anything that was not business first, then say what
                the rest were. Where we have a good idea we have filled it in for you.
              </p>
            </section>
          )}
          {unknown.map((g) => (
            <section key={g.key} style={S.card}>
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

              <form action="/api/pile" method="post" style={S.form}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="personal" />
                <button type="submit" style={S.primaryQuiet}>Not business money</button>
              </form>

              <form action="/api/pile" method="post" style={S.formTight}>
                <input type="hidden" name="ids" value={g.ids.join(',')} />
                <input type="hidden" name="vendor" value={g.vendor} />
                <input type="hidden" name="verdict" value="business" />
                <label htmlFor={`cat-${g.key}`} style={S.label}>
                  {g.suggested ? 'Or it was work, file it as' : 'Or file it as'}
                </label>
                <select id={`cat-${g.key}`} name="category" defaultValue={g.suggested ?? ''} style={S.select} required>
                  {!g.suggested && <option value="">Choose one</option>}
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="submit" style={S.secondary}>
                  File {g.count === 1 ? 'it' : `all ${g.count}`}
                </button>
              </form>
            </section>
          ))}
        </>
      )}
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  `select:focus,button:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK, padding: '18px 16px 40px', maxWidth: 640, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: RIVER_DEEP, textDecoration: 'none' },
  back: { fontSize: 13.5, fontWeight: 600, color: MUTED, textDecoration: 'none' },
  card: { background: '#fff', border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '18px', marginBottom: 12 },
  careful: { background: SAFFRON_TINT, borderColor: '#E7D4AC' },
  h1: { fontSize: 21, lineHeight: 1.3, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 8px' },
  sub: { fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: 0 },
  aside: { fontSize: 13.5, lineHeight: 1.55, color: MUTED, margin: '12px 0 0' },
  note: { background: '#fff', border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: 14, fontSize: 14.5, lineHeight: 1.5, margin: '0 0 14px' },
  rowTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' },
  vendor: { fontSize: 16.5, fontWeight: 800, letterSpacing: '-0.2px' },
  amount: { fontSize: 16.5, fontWeight: 800, whiteSpace: 'nowrap' },
  meta: { fontSize: 13.5, lineHeight: 1.55, color: MUTED, margin: '4px 0 0' },
  reason: { fontSize: 13.5, lineHeight: 1.55, color: INK, margin: '10px 0 0', fontWeight: 600 },
  form: { margin: '14px 0 0' },
  formTight: { margin: '10px 0 0' },
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 6 },
  select: { width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: 16, fontFamily: FONT, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, color: INK, background: '#fff' },
  primary: { width: '100%', marginTop: 10, padding: '14px 16px', fontSize: 15.5, fontWeight: 700, fontFamily: FONT, color: '#fff', background: RIVER, border: 'none', borderRadius: RADIUS.md, cursor: 'pointer' },
  cat: { color: RIVER_DEEP },
  lines: { listStyle: 'none', margin: '14px 0 0', padding: 0 },
  line: { borderTop: `1px solid ${LINE}`, padding: '12px 0 0', marginTop: 12 },
  hint: { fontSize: 12.5, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: '10px 0 0' },
  primaryQuiet: { width: '100%', padding: '14px 16px', fontSize: 15.5, fontWeight: 700, fontFamily: FONT, color: INK, background: SURFACE, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, cursor: 'pointer' },
  secondary: { width: '100%', padding: '12px 16px', fontSize: 14.5, fontWeight: 700, fontFamily: FONT, color: MUTED, background: 'transparent', border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, cursor: 'pointer' },
};
