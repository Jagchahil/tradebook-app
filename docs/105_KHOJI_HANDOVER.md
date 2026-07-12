# 105. Khoji: the brain. Handover and build plan.

**Written 12 July 2026, 21:40. UPDATED 12 July 2026, 22:30, after the build. Read this whole file before touching Khoji.**

---

## STATUS, 12 July 2026, 22:30. Phases 1 and 2 are DONE and LIVE.

The brain runs unattended and it can now tell us we are wrong. Tonight's unattended run:

```
[khoji] watch rc=0 diff rc=0
[khoji:diff] 16 agree, 0 DRIFT, 0 BROKEN
GET /api/health -> {"ok":true,"db":true,"crons":"ok","knowledge":"ok"}
```

**What shipped** (web `6c0c4b06`, mini `~/lekhio-khoji/`, 39 web suites / 4,144 assertions green, TSC green):

| | |
|---|---|
| **K1** | The dead cron. Fixed, and the ROOT CAUSE was not the live plist. See the correction below. |
| **K2** | `lekhio.com` gone from the user agent, the template and the last `.bak` on the mini. |
| **K6** | **A NEW BUG, and the real reason the brain went silent.** See below. |
| **K5** | `/api/health` now reports the brain: red on drift, blind or stale. `lib/knowledgewatch.ts`, 15 tests. |
| **K4** | **The differ.** `khoji/diff.mjs`, 16 constants, 23 tests. `app/facts.json/route.ts` publishes `FACTS`. |
| **K3** | `engine_impact` redefined as arithmetic. The three false flags cleared. The table now reads **zero**. |

**Three things in the original text below are WRONG. They are left in place, struck through in prose,
because how we got them wrong is the most useful thing in this document.**

### Correction 1. The mileage row EXISTS. Section 2's "tell" is wrong.

Section 2 says "there is no mileage item in the reviewed set" and implies Khoji never saw it. It did.
It is in the database, captured 8 July, `status = distilled`, `engine_impact = false`, **confidence 0.15**:

> *"Employers can pay employees mileage allowances for business travel..."*

Khoji did not miss the page. **It read it, summarised it, and shrugged.** And it was right to, given what we
asked it. The distiller was shown a GOV.UK page and asked "does this change a rate a calculator must
reflect?" It had never seen our calculator. The page is titled *"Expenses and benefits: business travel
mileage for **employees'** own vehicles"*, so it correctly judged it was employer material, scored it 0.15,
and marked it false. Then the review gate did its job perfectly and filtered it out. A human scanning a
queue and seeing a 0.15 item about company car allowances skips it too.

Meanwhile it fired `engine_impact: true` at **0.95** on three pages that had not changed and where our
engine was already correct. **Confidence was running backwards.** It was not noisy *and* blind by
coincidence. It was noisy *because* it was blind. K3 and K4 were always one bug.

### Correction 2. K1's root cause was the TEMPLATE and BOTH INSTALLERS, not the plist.

Fixing the live plist would have worked until the next reinstall. `khoji/com.lekhio.khoji.plist` shipped as
`REPLACE_WITH_ABSOLUTE_PATH/khoji/run.sh`, and both `install-khoji.sh` and `khoji-setup.sh` substitute
`$HOME/lekhio-khoji` for that token. The template assumed the token was the PARENT of a folder called
`khoji`. It is the folder itself. Hence the extra `/khoji`, hence the void. All four files are fixed.

### Correction 3 (K6). THE BRAIN WENT SILENT BECAUSE OF ONE STRAY LETTER.

Not in the original doc, because nobody knew. The mini's `.env` read:

```
rKHOJI_DB_URL=postgresql://...
```

A stray `r`. The shell sources it happily, because `rKHOJI_DB_URL=...` is a valid assignment to a variable
nobody reads. `KHOJI_DB_URL` was simply never set. `watch.mjs` then hit this:

```js
if (!DB_URL) { log('KHOJI_DB_URL not set, nothing to write.'); return; }   // <- returns 0
```

