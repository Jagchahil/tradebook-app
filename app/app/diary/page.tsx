import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  listDiaryJobs, readDiaryJob, listJobPhotos, listJobMaterials, listUntaggedCosts,
} from '../../../lib/supabase';
import { normaliseDiaryRow, splitDiary, whenPhrase, pastDayPhrase, durationPhrase } from '../../../lib/diary';
import { hoursFromSlot, hoursGuessPhrase, materialsTotal, CAPTION_MAX } from '../../../lib/jobphotos';
import { gbp2 } from '../../../lib/money';
import { READONLY_TITLE, READONLY_LINE } from '../../../lib/gate';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../lib/apptheme';
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

// The one job screen rides a query parameter rather than a path segment, because there is no
// folder named [id] anywhere under app/app and test/webauth.test.mjs fails the build if one
// appears. Shape checked here before it goes anywhere near a query.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // The job screen's own refusals. Each one says what did not happen and what is still true,
    // because a man who has just watched an upload fail wants to know whether to try again or to
    // stop trying.
    case 'nophoto':
      return 'No picture came through with that. Nothing was saved, so pick the photo and try again.';
    case 'big':
      return 'That picture is over 4MB, which is bigger than we keep. Nothing was saved.';
    case 'type':
      return 'We keep photos as JPEG, PNG, WebP or GIF, and that was none of them. Nothing was saved.';
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
    case 'photo':
      return 'Kept with the job.';
    case 'photogone':
      return 'Picture removed.';
    case 'tagged':
      return 'Filed against the job.';
    case 'untagged':
      return 'Taken off the job. The receipt is still in your books.';
    case 'retimed':
      return 'Times updated.';
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
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fdiary');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = saidDone(one('done')) ?? notice(one('problem'));
  const locked = one('locked') === '1';

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // ONE JOB, IN FULL. The pictures, the hours and what it cost him.
  //
  // ⚠️ THE JOB ID IS A QUERY PARAMETER AND NOT A PATH SEGMENT, and that is not a shortcut. There
  // is no folder named [id] anywhere under app/app and test/webauth.test.mjs fails the build if
  // one appears, because an id in a path is the shape that lets a customer edit somebody else's
  // in the address bar. The defence is not the shape of the URL though: it is that every read
  // below filters on the SESSION'S user id AND the row, so a uuid that is not his matches
  // nothing and this screen says it could not find that job.
  //
  // ⚠️ NOTHING HERE COMPUTES A FIGURE. materialsTotal decides which rows count, hoursFromSlot
  // turns two timestamps into a number, both in lib/jobphotos.ts on fixtures a test can attack.
  // This branch reads rows and draws what comes back.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const now = new Date();
  const jobParam = one('job') ?? '';
  if (UUID_RE.test(jobParam)) {
    const row = await readDiaryJob(user.id, jobParam);
    if (!row) {
      return (
        <main className="lek-wrap" style={S.wrap}>
          <style>{CSS}</style>
          <AppNav current="/app/diary" />
          <section className="lek-card">
            <p style={S.empty}>We could not find that job.</p>
            <p style={S.quiet}>It may have been removed. Your diary is below.</p>
            <p style={{ marginTop: 12 }}><a href="/app/diary" style={S.back}>Back to the diary</a></p>
          </section>
        </main>
      );
    }
    const job = normaliseDiaryRow(row);
    const photos = await listJobPhotos(user.id, jobParam);
    const costs = await listJobMaterials(user.id, jobParam);
    const spare = await listUntaggedCosts(user.id);
    // 🔴 EVERY PICTURE IS DRAWN FROM OUR OWN ORIGIN, AND THE FIRST VERSION WAS NOT.
    //
    // It minted a ten minute signed URL on the storage host and put it straight in the img src.
    // Storage served it correctly and NOTHING EVER RENDERED, because next.config.mjs sends
    // `img-src 'self' data: blob:` and the storage origin is not in that list. The feature stored,
    // signed and served perfectly and could not put one photograph on one screen. It was found by
    // walking production; no assertion covered it, because every one of them was about the path,
    // the row and the erasure rather than about a picture appearing.
    //
    // /api/diary/photo/view streams the bytes from a route we own, so `img-src 'self'` is
    // untouched and no signed URL is ever written into this document. No await here either: the
    // browser fetches each one, so the page renders without waiting on storage at all.
    const shots = photos
      ? photos.map((p) => ({ ...p, src: `/api/diary/photo/view?id=${encodeURIComponent(p.id)}` }))
      : [];
    const spend = materialsTotal(costs ?? []);
    const hours = job ? hoursFromSlot(job.startsAt, job.endsAt) : null;

    return (
      <main className="lek-wrap" style={S.wrap}>
        <style>{CSS}</style>
        <AppNav current="/app/diary" />
        <p><a href="/app/diary" style={S.back}>Back to the diary</a></p>
        {said ? <p style={S.said}>{said}</p> : null}

        <section className="lek-card">
          <h1 style={S.jobTitle}>{row.title}</h1>
          <p style={S.note}>
            {job ? whenPhrase(job.startsAt, now) : ''}
            {job ? `, ${durationPhrase(job.startsAt, job.endsAt)}` : ''}
            {row.customer_name ? `, for ${row.customer_name}` : ''}
          </p>

          {/* ── THE HOURS, SAID AS THE GUESS THEY ARE ────────────────────────────────────────
              🔴 THIS IS THE ONE NUMBER ON THIS SCREEN THE PRODUCT DOES NOT KNOW. It is the
              length of a slot he picked off a drop down before he did the work, and it sits
              directly above a materials total summed from receipts he confirmed one at a time.
              Printed as a bare "11h" it would look exactly as solid as the money below it. So it
              says About, it says where it came from, and the correction is right beside it. */}
          {hours !== null ? (
            <div style={S.hoursBox}>
              <span style={S.hours}>{hoursGuessPhrase(hours)}</span>
              <details style={S.fold}>
                <summary style={S.foldTop}>Change the times</summary>
                <p style={S.quiet}>
                  Hours come from when the job ran, so correcting the times corrects the hours.
                  We keep one answer to that question rather than two that disagree.
                </p>
                <form action="/api/diary" method="post">
                  <input type="hidden" name="action" value="retime" />
                  <input type="hidden" name="id" value={row.id} />
                  <div style={S.pairRow}>
                    <div style={S.pairCell}>
                      <label htmlFor="rdate" style={S.label}>Day</label>
                      <input id="rdate" name="date" type="date" required className="lek-field" defaultValue={row.starts_at.slice(0, 10)} />
                    </div>
                    <div style={S.pairCell}>
                      <label htmlFor="rtime" style={S.label}>Start</label>
                      <input id="rtime" name="time" type="time" required className="lek-field" />
                    </div>
                  </div>
                  <label htmlFor="rlength" style={S.label}>How long it actually took</label>
                  <select id="rlength" name="length" className="lek-field" defaultValue="1">
                    <option value="1h">One hour</option>
                    <option value="2h">Two hours</option>
                    <option value="4h">Half a day</option>
                    <option value="8h">Eight hours</option>
                    <option value="1">One day</option>
                    <option value="2">Two days</option>
                    <option value="3">Three days</option>
                    <option value="5">Five days</option>
                    <option value="7">A week</option>
                  </select>
                  <button type="submit" className="lek-primary">Save the times</button>
                </form>
              </details>
            </div>
          ) : null}
        </section>

        {/* ── THE PICTURES ─────────────────────────────────────────────────────────────────── */}
        <section className="lek-card">
          <h2 className="lek-h2">Photos</h2>
          {photos === null ? (
            <p style={S.quiet}>We could not read your photos just now. Nothing is lost.</p>
          ) : shots.length === 0 ? (
            <p style={S.quiet}>
              No photos against this job yet. A picture of the work before you start, and another
              when it is finished, is the thing that settles an argument six months later.
            </p>
          ) : (
            <ul style={S.shots}>
              {shots.map((p) => (
                <li key={p.id} style={S.shot}>
                  {p.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.src} alt={p.caption ?? 'Photo of this job'} style={S.img} />
                  ) : (
                    <span style={S.quiet}>We could not load this picture just now.</span>
                  )}
                  {p.caption ? <span style={S.cap}>{p.caption}</span> : null}
                  <form action="/api/diary" method="post">
                    <input type="hidden" name="action" value="photo-remove" />
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="job" value={row.id} />
                    <button type="submit" className="lek-act">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form action="/api/diary/photo" method="post" encType="multipart/form-data" style={{ marginTop: 14 }}>
            <input type="hidden" name="job" value={row.id} />
            <label htmlFor="photo" style={S.label}>Add a photo</label>
            <input id="photo" name="photo" type="file" accept="image/*" required className="lek-field" />
            <label htmlFor="caption" style={S.label}>A note about it, if you want one</label>
            <input id="caption" name="caption" type="text" maxLength={CAPTION_MAX} className="lek-field" />
            <button type="submit" className="lek-primary">Keep it with the job</button>
          </form>
          {/* Said plainly, on the screen where he is putting a picture of somebody's house into
              our hands. Both halves are true and both are worth saying. */}
          <p style={S.cardNote}>
            Your photos are private to your account. Nobody else can add to this job, and nobody
            else can see it.
          </p>
        </section>

        {/* ── WHAT IT COST HIM, OFF ROWS HE HAS ALREADY CONFIRMED ──────────────────────────── */}
        <section className="lek-card">
          <h2 className="lek-h2">Materials</h2>
          {costs === null ? (
            <p style={S.quiet}>We could not read the receipts against this job just now.</p>
          ) : (
            <>
              <p style={S.total}>{gbp2(spend.total)}</p>
              <p style={S.note}>
                {spend.count === 0
                  ? 'Nothing filed against this job yet.'
                  : `From ${spend.count} receipt${spend.count === 1 ? '' : 's'} you have confirmed.`}
              </p>
              {/* ⚠️ NAMED RATHER THAN QUIETLY LEFT OUT. A receipt he has not confirmed is not in
                  the total, and a total that silently ignored rows he can see elsewhere would be
                  a figure he cannot reconcile. It points at the pile, which is where a receipt
                  becomes real. */}
              {spend.waiting > 0 ? (
                <p style={S.quiet}>
                  {spend.waiting} more {spend.waiting === 1 ? 'is' : 'are'} filed here but not
                  confirmed yet, so {spend.waiting === 1 ? 'it is' : 'they are'} not in that
                  total. <a href="/app/pile" style={S.inlineLink}>Your pile</a> is where they are
                  dealt with.
                </p>
              ) : null}
              {costs.length > 0 ? (
                <ul style={S.list}>
                  {costs.map((c) => (
                    <li key={c.id} style={S.row}>
                      <div style={S.rowMain}>
                        <span style={S.title}>{c.vendor || 'A receipt'}</span>
                        <span style={S.note}>
                          {gbp2(Math.abs(Number(c.amount) || 0))}
                          {c.confirmed === true ? '' : ', waiting on you'}
                        </span>
                      </div>
                      <form action="/api/diary" method="post">
                        <input type="hidden" name="action" value="untag" />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="job" value={row.id} />
                        <button type="submit" className="lek-act">Take off</button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}

          {spare && spare.length > 0 ? (
            <form action="/api/diary" method="post" style={{ marginTop: 14 }}>
              <input type="hidden" name="action" value="tag" />
              <input type="hidden" name="job" value={row.id} />
              <label htmlFor="cost" style={S.label}>Put one of your receipts against this job</label>
              <select id="cost" name="id" className="lek-field" required>
                {spare.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.vendor || 'A receipt')}, {gbp2(Math.abs(Number(c.amount) || 0))}
                    {c.transaction_date ? `, ${c.transaction_date}` : ''}
                  </option>
                ))}
              </select>
              <button type="submit" className="lek-primary">File it against this job</button>
              <p style={S.fieldNote}>
                This only labels the receipt. The amount, the category and your figures stay
                exactly as they are.
              </p>
            </form>
          ) : null}
        </section>
      </main>
    );
  }

  const raw = await listDiaryJobs(user.id);
  const read = raw !== null;
  const jobs = read ? raw.map(normaliseDiaryRow).filter((j): j is NonNullable<typeof j> => j !== null) : [];
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

              <label htmlFor="length" style={S.label}>How long</label>
              {/* Hours for the short visits, whole days for the rest, still a short list. The
                  first version started at one day, which forced a lie into the diary: an hour's
                  measuring up had to be booked as a day, so the slot sat underway until the next
                  morning and the invoice question arrived a day late. Half a day is four hours,
                  a morning or an afternoon, and lib/diary.ts holds that number. Finer grain than
                  an hour is a calendar's job, and this is not a calendar, it is a list of jobs
                  and the question each one earns when it ends. */}
              <select id="length" name="length" className="lek-field" defaultValue="1">
                <option value="1h">One hour</option>
                <option value="2h">Two hours</option>
                <option value="4h">Half a day</option>
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

  // ── The one job screen ──────────────────────────────────────────────────────────────────────
  back: { fontSize: TYPE.note, fontWeight: 700, color: RIVER, textDecoration: 'none' },
  inlineLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
  jobTitle: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: `0 0 ${SPACE.xs}px` },

  // The hours sit in their own quiet box rather than styled like the money below them, which is
  // the visual half of the same argument the copy makes: this figure is softer than that one.
  hoursBox: { marginTop: SPACE.sm, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px' },
  hours: { display: 'block', fontSize: TYPE.strong, fontWeight: 700, color: INK },
  fold: { marginTop: SPACE.xs },
  foldTop: { fontSize: TYPE.note, fontWeight: 700, color: RIVER, cursor: 'pointer' },

  shots: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: SPACE.sm },
  shot: { display: 'flex', flexDirection: 'column', gap: 6, background: SURFACE, borderRadius: RADIUS.md, padding: SPACE.xs },
  img: { width: '100%', height: 'auto', borderRadius: RADIUS.sm, display: 'block' },
  cap: { fontSize: TYPE.note, lineHeight: 1.45, color: MUTED },

  total: { fontSize: TYPE.stat, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, fontVariantNumeric: 'tabular-nums' },
};
