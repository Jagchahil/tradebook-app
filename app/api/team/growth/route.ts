import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken, readTeamMember,
  captureContact, setLeadConfirmed, setContactStage,
  countContactsByStage, listRecentInPersonLeads,
} from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { buildInPersonLead } from '../../../../lib/growth';

export const runtime = 'nodejs';

// SAUDAGAR'S DESK — the CRM read + the in-person capture write.
//   GET  the pipeline stage counts and the most recent door-to-door leads (CRM contact fields only).
//   POST a lead a rep just took at the door: consent recorded, contact captured, enrolled in the flow.
// Same gate as the rest of the console: a row in team_members, re-checked on THIS request. Never
// returns or writes a customer's receipts, income, tax figures or phone number.

async function gate(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { member: member! };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const [pipeline, recent] = await Promise.all([countContactsByStage(), listRecentInPersonLeads(12)]);
  return NextResponse.json({ pipeline, recent });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty */ }
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
  const bool = (k: string) => body[k] === true;

  const built = buildInPersonLead({
    businessName: str('businessName'),
    contactName: str('contactName'),
    email: str('email'),
    whatsapp: str('whatsapp'),
    notes: str('notes'),
    leaflet: str('leaflet'),
    emailConsent: bool('emailConsent'),
    waConsent: bool('waConsent'),
    signedUp: bool('signedUp'),
    repEmail: g.member.email,
  }, new Date().toISOString());

  if (!built.ok || !built.capture) {
    return NextResponse.json({ error: built.error || 'Could not add that lead.' }, { status: 400 });
  }

  const wrote = await captureContact({
    email: built.capture.email,
    name: built.capture.name,
    whatsapp: built.capture.whatsapp,
    consent: built.capture.consent,
    waConsent: built.capture.waConsent,
    consentText: built.capture.consentText,
    source: built.capture.source,
    stream: built.capture.stream,
    entryPoint: built.capture.entryPoint,
    sourceTag: built.capture.sourceTag,
    resultNote: built.capture.resultNote,
    meta: built.capture.meta,
  });
  if (!wrote) return NextResponse.json({ error: 'Could not save that lead.' }, { status: 500 });

  // A face-to-face lead has been met, so they start at 'warming', not cold. And if they gave email
  // consent at the door, confirm them straight into the nurture flow — the verbal consent recorded
  // above is the double opt-in, so no confirmation email is sent.
  await setContactStage(built.capture.email, 'warming');
  let enrolled = false;
  if (built.enroll) { enrolled = await setLeadConfirmed(built.capture.email); }

  return NextResponse.json({ ok: true, enrolled });
}
