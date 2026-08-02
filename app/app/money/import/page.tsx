import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { UNRECOGNISED_LINE, bankNameFor } from '../../../../lib/statementimport';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import { controlCopy } from '../../../../lib/control';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A BANK STATEMENT, FROM THE WEB. The bank feed by another door, and the door needs no key.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN EXISTS. The bank feed has no provider (GoCardless closed, TrueLayer
// declined us; lib/statementimport.ts's header holds the history), so "connect your bank" is
// a promise we cannot currently keep. What every bank already gives its customer, with nobody's
// approval needed, is a CSV of his own statement. He uploads it here and every line lands in
// the same shape a feed line would: read by the same engine, categorised by the same keyword
// map, deduped by the same external id discipline, and UNCONFIRMED, waiting for his yes.
//
// ⚠️ THE RESULT SCREEN SAYS EXACTLY WHAT HAPPENED, IN COUNTS. Rows read, rows already known,
// rows new, rows waiting. A man who has just poured three months of his bank into a product
// deserves numbers, not "import successful". The counts arrive in the query string, counts and
// a bank code only, never an id: the same rule /app/pile's confirmations follow.
//
// ⚠️ A PLAIN MULTIPART FORM, NO CLIENT SCRIPT. Same reasoning as the receipt screen next door:
// a page that needs JavaScript before it can accept a file is a page that cannot accept one on
// a bad signal, and a bad signal is a building site.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function problemLine(problem: string | undefined): string | null {
  switch (problem) {
    case 'unrecognised':
      return UNRECOGNISED_LINE;
    case 'empty':
      return 'That file was empty, so there was nothing to read.';
    case 'no_rows':
      return 'I recognised the bank but could not read a single line of that file as money. Nothing was saved. Check the export has transaction rows in it and try again.';
    case 'too_many':
      return 'That file has more than ten thousand rows. Export a shorter date range and give me each part on its own. Nothing doubles up between uploads, so the order does not matter.';
    case 'big':
      return 'That file is too big for me. Anything under four megabytes is fine, and a statement export always is.';
    case 'type':
      return 'I cannot read that kind of file. Download the statement from your bank as a CSV file and give me that.';
    case 'bad':
      return 'That upload did not arrive whole. Nothing was saved, so try it again.';
    case 'slow':
      return 'That is a lot of statements at once. Give it a minute and try the next one.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    default:
      return null;
  }
}

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = problemLine(one('problem'));

  // The counts from the route, taken only as small honest integers. Anything else in the query
  // string is somebody typing, and the answer to that is no result card, not an error page.
  const num = (k: string): number | null => {
    const n = Number(one(k));
    return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null;
  };
  const read = num('read');
  const known = num('known');
  const fresh = num('fresh');
  const review = num('review');
  const skipped = num('skipped');
  // The bank arrives as a code and is turned back into a name HERE, against the fixed list in
  // lib/statementimport.ts. Printing a name straight out of a query string would let anybody
  // write anything onto a screen that talks about his money.
  const bankName = bankNameFor(one('bank') ?? '');
  const done = one('done') === '1' && read !== null && known !== null && fresh !== null && review !== null;

  const gate = await gateForUser(user.id);
  const locked = gate === 'readonly';

  const payments = (n: number) => (n === 1 ? 'one payment' : `${n} payments`);

  // lib/control.ts owns every word. See the block below the upload heading for why it is here.
  const control = controlCopy();

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money/import" />

      {said ? <p style={S.said}>{said}</p> : null}

      {done ? (
        <section className="lek-card" style={S.result}>
          <h1 className="lek-title">
            Read {payments(read)} from your {bankName ?? 'bank'} statement.
          </h1>
          {known > 0 ? (
            <p style={S.line}>
              {known === 1 ? 'One was' : `${known} were`} already in your books, so nothing
              changed for {known === 1 ? 'it' : 'them'}.
            </p>
          ) : null}
          {fresh > 0 ? (
            <>
              <p style={S.line}>
                {fresh === 1 ? 'One is new. ' : `${fresh} are new. `}
                {review === fresh
                  ? review === 1
                    ? 'It is waiting for your yes, and it counts for nothing until you give it.'
                    : `All ${review} are waiting for your yes, and they count for nothing until you give it.`
                  : `${review === 1 ? 'One of them is' : `${review} of them are`} waiting for your yes. The rest arrived already marked as not business money, because you have taught me those names.`}
              </p>
              {review > 0 ? (
                <a href="/app/pile" style={S.go}>Go and answer {review === 1 ? 'it' : 'them'}</a>
              ) : null}
            </>
          ) : (
            <p style={S.line}>
              Nothing new landed: every payment in that file was already in your books. Upload the
              next statement whenever you like.
            </p>
          )}
          {skipped !== null && skipped > 0 ? (
            <p style={S.aside}>
              {skipped === 1 ? 'One line was' : `${skipped} lines were`} not money, things like
              pending rows or a foreign currency, and {skipped === 1 ? 'was' : 'were'} left out.
            </p>
          ) : null}
        </section>
      ) : null}

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
          <h1 className="lek-title">A bank statement</h1>
          <p style={S.lead}>
            Download a statement from your bank as a CSV file and give it to me here. I read it
            row by row. No bank connection, nothing to sign up for.
          </p>
          <p style={S.sub}>
            Upload the same statement twice, or overlapping months, and nothing doubles up.
          </p>

          {/* ═══════════════════════════════════════════════════════════════════════════════
              🔴 THE CONTROL DOCTRINE, SAID OUT LOUD, ON THE SCREEN WHERE IT IS THE POINT.
              Jag, 2 August 2026: the philosophy is giving him back the control a bank
              connection takes away. The app has always behaved this way and never once said
              so, and a man cannot value a thing nobody told him he had. The line that used to
              sit above ("every payment lands waiting for your yes") said the mechanism and not
              the reason, so it has been folded into the block below rather than repeated.
              ⚠️ AND THE INCOME SENTENCE IS PART OF THE BLOCK, NOT A FOOTNOTE UNDER IT. See
              lib/control.ts: "you decide what goes in", alone, on a page about a bank
              statement, reads as an offer to leave a few payments out. It is not one. ═══ */}
          <section style={S.control}>
            <p style={S.controlTitle}>{control.title}</p>
            <p style={S.controlBody}>{control.why}</p>
            <p style={S.controlBody}>{control.costs}</p>
            <p style={S.controlBody}>{control.income}</p>
          </section>

          <form action="/api/money/import" method="post" encType="multipart/form-data">
            {/* The accept attribute is a courtesy to the file picker. The route holds the real
                type check, and the parser's header detection is the honest gate behind that. */}
            <label htmlFor="statement" style={S.label}>The CSV file</label>
            <input id="statement" name="statement" type="file" accept=".csv,text/csv" required className="lek-field" />
            <button type="submit" className="lek-primary">Read this statement</button>
          </form>

          <p style={S.small}>
            I can read exports from Monzo, Starling, Barclays, Lloyds, NatWest, HSBC, Santander,
            Nationwide, Revolut, Tide and Mettle. It must be the CSV download, not the PDF.
          </p>
        </section>
      )}
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL}}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-field{max-width:420px}
    .lek-primary{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },
  result: { marginBottom: 14 },
  line: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '0 0 8px' },
  go: { display: 'inline-block', marginTop: 4, color: ON_RIVER, background: RIVER, fontWeight: 700, textDecoration: 'none', borderRadius: RADIUS.md, padding: '11px 18px' },
  aside: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  lead: { fontSize: TYPE.strong, lineHeight: 1.5, fontWeight: 700, margin: '0 0 8px' },
  sub: { fontSize: TYPE.body, lineHeight: 1.6, color: MUTED, margin: '0 0 14px' },
  small: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  // Panelled rather than loose prose, because it is a statement about how the product treats him
  // and not another instruction about CSV files. He should be able to see where it starts and stops.
  control: { background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '14px 16px', margin: '0 0 16px' },
  controlTitle: { fontSize: TYPE.body, lineHeight: 1.5, fontWeight: 800, color: INK, margin: '0 0 8px' },
  controlBody: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, margin: '0 0 8px' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '4px 0 6px' },
};
