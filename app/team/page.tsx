'use client';

import { useEffect, useState, useMemo } from 'react';
import { browserSupabase } from '../../lib/supabasebrowser';
import { sourceLabel, SOURCES } from '../../lib/team';
import Numbers from './Numbers';
import { C, T, S as U, FONT, gbp, shortDate } from './ui';
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
// Sign in is an email and a password, and that password is NOT the gate. Anybody at all can create
// a Supabase auth account. The gate is a row in team_members, re-checked ON THE SERVER on every
// single request, so a stranger who guesses a password is holding a key to a door that is not
// there. There is no shared login and no admin flag hiding on a user account. Removing somebody is
// a DELETE, and it bites on their very next click.

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
                If <b style={{ color: C.ink }}>{email.trim().toLowerCase()}</b> is on the team, a link
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
  const brainOk = h.knowledge === 'ok';
  const cronsOk = h.crons === 'ok';

  return (
    <div style={U.page}>
      {/* THE HEADER. It is what makes this a CONSOLE and not a page.
          The first version had "Sign out" floating in the corner of a white sheet, which is what an
          unfinished developer tool looks like. This is the screen the team opens every morning: it
          is the one place the business looks at itself, and a shabby internal tool teaches everyone
          who uses it that shabby is the standard. Standards leak. */}
      <header style={U.header}>
        <div style={U.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={U.wordmark}>Lekhio</span>
            <span style={U.accent} aria-hidden="true" />
            <span style={{ ...U.headerRole, marginLeft: 6 }}>Console</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={U.headerRole}>{data.me.name || data.me.email} · {data.me.role}</span>
            <button
              style={U.headerBtn}
              onClick={async () => { await browserSupabase.auth.signOut(); location.reload(); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main style={U.main}>
        {/* THE BRAIN AND THE MACHINE, FIRST. If Khoji says our tax engine disagrees with GOV.UK,
            every figure in the product is wrong for every user, and that is the most important fact
            in the company that morning. It does not go in a footer. */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
          <StatusPill
            label="Tax knowledge"
            value={h.knowledge}
            tone={brainOk ? C.green : h.knowledge === 'unknown' ? C.faint : C.red}
          />
          <StatusPill
            label="Scheduled jobs"
            value={h.crons}
            tone={cronsOk ? C.green : h.crons === 'unknown' ? C.faint : C.red}
          />
        </div>

        {!brainOk && h.knowledge !== 'unknown' ? (
          <p style={{ ...U.alarm, marginTop: 14 }}>
            Khoji says our tax engine disagrees with GOV.UK, or cannot check it. Every figure in the
            product is suspect until this is green.
          </p>
        ) : null}

        {/* THE MONEY. Ours, not theirs. */}
        <section style={{ ...U.section, marginTop: 26 }}>
          <div style={U.cards}>
            <Metric label="Customers" value={String(o.customers)} />
            <Metric label="Paying" value={String(o.active + o.pastDue)} tone={o.active + o.pastDue > 0 ? C.green : undefined} />
            <Metric label="On trial" value={String(o.trialing)} tone={o.trialing > 0 ? C.river : undefined} />
            <Metric label="MRR" value={gbp(o.mrrPence)} />
            <Metric label="Cancelling" value={String(o.cancelRequested)} tone={o.cancelRequested > 0 ? C.amber : undefined} />
          </div>
          {o.internal > 0 ? (
            <p style={{ ...T.tiny, marginTop: 12, maxWidth: 760 }}>
              Plus {o.internal} internal {o.internal === 1 ? 'account' : 'accounts'} (the App Review
              demo, and any comp). Shown below, counted in none of the figures above. Not a customer
              and not revenue.
            </p>
          ) : null}
        </section>

        {/* THE NUMBERS. Above the customer list on purpose: the list is what you dig into, the
            numbers are what you came for. */}
        <Numbers />

        {/* WHERE THEY CAME FROM. The whole point of the marketing spend. */}
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Where they came from</h2>
            <span style={U.sectionNote}>tap to filter the list</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All {o.customers}</Chip>
            {SOURCES.map((s) => (
              <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
                {sourceLabel(s)} {o.bySource[s] ?? 0}
              </Chip>
            ))}
          </div>
        </section>

        {/* THE LIST. */}
        <section style={U.section}>
          <div style={U.sectionHead}>
            <h2 style={T.h2}>Customers</h2>
            <span style={U.sectionNote}>{customers.length} shown</span>
          </div>

          <div style={{ ...U.panel, padding: 0, overflowX: 'auto' }}>
            <table style={U.table}>
              <thead>
                <tr>
                  <th style={{ ...U.th, paddingLeft: 20 }}>Name</th>
                  <th style={U.th}>Trade</th>
                  <th style={U.th}>Joined</th>
                  <th style={U.th}>Source</th>
                  <th style={U.th}>Plan</th>
                  <th style={U.th}>Status</th>
                  <th style={{ ...U.th, paddingRight: 20 }}>Renews</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...U.td, paddingLeft: 20, fontWeight: 650 }}>
                      {c.name || <span style={{ color: C.faint, fontWeight: 400 }}>No name yet</span>}
                      {c.internal ? <span style={chipInternal}>internal</span> : null}
                    </td>
                    <td style={{ ...U.td, color: C.muted }}>{c.trade || '—'}</td>
                    <td style={{ ...U.td, color: C.muted }}>{shortDate(c.joined)}</td>
                    <td style={U.td}>
                      {/* Editable, because a BILLBOARD cannot be inferred from a click, and neither
                          can a man sold to in a merchant's yard. If there is nowhere to put that
                          fact it stays in somebody's head, and then the ad budget gets set by
                          whoever remembers hardest. */}
                      <select
                        value={c.source}
                        onChange={(e) => saveSource(c.id, e.target.value)}
                        style={selectStyle}
                        aria-label={`Where ${c.name || 'this customer'} came from`}
                      >
                        {SOURCES.map((s) => (
                          <option key={s} value={s}>{sourceLabel(s)}</option>
                        ))}
                      </select>
                      {c.sourceDetail ? <span style={{ color: C.faint }}> · {c.sourceDetail}</span> : null}
                    </td>
                    <td style={U.td}>
                      {c.plan ? (
                        <>
                          <span style={{ color: C.ink2 }}>{c.plan}</span>
                          {c.amountPence > 0 ? (
                            <span style={{ color: C.faint }}> · {gbp(c.amountPence)}</span>
                          ) : null}
                        </>
                      ) : <span style={{ color: C.faint }}>—</span>}
                    </td>
                    <td style={U.td}>
                      <StatusTag status={c.status} />
                      {c.cancelRequested ? <span style={cancelTag}>cancelling</span> : null}
                    </td>
                    <td style={{ ...U.td, paddingRight: 20, color: C.muted }}>{shortDate(c.renews)}</td>
                  </tr>
                ))}
                {customers.length === 0 ? (
                  <tr>
                    <td style={{ ...U.td, paddingLeft: 20, color: C.faint }} colSpan={7}>
                      Nobody in this group yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {error ? <p style={{ ...U.alarm, marginTop: 20 }}>{error}</p> : null}

        <p style={{ ...T.tiny, marginTop: 40, maxWidth: 700 }}>
          This page shows who our customers are and what they pay us. It does not show anyone{"'"}s
          receipts, income, expenses, tax figures or phone number, and it never will. We tell every
          user their records are theirs alone, and that has to stay true.
        </p>
      </main>
    </div>
  );
}