It fetched all 14 sources, wrote **nothing**, and **exited 0**. So Khoji had TWO independent faults producing
one symptom: launchd fired into an empty folder, and the hand-runs that were compensating for that had
quietly stopped writing. **Fixing either one alone would have left you believing it worked.** It now exits 1.

### The trap that nearly went into the differ, and the reason the tests exist

The live GOV.UK mileage page carries the string `45p` **twice**: once in the table cell
(`55p from 6 April 2026 (45p before 6 April 2026)`) and once in a worked example GOV.UK forgot to update
(`10,000 x 45p`). The correct figure appears once.

**A differ that greps the page for a mileage rate finds 45p, compares it to our 55p, and screams that we
are wrong, every night, forever.** It would reproduce mechanically the exact error two separate human
audits have already made about this precise number. An alarm that is confidently wrong is worse than no
alarm, because you switch it off, and then you have no alarm AND you think you have one.

`difftest.mjs` holds that page as a fixture and asserts BOTH directions: 45p in our engine must scream,
and 55p in our engine must stay silent. **Do not touch an extractor without running it.**

---

**Original text of 12 July 21:40 follows. Read it for the reasoning, not the current state.**

Khoji is the knowledge layer under Lekhio, Rakha and Puchio. It is the thing that makes us hard
to copy, and it is currently a news feed pretending to be a brain. This doc says exactly what it
is today, what is broken, what it must become, and in what order.

---

## 0. THE ONE-LINE POINT

**Khoji's job is not to know things. It is to notice that WE are wrong.**

Anyone can scrape GOV.UK. The asset is a machine that reads the live law, reads `lib/taxengine.ts`,
and says: *"GOV.UK says 55p. Your code says 45p. Here is the line. Here is the source."*

Everything else Khoji does is a nice-to-have. That one thing is the moat.

---

## 1. WHERE IT LIVES (physical facts, verified 12 Jul)

| Thing | Value |
|---|---|
| Machine | Mac mini, on the LAN and on Tailscale |
| Tailscale IP | `100.90.129.72` |
| Hostname | `Jags-Mac-mini.local` |
| **Username on the mini** | **`jagchahil`** (NOT `jagvinderchahil`, which is the MacBook) |
| SSH | Working. Jag's key is installed: `ssh jagchahil@100.90.129.72` |
| Khoji root | `/Users/jagchahil/lekhio-khoji/` |
| Read-only mirror on the MacBook | `~/Documents/Claude/Projects/Tradesman/khoji-mirror/` |
| launchd label | `com.lekhio.khoji`, daily 05:15 |
| Supabase project | `tradebook-prod`, ref `cqlzqzzkqashtwvimfbk` |

**The mirror.** Claude cannot SSH (the sandbox has no route to Tailscale). To read the mini, Jag runs:

```
rsync -av --exclude node_modules --exclude .git --exclude '.env' --exclude logs \
  jagchahil@100.90.129.72:lekhio-khoji/ \
  ~/Documents/Claude/Projects/Tradesman/khoji-mirror/
```

**No `--delete`, ever.** It has destroyed files in this project before. `.env` is excluded on purpose:
Claude must never see the keys.

To push changed files back, rsync the other way, then on the mini `launchctl kickstart -k gui/$(id -u)/com.lekhio.khoji`.

### Files

```
lekhio-khoji/
├── watch.mjs        the watcher: collect, dedupe, store, write Obsidian note, backlog
├── distill.mjs      Anthropic distillation
├── sources.json     14 GOV.UK / HMRC sources (2 atom feeds, 12 watched pages)
├── schema.sql       knowledge_items + the khoji_writer role (ALREADY RUN)
├── selftest.mjs
├── run.sh           launchd wrapper, loads .env, fixes PATH
├── com.lekhio.khoji.plist
├── .env             KHOJI_DB_URL, OBSIDIAN_VAULT, KHOJI_DISTILL, ANTHROPIC_API_KEY
└── khoji/           EMPTY. See bug K1.
```

