import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { requestRerun } from '../../../../../lib/bridge';

export const runtime = 'nodejs';

// THE RETRY BUTTON'S BACK END. A team member asks a worker to sweep again off-schedule (e.g. after we
// fix what Pehredaar flagged). Team-gated, same posture as the rest of the console. It only records a
// request — the worker itself claims it at the top of its next run via the secret-gated /claim route and
// does the actual work. Nothing here changes a setting or touches customer data.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { worker?: string };
  const worker = String(b.worker ?? '').slice(0, 40).trim();
  if (!worker) return NextResponse.json({ error: 'worker required' }, { status: 400 });

  const ok = await requestRerun(worker, user.email ?? null);
  if (!ok) return NextResponse.json({ error: 'could not queue the re-check' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
