import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { pileEntries, readOwnNames } from '../../../lib/supabase';
import { buildPile, summarisePile, canBulkConfirm } from '../../../lib/reviewpile';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES } from '../../../lib/categories';
import { gbp0 } from '../../../lib/money';
import { A11Y_CSS, FONT, INK, LINE, MUTED, PAPER, RADIUS, RIVER, RIVER_DEEP, SAFFRON_TINT } from '../../../lib/tokens';

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

  const [rows, ownNames] = await Promise.all([pileEntries(user.id), readOwnNames(user.id)]);
  const groups = buildPile(rows, normaliseVendor, ownNames);
  const summary = summarisePile(groups);

  // Money in is never bundled with the spending, and confirm_pile refuses it outright, so there is
  // no decision to offer here. It is counted honestly in one line rather than listed as rows he
  // cannot act on, which would fail doc 103's empty test on every visit.
  const decidable = groups.filter((g) => g.kind !== 'income');

  return (
    <main style={S.wrap}>
      <style>{CSS}</style>

      <header style={S.head}>
        <a href="/app" style={S.logo}>Lekhio</a>
        <a href="/app" style={S.back}>Your money</a>
      </header>

      {note && <p style={S.note}>{note}</p>}

      {decidable.length === 0 ? (
        <section style={S.card}>
          <h1 style={S.h1}>Nothing is waiting on you.</h1>
          <p style={S.sub}>
            Everything we have is filed and counted. Send a receipt on WhatsApp whenever it happens.
          </p>
        </section>
      ) : (
        <>
          <section style={S.card}>
            {/* THE TRUTH ABOUT WHAT THIS COSTS HIM, BEFORE HE STARTS. He went to the same merchant
                fourteen times: that is one question, not fourteen, and saying so is the difference
                between a screen he opens and a screen he closes. */}
            {/* ⚠️ THE COUNT IS OF WHAT IS ON THIS PAGE, NOT OF EVERY GROUP.
                Caught on Jag's real data: summarisePile() counts every group including money in,
                so the heading promised 36 questions above a page showing 29 cards. Seven of them
                were income, which this screen deliberately does not ask about. A number that does
                not match what is underneath it is the fastest way to stop being believed, and it is
                worse here than anywhere because the whole point of the grouping is the claim that
                there are fewer questions than there are rows. */}
            <h1 style={S.h1}>
              {summary.entries} to check, and {decidable.length === 1 ? 'one question' : `only ${decidable.length} questions`}.
            </h1>
            <p style={S.sub}>
              We have grouped them by who you paid. Answer once for a shop and we will file every
              future payment there the same way, without asking again.
            </p>
            {summary.income > 0 && (
              <p style={S.aside}>
                {summary.income === 1 ? 'One of them is' : `${summary.income} of them are`} money in
                rather than money out. Those are kept separate and are not waiting on you here.
              </p>
            )}
          </section>

          {decidable.map((g) => {
            const ids = g.ids.join(',');
            const careful = g.kind === 'careful';
            return (
              <section key={g.key} style={careful ? { ...S.card, ...S.careful } : S.card}>
                <div style={S.rowTop}>
                  <span style={S.vendor}>{g.vendor}</span>
                  <span style={S.amount}>{gbp0(g.total)}</span>
                </div>
                <p style={S.meta}>
                  {g.count === 1 ? 'One payment' : `${g.count} payments`}
                  {g.suggested ? `, and we think this is ${g.suggested}` : ''}.
                </p>

                {/* HIS WORDS, NOT OURS. lib/personal.ts writes the sentence, so a man can argue with
                    the reason rather than be silently refused. */}
                {careful && <p style={S.reason}>{looksPersonal(g.vendor, null, ownNames)?.why ?? g.reason}</p>}

                {/* ⚠️ TWO DIFFERENT ACTS, AND THE FIRST DRAFT OF THIS PAGE CONFLATED THEM.
                    canBulkConfirm() answers "may he simply AGREE to our guess", and it is false when
                    we have no guess to offer. I first read that as "no fast path, so no path", which
                    left every group we could not guess at unanswerable on the web: he could mark it
                    personal or nothing at all. Choosing a category himself is not the fast path, it
                    is him doing the work, and confirm_pile has always allowed it.
                    The only group with no business path here is 'careful', because the SQL refuses
                    a flagged row whatever the page sends, and a button that silently files nothing
                    is worse than no button. */}
                {!careful ? (
                  <form action="/api/pile" method="post" style={S.form}>
                    <input type="hidden" name="ids" value={ids} />
                    <input type="hidden" name="vendor" value={g.vendor} />
                    <input type="hidden" name="verdict" value="business" />
                    <label htmlFor={`cat-${g.key}`} style={S.label}>
                      {canBulkConfirm(g) ? 'File as' : 'What was this?'}
                    </label>
                    <select id={`cat-${g.key}`} name="category" defaultValue={g.suggested ?? ''} style={S.select} required>
                      {!canBulkConfirm(g) && <option value="">Choose one</option>}
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button type="submit" style={S.primary}>
                      {canBulkConfirm(g)
                        ? `Yes, file ${g.count === 1 ? 'it' : `all ${g.count}`}`
                        : `File ${g.count === 1 ? 'it' : `all ${g.count}`}`}
                    </button>
                  </form>
                ) : (
                  <p style={S.aside}>
                    We will not file these for you in one go, because getting one of them wrong costs
                    you. If they really are business, confirm them one at a time.
                  </p>
                )}

                <form action="/api/pile" method="post" style={S.formTight}>
                  <input type="hidden" name="ids" value={ids} />
                  <input type="hidden" name="vendor" value={g.vendor} />
                  <input type="hidden" name="verdict" value="personal" />
                  <input type="hidden" name="web" value="1" />
                  <button type="submit" style={S.secondary}>Not business money</button>
                </form>
              </section>
            );
          })}
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
  secondary: { width: '100%', padding: '12px 16px', fontSize: 14.5, fontWeight: 700, fontFamily: FONT, color: MUTED, background: 'transparent', border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, cursor: 'pointer' },
};
