import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { hasClaudeConfig } from '../../../../lib/claude';
import { bankFeedOffered } from '../../../../lib/bankfeed';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A PAPER RECEIPT, FROM THE WEB. The same reading the WhatsApp photo gets, without the phone.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE PARSE PATH. The upload goes to /api/money/receipt, which calls the SAME parseReceipt
// in lib/claude.ts the WhatsApp webhook calls, clamps the date with the SAME clampReceiptDate,
// and lands the row in the SAME shape: an unconfirmed transaction, negative, waiting for him.
// A second reader over the same photograph would drift exactly the way two money formatters
// drifted, and the copy that drifts is the one he used.
//
// ⚠️ NEVER AUTO CONFIRMED, AND THE SCREEN SAYS SO. A parse is a machine's READING of his money,
// however good the machine, and a reading always waits for his yes. That is not a compliance
// chore, it is the product: we prepare, he approves. The manual entry screen next door lands
// confirmed because there he typed every figure himself; here a model read them off paper.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ A PLAIN MULTIPART FORM, NO CLIENT SCRIPT. On a phone the file input opens the camera or
// the gallery on its own, from the browser, with nothing shipped to make it happen. A page that
// needs JavaScript before it can accept a photograph is a page that cannot accept one on a bad
// signal, and a bad signal is a building site.

function notice(done: string | undefined, problem: string | undefined): string | null {
  switch (done) {
    case 'logged':
      return 'Read and written down. It is not in your figures yet: nothing a machine reads counts until you have said it is right.';
    case 'merged':
      return 'Your bank already sent me that payment, so the receipt has been put with it rather than counted twice.';
  }
  switch (problem) {
    case 'unread':
      return 'I could not read that one. A clearer photograph with the total showing usually does it.';
    case 'big':
      return 'That file is too big for me. Anything under four megabytes is fine.';
    case 'type':
      return 'I cannot read that kind of file. A JPEG or PNG photograph works.';
    case 'off':
      return 'Receipt reading is not switched on yet. Hang tight, it is coming very soon.';
    case 'budget':
      // The bank offer returns with bankFeedOffered(); until then the way out is one he can take.
      return bankFeedOffered()
        ? 'I have done all the reading I can afford today. Try again tomorrow, or connect your bank and the payment arrives on its own.'
        : 'I have done all the reading I can afford today. Try again tomorrow, or add the entry by hand and it counts today.';
    case 'slow':
      return 'One at a time is plenty. Give it a minute and try the next one.';
    case 'bad':
      return 'That upload did not arrive whole. Nothing was saved, so try it again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    default:
      return null;
  }
}

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('done'), one('problem'));

  const gate = await gateForUser(user.id);
  const locked = gate === 'readonly';
  // Doc 103's honesty test: a form whose only outcome is "not switched on yet" is an advert for
  // the roadmap, so an unconfigured build explains itself and draws no button at all.
  const configured = hasClaudeConfig();

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money/capture" />

      {said ? <p style={S.said}>{said}</p> : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : !configured ? (
        <section className="lek-card">
          <h1 className="lek-title">A paper receipt</h1>
          <p style={S.lead}>Receipt reading is not switched on yet.</p>
          {/* The bank sentence returns with bankFeedOffered(); until then the fallback names the
              two doors that work without a photograph. */}
          <p style={S.sub}>
            {bankFeedOffered()
              ? 'Nothing is wrong with your account. Connect your bank instead and your spending lands in your books on its own, with nothing to photograph.'
              : 'Nothing is wrong with your account. Add the entry by hand or import a bank statement instead, and it lands in your books all the same.'}
          </p>
          <a href="/app/money" style={S.backLink}>Back to your money</a>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-title">A paper receipt</h1>
          <p style={S.lead}>
            Give me the receipt and I will read it: the shop, the total and the date.
          </p>
          <p style={S.sub}>
            It goes in as waiting for your yes, never straight into your figures. If your bank
            already sent me the same payment, the receipt is put with it rather than counted twice.
          </p>

          <form action="/api/money/receipt" method="post" encType="multipart/form-data">
            {/* image/* rather than a list, so the phone offers its camera and its gallery both.
                The route holds the real allowlist and refuses anything the reader cannot take,
                because an accept attribute is a suggestion the browser is free to ignore. */}
            <label htmlFor="receipt" style={S.label}>The photograph</label>
            <input id="receipt" name="receipt" type="file" accept="image/*" required className="lek-field" />
            <button type="submit" className="lek-primary">Read this receipt</button>
          </form>

          <p style={S.small}>
            One photograph, with the total showing, works better than a neat scan of a faded one.
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

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  lead: { fontSize: TYPE.strong, lineHeight: 1.5, fontWeight: 700, margin: '0 0 8px' },
  sub: { fontSize: TYPE.body, lineHeight: 1.6, color: MUTED, margin: '0 0 14px' },
  small: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '4px 0 6px' },
  backLink: { display: 'inline-block', color: RIVER, fontWeight: 700, textDecoration: 'none' },
};
