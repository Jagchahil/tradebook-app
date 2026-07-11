# 84: Phase C build plan. The Agentic Accountant v1, deterministic (planned 5 July 2026)

> The exact build spec for doc 82 Phase C: agent layers 1 and 4. Zero AI cost, zero new external dependencies, everything on patterns already proven in this codebase (the resumable cron, `sendTemplate`, the deterministic intent discipline, RLS). Layers 2 and 3 (the Mac mini knowledge watcher and AI drafted suggestions) are Phase D and are out of scope here, but every structure below is designed so D drops in without rework. Build in the stage order in section 8. Update this doc when decisions land.

---

## 1. What v1 is, in one paragraph

A nightly engine looks at every user's real confirmed numbers and produces **signals**: threshold warnings, opportunities, and risks, each computed by pure deterministic maths from the tax engine, never by AI. Signals become cards in a new **agent stream** inside the app's chat area, sitting with Lekhio AI, and the high value ones also go out as WhatsApp pings through Meta approved templates. Every signal explains itself, shows the user's own numbers, and suggests, never executes. This alone makes Lekhio the most proactive accountant a tradesperson has ever had, and it runs for free.

**Doctrine, restated because the agent is where it matters most.** The agent suggests, never executes. No certainty claims ("your numbers suggest", never "you will save"). Visibly automated, never a human. Guidance side of the FCA line: category level suggestions with tax maths, no named credit, car, or finance products, no affiliate links (parked with an FCA trigger, doc 82 section 5). Every delivered signal is logged. STOP stops everything, instantly.

---

## 2. The signal catalogue, v1

Each signal has: a stable `signal_key`, trigger maths (all from `lib/taxengine.ts` / `lib/nistudentloan.ts` facts, never re-hardcoded), a `period_key` that controls "fire once per period", a priority (`ping` = in app plus WhatsApp, `card` = in app only), and template copy. All computations use confirmed entries only, same discipline as every money surface.

| # | signal_key | Fires when | Period key | Priority |
|---|---|---|---|---|
| 1 | `vat_approach` | Rolling 12 month turnover crosses 80%, then 90%, then 100% of £90,000 | tier per tax year | ping at 90 and 100, card at 80 |
| 2 | `mtd_mandation` | Combined gross trade income crosses the year's MTD threshold (50k now, 30k Apr 2027, 20k Apr 2028), or is projected to by year end at the current run rate | tax year | ping |
| 3 | `higher_rate_approach` | Projected annual profit (year to date annualised, only after 3+ months of data) crosses £50,270 | tax year | card |
| 4 | `pa_taper` | Projected annual income crosses £100,000 | tax year | ping |
| 5 | `class2_pension_year` | After month 9 of the tax year, profits under £7,105 and no employment income saved | tax year | ping |
| 6 | `sl_threshold_cross` | Student loan plan set and the repayment figure goes from £0 to positive | tax year | card |
| 7 | `poa_cliff` | Estimated SA bill crosses £1,000 (payments on account kick in, the double-bill January explainer) | tax year | ping |
| 8 | `cis_refund_milestone` | Estimated CIS refund crosses £250, £500, £1,000, then each £500 | tier per tax year | card |
| 9 | `quiet_expenses` | A calendar month closes with expenses under 40% of the trailing 3 month average (min 3 months history, min £150 average). "Missed receipts are missed tax savings" | calendar month | card |
| 10 | `aia_timing` | Last 8 weeks of the tax year, projected profit puts them in higher rate, no large equipment purchase logged this year. The van and tools timing suggestion, category level only | tax year | ping |
| 11 | `quarter_unconfirmed` | 10 days before an MTD quarter closes with 5+ unconfirmed entries | MTD quarter | ping |

Not in v1: anything needing bank data (dormant), anything needing AI, anything projecting with under 3 months of history (too noisy), duplicates of the existing reminder jobs (`cron/reminders` keeps due dates and weekly summaries; signal 11 is the only deadline adjacent one and keys off unconfirmed entries, which reminders do not cover).

