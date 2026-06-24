import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'TradeBook. Your back office on WhatsApp.',
  description:
    'Snap a receipt or leave a voice note. TradeBook logs it, sorts it, and keeps your books ready for tax. Built for UK sole traders. 30 days free.',
  openGraph: {
    title: 'TradeBook. Your back office on WhatsApp.',
    description:
      'Snap a receipt or leave a voice note. TradeBook logs it, sorts it, and keeps your books ready for tax. Built for UK sole traders.',
    type: 'website',
  },
};

const INK = '#111111';
const INDIGO = '#4F46E5';
const INDIGO_DARK = '#4338CA';
const INDIGO_TINT = '#EEF2FF';
const OFF_WHITE = '#FAFAFA';
const SURFACE = '#F4F4F4';
const MUTED = '#6B7280';
const BORDER = '#ECECEC';

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const trades = [
  'Electricians',
  'Plumbers',
  'Builders',
  'Plasterers',
  'Roofers',
  'Joiners',
  'Decorators',
  'Gas engineers',
  'Groundworkers',
  'Landscapers',
];

const steps = [
  {
    n: '1',
    title: 'Snap it or say it',
    body: 'Send a photo of a receipt on WhatsApp. Or leave a voice note with the amount. That is the whole job.',
  },
  {
    n: '2',
    title: 'TradeBook logs it',
    body: 'It reads the receipt, pulls out the total, sorts the category, and saves it. You get a reply to confirm.',
  },
  {
    n: '3',
    title: 'Tax time is sorted',
    body: 'Your income and expenses are added up as you go. We prepare your quarterly summary. You approve it.',
  },
];

const features = [
  {
    icon: '📸',
    title: 'Receipt capture',
    body: 'Photograph a receipt and it is logged in seconds. No typing. No app to open.',
  },
  {
    icon: '🎙️',
    title: 'Voice notes',
    body: 'On the road with your hands full. Say the expense out loud and carry on.',
  },
  {
    icon: '📚',
    title: 'Books that keep themselves',
    body: 'Every expense sorted into the right category. Your records stay ready all year.',
  },
  {
    icon: '🧾',
    title: 'Quarterly tax prep',
    body: 'We get your numbers ready for Making Tax Digital. You check them before anything is sent.',
  },
  {
    icon: '💬',
    title: 'Ask about your money',
    body: 'How much did I spend on fuel last month? Text the question. Get a straight answer.',
  },
  {
    icon: '🔒',
    title: 'Your data stays yours',
    body: 'Encrypted and held under UK data rules. We never sell it. Ever.',
  },
];

const included = [
  'Unlimited receipt and voice note capture',
  'Automatic bookkeeping and categories',
  'Quarterly MTD summaries prepared for you',
  'Money questions answered on WhatsApp',
  'Your records exported any time you want',
];

