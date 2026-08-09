import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getConfirmedInputVat, getOutputVat, readVatProfile } from '../../../../lib/supabase';
import {
  VAT_REGISTRATION_THRESHOLD, formatVrn, inputVatNote, mustRegister, reg111Window, vatPosition,
} from '../../../../lib/vat';
import type { VatPositionInput } from '../../../../lib/vat';
import { asPercent } from '../../../../lib/taxengine';
import { gbp0, gbpAbs0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN_TINT, INK, LINE, MUTED, ON_GREEN_TINT, PAPER, SAFFRON_DEEP, SAFFRON_TINT, SURFACE, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VAT. Where he stands this quarter, prepared.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WE DO NOT FILE VAT RETURNS, AND THIS SCREEN SAYS SO IN ITS OWN WORDS, ONCE.
//
// lib/hmrc.ts asks for 'read:self-assessment write:self-assessment' and nothing else. There is not
// one occurrence of the word VAT in it. Making Tax Digital for VAT is ABSENT here, not half built
// and not waiting on a switch, so this screen may never carry the "the filing pipeline is built and
// waits on HMRC" sentence the quarterly summary carries, because that sentence is true of income
// tax and would be a straight lie about VAT.
//
// What this screen does is the thing we are actually for: it prepares the figure, from his own
// invoices and the costs he has confirmed, so that the number is already known to him when he makes
// his return himself, through whatever he uses for it today. That is said plainly at the foot of
// the page and it is not apologised for.
//
// ⚠️ EVERY FIGURE COMES FROM vatPosition() IN lib/vat.ts. Not one rate, threshold or subtraction is
// written here. The flat rate sum, the refund case, the proof share and the notes are all its
// answers, rendered. A second reader over a VAT figure is how a man ends up handing HMRC one number
// and his accountant another.
//
// ⚠️ THE REVERSE CHARGE IS THE REASON THIS PAGE EXISTS AT ALL.
//
// The most common invoice this audience sends carries NO VAT: the CIS domestic reverse charge, VATA
// 1994 s55A. So a subcontractor with a good quarter sees output tax far below what his turnover
// suggests, decides the app is broken, and stops trusting every other figure on it. Showing the
// reverse charge total beside the position, with one sentence saying whose VAT it is, is the
// difference between a screen that is right and a screen he believes.
//
// ⚠️ THE WINDOW IS SAID OUT LOUD, INCLUDING WHAT WE DO NOT KNOW. HMRC gives each business a stagger
// group, and we do not hold his. So this is the calendar quarter to date, the screen says exactly
// that, and a man whose quarters end in a different month can read it as three months of figures
// rather than as his own return period. The alternative was to print a window that might not be his
// and let him find out later, which is the failure this codebase keeps paying for.
//
// ⚠️ A NULL READ IS NEVER DRAWN AS A ZERO. readVatProfile, getOutputVat and getConfirmedInputVat
// all return null when the read FAILED, which lib/supabase.ts is explicit about, and "we could not
// read it" is a different answer from "there is nothing there". A zero he believes is worse than a
// blank he can retry, so on a failed read this screen shows him nothing and says why.
//
// ⚠️ AND THE PROOF SHARE TRAVELS WITH THE MONEY. The house position: nothing is ever refused for
// want of a receipt, but every figure knows whether it has one, and anything leaving the building
// says how much of it is documented. One quiet line under the reclaim. Not a warning, and never a
// reason to withhold a figure he is entitled to.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function VatPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fvat');

  const now = new Date();
  const from = quarterStartISO(now);
  const to = isoDay(now);

  // NULL MEANS THE READ FAILED. It does not mean he is not registered. Everything below branches on
  // that difference before it branches on anything else.
  const profile = await readVatProfile(user.id);
  const isRegistered = profile !== null && profile.registered;

  // Only the branch that will be drawn is read for. A man who is not registered gets his rolling
  // twelve months instead, because the one thing worth telling him here is whether he has crossed
  // the line that makes registering compulsory.
  const quarter = isRegistered
    ? await Promise.all([
      getOutputVat(user.id, from, to),
      getConfirmedInputVat(user.id, from, to),
    ])
    : null;
  const out = quarter ? quarter[0] : null;
  const inp = quarter ? quarter[1] : null;

  const year = profile !== null && !profile.registered
    ? await getOutputVat(user.id, twelveMonthsBackISO(now), to)
    : null;
  const overThreshold = year !== null && mustRegister(year.grossTurnover);
  const yearTurnover = year !== null ? year.grossTurnover : 0;

  // The whole position, asked for rather than worked out. Zeroes for a man who is not registered,
  // because vatPosition answers that case with a sentence and no table, which is the right answer
  // and is written once, in lib/vat.ts.
  //
  // ⚠️ blockedVat IS 0 AND THAT IS HONEST. We hold no per quarter figure for input tax that cannot
  // be reclaimed, and inventing one to fill a field would put a number on this screen that no row
  // in his books stands behind. The blocked rules live per cost, in inputVatNote, where he meets
  // them on the thing he actually bought.
  const positionInput: VatPositionInput | null = profile === null
    ? null
    : !profile.registered
      ? { profile, outputVat: 0, inputVat: 0, grossTurnover: 0, blockedVat: 0, inputVatWithProof: 0 }
      : out !== null && inp !== null
        ? {
          profile,
          outputVat: out.outputVat,
          inputVat: inp.total,
          grossTurnover: out.grossTurnover,
          blockedVat: 0,
          inputVatWithProof: inp.withProof,
        }
        : null;
  const pos = positionInput ? vatPosition(positionInput) : null;
  const notes = pos ? pos.notes : [];

  // A refund quarter is a real thing. It is not clamped, not hidden, and the label carries the
  // direction so the figure itself can be printed without a minus sign in front of a pound.
  const refund = pos !== null && pos.due < 0;
  const reverseCharge = out !== null ? out.reverseChargeVat : 0;
  const withProof = inp !== null ? inp.withProof : 0;

  // ⚠️ AND A QUARTER WITH NOTHING IN IT SAYS SO, rather than wearing a proud £0. "You owe nothing"
  // and "we have not been told anything yet" are different answers, and the hub and the Overview
  // already draw that line the same way. A man three days into a quarter reading a confident zero
  // is the one who stops checking.
  const nothingYet = pos !== null && out !== null
    && out.grossTurnover === 0 && pos.outputVat === 0 && pos.inputVat === 0 && reverseCharge === 0;

  // The promise lib/circumstances.ts has been making since 14 July, with his real dates in it at
  // last: the registration date used to be asked for and thrown away.
  const window111 = isRegistered && profile !== null ? reg111Window(profile.registeredOn) : null;
  // Printed the way HMRC prints it, and dressed up as nothing. The check digits in lib/vat.ts
  // prove the SHAPE of a VAT number, never the man: we do not ask HMRC whether this one is his, so
  // no word on this screen may suggest that anybody has confirmed it. That would be the same class
  // of claim as implying recognition.
  const vrn = profile !== null ? formatVrn(profile.vrn) : null;
  // The same rule coming the other way. Drawn only inside the reverse charge card, so a man who has
  // never raised one is never handed it.
  const subbie = inputVatNote('subcontractor');

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {profile === null ? (
        /* ── THE READ FAILED. No figures, and the reason said plainly. ────────────────────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT</h1>
          <p style={S.empty}>We could not read your VAT details just now.</p>
          <p style={S.quiet}>
            Nothing is lost. Give it a moment and load the page again. You are seeing a blank rather
            than a zero on purpose, because a zero you believe is worse than a blank you can try
            again.
          </p>
        </section>
      ) : !profile.registered ? (
        /* ── NOT REGISTERED. He has no row on the Tax hub, so he typed the address to be here.
              One sentence, and the one fact that could cost him money. ──────────────────────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT</h1>
          {notes.map((n) => <p key={n} style={S.body}>{n}</p>)}
          {/* 🔴 AND THE FAILED READ SAYS SO, WHICH ON THIS ARM IT DID NOT. 9 August 2026.
              getOutputVat returns null when the READ failed, and this branch only ever asked
              `overThreshold`, which is false for a null. So a man over the threshold whose read
              failed was shown NOTHING AT ALL and told nothing: no figure, and no reason there is
              no figure. The registered arm two branches down has said "We could not read your
              invoices just now" since it was written, and the block at the top of this file states
              the rule in the page's own words: on a failed read this screen shows him nothing AND
              SAYS WHY. This arm was the one place that did the first half only.

              It matters more here than anywhere else on the page: registering late is a penalty,
              and silence reads exactly like being safely under the line. */}
          {year === null ? (
            <p style={S.empty}>
              We could not read your invoices just now, so there is no turnover figure here rather
              than a figure with a hole in it. Give it a moment and load the page again.
            </p>
          ) : overThreshold ? (
            <p style={S.warn}>
              The invoices you have raised in the last twelve months come to {gbp0(yearTurnover)},
              which is over the {gbp0(VAT_REGISTRATION_THRESHOLD)} line. Registering becomes
              compulsory once your taxable turnover in any rolling twelve months goes over it. This
              counts only what you have invoiced here, so check it against your own figures before
              you act on it.
            </p>
          ) : null}
        </section>
      ) : pos === null ? (
        /* ── REGISTERED, BUT ONE OF THE TWO READS FAILED. Same rule: no invented zero. ─────── */
        <section className="lek-card">
          <h1 className="lek-h2">VAT this quarter</h1>
          <p style={S.empty}>
            We could not read {out === null ? 'your invoices' : 'what you have confirmed'} just now.
          </p>
          <p style={S.quiet}>
            So there is no figure here, rather than a figure with a hole in it. Nothing is lost.
            Give it a moment and load the page again.
          </p>
        </section>
      ) : (
        <>
          {/* ── WHERE HE STANDS. One figure, and the working under it in a sentence. ───────── */}
          <section className="lek-card">
            <h1 className="lek-h2">VAT this quarter</h1>
            <p style={S.window}>
              Your figures from {pretty(from)} to today. That is the calendar quarter. HMRC gives
              some businesses quarters that end in a different month, so if yours do, read this as
              three months of figures rather than as your own return period.
            </p>

            {nothingYet ? (
              <p style={S.empty}>Nothing raised or confirmed since {pretty(from)}.</p>
            ) : (
              <div style={S.figRow}>
                <div>
                  <div className="lek-tile-label">
                    {refund ? 'HMRC owes you so far' : 'To pay so far'}
                  </div>
                  <div className="lek-big">{refund ? gbpAbs0(pos.due) : gbp0(pos.due)}</div>
                </div>
              </div>
            )}

            {nothingYet ? (
              <p style={S.quiet}>
                This screen keeps itself ready. Raise an invoice or confirm a cost and the figure
                builds itself, from the same entries as every other screen under Tax.
              </p>
            ) : pos.flatRateUsed !== null ? (
              <p style={S.body}>
                {asPercent(pos.flatRateUsed)}% of {gbp0(out !== null ? out.grossTurnover : 0)}, your
                VAT inclusive turnover since {pretty(from)}.
              </p>
            ) : (
              <p style={S.body}>
                {gbp0(pos.outputVat)} of VAT charged on the invoices you have raised since{' '}
                {pretty(from)}, less {gbp0(pos.inputVat)} on what you have bought and confirmed.
              </p>
            )}

            {refund ? (
              <p style={S.good}>
                More VAT came back on what you bought than you charged, so this quarter it is HMRC
                that owes you. That is a real position and not a mistake. A quiet quarter with a van
                in it does exactly this.
              </p>
            ) : null}

            {/* The control doctrine, in one quiet line. Never a reason to hold a figure back. */}
            {pos.inputVat > 0 ? (
              <p style={S.quiet}>
                {pos.proofShare >= 1
                  ? 'Every pound of that reclaim has a receipt behind it.'
                  : `${gbp0(withProof)} of that reclaim has a receipt behind it.`}
                {' '}Nothing here is ever refused for want of a receipt, and every figure that leaves
                this screen says how much of it is documented.
              </p>
            ) : null}

            {/* The scheme's own sentences, written by lib/vat.ts. The flat rate ones are the load
                bearing pair: a percentage of gross turnover, and no reclaim on what he buys. */}
            {notes.map((n) => <p key={n} style={S.quiet}>{n}</p>)}

            {vrn ? <p style={S.quiet}>Your VAT number is {vrn}.</p> : null}
          </section>

          {/* ── THE REVERSE CHARGE. Shown apart, and never added to what he owes. ──────────────
              Drawn only for a man who has raised one this quarter, doc 103's empty test. For him
              it is the difference between a figure that looks broken and a figure he trusts. */}
          {reverseCharge > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Why the VAT you charged looks low</h2>
              <div style={S.figRow}>
                <div>
                  <div className="lek-tile-label">Reverse charge on your invoices</div>
                  <div className="lek-big">{gbp0(reverseCharge)}</div>
                </div>
              </div>
              <p style={S.body}>
                On those invoices your customer accounts for the VAT, so it is not yours to pay and
                it is not in the figure above.
              </p>
              {subbie ? <p style={S.quiet}>{subbie.says}</p> : null}
            </section>
          ) : null}

          {/* ── REG 111. What he can still claim from before he registered, with his own dates. */}
          {window111 ? (
            <section className="lek-card">
              <h2 className="lek-h2">What you could reclaim from before you registered</h2>
              <p style={S.body}>
                You registered on {pretty(window111.registeredOn)}. The VAT on goods you still had
                on hand that day, bought back to {pretty(window111.goodsFrom)}, and on services
                bought back to {pretty(window111.servicesFrom)}, can be reclaimed. It belongs on
                your first return after registering.
              </p>
              <p style={S.quiet}>
                What it takes is the original VAT invoices, and that the goods were still on hand
                when you registered. Every receipt you put in your Lekhio is kept ready for exactly
                this. If it was missed at the time, it is worth raising with whoever does your VAT.
              </p>
            </section>
          ) : null}

          {/* The one honest sentence about filing, said once and without apology. There is no MTD
              for VAT in this codebase at all, so nothing here may hint at one arriving. */}
          <p style={S.foot}>
            Lekhio does not send VAT returns to HMRC. This is your position, prepared from your own
            invoices and the costs you have confirmed, so that you already know the figure before
            you file your own return, through whatever you use for it today.
          </p>
        </>
      )}
    </main>
  );
}

