import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import {
  readVatProfile, saveVatProfile, saveCircumstance, forgetCircumstance,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { CIRCUMSTANCES } from '../../../lib/circumstances';
import {
  formatVrn, isValidVrn, isVatScheme, normaliseVrn, reg111Window,
} from '../../../lib/vat';

export const runtime = 'nodejs';

// WHAT HE IS FOR VAT. The door the circumstances question could never be.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS EXISTS AT ALL. THE PRODUCT ASKED FOR A DATE AND THREW IT AWAY.
//
// lib/circumstances.ts asked "Are you VAT registered, and when did you register?" and stored the
// answer as 'yes'. The four year lookback it promised underneath is Reg 111 of the VAT Regulations
// 1995, and the whole of it is measured from the registration date, so we were promising a
// calculation whose only input we had discarded, to every customer, since 14 July 2026.
//
// A date has nowhere to live in a 'yes' | 'no' | 'skip' answer, so it lives here, in vat_profiles,
// where lib/vat.ts can compute the window from it.
//
// ⚠️ TWO ENCODINGS, ONE WRITE, exactly as /api/circumstances does it. The web screen ships no
// client script, so every answer is a plain form post answered with a 303; the phone app sends
// JSON and gets JSON. A second route for the web would be a second implementation of these checks,
// and the copy that drifts is the one nobody is looking at.
//
// ⚠️ EVERY CHECK IS SERVER SIDE AND EVERY CHECK RUNS BEFORE ANY WRITE. A form's own required, max
// and pattern attributes are a courtesy to a man typing, not a guard: the browser is not ours.
//
// 🔴 AND NOTHING HERE FILES ANYTHING. lib/hmrc.ts asks for 'read:self-assessment
// write:self-assessment' and nothing else. There is no MTD for VAT in this codebase. We hold what
// he tells us and we work out what it means for him. His VAT return still goes to HMRC the way it
// goes today.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// The screen he came from, and the only place this route ever sends a form caller. A path built
// here, never a field read off the request: a `back=` on an authenticated POST is an open redirect
// wearing a helpful hat. Same rule as /api/circumstances.
const SCREEN = '/app/you/vat';

// The verbatim question, from the module that owns it, so what we store as the exhibit is what the
// codebase really asks. Finance Act 2026 Sch 22: the log of what we asked and what he answered is
// the defence, and a sentence retyped here would be a second copy of it that drifts.
const VAT_ASK = CIRCUMSTANCES.find((c) => c.key === 'vat_registered')?.ask ?? 'Are you VAT registered?';

// VAT began in the United Kingdom on 1 April 1973, so nothing before it can be a registration date.
// It is here to catch a typed year, 0202 or 1926, which is a real date and passes every other test.
const VAT_BEGAN = '1973-04-01';

interface VatPatch {
  registered?: boolean;
  vrn?: string | null;
  registeredOn?: string | null;
  scheme?: string;
  flatRatePercent?: number | null;
  flatRateFirstYear?: boolean;
  cisSubcontractor?: boolean;
}

// A real calendar day, not merely nine characters and two hyphens. new Date('2026-02-31') rolls
// forward to 3 March rather than failing, so the round trip is the test.
function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const at = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === iso;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Yes, no, on, off, true, false. A form sends words and the phone app sends booleans, and both mean
// the same thing to a man. Anything we do not recognise is not a decision and is left alone.
function asBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'yes' || s === 'true' || s === 'on' || s === '1') return true;
  if (s === 'no' || s === 'false' || s === 'off' || s === '0') return false;
  return null;
}

// TAKING IT ALL BACK OFF US. The elections DELETE shape: a fact he gave us and now wants gone is
// his to remove, in one step, without asking anybody.
//
// ⚠️ IT TAKES THE CIRCUMSTANCE WITH IT, AND THAT IS THE POINT RATHER THAN AN EXTRA. The POST below
// writes the vat_registered answer alongside the profile precisely so the two can never disagree.
// Clearing one and leaving the other would recreate the disagreement on the way out.
async function forgetVat(userId: string): Promise<boolean> {
  const cleared = await saveVatProfile(userId, {
    registered: false,
    vrn: null,
    registeredOn: null,
    deregisteredOn: null,
    scheme: 'standard',
    flatRatePercent: null,
    flatRateFirstYear: false,
    cisSubcontractor: false,
  });
  if (!cleared) return false;
  return forgetCircumstance(userId, 'vat_registered');
}

