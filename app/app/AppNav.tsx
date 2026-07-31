import {
  FONT, INK, LINE, MOTION, MUTED, PANEL, PAPER, RADIUS, RIVER, RIVER_DEEP, RIVER_TINT, SHADOW,
  SURFACE,
} from '../../lib/tokens';

// THE WAY AROUND HIS OWN PRODUCT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 UNTIL 30 JULY THERE WAS NO NAVIGATION IN THE WEB APP AT ALL.
//
// Every page drew its own header, three pages and three different shapes. From his books the only
// two things he could reach were the setup nudge and the pile. His account, his subscription and
// his WhatsApp settings were all live, all built, and none of them reachable.
//
// ⚠️ FIVE SURFACES, NOT FORTY FIVE. The phone app has forty five screens and a five tab bar, and
// the rest are reached by knowing they exist. A dashboard cannot do that: everything has to be
// FINDABLE, and findable is not the same as visible. So five sections across the top, each one
// opening to what lives under it, and nothing below the fold of a menu that a man needs weekly.
//
// ⚠️ AND NO CLIENT JAVASCRIPT, INCLUDING THE DROPDOWNS. They are <details> elements, which open
// and close in the browser with no script at all. A menu that waits for hydration is a menu that
// is dead for the first second on a bad signal, and a bad signal is a building site.
//
// 🔴 THE DROPDOWNS SHARE A name, AND THE FIRST VERSION DID NOT. Two <details> with no name
// are independent, so opening You while Money was open left both menus drawn at once, each showing
// through the other's panel. Found by pressing them on the live site on 30 July. A shared name
// makes the browser itself close one when the other opens, still with no script. Browsers too old
// to know the attribute keep the old both open behaviour, which is untidy but works, so nobody is
// worse off than they were.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface NavItem { href: string; label: string; hint?: string }
export interface NavSection { href: string; label: string; items: NavItem[] }

