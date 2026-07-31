import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readNudgePrefs } from '../../../../lib/supabase';
import { settingsNotice } from '../identity';
import {
  A11Y_CSS, APP_CSS, FONT, GREEN_TINT, INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RADIUS, RED,
  RED_TINT, RIVER, RIVER_DEEP, SPACE, SURFACE, TYPE,
} from '../../../../lib/tokens';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// HIS SWITCHES. The two messages we ever send off our own bat, each with its off switch.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ TWO ROWS, BECAUSE WE SEND TWO KINDS OF MESSAGE, AND THAT IS THE WHOLE PAGE. A settings
// screen grows a row every time somebody is helpful, and doc 103's once test is the reason this
// one must not: every switch here is a promise that a message exists behind it. The daily
// reminder and the weekly summary are the only proactive sends the product makes, so they are
// the only switches. When a third send exists, it brings its switch with it, not before.
//
// ⚠️ THE STATE SHOWN IS THE STATE READ, NEVER ASSUMED. readNudgePrefs keeps three answers
// apart: his saved choices, no row (which honestly means the defaults, both on), and a failed
// read. On a failed read this page refuses to draw switches at all, because drawing "on" over
// an opt out we could not read would show a man a promise we may be breaking (PECR). The route
// refuses the save on the same reasoning, so the page and the write cannot disagree.
//
// ⚠️ EACH SWITCH IS ITS OWN FORM POSTING THE OPPOSITE OF WHAT IS SHOWN. No save button, no
// checkbox state to accumulate: the press is the change, same as every choice in setup, and a
// 303 lands him back here looking at the new truth.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function Row({
  which, title, body, on,
}: {
  which: 'daily_nudges' | 'weekly_summary';
  title: string;
  body: string;
  on: boolean;
}) {
  return (
    <div style={S.row}>
      <div style={S.rowText}>
        <p style={S.rowTitle}>{title}</p>
        <p style={S.rowBody}>{body}</p>
        <p style={on ? S.stateOn : S.stateOff}>{on ? 'On' : 'Off'}</p>
      </div>
      <form action="/api/you/settings" method="post" style={S.rowForm}>
        <input type="hidden" name="which" value={which} />
        {/* The literal 'on' or 'off', compared server side against 'on'. A form posts strings,
            and 'false' is a truthy one, which is the lesson the route's header records. */}
        <input type="hidden" name="to" value={on ? 'off' : 'on'} />
        <button type="submit" style={on ? S.turnOff : S.turnOn}>
          {on ? 'Turn it off' : 'Turn it on'}
        </button>
      </form>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const notice = settingsNotice(one('done') ?? one('e'));
  const saved = one('done') === 'saved';

  const prefs = await readNudgePrefs(user.id);
  const current = prefs === null || prefs === 'none'
    ? { daily_nudges: true, weekly_summary: true }
    : prefs;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you/settings" />

      <section className="lek-card">
        <h1 className="lek-eyebrow">Settings</h1>
        <p style={S.blurb}>
          These are the only messages Lekhio ever sends without you asking first. Turn either off
          and it stops from the next one we would have sent.
        </p>

        {notice ? <p style={saved ? S.good : S.warn}>{notice}</p> : null}

        {prefs === null ? (
          <p style={S.warn}>
            We could not read your choices just this minute, so the switches are not drawn: showing
            you a guess about what we send you would be worse than making you reload. Nothing has
            changed. Give it a moment and try again.
          </p>
        ) : (
          <div style={S.stack}>
            <Row
              which="daily_nudges"
              title="The daily reminder"
              body="A nudge at the end of a working day when nothing has been logged, so a busy day does not become a lost day."
              on={current.daily_nudges}
            />
            <Row
              which="weekly_summary"
              title="The weekly summary"
              body="One message on a Sunday saying your week's figures are ready to look at."
              on={current.weekly_summary}
            />
          </div>
        )}
      </section>

      <p style={S.foot}>
        Replies to things you send us are not switched here. Ask a question, get an answer, always.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  blurb: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${RED}33`, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },
  good: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: SPACE.sm, margin: `0 0 ${SPACE.sm}px` },

  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.xs },

  row: { display: 'flex', alignItems: 'flex-start', gap: SPACE.sm, background: SURFACE, borderRadius: RADIUS.md, padding: '14px 14px', flexWrap: 'wrap' },
  rowText: { flex: '1 1 260px' },
  rowTitle: { fontSize: TYPE.body, fontWeight: 800, margin: '0 0 4px' },
  rowBody: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: 0, maxWidth: '52ch' },
  stateOn: { fontSize: TYPE.label, fontWeight: 800, color: RIVER_DEEP, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  stateOff: { fontSize: TYPE.label, fontWeight: 800, color: MUTED, margin: '8px 0 0', textTransform: 'uppercase', letterSpacing: '0.05em' },
  rowForm: { margin: 0, flex: '0 0 auto', alignSelf: 'center' },
  turnOff: { background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 16px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  turnOn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '11px 16px', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
