import { NextRequest, NextResponse, after } from 'next/server';
import { captureContact } from '../../../lib/supabase';
import { rateLimitedShared, clientIp } from '../../../lib/ratelimit';
import { hasEmailConfig, sendLeadConfirmEmail } from '../../../lib/email';
import { confirmUrl, unsubscribeUrl } from '../../../lib/leadtoken';

// Consent engine + CRM capture. Stores a lead ONLY with an explicit true consent flag, the exact
// wording agreed, a timestamp, IP and user agent, so consent is provable under UK PECR. On top of that
// it now drops a full CRM contact: attribution (which tool/stream/campaign), an optional WhatsApp
// number with its own consent, and a timeline event. We never log the email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    if (await rateLimitedShared(`lead:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const b = (body ?? {}) as Record<string, unknown>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    // No explicit consent, no marketing record. This is the whole point.
    if (b.consent !== true) {
      return NextResponse.json({ error: 'Please confirm you are happy to hear from us.' }, { status: 400 });
    }

    // The tool that captured them is the entry point; stream defaults to free-tool unless the caller
    // names an ad/organic stream. whatsapp is optional and carries its own consent flag.
    const source = str(b.source, 80);
    const meta = (b.meta && typeof b.meta === 'object') ? (b.meta as Record<string, unknown>) : null;

    await captureContact({
      email,
      whatsapp: str(b.whatsapp, 32),
      waConsent: b.wa_consent === true,
      consent: true,
      consentText: str(b.consent_text, 500),
      resultNote: str(b.result_note, 200),
      stream: str(b.stream, 40) ?? 'free-tool',
      entryPoint: source,
      sourceTag: str(b.source_tag, 120),
      meta,
      ip: clientIp(req),
      userAgent: (req.headers.get('user-agent') || '').slice(0, 300),
    });

    // Double opt in, after the response so it never slows the request. If email is off, single opt in
    // is lawful and the consent record stands on its own.
    if (hasEmailConfig()) {
      after(async () => {
        try { await sendLeadConfirmEmail(email, confirmUrl(email), unsubscribeUrl(email)); }
        catch { /* best effort */ }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[lead] Exception:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
