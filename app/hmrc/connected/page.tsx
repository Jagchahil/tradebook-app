import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HMRC connection | Lekhio',
  robots: { index: false, follow: false },
};

const INK = '#111111';
const RIVER = '#1B59A6';
const GREEN = '#15803D';
const RED = '#B42318';
const MUTED = '#5B6470';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// Landing page after the HMRC OAuth round-trip. The browser lands here; the user
// then returns to the Lekhio app, which re-checks the connection status.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const ok = status === 'ok';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: OFF_WHITE,
        fontFamily: FONT,
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          background: '#fff',
          border: '1px solid #ECECEC',
          borderRadius: 16,
          padding: '40px 28px',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>{ok ? '✅' : '⚠️'}</div>
        <h1 style={{ color: INK, fontSize: 24, margin: '0 0 12px', fontWeight: 700 }}>
          {ok ? 'Connected to HMRC' : 'We could not finish connecting'}
        </h1>
        <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.5, margin: '0 0 24px' }}>
          {ok ? (
            <>
              Your HMRC account is linked to Lekhio. You can close this tab and head
              back to the app. Nothing is ever sent to HMRC until you check the
              figures and approve it yourself.
            </>
          ) : (
            <>
              Something went wrong linking your HMRC account, so nothing was changed.
              Head back to the app and try again. If it keeps happening, get in touch
              and we will sort it.
            </>
          )}
        </p>
        <p style={{ color: ok ? GREEN : RED, fontSize: 14, fontWeight: 600, margin: 0 }}>
          {ok ? 'You are all set.' : 'No data was shared.'}
        </p>
        <p style={{ color: RIVER, fontSize: 14, marginTop: 20 }}>Return to the Lekhio app</p>
      </div>
    </main>
  );
}