---

## 2. WHAT IS ACTUALLY TRUE (I was wrong twice; do not repeat it)

I asserted two things in the previous session that were **FALSE**. Verified against the live database:

- ❌ "`knowledge_items` does not exist." **It exists.**
- ❌ "Nothing ever sets `status = 'reviewed'`." **Nine rows are reviewed.**

The live state, 12 Jul:

```
status      count   with_summary
reviewed        9              9
distilled      46             46
```

So **distillation is ON**, 55 items are stored, and **nine of them are live in Rakha's answers
right now** (`getRelevantKnowledge()` in `lib/supabase.ts` selects `status=eq.reviewed` AND
`summary=not.is.null`).

**The lesson, and it is the important part of this doc: I reasoned from `grep` and was confident and
wrong. Check the database, not the repo.**

### The nine reviewed items, audited against `FACTS` in `lib/taxengine.ts`

| Item | Says | Our engine | Verdict |
|---|---|---|---|
| Self-employed NI | Class 2 £3.65/wk, SPT £7,105, Class 4 6% £12,570–£50,270 then 2% | identical | ✅ |
| Trading/property allowance | £1,000 | `tradingAllowance: 1000` | ✅ |
| Annual Investment Allowance | £1,000,000 | `annualInvestmentAllowance: 1000000` | ✅ |
| VAT registration | £90,000 | `vatRegistrationThreshold: 90000` | ✅ |
| CIS | 20% registered, 30% not | `cisRegisteredRate/cisUnregisteredRate` | ✅ |
| Self Assessment deadlines | paper 31 Oct 2026, pay 31 Jan 2027 | n/a | ✅ |
| Income tax rates page | generic, no figures | n/a | ✅ |
| Self-employed expenses | generic | n/a | ✅ |
| MTD guidance | generic | n/a | ✅ |

**Nine for nine correct. Nothing false is reaching users.** Good.

**And that is the problem.** All nine restate numbers our engine already hard-codes. Khoji is not
teaching Rakha anything. It is an expensive mirror.

### The tell

**There is no mileage item in the reviewed set.** Khoji watches
`gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax`. HMRC raised the rate from 45p
to 55p for 2026/27. Khoji never surfaced it. **The one change that actually mattered this year is the
one it missed.** (55p is CORRECT. Do not "fix" it back to 45p. This has now caught out two separate
audits.)

---

## 3. THE BUGS (all verified, all in the mirror)

### K1. The daily job has never run. CRITICAL.

`com.lekhio.khoji.plist` says:

```xml
<string>/Users/jagchahil/lekhio-khoji/khoji/run.sh</string>   <!-- ProgramArguments -->
<string>/Users/jagchahil/lekhio-khoji/khoji</string>          <!-- WorkingDirectory -->
```

`run.sh` is at `/Users/jagchahil/lekhio-khoji/run.sh`. The `khoji/` subfolder is **empty**. Proven on
screen: `cat: /Users/jagchahil/lekhio-khoji/khoji/run.sh: No such file or directory`.

So the 05:15 job has fired into a void since 7 July. **Every run to date was Jag running it by hand.**
The brain has not learned anything unattended, ever.

Fix: point both strings at `/Users/jagchahil/lekhio-khoji`, reinstall the plist, kickstart it, then
`tail logs/khoji.log` and confirm a real run. Check `launchctl list | grep lekhio` first — the mini
also runs Jag's **personal bot**, and Khoji must stay isolated from it.

### K2. Khoji tells GOV.UK it is the rival company. CRITICAL (and embarrassing).

`watch.mjs`, in `fetchText()`:

```js
'user-agent': 'LekhioKhoji/1.0 (+https://lekhio.com)'
```

**`lekhio.com` is not ours.** It belongs to Lacspace Corporation (Kathmandu/Nagpur). Our domain is
**`lekhio.app`**. We are putting a competitor's URL in HMRC's server logs on every single request.
See `CLAUDE.md`, "The Domain".