// ── Dates ──────────────────────────────────────────────────────────────────────────────────────
// Display and windows only. No rule of tax is decided here: the calendar quarter is a date, and
// which dates his own VAT quarters run between is HMRC's stagger, which we do not hold and the
// screen says so rather than guessing.

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function quarterStartISO(now: Date): string {
  const month = now.getUTCMonth();
  return isoDay(new Date(Date.UTC(now.getUTCFullYear(), month - (month % 3), 1)));
}

function twelveMonthsBackISO(now: Date): string {
  return isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, now.getUTCDate())));
}

// "1 July 2026". The quarterly summary keeps its own copy of this for the same reason: it is
// display, not law, and a shared date formatter is not what this product is short of.
function pretty(iso: string): string {
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The column and the card come whole from APP_CSS. This screen owns only the figure row, exactly
// as the National Insurance screen does.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  window: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: `0 0 ${SPACE.md}px`, maxWidth: '62ch' },
  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '10px 0 0', maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  good: { fontSize: TYPE.body, lineHeight: 1.6, color: ON_GREEN_TINT, background: GREEN_TINT, borderRadius: RADIUS.md, padding: '12px 14px', margin: '12px 0 0', maxWidth: '62ch' },
  warn: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SAFFRON_TINT, border: `1px solid ${LINE}`, borderColor: edge(SAFFRON_DEEP, 27), borderRadius: RADIUS.lg, padding: '13px 15px', margin: '14px 0 0', maxWidth: '62ch' },

  figRow: { display: 'flex', gap: SPACE.lg, flexWrap: 'wrap', background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 4px' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
