import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { getDraft, updateDraftBody, setDraftStatus } from '../../../../../lib/dakiya';
import { sendReplyEmail } from '../../../../../lib/email';
import { appendActivity } from '../../../../../lib/bridge';

export const runtime = 'nodejs';

// THE APPROVAL GATE. Only a team member can act here (same fresh team_members check as the rest of the
// console). 'send' persists any inline edits, then sends the reply BRANDED from the lane address the
// enquiry came in on, and marks the draft sent. 'dismiss' quietly files it. A draft can only be decided
// once. Nothing sends unless RESEND_API_KEY is set and the from-address is on the verified domain.
interface Body {
  id?: string;
  action?: 'send' | 'dismiss';
  subject?: string;
  body?: string;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body.id || (body.action !== 'send' && body.action !== 'dismiss')) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  const draft = await getDraft(body.id);
  if (!draft) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (draft.status !== 'pending') return NextResponse.json({ error: 'already decided' }, { status: 409 });

  if (body.action === 'dismiss') {
    await setDraftStatus(draft.id, 'dismissed');
    await appendActivity([{ worker_key: 'dakiya', kind: 'info', message: `Dismissed a ${draft.lane} draft.` }]);
    return NextResponse.json({ ok: true, status: 'dismissed' });
  }

  // action === 'send'. Persist any inline edits first, then send.
  const subject = (body.subject ?? draft.draft_subject).slice(0, 300);
  const bodyText = (body.body ?? draft.draft_body).slice(0, 20000);
  if (body.subject != null || body.body != null) {
    await updateDraftBody(draft.id, subject, bodyText);
  }

  const sent = await sendReplyEmail({
    fromAddress: draft.to_alias,
    fromName: 'Lekhio',
    to: draft.from_email,
    subject,
    bodyText,
    inReplyTo: draft.message_id,
  });
  if (!sent.ok) {
    return NextResponse.json(
      { error: 'send failed — check RESEND_API_KEY is set and the from-address is on the verified domain.' },
      { status: 502 },
    );
  }

  await setDraftStatus(draft.id, 'sent');
  await appendActivity([{ worker_key: 'dakiya', kind: 'done', message: `Sent a reply from ${draft.to_alias}.` }]);
  return NextResponse.json({ ok: true, status: 'sent' });
}
