# 14: Data Inventory and Records of Processing

> What personal and financial data Lekhio holds, why, and how it is handled. This supports the ICO data protection fee registration and serves as the UK GDPR record of processing activities a controller is expected to keep. Keep it updated as the product changes. This is a working record, not legal advice.

---

## Who is the controller

Lekhio (Jag, trading as a sole trader, or the limited company once incorporated) is the data controller for the data below. Contact for data matters: privacy@lekhio.app.

---

## What we collect, why, and the lawful basis

| Data | Where from | Why we hold it | Lawful basis |
|---|---|---|---|
| Mobile number | The user, at sign up | Links their WhatsApp to their account, the core of the product | Performance of the contract |
| Email (optional) | The user | Contact and the early access list | Consent for marketing, contract for service email |
| Receipt photos | The user, via WhatsApp | Read by AI to log the expense | Performance of the contract |
| Voice notes | The user, via WhatsApp | Transcribed to log the expense | Performance of the contract |
| Typed messages | The user, via WhatsApp | Parsed to log income or expense | Performance of the contract |
| Financial records | Built from the above | Bookkeeping and tax preparation | Performance of the contract, and legal duty for record keeping |
| Invoice details and customer name and contact | The user, when invoicing | To create and send invoices | Performance of the contract |
| Payment records | Stripe, when a card payment is made | To confirm payment and book income | Performance of the contract |
| Basic technical logs | Automatic | To run and secure the service | Legitimate interests |

We do not collect special category data. We do not use the data for profiling or automated decisions that have legal effects. The AI reads a receipt or a sentence to draft an entry, and the user reviews and approves it.

---

## Who we share it with (processors)

We share only what each provider needs to do its job. Each is a processor acting on our instructions.

| Processor | What they handle | Why |
|---|---|---|
| Supabase | Database, auth, storage | Stores accounts and financial records |
| Vercel | Hosting | Runs the website and the API |
| Anthropic (Claude) | Receipt and message content at the moment of reading | Reads a receipt or sentence into a draft entry |
| OpenAI (Whisper) | Voice note audio at the moment of transcription | Turns a voice note into text |
| Meta (WhatsApp Cloud API) | Messages to and from the user | The messaging channel |
| Stripe | Payment and card details | Takes subscription and invoice payments. We never see full card numbers |

We do not sell data. We do not share it with anyone outside the list above without the user's instruction.

---

## Where data lives and transfers

Supabase and the providers may process data outside the UK. Where that happens it is under the transfer protections those providers offer. Confirm each provider's region and transfer terms and record them here before launch.

---

## How long we keep it

- Active account: for as long as the account is open.
- After closure: financial records are kept for the period UK tax and accounting rules require, then deleted or anonymised.
- Receipt images and voice notes: kept while the related record is active. The raw voice audio does not need to be kept once transcribed, only the text and the entry.
- Waitlist entries: until launch or until the person asks to be removed.

---

## Security

- Row level security on every table, so a user can read only their own rows.
- Server side writes use a service role key that is never exposed to the app or the browser.
- Data encrypted in transit and at rest by the providers.
- The WhatsApp webhook verifies the request signature. The Stripe webhook verifies its signature. Message content is never written to logs.

---

## People's rights

Users can ask to see their data, correct it, export it, or have it deleted, subject to the record keeping rules. The app already lets a user export their records and there is a plain route to cancel. Requests come to privacy@lekhio.app and are handled within the statutory time.

---

## For the ICO registration

When registering and paying the data protection fee, you will describe roughly this: a small business, one to ten staff, turnover under £632,000, processing customer contact details and financial records to provide bookkeeping and tax preparation software, sharing with the hosting, AI, messaging, and payment processors listed above, for the retention periods above. That puts you in the micro tier, £52 a year, or £47 by direct debit.
