import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { chatForUser, chatMessagesForUser, rakhaFlagForUser, type RakhaFlagRow } from '../../../../lib/supabase';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import { verifyChatRef, chatRefBelongsTo } from '../../chatref';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ONE CHAT, IN FULL. The page behind a row on /app/thread.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE URL CARRIES A SEALED REFERENCE, NEVER AN ID, AND THE REFERENCE GRANTS NOTHING.
// app/app/chatref.ts on the entryref pattern: the claim names an owner, a kind and a row, and
// even a VALID reference is only honoured after chatRefBelongsTo says it was minted for the
// session asking. Every read below is then scoped by user_id in lib/supabase.ts. Three fences,
// and none of them trusts the URL. A missing, stale, tampered or borrowed reference lands on
// the chat list, because every one of those is a bookmark gone cold or someone else's link.
//
// ⚠️ TWO KINDS OF ROW, ONE DOOR. A 'chat' claim opens a conversation: his turns and Lekhio's
// (or Puchio's, kept from the ask surface), composer at the bottom. A 'rakha' claim opens the
// READ ONLY view of something Rakha flagged: the suggestion and its stored why, in Rakha's own
// rendered words, and one honest line that replying goes in the main chat. Nothing on the
// Rakha view writes anything, v1 doctrine: Rakha suggests, the user decides.
//
// ⚠️ THE COMPOSER POSTS TO /api/thread WITH THE SAME ANSWERING MACHINERY AS THIS MORNING,
// untouched: deterministic intents first, then the guarded AI path, same caps, same rings.
// It only appears on a Lekhio chat, and it hides behind the read only banner exactly as v1
// did: a locked account reads every word and posts nothing.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app. The form's hidden
// field carries the same sealed reference back so the answer lands in the chat he was in.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'empty':
      return 'Say something, or attach a receipt photograph, then press Send.';
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

