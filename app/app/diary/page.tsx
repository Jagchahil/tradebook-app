import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { listDiaryJobs } from '../../../lib/supabase';
import { normaliseDiaryRow, splitDiary, whenPhrase, pastDayPhrase, durationPhrase } from '../../../lib/diary';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, INK, LINE, MOTION, MUTED, ON_RIVER, PANEL, PAPER, RADIUS,
  RIVER, RIVER_DEEP, SPACE, SURFACE, TYPE,
} from '../../../lib/tokens';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE JOBS DIARY. What is coming, what has wrapped up, and the one press that turns a finished
// job into an invoice HE forwards.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS PAGE IS A SURFACE. Every decision it renders, which jobs are upcoming, which slot has
// passed, every phrase like "tomorrow at 8am", is made in lib/diary.ts on fixtures a test can
// attack. The page reads rows, hands them to the module, and draws what comes back.
//
// ⚠️ SERVER RENDERED, NO CLIENT SCRIPT, like every screen under app/app. Every button is a
// plain form post to /api/diary, the row id travels in the form body, and no id ever reaches a
// URL, which is test/webauth.test.mjs's standing rule.
//
// ⚠️ A FAILED READ IS SAID PLAINLY. With the diary table not yet migrated, or Supabase having a
// bad minute, listDiaryJobs returns null and this page says it could not read the diary, the
// same honest line the invoices and money screens use. It never shows an empty diary he did not
// empty, and it never crashes.
//
// ⚠️ DRAFT THE INVOICE HANDS OVER, NOTHING MORE. The press marks the job as taken to invoicing
// and lands him on /app/invoices/new with the customer name filled in. The work and the price
// on that invoice are his to type, and nothing on any path from this page contacts his
// customer. Sending is his, always.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function notice(problem: string | undefined): string | null {
  switch (problem) {
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so try it again.';
    case 'missing':
      return 'We could not find that job. If it is still in the list, load the page again.';
    default:
      return null;
  }
}

