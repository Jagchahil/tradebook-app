import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared } from '../../../lib/ratelimit';
import {
  incomeRowsWithoutCis, recordCisOnIncome, readCircumstances,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { cisCapture } from '../../../lib/reviewpile';
import { worksUnderCis } from '../../../lib/circumstances';
import { resolveProofYear } from '../../../lib/proofyear';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';

export const runtime = 'nodejs';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TELL US WHAT THE CONTRACTOR TOOK OFF A PAYMENT YOU ALREADY CONFIRMED.
//
// 🔴 WHY THIS EXISTS AT ALL, WHEN THE REVIEW PILE ALREADY ASKS. Found 11 August 2026 by walking
// production as a groundworker after the pile question was built.
//
// The pile asks about money that is waiting for a yes. Danny's 62 contractor deposits were
// confirmed weeks ago, in one bulk import, before anything in this product knew what CIS was. The
// pile is finished with them for ever. So the question that lives only there fixes the NEXT
// subcontractor and leaves this one reading "Put by for tax £3,337" on a January that is actually
// a refund, until he files and an accountant tells him.
//
// ⚠️ AND IT IS NOT A MIGRATION PROBLEM, IT IS THE ORDINARY SHAPE OF THE SCHEME. A contractor has
// until 14 days after the end of the tax month to hand over a payment and deduction statement. The
// money lands first and the paperwork follows. So the day a man can answer "what came off that
// one" is routinely WEEKS after the day the payment arrived. A product that can only ask at the
// moment money lands is asking on the one day he cannot possibly know the answer.
//
// So the same question, on the CIS screen, over money he confirmed long ago.
//
// ⚠️ ONE PAYMENT, ONE FIGURE, NO GROUPS. Every deduction comes off its own statement and no two
// are alike. There is deliberately no way to say "apply 20 percent to all of these": that would be
// this product guessing at his materials, and materials are exactly what the rate is not charged
// on. lib/reviewpile.ts cisProposal() prints the arithmetic beside the box and never into it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THE YEAR TRAVELS BACK WITH HIM. Without it, answering a 2025/26 row bounced him onto the
// current year and the row he had just filled in was nowhere to be seen, which reads exactly like
// the write failing.
function back(req: NextRequest, done: string, year?: number) {
  const y = year ? `&y=${year}` : '';
  return NextResponse.redirect(new URL(`/app/tax/cis?done=${done}${y}`, req.url), 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`cis:${user.id}`, 200, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // Read only is read only. Recording a deduction is a write to his books, and the paywall rule is
  // the same one the pile follows: he can still SEE everything, he cannot change it.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/tax/cis');

  // The web page ships no client script, so this arrives as a plain form post. JSON is accepted for
  // the phone app, exactly as /api/pile does it.
  const type = req.headers.get('content-type') ?? '';
  const form = type.includes('form');
  let id = '';
  let typed = '';
  let yearRaw = '';
  if (form) {
    const f = await req.formData();
    id = String(f.get('id') ?? '');
    typed = String(f.get('cis') ?? '');
    yearRaw = String(f.get('y') ?? '');
  } else {
    const body = (await req.json().catch(() => null)) as { id?: string; cis?: string; y?: string } | null;
    id = String(body?.id ?? '');
    typed = String(body?.cis ?? '');
    yearRaw = String(body?.y ?? '');
  }

  // 🔴 HE HAS TO HAVE TOLD US HE IS IN THE SCHEME. The screen only draws the question for a man who
  // has, and this checks again, because a page is a suggestion and a route is a door. A failed read
  // is not a yes: worksUnderCis maps a skip, a missing row and a null all to false.
  const answers = await readCircumstances(user.id).catch(() => null);
  if (!worksUnderCis(answers)) return form ? back(req, 'nocis') : NextResponse.json({ error: 'not_cis' }, { status: 403 });

  // ⚠️ THE MONEY IS READ SERVER SIDE, ALWAYS. The browser sends an id, a figure he typed off a
  // statement, and which year he was looking at. It never sends the amount, so it can never move
  // his turnover by posting one.
  //
  // 🔴 THE YEAR IS CLAMPED BY THE SAME FUNCTION THE PAGE USES, so a query string cannot reach a
  // window the screen would never draw, and an absent or nonsense value falls back to the current
  // year exactly as it did before the chooser existed.
  const year = resolveProofYear(yearRaw, new Date());
  const rows = await incomeRowsWithoutCis(user.id, `${year}-04-06`, `${year + 1}-04-05`);
  const row = rows.find((r) => r.id === id);
  if (!row) return form ? back(req, 'gone', year) : NextResponse.json({ error: 'not_found' }, { status: 404 });

  const patch = cisCapture(row.amount, typed);
  if (!patch) return form ? back(req, 'bad', year) : NextResponse.json({ error: 'bad_cis' }, { status: 400 });

  // recordCisOnIncome carries its own guards, in the same statement as the write: his row, the
  // amount unchanged since we read it, and no deduction recorded already. A zero back is a refusal
  // and it is never dressed as a success.
  const applied = await recordCisOnIncome(user.id, row.id, row.amount, patch);
  return form ? back(req, applied ? 'saved' : 'gone', year)
    : NextResponse.json({ applied }, { status: applied ? 200 : 409 });
}
