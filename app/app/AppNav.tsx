import { css, DOCK, FONT, GLASS, MOTION, RADIUS, SPACE, TYPE } from '../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, RIVER, RIVER_DEEP, RIVER_TINT, edge,
} from '../../lib/apptheme';

// THE WAY AROUND HIS OWN PRODUCT, WORN LIKE THE APPS HE ALREADY KNOWS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 UNTIL 30 JULY THERE WAS NO NAVIGATION IN THE WEB APP AT ALL. Then came a top bar with
// dropdowns and a desk sidebar, and on 5 August 2026 both were replaced by this: one floating
// bottom bar, the shape of Instagram's, at every width. This exact shell is the reference the
// native apps will copy, which is why every number it uses lives in lib/tokens.ts.
//
// THE SHELL IS FOUR THINGS:
//   1. The bar. Fixed at the foot, floating clear of the edges, five items: Home, Money, the
//      plus, Tax, You. Translucent glass: a token background mixed with transparency over a
//      blur, and a GLASS.border border because the definition must survive dark, where shadows
//      die.
//   2. The plus. The one raised button, in the middle, the primary action. It opens the sheet.
//   3. The sheet. Six identical buttons floating above the bar, everything a man ADDS: an
//      invoice, a diary job, a goal, an entry, a till slip, a statement. It is a <details>, so
//      it opens with no script at all, exactly as the old dropdowns did.
//   4. Ask Lekhio. A round glass button fixed top right, on every screen but the thread itself,
//      opening the conversation, the way a DM button sits over a feed.
//
// ⚠️ AND STILL NO CLIENT JAVASCRIPT. A menu that waits for hydration is a menu that is dead for
// the first second on a bad signal, and a bad signal is a building site.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface NavItem { href: string; label: string; hint?: string }
export interface NavSection { href: string; label: string; items: NavItem[] }

// THE PLUS SHEET. Six actions, and six is the number: doc 103 says every button is a decision
// handed to the user, so this is everything he ADDS and nothing he merely reads. Adding a seventh
// means arguing one of these six out.
export const PLUS_ACTIONS: ReadonlyArray<NavItem> = [
  { href: '/app/invoices/new', label: 'Make an invoice' },
  { href: '/app/diary', label: 'Jobs diary' },
  { href: '/app/goals', label: 'Goals' },
  { href: '/app/money/add', label: 'Add an entry' },
  // ONE ROW WHERE TWO STOOD, 12 August 2026. The till slip and statement rows asked him to
  // sort his own paperwork before the product would look at it. The one door sorts for him.
  { href: '/app/money/upload', label: 'Upload receipts or statements' },
];

