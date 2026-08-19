import { A11Y_CSS, APP_CSS, FONT, SPACE, TYPE } from '../../lib/tokens';
import { INK, MUTED, PAPER } from '../../lib/apptheme';
import { AppNav } from './AppNav';

// WHAT A PAGE SAYS WHEN IT COULD NOT READ HIS RECORDS. B24, 19 August 2026.
//
// ═════════════════════════════════════════════════════════════
// 🔴 THE FAULT THIS EXISTS FOR: A YEAR OF ZEROS IS AN ANSWER, AND IT IS THE WRONG ONE.
//
// Eleven pages called getOptimiserInput and not one of them asked whether the read had worked.
// A failed row read does not throw: it comes back as the same object with every figure at zero.
// So a man whose database was unreadable for ten seconds opened his Tax page and read that he had
// earned nothing, spent nothing and owed nothing, in the same confident type the real figures wear.
// He has no way to tell that screen from a true one, and the true one is the whole product.
//
// ⚠️ AND IT IS NOT A SPINNER OR A RETRY. He is up a ladder and he asked one question. The screen
// says what happened, says his books are untouched, and says when to come back. Three sentences,
// no button: doc 103's rule is that the best button is no button, and there is nothing here for
// him to decide.
//
// ⚠️ THE NAV STAYS. A page that drops its own navigation strands him on the one screen that is
// already telling him something went wrong.
//
// 🔴 THE WORDING IS SIGNED AND IT IS ONE CONSTANT. It was signed by delegation on 18 August and
// is recorded in the backlog in these exact words. It lives here once, every door reaches it
// through this file, and test/optimiserdoor.test.mjs derives the caller list from disk rather
// than holding a list of eleven, because a list of eleven rots the first time somebody adds a
// twelfth, which is exactly how this item came to exist.
// ═════════════════════════════════════════════════════════════
export const RECORDS_UNREADABLE_LINE = 'Lekhio could not read your records just now, so this page is not showing figures. Nothing has happened to your books. Refresh in a minute.';

// `inline` is for a page whose failed read costs it one CARD rather than the whole screen:
// /app/setup is mid signup and still owes him the step he is standing on. Same sentence, same
// constant, no second wording anywhere.
export function RecordsUnreadable({ current, title, inline }: { current?: string; title?: string; inline?: boolean }) {
  if (inline) return <p style={S.line}>{RECORDS_UNREADABLE_LINE}</p>;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current={current ?? '/app'} />

      <section className="lek-card">
        {title ? <h1 className="lek-h2">{title}</h1> : null}
        <p style={S.line}>{RECORDS_UNREADABLE_LINE}</p>
      </section>
    </main>
  );
}

const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },
  line: { fontSize: TYPE.body, lineHeight: 1.6, color: MUTED, margin: `${SPACE.xs}px 0 0`, maxWidth: '62ch' },
};