// ⚠️ ONLY ROUTES THAT EXIST GO IN HERE, AND test/appnav.test.mjs FAILS THE BUILD IF ONE DOES NOT.
//
// A nav is a promise. Listing "Invoices" before the page is built teaches a man that this product's
// menu lies to him, and he only has to learn that once. So sections appear as their pages land,
// and the plan below is the plan, not the menu.
//
// THE FULL SHAPE WE ARE BUILDING TO, matched against the 45 screens in the phone app:
//   Overview   the money grid, tax set aside, what is waiting, the week
//   Money      everything logged, waiting on you, add an entry, a receipt
//   Invoices   all invoices, new, chase a late payer
//   Tax        where you stand, quarterly summary, CIS, NI, student loan, what if, ways to save
//   You        your business, about you, properties, owners, bank, WhatsApp, share, billing
//
// Five surfaces, everything else one level down. The phone app puts forty five screens behind a
// five tab bar and you reach most of them by already knowing they are there. A dashboard cannot
// do that: it has to be findable, and findable is not the same as visible.
export const SECTIONS: ReadonlyArray<NavSection> = [
  { href: '/app', label: 'Overview', items: [] },
  {
    href: '/app/money',
    label: 'Money',
    items: [
      { href: '/app/money', label: 'Everything logged', hint: 'Every payment, a month at a time' },
      { href: '/app/pile', label: 'Waiting on you', hint: 'Anything we could not call ourselves' },
      { href: '/app/goals', label: 'Goals', hint: 'What you are saving for, written down' },
      { href: '/app/money/add', label: 'Add an entry', hint: 'Cash in hand, typed straight in' },
      { href: '/app/money/capture', label: 'Upload a till slip', hint: 'We read it, and nothing counts until you say so' },
      { href: '/app/money/import', label: 'Upload a statement', hint: 'A CSV from your bank, read without connecting it' },
    ],
  },
  {
    href: '/app/tax',
    label: 'Tax',
    items: [
      { href: '/app/tax', label: 'Where you stand', hint: 'The year, what January collects, and when' },
      { href: '/app/tax/summary', label: 'Quarterly summary', hint: 'What an MTD update would report today' },
      { href: '/app/tax/what-if', label: 'What if', hint: 'Try a change to your profit, on your real figures' },
      { href: '/app/tax/ways-to-save', label: 'Ways to save', hint: 'Every lever we can find you, with the working' },
      { href: '/app/tax/can-i-claim', label: 'Can I claim it', hint: 'The expense rules, with HMRC sources' },
      { href: '/app/pay-yourself', label: 'Pay yourself', hint: 'The most tax efficient way to take your money out' },
    ],
  },
  {
    href: '/app/invoices',
    label: 'Invoices',
    items: [
      { href: '/app/invoices', label: 'Every invoice', hint: 'Who owes you, and what is late' },
      { href: '/app/invoices/new', label: 'Make an invoice', hint: 'Built here, sent by you' },
      { href: '/app/diary', label: 'Jobs diary', hint: 'What is booked, and one press to invoice it' },
      { href: '/app/proof-of-income', label: 'Proof of income', hint: 'The summary a landlord or lender asks for' },
      { href: '/app/share-books', label: 'Share your books', hint: 'A read only link you can take back' },
    ],
  },
  {
    // The You surface proper, 31 July 2026. The section used to lean on /account because there was
    // nowhere else to stand; now /app/you is the overview and the old doors keep their places.
    href: '/app/you',
    label: 'You',
    items: [
      { href: '/app/thread', label: 'Ask Lekhio', hint: 'Your questions and the answers, kept' },
      { href: '/app/you', label: 'About you', hint: 'Who we think you are, and how to reach you' },
      { href: '/app/you/circumstances', label: 'Circumstances', hint: 'What you have told us, and what is still worth answering' },
      { href: '/app/connect', label: 'WhatsApp', hint: 'The number your receipts arrive from' },
      { href: '/account', label: 'Billing', hint: 'Your card, invoices and cancelling' },
      { href: '/app/you/settings', label: 'Settings', hint: 'The daily reminder and the weekly summary' },
    ],
  },
];

