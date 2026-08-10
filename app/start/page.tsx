'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { A11Y_CSS, APP_THEME_CSS } from '../../lib/tokens';
// 🔴 THE SIGNUP FLOW HAD NO THEME SHEET. Thirteen palette values were typed out by hand here, so
// this page was byte identical to the palette in LIGHT and could not invert at all in DARK.
// ⚠️ APP_THEME_CSS, not THEME_CSS: nothing on this page sets data-theme, so THEME_CSS's dark half
// could never match and adding it would have looked like a fix while changing nothing.
import { GREEN, GREEN_TINT, INK, LINE, MUTED, ON_GREEN_TINT, ON_RIVER, ON_SAFFRON_TINT, PANEL, PAPER, RED,
  RIVER, RIVER_DEEP, RIVER_TINT, SAFFRON, SAFFRON_DEEP, SAFFRON_TINT, SURFACE, edge } from '../../lib/apptheme';
import { findSic } from '../../lib/siccodes';
import { HOW_LONG, registeredShape } from '../../lib/onboarding';
import { TOTAL, type StartDraft, readDraft, writeDraft, clearDraft } from './draft';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 'partnership' WAS MISSING HERE, AND app/app/setup HAS BEEN ASKING FOR IT SINCE 31 JULY.
//
// The web signup offered three answers and a partnership was not one of them, so two people
// running a business together picked "A business name", and tradeTypeToBusinessType in
// lib/supabase.ts folded that to sole_trader. The consequences are not cosmetic: he is taxed on
// his share of the firm's profit, not all of it, and stored as a sole trader every figure the
// product shows him is the WHOLE firm's, including the income summary a mortgage lender reads.
// Step 2 below is where the share itself is asked, not left for later, because
// getBusinessProfile reads an unanswered share as 100%, which is right for everyone except the
// one man it is wrong for.
//
// ⚠️ DECLARED HERE, NOT ONLY IMPORTED. ./draft carries its own identical copy for StartDraft's
// own shape, because that module has to type check on its own with no JSX and no dependency on
// this file. TypeScript treats two identically shaped literal unions as the same type wherever
// they meet, so this is not the kind of duplication that can quietly drift apart unnoticed: it
// would fail to compile the day the two disagreed, wherever a value crossed between them.
// ═══════════════════════════════════════════════════════════════════════════════════════════
type TradeType = 'sole' | 'business' | 'ltd' | 'partnership' | null;

const trades = [
  'Electrician', 'Plumber', 'Builder', 'Plasterer', 'Roofer', 'Joiner',
  'Decorator', 'Gardener', 'Cleaner', 'Driver', 'Hairdresser', 'Barber',
  // Landlord earned its chip on 31 July 2026, after a landlord persona walked this page and had
  // nowhere to land but "Something else". The product already keeps a property stream with its own
  // engine (lib/propertyengine.ts), so the front door saying nothing about it was the door lying
  // about the house. Picking it also carries the rental property flag with the signup, see
  // submitSignup: a man whose trade IS the letting should not have to also tick "alongside".
  'Landlord',
  'Photographer', 'Tutor', 'Carer', 'Cafe', 'Market trader', 'Freelancer', 'Something else',
];

function digitsOnly(v: string) {
  return v.replace(/\D/g, '');
}

// A failure code from the signup routes, turned into something a person can act on. Same approach
// as app/in/page.tsx: never a stack trace, never "an error occurred", and never blame.
function codeMessage(code: string | undefined): string {
  switch (code) {
    case 'code': return 'That code did not work. Check the email and try again.';
    case 'email': return 'That email does not look right. Go back and check it.';
    case 'toomany': return 'Too many tries. Give it a few minutes and try again.';
    case 'capped': return 'We cannot send codes just this minute. Try again shortly.';
    case 'send': return 'We could not send that just now. Try again in a minute.';
    case 'account': return 'We could not finish setting your account up. Try again in a minute.';
    case 'session': return 'We could not sign you in just now. Try again in a minute.';
    case 'origin': return 'That request did not come from Lekhio, so we stopped it.';
    case 'unavailable': return 'Signing up is not available right now. Try again shortly.';
    default: return 'Something went wrong with that. Try again.';
  }
}

