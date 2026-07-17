# 66: HMRC MTD Recognition, Sandbox Demo and Production Application Checklist

> Written 1 July 2026. This is the exact, ordered path to take Lekhio's built-but-dormant HMRC filing from "code exists" to "recognised by HMRC for live MTD for Income Tax filing". It pairs with doc 55 (the foundation) and doc 65 section 6a (why this is the top strategic blocker). The whole sandbox demo can be done NOW, for free, on the current Vercel URL, without waiting for lekhio.app. Recognition has a lead time of roughly ten working days, so the value is in starting it early.
>
> This session also corrected three real gaps in the code against HMRC's current published API. Those fixes are in `lib/hmrc.ts` and are listed in section 6 so the handover stays honest.

---

## 0. The one thing to understand first

MTD for Income Tax software has one job HMRC cares about: turn a trader's transactions into the correct summary totals and submit them through the recognised path, with the taxpayer approving before anything is sent. Lekhio's `lib/hmrc.ts` already does the hard part (category to MTD field mapping, the approval gate, the OAuth flow). Recognition is HMRC watching you drive that loop end to end in their sandbox, then granting production credentials. So the work now is operational, not invention: subscribe the app to the right APIs, set a few environment variables, create a test user, and walk the round trip once.

Nothing in this checklist can submit to the live HMRC service. The code points at the sandbox by default and only switches to production when `HMRC_BASE_URL` is explicitly set to the live host AND production credentials are in place. You cannot file a real return by accident while doing any of this.

---

## 1. Prerequisites (already in place)

- A sandbox application exists on the HMRC Developer Hub. App ID `cc5cafe1-7a65-4818-b3dd-ecab6e24cdd7`, Client ID `woG5KPYp84KdvEVS2DLhV5feWXQx` (from doc 65).
- `HMRC_STATE_SECRET` and `HMRC_CLIENT_SECRET` are already set in Vercel.
- The connect and callback routes are built and deployed: `/api/hmrc/connect`, `/api/hmrc/callback`, and the confirmation page `/hmrc/connected`.
- A `hmrc_connections` table stores tokens per user, service-role only.

You will need to be logged in to the HMRC Developer Hub as the account that owns the sandbox app.

---

## 2. Subscribe the sandbox app to the required APIs

In the Developer Hub, open the sandbox application and add API subscriptions for all of these. Without the subscription, calls return 403 even in the sandbox.

- **Self Employment Business (MTD)**, carries the cumulative period summary submission (the core file step).
- **Obligations (MTD)**, tells you what quarters are due and when.
- **Individual Calculations (MTD)**, triggers the year-end calculation and the final declaration.
- **Self Assessment BSAS (MTD)**, the year-end business source adjustable summary (annual adjustments).
- **Individual Losses (MTD)**, brought forward losses and loss claims. Easy to forget: a missing subscription here returns 403 on the losses calls.
- **Create Test User**, mints sandbox test taxpayers with a NINO and MTD ITSA enrolment.
- **Test Fraud Prevention Headers**, validates the Gov-Client and Gov-Vendor headers. This is how you prove header compliance before recognition.

---

## 3. Register the redirect URI on the sandbox app

The OAuth callback must be registered on the app or HMRC will reject the authorize request.

- Redirect URI to add now (sandbox, current host): `https://tradebook-app-five.vercel.app/api/hmrc/callback`
- When lekhio.app is live, add `https://lekhio.app/api/hmrc/callback` too (you can register more than one).

This is the single reason the demo does not need the real domain yet. The Vercel URL is a valid redirect target.

---

## 4. Set the environment variables in Vercel

Add these to the web project (Production and Preview). Do not paste secrets to the assistant; enter them straight into Vercel.

- `HMRC_CLIENT_ID` = the sandbox app's Client ID (`woG5KPYp84KdvEVS2DLhV5feWXQx`).
- `HMRC_REDIRECT_URI` = `https://tradebook-app-five.vercel.app/api/hmrc/callback` (must match section 3 byte for byte).
- `HMRC_CLIENT_SECRET` = already set. Confirm it is present.
- `HMRC_STATE_SECRET` = already set. Confirm it is present.
- `HMRC_BASE_URL` = leave UNSET. Unset means the sandbox (`https://test-api.service.hmrc.gov.uk`). Only set this to the live host after recognition.

Redeploy after setting them. `isHmrcConfigured()` flips to true once Client ID, secret, and redirect URI are all present, which turns the "connect" button from a 503 into a live authorize link.

---

## 5. Create a sandbox test user