// --- the pieces --------------------------------------------------------------------------------

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={U.card}>
      <div style={T.label}>{label}</div>
      <div style={{ ...T.metric, color: tone ?? C.ink, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <span style={U.pill}>
      <span style={{ ...U.dot, background: tone }} />
      <span style={{ color: C.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ color: tone, fontWeight: 750 }}>{value}</span>
    </span>
  );
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  active:   { bg: C.greenTint,   fg: C.green },
  trialing: { bg: C.riverTint,   fg: C.river },
  past_due: { bg: C.amberTint,   fg: C.amber },
  canceled: { bg: '#F2F0EA',     fg: C.faint },
  none:     { bg: '#F2F0EA',     fg: C.faint },
};

function StatusTag({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.none;
  return (
    <span style={{
      display: 'inline-block', padding: '4px 9px', borderRadius: 7,
      background: s.bg, color: s.fg, fontSize: 12, fontWeight: 750, letterSpacing: 0.1,
    }}>
      {status}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ ...U.chip, ...(active ? U.chipOn : {}) }}>{children}</button>
  );
}

const chipInternal: React.CSSProperties = {
  marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
  padding: '3px 6px', borderRadius: 5, background: '#F2F0EA', color: C.faint, verticalAlign: 1,
};

const cancelTag: React.CSSProperties = {
  marginLeft: 7, fontSize: 11.8, fontWeight: 700, color: C.amber,
};

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 8, border: `1px solid ${C.line}`,
  fontSize: 12.8, background: '#fff', color: C.ink2, fontFamily: FONT, cursor: 'pointer',
};