// ⚠️ ONLY ROUTES THAT EXIST GO IN HERE, AND test/appnav.test.mjs FAILS THE BUILD IF ONE DOES NOT.
//
// A nav is a promise. The four top entries are the bar's tabs. The items under each are the
// destinations that light that tab up, and every one of them is reachable inside the shell: from
// the tab's own page, from the plus sheet, or from the floating Ask Lekhio button. The test walks
// this list and proves each door is really offered somewhere, so a route cannot quietly become
// unreachable the way the old sidebar's rows could have.
//
// ⚠️ SECTIONS IS A STATIC CONST ON PURPOSE. It is rendered whole by the shell and read as source
// text by a dozen suites, and AppNav is given no customer to look up, so no row can be withheld
// from one man without rebuilding the nav. That trade off is recorded in
// test/wave9_mtdstructure.test.mjs and it did not change when the sidebar became a bar.
export const SECTIONS: ReadonlyArray<NavSection> = [
  {
    href: '/app',
    label: 'Home',
    items: [
      // The feed flows under the Overview's figures on Home itself, newest first, and keeps its
      // own page for the man who wants only the record.
      { href: '/app/feed', label: 'Feed', hint: 'Everything that has happened, newest first' },
      { href: '/app/thread', label: 'Ask Lekhio', hint: 'Your questions and the answers, kept' },
    ],
  },
  {
    href: '/app/money',
    label: 'Money',
    items: [
      { href: '/app/money', label: 'Everything logged', hint: 'Every payment, a month at a time' },
      { href: '/app/pile', label: 'Waiting on you', hint: 'Anything we could not call ourselves' },
      { href: '/app/goals', label: 'Goals', hint: 'What you are saving for, written down' },
      { href: '/app/money/add', label: 'Add an entry', hint: 'Cash in hand, typed straight in' },
      { href: '/app/money/upload', label: 'Upload receipts or statements', hint: 'Photos and bank CSVs together, and nothing counts until you say so' },
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
      // personal return, and a company's trade is neither. SECTIONS is a static const by design
      // and this component is given no customer to look up, so the row cannot be withheld from a
      // director without rebuilding the nav. Naming what the page actually shows is true for
      // everybody and costs nobody a door.
      { href: '/app/tax/summary', label: 'Quarterly summary', hint: 'Your figures since 6 April, and the quarter on its own' },
      { href: '/app/tax/what-if', label: 'What if', hint: 'Try a change to your profit, on your real figures' },
      { href: '/app/tax/ways-to-save', label: 'Ways to save', hint: 'Every lever we can find you, with the working' },
      // ⚠️ VEHICLES IS AN ARGUED EXCEPTION TO DOC 103'S ONCE TEST, unchanged from the sidebar
      // era. A man buys a vehicle every few years, so by the once test this belongs out of sight.
      // It stays a named door anyway, because the whole value of the screen is being SEEN BEFORE
      // HE SIGNS: the fork it explains is permanent per vehicle and worth four figures, and a man
      // who has to go looking for it has already been to the dealer.
      { href: '/app/tax/vehicle', label: 'Vehicles', hint: 'Van or car, and the cheapest way to buy one' },
      { href: '/app/tax/can-i-claim', label: 'Can I claim it', hint: 'The expense rules, with HMRC sources' },
      { href: '/app/pay-yourself', label: 'Pay yourself', hint: 'The most tax efficient way to take your money out' },
    ],
  },
  {
    // The profile hub. Who he is, what is his, and every standing choice, one screen of
    // identically shaped rows, with signing out as the last row rather than a lost corner of a
    // dead sidebar.
    href: '/app/you',
    label: 'You',
    items: [
      { href: '/app/invoices', label: 'Every invoice', hint: 'Who owes you, and what is late' },
      { href: '/app/invoices/new', label: 'Make an invoice', hint: 'Built here, sent by you' },
      { href: '/app/diary', label: 'Jobs diary', hint: 'What is booked, and one press to invoice it' },
      { href: '/app/proof-of-income', label: 'Proof of income', hint: 'The summary a landlord or lender asks for' },
      { href: '/app/share-books', label: 'Share your books', hint: 'A read only link you can take back' },
      { href: '/app/you', label: 'About you', hint: 'Who we think you are, and how to reach you' },
      { href: '/app/you/circumstances', label: 'Circumstances', hint: 'What you have told us, and what is still worth answering' },
      { href: '/app/you/elections', label: 'Allowances', hint: 'Working from home, and the flat trading allowance' },
      { href: '/app/connect', label: 'WhatsApp', hint: 'The number your receipts arrive from' },
      // 🔴 NOT /account. That is the OLD portal door and it demands a phone SMS code, which a web
      // account does not have by design, so from a menu it was a door that never opened. It stays
      // alive for the phone era customers who still use it; the shell sends a web customer
      // through the page that rides the session he is already signed in with.
      { href: '/app/you/billing', label: 'Billing', hint: 'Your card, invoices and cancelling' },
      { href: '/app/you/settings', label: 'Settings', hint: 'What Lekhio sends you, and how to stop it' },
    ],
  },
];

