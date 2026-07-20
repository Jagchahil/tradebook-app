// THE NEWSLETTER. A newsletter is defined here as content blocks, rendered into the SAME branded shell
// every other Lekhio email uses (via sendMarketingEmail), so a broadcast looks identical to the welcome
// and receipt emails — one professional company. Each block is a small, tagged shape so an issue reads
// like plain content, not markup. The renderer turns blocks into the inner HTML the shell wraps and to
// which it adds the header, footer and one-click unsubscribe.
//
// SHIPS DARK, like the nurture sequence. Issues live here in code, are previewed in the console, and are
// only ever sent by a signed-in team member hitting the team-gated send route — and only when
// NEWSLETTER_SEND_ENABLED is 'true'. Nothing broadcasts on its own.

const INK = '#111111';
const RIVER = '#1B59A6';
const GOLD = '#C6871A';
const MUTED = '#5B6470';
const LINE = '#ECE9E2';
const APP = 'https://lekhio.app';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(href: string): string {
  return href && /^https?:\/\/[^\s"'<>]+$/i.test(href) ? href : APP;
}

// A newsletter is composed of these blocks. `h` and `lede` carry plain text (escaped). `p` and `note`
// carry author-trusted inline HTML (so <strong>, <a> and <em> work); they are never fed user input.
export type Block =
  | { type: 'lede'; text: string }
  | { type: 'h'; text: string }
  | { type: 'p'; html: string }
  | { type: 'button'; href: string; label: string }
  | { type: 'divider' }
  | { type: 'note'; html: string };

export interface Newsletter {
  id: string;
  subject: string;
  preheader?: string;
  blocks: Block[];
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case 'lede':
      return `<p style="font-size:18px;line-height:1.6;font-weight:600;color:${INK};margin:0 0 18px">${esc(b.text)}</p>`;
    case 'h':
      return `<p style="font-size:16px;font-weight:800;letter-spacing:-0.2px;color:${INK};margin:24px 0 10px">${esc(b.text)}</p>`;
    case 'p':
      return `<p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">${b.html}</p>`;
    case 'button':
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${RIVER};border-radius:10px"><a href="${safeUrl(b.href)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${esc(b.label)}</a></td></tr></table>`;
    case 'divider':
      return `<div style="height:1px;background:${LINE};margin:26px 0"></div>`;
    case 'note':
      return `<p style="font-size:13px;line-height:1.6;color:${MUTED};margin:16px 0 0">${b.html}</p>`;
    default:
      return '';
  }
}

// The inner HTML for an issue. sendMarketingEmail wraps this in the branded shell and adds the footer +
// unsubscribe, so this is content only.
export function renderNewsletterInner(nl: Newsletter): string {
  return nl.blocks.map(renderBlock).join('\n');
}

export function getNewsletter(id: string): Newsletter | null {
  return NEWSLETTERS.find((n) => n.id === id) ?? null;
}

// --- the issues -----------------------------------------------------------
// New issues are added here. Each is previewed in the console before it can be sent, and every send
// carries a working unsubscribe. Keep the voice value-first and calm — this is a company that quietly
// does the work, not one that shouts.
export const NEWSLETTERS: Newsletter[] = [
  {
    id: 'costs-you-forget',
    subject: '5 costs sole traders forget to claim',
    preheader: 'Every one of these comes straight off your tax bill.',
    blocks: [
      { type: 'lede', text: 'Most sole traders overpay tax for one simple reason: costs that count never get claimed.' },
      {
        type: 'p',
        html: `Every genuine business cost comes off your taxable profit — so a claimed cost is money you keep instead of handing to HMRC. Here are five that go missing most often.`,
      },
      { type: 'h', text: '1. Mileage' },
      { type: 'p', html: `45p a mile for the first 10,000 business miles. A few trips a week adds up to hundreds a year — and it is easy to forget by January.` },
      { type: 'h', text: '2. Use of home' },
      { type: 'p', html: `If you do your admin, quotes or invoicing from home, a share of your household costs is a legitimate expense.` },
      { type: 'h', text: '3. Phone and broadband' },
      { type: 'p', html: `The business portion of your phone and internet counts. For most tradespeople that is not a small number over a year.` },
      { type: 'h', text: '4. Tools, kit and materials' },
      { type: 'p', html: `The obvious one people still miss — because the receipt is in a glovebox, a jacket, or long gone.` },
      { type: 'h', text: '5. A share of the van' },
      { type: 'p', html: `Fuel, insurance, repairs, tax — the business share is all claimable, and it is one of the biggest costs a trade runs.` },
      { type: 'divider' },
      {
        type: 'p',
        html: `The pattern is always the same: it is not that the costs do not qualify, it is that the receipt goes missing. That is the whole job Lekhio does — snap a receipt or send a quick text, and every cost is captured across the year, so nothing is lost by the deadline.`,
      },
      { type: 'button', href: APP, label: 'See how it works' },
      { type: 'note', html: `Lekhio is an independent UK company and does not give personalised tax advice. These are general pointers, not a recommendation for your specific situation.` },
    ],
  },
];
