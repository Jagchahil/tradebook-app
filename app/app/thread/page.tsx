import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { lekhioThreadMessages } from '../../../lib/supabase';
import { gateForUser } from '../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, INK, LINE, MOTION, MUTED, ON_RIVER, PANEL, PAPER, RADIUS,
  RIVER, RIVER_DEEP, RIVER_TINT, SPACE, SURFACE, TYPE,
} from '../../../lib/tokens';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE THREAD. The conversation with Lekhio, on our own turf.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN EXISTS. Every deep question used to have exactly one place to land:
// WhatsApp, which from 1 October is metered per message (lib/routing.ts, the
// conversation_answer row already routes answers to 'thread'). This page is that thread: free,
// ours, and his to scroll back through. It is also where the day six trial message can point.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app. The composer is a
// plain form posting to /api/thread, which answers and 303s back here to #end, so the page
// lands on the newest turn with no JavaScript at all.
//
// ⚠️ NEWEST AT THE BOTTOM, his words and Lekhio's replies in order, and ONE form. No search,
// no filters, no per message buttons: doc 103, he came to ask a question, not to operate a
// message client.
//
// ⚠️ READ ONLY IS STILL READABLE. A locked account keeps the whole thread, because his
// questions and the answers he paid for are his records. What stops is new work: the composer
// hides behind the same read only banner the other pages draw, and /api/thread refuses the
// post server side (lib/gate.ts, 'entitled').
//
// ⚠️ NO ID IN ANY URL. There is one thread per account, found by the session, so this page
// takes no parameters worth stealing and the form carries nothing but the words.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'empty':
      return 'Say something first, then press Send.';
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not send. Nothing has changed, so try it again in a minute.';
    default:
      return null;
  }
}

export default async function ThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('problem'));

  const [gate, messages] = await Promise.all([
    gateForUser(user.id),
    lekhioThreadMessages(user.id),
  ]);
  const locked = gate === 'readonly';
  const read = messages !== null;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      {/* current is /app because the nav does not know this page yet. The desired row is
          Overview, then { href: '/app/thread', label: 'Ask Lekhio', hint: 'Your questions and
          the answers, kept' }, and adding it is AppNav.tsx's own one line change. */}
      <AppNav current="/app" />

      {said ? <p style={S.said}>{said}</p> : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : null}

      {!read ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read your thread just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : messages.length === 0 ? (
        <section className="lek-card">
          <p style={S.empty}>Ask me anything about your money.</p>
          <p style={S.quiet}>
            I answer from your own figures, straight away, and the thread stays here to look back
            on. Try &quot;what have I made this month&quot;, &quot;what do I owe so far&quot;, or
            &quot;can I claim my boots&quot;.
          </p>
        </section>
      ) : (
        <section style={S.thread} aria-label="Your conversation with Lekhio">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'lek-turn lek-turn-you' : 'lek-turn'}>
              <span className="lek-who">{m.role === 'user' ? 'You' : 'Lekhio'}</span>
              <p className={m.role === 'user' ? 'lek-bubble lek-bubble-you' : 'lek-bubble'}>{m.content}</p>
            </div>
          ))}
        </section>
      )}

      {/* The 303 from /api/thread lands here, so the page opens on the newest turn with no
          script. */}
      <div id="end" />

      {locked ? null : (
        <section className="lek-card">
          <form action="/api/thread" method="post">
            <textarea
              name="q"
              rows={3}
              required
              maxLength={1000}
              className="lek-field"
              placeholder='Ask about your money or your tax, like "what do I owe so far"'
              aria-label="Your message to Lekhio"
            />
            <button type="submit" className="lek-primary">Send</button>
          </form>
        </section>
      )}

      <p style={S.foot}>
        Money answers come straight from your own confirmed figures. Nothing is ever sent to HMRC
        unless you have approved it first.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  // The turns. His on the right in the river tint, Lekhio's on the left on the panel, both
  // plain paragraphs: replies carry line breaks, so pre-wrap keeps them.
  `.lek-turn{display:flex;flex-direction:column;align-items:flex-start;margin-bottom:${SPACE.sm}px;animation:lek-in ${MOTION.enter} ${MOTION.ease} both}`,
  `.lek-turn-you{align-items:flex-end}`,
  `.lek-who{font-size:${TYPE.label}px;font-weight:700;color:${MUTED};margin:0 6px 3px}`,
  `.lek-bubble{box-sizing:border-box;max-width:56ch;margin:0;padding:${SPACE.sm}px ${SPACE.md}px;font-size:${TYPE.body}px;line-height:1.55;color:${INK};background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.sm}px;white-space:pre-wrap;overflow-wrap:break-word}`,
  `.lek-bubble-you{background:${RIVER_TINT};border-color:${RIVER}33;color:${RIVER_DEEP};border-radius:${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.sm}px ${RADIUS.lg}px}`,
  // 16px pinned on the field: under 16 iOS Safari zooms the page the moment it is focused.
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%;resize:vertical}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){.lek-primary{width:auto;min-width:200px}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  empty: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  thread: { margin: `0 0 ${SPACE.sm}px` },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