// ⚠️ THE CURRENT PAGE IS PASSED IN, NOT SNIFFED. usePathname would make this a client component and
// the whole web app is deliberately server rendered. headers() cannot see the route unless the
// middleware writes it, and widening a matcher that exists only for /api would put middleware on
// the critical path of every page a customer loads, to draw one underline.
export function AppNav({ current }: { current: string }) {
  return (
    <nav style={S.bar} aria-label="Your Lekhio">
      <style>{CSS}</style>

      <div style={S.row}>
        <a href="/app" style={S.logo}>Lekhio</a>
        {/* Signing out is a state change, so it is a form and not a link. A GET that ends a session
            is a session any other site can end for him with an image tag. */}
        <form action="/api/auth/signout" method="post">
          <button type="submit" style={S.out}>Sign out</button>
        </form>
      </div>

      {/* 🔴 THIS ROW MUST NOT SCROLL, AND THE FIRST VERSION DID.
          It was written as overflow-x:auto with overflow-y:visible, on the reasoning that five tabs
          might not fit a phone and scrolling beats wrapping. CSS does not allow that pair: set one
          axis to auto and the other is forced to auto with it. So the scroll box clipped the menus
          hanging out of it, and on the deployed site the carets flipped open onto nothing at all.
          Found by pressing it, not by reading it.
          Wrapping instead. Five short words fit one line on anything wider than a small phone, and
          two tidy rows on a small one is a great deal better than a menu that never appears. */}
      <div className="lek-nav">
        {SECTIONS.map((sec) => {
          const here = sec.href === current || sec.items.some((i) => i.href === current);
          if (!sec.items.length) {
            return (
              <a
                key={sec.href}
                href={sec.href}
                className={`lek-tab${here ? ' on' : ''}`}
                aria-current={here ? 'page' : undefined}
              >
                {sec.label}
              </a>
            );
          }
          return (
            <details key={sec.href} className="lek-drop" name="lek-nav">
              <summary className={`lek-tab${here ? ' on' : ''}`} aria-current={here ? 'page' : undefined}>
                {sec.label}
                <span className="lek-caret" aria-hidden="true" />
              </summary>
              <div className="lek-menu">
                {sec.items.map((i) => (
                  <a key={i.href} href={i.href} className={`lek-item${i.href === current ? ' on' : ''}`}>
                    <span className="lek-item-label">{i.label}</span>
                    {i.hint ? <span className="lek-item-hint">{i.hint}</span> : null}
                  </a>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </nav>
  );
}

// One style block rather than inline styles, because a dropdown needs :hover, [open] and a
// keyframe, and none of those exist in a React style object.
const CSS = `
.lek-nav{display:flex;flex-wrap:wrap;gap:2px;max-width:960px;margin:10px auto 0;padding:0;overflow:visible}
.lek-tab{display:flex;align-items:center;gap:6px;flex:0 0 auto;font-size:14.5px;font-weight:700;color:${MUTED};text-decoration:none;padding:10px 14px;border-radius:${RADIUS.sm}px ${RADIUS.sm}px 0 0;white-space:nowrap;border-bottom:3px solid transparent;cursor:pointer;list-style:none;transition:color ${MOTION.quick} ${MOTION.ease},background-color ${MOTION.quick} ${MOTION.ease}}
.lek-tab::-webkit-details-marker{display:none}
.lek-tab:hover{color:${INK};background:${SURFACE}}
.lek-tab.on{color:${RIVER_DEEP};background:${RIVER_TINT};border-bottom-color:${RIVER}}
.lek-drop{position:relative;flex:0 0 auto}
.lek-caret{width:7px;height:7px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg) translateY(-2px);transition:transform ${MOTION.quick} ${MOTION.ease};opacity:.65}
.lek-drop[open] .lek-caret{transform:rotate(-135deg) translateY(-2px)}
.lek-menu{position:absolute;z-index:20;top:100%;left:0;min-width:262px;background:${PANEL};border:1px solid ${LINE};border-radius:${RADIUS.md}px;box-shadow:${SHADOW.raised};padding:6px;margin-top:4px;animation:lek-drop ${MOTION.panel} ${MOTION.ease} both}
@keyframes lek-drop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.lek-item{display:block;padding:9px 11px;border-radius:${RADIUS.sm}px;text-decoration:none;transition:background-color ${MOTION.quick} ${MOTION.ease}}
.lek-item:hover{background:${SURFACE}}
.lek-item.on{background:${RIVER_TINT}}
.lek-item-label{display:block;font-size:14.5px;font-weight:700;color:${INK}}
.lek-item-hint{display:block;font-size:12.5px;color:${MUTED};margin-top:2px;line-height:1.4}
/* The menu is absolutely positioned, so on a narrow screen it would be cut off by the sideways
   scroll of the row it lives in. Below this width it becomes an ordinary block that pushes the
   page down, which is the behaviour a phone wants anyway. */
/* On a phone the menu stops floating and becomes an ordinary block that pushes the page down,
   which is what a thumb wants and what removes any chance of it being clipped off screen. */
@media(max-width:640px){
  .lek-menu{position:static;min-width:0;box-shadow:none;margin:4px 0 8px}
}
`;

const S: Record<string, React.CSSProperties> = {
  bar: { fontFamily: FONT, color: INK, borderBottom: `1px solid ${LINE}`, background: PAPER, padding: '14px 16px 0', marginBottom: 20 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 960, margin: '0 auto' },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: RIVER_DEEP, textDecoration: 'none' },
  out: { background: 'transparent', border: 'none', color: MUTED, fontSize: 13.5, fontWeight: 600, fontFamily: FONT, cursor: 'pointer', padding: 6 },
};