Fix: `lekhio.app`. Then grep the whole mini folder for the string.

### K3. `engine_impact` is noise, so nobody reads it.

It is `true` on the NI page, the trading allowance page and the AIA page — **all three unchanged and
all three already correct in our engine**. It fires whenever a page that happens to contain numbers
changes at all (nav tweak, footer, cookie banner). Three false alarms out of nine is a flag that
trains you to ignore it.

### K4. The thing that would have caught the mileage change does not exist.

Nothing anywhere compares GOV.UK's number to **our** number. See section 4.

### K5. Nothing tells us Khoji has stopped.

`/api/health` reports DB and crons. It says nothing about the brain. Khoji has been silent since
8 July and neither of us noticed for four days. **The recurring failure mode in this entire codebase
is silence, not crashes.** (Three separate instances in the last week: the digest cron reached 200
users and returned 200 OK; a tested `llms.txt` was never served; and this.)

---

## 4. WHAT TO BUILD, IN ORDER

### Phase 1: make it run and make it honest (half a day)

1. **K1** — fix the plist path. Confirm with a real unattended 05:15 run.
2. **K2** — `lekhio.app` in the user agent.
3. **K5** — `knowledge_freshness` check on `/api/health`: go **red** if `knowledge_items` has gained
   no new row in 48h, or no `reviewed` row in 14 days. **Build the alarm before the scraper.** If we
   don't, we will discover in three months that it stopped in week two.

### Phase 2: THE CONSTANT DIFFER. This is the actual product. (1–2 days)

A new script, `diff.mjs`, that runs after `watch.mjs`:

- Imports `FACTS` from `lib/taxengine.ts` (the mini has no repo — either vendor a generated
  `facts.json` into the Khoji folder from CI, or have `diff.mjs` fetch `https://lekhio.app/llms.txt`,
  which is already built FROM `FACTS` and is therefore always in sync. **The second is better: it
  needs no sync step and it tests the public claim at the same time.**)
- For each fact with a known GOV.UK home (mileage, personal allowance, Class 2 rate, Class 2 SPT,
  Class 4 bands, trading allowance, AIA, VAT threshold, CIS rates, student loan thresholds, MTD
  thresholds), extract the live figure from the watched page.
- **Raise an item ONLY when they disagree.** That, and nothing else, is `engine_impact: true`.
- The item body must be: *the fact, our value, GOV.UK's value, the source URL, and the exact file
  and line to change.*
- Then: WhatsApp Jag directly, and turn `/api/health` amber. A number in our engine being wrong is
  not a note in a vault. It is an incident.

**Redefine `engine_impact` to mean exactly this.** A page-hash change becomes `page_changed`, which
is interesting and not urgent. Retro-clear the three false `engine_impact` flags.

**Test it by regression:** set `FACTS.mileageCarFirst10k` to 0.45 in a fixture and assert the differ
screams. If it doesn't catch the bug we actually had, it is not built.

### Phase 3: depth — the part Rakha cannot get from a rates table (the real moat, several days)

Rates are free and public. **Depth is not.** This is where Khoji earns its name:

- HMRC internal manuals (BIM, EIM, CA, CG — the actual reasoning HMRC applies)
- First-tier Tribunal / Upper Tribunal decisions on self-employment, CIS, employment status
- ATT / CTA / AAT syllabuses and past papers — the professional exam corpus
- Employment status (IR35, CEST), badges of trade, allowable-expense case law
- Consultations and draft legislation, so we see a change **before** it lands

Each item still lands as `needs_distillation` → `distilled` → **`reviewed`**, and **only `reviewed`
rows with a `source_url` ever reach an answer.** That gate is already built and it is the right one.
Do not weaken it.

**⚠️ There is currently NO review UI.** Someone reviewed those nine rows by hand in SQL. Phase 3
cannot scale without a review queue. That is the first screen of the dashboard.

### Phase 4: the credit-saving loop (mostly already built)

