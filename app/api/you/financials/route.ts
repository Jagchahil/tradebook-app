import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../../lib/ratelimit';
import { sessionUser } from '../../../../lib/webauth';
import { getStudentLoanSettings, setUserFinancials } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// HIS WIDER INCOME PICTURE: the student loan plan, a PAYE salary, savings interest and dividends.
// The set aside is understated without them, and until this route existed only the WhatsApp flow
// could write them, so a web only customer had no way to tell us. His own facts, so the gate is
// 'always': storing them is not work we do for him, it is him correcting his own record.
//
// TWO FORMS, ONE ROUTE. The student loan page owns the plan; the NI hub owns the money amounts.
// Each posts only its own section, the route reads the current five and overlays the section it was
// handed, so one form can never wipe the other's fields. Same read-merge-write shape as
// /api/you/settings, and a failed read refuses the save rather than overwriting with zero.

const PLANS = ['plan1', 'plan2', 'plan4', 'plan5'] as const;
type Plan = (typeof PLANS)[number];

function back(req: NextRequest, to: string, code: string): NextResponse {
  const key = code === 'saved' ? 'done' : 'e';
  return NextResponse.redirect(new URL(`${to}?${key}=${code}`, req.url), 303);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await sessionUser(req);
  const form = await req.formData().catch(() => null);
  const section = String(form?.get('section') ?? '');
  const dest = section === 'income' ? '/app/tax/ni' : '/app/tax/student-loan';
  if (!user) return NextResponse.redirect(new URL(`/in?next=${dest}`, req.url), 303);
  if (await userBurst('you-financials', user.id)) return back(req, dest, 'slow');
  if (!form) return back(req, dest, 'unavailable');

  // A failed read refuses the save. getStudentLoanSettings returns null only on a read error for a
  // signed-in user (his row always exists), so null here is a wobble, not an empty record, and
  // overwriting his other figures with the defaults would be the bug this guard exists to stop.
  const current = await getStudentLoanSettings(user.id);
  if (current === null) return back(req, dest, 'unavailable');

  const next = { ...current };
  if (section === 'studentloan') {
    const raw = String(form.get('plan') ?? '');
    next.plan = (PLANS as readonly string[]).includes(raw) ? (raw as Plan) : null;
    next.postgrad = String(form.get('postgrad') ?? '') === 'on';
  } else if (section === 'income') {
    const num = (k: string): number =>
      Math.max(0, Math.round(Number(String(form.get(k) ?? '').replace(/[^0-9.]/g, '')) || 0));
    next.employmentIncome = num('employment_income');
    next.savingsIncome = num('savings_income');
    next.dividendIncome = num('dividend_income');
  } else {
    return back(req, dest, 'unavailable');
  }

  const ok = await setUserFinancials(user.id, next);
  return back(req, dest, ok ? 'saved' : 'unavailable');
}
