import { BREAK, css, FONT, MOTION, RADIUS, SHADOW, SIDEBAR, SPACE, TYPE } from '../../lib/tokens';
import {
  INK, LINE, MUTED, PANEL, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
} from '../../lib/apptheme';

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
      // ⚠️ THE HINT NAMES THE PAGE, NOT A REGIME. It read "What an MTD update would report today"
      // until 31 July 2026, on every screen, for every customer. A limited company makes no MTD
      // update at all: Making Tax Digital for Income Tax covers self employment and rent on a
      // personal return, and a company's trade is neither. SECTIONS is a static const by design,
      // rendered twice and read as source text by five test suites, and this component is given no
      // customer to look up, so the row cannot be withheld from a director without rebuilding the
      // nav. Naming what the page actually shows is true for everybody and costs nobody a door.
      { href: '/app/tax/summary', label: 'Quarterly summary', hint: 'Your figures since 6 April, and the quarter on its own' },
      { href: '/app/tax/what-if', label: 'What if', hint: 'Try a change to your profit, on your real figures' },
      { href: '/app/tax/ways-to-save', label: 'Ways to save', hint: 'Every lever we can find you, with the working' },
      // ⚠️ IT IS IN THE RAIL RATHER THAN BEHIND A TOOLS ROW, WHICH DOC 103'S ONCE TEST WOULD
      // NORMALLY REFUSE. A man buys a vehicle every few years, so by the once test this belongs
      // out of sight. It is here anyway, and the reason is that the whole value of the screen is
      // being SEEN BEFORE HE SIGNS. The fork it explains is permanent per vehicle and worth four
      // figures, and a man who has to go looking for it has already been to the dealer. What it
      // replaced to earn the room: nothing, and that is the honest answer. This one is an argued
      // exception rather than a quiet addition.
      { href: '/app/tax/vehicle', label: 'Vehicles', hint: 'Van or car, and the cheapest way to buy one' },
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
      // 🔴 NOT /account. That is the OLD portal door and it demands a phone SMS code, which a web
      // account does not have by design, so from this rail it was a door that never opened. It
      // stays alive for the phone era customers who still use it; the rail sends a web customer
      // through the page that rides the session he is already signed in with.
      { href: '/app/you/billing', label: 'Billing', hint: 'Your card, invoices and cancelling' },
      // The hint named the daily reminder, which is not sent. A nav cannot afford the two reads that
      // decide whether that row draws, so it describes the page instead of listing its contents.
      { href: '/app/you/settings', label: 'Settings', hint: 'What Lekhio sends you, and how to stop it' },
    ],
  },
];

// ⚠️ THE CURRENT PAGE IS PASSED IN, NOT SNIFFED. usePathname would make this a client component and
// the whole web app is deliberately server rendered. headers() cannot see the route unless the
// middleware writes it, and widening a matcher that exists only for /api would put middleware on
// the critical path of every page a customer loads, to draw one underline.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE COMPONENT, TWO RENDERINGS, AND CSS ALONE DECIDES WHICH IS ON SCREEN.
//
// From BREAK.desk up the app is a dashboard: a fixed left rail with the five sections as headed
// groups, every item visible, nothing to click open. In the hand nothing changes at all: the top
// bar and its <details> clickers below are byte for byte the 30 July behaviour.
//
// ⚠️ WHY THE RAIL IS ITS OWN MARKUP AND NOT THE SAME <details> FORCED OPEN.
//
// Two dead ends, both tried on paper first. CSS cannot reveal a closed <details>: the panel sits
// in a browser slot author styles do not reach, so `display:block` on the panel of a closed one
// draws nothing (the ::details-content escape hatch is 2024 Chrome, and this app serves five year
// old Androids). And the open attribute cannot be written into the markup for all five, because
// the dropdowns share a name so the browser itself closes all but one, which is exactly what the
// attribute is for on the phone. Forcing them open would mean dropping the name, and the name is
// the fix for the two-menus-drawn-at-once bug recorded above.
//
// So the rail renders the same SECTIONS constant a second time as plain lists, one media query
// hides whichever composition does not apply, and display:none keeps the hidden copy out of the
// accessibility tree and the tab order. The phone's behaviour is untouched because the phone's
// markup is untouched.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function AppNav({ current }: { current: string }) {
  return (
    <nav className="lek-shell" aria-label="Your Lekhio">
      <style>{CSS}</style>

      {/* THE HAND. The top bar and the five clickers, exactly as they were. */}
      <div className="lek-bar">
        <div className="lek-bar-row">
          <a href="/app" className="lek-logo">Lekhio</a>
          {/* Signing out is a state change, so it is a form and not a link. A GET that ends a session
              is a session any other site can end for him with an image tag. */}
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="lek-out">Sign out</button>
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
      </div>

      {/* THE DESK. The same five sections as headed groups on a fixed rail, always open.
          ⚠️ LABELS WITHOUT HINTS, ON PURPOSE. The dropdown shows a hint because a closed menu has
          to earn the click it just cost. A rail is read fifty times a day, and twenty three
          sentences permanently on screen is doc 103's noticeboard. The label is the promise; the
          page keeps it. */}
      <div className="lek-side">
        <a href="/app" className="lek-logo lek-side-logo">Lekhio</a>
        {SECTIONS.map((sec) => {
          if (!sec.items.length) {
            return (
              <a
                key={sec.href}
                href={sec.href}
                className={`lek-side-item top${current === sec.href ? ' on' : ''}`}
                aria-current={current === sec.href ? 'page' : undefined}
              >
                {sec.label}
              </a>
            );
          }
          return (
            <div key={sec.href}>
              <div className="lek-side-head">{sec.label}</div>
              {sec.items.map((i) => (
                <a
                  key={i.href}
                  href={i.href}
                  className={`lek-side-item${i.href === current ? ' on' : ''}`}
                  aria-current={i.href === current ? 'page' : undefined}
                >
                  {i.label}
                </a>
              ))}
            </div>
          );
        })}
        <form action="/api/auth/signout" method="post" className="lek-side-out">
          <button type="submit" className="lek-out">Sign out</button>
        </form>
      </div>
    </nav>
  );
}

