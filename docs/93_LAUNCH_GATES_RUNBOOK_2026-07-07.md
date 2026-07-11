# 93: Launch gates runbook (7 July 2026)

> The ordered, click by click runbook to take Lekhio from code-ready to live. Everything here is external config or paperwork, not code (doc 88 confirmed no code security vulnerabilities). Pairs with doc 92 (incorporation pack). Nothing in this runbook moves money, files tax, or messages a third party without Jag doing it himself. Writing rule holds: no em dashes, no en dashes, no hyphens used as dashes.

## Reality check for a Friday (10 July) soft launch

- The core WhatsApp loop works with zero AI credit (typed money, mileage, CIS, totals, invoices are all deterministic). AI credit lights up receipt photos, voice, and the chat, high visibility but not a hard blocker.
- HMRC production recognition takes about ten working days, so it will not be live by Friday. You launch honestly in "we prepare, you approve" mode with filing still sandbox. This is on brand and fine.
- The one thing that must be right before any real user touches the app is the anonymous auth close (gate 1). Do not invite anyone before that is done.

## Gate order

### Gate 1. Close anonymous auth (do first, biggest risk)

Strict order, or you 401 your own users (doc 81 section 8, doc 88 security gate 1):

1. Confirm OTP is the live login in the current app build. `EXPO_PUBLIC_OTP_ENABLED` on, and a real phone number can request and enter an SMS code and land in the app. If the installed build predates OTP, do a fresh EAS build first (doc 81 section 3).
2. Supabase dashboard, project tradebook-prod: Authentication, then Sign In / Providers, disable Anonymous sign-ins.
3. Vercel, project tradebook1/tradebook-app: Settings, Environment Variables, set `REJECT_ANON_USERS=true`. Redeploy.
4. EAS rebuild and reinstall on the Samsung, then confirm a real login works end to end before inviting anyone.

Verify: log in as a fresh user, confirm authed routes return data (not 401). To inspect a session fast, decode the JWT payload in the console with `atob(token.split('.')[1])` and check `is_anonymous` is false.

### Gate 2. Set the dedicated token secrets (Vercel)

So the service-role key is never reused as an HMAC secret (doc 88 security gate 3). Generate each as a fresh 32 byte random value and paste straight into Vercel. Do not send them to anyone.

Generate three values (run locally, one per secret):
```
openssl rand -hex 32   # PACK_TOKEN_SECRET
openssl rand -hex 32   # LEAD_TOKEN_SECRET
openssl rand -hex 32   # HMRC_STATE_SECRET (only if not already set, else leave)
```
Add in Vercel, Settings, Environment Variables:
- `PACK_TOKEN_SECRET`
- `LEAD_TOKEN_SECRET`
- `HMRC_STATE_SECRET` (doc 81 says this is already set, confirm it exists before adding)

Redeploy after adding. Existing signed quarter-pack and income-proof links are short lived (20 minute expiry), so rotating the pack secret only invalidates links already in flight, which is harmless.

### Gate 3. Point lekhio.app (Vercel)

Note: lekhio.com was taken, so the live domain is lekhio.app (bought 7 July inside Vercel and attached to the tradebook-app project, SSL generating). It is a global gTLD, no country tie, room to grow beyond the UK later. This changes the canonical domain everywhere from lekhio.com to lekhio.app.

1. DONE: lekhio.app bought in Vercel and attached to the tradebook-app project. Let the SSL certificate finish generating (automatic, a few minutes).
2. Verify the ICANN email Vercel sends (click the link), or the domain risks suspension after about two weeks.
3. Settings, Environment Variables: set `NEXT_PUBLIC_APP_URL=https://lekhio.app`. Redeploy. This one var auto fixes robots (unblocks indexing), sitemap, JSON-LD SITE, llms.txt, and canonicals.
4. For invoicing email later: set `EMAIL_FROM=Lekhio <invoices@lekhio.app>` and verify lekhio.app in Resend.
5. Google Search Console: add the lekhio.app property, verify, submit the sitemap.

Verify: visit https://lekhio.app, confirm it serves the site with a valid certificate and that /robots.txt no longer blocks all indexing.

### Gate 4. Add Anthropic API credit and a spend cap

1. console.anthropic.com, Plans and Billing. Set a hard monthly spend cap and a budget alert first.
2. Add credit. The durable per phone and global caps in code already backstop runaway loops (doc 88 scale note), the account cap is the outer belt.
3. Set `OPENAI_API_KEY` in Vercel with a little credit, for Whisper voice transcription.

Verify: send a receipt photo over WhatsApp and confirm it parses, and open Lekhio AI in the app and confirm it answers rather than showing the "not switched on" state. The prior blocker was "credit balance too low" in the Vercel logs, so a successful parse confirms the fix.

### Gate 5. Clear the two Supabase advisor leftovers

1. Enable Leaked Password Protection: Supabase, Authentication, Sign In / Providers, turn it on. Clears the one remaining security warning.
2. Drop the redundant duplicate index: run `supabase/drop_redundant_users_index_2026-07-07.sql` in the Supabase SQL editor. Clears the one remaining performance warning. The schema.sql twin has already been removed in the repo so it will not come back.
3. Re-run both advisors (Security and Performance) and confirm a clean board (0 errors, 0 warnings, the 11 info rows for intentional server-only tables are expected).