// Who a stored role reads as on screen. Unknown roles stay visible under Lekhio's name rather
// than vanishing: hiding a stored word would be quieter and worse.
function speaker(role: string): string {
  if (role === 'user') return 'You';
  if (role === 'puchio') return 'Puchio';
  return 'Lekhio';
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const ref = one('c') ?? null;

  const claim = verifyChatRef(ref);
  if (!claim || !chatRefBelongsTo(claim, user.id)) redirect('/app/thread');

  // ── The read only Rakha view. No composer, no buttons, nothing to press wrongly. ─────────
  if (claim.kind === 'rakha') {
    const found = await rakhaFlagForUser(user.id, claim.id);
    // [] means nothing of his answers to this id any more; that is a stale link, and the list
    // is the answer. A failed read (null) is different and said plainly below.
    if (found !== null && found.length === 0) redirect('/app/thread');
    return RakhaView(found === null ? null : found[0]);
  }

  // ── A conversation: Lekhio's chats and Puchio's kept ones. ────────────────────────────────
  const [gate, conv, messages] = await Promise.all([
    gateForUser(user.id),
    chatForUser(user.id, claim.id),
    chatMessagesForUser(user.id, claim.id),
  ]);
  if (conv !== null && conv.length === 0) redirect('/app/thread');
  const locked = gate === 'readonly';
  const kind = conv?.[0]?.kind ?? '';
  const read = messages !== null && conv !== null;
  const said = notice(one('problem'));

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/thread" />

      <p style={S.crumb}>
        <a href="/app/thread" style={S.crumbLink}>&larr; All chats</a>
      </p>

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
          <p style={S.empty}>We could not read this chat just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : messages.length === 0 ? (
        <section className="lek-card">
          <p style={S.empty}>Ask me anything about your money.</p>
          <p style={S.quiet}>
            I answer from your own figures, straight away, and the chat stays here to look back
            on. Try &quot;what have I made this month&quot;, &quot;what do I owe so far&quot;, or
            &quot;can I claim my boots&quot;.
          </p>
        </section>
      ) : (
        <section style={S.thread} aria-label="This chat">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'lek-turn lek-turn-you' : 'lek-turn'}>
              <span className="lek-who">{speaker(m.role)}</span>
              <p className={m.role === 'user' ? 'lek-bubble lek-bubble-you' : 'lek-bubble'}>{m.content}</p>
            </div>
          ))}
        </section>
      )}

      {/* The 303 from /api/thread lands here, so the page opens on the newest turn with no
          script. */}
      <div id="end" />

      {locked ? null : kind === 'lekhio' ? (
        <section className="lek-card">
          <form action="/api/thread" method="post" encType="multipart/form-data">
            {/* The same sealed reference the row was opened with, so the answer lands in THIS
                chat. It grants nothing: /api/thread re-verifies it against the session and the
                write proves ownership again in the database. */}
            <input type="hidden" name="c" value={ref ?? ''} />
            <textarea
              name="q"
              rows={3}
              maxLength={1000}
              className="lek-field"
              placeholder='Ask about your money or your tax, like "what do I owe so far"'
              aria-label="Your message to Lekhio"
            />
            {/* A message can be a receipt photograph as well as a question, exactly as it can
                on WhatsApp, through ONE plain file input with no capture attribute: on a
                phone the picker itself offers Take a Photo beside the photo library and the
                files chooser, so the dedicated camera input the capture page once carried
                was a second control doing nothing the first could not (doc 103).
                /api/thread still reads receipt then receipt_library, so an old open tab
                keeps working, and it runs the SAME ingest walk the capture route runs, so
                the row lands waiting for his yes either way. Not required: words alone
                still work, and the route refuses a message with neither words nor
                photograph. */}
            <label htmlFor="receipt" className="lek-attach">Or send a receipt photograph and I will read it.</label>
            <input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/*"
              className="lek-field"
              aria-label="A receipt photograph for Lekhio to read"
            />
            <button type="submit" className="lek-primary">Send</button>
          </form>
        </section>
      ) : read ? (
        <p style={S.kept}>
          A kept chat, here to look back on. New questions go in your Lekhio chats, which answer
          from your own figures.
        </p>
      ) : null}

      <p style={S.foot}>
        Money answers come straight from your own confirmed figures. Nothing is ever sent to HMRC
        unless you have approved it first.
      </p>
    </main>
  );
}

// The read only view of one thing Rakha flagged: the suggestion, the stored why, and where a
// reply belongs. Deliberately free of forms and buttons: Rakha suggests, the user decides, and
// v1 of this surface only shows the suggestion.
function RakhaView(flag: RakhaFlagRow | null) {
  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/thread" />

      <p style={S.crumb}>
        <a href="/app/thread" style={S.crumbLink}>&larr; All chats</a>
      </p>

      {flag === null ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read this just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : (
        <>
          <section style={S.thread} aria-label="What Rakha flagged">
            <div className="lek-turn">
              <span className="lek-who">Rakha</span>
              <p className="lek-bubble"><strong>{flag.title}</strong></p>
            </div>
            {flag.body ? (
              <div className="lek-turn">
                <span className="lek-who">Rakha</span>
                <p className="lek-bubble">{flag.body}</p>
              </div>
            ) : null}
          </section>
          <p style={S.kept}>
            Replying about this goes in your main chat: <a href="/app/thread" style={S.crumbLink}>
            open your chats</a> and ask there, and Lekhio answers from the same figures Rakha
            read. Rakha suggests. You decide.
          </p>
        </>
      )}

      <p style={S.foot}>
        A suggestion from your own numbers, not advice. Nothing happens unless you do it.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  // The turns. His on the right in the river tint, the house's on the left on the panel, both
  // plain paragraphs: replies carry line breaks, so pre-wrap keeps them.
  `.lek-turn{display:flex;flex-direction:column;align-items:flex-start;margin-bottom:${SPACE.sm}px;animation:lek-in ${MOTION.enter} ${MOTION.ease} both}`,
  `.lek-turn-you{align-items:flex-end}`,
  `.lek-who{font-size:${TYPE.label}px;font-weight:700;color:${MUTED};margin:0 6px 3px}`,
  `.lek-bubble{box-sizing:border-box;max-width:56ch;margin:0;padding:${SPACE.sm}px ${SPACE.md}px;font-size:${TYPE.body}px;line-height:1.55;color:${INK};background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.sm}px;white-space:pre-wrap;overflow-wrap:break-word}`,
  `.lek-bubble-you{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)};color:${RIVER_DEEP};border-radius:${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.sm}px ${RADIUS.lg}px}`,
  // 16px pinned on the field: under 16 iOS Safari zooms the page the moment it is focused.
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%;resize:vertical}`,
  // The receipt line sits under the words, quiet, in the label voice the capture page uses.
  `.lek-attach{display:block;font-size:${TYPE.label}px;font-weight:700;color:${MUTED};margin:${SPACE.sm}px 6px 4px}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){.lek-primary{width:auto;min-width:200px}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  crumb: { margin: '0 0 12px' },
  crumbLink: { color: RIVER, fontSize: TYPE.note, fontWeight: 700, textDecoration: 'none' },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  empty: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  thread: { margin: `0 0 ${SPACE.sm}px` },

  kept: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, background: SURFACE, borderRadius: RADIUS.md, padding: '10px 12px', margin: '0 0 14px' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