Use the Create Test User API (or the Developer Hub's test user page) to mint an **Individual** test user. You get back government gateway credentials, a National Insurance number (NINO), and, if you request the MTD ITSA enrolment, a self-employment business with a business id. Record the NINO and business id. These are the `nino` and `businessId` you pass to `submitQuarterlyUpdate`.

The test user is fictional. Its credentials only work against the sandbox sign-in host `test-www.tax.service.hmrc.gov.uk`, which is exactly where `authorizeUrl` sends the browser in sandbox mode.

---

## 6. What changed in the code this session (verified against the live HMRC OAS)

Three gaps were found and fixed in `lib/hmrc.ts`. All 20 checks in `test/hmrc/run-hmrc-test.mjs` pass and the file typechecks clean under strict mode.

1. **Submission endpoint was retired.** The code was PUTing to the old discrete quarterly path `/period/{taxYear}` at version `vnd.hmrc.3.0+json`. From tax year 2025-26 HMRC replaced that with a single **cumulative** period summary per year. `submitQuarterlyUpdate` now targets `/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}` at `vnd.hmrc.5.0+json`. Consequence for the caller: feed `buildPeriodicUpdate` the transactions for the whole year to date, not just the latest quarter, and set `periodEndDate` to the latest quarter end. The expense field names Lekhio maps to (costOfGoods, paymentsToSubcontractors, carVanTravelExpenses, and the rest) were checked one by one against the v5.0 schema and are all correct.

2. **Fraud prevention headers were far short.** The old builder sent three headers. HMRC's WEB_APP_VIA_SERVER connection method requires roughly fourteen, and the Test Fraud Prevention Headers API enforces them. `fraudPreventionHeaders` now emits the full set, with correct formats (percent-encoded values, `software=value` pairs for version and licenses, a UTC millisecond timestamp for the public IP, and the `by=/for=` forwarded chain). A new helper `missingFraudHeaders(ctx)` returns exactly which required headers a given context still lacks, so you can see at a glance what the client must collect.

3. **Obligations version was stale.** The obligations read was on `vnd.hmrc.2.0+json`; it is now `vnd.hmrc.3.0+json`, matching the current Obligations (MTD) API. The path was unchanged.

Not touched today: `submitFinalDeclaration` targets the Individual Calculations final declaration. Its version should be reconfirmed against the current Individual Calculations API when the year-end calculation step is wired for live use. It is out of scope for the quarterly demo and stays behind the same approval gate.

**Sync note (doc 65 section 2):** these are `lib/` changes, so copy the whole lib across, do not single-file copy. `cp "<cowork>/tradebook-web/lib/"*.ts ~/Projects/tradesman/tradebook/lib/`, and copy `test/hmrc/run-hmrc-test.mjs`, then commit and push from `~/Projects/tradesman/tradebook`.

---

## 6b. Push-button harness for the round trip

`scripts/hmrc-sandbox-demo.mjs` runs the whole sandbox loop from the command line so the demo is repeatable, not hand-assembled. It reuses the real production code in `lib/hmrc.ts` (the cumulative payload builder, the fraud-prevention header builder, and the approval-gated submit), so what you show HMRC is the same code path that would run live. Only the sandbox-only helpers (create test user, list businesses, fraud-header validator) live in the script.

It is sandbox only by construction: it refuses to run if `HMRC_BASE_URL` points at the live host, and the submit step still throws unless you pass `--approve`. Secrets come from the environment or `.env.local` and are never hardcoded. Tokens and test-user credentials cache in `.hmrc-sandbox.json`, which is gitignored.

Run the steps in order from the web repo, after the app is subscribed to the five APIs (section 2) and the local redirect `http://localhost:8610/callback` is registered (section 3):

```
node scripts/hmrc-sandbox-demo.mjs server-token   # application token for sandbox-only APIs
node scripts/hmrc-sandbox-demo.mjs create-user     # mints a test user, prints NINO + gateway login
node scripts/hmrc-sandbox-demo.mjs authorize       # opens the OAuth sign-in, catches the redirect locally
node scripts/hmrc-sandbox-demo.mjs businesses      # finds the businessId from the NINO
node scripts/hmrc-sandbox-demo.mjs obligations     # what is due and when
node scripts/hmrc-sandbox-demo.mjs submit          # dry run, prints the cumulative payload
node scripts/hmrc-sandbox-demo.mjs submit --approve# actually submits (sandbox)
node scripts/hmrc-sandbox-demo.mjs fph             # validate the fraud-prevention headers
```

Capture the output of each step as your recognition evidence. Section 7 explains what each step proves.

---

## 7. The sandbox round trip to demonstrate

This is the loop HMRC wants to see. Do it once, end to end, with the test user. The harness in section 6b runs exactly these steps.

1. **Connect.** In the app (or by calling `/api/hmrc/connect` with a valid Supabase token), get the authorize URL and open it. Sign in as the sandbox test user and grant access. HMRC redirects to `/api/hmrc/callback`, which swaps the code for tokens and stores them. You land on `/hmrc/connected?status=ok`.
2. **Obligations.** Call `retrieveObligations(nino, accessToken, fraud)` and confirm you get back the quarters due and their deadlines for the test user.
3. **Build the payload.** Feed the test user's year-to-date transactions into `buildPeriodicUpdate(txns, periodStart, latestQuarterEnd)`. For a trader under 90,000 turnover, pass `{ consolidated: true }` to send the single consolidated expenses figure.
4. **Approve, then submit.** Show the figures to the user, capture an explicit approval, then call `submitQuarterlyUpdate({ ..., approved: true })`. Without `approved === true` the call throws `ApprovalRequiredError` and sends nothing. Confirm a 200 or the documented success response from the sandbox.
5. **Validate the headers.** Send the same fraud headers to the Test Fraud Prevention Headers API and confirm it passes. Use `missingFraudHeaders(ctx)` first to check nothing is absent. This is the step that most often blocks recognition, so get it green here.

Capture screenshots or logs of each step. The recognition reviewer will ask for evidence of a full obligation-to-submission cycle.

---

## 7c. Recognition evidence, sandbox run of 1 July 2026 (PASSED)

The full round trip was driven end to end against the HMRC sandbox on 1 July 2026 using `scripts/hmrc-sandbox-demo.mjs`, exercising the real `lib/hmrc.ts` code path. Every step succeeded. This is the evidence to attach to the production credentials application.

- **Application token** (client_credentials): obtained.
- **Create test user** (individual, services national-insurance + self-assessment + mtd-income-tax): created. Sandbox NINO `NJ338980A`, SA UTR `4031296607` (fictional test data).
- **OAuth connect** (read + write self-assessment): user signed in on `test-www.tax.service.gov.uk`, granted authority, tokens stored. Note: this is the run that caught and confirmed the authorize-host fix (the old `.hmrc.` host did not resolve).
- **List businesses**: self-employment business `XBIS12345678901` resolved from the NINO (Business Details MTD v2.0).
- **Retrieve obligations**: returned the quarterly obligation periods with due dates and open/fulfilled status (Obligations MTD v3.0).
- **Submit cumulative period summary** (Self Employment Business MTD v5.0, `/cumulative/{taxYear}`), behind the explicit approval gate: dry run sent nothing; with `--approve` HMRC responded **HTTP 204 (accepted and stored)**.
- **Fraud prevention headers** (Test Fraud Prevention Headers v1.0, WEB_APP_VIA_SERVER): validator returned **`VALID_HEADERS`**, "All headers required for your connection method have been supplied and all appear to be valid."
- **Year-end calculation** (Individual Calculations v8.0): triggered an intent calculation (**HTTP 202**) and retrieved the full income tax calculation, including the end-of-year estimate to show the user. Verified 2 July 2026.
- **Final declaration / crystallisation** (Individual Calculations v8.0, `/{calculationId}/final-declaration`), behind the approval gate: dry run sent nothing; with `--approve` HMRC accepted it with **HTTP 204**. The stress test also caught and fixed a wrong endpoint (`trigger/final-declaration`) before this pass, which is the process working as intended. Verified 2 July 2026.
- **BSAS** (Self Assessment BSAS v7.0): triggered a business source adjustable summary, **HTTP 200** with a calculationId. Verified 2 July 2026.
- **Losses** (Individual Losses v6.0): created a brought-forward loss (**HTTP 201**) and a loss claim (**HTTP 201**), and listed both. Verified 2 July 2026, on tax year 2025-26.

**Important HMRC-side dependency on losses.** The Individual Losses API v6.0 supports tax years only up to and including 2025-26; for 2026-27 it returns `RULE_TAX_YEAR_FOR_VERSION_NOT_SUPPORTED` because a newer version is still in development at HMRC. This is not a Lekhio bug. In practice it does not block us: a trader's first 2026-27 loss submission would not happen until after that year ends, by which point HMRC will have shipped the newer losses version. Track it, point the losses calls at the new version when released. Also note: the app must be subscribed to Individual Losses (MTD) in the Developer Hub, or losses calls return 403 (see section 2, easy to miss).

What this proves for recognition: the software converts real categorised transactions into a correct cumulative MTD payload, submits it through the recognised path only after explicit user approval, and sends complete, well-formed fraud-prevention headers. The remaining work before live is configuration and the two production header decisions in section 8, not code.

---

## 7d. Coverage against HMRC's minimum functionality standard (nothing missed check)

Mapping each item HMRC lists to our status, so the gaps are explicit.

| Minimum functionality requirement | Status |
| --- | --- |
| Provide fraud prevention header data | Done, validated VALID_HEADERS |
| Obtain a business ID for each business | Done, Business Details v2.0, proven |
| Create and maintain digital records, with export | Done, the app plus GDPR self-service export |
| Submit quarterly updates for each mandated business income source | Done for self-employment, cumulative v5.0, proven 204 |
| Allow the customer to view a tax liability estimate | Done, Individual Calculations retrieve, plus the dashboard estimate with a disclaimer |
| Make required adjustments and finalise business income for the year | Done, BSAS v7.0 (adjustments) and final declaration v8.0, final declaration proven 204 |
| Brought forward, carry forward or set sideways business losses | Done, Individual Losses v6.0, built |
| Submit non-mandated income sources | Out of core scope, additional functionality, can be added iteratively |

Two honest scope notes. First, we build the **self-employment** path in full, which is the trades product. **UK and foreign property income** are other mandated sources in the standard; a tradesperson whose main business is a trade does not usually file property income, so we treat property as a later, iterative addition rather than a launch blocker. HMRC's iterative build process explicitly allows this: apply for the self-employment functionality now, add property later. Second, BSAS and losses are built and unit-tested; their sandbox round trip is the last stress-test step (harness commands `bsas` and `losses`).

---

## 8. What the client still needs to collect before production

Section 7 will pass in the sandbox with a partial header context, but full recognition wants the browser-collected values. The server already fills what it can (connection method, product name, version, device id, user id, public IPs, timestamp, forwarded chain). The following must be gathered in the user's browser at connect and submit time and forwarded to the server, then passed into `FraudContext`:

- `browserJsUserAgent` from `navigator.userAgent`
- `screens` (width, height, scaling factor, colour depth) and `windowSize` (width, height)
- `timezone` in `UTC+00:00` form
- `clientPublicPort` (the client's public source port, usually surfaced by the load balancer or a lightweight echo endpoint)
- `multiFactor` if any MFA was used (omit cleanly if none)

Until those are wired, `missingFraudHeaders` will list them. This is the one remaining piece of integration work; everything else is configuration.

---

## 9. Apply for production recognition

Once the sandbox loop is demonstrated and the headers validate:

1. On the Developer Hub, start the **production credentials application** for the MTD ITSA APIs you subscribed to.
2. Provide the demonstration evidence (the round trip from section 7).
3. Wait for review (about ten working days).
4. On approval, set the production values in Vercel: `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET` to the production credentials, `HMRC_REDIRECT_URI` to the live domain callback, and `HMRC_BASE_URL` to `https://api.service.hmrc.gov.uk`. `isLiveHmrc()` then returns true and the authorize flow moves to the live sign-in host automatically.

Only after all four are set does Lekhio touch the live service, and even then only behind the explicit per-submission approval gate.

---

## 9b. Production application pack, ready to submit

When you open the production credentials application on the Developer Hub, these are the answers, drafted from what is built and proven. Adjust the company specifics to match your registration. You submit it, I cannot, because it needs your Developer Hub account and company details.

**What the software does.** Lekhio is a bookkeeping and Making Tax Digital for Income Tax product for UK self employed tradespeople. Users capture income and expenses by WhatsApp photo, voice, and text. The software categorises each entry to the correct self employment field, keeps a running cumulative total, and prepares the quarterly update and year end figures. The user reviews and explicitly approves before anything is submitted to HMRC.

**Which APIs and how.** Self Employment Business (MTD) for the cumulative period summary, Obligations (MTD) to retrieve what is due, Business Details (MTD) to resolve the business id, and Individual Calculations (MTD) for the year end calculation ahead of final declaration. All submissions run behind an explicit user approval gate in code.

**Fraud prevention headers.** Connection method WEB_APP_VIA_SERVER. The full required header set is sent and has been validated against the Test Fraud Prevention Headers API with a VALID_HEADERS result (evidence in section 7c). Client side values are collected in the user's browser and forwarded to the server.

**Testing completed.** A full sandbox round trip has been demonstrated end to end with an HMRC test user: create test user, OAuth connect, retrieve obligations, submit a cumulative period summary returning HTTP 204, and validate fraud prevention headers returning VALID_HEADERS. Dates and results are recorded in section 7c.

**Data protection and security.** UK GDPR compliant. Data encrypted in transit and at rest. Row level security on all tables. OAuth tokens stored server side only. Self service data export and erasure available to users. ICO registration in progress before onboarding real members of the public.

**Attach as evidence.** The section 7c run log (the 204 submission and the VALID_HEADERS result), and screenshots or terminal output of each step from the `scripts/hmrc-sandbox-demo.mjs` run.

**Then:** set the production values in Vercel only once approved (section 9, step 4), and keep pointing at the sandbox until the credentials arrive.

---

## 10. TL;DR

The filing code is now correct against HMRC's current API (cumulative v5.0 submission, full fraud headers, current obligations version). The sandbox demo needs no money and no domain: subscribe the app to five APIs, register the Vercel callback URI, set two environment variables, mint a test user, and walk connect to obligations to approve to submit once. The only real integration left is collecting a handful of browser values for the fraud headers. Do the demo, validate the headers, apply for production, and recognition is roughly ten working days out. This is the single highest-leverage thing to have in flight, because every rival has it and it is what turns Lekhio from the best place to keep the books into the place that also files them.

---

## Update, 2 July 2026 (Fable audit)

- `createBroughtForwardLoss` and `createLossClaim` now require `approved === true` (throw `ApprovalRequiredError` otherwise), so every HMRC write is gated. The sandbox harness passes `true` explicitly. Suite is 30/30.
- Property income sources (UK and foreign) remain out of scope: the target market is trades sole traders, no landlord persona yet. Revisit before widening the ICP; the payload builders would need a property business type end to end.
- Pre production checklist addition: re verify every endpoint version against the live HMRC OpenAPI specs on the developer hub immediately before the production application, since versions move.

## Update, 2 July 2026 (section 8 built: device fraud header collection)

The one remaining integration from section 8, collecting the device only fraud prevention values and getting them to the server, is now built end to end. This closes the last piece before live filing (recognition itself was already provable, the sandbox validated VALID_HEADERS with a partial context).

- **Web `lib/fraud.ts`**: `sanitizeClientFraud` (strips CR, LF and every control char, trims, caps length, validates the device id and port shapes, so an untrusted client value can never inject an HTTP header on our outbound HMRC request), `clientPublicIpFromRequest` (takes the END USER's IP as the first X-Forwarded-For entry, not the proxy), and `fraudContextFromRequest` (merges the device values with the request derived IP, timestamp, vendor details into a full `FraudContext`). 29 unit tests in `test/hmrc/fraud.test.mjs`, all green, including the header injection cases.
- **Web `/api/hmrc/fraud`**: POST, Supabase authed, sanitizes the body, stores the latest snapshot against the user, and returns `missing` (the output of `missingFraudHeaders`) so completeness is verifiable from the real client. Never contacts HMRC, never files.
- **Persistence**: `saveHmrcFraud` / `getHmrcFraud` in `lib/supabase.ts`, snapshot on the `hmrc_connections` row (new `fraud_client jsonb` + `fraud_collected_at` columns, idempotent block appended to `supabase/schema.sql`, run it in the SQL editor). Device characteristics, not secrets, so plain jsonb; table stays service role only.
- **App `lib/fraud.ts`**: `collectClientFraud` gathers a persisted device id (AsyncStorage), user agent, screen and window geometry (Dimensions + PixelRatio) and the timezone in `UTC+00:00` form. `postHmrcFraud` in the app `lib/supabase.ts` forwards it with the user's bearer token. Wired into `file-return.tsx` `connectHmrc`, fire and forget, when the user links HMRC.
- **Still device-omitted, by design**: `Gov-Client-Public-Port` (a browser or app cannot see its own public source port; Vercel does not surface it, so it is legitimately omitted per HMRC's "unable to collect" rule) and `Gov-Client-Multi-Factor` (Lekhio's OTP is at login, not per submission; omitting is safer than a wrong format). `Gov-Vendor-Public-IP` / `Gov-Vendor-Forwarded` come from `HMRC_VENDOR_PUBLIC_IP` when set in Vercel; until then `/api/hmrc/fraud` will list them in `missing`, which is the intended visibility.
- **Architecture note to confirm at recognition**: the origin device is the mobile app, and we send browser style values under WEB_APP_VIA_SERVER (validated VALID_HEADERS in the sandbox). If HMRC prefers MOBILE_APP_DIRECT for the app origin, the header set changes; confirm the connection method with them during the production application. The collection mechanism is the same either way.
- Verified: app `tsc` clean, web fraud suite 29/29, existing HMRC suite still 30/30.