**It already works.** `/api/ask` calls `lookupQaCache(questionNorm)` before spending a token;
`qa_cache` and `qa_candidates` exist; `bump_qa_cache_hit` is live. Khoji already marks the cache
`stale` when it detects an engine change.

**The loop Jag described:** Rakha answers from the brain for free. Only a genuinely novel, complex
question goes to Khoji to research. Khoji researches once, **saves it**, and the next person who asks
anything similar is answered for nothing.

**What's missing is only the content.** The plumbing is done. Fill Phase 3 and the loop lights up.

---

## 5. THE DASHBOARD AND THE ADMIN PANEL

Jag's ask: *"an admin account that has access to the whole Lekhio platform and app, CRM system for
sales, analytics, sending emails, a store for our code, all on a private login on the Lekhio website
called admin... and that Obsidian brain can be shown in real time, we can see it working and growing,
and Claude built straight in so Cowork can work inside."*

**Be honest about what this is: that is four products.** Admin console, CRM, analytics, and a code
store are each a real build, and **an admin login with access to everything is the single juiciest
target in the business** — one credential that reads every user's financial data. It is not a
"while we're at it".

**So: build it in slices, and build the one that pays for itself first.**

### Slice 1 — `/admin/brain` (build this one)

The **review queue**, which Phase 3 is blocked on anyway. It is small, it is needed, and it earns
its keep on day one.

- The pile of `distilled` items awaiting review, newest first.
- Each one: title, summary, source link, our-value vs GOV.UK-value if the differ flagged it.
- Three buttons: **Approve** (→ `reviewed`, goes live to Rakha), **Dismiss**, **Escalate** (this
  changes the engine).
- A live counter: items held, items reviewed, last successful run, **and a red bar when the brain
  has stopped learning** (K5).
- **Doctrine check (docs/103):** every row must be a real decision. If a row is obvious, Khoji should
  have decided it. *The best button is no button.*

### Slice 2 — `/admin` shell + auth

- **Not a role flag on a normal user.** A separate `admin_users` table, separate RLS, and **2FA**.
- **Every admin read of user data must be written to an append-only audit log.** If we ever look at
  a user's transactions, there is a row saying who looked and when. Without this, "admin can see
  everything" is an ICO problem waiting to happen.
- Start read-only. Add write powers one at a time, each with its own reason to exist.

### Slice 3+ — analytics, CRM, email, code store

**Later. Each one is a separate decision.** Do not let the shell tempt us into building four
mediocre products. Analytics is probably a Supabase view and a chart. CRM before we have customers
is a fantasy.

### The Obsidian vault, shown live

The vault is the **human-readable mirror**, not the truth. Truth is `knowledge_items` in Postgres.
Show the vault in the dashboard by rendering the notes from the database, **not** by reaching out to
the mini.

---

## 6. ARCHITECTURE RULES. Hold these.

1. **The mini is the WORKER, not the TRUTH.** Every reviewed item lands in Supabase, which is what
   Lekhio reads. The vault versions to git. **The mini can burn down and the brain survives.**
2. **One way only.** The mini pushes INTO Supabase. **Production must never reach OUT to the mini.**
   A power cut in a flat must not take down tax answers for every user.
3. **Least privilege.** The mini connects as `khoji_writer`, which can touch exactly one table. It
   never holds the service role key. Keep it that way.
4. **⛔ NO USER DATA IN THE VAULT. EVER.** Obsidian has no RLS, no encryption, no audit log. One
   transaction or one name in there is a GDPR breach. **Khoji holds PUBLIC knowledge only** — tax
   law, exams, precedent. Never one transaction. Never one name. This was raised and agreed
   explicitly. It is not negotiable.
5. **Only `reviewed` rows with a `source_url` reach a tax answer.** The gate exists. Do not weaken it.
6. **Khoji never edits the engine.** It tells a human to look. `lib/taxengine.ts` is changed by a
   person, with the exam suite re-run, against the primary GOV.UK source.