export default function HomePage() {
  return (
    <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          * { box-sizing: border-box; }
          body { margin: 0; }
          a { text-decoration: none; }
          .tb-primary { transition: background-color 0.15s ease; }
          .tb-primary:hover { background-color: ${INDIGO_DARK} !important; }
          .tb-secondary { transition: background-color 0.15s ease; }
          .tb-secondary:hover { background-color: ${SURFACE} !important; }
          .tb-card { transition: transform 0.15s ease, box-shadow 0.15s ease; }
          .tb-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(17,17,17,0.08); }
          .tb-link:hover { color: ${INK} !important; }
          .tb-hero-h1 { font-size: 64px; line-height: 1.05; }
          .tb-section-h2 { font-size: 34px; line-height: 1.15; }
          .tb-grid { grid-template-columns: repeat(3, 1fr); }
          .tb-steps { grid-template-columns: repeat(3, 1fr); }
          @media (max-width: 860px) {
            .tb-grid { grid-template-columns: 1fr; }
            .tb-steps { grid-template-columns: 1fr; }
            .tb-hero-h1 { font-size: 44px; }
            .tb-section-h2 { font-size: 28px; }
            .tb-nav-cta { display: none; }
            .tb-price-split { flex-direction: column; }
          }
        `,
        }}
      />

      {/* Nav */}
      <nav
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '22px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: INK }}>
          TradeBook
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <a href="#how" className="tb-link" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>
            How it works
          </a>
          <a href="#pricing" className="tb-link" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>
            Pricing
          </a>
          <Link
            href="/early-access"
            className="tb-primary tb-nav-cta"
            style={{
              backgroundColor: INDIGO,
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: 8,
            }}
          >
            Get early access
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px 56px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: INDIGO_TINT,
            color: INDIGO,
            fontSize: 13,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 20,
            marginBottom: 28,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', display: 'inline-block' }} />
          Works through WhatsApp. No new app to learn.
        </div>

        <h1 className="tb-hero-h1" style={{ fontWeight: 800, letterSpacing: '-1.5px', margin: '0 0 22px' }}>
          Text it. It is in your TradeBook.
        </h1>

        <p style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 36px' }}>
          The back office for UK tradespeople. Snap a receipt or leave a voice note. TradeBook
          logs it, sorts it, and keeps your books ready for tax. All on WhatsApp.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/early-access"
            className="tb-primary"
            style={{
              backgroundColor: INDIGO,
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 600,
              padding: '15px 30px',
              borderRadius: 10,
            }}
          >
            Get early access
          </Link>
          <a
            href="#how"
            className="tb-secondary"
            style={{
              backgroundColor: 'transparent',
              color: INK,
              border: `1px solid ${INK}`,
              fontSize: 16,
              fontWeight: 600,
              padding: '15px 30px',
              borderRadius: 10,
            }}
          >
            See how it works
          </a>
        </div>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 18 }}>
          30 days free. No card needed to start.
        </p>
      </section>

      {/* Trust strip */}
      <section style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, backgroundColor: '#FFFFFF' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 16px' }}>
            Built for the trades
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 12px', justifyContent: 'center' }}>
            {trades.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: INK,
                  backgroundColor: SURFACE,
                  padding: '7px 14px',
                  borderRadius: 8,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ maxWidth: 1080, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="tb-section-h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>
            Three steps. That is the whole thing.
          </h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>
            No spreadsheets. No shoebox of receipts. No evenings lost to paperwork.
          </p>
        </div>

        <div className="tb-steps" style={{ display: 'grid', gap: 20 }}>
          {steps.map((s) => (
            <div
              key={s.n}
              style={{
                backgroundColor: '#FFFFFF',
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: 28,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: INDIGO_TINT,
                  color: INDIGO,
                  fontWeight: 700,
                  fontSize: 17,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18,
                }}
              >
                {s.n}
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ backgroundColor: '#FFFFFF', borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="tb-section-h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>
              Everything your accountant nags you for.
            </h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>
              Done as you work, not at the end of the year.
            </p>
          </div>

          <div className="tb-grid" style={{ display: 'grid', gap: 20 }}>
            {features.map((f) => (
              <div
                key={f.title}
                className="tb-card"
                style={{
                  backgroundColor: OFF_WHITE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 16,
                  padding: 26,
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{f.title}</h3>
                <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1080, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 className="tb-section-h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>
            One price. No surprises.
          </h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>
            Try it free for 30 days. Keep it for less than a tank of diesel a month.
          </p>
        </div>

        <div
          style={{
            maxWidth: 760,
            margin: '0 auto',
            backgroundColor: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: '0 10px 40px rgba(17,17,17,0.06)',
          }}
        >
          <div className="tb-price-split" style={{ display: 'flex' }}>
            <div style={{ flex: 1, padding: 36, borderRight: `1px solid ${BORDER}` }}>
              <div
                style={{
                  display: 'inline-block',
                  backgroundColor: INDIGO_TINT,
                  color: INDIGO,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.6px',
                  padding: '6px 12px',
                  borderRadius: 8,
                  marginBottom: 22,
                }}
              >
                30 DAYS FREE
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-2px' }}>£29</span>
                <span style={{ fontSize: 17, color: MUTED }}>/ month</span>
              </div>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 26px' }}>
                After your free trial. Cancel any time.
              </p>
              <Link
                href="/early-access"
                className="tb-primary"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  backgroundColor: INDIGO,
                  color: '#FFFFFF',
                  fontSize: 16,
                  fontWeight: 600,
                  padding: '15px',
                  borderRadius: 10,
                }}
              >
                Start free trial
              </Link>
            </div>

            <div style={{ flex: 1, padding: 36 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 18px' }}>
                What you get
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {included.map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: INDIGO_TINT,
                        color: INDIGO,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 1,
                      }}
                    >
                      ✓
                    </span>
                    <span style={{ fontSize: 15, color: INK, lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Promise band */}
      <section style={{ backgroundColor: INK }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '72px 24px', textAlign: 'center' }}>
          <h2 className="tb-section-h2" style={{ color: '#FFFFFF', fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>
            You are good with your hands. Let TradeBook do the paperwork.
          </h2>
          <p style={{ fontSize: 17, color: '#B8B8B8', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 32px' }}>
            HMRC keeps you responsible for your tax. TradeBook keeps you ready for it. We prepare
            your figures. You always approve before anything is sent.
          </p>
          <Link
            href="/early-access"
            className="tb-primary"
            style={{
              display: 'inline-block',
              backgroundColor: INDIGO,
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: 600,
              padding: '15px 32px',
              borderRadius: 10,
            }}
          >
            Get early access
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: OFF_WHITE, borderTop: `1px solid ${BORDER}` }}>
        <div
          style={{
            maxWidth: 1080,
            margin: '0 auto',
            padding: '40px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 4 }}>TradeBook</div>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Text it. It is in your TradeBook.</p>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Link href="/early-access" className="tb-link" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>
              Early access
            </Link>
            <Link href="/privacy" className="tb-link" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>
              Privacy
            </Link>
            <Link href="/terms" className="tb-link" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>
              Terms
            </Link>
            <a href="mailto:support@tradebook.app" className="tb-link" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>
              Support
            </a>
          </div>
        </div>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 36px' }}>
          <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
            © {new Date().getFullYear()} TradeBook. Built for UK sole traders. TradeBook prepares your
            records. You stay responsible for your tax with HMRC.
          </p>
        </div>
      </footer>
    </main>
  );
}