**Noise budget.** Hard cap: at most 1 WhatsApp ping per user per day and 3 per week, in-app cards uncapped but deduped. Priority order if capped: 2, 4, 7, 1, 5, 10, 11. Every ping ends with a "reply STOP to stop these" hint on first send.

---

## 3. Database

One new table plus one prefs column.

```sql
create table if not exists public.agent_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  signal_key text not null,
  period_key text not null,          -- e.g. '2026-27', '2026-10', '2026-27#tier2'
  payload jsonb not null,            -- the numbers behind the card, for rendering
  priority text not null default 'card' check (priority in ('ping','card')),
  created_at timestamptz not null default now(),
  delivered_wa_at timestamptz,       -- null until the WhatsApp ping went out
  read_at timestamptz,               -- set by the app when the card is seen
  dismissed_at timestamptz
);
-- Fire once per user per signal per period. The engine upserts with on conflict do nothing.
create unique index if not exists agent_signals_once
  on public.agent_signals(user_id, signal_key, period_key);
alter table public.agent_signals enable row level security;
create policy agent_signals_own_read on public.agent_signals
  for select using (auth.uid() = user_id);
create policy agent_signals_own_update on public.agent_signals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.reminder_prefs add column if not exists agent_pings boolean not null default true;
notify pgrst, 'reload schema';
```

The app reads and marks read or dismissed under RLS. Inserts are service role only (no insert policy). WhatsApp delivery is recorded on the row, and also to `audit_log` like every outbound send. Dedupe is structural (the unique index), not logic, so a cron retry or double hop can never double-ping.

## 4. The engine: `lib/agent.ts` (web)

Pure functions, zero network, unit tested exactly like `waintents`:

- `computeSignals(input): AgentSignal[]` where `input` is one user's aggregates: confirmed income and expenses by month for the trailing 12 months, CIS total, student loan settings, employment income, existing unconfirmed count, today's date. Returns the signals that SHOULD be active with their `period_key` and `payload`. All thresholds imported from `taxengine`/`nistudentloan` FACTS.
- `renderSignal(signal): { title, body, waText }` deterministic copy per signal key, written once, no dashes, every body naming the user's own numbers and ending with the doctrine line where relevant ("A suggestion from your numbers, not advice. You decide.").
- Projection helper: `projectAnnual(monthlyTotals, today)` with the 3 month minimum and a documented method (year to date scaled by days elapsed), so "projected" always means one thing.

One new RPC to feed it at scale: `agent_user_aggregates(p_user_id)` returning the monthly buckets in one DB round trip (same N+1 discipline as `user_totals` and `weekly_totals_all`).

## 5. The cron: `api/cron/agent`

Its own route on the proven resumable pattern (the `cron/reminders` skeleton exactly): `CRON_SECRET` guard with a constant time compare, ack immediately and work in `after()`, keyset cursor over user ids, 40 second budget, hop handover, `MAX_HOPS`. **Build decision: there is NO new vercel.json cron entry.** The Hobby plan's cron cap once silently blocked every deploy (doc 81 playbook), so the daily 07:00 due job kicks the agent chain with one fire and forget request, the same way it kicks the bank feed walk. Pings land with the morning reminders.

Per user per hop: fetch aggregates via the RPC, `computeSignals`, upsert with `on conflict do nothing`, then for rows that inserted AND are `ping` AND `reminder_prefs.agent_pings` is true AND under the noise caps: `sendTemplate(...)`, stamp `delivered_wa_at`, write `audit_log`. Any user erroring is logged and skipped, never breaks the run. STOP already writes `reminder_prefs`; the agent respects the same flag plus its own `agent_pings`.

## 6. WhatsApp delivery, the Meta template constraint

Proactive sends outside a 24 hour session require pre approved templates (`sendTemplate` exists, doc 39 has the register). Submit three utility templates in the Meta dashboard when this build starts, generic enough to carry any signal:

