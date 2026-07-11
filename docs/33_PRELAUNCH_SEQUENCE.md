# 33: Pre-Launch Sequence, the order to actually do it

> ## ⚠️ ENTITY NAMES IN THIS DOC ARE UNRELIABLE. CORRECTED 11 JULY 2026.
>
> **Two things happened to this doc and you need both before you read a word of it.**
>
> **1. Jag dropped the Satluj name on 11 July 2026.** There is no Satluj Ventures and there will not be one. **The only real entity is LEKHIO LTD, company number 17329341**, incorporated 8 July 2026, with Jag holding the shares personally. Doc 92 is explicit and it is what was actually filed: one shareholder, one class of ordinary shares, **no holding company**. A holding company may exist later and would be called **Lekhio Group**. It does not exist today.
>
> **2. A find and replace on 11 July damaged the entity names below.** A sweep replaced "Satluj Ventures" with "Lekhio Ltd" without reading the context, so in places where this doc meant the HOLDING company it now says "Lekhio Ltd", which is the TRADING company. Some sentences are therefore self referential nonsense ("Lekhio Ltd is a holding company that owns the shares of Lekhio Ltd"). The docs were not in git, so there was nothing to restore from.
>
> **Read every "Lekhio Ltd" below with suspicion.** Where it is clearly the parent, it means "a holding company, not yet named and not yet formed". Where it is clearly the trading company, it means LEKHIO LTD 17329341.
>
> **Nothing in this doc is filed, registered, or committed.** It is thinking. The only company that exists is Lekhio Ltd. Before acting on any structure here, get it from the accountant, not from this file.



> One ordered runbook from where you are now to live. Based on your plan, with the dependencies fixed so nothing blocks anything else. Tick top to bottom. The slow, accountant-led structure work runs in the background and never holds up launch. Costs confirmed June 2026.

---

## The principle

Two tracks run at once.

- **The launch track** (everything below) gets the product live. It is fast and mostly free.
- **The structure track** (the holdco and moving Ecom in, with the accountant and HMRC clearance) is slow and runs in the background. It does **not** gate launch. You launch trading as **Lekhio Ltd** and tidy the group around it later.

---

## Phase A. Foundations (do first, mostly parallel)

1. **Buy the domain.** lekhio.app and lekhio.co.uk. About £12 a year. Everything else points at this, so it is genuinely first.
2. **Set up email on the domain.** support@, hello@, privacy@lekhio.app. Free forwarding (Cloudflare Email Routing) into your inbox is fine to launch. You need this for the ICO, Stripe, the bank, and the social signups.
3. **Incorporate Lekhio Ltd.** About £100 at Companies House, fast, online. This is your trading entity for launch. Do it now so Stripe, the bank, and contracts are all in the company name.
   - **In parallel, start the accountant.** Hand them the brief (Accountant_Brief.md) for the Satluj holdco and the Ecom reorg. This runs in the background for weeks. It does not block anything below.
4. **Pay the ICO data protection fee.** £52, slightly less by direct debit. Legal must-do because you handle financial and personal data. Quick.
5. **Open a business bank account.** Tide, Starling, or Mettle, free, in the Lekhio Ltd name. Stripe needs it to pay you out.

---

## Phase B. Switch the product on

6. **Point the domain at Vercel** and set `NEXT_PUBLIC_APP_URL` to https://lekhio.app. Swap the placeholder URLs in the app.
7. **Upgrade Vercel to Pro.** About £16 a month. Needed for function time and cron at scale.
8. **Run the database.** Paste all of `supabase/schema.sql` into the Supabase SQL editor. Safe to re-run.
9. **Load API credit and keys, then redeploy after each:**
   - **Anthropic**, add 5 to 10 dollars, create the key, set `ANTHROPIC_API_KEY`. This is the receipt brain.
   - **WhatsApp (Meta)**, create the app, set the webhook to https://lekhio.app/api/whatsapp, add the four WhatsApp env vars.
   - **OpenAI Whisper** (optional, for voice notes), add a little credit and the key.
   - **Stripe**, add `STRIPE_SECRET_KEY` and the webhook secret. Test mode first.
   - **`CRON_SECRET`**, set it, and point a free external cron (cron-job.org) at the reminder URLs.

---

## Phase C. Prove it, the gate before launch

10. **Run the full end-to-end test.** This is the gate. Do not launch until every line passes:
    - Sign in on the app, land on the dashboard.
    - WhatsApp a receipt photo, get the confirmation, see it in the app.
    - Send a voice note expense, it logs.
    - Type an expense and an income line, both log.
    - Text a reminder, it lands in the diary and fires.
    - Prepare and approve a tax summary.
    - Create an invoice, pay it with the Stripe test card 4242 4242 4242 4242, it flips to paid once.
    - Hit the cron URL with the secret, it returns ok.

---

## Phase D. Accounts and launch

11. **Create the social accounts** and connect them to Buffer (use Account_Setup_Kit, doc 32). Secures the handles. No posting yet, so this never holds up the product. Can be done anytime in Phase A to C.
12. **Launch.** Flip Stripe to live, move to your real WhatsApp number, and begin: your in-person cards and the organic engine I run. Nothing public on social until you say we are bulletproof.

---

## The money, totalled to be live

| Item | Cost |
|---|---|
| Domain (.com + .co.uk) | ~£12 / yr |
| Incorporate Lekhio Ltd | ~£100 |
| ICO data protection fee | £52 |
| Business bank | Free |
| Email forwarding | Free |
| Anthropic credit | ~£5 to start |
| Vercel Pro | ~£16 / mo |
| Stripe, OpenAI, WhatsApp | Pay as you go |

Bare minimum to be live and legal is roughly **£185 plus Vercel Pro**, most of it the one-off company incorporation. The structure track (accountant fees, the Ecom reorg, the trademark) follows as revenue allows and does not block launch.

---

## What I need from you at the end

The final **handle** and the live **trial link**, and the word that we are bulletproof. Then the social engine goes from filling the bank to publishing. Everything else above is yours to action, and I will keep the content bank growing in the meantime.
