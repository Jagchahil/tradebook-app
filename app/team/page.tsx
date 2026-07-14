'use client';

import { useEffect, useState, useMemo } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { sourceLabel, SOURCES } from '../../lib/team';
import type { TeamCustomer, TeamOverview, AcquisitionSource } from '../../lib/team';

// THE TEAM DASHBOARD.
//
// ⚠️ WHAT IS NOT ON THIS SCREEN, AND WILL NOT BE PUT ON IT.
//
// No customer's transactions. No income, no expenses, no tax bill, no receipts, and no phone
// number. The app tells every user "your records are encrypted and only you can see them", and the
// day this page can show a man's books, that sentence becomes a lie. Doc 104: is it TRUE, not is it
// defensible.
//
// What the team sees is who the customer is and what he pays US, which is our business, plus where
// he came from, which is how we stop wasting money on adverts that do not work.
//
// Sign in is a magic link to an email address that must already exist in team_members. There is no
// password, no shared login, and no admin flag hiding on a user account. Membership is a row, and
// it is re-checked on the server on every request.

interface Payload {
  me: { email: string; name: string | null; role: string };
  overview: TeamOverview;
  customers: TeamCustomer[];
  health: {
    crons: string;
    cronAlarms: Array<{ job: string; reason: string }>;
    knowledge: string;
    knowledgeAlarms: Array<{ kind?: string; reason?: string }>;
    brain: Record<string, unknown> | null;
  };
}

const gbp = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

const STATUS_TONE: Record<string, string> = {
  active: '#0F7B4F',
  trialing: '#1B59A6',
  past_due: '#B4690E',
  canceled: '#8A8A8A',
  none: '#8A8A8A',
};

