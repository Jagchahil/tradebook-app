import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { readProvedPhone } from '../../../lib/supabase';
import { WHATSAPP_NUMBER } from '../../../lib/features';
import { bankFeedOffered } from '../../../lib/bankfeed';
import {
  verifyWaLinkCookie, waMeLink, connectMessage, waLinksConfigured, WALINK_COOKIE, LINK_TTL_SECONDS,
} from '../../../lib/walink';
import { qrPath } from '../../../lib/qr';
// The two raw light tokens are for the QR square alone. A code a camera has to read stays dark
// on light whatever the page around it is doing, so it deliberately does not theme, and SVG fill
// attributes cannot resolve a var() anyway.
import { A11Y_CSS, APP_CSS, FONT, RADIUS, INK as QR_INK, PANEL as QR_PAPER } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_WHATSAPP, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE, WHATSAPP,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CONNECTING HIS PHONE, WITH THE PROOF TRAVELLING HIS WAY.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HE SENDS US THE CODE. WE DO NOT SEND HIM ANYTHING.
//
// The number typed at signup is proved by nobody, and users.phone_number is a send target and the
// key inbound WhatsApp resolves a message by. Texting a code to that number to prove it needs
// Twilio, whose account can only text one verified number on earth today. That is why this looked
// like a launch blocker for weeks.
//
// WhatsApp is itself a proof channel. He sends us a code from his own WhatsApp and the webhook sees
// the code and the sender's number in one payload, already authenticated by Meta. No SMS, no cost,
// and it proves the better thing: that he controls the account the receipts will actually arrive
// from. lib/walink.ts holds the rules and the reasoning.
//
// ⚠️ AND THE WELCOME THAT COMES BACK IS A REPLY, NOT A TEMPLATE.
//
// The 27 July build board still describes an Activate press that "fires ONE proactive welcome
// template". That was written before the direction was reversed and it is now the wrong build: a
// proactive template would have to go to the unproved number, would cost money per customer, and
// would need Meta's approval before it could send at all. Because he messages us first, the twenty
// four hour service window is open and the welcome goes out as ordinary text, immediately, free.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NO CLIENT SCRIPT, INCLUDING THE SQUARE. The QR is an inline SVG drawn on the server by
// lib/qr.ts. A hosted QR image service would mean posting his code to a third party on every load,
// and a browser side renderer would mean shipping a credential to a script. Neither is worth
// saving three hundred lines over.

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ problem?: string }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const { problem } = await searchParams;
  const proved = await readProvedPhone(user.id);

  // ⚠️ NULL IS "WE COULD NOT READ", NOT "HE HAS NO PHONE", and the two must not be confused. Telling
  // a man who connected yesterday that he has not is how he ends up binding a second time, or
  // worse, deciding the thing does not work. A read failure draws the honest screen.
  const readFailed = proved === null;
  const bound = proved?.phone ?? null;

  // The whole feature is off unless we have both a secret to sign with and a number for him to
  // message. Doc 103's honesty test: nothing here advertises a capability that does not exist for
  // the man reading it, so an unconfigured build draws an explanation and no buttons at all.
  const configured = waLinksConfigured() && WHATSAPP_NUMBER.length >= 8;

  const code = verifyWaLinkCookie(jar.get(WALINK_COOKIE)?.value ?? null);
  const link = code ? waMeLink(WHATSAPP_NUMBER, code) : null;
  // Drawn once, here, rather than inside the branch, so the encoder runs exactly one time per
  // render and a future second use of the square cannot quietly double the work.
  const square = link ? qrPath(link) : null;

  // lek-wrap, so the desk composition clears the fixed nav rail like every other screen. The page
  // used to size its own column, and a column that centres itself in the viewport sits under the
  // rail on a laptop.
  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/connect" />

      <h1 style={S.h1}>Lekhio on WhatsApp</h1>

      {bound ? (
        <section style={S.card}>
          <p style={S.lead}>
            Your phone is connected. Messages from the number ending {bound.slice(-4)} come straight
            into your books.
          </p>
          <p style={S.body}>
            Send a photo of a receipt and it gets read and filed. Say what you spent or got paid and
            it gets logged. Ask what you owe and you get an answer.
          </p>
          {configured ? (
            <form action="/api/whatsapp/link" method="post" style={S.formRow}>
              {/* Changed his phone. It happens, and the alternative is a support ticket. The new
                  number has to prove itself the same way the old one did, so this is the same
                  button doing the same thing, worded for a man who is not starting from nothing. */}
              <button type="submit" style={S.secondary}>Connect a different phone</button>
            </form>
          ) : null}
        </section>
      ) : !configured ? (
        <section style={S.card}>
          <p style={S.lead}>WhatsApp is not switched on yet.</p>
          {/* The bank sentence returns with bankFeedOffered(); until then the fallback points at
              the Money pages, which take his figures today. */}
          <p style={S.body}>
            {bankFeedOffered()
              ? 'Nothing is wrong with your account. Connect your bank instead and your spending lands in your books on its own, with nothing for you to send us.'
              : 'Nothing is wrong with your account. Add what you earn and spend from the Money pages and it lands in your books all the same.'}
          </p>
          <a href="/app" style={S.primaryLink}>Back to your money</a>
        </section>
      ) : readFailed ? (
        <section style={S.card}>
          <p style={S.lead}>We could not check your account just now.</p>
          <p style={S.body}>
            That is us, not you. Reload the page in a moment and it will tell you where you stand.
          </p>
          <a href="/app/connect" style={S.primaryLink}>Try again</a>
        </section>
      ) : link && code && square ? (
        <>
          <section style={S.card}>
            <p style={S.lead}>Scan this with the phone you want to use.</p>
            <p style={S.body}>
              Your camera opens WhatsApp with the message already written. All you do is press send.
              We read the code and the number it came from together, which is what proves the phone
              is yours.
            </p>

            {/* The square, drawn server side as ordinary JSX rather than injected markup. lib/qr.ts
                hands back a viewBox and one path, so there is no raw HTML anywhere in the web app
                and nothing here has to be trusted not to contain any.
                The label says what to do with it and deliberately does NOT repeat the code: a
                screen reader user gets the same instruction, and the credential stays in one place
                on the page rather than two. */}
            <div style={S.qr}>
              <svg
                viewBox={`0 0 ${square.span} ${square.span}`}
                width={240}
                height={240}
                role="img"
                aria-label="Scan to connect your phone to Lekhio on WhatsApp"
                shapeRendering="crispEdges"
              >
                <rect width={square.span} height={square.span} fill={QR_PAPER} />
                <path fill={QR_INK} d={square.path} />
              </svg>
            </div>

            {/* AND THE SAME THING AS A BUTTON, because plenty of people are reading this ON the
                phone they want to connect, and telling a man to scan a code with the device he is
                holding it on is the sort of instruction that makes a product feel stupid. */}
            <a href={link} style={S.primaryLink}>Open WhatsApp on this phone</a>

            <p style={S.small}>
              This code lasts {Math.round(LINK_TTL_SECONDS / 60)} minutes and works once. If it runs
              out, come back here and press the button for a fresh one.
            </p>
          </section>

          <section style={S.card}>
            <h2 style={S.h2}>If neither of those works</h2>
            <p style={S.body}>
              Message {formatNumber(WHATSAPP_NUMBER)} on WhatsApp and send exactly this:
            </p>
            <p style={S.code}>{connectMessage(code)}</p>
          </section>

          <p style={S.foot}>
            We reply on WhatsApp the moment it lands, so watch your phone rather than this page.{' '}
            <a href="/app/connect" style={S.footLink}>Reload</a> if you want this page to catch up.
          </p>
        </>
      ) : (
        <section style={S.card}>
          <p style={S.lead}>
            Send receipts and ask about your money from the chat app you already have open.
          </p>
          <p style={S.body}>
            Photograph a receipt and it gets read and filed. Say what you spent or got paid and it
            gets logged. Ask what you owe and you get a straight answer.
          </p>
          <p style={S.body}>
            To connect it we need to know which phone is yours, so you send us a code rather than us
            texting you one. It takes about a minute.
          </p>
          {problem === 'unavailable' ? (
            <p style={S.problem}>
              We could not make you a code just then. That is us, not you. Press the button again.
            </p>
          ) : null}
          <form action="/api/whatsapp/link" method="post">
            <button type="submit" style={S.primary}>Show me my code</button>
          </form>
        </section>
      )}
    </main>
  );
}