function saidDone(code: string | undefined): string | null {
  switch (code) {
    case 'added':
      return 'In the diary.';
    case 'done':
      return 'Marked done. It is below, one press from an invoice.';
    case 'removed':
      return 'Removed.';
    default:
      return null;
  }
}

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = saidDone(one('done')) ?? notice(one('problem'));
  const locked = one('locked') === '1';

  const raw = await listDiaryJobs(user.id);
  const read = raw !== null;
  const jobs = read ? raw.map(normaliseDiaryRow).filter((j): j is NonNullable<typeof j> => j !== null) : [];
  const now = new Date();
  const { upcoming, awaiting, past } = splitDiary(jobs, now);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/diary" />

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
          <p style={S.empty}>We could not read your diary just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Coming up</h2>
              <ul style={S.list}>
                {upcoming.map((job) => (
                  <li key={job.id} style={S.row}>
                    <div style={S.rowMain}>
                      <span style={S.title}>{job.title}</span>
                      <span style={S.note}>
                        {whenPhrase(job.startsAt, now)}, {durationPhrase(job.startsAt, job.endsAt)}
                        {job.customerName ? `, for ${job.customerName}` : ''}
                      </span>
                    </div>
                    <div style={S.acts}>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="done" />
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="lek-act">Done</button>
                      </form>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="remove" />
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="lek-act">Remove</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {awaiting.length > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Wrapped up, not invoiced</h2>
              <ul style={S.list}>
                {awaiting.map((job) => (
                  <li key={job.id} style={S.row}>
                    <div style={S.rowMain}>
                      <span style={S.title}>{job.title}</span>
                      <span style={S.note}>
                        wrapped up {pastDayPhrase(job.endsAt, now)}
                        {job.customerName ? `, for ${job.customerName}` : ''}
                      </span>
                    </div>
                    <div style={S.acts}>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="draft" />
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="lek-draft">Draft the invoice</button>
                      </form>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="remove" />
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="lek-act">Remove</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
              {/* The weight of the button, said beside it: what it opens, what stays his. */}
              <p style={S.cardNote}>
                Draft the invoice opens a new one with the name filled in. The work and the price
                are yours to type, and nothing goes to your customer from here.
              </p>
            </section>
          ) : null}

          {jobs.length === 0 ? (
            <section className="lek-card">
              <p style={S.empty}>Nothing in the diary yet.</p>
              <p style={S.quiet}>
                Put a job in below and it sits here with when it starts and how long it takes.
                When it wraps up, the invoice is one press away.
              </p>
            </section>
          ) : null}

          <section className="lek-card">
            <h2 className="lek-h2">Put a job in</h2>
            <form action="/api/diary" method="post">
              <input type="hidden" name="action" value="add" />

              <label htmlFor="title" style={S.label}>What is the job</label>
              <input id="title" name="title" type="text" maxLength={120} required className="lek-field" placeholder="Measuring up" />

              <div style={S.pairRow}>
                <div style={S.pairCell}>
                  <label htmlFor="date" style={S.label}>Day</label>
                  <input id="date" name="date" type="date" required className="lek-field" />
                </div>
                <div style={S.pairCell}>
                  <label htmlFor="time" style={S.label}>Start</label>
                  <input id="time" name="time" type="time" required className="lek-field" />
                </div>
              </div>

              <label htmlFor="days" style={S.label}>How long</label>
              {/* Whole days, a short list. A slot that needs finer grain than a day is a slot
                  this diary is not pretending to manage: it is not a calendar, it is a list of
                  jobs and the question each one earns when it ends. */}
              <select id="days" name="days" className="lek-field" defaultValue="1">
                <option value="1">One day</option>
                <option value="2">Two days</option>
                <option value="3">Three days</option>
                <option value="4">Four days</option>
                <option value="5">Five days</option>
                <option value="7">A week</option>
                <option value="14">Two weeks</option>
              </select>

              <label htmlFor="customer" style={S.label}>Who for, if you want it kept with the job</label>
              <input id="customer" name="customer" type="text" maxLength={120} className="lek-field" />
              <p style={S.fieldNote}>Only so the invoice starts with the name filled in. We never contact your customer.</p>

              <button type="submit" className="lek-primary">Put it in the diary</button>
            </form>
          </section>

          {past.length > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Earlier</h2>
              <ul style={S.list}>
                {past.map((job) => (
                  <li key={job.id} style={S.row}>
                    <div style={S.rowMain}>
                      <span style={S.titlePast}>{job.title}</span>
                      <span style={S.note}>
                        wrapped up {pastDayPhrase(job.endsAt, now)}, invoice drafted
                      </span>
                    </div>
                    <div style={S.acts}>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="remove" />
                        <input type="hidden" name="id" value={job.id} />
                        <button type="submit" className="lek-act">Remove</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <p style={S.foot}>
        A job that wraps up asks one question: draft the invoice? The figures on it stay yours to
        type, and sending it stays yours to do.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  // 16px pinned on every field: under 16 iOS Safari zooms the page the moment one is focused.
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%}`,
  `.lek-primary{width:100%;margin-top:${SPACE.md}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-act{padding:7px 12px;font-size:${TYPE.note}px;font-weight:700;font-family:${FONT};color:${INK};background:${SURFACE};border:1px solid ${LINE};border-radius:${RADIUS.pill}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-draft{padding:7px 14px;font-size:${TYPE.note}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.pill}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-draft:hover{background:${RIVER_DEEP}}`,
  `@media(min-width:${BREAK.desk}px){.lek-primary{width:auto;min-width:264px}}`,
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

  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.sm, padding: `${SPACE.sm}px 0`, borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  title: { fontSize: TYPE.strong, fontWeight: 800, letterSpacing: '-0.01em' },
  titlePast: { fontSize: TYPE.body, fontWeight: 700, color: MUTED },
  note: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },
  acts: { display: 'flex', gap: SPACE.xs, alignItems: 'center', flexWrap: 'wrap' },

  cardNote: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `${SPACE.sm}px 0 0`, maxWidth: '62ch' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '12px 0 6px' },
  fieldNote: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '6px 0 0' },
  pairRow: { display: 'flex', gap: SPACE.xs },
  pairCell: { flex: '1 1 0', minWidth: 0 },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
