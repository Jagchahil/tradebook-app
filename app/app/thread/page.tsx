import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { listChatsForUser, rakhaFlagsForUser } from '../../../lib/supabase';
import { gateForUser } from '../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import { chatRef } from '../chatref';
import { A11Y_CSS, APP_CSS, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE, edge,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE CHAT LIST. Every conversation with Lekhio, newest first, like the DMs he already knows.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS SCREEN IS A LIST NOW. v1 shipped this morning as one standing thread. The founder
// wants the shape a tradesman already carries in his thumb: old chats he can go back and look
// at, a button at the top to start a new one, and Rakha's suggestions readable as chats of
// their own, with the why. This page is that front door; the words live one tap deeper.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app. The new chat button
// is a plain form posting to /api/thread/new, which creates the chat and 303s into it.
//
// ⚠️ NO ID IN ANY URL. Each row links through a SEALED reference (app/app/chatref.ts, the
// entryref pattern with its own salt): the conversation or signal id is encrypted, expiring,
// and grants nothing, because the chat view resolves the session first and reads through
// user_id scoped queries. A row whose reference cannot be minted renders as plain text.
//
// ⚠️ RAKHA'S ROWS ARE READ ONLY AND SAY SO. They are agent_signals, the nightly walk's own
// stored copy: the suggestion and its why in Rakha's rendered words. This page only reads.
//
// ⚠️ READ ONLY IS STILL READABLE. A locked account keeps every chat and every flag, because
// his questions and the answers he paid for are his records. What stops is new work: the
// start button hides behind the same read only banner the other pages draw, and the routes
// refuse server side ('entitled' rows in lib/gate.ts).
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'onechat':
      // 🔴 THE HONEST LINE FOR THE UNRUN MIGRATION. The database still enforces one Lekhio
      // thread per user until APPLY_2026-07-31_chats.sql runs, and the man who pressed the
      // button deserves the truth, not a shrug and not somebody else's chat.
      return 'A second chat cannot be started just yet. Your main chat is below and still answers everything.';
    case 'newchat':
      return 'That new chat did not start. Nothing has changed, so try again in a minute.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    default:
      return null;
  }
}

// One merged row shape for the list: a conversation or a Rakha flag, sorted together by when
// they last moved. The ref is minted here, from the SESSION user, or the row draws unlinked.
interface ListRow {
  key: string;
  href: string; // '' when no reference could be minted; the row then renders as plain text
  who: string;
  title: string;
  line: string;
  at: number;
  atLabel: string;
}

// When a chat last moved, in the man's own clock. London, because his customers and his tax
// year are; the server's is not.
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const day = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });
  return day(d) === day(new Date())
    ? d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
    : day(d);
}

export default async function ChatListPage({
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

  const [gate, chats, flags] = await Promise.all([
    gateForUser(user.id),
    listChatsForUser(user.id),
    rakhaFlagsForUser(user.id),
  ]);
  const locked = gate === 'readonly';

  const rows: ListRow[] = [];
  for (const c of chats ?? []) {
    const ref = chatRef(user.id, 'chat', c.id);
    rows.push({
      key: `c-${c.id}`,
      href: ref ? `/app/thread/chat?c=${encodeURIComponent(ref)}` : '',
      who: c.kind === 'puchio' ? 'Puchio' : 'Lekhio',
      title: c.title || 'New chat',
      line: c.last ? c.last.content : 'Nothing said yet. Open it and ask.',
      at: Date.parse(c.last_message_at || c.created_at) || 0,
      atLabel: whenLabel(c.last_message_at || c.created_at),
    });
  }
  for (const f of flags ?? []) {
    const ref = chatRef(user.id, 'rakha', f.id);
    rows.push({
      key: `r-${f.id}`,
      href: ref ? `/app/thread/chat?c=${encodeURIComponent(ref)}` : '',
      who: 'Rakha',
      title: f.title,
      line: 'A suggestion from your numbers, with the why inside.',
      at: Date.parse(f.created_at) || 0,
      atLabel: whenLabel(f.created_at),
    });
  }
  rows.sort((a, b) => b.at - a.at);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/thread" />

      {said ? <p style={S.said}>{said}</p> : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : (
        <form action="/api/thread/new" method="post" style={S.newForm}>
          <button type="submit" className="lek-primary">Start a new chat</button>
        </form>
      )}

      {chats === null ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read your chats just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : rows.length === 0 ? (
        <section className="lek-card">
          <p style={S.empty}>Ask me anything about your money.</p>
          <p style={S.quiet}>
            Start a chat and it stays here to look back on, like any other messages. I answer from
            your own figures, straight away.
          </p>
        </section>
      ) : (
        <section aria-label="Your chats">
          {rows.map((r) =>
            r.href ? (
              <a key={r.key} href={r.href} className="lek-row">
                <span className="lek-row-top">
                  <span className="lek-row-who">{r.who}</span>
                  <span className="lek-row-when">{r.atLabel}</span>
                </span>
                <span className="lek-row-title">{r.title}</span>
                <span className="lek-row-line">{r.line}</span>
              </a>
            ) : (
              // No reference could be minted (unconfigured secret), so the row fails closed:
              // readable, not clickable, exactly as the money log does with its rows.
              <div key={r.key} className="lek-row">
                <span className="lek-row-top">
                  <span className="lek-row-who">{r.who}</span>
                  <span className="lek-row-when">{r.atLabel}</span>
                </span>
                <span className="lek-row-title">{r.title}</span>
                <span className="lek-row-line">{r.line}</span>
              </div>
            ),
          )}
        </section>
      )}

      {chats !== null && flags === null ? (
        <p style={S.footNote}>
          We could not read what Rakha has flagged just now. Your chats above are complete;
          Rakha&apos;s rows will be back with the next load.
        </p>
      ) : null}

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
  // The DM rows. One tap target each, the newest line carried in one truncated breath.
  `.lek-row{display:flex;flex-direction:column;gap:2px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.lg}px;padding:${SPACE.sm}px ${SPACE.md}px;margin-bottom:${SPACE.sm}px;text-decoration:none;color:${INK};animation:lek-in ${MOTION.enter} ${MOTION.ease} both}`,
  `a.lek-row:hover{border-color:${RIVER};border-color:${edge(RIVER, 40)}}`,
  `.lek-row-top{display:flex;justify-content:space-between;align-items:baseline}`,
  `.lek-row-who{font-size:${TYPE.label}px;font-weight:700;color:${MUTED};letter-spacing:0.3px}`,
  `.lek-row-when{font-size:${TYPE.label}px;color:${MUTED};font-variant-numeric:tabular-nums}`,
  `.lek-row-title{font-size:${TYPE.body}px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
  `.lek-row-line{font-size:${TYPE.note}px;color:${MUTED};line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
  `.lek-primary{width:100%;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  newForm: { margin: '0 0 14px' },

  empty: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },

  footNote: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '4px 4px 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