// WHAT WE HOLD, AND WHAT IT OPENS. The phone app's read.
export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('vat', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  const profile = await readVatProfile(user.id);

  // 🔴 NULL IS "WE COULD NOT READ", NOT "HE IS NOT REGISTERED", and the two must never be answered
  // with the same body. readVatProfile returns a fully empty profile when there is simply no row,
  // which is a real answer about a real man; null is our database having a bad minute. Reporting a
  // blip as "not VAT registered" would tell a registered man his invoices carry no VAT, which is
  // the worst sentence this file could produce. A 503 says we do not know.
  if (profile === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  return NextResponse.json({
    profile: {
      ...profile,
      // Printed HMRC's own way, in threes, so a man checking us against his certificate can.
      vrnFormatted: formatVrn(profile.vrn),
    },
    // The Reg 111 window, computed in lib/vat.ts and nowhere else. Null until he gives us the date,
    // which is the honest state and the whole reason this route exists.
    reg111: reg111Window(profile.registeredOn),
  });
}

export async function POST(req: NextRequest) {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const back = (q: string) => NextResponse.redirect(new URL(`${SCREEN}?${q}`, req.url), 303);

  const user = await sessionUser(req);
  // A form caller with no session is a man whose page sat open until his session went. Send him to
  // the door he can act on, not to an error object he cannot read.
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL(`/in?next=${SCREEN}`, req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (await userBurst('vat', user.id)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('problem=bad');
    // Only the keys the form actually sent. An absent field is "he said nothing about this", and
    // saveVatProfile is partial by design so that a man who gives us his number today and his
    // scheme next week does not have the number wiped in between.
    for (const key of [
      'intent', 'registered', 'vrn', 'registeredOn', 'scheme', 'flatRatePercent',
      'flatRateFirstYear', 'cisSubcontractor',
    ]) {
      if (f.has(key)) body[key] = String(f.get(key) ?? '');
    }
  } else {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }
  }

  // ERASURE, REACHED FROM A SCREEN THAT HAS NO DELETE TO SEND. A browser form can only GET or POST,
  // and the web app ships no client script to send anything else, so the intent field carries what
  // the phone app expresses as a DELETE. One implementation, two doors.
  if (String(body.intent ?? '') === 'forget') {
    if (!(await forgetVat(user.id))) {
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'delete_failed' }, { status: 502 });
    }
    return isForm ? back('done=forgotten') : NextResponse.json({ ok: true, forgotten: true });
  }

  const patch: VatPatch = {};

  // ── Registered or not. The one fact the circumstances question can hold. ───────────────────
  const registered = body.registered === undefined ? null : asBool(body.registered);
  if (body.registered !== undefined && registered === null) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (registered !== null) patch.registered = registered;

  // ── The number. Checked for shape, never asserted to be his. ───────────────────────────────
  //
  // 🔴 A BAD ONE IS REFUSED AND NEVER STORED, and it is refused before anything else is written, so
  // a typo cannot land half a screen of true facts and one wrong one. The check is lib/vat.ts's,
  // which runs both modulus 97 variants, so a transposed pair of digits is caught here rather than
  // printed on an invoice a customer pays from.
  if (body.vrn !== undefined) {
    const raw = String(body.vrn ?? '').trim();
    if (raw === '') {
      // Cleared on purpose. The screen posts what it draws, so an empty box is him removing it.
      patch.vrn = null;
    } else if (!isValidVrn(raw)) {
      return isForm
        ? back('problem=vrn')
        : NextResponse.json({
          error: 'bad_vrn',
          message: 'That VAT number does not look right. It is nine digits, and it is on your registration certificate.',
        }, { status: 400 });
    } else {
      // Stored as nine digits with no prefix and no spaces, which is what the column allows and
      // what formatVrn turns back into HMRC's own spacing wherever it is printed.
      patch.vrn = normaliseVrn(raw);
    }
  }

  // ── The date. The Reg 111 anchor, and the reason for the whole file. ───────────────────────
  if (body.registeredOn !== undefined) {
    const raw = String(body.registeredOn ?? '').trim();
    if (raw === '') {
      patch.registeredOn = null;
    } else if (!isRealDate(raw) || raw > todayISO() || raw < VAT_BEGAN) {
      // 🔴 A DATE IN THE FUTURE IS REFUSED, and not out of tidiness. reg111Window subtracts four
      // years from whatever it is given, so a mistyped 2062 would open a window running to 2058 and
      // sweep every receipt he owns into a reclaim he cannot make.
      return isForm
        ? back('problem=date')
        : NextResponse.json({
          error: 'bad_date',
          message: 'That registration date does not look right. It is the date on your VAT certificate, and it cannot be in the future.',
        }, { status: 400 });
    } else {
      patch.registeredOn = raw;
    }
  }

  // ── The scheme. One of four, decided by lib/vat.ts. ────────────────────────────────────────
  if (body.scheme !== undefined) {
    const raw = String(body.scheme ?? '').trim();
    if (!isVatScheme(raw)) {
      return isForm
        ? back('problem=scheme')
        : NextResponse.json({ error: 'bad_scheme', message: 'That is not a VAT scheme we know.' }, { status: 400 });
    }
    patch.scheme = raw;
  }

  // ── The flat rate percentage. His sector's, off the letter HMRC sent him. ──────────────────
  if (body.flatRatePercent !== undefined) {
    const raw = String(body.flatRatePercent ?? '').trim();
    if (raw === '') {
      patch.flatRatePercent = null;
    } else {
      const pc = Number(raw);
      // A percentage, never a fraction: 9.5 means 9.5%, which is how his letter reads. Anything
      // outside 0 to 100 is a typo, and lib/vat.ts would divide it by 100 and bill him for it.
      if (!Number.isFinite(pc) || pc < 0 || pc > 100) {
        return isForm
          ? back('problem=percent')
          : NextResponse.json({
            error: 'bad_percent',
            message: 'A flat rate percentage is between 0 and 100. It is on the letter HMRC sent you when you joined.',
          }, { status: 400 });
      }
      patch.flatRatePercent = pc;
    }
  }

  const firstYear = body.flatRateFirstYear === undefined ? null : asBool(body.flatRateFirstYear);
  if (firstYear !== null) patch.flatRateFirstYear = firstYear;

  const cis = body.cisSubcontractor === undefined ? null : asBool(body.cisSubcontractor);
  if (cis !== null) patch.cisSubcontractor = cis;

  // Nothing recognised in the body at all. Better a plain refusal than a cheerful ok for a write
  // that never happened.
  if (Object.keys(patch).length === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const saved = await saveVatProfile(user.id, patch);
  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. He would believe we hold his registration
  // date, quietly we would not, and the reclaim we promised him would never be worked out.
  if (!saved) {
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'write_failed' }, { status: 502 });
  }

  // 🔴 THE TWO RECORDS ARE WRITTEN TOGETHER SO THEY CAN NEVER DISAGREE.
  //
  // vat_profiles is what the engine reads. The circumstance is the logged question and answer, and
  // three surfaces still read it: the agent's threshold signal, the weekly update and /app/you. A
  // man who tells this screen he is registered, and whose circumstances page still says he never
  // answered, would be told to go and register by a paid WhatsApp template.
  //
  // ⚠️ AND THE WORDING COMES FROM THE SERVER, verbatim from lib/circumstances.ts, never from the
  // client, because what we can prove we asked has to be what we really asked.
  if (patch.registered !== undefined) {
    const logged = await saveCircumstance(
      user.id,
      'vat_registered',
      patch.registered ? 'yes' : 'no',
      VAT_ASK,
      isForm ? 'web' : 'app',
    );
    if (!logged) {
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'write_failed' }, { status: 502 });
    }
  }

  // ⚠️ THE 303 IS SENT ONLY AFTER THE WRITES SUCCEEDED, the same ordering /api/circumstances
  // argues for: landing him back on a screen that says "saved" with nothing in the database is the
  // exact failure the two checks above exist to prevent.
  if (isForm) return back(patch.registered === false ? 'done=not_registered' : 'done=saved');

  return NextResponse.json({
    ok: true,
    saved: patch,
    // What his date opens, from lib/vat.ts, so the app can say it in the same words the web does.
    reg111: patch.registeredOn ? reg111Window(patch.registeredOn) : null,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TAKING IT OFF US. Same reasoning as the /api/elections DELETE, and the same shape.
//
// He gave us his VAT number, the date he registered and his scheme. They are facts about him, not
// work we did for him, and a man who wants them gone does not have to ask us twice or pay for the
// privilege. The vat_profiles row has its own delete policy for exactly this.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('vat', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // A FAILED DELETE MUST NOT REPORT SUCCESS. He is entitled to the truth about whether his data is
  // gone, and "we tried" is not something a man can act on.
  if (!(await forgetVat(user.id))) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, forgotten: true });
}