export default function TeamPage() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);   // a reset link went out
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AcquisitionSource | 'all'>('all');

  async function load() {
    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) { setReady(true); return; }

    const res = await fetch('/api/team/overview', { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 403) {
      // HE HAS A VALID SESSION AND NO ROW IN team_members.
      //
      // This is not an edge case, it is the NORMAL state of the world: anybody at all can create a
      // Supabase auth account, and almost nobody is on the team. A password is a key to a door that
      // is not there, and the door is team_members, checked on the server on every request.
      //
      // So do not leave him holding a session. Throw it away and put him back at the sign in screen.
      // A stranger with a live session and an empty screen will assume the page is broken and go
      // looking for the bug. There is no bug. He is simply not on the team.
      await browserSupabase.auth.signOut();
      setError('That account is not on the Lekhio team.');
    } else if (res.status === 503) {
      setError('Could not read the database. This is NOT "no customers". Do not trust a zero here.');
    } else if (!res.ok) {
      setError('Could not load.');
    } else {
      setData((await res.json()) as Payload);
    }
    setReady(true);
  }

  useEffect(() => { load(); }, []);

  // EMAIL AND PASSWORD. Jag asked for it, and he is right that the magic link was a faff.
  //
  // ⚠️ WHAT A PASSWORD COSTS US, WRITTEN DOWN SO NOBODY HAS TO REDISCOVER IT.
  //
  // A team password is the single most likely way this dashboard ever leaks, because a password is
  // a thing that gets shared. It goes in a WhatsApp message to a new starter, it gets reused from
  // another site that has already been breached, and it outlives the person who chose it.
  //
  // So the password is not the only thing standing between a stranger and our customer list, and it
  // never was. THE REAL GATE IS team_members, CHECKED ON THE SERVER ON EVERY SINGLE REQUEST. Anyone
  // can create a Supabase auth account. Almost nobody has a row in team_members. Signing in gets you
  // a session and nothing else: /api/team/* answers 403 to a session with no row, and removing
  // somebody is a DELETE that bites on their very next click.
  //
  // What we DO get from that: a password being guessed is not a breach of the books. It is a
  // stranger holding a key to a door that is not there.
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error: err } = await browserSupabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setBusy(false);

    if (err) {
      // ONE MESSAGE FOR BOTH FAILURES, on purpose. "No such user" and "wrong password" are different
      // facts, and telling them apart lets a stranger use this form to find out who works here.
      setError('That email and password do not match.');
      return;
    }
    setPassword('');  // never leave it sitting in state longer than the request needs it
    load();           // the server decides whether he is actually on the team
  }

  // Forgotten it. This is the ONE place an email link survives, and it should: a reset link that
  // arrives in your inbox is exactly the right amount of friction for the one moment you are
  // locked out.
  async function forgot() {
    const addr = email.trim().toLowerCase();
    if (!addr) { setError('Type your email above first, then tap this.'); return; }
    setError(null);
    await browserSupabase.auth.resetPasswordForEmail(addr, {
      redirectTo: `${window.location.origin}/team/reset`,
    });
    // Same answer whether or not the address exists. See above.
    setSent(true);
  }

  // Save the source, and show it changed straight away. If the save fails we put it BACK, rather
  // than leaving a dropdown showing something the database does not believe. A screen that lies
  // quietly is worse than one that admits it could not save.
  async function saveSource(userId: string, source: string) {
    if (!data) return;
    const before = data.customers;
    setData({ ...data, customers: before.map((c) => (c.id === userId ? { ...c, source: source as AcquisitionSource } : c)) });

    const { data: s } = await browserSupabase.auth.getSession();
    const token = s.session?.access_token;
    const res = await fetch('/api/team/source', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, source }),
    });
    if (!res.ok) {
      setData((d) => (d ? { ...d, customers: before } : d));
      setError('Could not save that. It has been put back.');
    } else {
      setError(null);
      load(); // re-read, so the totals at the top move with it
    }
  }

  const customers = useMemo(() => {
    if (!data) return [];
    return filter === 'all' ? data.customers : data.customers.filter((c) => c.source === filter);
  }, [data, filter]);

  if (!ready) {
    return (
      <main style={S.signInPage}>
        <div style={S.authCard}><p style={S.muted}>One moment.</p></div>
      </main>
    );
  }

  // --- Not signed in -------------------------------------------------------------------------
  //
  // THE FIRST VERSION OF THIS WAS AN UNSTYLED FORM ON A WHITE PAGE. It worked, and it looked like a
  // holding page somebody forgot to finish. This is the screen the team sees every morning, and it
  // is the only page of ours that says "we are a company" rather than "we are a product".
  //
  // No password anywhere, on purpose. A shared admin password is a thing that ends up in a chat
  // message. This is a link to an inbox that must already be a row in team_members.
  if (!data) {
    return (
      <main className="team-split" style={S.split}>
        {/* INLINE STYLES CANNOT DO MEDIA QUERIES, and a two column layout with no breakpoint would
            crush a phone. So the ONE thing that needs a query gets a real stylesheet: below 900px
            there is no brand panel, and the wordmark moves onto the card instead. */}
        <style>{`
          .team-brand-mobile { display: flex; }
          @media (min-width: 900px) {
            .team-split { grid-template-columns: 440px minmax(0, 1fr) !important; }
            .team-brand { display: flex !important; }
            .team-brand-mobile { display: none !important; }
          }
        `}</style>

        {/* THE LEFT PANEL. It is not decoration.
            This is the only screen in the product where the company looks at itself, and the line
            on it is the line the whole thing is built around. A sign in page that says nothing is a
            sign in page that could belong to anybody. */}
        <aside className="team-brand" style={S.brandPanel}>
          <div>
            <div style={S.brandRow}>
              <span style={{ ...S.wordmark, color: '#fff', fontSize: 24 }}>Lekhio</span>
              <span style={S.accent} aria-hidden="true" />
            </div>
            <p style={S.brandLine}>
              One less button at a time.<br />Until only one is left.
            </p>
            <p style={S.brandApprove}>Approve.</p>
          </div>
          <p style={S.brandFoot}>
            The team console. Customers, revenue, and whether the brain still agrees with HMRC.
          </p>
        </aside>

        <div style={S.formPanel}>
        <div style={S.authCard}>
          <div className="team-brand-mobile" style={S.brandRow}>
            <span style={S.wordmark}>Lekhio</span>
            <span style={S.accent} aria-hidden="true" />
          </div>

          {sent ? (
            <>
              <h1 style={S.cardH1}>Check your email</h1>
              <p style={S.cardSub}>
                If <b style={{ color: INK }}>{email.trim().toLowerCase()}</b> is on the team, a link
                to set a new password is on its way.
              </p>
              <button type="button" style={S.ghost} onClick={() => { setSent(false); setError(null); }}>
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 style={S.cardH1}>Team sign in</h1>
              <p style={S.cardSub}>For the Lekhio team.</p>

              <form onSubmit={signIn}>
                <label htmlFor="team-email" style={S.label}>Email</label>
                <input
                  id="team-email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@lekhio.app"
                  style={S.input}
                />

                <label htmlFor="team-password" style={{ ...S.label, marginTop: 16 }}>Password</label>
                <input
                  id="team-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={S.input}
                />

                <button type="submit" style={{ ...S.button, opacity: busy ? 0.6 : 1 }} disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <button type="button" style={S.textLink} onClick={forgot}>
                Forgotten your password?
              </button>
            </>
          )}

          {error ? <p style={S.error}>{error}</p> : null}
        </div>

          <p style={S.legal}>
            This page never shows a customer{"'"}s receipts, figures or phone number, and it never
            will. We tell every user their records are theirs alone.
          </p>
        </div>
      </main>
    );
  }

  const o = data.overview;
  const h = data.health;

  return (
    <main style={S.wrap}>
      <header style={S.header}>
        <div>
          <h1 style={S.h1}>Lekhio, the team</h1>
          <p style={S.muted}>{data.me.name || data.me.email} · {data.me.role}</p>
        </div>
        <button style={S.link} onClick={async () => { await browserSupabase.auth.signOut(); location.reload(); }}>
          Sign out
        </button>
      </header>

      {/* THE BRAIN AND THE MACHINE. If Khoji says our tax figures disagree with GOV.UK, that is the
          most important fact in the company today, and it goes at the top, not in a footer. */}
      <section style={S.healthRow}>
        <Health label="Tax knowledge" value={h.knowledge} good={h.knowledge === 'ok'} />
        <Health label="Scheduled jobs" value={h.crons} good={h.crons === 'ok'} />
      </section>
      {h.knowledge !== 'ok' && h.knowledge !== 'unknown' ? (
        <p style={S.alarm}>
          Khoji says our tax engine disagrees with GOV.UK, or cannot check. Every figure in the
          product is suspect until this is green. See /api/health?config=1.
        </p>
      ) : null}

      {/* THE MONEY. Ours, not theirs. */}
      <section style={S.cards}>
        <Card label="Customers" value={String(o.customers)} />
        <Card label="Paying" value={String(o.active + o.pastDue)} />
        <Card label="On trial" value={String(o.trialing)} />
        <Card label="MRR" value={gbp(o.mrrPence)} />
        <Card label="Cancelling" value={String(o.cancelRequested)} tone={o.cancelRequested > 0 ? '#B4690E' : undefined} />
      </section>
      {o.internal > 0 ? (
        <p style={S.internalNote}>
          Plus {o.internal} internal {o.internal === 1 ? 'account' : 'accounts'} (the App Review demo,
          and any comp). Shown in the table below, counted in none of the figures above. It is not a
          customer and it is not revenue.
        </p>
      ) : null}

      {/* WHERE THEY CAME FROM. This is the whole point of the marketing spend. */}
      <h2 style={S.h2}>Where they came from</h2>
      <div style={S.sourceRow}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          All {o.customers}
        </Chip>
        {SOURCES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {sourceLabel(s)} {o.bySource[s] ?? 0}
          </Chip>
        ))}
      </div>

      <h2 style={S.h2}>Customers</h2>
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <Th>Name</Th><Th>Trade</Th><Th>Joined</Th><Th>Source</Th><Th>Plan</Th><Th>Status</Th><Th>Renews</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={S.tr}>
                <Td>
                  {c.name || 'No name yet'}
                  {c.internal ? <span style={S.internalChip}>internal</span> : null}
                </Td>
                <Td>{c.trade || ''}</Td>
                <Td>{when(c.joined)}</Td>
                <Td>
                  {/* Editable, because a BILLBOARD cannot be inferred from a click, and neither can
                      a man sold to in a merchant's yard. If there is nowhere to put that fact it
                      stays in somebody's head, and then the ad budget gets set by whoever remembers
                      hardest. */}
                  <select
                    value={c.source}
                    onChange={(e) => saveSource(c.id, e.target.value)}
                    style={S.select}
                    aria-label={`Where ${c.name || 'this customer'} came from`}
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>{sourceLabel(s)}</option>
                    ))}
                  </select>
                  {c.sourceDetail ? <span style={S.detail}> · {c.sourceDetail}</span> : null}
                </Td>
                <Td>
                  {c.plan || ''}
                  {c.plan && c.amountPence > 0 ? (
                    <span style={S.detail}> · {gbp(c.amountPence)}</span>
                  ) : null}
                </Td>
                <Td>
                  <span style={{ color: STATUS_TONE[c.status] ?? '#111', fontWeight: 700 }}>{c.status}</span>
                  {c.cancelRequested ? <span style={S.cancel}> cancelling</span> : null}
                </Td>
                <Td>{when(c.renews)}</Td>
              </tr>
            ))}
            {customers.length === 0 ? (
              <tr><Td>No customers in this group yet.</Td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p style={S.footnote}>
        This page shows who our customers are and what they pay us. It does not show anyone{"'"}s
        receipts, income, expenses, tax figures or phone number, and it never will. We tell every
        user their records are theirs alone, and that has to stay true.
      </p>
    </main>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={{ ...S.cardValue, color: tone ?? '#111' }}>{value}</div>
    </div>
  );
}

