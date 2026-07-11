# 09: Front-End Audit (24 June 2026)

A deep review of `tradebook-app` and `tradebook-web`. Every item below was either fixed in code, or
flagged because it needs a backend or account change that cannot be done from the front-end.

---

## Fixed in code

### Web

1. **Waitlist dropped every email.** `/api/waitlist` collected an email on the early access form but
   only ever inserted the phone. Emails were silently lost. The route now stores the email when one is
   given, validates it, and still lets a blank email through.
2. **Waitlist input hardening.** Added phone and email validation, length caps, a JSON parse guard, and
   stopped returning raw database error text to the browser. That text can leak schema details.
3. **Stopped logging personal data.** The route logged the full phone number on every signup. It now
   logs only that a signup happened.
4. **SEO and sharing.** Added page titles and descriptions to the homepage, privacy, and terms pages.
   Before this they had no metadata.
5. **Contrast.** Bumped the lightest grey text on the homepage to meet readability on the off white
   background.

### App

6. **Income vs expense was guessed from the sign of the amount.** Every screen treated a positive
   amount as income and a negative as an expense, ignoring the `transaction_type` column in the
   database. If the WhatsApp webhook stores receipts as positive numbers with a type of `expense`,
   every receipt would have shown as income. There is now one shared rule in `lib/format.ts` that
   trusts `transaction_type` first and falls back to the sign. `getTransactions` now selects
   `transaction_type` and `receipt_url`.
7. **A loss showed as a positive number.** Profit used `Math.abs`, so a loss of 100 displayed as a
   green or indigo `£100.00`. Dashboard and tax now show a real signed figure, turn red on a loss, and
   the tax screen relabels to "Estimated loss".
8. **Tax quarter cut off the last day.** The quarter end was set to midnight of the last day, so any
   transaction logged later that day was excluded. The end is now the end of that day. Also added a
   guard against invalid dates.
9. **Dashboard month mismatch.** The header showed the current month, for example "June 2026", but the
   Income, Expenses, and Profit cards summed every transaction ever. The cards now sum the current
   month so they match the label.
10. **Phone number could become `+4444...`.** If the user typed a number that already had the country
    code, the old code just stuck `+44` on the front. The new normaliser strips a leading `00`, a
    leading `44`, and a leading `0` before adding `+44`.
11. **Returning users got stuck on the welcome screen.** The root layout only redirected signed out
    users. A returning signed in user landed back on the intro every time. It now sends a signed in
    user from the welcome screen straight into the app, without breaking the new signup flow of welcome
    to phone to subscribe to tabs.
12. **Duplication and inconsistent icons.** `formatGBP` was copied into three screens and the category
    emoji logic disagreed between dashboard and transactions. Both now come from `lib/format.ts`.
13. **Accessibility.** Added button roles and labels to the onboarding buttons so screen readers
    announce them correctly.
14. **`phone.tsx` was already rebuilt** in the previous session. It had contained a duplicate of
    `lib/supabase.ts` with no screen component, which would have crashed the route.

All app changes pass `tsc --noEmit` with zero errors. No em dashes, en dashes, or banned brand words
in either repo.

---

## Needs your action (cannot be fixed from the front-end)

### 1. Supabase row level security. This is the important one.

The build notes tell every new table to disable RLS so inserts work. That is a security hole and it
also breaks reads.

- `users` has RLS disabled. The app ships with the public anon key. Anyone who reads that key from the
  app bundle can read or overwrite any user's phone number by id. There is nothing the front-end can do
  about this.
- `transactions` and `monthly_summaries` have RLS on with no policies. That means the app can never
  read real transactions, even once the webhook writes them. Right now this is hidden because
  `getTransactions` treats any error as an empty list.

Recommended fix in Supabase:
- Turn RLS on for `users` and `transactions`.
- Add a policy `auth.uid() = id` on `users` and `auth.uid() = user_id` on `transactions` for select,
  so each person can read only their own rows.
- Do all webhook inserts server side with the service role key, which bypasses RLS. Do not rely on a
  disabled table to make inserts work.

Without this, the dashboard and transactions list will stay empty forever after the webhook goes live.

### 2. WhatsApp webhook signature check

`CLAUDE.md` rule 7 requires validating the `x-hub-signature-256` header on every incoming webhook. That
route is not in this workspace, so I could not verify it. Confirm the check is in place before the
webhook is public. Without it, anyone can post fake receipts to your endpoint.

### 3. Remove the dead `App.tsx`

`tradebook-app/App.tsx` is the old Expo starter screen. The app entry is `index.ts`, so this file is
never used, and it still has the off brand placeholder text. I could not delete it from here due to a
file permission lock. Remove it with `git rm App.tsx` in the repo.

### 4. Waitlist abuse

The route now validates input, but there is still no rate limit. If you see spam signups, add a simple
per IP limit or a captcha on the early access form.

### 5. Environment variables

`lib/supabase.ts` falls back to empty strings if the Supabase URL or key is missing, which fails
quietly. Consider surfacing a clear config error in development so a missing key is obvious.

---

## Checked and fine

- Tax year and quarter maths are correct after the end of day fix.
- The subscribe route is auto discovered by expo router. The phone screen routes to it correctly.
- Sign out returns the user to the welcome screen.
- The waitlist still returns `{ ok: true }` so the existing early access success state works.