### Gate 6. Incorporate Lekhio Ltd (recommended: through Tide)

See doc 92 for the full fill in the blanks pack. Recommended route is Tide, which forms the company and opens the free business account in one flow, does your Companies House identity verification (it is an Authorised Corporate Service Provider), accepts a single shareholder (exactly your structure), and charges 14.99 versus 100 direct. Certificate typically within one business day. Doing it through Tide folds gate 7 into this step. You do the filing, the identity verification, and the payment yourself. This is the linchpin: it unblocks gates 8 and 9 and Meta business verification and Stripe live.

### Gate 7. Open the business bank account

If you incorporate through Tide (gate 6), this is already done, the account opens with the company. Otherwise open a free business account (Tide, Mettle, or Starling) using the CRN once the certificate lands. Keep company money separate from personal (matters for the Jersey plan, doc 89).

### Gate 8. Set BANK_TOKEN_KEY (before any bank or HMRC go-live)

Activates AES-256-GCM token encryption at rest (a no-op until set). Not needed for a prepare-only Friday launch, but must be set before live bank feeds or live HMRC filing. Generate and add in Vercel:
```
openssl rand -hex 32   # BANK_TOKEN_KEY
```
Note: set this before connecting any real bank or HMRC account, so tokens are encrypted from the first write. If tokens already exist unencrypted, the code passes legacy plaintext through, so re-connect once after setting the key to encrypt them.

### Gate 9. Apply for HMRC production recognition as Lekhio Ltd

Developer Hub production application using the CRN as registration evidence, the doc 72 answer pack, and the sandbox evidence (doc 81 section 10). About ten working days. Confirm during the application whether the origin is WEB_APP_VIA_SERVER or MOBILE_APP_DIRECT, and re-verify each endpoint version against the live HMRC OpenAPI specs before submitting. Filing stays sandbox until granted, then set `HMRC_BASE_URL` to the live host.

### Gate 10. Brief the accountant

Corporation Tax registration within 3 months of trading, minute UK central management and control, and flag the Jersey intention so records are clean from day one. Full brief in doc 92.

## After the gates, at soft launch

- Fund the platform before commercial volume: Vercel Pro (about 16 a month), Supabase Pro (about 20 a month, before real users, for backups and no auto pause). Stripe live keys and webhook plus the Lekhio brand on Checkout.
- Register with the ICO (about 52 a year) before real users and before live bank feeds. Do not claim "registered" until done.
- Flip the paywall (`EXPO_PUBLIC_PAYWALL_ENABLED=true`) and rebuild at soft launch. Soft launch to the friendly cohort (doc 77).
- Bank feeds go live only after ICO, the privacy policy update naming TrueLayer and the AIS basis, and the TrueLayer production agreement: then swap `BANK_SANDBOX` off and add production keys.

## App store critical path (start in parallel with HMRC)

The app store path can be the longest pole, so start it the day the CRN confirms. Register both stores as the company (organization), which is cleaner branding and, on Google, skips a two week delay.

- **The linchpin: a D-U-N-S number for Lekhio Ltd.** Free from Dun and Bradstreet, up to about 5 business days. Organization accounts on both Apple and Google verify the company through it. Apply the moment the CRN is confirmed. This gates everything below.
- **Google Play, register as organization.** A new personal account created after 13 Nov 2023 must run closed testing with 12 testers for 14 continuous days before it can go to production. An organization account registered to a legal business entity is exempt, so incorporating just removed that two week wait. 25 dollars one off.
- **Apple Developer, enrol as organization.** 79 pounds a year. Needs the D-U-N-S (allow up to 5 business days from D&B, then up to 2 business days for Apple to sync before you can enrol as a company). App review itself is usually 24 to 72 hours now.
- **The friendly cohort does not need full public store approval.** Distribute to the doc 77 soft launch cohort via Apple TestFlight and Google Play internal testing, which are near immediate once the paid accounts exist. Public store review is only needed for the open public launch.

Rough timeline if started on CRN day: D-U-N-S about a week, then enrol plus EAS production build plus review about another week, so roughly two to three weeks to public stores, which runs alongside the HMRC ten working days rather than after it. The cohort can be testing via TestFlight and internal testing inside the first week.

## Approval boundaries (Jag does these personally)

Buying the domain, adding Anthropic credit, filing and paying at Companies House, opening the bank account, and submitting the HMRC application. The assistant preps, walks through the clicks, and generates config or SQL, but never moves money, files tax, or messages a third party, and never runs the deploy chain without confirming the sync path first.

## Deploy note

The doc 81 pricing correction and the schema.sql duplicate-index removal are edits in the Cowork folders. Before they reach production: the schema change is applied by running the SQL file in the Supabase editor (gate 5), and the doc edit needs no deploy (docs are not served). No web or app code changed in this pass, so no build or push is required for these two items. Any future code change follows the chain: `node test/run-all.mjs && npx tsc --noEmit && git push && npx vercel --prod`, after copying files into the correct deploy repo.
