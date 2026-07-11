# 22: Open Banking Build Spec, connect your bank

> The full plan for the flagship feature: let a user connect their bank, read only, so money in and money out logs itself, ready for tax. Optional, never compulsory. Build this after the core WhatsApp loop is live and proven. Written 2026-06-25.

---

## The promise

The user taps "connect your bank", logs in at their own bank, and from then on every payment in and out flows into Lekhio automatically, gets categorised, and sits ready for the quarterly tax update. They never see our hand near their money, because it is read only. We can never move a penny.

---

## Provider and regulation

### Provider
Use an Open Banking aggregator so one integration reaches every UK bank.
- **TrueLayer.** UK first, strong coverage (40+ banks), clean account information API. Recommended.
- **Plaid** or **Tink** are fine alternatives. The shape of the work is the same.

### The regulation, the important bit
Reading someone's bank data is a regulated activity called account information services (AIS). You do **not** need your own FCA authorisation to start, because the aggregator is an authorised provider and lets you operate **as their agent under their permission**. This is the normal route for a startup.

Action before build: sign up with TrueLayer, confirm the agent or regulated-umbrella terms in writing, and complete their onboarding. Update the privacy policy and the data inventory (doc 14) to name the aggregator as a processor and bank transaction data as a data category.

---

## The flow, step by step

1. In the app or on WhatsApp, the user taps **Connect your bank (optional)**.
2. We send them to the aggregator's hosted consent screen (a secure redirect). They pick their bank, log in **at their own bank**, and approve **read only** access. We never see their bank login.
3. The bank returns an authorisation code to our callback, `/api/bank/callback`.
4. Server side, we exchange the code for an **access token** and a **refresh token**. We store them encrypted. They never touch the browser or the app.
5. We pull the connected accounts and the recent transactions.
6. Each transaction is categorised by Claude, the same brain that reads receipts. Anything unsure is flagged for the user to confirm on WhatsApp.
7. From then on a scheduled sync pulls new transactions, categorises them, and matches them to any receipts already photographed.

---

## Data model

New tables (add to `supabase/schema.sql`, service role only, RLS on):

```
bank_connections
  id                uuid pk
  user_id           uuid
  provider          text            -- 'truelayer'
  access_token_enc  text            -- encrypted, never plaintext
  refresh_token_enc text            -- encrypted
  consent_expires_at timestamptz    -- AIS consent lasts 90 days
  status            text            -- 'active' | 'expired' | 'revoked'
  created_at        timestamptz default now()
```

Imported bank lines go into the **existing transactions table**, so the dashboard, tax, and Q&A all just work, with:
- `source_type = 'bank'`
- `external_id` = the provider's transaction id, with a **unique index on (user_id, external_id)** so a re-sync never duplicates a line.
- `confirmed` = false until the user reviews, or true if a saved rule matches (see categorisation).

---

## Token security (treat as the crown jewels)

- Tokens are encrypted at rest with AES-256-GCM. The encryption key lives in an env var (`BANK_TOKEN_KEY`), never in code, never in the client.
- Tokens are read and used **server side only**, in API routes and the sync job. The app and the browser never receive them.
- Least privilege: request only the account information scope. Never request payment initiation. We do not need it and must never have it.
- Log nothing sensitive. Never log a token, an account number, or a balance.

---

## Sync and auto categorisation

- A scheduled job, `/api/cron/bank-sync` (guarded by `CRON_SECRET`, fanned out with the same bounded concurrency as the reminder cron), refreshes tokens as needed and pulls new transactions per active connection.
- Each new line is categorised by Claude into the existing categories, with the direction (money in is income, money out is an expense).
- **Rules.** Let a user say "anything from Screwfix is materials" once, and apply it automatically after. Most users automate the bulk of their lines with a handful of rules. Store rules per user.
- **Receipt matching.** When a bank line and a photographed receipt share an amount and a near date, match them, so the receipt is the evidence for the bank line. No double counting.

---

## Consent expiry, handle it gracefully

AIS consent lasts 90 days. Before it lapses, message the user on WhatsApp: "Your bank connection needs a quick re-approve to keep your books up to date." One tap re-consents. Mark the connection expired if they do not, and fall back to manual capture, which still works.

---

## The user experience

- The **Connect your bank (optional)** card is already in the app settings, flagged coming soon. It becomes the live entry point.
- Framing stays trust first: "Read only, through your bank's own login. We can never move your money. Optional, switch it off any time."
- Offer it **after** the user has seen value, not on the cold first screen, to protect launch trust and conversion. See doc 20.
- WhatsApp confirms in plain words: "Connected. I will keep your books up to date from your Barclays account."

---

## Cost

Aggregators have a free or low cost developer tier and charge as you scale, typically per connected account or per data call. It is a real but modest spend, and it is the feature most likely to convert and retain, so it earns its place. Confirm current pricing with the provider.

---

## Build phases

1. Provider account, sandbox keys, agent terms confirmed.
2. Consent flow: the redirect, the `/api/bank/callback`, token exchange, encrypted storage, `bank_connections` table.
3. Transaction import with the unique `external_id` dedupe into the transactions table.
4. Auto categorisation with Claude, plus user rules.
5. Receipt matching.
6. Consent expiry handling and the WhatsApp re-approve nudge.
7. UX polish in the app and the WhatsApp confirmations.

Ship phase 2 and 3 first to a small group, prove the import is clean, then layer on categorisation and matching.

---

## Compliance checklist before launch of this feature

- [ ] Agent or umbrella terms with the aggregator signed.
- [ ] Privacy policy updated to cover bank data and the aggregator as a processor.
- [ ] Data inventory (doc 14) updated.
- [ ] `BANK_TOKEN_KEY` set in Vercel. Token encryption tested.
- [ ] Only the account information scope requested. No payment scope, ever.
- [ ] The connect flow says read only, optional, and we can never move money, in plain words.