7. **Verify present-day tax facts against the primary GOV.UK page, never a search summary.** An
   agent's confident CRITICAL has now been wrong twice about mileage.

---

## 7. PROGRESS: where the whole build stands

### ✅ Shipped and live (web `a3ac0f6d`, mobile `09adcca`, health green)
Overnight sweep complete. 38 suites / 4,129 assertions green, TSC green. Section 24 fixed (it was
completely broken — mortgage interest was being deducted in full instead of the 20% credit). CIS
refund no longer over-promises (it forgot the student loan). Anon auth now fails CLOSED. The "You"
tab is no longer a streak/badge game. `llms.txt` built, tested, and actually served. The bank-review
pile ("the Tinder swipe") is built: 200 transactions ≈ 25 shops. `docs/00_INDEX.md` created.

### 🔴 Open engineering tasks
- **#24** Next.js 16: `middleware.ts` deprecated → rename to `proxy` (build warning only)
- **#25** WhatsApp has a THIRD category map (`EXPENSE_CATEGORY` in `lib/waintents.ts`, 8 rules).
  Unify into `lib/categories.ts` (19 categories, 30 rules). A tripwire test stops them silently
  disagreeing in the meantime.
- Accessibility labels missing on ~10 screens. **The invoice flows are a money flow and unlabelled.**
- ~8 screens define local colour palettes instead of importing `lib/theme.ts`.
- **Khoji: everything in section 4 of this doc.**

### 🟡 Blocked on Jag (not code)
- **ICO registration (~£47).** Blocks the bank feed AND real users. Do this first.
- Meta payment method (WhatsApp at volume).
- HMRC production credentials (sandbox round trip already PASSED).
- Trade mark, £385, 4 classes.
- **App Store landmine:** `paywall.tsx` opens Stripe via `Linking` — that is a guaranteed Apple
  rejection. "Just add IAP" costs 11–26 margin points (~£145k/yr at 10k subs). The fix is a
  login-only companion app. **Decide before submitting.**

---

## 8. THE FIRST THREE THINGS THE NEXT SESSION SHOULD DO

~~1. `rsync` the mirror down.~~ ~~2. Fix K1 and K2.~~ ~~3. Build the differ, starting with the health
alarm.~~ **All three done, 12 July 2026, 22:30. See the STATUS block at the top.**

**The gate is met.** The differ catches the mileage bug in a test, and is not fooled by the decoy that
caught two human audits. **Phase 3 and the dashboard are unblocked.**

### What the next session should actually do

1. **Rotate `khoji_writer`** if the installer scripts were ever committed. The password is in plaintext in
   `install-khoji.sh`, `khoji-setup.sh` and both `.env.example` files. One `alter role`, one line in the
   mini's `.env`. Check first: `git log --oneline --all -- '*khoji*'`.
2. **`/admin/brain`, the review queue** (section 5, slice 1). 65 distilled rows are sitting unreviewed and
   only `reviewed` rows ever reach Rakha, so the brain is currently learning into a drawer. Phase 3 cannot
   scale without it. **Doctrine check (docs/103): every row on that screen must be a real decision. If a
   row is obvious, Khoji should have decided it. The best button is no button.**
3. **Phase 3, the depth corpus** (section 4). Rates are free and public and we now check all 16 of them
   nightly. **Depth is the moat**: HMRC manuals, tribunal decisions, the ATT/CTA/AAT corpus, employment
   status, consultations we can see coming.

### Two things NOT to do

- **Do not "fix" mileage to 45p.** It is **55p** for 2026/27. Verified tonight against the primary GOV.UK
  page, and now checked automatically every night. This has caught out two separate audits. It will
  probably try to catch out a third.
- **Do not add a check without a fixture.** Every extractor in `diff.mjs` is pinned by a test built from
  the real page text. Both CIS extractors were written from a guess about the page's wording, came back
  `BROKEN` on the first live run, and had to be rewritten against what the page actually says. That is the
  system working. A regex that "looks right" and silently reads the wrong number is the one thing this
  entire build exists to prevent.
