import { NextRequest, NextResponse } from 'next/server';
import { createSignup } from '../../../lib/supabase';
import { searchCompanies, getCompany, companiesHouseEnabled } from '../../../lib/companieshouse';
import { rateLimitedShared, clientIp } from '../../../lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  // The form collects a UK number without the country code. Store it E164.
  let d = digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return `+44${d}`;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function str(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// THE COMPANIES HOUSE LOOKUP, SERVER SIDE.
//
// The web signup page promised this and never did it. The lookup itself has always worked, in the
// MOBILE setup flow, which can call /api/companies-house because by then the user is signed in.
// /start has no session at any point, and opening that endpoint to anonymous callers would reopen
// the hole the 26 July audit closed: one shared key, 600 requests per five minutes, and a failure
// mode where lookup quietly dies for every real customer mid signup.
//
// So it runs here, where the key already lives and where our own rate limiting already applies.
//
// ⚠️ IT NEVER FAILS THE SIGNUP. Not once, for any reason. A man giving us his details must not lose
// his account because Companies House is having an afternoon. Every path returns an outcome and the
// signup carries on.
//
// ⚠️ AND IT ONLY ACCEPTS AN UNAMBIGUOUS MATCH. If the register returns three companies with similar
// names we take NONE of them, because picking the first would attach a stranger's company number to
// his account and he would never know we guessed. Same rule as lib/siccodes: no confident answer
// means no answer. When he can see the list and choose, which is the web app at item 6, he chooses.
interface CompanyLookup {
  outcome: 'matched' | 'no_match' | 'not_ltd' | 'unavailable';
  companyNumber: string | null;
  companyName: string | null;
  registeredOffice: string | null;
}

async function lookUpCompany(tradeType: string | null, typedName: string | null): Promise<CompanyLookup> {
  const none = { companyNumber: null, companyName: null, registeredOffice: null };
  if (tradeType !== 'ltd') return { outcome: 'not_ltd', ...none };
  if (!typedName || typedName.trim().length < 2) return { outcome: 'no_match', ...none };
  if (!companiesHouseEnabled()) return { outcome: 'unavailable', ...none };

  try {
    const matches = await searchCompanies(typedName.trim(), 5);
    // Only ACTIVE companies. A dissolved one with a similar name is not his.
    const live = matches.filter((m) => (m.status || '').toLowerCase() === 'active');
    if (live.length === 0) return { outcome: 'no_match', ...none };

    // An exact name match wins outright. Otherwise we require exactly one candidate: two plausible
    // companies means we do not know which is his, and a guess here is a stranger's company number
    // on his account.
    const typed = typedName.trim().toLowerCase();
    const exact = live.filter((m) => m.name.trim().toLowerCase() === typed);
    const chosen = exact.length === 1 ? exact[0] : live.length === 1 ? live[0] : null;
    if (!chosen) return { outcome: 'no_match', ...none };

    const profile = await getCompany(chosen.companyNumber);
    if (!profile) return { outcome: 'no_match', ...none };

    const o = profile.registeredOffice;
    const address = [o.line1, o.line2, o.locality, o.postcode].filter(Boolean).join(', ');
    return {
      outcome: 'matched',
      companyNumber: profile.companyNumber,
      companyName: profile.name,
      registeredOffice: address || null,
    };
  } catch {
    // Could not reach the register. NOT the same as "his company does not exist", and the column
    // records which, so a support question later has a real answer.
    return { outcome: 'unavailable', ...none };
  }
}

// Optional Cloudflare Turnstile check. Inert until TURNSTILE_SECRET is set. When
// you enable it, also render the widget on /start so a token is sent here.
async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (await rateLimitedShared(`onboard:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const b = (body ?? {}) as Record<string, unknown>;

    // Bot traps. A hidden honeypot field humans never see, and a minimum fill
    // time. Either being tripped means an automated submission. We return ok so a
    // bot gets no signal, and we save nothing.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return NextResponse.json({ ok: true });
    }
    if (typeof b.ts === 'number' && b.ts < 1500) {
      return NextResponse.json({ ok: true });
    }
    // Optional Turnstile. Only enforced once the secret is configured.
    if (process.env.TURNSTILE_SECRET) {
      const token = typeof b.turnstileToken === 'string' ? b.turnstileToken : '';
      const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET, token, clientIp(req));
      if (!ok) {
        return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
      }
    }

    // 🔴 THE MOBILE IS OPTIONAL. The account is created from the proved EMAIL alone, and a number
    // typed here lands on signups.phone, which nothing that signs a man in or runs his books reads
    // (WhatsApp binds a fresh number from the handset). This door used to reject a signup with no
    // phone while /start told the customer the number was "only used to link WhatsApp when you are
    // ready", which cannot both be true. cleanPhone returns null for a missing or malformed number;
    // an empty string is stored, which normalizeUkPhone leaves empty and every reader treats as
    // absent (guarded by `if (phone)`), so no schema change is needed. The EMAIL stays required: it
    // is the account.
    const phone = cleanPhone(b.phone) ?? '';
    const email = cleanEmail(b.email);
    if (!email) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    // The income streams the user ticked (job, property, loan). Kept now, not dropped:
    // they are the reliefs reconcileSignupToUser carries into the app so nothing is asked twice.
    const streams = Array.isArray(b.streams)
      ? (b.streams as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 10)
      : null;

    // Look the company up before saving, so the row lands complete rather than being patched later.
    // Bounded by lib/companieshouse's own timeouts and it can never throw: lookUpCompany catches
    // everything and returns an outcome.
    const co = await lookUpCompany(str(b.tradeType, 20), str(b.name));

    try {
      await createSignup({
        phone,
        email: email || null,
        trade_type: str(b.tradeType, 20),
        name: str(b.name),
        // The human being. For a sole trader the form sends the same value in both, which is
        // correct: his name IS the business name.
        person_name: str(b.personName) ?? str(b.name),
        // 🔴 HIS SLICE OF THE FIRM'S PROFIT, AND IT IS DROPPED FOR EVERYBODY ELSE. A share on a
        // sole trader is a percentage of nothing, and stored it would sit in the row waiting for
        // somebody to read it as meaningful. Whole numbers 1 to 100 only: 0 is not an answer
        // anybody means and would tell the engine he earns nothing at all.
        partnership_share:
          str(b.tradeType, 20) === 'partnership'
          && typeof b.partnershipShare === 'number'
          && Number.isInteger(b.partnershipShare)
          && b.partnershipShare >= 1
          && b.partnershipShare <= 100
            ? b.partnershipShare
            : null,
        company_number: co.companyNumber,
        company_name: co.companyName,
        registered_office: co.registeredOffice,
        company_lookup: co.outcome,
        trade: str(b.trade),
        postcode: str(b.postcode, 12),
        address: str(b.address, 300),
        vat_registered: typeof b.vat === 'boolean' ? b.vat : null,
        streams,
        offer: str(b.offer, 40),
        referred_by_code: str(b.ref, 12), // sanitised in createSignup
        // A SIC code lib/siccodes matched on the web from what they typed about their trade.
        // createSignup re-derives the label from this code itself; nothing here is trusted verbatim.
        sic_code: str(b.sicCode, 10),
      });
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : 'unknown';
      console.error('[onboard] Save error:', detail);
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
    }

    // 🔴 THE WELCOME EMAIL DOES NOT FIRE HERE ANY MORE.
    //
    // This route saves the answers. It does not create an account: that happens at
    // /api/signup/verify, on a proved code. Welcoming a man here meant welcoming him to something he
    // had not joined, and every abandoned signup got a welcome to an account that did not exist.
    // The welcome now fires from the far side of verification, where it is true.

    // Never log the personal details. Just confirm one signup saved.
    console.log('[onboard] Saved one signup');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[onboard] Exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