// The tab icons. Drawn inline in currentColor so they follow the tab's own ink through hover,
// active and both themes, and decorative because the word is printed right under them.
const ICON: Record<string, React.ReactNode> = {
  '/app': <path d="M3 11.2 12 4l9 7.2M5.5 9.8V20h13V9.8" />,
  '/app/money': (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.4 15.6h5.4M9.4 12.6h3.4M14.2 8.9a2.5 2.5 0 0 0-4.2 1.8v4.9" />
    </>
  ),
  '/app/tax': (
    <>
      <path d="M18.5 5.5l-13 13" />
      <circle cx="7.3" cy="7.3" r="2.3" />
      <circle cx="16.7" cy="16.7" r="2.3" />
    </>
  ),
  '/app/you': (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
};

function TabIcon({ href }: { href: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICON[href]}
    </svg>
  );
}

// ⚠️ THE CURRENT PAGE IS PASSED IN, NOT SNIFFED. usePathname would make this a client component
// and the whole web app is deliberately server rendered. A page that lives under a tab names the
// tab's own route or one of its items, and the owning tab lights up either way.
export function AppNav({ current }: { current: string }) {
  const owner = SECTIONS.find(
    (sec) => sec.href === current || sec.items.some((i) => i.href === current),
  )?.href ?? null;

  const tab = (sec: NavSection) => {
    const on = owner === sec.href;
    return (
      <a
        key={sec.href}
        href={sec.href}
        className={`lek-tab${on ? ' on' : ''}`}
        aria-current={on ? 'page' : undefined}
      >
        <TabIcon href={sec.href} />
        {sec.label}
      </a>
    );
  };

  return (
    <nav className="lek-dock" aria-label="Your Lekhio">
      <style>{CSS}</style>

      {/* ASK LEKHIO, floating top right on every screen but the thread itself, where a button
          opening the page it is already on would fail doc 103's honesty test. */}
      {current === '/app/thread' ? null : (
        <a href="/app/thread" className="lek-glass lek-ask" aria-label="Ask Lekhio">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.6a8.4 8.4 0 0 1-8.6 8.2 9 9 0 0 1-4-.9L3 20l1.2-4.2a8 8 0 0 1-1-3.9A8.4 8.4 0 0 1 11.8 3.7 8.4 8.4 0 0 1 21 11.6Z" />
          </svg>
        </a>
      )}

      {/* THE BAR. Five items: two tabs, the plus, two tabs. The plus sits between the two halves
          of SECTIONS, which is why the list is rendered in two slices of one constant. */}
      <div className="lek-glass lek-dock-bar">
        {SECTIONS.slice(0, 2).map(tab)}

        {/* THE PLUS. A <details>, so the sheet opens and closes in the browser with no script,
            and the summary is a real focusable control for a keyboard. */}
        <details className="lek-plus">
          <summary className="lek-plus-btn" aria-haspopup="true" aria-label="Add to your books">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </summary>
          <div className="lek-glass lek-plus-sheet" aria-label="Add to your books">
            {PLUS_ACTIONS.map((a) => (
              <a key={a.href} href={a.href} className="lek-plus-item">{a.label}</a>
            ))}
          </div>
        </details>

        {SECTIONS.slice(2).map(tab)}
      </div>
    </nav>
  );
}