// Digits in, something a person can read out loud back. Never used to build the link itself: that
// takes the raw digits, because wa.me silently opens a blank screen on anything else.
function formatNumber(digits: string): string {
  const d = digits.replace(/[^0-9]/g, '');
  if (d.length === 12 && d.startsWith('44')) return `+44 ${d.slice(2, 6)} ${d.slice(6)}`;
  return `+${d}`;
}

const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },
  head: { marginBottom: 14 },
  back: { fontSize: 13.5, fontWeight: 700, color: MUTED, textDecoration: 'none' },
  h1: { fontSize: 24, lineHeight: 1.25, fontWeight: 800, letterSpacing: '-0.6px', margin: '0 0 16px' },
  h2: { fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px', margin: '0 0 10px' },
  card: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '20px 18px', marginBottom: 14 },
  lead: { fontSize: 17, lineHeight: 1.5, fontWeight: 700, margin: '0 0 10px' },
  body: { fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: '0 0 14px' },
  small: { fontSize: 13, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  qr: { display: 'flex', justifyContent: 'center', padding: '6px 0 16px' },
  primary: { display: 'block', width: '100%', background: WHATSAPP, color: ON_WHATSAPP, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: 16, fontWeight: 800, padding: '15px 18px', cursor: 'pointer' },
  primaryLink: { display: 'block', textAlign: 'center', background: WHATSAPP, color: ON_WHATSAPP, borderRadius: RADIUS.md, fontSize: 16, fontWeight: 800, padding: '15px 18px', textDecoration: 'none' },
  secondary: { background: 'transparent', border: `1px solid ${LINE}`, borderRadius: RADIUS.md, color: RIVER_DEEP, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, padding: '11px 16px', cursor: 'pointer' },
  formRow: { marginTop: 4 },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, background: SURFACE, borderRadius: RADIUS.md, padding: '13px 14px', margin: 0, wordBreak: 'break-all' },
  problem: { fontSize: 14, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: 13, margin: '0 0 14px' },
  foot: { fontSize: 13, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '4px 4px 0' },
  footLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },
};