function Health({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div style={S.health}>
      <span style={{ ...S.dot, background: good ? '#0F7B4F' : value === 'unknown' ? '#8A8A8A' : '#C0392B' }} />
      <span style={S.healthLabel}>{label}</span>
      <span style={S.healthValue}>{value}</span>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...S.chip, ...(active ? S.chipOn : {}) }}>{children}</button>
  );
}

const Th = ({ children }: { children?: React.ReactNode }) => <th style={S.th}>{children}</th>;
const Td = ({ children }: { children?: React.ReactNode }) => <td style={S.td}>{children}</td>;

// The brand, the same River blue and Saffron the rest of the site uses.
const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#144a8d';
const SAFFRON = '#E8973A';
const PAPER = '#FBFAF7';
const LINE = '#E8E5DE';
const MUTED = '#6B7280';

const S: Record<string, React.CSSProperties> = {
  // --- the sign in screen -----------------------------------------------------------------------
  //
  // A split: the company on the left, the door on the right. The old one was a form floating on a
  // white page, which is what a holding page looks like.
  split: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',   // one column by default; the media query below adds two
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    color: INK,
    background: PAPER,
  },
  brandPanel: {
    display: 'none',                          // hidden until there is room. See the media query.
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '56px 48px',
    background: `linear-gradient(150deg, #16324F 0%, ${RIVER_DEEP} 55%, ${RIVER} 100%)`,
    color: '#fff',
  },
  brandLine: {
    fontSize: 34, fontWeight: 800, lineHeight: 1.25, letterSpacing: -0.9,
    margin: '38px 0 0', color: '#fff', maxWidth: 380,
  },
  brandApprove: {
    fontSize: 34, fontWeight: 800, letterSpacing: -0.9, margin: '2px 0 0',
    color: SAFFRON,
  },
  brandFoot: { fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: 0, maxWidth: 340 },
  formPanel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 18, padding: '48px 24px',
    background: `radial-gradient(900px 420px at 50% -10%, #EEF4FB 0%, ${PAPER} 60%)`,
  },
  signInPage: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 18, padding: '40px 22px',
    background: `radial-gradient(1100px 520px at 50% -8%, #EEF4FB 0%, ${PAPER} 62%)`,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    color: INK,
  },
  // NOT `card`. The dashboard already had one (the KPI tiles), and two keys with the same name in
  // one object literal is a TypeScript error, which is the only reason I found out. A silent
  // last-one-wins overwrite would have been worse: the sign in card would have quietly rendered as
  // a 150px KPI tile and I would have blamed the CSS.
  authCard: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    border: `1px solid ${LINE}`,
    borderRadius: 20,
    padding: '34px 32px 30px',
    boxShadow: '0 18px 50px rgba(17,17,17,0.07), 0 2px 6px rgba(17,17,17,0.03)',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 },
  wordmark: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: INK },
  // The little Saffron stroke that runs under the wordmark everywhere else in the product.
  accent: { width: 26, height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${RIVER}, ${SAFFRON})`, display: 'inline-block' },
  cardH1: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' },
  cardSub: { fontSize: 14.5, color: MUTED, lineHeight: 1.55, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: INK, marginBottom: 7 },
  ghost: {
    width: '100%', padding: '12px', marginTop: 16, fontSize: 14, fontWeight: 700,
    color: RIVER, background: 'transparent', border: `1px solid ${LINE}`, borderRadius: 12, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  textLink: {
    display: 'block', width: '100%', marginTop: 16, padding: 0,
    background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 13.5, fontWeight: 600, color: MUTED, textAlign: 'center',
  },
  legal: { fontSize: 12.5, color: '#9A968E', textAlign: 'center', maxWidth: 400, lineHeight: 1.6, margin: 0 },

  // --- the dashboard ----------------------------------------------------------------------------
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '48px 24px 80px', fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif', color: '#111' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  h1: { fontSize: 30, fontWeight: 800, letterSpacing: -0.6, margin: 0 },
  h2: { fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: '#6B7280', marginTop: 40, marginBottom: 14 },
  muted: { color: '#6B7280', fontSize: 14, marginTop: 6 },
  error: { color: '#C0392B', fontSize: 13.5, marginTop: 16, fontWeight: 600, lineHeight: 1.5 },
  input: {
    width: '100%', padding: '14px 15px', fontSize: 15.5, color: INK,
    border: `1.5px solid ${LINE}`, borderRadius: 12, background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  },
  button: {
    width: '100%', padding: '15px', marginTop: 14,
    fontSize: 15.5, fontWeight: 700, color: '#fff', fontFamily: 'inherit',
    background: `linear-gradient(135deg, ${RIVER}, ${RIVER_DEEP})`,
    border: 0, borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(27,89,166,0.25)',
  },
  link: { background: 'none', border: 0, color: '#6B7280', fontSize: 14, cursor: 'pointer', fontWeight: 600 },
  healthRow: { display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 18 },
  health: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5, display: 'inline-block' },
  healthLabel: { fontSize: 13, color: '#6B7280' },
  healthValue: { fontSize: 13, fontWeight: 700 },
  alarm: { background: '#FDECEA', color: '#8C2A20', padding: '12px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 600, marginBottom: 18 },
  cards: { display: 'flex', gap: 14, flexWrap: 'wrap' },
  card: { flex: '1 1 150px', border: '1px solid #EFEFEF', borderRadius: 14, padding: '18px 20px', background: '#FBFAF7' },
  cardLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8A8A8A' },
  cardValue: { fontSize: 28, fontWeight: 800, marginTop: 6, letterSpacing: -0.6 },
  sourceRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  chip: { padding: '8px 14px', borderRadius: 999, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' },
  chipOn: { background: '#1B59A6', color: '#fff', borderColor: '#1B59A6' },
  tableWrap: { overflowX: 'auto', border: '1px solid #EFEFEF', borderRadius: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '12px 16px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#8A8A8A', borderBottom: '1px solid #EFEFEF', whiteSpace: 'nowrap' },
  td: { padding: '13px 16px', borderBottom: '1px solid #F5F5F5', whiteSpace: 'nowrap' },
  tr: { background: '#fff' },
  detail: { color: '#8A8A8A' },
  internalNote: { fontSize: 12.8, color: '#8A8A8A', margin: '12px 2px 0', lineHeight: 1.6, maxWidth: 720 },
  internalChip: {
    marginLeft: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
    padding: '2px 6px', borderRadius: 5, background: '#F1F0EC', color: '#8A8A8A', verticalAlign: 1,
  },
  select: { padding: '5px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, background: '#fff', color: '#111' },
  cancel: { color: '#B4690E', fontWeight: 600, fontSize: 12.5, marginLeft: 6 },
  footnote: { marginTop: 32, fontSize: 12.5, color: '#8A8A8A', lineHeight: 1.7, maxWidth: 720 },
};
