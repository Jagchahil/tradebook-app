import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { addDiaryJob, readDiaryJob, setDiaryJobStatus, deleteDiaryJob } from '../../../lib/supabase';
import { londonToUtcIso, parseDurationHours } from '../../../lib/diary';

export const runtime = 'nodejs';

// THE DIARY'S WRITES. One POST, four actions, all of them plain form posts from /app/diary,
// which ships no client script.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE ROW ID TRAVELS IN THE FORM BODY AND NEVER IN A URL. test/webauth.test.mjs's rule is
// that there is nowhere in a URL to put an id, and this route keeps it: every action posts the
// id, the session names the man, and every accessor in lib/supabase.ts filters on BOTH. A
// stranger's uuid pasted into the form matches nothing, changes nothing, and comes back as an
// honest "we could not find that job".
//
// ⚠️ THE GATE FALLS ON THE WORK, NOT ON HIS OWN RECORD. lib/gate.ts row: this route is
// 'entitled', and inside it the split is the one the elections DELETE established. Adding a job
// and taking one to invoicing are the work, the reminders and the nudge hang off them, so they
// stop when he stops paying. Marking his own job done, or removing his own row, is him keeping
// his own record straight, and a lapsed card must never leave a wrong entry standing.
//
// ⚠️ THE DRAFT ACTION HANDS OVER, IT NEVER DRAFTS. It marks the job as taken to invoicing and
// 303s him into /app/invoices/new with the customer name from HIS OWN ROW prefilled, read back
// from the database rather than trusted from the form. The work and the price on that invoice
// are his to type. This route knows no figures and invents none, and nothing anywhere sends the
// invoice: sending stays his, always.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/diary?${q}`, req.url), 303);

  // A form caller with no session is a man whose session expired while the page sat open. He
  // goes to the door and comes back to his diary, not to a JSON error he cannot read.
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/diary', req.url), 303);

  // Generous for a man typing in a week of jobs, lethal to a loop.
  if (await userBurst('diary', user.id)) return back('problem=slow');

  const f = await req.formData().catch(() => null);
  if (!f) return back('problem=bad');
  const action = String(f.get('action') ?? '');

  if (action === 'add') {
    // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. A new diary row is new work: the reminder and the
    // invoice nudge exist because this row does.
    if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/diary');

    const title = String(f.get('title') ?? '').trim().slice(0, 120);
    const day = String(f.get('date') ?? '');
    const clock = String(f.get('time') ?? '');
    // How long, in hours. The field grew hour options on 31 July 2026 and was renamed length;
    // a page rendered before that deploy still posts the old days field with a bare day count,
    // which parseDurationHours reads for exactly that tab. lib/diary.ts owns both shapes.
    const hours = parseDurationHours(String(f.get('length') ?? f.get('days') ?? ''));
    const customer = String(f.get('customer') ?? '').trim().slice(0, 120) || null;
    if (!title || hours === null) return back('problem=bad');

    // The day and time he typed are London wall clock time, resolved once, server side, into the
    // UTC instant they mean. A date that is not a real date is refused plainly rather than a
    // wrong slot being saved quietly. lib/diary.ts owns the rule and the test attacks it there.
    const startsAt = londonToUtcIso(day, clock);
    if (!startsAt) return back('problem=bad');
    const endsAt = new Date(Date.parse(startsAt) + hours * 3_600_000).toISOString();

    const done = await addDiaryJob(user.id, { title, startsAt, endsAt, customerName: customer });
    return done ? back('done=added') : back('problem=unavailable');
  }

  // Every remaining action points at one row, and the id comes from the form body, shape checked
  // before it goes anywhere near a query. The session supplies the owner: nothing a form carries
  // can widen whose rows these are.
  const id = String(f.get('id') ?? '');
  if (!UUID.test(id)) return back('problem=bad');

  if (action === 'done') {
    // Not gated: his own record, corrected by him. See the header.
    const done = await setDiaryJobStatus(user.id, id, 'done');
    return done ? back('done=done') : back('problem=missing');
  }

  if (action === 'remove') {
    // A real delete of his own row, not gated, for the same reason the elections DELETE is not:
    // taking back his own entry must never cost £12.99.
    const done = await deleteDiaryJob(user.id, id);
    return done ? back('done=removed') : back('problem=missing');
  }

  if (action === 'draft') {
    // Taking a job to invoicing is the work, so it is gated with add.
    if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/diary');

    // The prefill comes from the row we hold, never from the form. A form field here could carry
    // any words at all into the invoice; his own row can only carry the name he gave the job.
    const job = await readDiaryJob(user.id, id);
    if (!job) return back('problem=missing');

    // The status moves first, and the handover only happens if it moved. The other order could
    // leave a drafted invoice with a diary still nagging about it, which is the product
    // disagreeing with itself about one fact.
    const moved = await setDiaryJobStatus(user.id, id, 'invoiced');
    if (!moved) return back('problem=unavailable');

    const q = job.customer_name ? `?for=${encodeURIComponent(job.customer_name)}` : '';
    return NextResponse.redirect(new URL(`/app/invoices/new${q}`, req.url), 303);
  }

  return back('problem=bad');
}