export default function StartPage() {
  // 🔴 NOT A LAZY useState INITIALISER, AND THAT WAS THE FIRST DRAFT OF THIS. readDraft() depends
  // on sessionStorage, which only exists in the browser, so a lazy initialiser would give the
  // server render step 1 and blank fields (window is undefined there) and could hand the CLIENT'S
  // first render a completely different step with completely different fields the moment a draft
  // exists. app/invoice-generator/Generator.tsx already carries the fix for exactly this shape of
  // bug, for a smaller case (today's date): seed it AFTER MOUNT, in an effect, so the server and
  // the client's first render agree, and pay for correctness with a second render instead of a
  // hydration mismatch. This page's case is the same fault with a much larger blast radius, since
  // step gates which of six entirely different screens draws, so it gets the same fix.
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>(null);
  // His percentage of the firm's profit. A string because it is a text input and an empty box is
  // not zero: zero is an answer nobody means and would tell the engine he earns nothing.
  const [share, setShare] = useState('');
  const [name, setName] = useState('');
  // ⚠️ THE HUMAN BEING, SEPARATE FROM THE BUSINESS. Added 27 July 2026 after a real signup on
  // lekhio.app was greeted as "Test", the first word of "Test Coffee Shop Ltd".
  //
  // There was one `name` field with its LABEL swapped by trade type, which reads like a tidy bit of
  // reuse and is not: for a limited company it captured the company and nothing else, so a man
  // called Dave who runs Smith Electrical Ltd got "Hi Smith" from a product whose entire pitch is
  // that it feels like a person. A sole trader still answers once, because for him the two ARE the
  // same name and asking twice would be the sort of pointless question doc 103 forbids.
  const [personName, setPersonName] = useState('');
  const [trade, setTrade] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  // Which of the SIC suggestions is on screen, 0 = the best match. "Not quite?" steps through the
  // rest rather than us guessing again; never sent anywhere until he sees and keeps this one.
  // Not part of the draft: it is derived fresh from trade/customTrade either way, and restoring
  // an index into a list that has not been recomputed yet is not an answer worth protecting.
  const [sicPick, setSicPick] = useState(0);
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState<boolean | null>(false);
  // The streams question: what sits alongside the trade. It shapes the tax
  // picture and primes the questions onboarding asks next, so it earns a step of its own.
  const [streams, setStreams] = useState<string[]>([]);
  // The code step. `done` now means "the questions are answered, prove the email", not "finished":
  // the account does not exist until the code is typed, so this is the last thing between him and
  // his own books rather than a thank you screen.
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  // Honeypot, must stay empty for a real person. NEVER drawn from the draft: a bot trap that could
  // be pre-filled by whatever the tab remembered would stop being a trap.
  const [hp, setHp] = useState('');
  // The real start of THIS signup attempt, not of this page load. A draft restore carries the
  // original value back in, so a man who is interrupted and returns nine minutes later still
  // reads as nine minutes to the bot trap in /api/onboard, rather than as a suspiciously fast
  // few hundred milliseconds because every field was already filled in when the page redrew.
  const [t0, setT0] = useState(() => Date.now());
  // True once the draft (or the absence of one) has been read and applied. The save effect below
  // waits for this: without it, the save effect's OWN first run (mount fires every effect once)
  // would see this render's still blank fields and write them straight over a draft the restore
  // effect has only just queued, not yet applied.
  const [hydrated, setHydrated] = useState(false);
  // Worth a word only when there was real progress to protect: a half typed phone number on step
  // one is not the interrupted-between-jobs case this exists for, so this only goes true past it.
  const [restoredNotice, setRestoredNotice] = useState(false);
  const [offer] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('offer') ?? '' : ''));
  const [billingResult] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('billing') ?? '' : ''));
  // A referral code carried in on ?ref= (doc 82). Attribution only; passed to the
  // onboard save, sanitised server side. Never shown, never rewards automatically.
  const [ref] = useState(() => (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') ?? '' : ''));

  // Applies a restored draft to every field. Kept out of the effect below on purpose, and not
  // only for tidiness: test/structurehonesty.test.mjs bans an effect that sets tradeType near its
  // own braces, because that is exactly the shape a name-derived auto-coercion would take (see
  // the doctrine above `shape`, a few hundred lines up, on why tradeType may only ever change from
  // a press). This is a different thing wearing a similar shape, carrying back a choice he already
  // pressed a button for earlier in this same session, not inferring a new one from typed text,
  // and giving it its own named function keeps that true structurally, not just by argument.
  function applyDraft(found: StartDraft): void {
    setT0(found.t0);
    setStep(found.step);
    setPhone(found.phone);
    setEmail(found.email);
    setTradeType(found.tradeType);
    setShare(found.share);
    setName(found.name);
    setPersonName(found.personName);
    setTrade(found.trade);
    setCustomTrade(found.customTrade);
    setPostcode(found.postcode);
    setAddress(found.address);
    setVat(found.vat);
    setStreams(found.streams);
    if (found.step > 1) setRestoredNotice(true);
  }

  // Restore, once, after mount. This only ever fills fields back in: it never calls next(), never
  // calls submitSignup or sendCode, and never touches the honeypot, so restoring a draft can never
  // itself cause a submit. A restored draft sitting on the final step still needs its own tap of
  // "Start free trial" before anything is posted anywhere.
  //
  // Seeded after mount on purpose, matching `step`'s own comment above: applying a browser-only
  // draft during the render itself would make the server's markup and the client's first render
  // disagree on which of six screens to draw. Paying with a second render is the same trade
  // Generator.tsx already makes for a date. Mount only, deliberately: a one time read of whatever
  // the tab was holding, not a subscription to it, hence the empty dependency list.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const found = readDraft();
    if (found) applyDraft(found);
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save on every change, once hydrated. Gated on hydrated so this cannot fire on the very first
  // render and write the blank starting fields straight over a draft the effect above is still in
  // the middle of restoring: mount runs every effect once, so this effect's own first pass would
  // otherwise see this render's pre-restore closure, not the values the restore effect only just
  // queued. Gated on done so the draft is never resurrected once it has served its purpose and
  // been cleared: after that point, nothing here is left for a reload to lose. writeDraft() itself
  // swallows a full or unavailable store, so nothing here needs its own try/catch.
  useEffect(() => {
    if (!hydrated || done) return;
    writeDraft({
      v: 1, t0, step, phone, email, tradeType, share, name, personName, trade, customTrade,
      postcode, address, vat, streams,
    });
  }, [hydrated, done, t0, step, phone, email, tradeType, share, name, personName, trade,
    customTrade, postcode, address, vat, streams]);

  // The low key way out, for a shared machine or simply a wrong guess. Wipes the draft and every
  // field rather than just hiding the notice, so "start over" is never a lie.
  function startOver(): void {
    clearDraft();
    setRestoredNotice(false);
    setStep(1);
    setPhone('');
    setEmail('');
    setTradeType(null);
    setShare('');
    setName('');
    setPersonName('');
    setTrade('');
    setCustomTrade('');
    setSicPick(0);
    setPostcode('');
    setAddress('');
    setVat(false);
    setStreams([]);
    setT0(Date.now());
  }

  const phoneReady = digitsOnly(phone).length >= 10;
  // Email is required. One account, tied to a name, a mobile and an email, so nothing about a
  // person is ever split across two records. It must be present and valid to move on.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameLabel = tradeType === 'ltd' ? 'Company name' : tradeType === 'business' ? 'Trading name' : tradeType === 'partnership' ? "The partnership's name" : 'Your full name';
  // A limited company, a trading name and a partnership are all not the person. A sole trader
  // trades under his own name, so his one answer is both.
  const needsPersonName = tradeType === 'ltd' || tradeType === 'business' || tradeType === 'partnership';
  // 🔴 WHAT THE NAME HE TYPED SAYS ABOUT HIS STRUCTURE, WHICH MAY NOT BE WHAT HE PICKED.
  // Only ever consulted when he has NOT already said limited company or partnership: a man who has
  // picked the right answer does not need telling, and a prompt that fires on somebody who is
  // already right is the kind people learn to dismiss. See registeredShape in lib/onboarding.ts.
  const shape = tradeType === 'sole' || tradeType === 'business' ? registeredShape(name) : null;

  // 1 to 100, whole numbers. Parsed once here so the gate below and the post agree on what counts.
  const shareNum = Number(share);
  const shareValid = /^\d{1,3}$/.test(share.trim()) && shareNum >= 1 && shareNum <= 100;
  // Who we greet, everywhere. One expression, so the success screen, the email and the app can
  // never disagree about what to call him.
  const greetName = (needsPersonName ? personName : name).trim();

  const canContinue = useMemo(() => {
    // 🔴 THE MOBILE IS OPTIONAL, AND THE SCREEN NOW SAYS SO. The account is created from the proved
    // EMAIL alone: /api/signup/code takes only an email, the session is email, and WhatsApp binds a
    // fresh number from the handset itself, so the number typed here lands on signups.phone and
    // nothing that signs a man in or runs his books depends on it. It used to be mandatory here and
    // at /api/onboard while the copy directly above promised it was "only used to link WhatsApp when
    // you are ready", which cannot both be true on the front door of a product whose whole pitch is
    // that it does not say one thing and do another. So the gate asks for the email, and for the
    // phone only that IF one is typed it is a real one, which catches a typo without demanding it.
    if (step === 1) return emailValid && (phone.trim().length === 0 || phoneReady);
    if (step === 2) return tradeType !== null && name.trim().length > 1 && (!needsPersonName || personName.trim().length > 1) && (tradeType !== 'partnership' || shareValid);
    if (step === 3) return trade !== '' && (trade !== 'Something else' || customTrade.trim().length > 1);
    if (step === 4) return true; // streams optional, none is a fine answer
    if (step === 5) return true; // address optional
    if (step === 6) return vat !== null;
    return false;
    // 🔴 shareValid WAS MISSING HERE AND ESLINT CAUGHT IT BEFORE A CUSTOMER DID. Without it the
    // memo does not recompute when he types his percentage, so a partner fills the box in and
    // Continue stays dead until some other answer on the screen happens to change. He would read
    // that as the page being broken, on the one step nobody else has to do.
  }, [step, phone, phoneReady, emailValid, tradeType, name, personName, needsPersonName, shareValid, trade, customTrade, vat]);

  // What they actually typed or picked, for the SIC matcher. Only a limited company needs a SIC
  // code at all (Companies House asks for it; a sole trader never does, see lib/siccodes), so this
  // only shows and only travels with the signup when tradeType is 'ltd'. Never filed anywhere by
  // us: it is a head start for when he registers himself, which the copy says plainly.
  const effectiveTrade = trade === 'Something else' ? customTrade : trade;
  const sicMatches = useMemo(
    () => (tradeType === 'ltd' && effectiveTrade.trim().length > 1 ? findSic(effectiveTrade, 3) : []),
    [tradeType, effectiveTrade],
  );
  const sicChoice = sicMatches[Math.min(sicPick, sicMatches.length - 1)] ?? null;

  // 🔴 THIS IS NO LONGER FIRE AND FORGET, AND IT CANNOT BE.
  //
  // It used to post and move straight on, because the next screen was a thank you and nothing
  // depended on the row landing. Now the next thing that happens is that he proves his email, and
  // /api/signup/verify reconciles his answers by looking that signup row up. A post still in
  // flight is a man who answered six questions and arrives in an empty account.
  async function submitSignup(): Promise<void> {
    try {
      await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          email: email.trim(),
          tradeType,
          name: name.trim(),
          // The person, sent alongside the business name. app/api/onboard falls back to `name` when
          // this is empty, which is exactly right for a sole trader.
          personName: greetName,
          // Only sent when it means something. A share on a sole trader is a number with nothing
          // to be a share OF, and app/api/onboard drops it for exactly that reason.
          partnershipShare: tradeType === 'partnership' && shareValid ? shareNum : undefined,
          trade: trade === 'Something else' ? customTrade.trim() : trade,
          postcode: postcode.trim(),
          address: address.trim(),
          vat,
          // A landlord's rental property is not "alongside the work", it IS the work, so step 4's
          // property tick cannot be the only way the flag travels. Picking the Landlord chip
          // carries it too, deduplicated, and nothing is ever removed from what he ticked himself.
          streams: trade === 'Landlord' && !streams.includes('property') ? [...streams, 'property'] : streams,
          website: hp,
          ts: Date.now() - t0,
          offer,
          ref,
          // Only ever sent once he has actually SEEN the suggestion on screen (sicChoice is only set
          // when the box above rendered). Never guessed silently server side.
          sicCode: sicChoice ? sicChoice.code : undefined,
        }),
      });
    } catch {
      // A failed save must not trap him on the form. He still gets his code and his account, and
      // the answers are simply asked again inside onboarding.
      //
      // ⚠️ THIS USED TO SAY THE WORST CASE WAS A NUISANCE RATHER THAN A WALL, AND THAT STOPPED
      // BEING TRUE IN JULY. The email sign in door resolves an address only through a signups row
      // carrying a user_id (findContactAccount), so a signup that saved nothing left a man able to
      // finish tonight and unable to sign in ever again. The account minting path now lays that
      // bridge down itself, in ensureSignupBridge, so this is only the answers now.
    }
  }

  // Ask for the code. Used both on finishing the questions and by "Send it again".
  async function sendCode(isResend = false): Promise<boolean> {
    if (isResend) setResendBusy(true);
    try {
      const res = await fetch('/api/signup/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setCodeErr(codeMessage(data.error));
        return false;
      }
      return true;
    } catch {
      setCodeErr('We could not send that just now. Try again in a minute.');
      return false;
    } finally {
      // Deliberately not a countdown. He does not need a timer, he needs the button to stop
      // looking like the thing to press twenty times while the first email is still in flight.
      if (isResend) setTimeout(() => setResendBusy(false), 30_000);
    }
  }

  // Prove it. This is the moment the account exists.
  async function confirmCode(): Promise<void> {
    setCodeBusy(true);
    setCodeErr('');
    try {
      const res = await fetch('/api/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string; message?: string };
      if (res.ok && data.ok) {
        // A full navigation, not a router push. The session arrives as an HttpOnly cookie on this
        // very response, and /app is server rendered off it, so the next page must be fetched by
        // the browser with that cookie attached.
        window.location.href = data.redirect || '/app';
        return;
      }
      // The route sends a specific sentence for a code that expired, was used, or has been retired
      // after too many tries. Prefer it: "that code did not work" is useless advice for a code that
      // can no longer work however carefully he types it.
      setCodeErr(data.message || codeMessage(data.error));
    } catch {
      setCodeErr('We could not check that just now. Try again in a minute.');
    }
    setCodeBusy(false);
  }

  async function next() {
    if (step < TOTAL) {
      setStep(step + 1);
      return;
    }
    // Save the answers FIRST, then ask for the code, then show the screen. In that order, because
    // the verify step reconciles against the row this writes.
    await submitSignup();
    await sendCode();
    // The six answers have been posted. Whatever the draft was protecting is either saved now or
    // was lost the way it always could be if the save itself failed, but either way there is
    // nothing left on this screen for a reload to lose, so the tab stops holding a copy.
    clearDraft();
    setDone(true);
  }
  function back() {
    if (step > 1) setStep(step - 1);
  }

  const pct = done ? 100 : Math.round(((step - 1) / TOTAL) * 100);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: PAPER, color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <style dangerouslySetInnerHTML={{ __html: APP_THEME_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          *{box-sizing:border-box}body{margin:0}a{text-decoration:none}
          @keyframes stepIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
          @keyframes pop{0%{opacity:0;transform:scale(.6)}100%{opacity:1;transform:scale(1)}}
          .step-anim{animation:stepIn .35s cubic-bezier(.2,.7,.2,1)}
          .opt{transition:border-color .15s ease, background-color .15s ease, transform .12s ease}
          .opt:hover{border-color:${RIVER}!important;transform:translateY(-2px)}
          .chip{transition:all .12s ease}
          .chip:hover{border-color:${RIVER}!important}
          .btn{transition:background-color .18s ease, transform .15s ease, box-shadow .18s ease}
          .btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 10px 24px rgba(27,89,166,.26)}
          .btn:active:not(:disabled){transform:translateY(0)}
          .field:focus{outline:none;border-color:${RIVER}!important;box-shadow:0 0 0 3px ${RIVER_TINT}}
          .barfill{transition:width .4s cubic-bezier(.2,.7,.2,1)}
        `,
        }}
      />

      {/* Top bar */}
      <div style={{ borderBottom: `1px solid ${LINE}`, backgroundColor: PANEL }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', color: INK }}>Lekhio</Link>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: ON_GREEN_TINT, backgroundColor: GREEN_TINT, padding: '5px 11px', borderRadius: 20 }}>🔒 Secure setup</span>
        </div>
      </div>

      {/* Progress */}
      {!done && !billingResult && (
        <div style={{ maxWidth: 560, width: '100%', margin: '0 auto', padding: '20px 22px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: RIVER, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step {step} of {TOTAL}</span>
            {/* 🔴 THIS SAID "About a minute", AND IT WAS TRUE OF THESE SIX QUESTIONS AND FALSE ABOUT
                WHAT HE IS STARTING. Six questions really do take a minute; what follows them is ten
                to fifteen, because we cannot tailor a man's tax until we know everything about him.
                A page that promises a minute and then asks for fifteen has not saved him fourteen
                minutes, it has taught him we shade the truth about his money on the very first
                screen. Jag's call, 28 July: say it up front, because depth is the feature.
                The string comes from lib/onboarding so this page and the setup screens cannot
                disagree about it. */}
            <span style={{ fontSize: 12.5, color: MUTED }}>{HOW_LONG} in total</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, backgroundColor: SURFACE, overflow: 'hidden' }}>
            <div className="barfill" style={{ height: 7, borderRadius: 4, width: `${Math.max(pct, 8)}%`, background: `linear-gradient(90deg, ${RIVER}, ${SAFFRON})` }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 22px 40px' }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          {/* Honeypot. Hidden from people, but bots that fill every field trip it. */}
          <input
            type="text"
            name="website"
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />
          {/* 🔴 THE BEST BUTTON IS NO BUTTON, doc 103. We do not ask "carry on where you left off?"
              because yes is the only sensible answer almost every time, and a question with one
              sensible answer is the thing that doctrine forbids. We just do it, and say so, with
              one low key way out for the rare case it is not him. */}
          {restoredNotice && !done && !billingResult ? (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: SURFACE, borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ fontSize: 13, color: MUTED }}>We kept your answers from before.</span>
              <button type="button" onClick={startOver} style={{ cursor: 'pointer', background: 'none', border: 'none', color: RIVER, fontSize: 13, fontWeight: 700, padding: 4, flexShrink: 0, fontFamily: 'inherit' }}>Not you? Start over</button>
            </div>
          ) : null}
          {offer ? (
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, backgroundColor: GREEN_TINT, border: `1px solid ${edge(GREEN, 25)}`, borderRadius: 12, padding: '12px 14px' }}>
              
              <span style={{ fontSize: 13.5, fontWeight: 600, color: ON_GREEN_TINT, lineHeight: 1.4 }}>Your 7 days free is ready. No card needed. Finish to get started.</span>
            </div>
          ) : null}
          {billingResult === 'success' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN_TINT, color: ON_GREEN_TINT, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your plan is locked in.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                Your card is saved and your 7 day free trial is running. You will not be charged until it ends, and you can cancel any time before then and pay nothing.
              </p>
              {/* The way in, not a way to a store queue. Both Stripe return screens land a man
                  who already has an account, so the only sensible button is his own books. */}
              <a href="/app" className="btn" style={{ display: 'inline-block', backgroundColor: RIVER, color: ON_RIVER, fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12, marginBottom: 22 }}>Open my Lekhio →</a>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : billingResult === 'cancelled' ? (
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✓</div>
              <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Your trial is still running.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 28px' }}>
                No card added, and that is fine. Your 7 day free trial is active. You can add a card to keep Lekhio any time, from your account.
              </p>
              {/* The way in, not a way to a store queue. Both Stripe return screens land a man
                  who already has an account, so the only sensible button is his own books. */}
              <a href="/app" className="btn" style={{ display: 'inline-block', backgroundColor: RIVER, color: ON_RIVER, fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12, marginBottom: 22 }}>Open my Lekhio →</a>
              <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: RIVER }}>Back to home</Link>
            </div>
          ) : done ? (
            /* 🔴 THE END OF THE ROAD USED TO BE A FIELD.
               It read: download the app, let the app set you up, say hello on WhatsApp. The store
               buttons beside it were dimmed and said "soon", and there was no link to the web app
               anywhere on the page. The product did not appear at the end of its own signup.

               Now the last thing he does is prove his email, which is what MAKES the account, and
               then he is in. No download, no WhatsApp, no waiting on Apple. */
            <div className="step-anim" style={{ textAlign: 'center', paddingTop: 24 }}>
              <div style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', animation: 'pop .5s ease' }}>✉</div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 12px' }}>Check your email.</h1>
              <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.6, maxWidth: 430, margin: '0 auto 8px' }}>
                We have sent a six digit code to <b style={{ color: INK }}>{email.trim()}</b>. Type it
                in and we will start setting your Lekhio up.
              </p>
              <p style={{ fontSize: 13, color: MUTED, margin: '0 auto 24px', maxWidth: 400 }}>
                It can take a minute to arrive. Have a look in your junk folder if it does not.
              </p>

              <div style={{ maxWidth: 320, margin: '0 auto' }}>
                <label htmlFor="signup-code" style={{ ...fieldLabel, textAlign: 'left' }}>Your code</label>
                <input
                  id="signup-code"
                  className="field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="6 digit code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setCodeErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 4) void confirmCode(); }}
                  style={{ ...fieldStyle, textAlign: 'center', fontSize: 24, letterSpacing: '6px', fontWeight: 700 }}
                />
                {codeErr ? (
                  <p role="alert" style={{ fontSize: 13.5, color: RED, lineHeight: 1.5, margin: '10px 0 0', textAlign: 'left' }}>{codeErr}</p>
                ) : null}
                <button
                  className="btn"
                  onClick={() => void confirmCode()}
                  disabled={codeBusy || code.length < 4}
                  style={{ width: '100%', marginTop: 14, cursor: codeBusy ? 'wait' : code.length < 4 ? 'not-allowed' : 'pointer', backgroundColor: code.length < 4 ? SURFACE : RIVER, color: code.length < 4 ? MUTED : ON_RIVER, border: 'none', fontSize: 16, fontWeight: 700, padding: '15px 0', borderRadius: 12 }}
                >
                  {codeBusy ? 'Just a moment…' : 'Open my Lekhio →'}
                </button>
                <button
                  type="button"
                  onClick={() => void sendCode(true)}
                  disabled={resendBusy}
                  style={{ marginTop: 14, background: 'none', border: 'none', color: resendBusy ? MUTED : RIVER, fontSize: 14, fontWeight: 600, cursor: resendBusy ? 'default' : 'pointer', padding: 8 }}
                >
                  {resendBusy ? 'Sent. Give it a moment.' : 'Send it again'}
                </button>
              </div>

            </div>
          ) : (
            <div key={step} className="step-anim">
              {step === 1 && (
                <Step title="Let's set up your account" sub="Your email is your account, and we will send you a code at the end to prove it. That is all we need to start.">
                  <label htmlFor="signup-email" style={fieldLabel}>Email</label>
                  <input id="signup-email" className="field" inputMode="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
                  <label htmlFor="signup-phone" style={{ ...fieldLabel, marginTop: 18 }}>Mobile number (optional)</label>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: PANEL, border: `1.5px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '15px 14px', backgroundColor: RIVER_TINT, color: RIVER, fontWeight: 700, fontSize: 16, borderRight: `1.5px solid ${LINE}` }}>🇬🇧 +44</span>
                    <input id="signup-phone" className="field" inputMode="tel" placeholder="7700 900 000" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={14} style={{ flex: 1, border: 'none', padding: '15px 14px', fontSize: 17, color: INK, letterSpacing: '0.5px', background: 'transparent' }} />
                  </div>
                  <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Add your mobile now if you would like to link WhatsApp later, so you can send receipts by text. You can also add it any time from your account. Your email is all we need to start.</p>
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>We never share your details. We only ever message you in reply to you.</p>
                </Step>
              )}

              {step === 2 && (
                <Step title="How do you trade?" sub="So your invoices and tax records show the right name.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['sole', '', 'Just me', 'Self employed under my own name'],
                      ['business', '', 'A business name', 'I trade as a name, like Smith Electrical'],
                      // ⚠️ THE SAME WORDS app/app/setup ALREADY USES. One fact worded twice is one
                      // fact argued twice, and the setup screen's phrasing was written for a man who
                      // does not call himself a partner and would scroll past the word.
                      ['partnership', '', 'Me and somebody else', 'We share the business. You are taxed on your share of the profit, not all of it'],
                      ['ltd', '', 'A limited company', 'I have a registered company'],
                    ] as const).map(([val, icon, t, d]) => {
                      const active = tradeType === val;
                      return (
                        <button key={val} className="opt" onClick={() => setTradeType(val)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, backgroundColor: active ? RIVER_TINT : PANEL, border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '16px 16px' }}>
                          <span style={{ fontSize: 24 }}>{icon}</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: INK }}>{t}</span>
                            <span style={{ display: 'block', fontSize: 13.5, color: MUTED, marginTop: 2 }}>{d}</span>
                          </span>
                          <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${active ? RIVER : LINE}`, backgroundColor: active ? RIVER : 'transparent', color: ON_RIVER, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  {tradeType && (
                    <div style={{ marginTop: 16 }}>
                      <label htmlFor="signup-name" style={fieldLabel}>{nameLabel}</label>
                      <input id="signup-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={tradeType === 'ltd' ? 'Smith Electrical Ltd' : tradeType === 'business' ? 'Smith Electrical' : 'Sam Smith'} style={fieldStyle} />
                      {/* 🔴 THIS SAID: "We will verify your company details for you."
                          We do not verify anything. Verification is a WARRANTY: it says we checked
                          this and we vouch for it. What we actually do is look your company up on
                          the public Companies House register and read back what it says. If that
                          register is wrong, or he types a name that matches somebody else's company,
                          we have "verified" nothing at all, and he has our word for it.
                          Say what we do. It is still the good bit: he does not dig out paperwork. */}
                      {/* 🔴 THIS COPY WAS A PROMISE THE PAGE DID NOT KEEP, and it was live for weeks.
                          It read: "We will look your company up on the Companies House register and
                          fill the details in for you." app/start never called anything. The lookup
                          is real and it works, but in the MOBILE setup flow, which can call
                          /api/companies-house because by then the user is signed in.

                          This page has no session at any point, and opening that endpoint to
                          anonymous callers would reopen the hole the 26 July audit closed: one
                          shared key, 600 requests per five minutes, and lookup quietly dying for
                          every real customer mid signup.

                          So the lookup now runs SERVER SIDE when this form is submitted, and the
                          copy says what actually happens: we do the looking, he does not dig out
                          paperwork, and nothing fills in on screen because nothing can yet. The
                          live type ahead comes to the web app's own setup screen at item 6. */}
                      {/* ═══════════════════════════════════════════════════════════════════
                          🔴 HE TYPED A COMPANY NAME INTO THE TRADING NAME BOX. WE ASK. WE NEVER
                          SWITCH. Filed as 'business' he becomes a sole_trader, and the engine
                          then charges him income tax and Class 4 personally on profit that is his
                          COMPANY'S. lib/supabase.ts calls that the largest overstatement in the
                          product and the hardest for him to spot, because it looks like a big tax
                          bill rather than like a bug. He also never gets the Companies House
                          lookup, which app/api/onboard runs for 'ltd' and nothing else.
                          ⚠️ ONE BUTTON, AND IT ONLY MOVES THE ANSWER HE ALREADY GAVE. It does not
                          submit, it does not reach a server, and the name he typed is kept. If he
                          ignores it entirely, nothing changes and he carries on, which is right:
                          this is a fact about his business and only he holds it.
                          ⚠️ AN LLP GOES TO PARTNERSHIP, NOT TO LIMITED COMPANY. Its members are
                          taxed on their share of the profit the way partners are, so calling one
                          a director would swap one wrong structure for another.
                          ═══════════════════════════════════════════════════════════════════ */}
                      {shape ? (
                        // 🔴 THE BORDER WAS ${SAFFRON_DEEP}33, A HEX ALPHA SUFFIX GLUED ONTO A
                        // var(). lib/apptheme.ts says why that never works: a var() reference
                        // cannot take one, so the browser reads an extra stray token, the whole
                        // border shorthand is invalid at computed value time, and every browser
                        // drew this box with NO border at all. edge() is the real fix, same as
                        // the offer banner's border a few dozen lines up on this same page, and
                        // 20 is the documented percentage for what a 33 hex suffix meant.
                        //
                        // ⚠️ AND THE TEXT NOW USES THE TOKEN BUILT FOR IT. INK read at 16.6:1 on
                        // this tint, so it was never actually the 2.70:1 failure the SAFFRON_DEEP
                        // pattern produces elsewhere. ON_SAFFRON_TINT is still the right ink to
                        // hold this to, because it is the one lib/tokens.ts's guard recomputes if
                        // SAFFRON_TINT is ever retuned, and INK is not.
                        <div style={{ marginTop: 12, backgroundColor: SAFFRON_TINT, border: `1px solid ${edge(SAFFRON_DEEP, 20)}`, borderRadius: 12, padding: '13px 14px' }}>
                          <p style={{ fontSize: 13.5, color: ON_SAFFRON_TINT, lineHeight: 1.55, margin: 0 }}>
                            {shape === 'llp'
                              ? <>That name ends in LLP, so the business is registered and you are taxed on your <b>share</b> of its profit rather than all of it. Is that right?</>
                              : <>That name ends in {name.trim().split(/\s+/).slice(-1)[0]}, which usually means a company registered at Companies House. If it is, your tax works differently and we can look the details up for you.</>}
                          </p>
                          <button
                            type="button"
                            onClick={() => setTradeType(shape === 'llp' ? 'partnership' : 'ltd')}
                            style={{ marginTop: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: ON_RIVER, backgroundColor: RIVER, border: 0, borderRadius: 10, padding: '10px 14px', fontFamily: 'inherit' }}
                          >
                            {shape === 'llp' ? 'Yes, we share the business' : 'Yes, it is a limited company'}
                          </button>
                          <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8, marginBottom: 0 }}>
                            If it is not, carry on. Nothing changes unless you press it.
                          </p>
                        </div>
                      ) : null}
                      {tradeType === 'ltd' && <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>Type it as it appears on the register. We look your company up on the Companies House register ourselves once you finish, so there is no paperwork to dig out.</p>}
                      {/* 🔴 THE ONE NUMBER THAT DECIDES EVERY FIGURE HE IS EVER SHOWN.
                          A partnership keeps ONE set of books and each partner is taxed on his
                          slice: GOV.UK, set up a business partnership, "each partner pays tax on
                          their share". Lekhio sees the whole account, so without this it hands him
                          his partners' money as his own. It is asked here because getBusinessProfile
                          reads a missing share as 100%, which is the safe answer for a sole trader
                          and the wrong one for the only person it applies to.
                          ⚠️ NO DEFAULT IN THE BOX. 50 is the common answer and it is still a guess
                          about his money, and a prefilled guess is one he can walk past. */}
                      {tradeType === 'partnership' && (
                        <div style={{ marginTop: 16 }}>
                          <label htmlFor="signup-share" style={fieldLabel}>Your share of the profit</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                              id="signup-share"
                              className="field"
                              inputMode="numeric"
                              value={share}
                              onChange={(e) => setShare(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                              placeholder="50"
                              aria-label="Your share of the partnership's profit, as a percentage"
                              style={{ ...fieldStyle, maxWidth: 120 }}
                            />
                            <span style={{ fontSize: 18, fontWeight: 700, color: INK }}>%</span>
                          </div>
                          <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>
                            Two of you splitting it evenly is 50. Your figures are worked out on your
                            share, never the whole firm&rsquo;s. You can change it later in Settings.
                          </p>
                        </div>
                      )}
                      {needsPersonName && (
                        <div style={{ marginTop: 16 }}>
                          <label htmlFor="signup-person" style={fieldLabel}>Your full name</label>
                          <input id="signup-person" aria-label="Your full name" className="field" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Sam Smith" style={fieldStyle} />
                          <p style={{ fontSize: 12.5, color: MUTED, marginTop: 8 }}>So we can talk to you like a person, not like a company.</p>
                        </div>
                      )}
                    </div>
                  )}
                </Step>
              )}

              {step === 3 && (
                <Step title="What do you do?" sub="We use this to sort your expenses into the right categories automatically.">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {trades.map((t) => {
                      const active = trade === t;
                      return (
                        <button key={t} className="chip" onClick={() => { setTrade(t); setSicPick(0); }} style={{ cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: active ? ON_RIVER : INK, backgroundColor: active ? RIVER : PANEL, border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 22, padding: '10px 16px' }}>{t}</button>
                      );
                    })}
                  </div>
                  {trade === 'Something else' && (
                    <div style={{ marginTop: 18 }}>
                      <label htmlFor="signup-trade" style={fieldLabel}>Tell us what you do</label>
                      <input id="signup-trade" className="field" value={customTrade} onChange={(e) => { setCustomTrade(e.target.value); setSicPick(0); }} placeholder="e.g. Mobile dog groomer" style={fieldStyle} autoFocus />
                    </div>
                  )}
                  {sicChoice && (
                    <div style={{ marginTop: 18, backgroundColor: RIVER_TINT, border: `1.5px solid ${RIVER}`, borderRadius: 14, padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Your likely SIC code</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: INK, marginTop: 6 }}>{sicChoice.code} &middot; {sicChoice.label}</div>
                      {/* 🔴 THIS SAID "when you register your limited company", TO A MAN WHO JUST
                          PICKED "I have a registered company" ONE STEP UP. Lecturing him about
                          registering a company he already has is the small tell that we are not
                          listening. The honest frame: the register's own entry is the record, we
                          file nothing, and this is just so his details here line up. */}
                      <p style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.5 }}>
                        Companies House keeps a code like this on your company&apos;s record. We never file it anywhere, it is matched from what you told us, and the register&apos;s own entry is the one that counts.
                      </p>
                      {sicMatches.length > 1 && (
                        <button type="button" onClick={() => setSicPick((p) => (p + 1) % sicMatches.length)} style={{ marginTop: 8, background: 'none', border: 'none', color: RIVER, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                          Not quite right? Try another
                        </button>
                      )}
                    </div>
                  )}
                </Step>
              )}

              {step === 4 && (
                <Step title="Anything alongside the work?" sub="The question most tax tools never ask, and it changes everything: each stream is taxed its own way, and Lekhio keeps them separate the way HMRC does.">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {([
                      ['job', '', 'A PAYE job', 'A salary uses your allowance and bands first, so it sets the rate your business profit is taxed at.'],
                      ['property', '', 'Rental property', 'Rent has its own rules: no National Insurance, Section 24 on the mortgage interest, and new rates arriving April 2027.'],
                      ['loan', '', 'A student loan', 'On self employed income the repayment lands in one lump with the January bill. Lekhio includes it in your set aside figure.'],
                    ] as const).map(([val, icon, t, d]) => {
                      const active = streams.includes(val);
                      return (
                        <button key={val} className="opt" onClick={() => setStreams(active ? streams.filter((x) => x !== val) : [...streams, val])} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, backgroundColor: active ? RIVER_TINT : PANEL, border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '15px 16px' }}>
                          <span style={{ fontSize: 24 }}>{icon}</span>
                          <span style={{ flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: INK }}>{t}</span>
                            <span style={{ display: 'block', fontSize: 13, color: MUTED, marginTop: 2, lineHeight: 1.45 }}>{d}</span>
                          </span>
                          <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${active ? RIVER : LINE}`, backgroundColor: active ? RIVER : 'transparent', color: ON_RIVER, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{active ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 14 }}>Tick any that apply, or none. We ask for the exact figures once you are inside, where they can be saved against your account.</p>
                </Step>
              )}

              {step === 5 && (
                <Step title="Your business address" sub="This shows at the top of your invoices. You can skip it and add it later.">
                  <label htmlFor="signup-postcode" style={fieldLabel}>Postcode</label>
                  <input id="signup-postcode" className="field" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())} placeholder="LS1 4AB" style={fieldStyle} />
                  <label style={{ ...fieldLabel, marginTop: 16 }}>Address</label>
                  <input className="field" aria-label="Your address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit 4, Mill Road, Leeds" style={fieldStyle} />
                  <p style={{ fontSize: 12.5, color: MUTED, marginTop: 12 }}>Optional. Tap Continue to skip and add it when you send your first invoice.</p>
                </Step>
              )}

              {step === 6 && (
                /* 🔴 STRUCTURE AWARE, because "Most sole traders are not" was being said to a man
                   who told us two steps earlier that he runs a limited company. VAT registration
                   belongs to the COMPANY for him, so the sentence names that instead of calling
                   him a sole trader. The safe default and the way out stay identical. */
                <Step
                  title="Are you VAT registered?"
                  sub={tradeType === 'ltd'
                    ? 'This one is about the company: whether it is registered for VAT. If you are not sure, choose No, you can change it any time.'
                    : 'Most sole traders are not. If you are not sure, choose No, you can change it any time.'}
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    {([['no', 'No', false], ['yes', 'Yes', true]] as const).map(([k, label, val]) => {
                      const active = vat === val;
                      return (
                        <button key={k} className="opt" onClick={() => setVat(val)} style={{ flex: 1, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: active ? RIVER : INK, backgroundColor: active ? RIVER_TINT : PANEL, border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 14, padding: '18px 0' }}>{label}</button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 22, backgroundColor: RIVER_TINT, borderRadius: 12, padding: 16 }}>
                    <p style={{ fontSize: 13.5, color: RIVER_DEEP, lineHeight: 1.6, margin: 0 }}>That is the quick part done. We will email you a code, and then there are {HOW_LONG} of questions about you, which is where the money is. You can stop part way through and pick up where you left off. Your free trial starts the moment you are in, and no card is needed.</p>
                  </div>
                </Step>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer nav */}
      {!done && !billingResult && (
        <div style={{ borderTop: `1px solid ${LINE}`, backgroundColor: PANEL }}>
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            {step > 1 ? (
              <button onClick={back} style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: 15, fontWeight: 600, color: MUTED, padding: '12px 4px' }}>Back</button>
            ) : <span />}
            <button className="btn" onClick={() => void next()} disabled={!canContinue} style={{ cursor: canContinue ? 'pointer' : 'not-allowed', backgroundColor: canContinue ? RIVER : SURFACE, color: canContinue ? ON_RIVER : MUTED, border: 'none', fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12 }}>
              {step === TOTAL ? 'Start free trial' : 'Continue'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, paddingBottom: 16, margin: 0 }}>7 days free · No card needed · Cancel any time</p>
        </div>
      )}
    </main>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: '-0.8px', margin: '0 0 10px', lineHeight: 1.15 }}>{title}</h1>
      <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.55, margin: '0 0 26px' }}>{sub}</p>
      {children}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%', backgroundColor: PANEL, border: `1.5px solid ${LINE}`, borderRadius: 12, padding: '14px 14px', fontSize: 16, color: INK,
};
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
};
