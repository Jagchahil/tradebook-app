import { NextRequest, NextResponse, after } from 'next/server';
import { insertMarketingLead } from '../../../lib/supabase';
import { rateLimited, clientIp } from '../../../lib/ratelimit';
import { hasEmailConfig, sendLeadConfirmEmail } from '../../../lib/email';
import { confirmUrl, unsubscribeUrl } from '../../../lib/leadtoken';

// Consent engine endpoint. Stores a marketing lead ONLY with an explicit, true
// consent flag, together with the exact wording the user agreed to, a timestamp,
// their IP and user agent, so the consent is provable if ever challenged. This is
// what makes emailing them later lawful under UK PECR. We never log the email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    if (rateLimited(`lead:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const b = (body ?? {}) as {
      email?: unknown;
      source?: unknown;
      result_note?: unknown;
      consent?: unknown;
      consent_text?: unknown;
    };

    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }

    // No explicit consent, no marketing record. This is the whole point.
    if (b.consent !== true) {
      return NextResponse.json({ error: 'Please confirm you are happy to hear from us.' }, { status: 400 });
    }

    const source = typeof b.source === 'string' ? b.source.slice(0, 80) : null;
    const resultNote = typeof b.result_note === 'string' ? b.result_note.slice(0, 200) : null;
    const consentText = typeof b.consent_text === 'string' ? b.consent_text.slice(0, 500) : null;

    await insertMarketingLead({
      email,
      source,
      result_note: resultNote,
      consent: true,
      consent_text: consentText,
      ip: clientIp(req),
      user_agent: (req.headers.get('user-agent') || '').slice(0, 300),
    });

    // Double opt in. If email is configured, send a confirmation link after the
    // response so it never slows the request. If email is off, the consent record
    // already stands on its own (single opt in is lawful), so nothing breaks.
    if (hasEmailConfig()) {
      after(async () => {
        try {
          await sendLeadConfirmEmail(email, confirmUrl(email), unsubscribeUrl(email));
        } catch {
          /* best effort */
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never echo the body: it holds the email.
    console.error('[lead] Exception:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