// One style block rather than inline styles, because a dropdown needs :hover, [open], a keyframe
// and now a media query, and none of those exist in a React style object. The bar's own styles
// moved in here from inline for the same reason: an inline style cannot be switched off at desk
// widths, and the rail needs the bar gone, not restyled.
const CSS = css`
.lek-shell{font-family:${FONT}}
.lek-bar{color:${INK};border-bottom:1px solid ${LINE};background:${PAPER};padding:14px 16px 0;margin-bottom:20px}
.lek-bar-row{display:flex;align-items:center;justify-content:space-between;max-width:960px;margin:0 auto}
.lek-logo{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:${RIVER_DEEP};text-decoration:none}
.lek-out{background:transparent;border:none;color:${MUTED};font-size:13.5px;font-weight:600;font-family:${FONT};cursor:pointer;padding:6px}
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
/* THE RAIL. Hidden in the hand, fixed on a desk, and APP_CSS moves the content column over to
   meet it: the two share the SIDEBAR constant so they cannot disagree about the width. The rail
   scrolls its own overflow, because five headed groups run taller than a small laptop screen and
   a menu whose bottom entries cannot be reached is a menu that lies about what exists. */
.lek-side{display:none}
@media(min-width:${BREAK.desk}px){
  .lek-bar{display:none}
  .lek-side{display:block;position:fixed;top:0;left:0;bottom:0;width:${SIDEBAR}px;box-sizing:border-box;overflow-y:auto;background:${PANEL};border-right:1px solid ${LINE};padding:${SPACE.lg}px ${SPACE.md}px ${SPACE.xl}px;color:${INK}}
  .lek-side-logo{display:block;font-size:22px;margin:0 ${SPACE.xs}px ${SPACE.xs}px}
  .lek-side-head{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};margin:${SPACE.lg}px ${SPACE.xs}px ${SPACE.hair}px}
  .lek-side-item{display:block;font-size:14px;font-weight:600;color:${INK};text-decoration:none;line-height:1.35;padding:7px ${SPACE.xs}px;border-radius:${RADIUS.sm}px;transition:background-color ${MOTION.quick} ${MOTION.ease},color ${MOTION.quick} ${MOTION.ease}}
  .lek-side-item:hover{background:${SURFACE}}
  .lek-side-item.on{background:${RIVER_TINT};color:${RIVER_DEEP};font-weight:700}
  .lek-side-item.top{font-weight:700;margin-top:${SPACE.sm}px}
  .lek-side-out{margin-top:${SPACE.xl}px;border-top:1px solid ${LINE};padding-top:${SPACE.sm}px}
}
`;
