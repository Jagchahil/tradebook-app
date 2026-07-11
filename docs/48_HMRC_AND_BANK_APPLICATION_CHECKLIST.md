# 48: HMRC Recognition and TrueLayer Application Checklist

> The two long approvals that gate the whole platform. They take weeks to months and are not code, they are applications. Start both the day Lekhio Ltd exists. This is the exact path, what Jag does, and what Claude wires as each credential lands. Nothing here can be faked, and we never imply HMRC endorsement.

---

## Why this is the priority

Everything else is built. The three things 2026 makes mandatory, MTD filing, bank feeds, and HMRC recognition, are not coding problems, they are approval timelines we do not control. Competitors (untied, FreeAgent, TaskDrop) are already through or in progress. Starting these is worth more than any further feature.

---

## Prerequisites, do these first

1. Incorporate Lekhio Ltd (some HMRC and TrueLayer steps want a company number).
2. Business bank account in the company name.
3. Domain and a branded email (founders@lekhio.app), already on the launch list.
4. ICO registration (data protection fee), already on the launch list.

---

## Track A: HMRC software recognition (MTD for Income Tax and VAT)

The slowest item. Start it the moment the company exists.

1. **Create an HMRC Developer Hub account** at developer.service.hmrc.gov.uk. Use the company email.
2. **Create an application** in the hub. This gives a sandbox `client_id` and `client_secret`.
3. **Subscribe to the APIs** you need in the sandbox: Making Tax Digital for Income Tax, and Making Tax Digital for VAT. Also the Self Assessment Accounts API for the live HMRC balance view.
4. **Implement OAuth 2.0** against HMRC. The user grants Lekhio access to their tax data. Store access and refresh tokens encrypted, server side only.
5. **Implement the fraud prevention headers** (Gov-Client and Gov-Vendor). HMRC checks these on every call and there is a validator endpoint to test against. Get them right early, this is a common failure point.
6. **Build against the sandbox** and pass HMRC's **test scenarios** for each API. The code spec is ready (see doc 44): `lib/hmrc.ts`, `/api/hmrc/callback`, an in app approval screen, and a `hasHmrcConfig()` gate so it stays dormant until configured.
7. **Apply for production credentials and recognition** (the Software Choices listing). HMRC reviews and lists the software. This is the step that takes time.
8. **Go live** once production credentials are granted. Wire `HMRC_CLIENT_ID`, `HMRC_CLIENT_SECRET`, and the redirect URI into the environment.

Endpoints, in the order of the user's year: obligations, submit a quarterly update, final declaration, and the Self Assessment Accounts API for the balance view. Always behind the human approval tap. We never imply HMRC endorses us.

What Claude does as this lands: build `lib/hmrc.ts` and the approval flow against the sandbox keys, then flip the coming soon flags to live once production is granted.

---

## Track B: TrueLayer for the bank feed (Open Banking)

1. **Sign up** at console.truelayer.com with the company.
2. **Choose the Data API** (account information, the read only feed). We never need payment initiation, so we never touch or move money.
3. **Confirm the operating route.** As a startup, operate under TrueLayer's **agent or regulated umbrella permission** rather than getting our own FCA authorisation. Confirm this in onboarding (see doc 22 for the full build).
4. **Get sandbox keys** and build the connect flow: the user links their bank through the bank's own login, read only, and consents. Tokens stored encrypted, server side, in the `bank_connections` table that is already in `schema.sql`, dormant.
5. **Complete TrueLayer's due diligence** (company details, data handling, privacy policy). This is where the ICO registration and a clear privacy policy matter.
6. **Go live** once approved. Wire `BANK_TOKEN_KEY` and the TrueLayer client credentials. Imported lines land in `transactions` with `source_type` 'bank' and an `external_id`, deduped by the unique index already in the schema.

Note: bank feeds are a commodity, every provider connects to the same regulated bank APIs. If cost or coverage shifts, GoCardless Bank Account Data and Tink are drop in alternatives. The moat is our Claude categorisation on top, not the feed.

What Claude does as this lands: build the connect flow and the sync job against the sandbox keys, then flip the bank coming soon flag to live.

---

## Track C: UKIPO trademark (run in parallel, cheap)

File **Lekhio** as a word mark at ipo.gov.uk, classes 9, 35 and 36 (full spec in doc 44). About £205 for the first class, £60 per extra. File once the company exists, or in your name and assign it over.

---

## The one line

Incorporate Lekhio Ltd, then the same week start the HMRC Developer Hub registration and the TrueLayer signup, and file the trademark. The code is the fast part and it is specced and ready. Launch the wedge while these process. That is how we own tax without losing months.

---

## Environment variables these will add

```
HMRC_CLIENT_ID=
HMRC_CLIENT_SECRET=
HMRC_REDIRECT_URI=        # e.g. https://lekhio.app/api/hmrc/callback
BANK_TOKEN_KEY=           # encryption key for stored bank tokens
TRUELAYER_CLIENT_ID=
TRUELAYER_CLIENT_SECRET=
```
