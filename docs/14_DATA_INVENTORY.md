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
| Login attempt records (`auth_sends`) | Automatic, when a sign in code is asked for | Security and spend control on the login door | Legitimate interests, Article 6(1)(f). See below |
| Testimonials | The customer, written by them in their own account | Marketing on our website, under their name if they ask for it | Consent, Article 6(1)(a). See below |

We do not collect special category data. We do not use the data for profiling or automated decisions that have legal effects. The AI reads a receipt or a sentence to draft an entry, and the user reviews and approves it.

### `auth_sends`: the legitimate interests assessment, written down

One row is written every time somebody asks us to send a login code. Recorded per row: the channel (`sms` or `email`), the outcome (`sent`, `refused_unknown`, `refused_capped`, `refused_rate`, `failed`), the time, and **a keyed HMAC of the destination, never the number or the address**.

- **The interest.** Two of them. A login door that sends SMS costs real money per message, so an unwatched one is a bill somebody else can run up. And a credential stuffing attempt against our customers has to be visible after the fact, or the first we know of it is a customer who has lost his books.
- **Why it is necessary.** Enforcement already lives in `rate_hit()`, which refuses. That refusal leaves no trace of its own, so without this table we can block an attack and still be unable to answer "was this one target hammered, or a thousand". This is the evidence, and there is no way to have it without recording that a send was asked for.
- **The balance, and why it comes out in our favour.** A plain list of every number and address that ever asked to sign in would be a list of who our customers are and when they were at their desk, which is more than the interest needs. So the destination is stored as an HMAC keyed off `WEB_SESSION_SECRET` with its own domain prefix. It answers "same target again" and nothing else, and it is useless to anyone who reads the table. Rotating that secret makes historic rows permanently unlinkable. Retention is **90 days**, swept nightly by `auth_sends_sweep()`: long enough to investigate an incident, short enough that we are not keeping a record of every sign in for ever. Row level security is on with **no policies at all**, so only the service role can read it.
- **What a data subject gets.** Because the destination is a keyed hash and not the address, these rows are pseudonymised rather than anonymous: we could confirm whether a given address appears. An access request that asks for it is answered by hashing the address and reporting the outcomes and times, which is exactly the same limited answer we hold ourselves.
- **Recital 49** treats processing strictly necessary for network and information security as a legitimate interest of the controller. Watching a login door for abuse is the case that recital describes.

### Testimonials: consent, and how it is withdrawn

A customer writes his own review from **Your review** in his account. Nothing else can create one against his name.

- **It is consent, not legitimate interests**, because publishing a named endorsement on the open web is not something he would reasonably expect us to do without asking.
- **It is a positive act.** Both switches, "use my name" and "say what I do", arrive **off**. A pre-ticked box is not consent (Recital 32, and *Planet49* C-673/17 says so in terms), so we do not ship one. With them off the by-line reads "Lekhio user", which identifies nobody.
- **He is never the publisher.** Saving stores the row unpublished. It reaches lekhio.app only when somebody at Lekhio approves it, and the page says so before he types.
- **Withdrawal is as easy as giving it** (Article 7(3)): one button on the same page, published or not, and it is not gated on his subscription being live. A lapsed customer must not find his name held on a marketing page.
- **The row carries his user id**, so a deletion request reaches it. Before 9 August 2026 testimonials carried only the id of the team member who typed one in, and an erasure walked straight past them.

---

## Who we share it with (processors)

We share only what each provider needs to do its job. Each is a processor acting on our instructions.

| Processor | What they handle | Why |
|---|---|---|
| Supabase | Database, auth, storage | Stores accounts and financial records |
| Vercel | Hosting | Runs the website and the API |
| Anthropic (Claude) | Receipt and message content at the moment of reading | Reads a receipt or sentence into a draft entry |
| Meta (WhatsApp Cloud API) | Messages to and from the user | The messaging channel |
| Stripe | Payment and card details | Takes subscription and invoice payments. We never see full card numbers |

We do not sell data. We do not share it with anyone outside the list above without the user's instruction.

> **Corrected 9 August 2026: OpenAI was on this list and is not a processor of ours.** It was listed against "voice note audio at the moment of transcription". No OpenAI call exists anywhere in the codebase and none ever did. **Voice notes are transcribed locally, by Whisper running on our own Mac mini**, and the audio is wiped the instant the words come back (`closeVoiceJob` in `lib/voicejobs.ts`). The transcript itself is not stored: only the amount and vendor parsed out of it. Naming a processor we do not use, in the document a customer or the ICO would be handed, overstated where a customer's voice goes. The AI processor we do have is **Anthropic**, and the DPA and transfer paperwork belong with them.

---

## Where data lives and transfers

Supabase and the providers may process data outside the UK. Where that happens it is under the transfer protections those providers offer. Confirm each provider's region and transfer terms and record them here before launch.

---

## How long we keep it

- Active account: for as long as the account is open.
- After closure: financial records are kept for the period UK tax and accounting rules require, then deleted or anonymised.
- Receipt images: kept while the related record is active.
- Voice note audio: **wiped as soon as it is transcribed**, in the same call that closes the job. The transcript is not stored either. Only the amount and vendor parsed out of it reach the books.
- Login attempt records: 90 days, swept nightly. See the assessment above.
- Testimonials: until the customer takes his own down, or asks us to.
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

**What the export actually contains.** `exportUserData` walks a manifest of every table keyed to the user, so a table added later and not added to the manifest is a gap the manifest test catches rather than a gap somebody notices in a subject access request. Receipt images are included as **signed links valid for 7 days** rather than as bytes, and the export distinguishes "he has no receipt images" from "we could not read them", because a silently short export is a worse answer than an honest failure.

**One invariant the erasure depends on.** `deleteUserData` walks the same manifest, children before parents, and folds every result into a single answer, so an erasure can never report success while a sub-delete failed. Two of the tables in that manifest are keyed by the customer's **phone number** rather than his user id, and one of them, `ai_usage.key`, holds the number in plain text. The delete reads the number off his `users` row first, and if there were no number it would skip both tables in silence and still answer "done".

That is safe today for one reason: **a phone number, once set, is never unset anywhere in the product.** There is a bank disconnect; there is no phone disconnect. So an account with no number never had one, and there is nothing being skipped. The day somebody adds a way to unlink a phone, that becomes a live erasure hole with no symptom. `test/datarights.test.mjs` walks the server tree and goes red if any code writes a null `phone_number` onto a users row, so the guard fires on the commit that breaks the invariant rather than on the complaint six months later.

---

## For the ICO registration

When registering and paying the data protection fee, you will describe roughly this: a small business, one to ten staff, turnover under £632,000, processing customer contact details and financial records to provide bookkeeping and tax preparation software, sharing with the hosting, AI, messaging, and payment processors listed above, for the retention periods above. That puts you in the micro tier, £52 a year, or £47 by direct debit.