// One style block rather than inline styles, because the sheet needs [open], :hover, a keyframe
// and ::-webkit-details-marker, and none of those exist in a React style object.
const CSS = css`
.lek-dock{font-family:${FONT}}
/* THE GLASS, DECLARED ONCE AND WORN BY ALL THREE SHELL SURFACES: the bar, the sheet with its six
   buttons, and the Ask Lekhio button. Solid panel first for the five year old Android that cannot
   parse color-mix, then the translucent mix and the blur for the browsers that can. The border is
   GLASS.border and never a local number: the definition of a glass edge has to survive dark,
   where every shadow in lib/tokens.ts disappears, so a thick border and a one pixel inset
   highlight carry it in both appearances. */
.lek-glass{background:${PANEL};background:${edge(PANEL, 78)};-webkit-backdrop-filter:${GLASS.blur};backdrop-filter:${GLASS.blur};border:${GLASS.border}px solid ${LINE};box-shadow:inset 0 1px 0 ${edge(PANEL, 60)}}
/* THE BAR. Fixed, centred, floating: it keeps a margin from the screen edges and rounds to a
   pill, and it never grows past DOCK.maxWidth so five items stay a hand's shape on a desk.
   width is a calc against the viewport, so a 375 pixel phone fits all five without a scroll. */
.lek-dock-bar{position:fixed;z-index:40;left:50%;transform:translateX(-50%);bottom:calc(${SPACE.sm}px + env(safe-area-inset-bottom,0px));width:calc(100% - ${SPACE.lg}px);max-width:${DOCK.maxWidth}px;box-sizing:border-box;display:flex;align-items:center;gap:${SPACE.hair}px;padding:${SPACE.hair}px;border-radius:${RADIUS.pill}px}
.lek-tab{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;padding:${SPACE.xs}px 0;border-radius:${RADIUS.pill}px;font-size:${TYPE.label}px;font-weight:700;line-height:1;color:${MUTED};text-decoration:none;transition:color ${MOTION.quick} ${MOTION.ease},background-color ${MOTION.quick} ${MOTION.ease}}
.lek-tab svg{width:22px;height:22px}
.lek-tab:hover{color:${INK}}
/* The active tab: river ink on the river tint, the pair the tokens guard holds in both themes. */
.lek-tab.on{color:${RIVER_DEEP};background:${RIVER_TINT}}
.lek-plus{flex:0 0 auto;display:flex}
/* The one raised button. Filled river with its ON ink, visibly the primary act of the bar. */
.lek-plus-btn{list-style:none;display:grid;place-items:center;width:52px;height:52px;box-sizing:border-box;border-radius:${RADIUS.pill}px;background:${RIVER};color:${ON_RIVER};border:${GLASS.border}px solid ${LINE};border-color:${edge(RIVER_DEEP, 40)};cursor:pointer;transition:transform ${MOTION.quick} ${MOTION.ease}}
.lek-plus-btn::-webkit-details-marker{display:none}
.lek-plus-btn svg{width:24px;height:24px}
.lek-plus[open] .lek-plus-btn{transform:rotate(45deg)}
/* THE SHEET. Anchored to the bar itself (the bar is the positioned ancestor), floating above it,
   two columns of six identical buttons. */
.lek-plus-sheet{position:absolute;left:0;right:0;bottom:calc(100% + ${SPACE.sm}px);display:grid;grid-template-columns:1fr 1fr;gap:${SPACE.xs}px;padding:${SPACE.xs}px;border-radius:${RADIUS.lg}px;animation:lek-sheet ${MOTION.panel} ${MOTION.ease} both}
@keyframes lek-sheet{from{opacity:0;transform:translateY(${SPACE.xs}px)}to{opacity:1;transform:none}}
.lek-plus-item{display:grid;place-items:center;text-align:center;min-height:56px;padding:${SPACE.sm}px ${SPACE.xs}px;box-sizing:border-box;border-radius:${RADIUS.md}px;background:${PANEL};background:${edge(PANEL, 85)};border:${GLASS.border}px solid ${LINE};color:${INK};font-size:${TYPE.note}px;font-weight:700;line-height:1.35;text-decoration:none;transition:transform ${MOTION.quick} ${MOTION.ease},border-color ${MOTION.quick} ${MOTION.ease}}
.lek-plus-item:hover{transform:translateY(-1px);border-color:${RIVER};border-color:${edge(RIVER, 40)}}
/* ASK LEKHIO. Round, glass, fixed top right, the same border and blur as the bar. */
.lek-ask{position:fixed;z-index:40;top:calc(${SPACE.sm}px + env(safe-area-inset-top,0px));right:${SPACE.sm}px;display:grid;place-items:center;width:46px;height:46px;box-sizing:border-box;border-radius:${RADIUS.pill}px;color:${RIVER_DEEP};text-decoration:none;transition:transform ${MOTION.quick} ${MOTION.ease}}
.lek-ask svg{width:22px;height:22px}
.lek-ask:hover{transform:translateY(-1px)}
`;