Build decision: one variable per template (simpler for Meta review, the engine's `waText` carries the whole message):

1. `agent_threshold_alert`: "Heads up from your Lekhio agent: {{1}}. Open the app for the full picture. Reply STOP to stop these."
2. `agent_deadline_alert`: "From your Lekhio agent: {{1}}. You approve everything, nothing sends itself. Reply STOP to stop these."
3. `agent_opportunity`: "Your Lekhio agent spotted something: {{1}}. A suggestion from your numbers, not advice. You decide. Reply STOP to stop these."

Approval usually takes minutes to a couple of days. **Until approved, Stage C3 ships with in app cards only and the cron leaves `delivered_wa_at` null**, so WhatsApp switches on later with zero code change (a `AGENT_TEMPLATES_APPROVED=true` env flag gates the send).

## 7. The app: the agent stream

On the accountant screen (`app/accountant.tsx`), which is the chat surface: a horizontal or stacked **agent section under the Lekhio AI header** (Jag's spec: it lives in the chat bit, below the AI). v1 shape:

- New `lib/supabase.ts` (app) helpers: `getAgentSignals(userId)` (undismissed, newest first), `markSignalRead(id)`, `dismissSignal(id)`.
- Cards render from `payload` plus the same deterministic copy (mirror `renderSignal` in the app or store rendered text in the payload at insert time; **decision: store rendered title and body in the payload**, one renderer, no app mirror to drift).
- Each card: icon by signal type, title, body with the user's numbers, a "Tell me more" button that pre fills the Lekhio AI input with a question about the signal (works today with zero AI credit only as a canned deterministic answer; once credit lands it becomes a real conversation), and a dismiss.
- A small badge on the Feed tab when unread signals exist (count from the same query, no new infra).
- Empty state: "Your agent is watching your numbers. When something needs your attention, it appears here first."

Also the **You/profile screen**: a toggle "Agent pings on WhatsApp" writing `reminder_prefs.agent_pings`.

## 8. Build stages and order

- **C1. Engine plus tests.** `lib/agent.ts`, the aggregates RPC in `schema.sql`, `test/agent.test.mjs` covering every signal's trigger maths, boundaries (79/80/81% of VAT threshold), the projection minimum, period keys, and the noise cap ordering. Target 60+ cases. Nothing ships user facing.
- **C2. Table plus cron.** `agent_signals` SQL on prod, `api/cron/agent` on the resumable skeleton, vercel.json entry. Run it in "insert only" mode (no WhatsApp) for a few days against real data and eyeball the rows for noise before anything is user visible.
- **C3. App stream.** Supabase helpers, the agent section on the accountant screen, the Feed badge, the prefs toggle. JS only, Metro reload.
- **C4. WhatsApp pings.** Submit the three templates at C1 time (approval runs in parallel), then flip `AGENT_TEMPLATES_APPROVED=true` and the cron starts sending for `ping` signals within the noise caps.

C1 and C2 are one session of work together, C3 a second, C4 is config plus a small send block. Each stage is independently deployable and reversible (the cron without the app just fills a table; the app without signals shows the empty state).

## 9. Verification gates

C1: the new test suite green plus all existing suites still green. C2: cron runs green in Vercel logs across hops, table populates, a manual second run inserts zero duplicates (the unique index proof), no PII in logs. C3: phone testing on the dev build, dark-mode-immune (app is static light), dismiss and read flows persist. C4: one real ping to Jag's own number first, STOP honoured, `audit_log` row present.

## 10. Decisions needed from Jag before C3

1. **The agent's name: Rakha** (ਰਾਖਾ, the guardian, the one who watches over), chosen 5 July for the same Punjabi spirit as Lekhio. Lekhio keeps the books, Rakha watches them. One constant (`AGENT_NAME` in `app/accountant.tsx`), so a rename is one line. Alternative considered: Munshi (the traditional accounts clerk).
2. **The three Meta template submissions: DONE 5 July**, all three submitted as Utility, English (UK), one variable each, status In review. Before C4 goes live a payment method must also be added to the WhatsApp business account (Meta blocks business initiated sends without one).
3. **Signal catalogue: signed off 5 July**, all 11 as listed.

Everything else is decided by this doc. Phase D (Mac mini watcher, AI suggestion drafting) plugs in later as new rows in the same `agent_signals` table with new signal keys, which is why the table carries `payload` jsonb rather than fixed columns.
