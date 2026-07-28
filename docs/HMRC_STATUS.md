# HMRC MTD ITSA: status and what is left

Last updated: 22 July 2026. Ref 2026-SMT071 (Jacob Barker, HMRC Software Developer Support).

## Done
- All HMRC endpoints (In-Year and End of Year) are in `lib/hmrc.ts`, every write behind the approval gate, fraud-prevention headers on every call. Pre-change backup: `lib/hmrc.ts.bak-preHMRC`.
- `scripts/hmrc-sandbox-demo.mjs` has a `full-test` command (plus `eoy`, `listcalc`) and a patched `authorize` (relaxed local state check, ignores stray callback hits).
- Sandbox tested 16/16 green: every required endpoint called via the software with valid fraud headers, so HMRC's 30-day log is current.
- Sandbox app `cc5cafe1-7a65-4818-b3dd-ecab6e24cdd7`: client secret fixed, redirect URI `http://localhost:8610/callback` registered, all APIs subscribed including Individuals Tax Liability Adjustments.
- Completed checklist returned to Jacob with the reply and the attached Word doc.
- In-Year (quarterly) stage requested for production. Matches the 7 August quarterly deadline.
- `app/(tabs)/settings.tsx`: GOV.UK find-compatible-software signpost added, plus a self-employment / cash-basis scope note in the MTD explainer.
- `app/final-declaration.tsx`: Final Declaration screen created, submit disabled until the user agrees the statement.

## IDs for the record
- Sandbox ID: `cc5cafe1-7a65-4818-b3dd-ecab6e24cdd7`
- Production Application ID: `355562a9-cbe2-4dc8-9577-e461addb1b6c`

## Left for the End of Year stage (not needed for In-Year)
1. Paste HMRC's exact Individual Final Declaration Statement wording (from the ITSA end-to-end service guide) into `FINAL_DECLARATION_STATEMENT` in `app/final-declaration.tsx`, then screenshot the screen for HMRC.
2. When ready, request the End of Year stage from HMRC (complete the EOY section of the checklist and return it), after a fresh sandbox test of the EOY endpoints. They are already built and passed today.
3. At go-live, set `HMRC_BASE_URL` to the live host and the production `HMRC_CLIENT_ID` / `HMRC_CLIENT_SECRET` / `HMRC_REDIRECT_URI` plus the filing-live flags. The base URL defaults to the sandbox, which is correct until you flip it.

## How to re-run the sandbox test
From this repo: `server-token`, then `create-user`, then `authorize` (sign in with the printed test user), then `full-test`.

## Note
Production credentials are issued after HMRC reviews the returned checklist (their guidance says at least 10 working days).
