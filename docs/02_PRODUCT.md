# 02: Product

## The Product Model

**App = the shell.** Onboarding, WhatsApp linking, clean dashboard. Users open it when they want to *see* something. spending this month, tax estimate, a specific transaction. It is the filing cabinet.

**WhatsApp = the engine.** Everything the user *does* happens here. This is where they interact. No context switching. No new habits.

This split is intentional and defensible. WhatsApp has a 98% open rate in the UK. Every WhatsApp confirmation Lekhio sends will be read. That is not true of push notifications, emails, or any other channel.

---

## Phase 0 Product (Web + WhatsApp Only. Build First)

Phase 0 has no native mobile app. It has:
- A WhatsApp Business number receiving messages
- A Next.js webhook processing those messages
- Claude Vision parsing receipts and photos
- Supabase storing transactions
- WhatsApp replies confirming each log
- A simple Next.js web dashboard showing the transaction ledger

This proves the core loop before a line of React Native is written.

---

## Core WhatsApp Flows

### 1. Receipt / Expense Photo
User sends photo of receipt or supplier invoice.

Lekhio:
1. Receives image via webhook
2. Passes to Claude Vision with prompt to extract: amount, vendor, category, date
3. Stores in Supabase `transactions` table
4. Replies: `✓ £83. Screwfix, materials, 23 Jun. Running total June: £1,240.`

If Claude is uncertain: `Got a receipt from what looks like [vendor] for £[amount]. is that right? Reply YES to confirm or tell me what to change.`

### 2. Voice Note Expense
User sends WhatsApp voice note: "Just spent forty quid on petrol, B&Q run."

Lekhio:
1. Receives audio file URL
2. Transcribes via Whisper (or Claude's audio capability)
3. Extracts: £40, fuel/travel, today
4. Stores and replies: `✓ £40. fuel, today. Got it.`

### 3. Text Expense
User texts: "250 for the scaffold hire yesterday"

Lekhio parses, stores, confirms: `✓ £250. scaffold hire, 22 Jun. Logged.`

### 4. Finance Question
User texts: "what do I owe HMRC this quarter"

Lekhio calculates from ledger, replies:
`Based on your income and expenses so far this quarter, your estimated tax liability is approximately £1,840. This is an estimate. your quarterly update is due 5 Aug. Want me to prepare it?`

### 5. Monthly Summary (outbound, user-initiated or scheduled)
`Here's your June summary:
Income: £6,200
Expenses: £1,840
Net profit: £4,360
Estimated tax this quarter: £1,090
Reply SUMMARY for the full breakdown.`

### 6. Quarterly MTD Preparation
Lekhio: `Your Q2 quarterly update is due by 5 Aug. I've prepared it. here's what it says: [summary]. Reply APPROVE to submit, or REVIEW if you want to check first.`

User: `APPROVE`

Lekhio: `Got it. Sending to HMRC now. [confirmation number]. All done.`

---

## WhatsApp Reply Style Guide

Every reply must feel like a smart, sorted mate. not a system notification.

**Rules:**
- Short. Max 3 lines for confirmations.
- Lead with the ✓ tick for confirmations.
- State what was logged: amount, category, date.
- Show running context: monthly total, or "X days until quarterly."
- Never use jargon. Never say "transaction processed" or "record created."
- Use plain British English. "Got it." not "Acknowledged."
- When asking for clarification, ask ONE question only.

**Good:**
`✓ £47. B&Q, materials, today. June total: £2,104.`

**Bad:**
`Your expense of £47.00 has been successfully recorded in the system under category: Materials. Your total expenditure for the month of June 2026 is now £2,104.00.`

---

## Phase 1 App. The 5 Screens

When the native app is built (Phase 1), it needs exactly these screens. No more.

### 1. Onboarding
- Phone number or email sign-up
- Name, trade type (dropdown: electrician, plumber, builder, etc.)
- One screen. Done.

### 2. Connect WhatsApp
- Displays the Lekhio WhatsApp business number
- "Tap to open WhatsApp" button → deep link that opens WhatsApp with a pre-filled first message
- First message = handshake: "Hi Lekhio, I'm [name]": ties their number to their account
- Once sent, screen updates to "Connected ✓"

### 3. Dashboard (Home)
- This month's spend (large number, prominent)
- Estimated tax pot (how much to set aside)
- Last 3 transactions (quick view)
- "Next quarterly update due: X days"
- One-tap to open WhatsApp with Lekhio

### 4. Transactions
- Scrollable list of all logged items
- Filter by month, category
- Tap any transaction to see source (original photo if receipt)
- Edit or delete (rare, but needed)

### 5. Quarterly Summary
- Current quarter income, expenses, net profit
- Estimated tax
- Status: Preparing / Ready for approval / Submitted
- APPROVE button (this is the human-approval gate)
- History of past submissions

---

## Subscription & Onboarding Flow (Phase 1)

1. User downloads app
2. Signs up (phone/email)
3. 30-day free trial starts automatically. no card required
4. On day 27: WhatsApp message "Your free trial ends in 3 days. Subscribe for £12.99/mo to keep everything."
5. Tap link → Stripe checkout → subscribed
6. If not subscribed by day 31: WhatsApp messages stop. Data retained for 90 days. App shows paywall.

**Price: £12.99/month. No annual lock-in at launch. Monthly rolling.**

---

## What Lekhio Does NOT Do

- It does not file tax without explicit user approval
- It does not give advice ("you should claim this"): it reports facts
- It does not access the user's bank account (Phase 2 consideration only)
- It does not send messages to third parties on behalf of the user
- It does not store card details (Stripe handles all payment data)