// THE SIGN IN SCREEN, and nothing else. Everything the dashboard draws now comes from ./ui, and the
// twenty-eight dashboard styles that used to live down here have been deleted rather than left to
// rot. A dead style is not harmless: the next person to touch this file reads it, believes it, and
// changes the wrong one.
const S: Record<string, React.CSSProperties> = {
  // A split: the company on the left, the door on the right. The old one was a form floating on a
  // white page, which is what a holding page looks like, not a company.
  split: {
    minHeight: '100vh',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',   // one column by default; the media query adds the second
    fontFamily: FONT,
    color: C.ink,
    background: C.paper,
  },
  brandPanel: {
    display: 'none',                          // hidden until there is room. See the media query.
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '56px 48px',
    background: `linear-gradient(150deg, #16324F 0%, ${C.riverDeep} 55%, ${C.river} 100%)`,
    color: '#fff',
  },
  brandLine: {
    fontSize: 34, fontWeight: 800, lineHeight: 1.25, letterSpacing: -0.9,
    margin: '38px 0 0', color: '#fff', maxWidth: 380,
  },
  brandApprove: { fontSize: 34, fontWeight: 800, letterSpacing: -0.9, margin: '2px 0 0', color: C.saffron },
  brandFoot: { fontSize: 13.5, color: 'rgba(255,255,255,0.62)', lineHeight: 1.6, margin: 0, maxWidth: 340 },

  formPanel: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 18, padding: '48px 24px',
    background: `radial-gradient(900px 420px at 50% -10%, ${C.riverTint} 0%, ${C.paper} 60%)`,
  },
  signInPage: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 18, padding: '40px 22px',
    background: `radial-gradient(1100px 520px at 50% -8%, ${C.riverTint} 0%, ${C.paper} 62%)`,
    fontFamily: FONT,
    color: C.ink,
  },

  // NOT `card`. ./ui already exports one (the KPI tile), and two keys with the same name in one
  // object literal is a TypeScript error, which is the only reason I found out. A silent
  // last-one-wins overwrite would have been worse: the sign in card would have quietly rendered as
  // a 140px KPI tile and I would have gone looking in the CSS.
  authCard: {
    width: '100%', maxWidth: 420, background: C.panel,
    border: `1px solid ${C.line}`, borderRadius: 20, padding: '34px 32px 30px',
    boxShadow: '0 18px 50px rgba(17,17,17,0.07), 0 2px 6px rgba(17,17,17,0.03)',
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 },
  wordmark: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: C.ink },
  accent: { ...U.accent, width: 26 },

  cardH1: { fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: '0 0 6px' },
  cardSub: { ...T.body, color: C.muted, margin: '0 0 22px' },
  label: { display: 'block', fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 7 },
  input: {
    width: '100%', padding: '14px 15px', fontSize: 15.5, color: C.ink,
    border: `1.5px solid ${C.line}`, borderRadius: 12, background: C.panel,
    outline: 'none', fontFamily: 'inherit',
  },
  button: {
    width: '100%', padding: '15px', marginTop: 14,
    fontSize: 15.5, fontWeight: 700, color: '#fff', fontFamily: 'inherit',
    background: `linear-gradient(135deg, ${C.river}, ${C.riverDeep})`,
    border: 0, borderRadius: 12, cursor: 'pointer',
    boxShadow: '0 8px 20px rgba(27,89,166,0.25)',
  },
  ghost: {
    width: '100%', padding: '12px', marginTop: 16, fontSize: 14, fontWeight: 700,
    color: C.river, background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 12,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  textLink: {
    display: 'block', width: '100%', marginTop: 16, padding: 0,
    background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 13.5, fontWeight: 600, color: C.muted, textAlign: 'center',
  },
  legal: { ...T.small, color: C.faint, textAlign: 'center', maxWidth: 400, margin: 0 },

  muted: { ...T.small, marginTop: 6 },
  error: { color: C.red, fontSize: 13.5, marginTop: 16, fontWeight: 600, lineHeight: 1.5 },
};
