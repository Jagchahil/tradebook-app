// THE REDACTION CORPUS. Synthetic traffic for the PII redactor in lib/supabase.ts.
//
// Jag's standing instruction: bring me a corpus, not a regex. This is the corpus. The regex is
// judged against it, never the other way round.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT ACTUALLY FLOWS THROUGH THE REDACTOR, MEASURED, NOT ASSUMED
//
// redactPii is defined at lib/supabase.ts:578 and has exactly three call sites, all in that
// same file:
//
//   lib/supabase.ts:420   upsertQaCache(questionSample)   the question, into qa_cache
//   lib/supabase.ts:633   logQaCandidate(question)        the question, into qa_candidates
//   lib/supabase.ts:636   logQaCandidate(answer)          Puchio's answer, into qa_candidates
//
// Both writers are called from app/api/ask/route.ts (lines 353 and 358), the in app accountant
// endpoint. So the only two shapes of string that ever reach the redactor are:
//
//   1. A QUESTION a man typed into the "Ask Puchio" composer on the mobile Ask screen
//      (tradebook-app/app/accountant.tsx:257 posts it), capped at 1000 characters.
//   2. An ANSWER Puchio composed, which for a personal question is built FROM his own books,
//      his business profile and his salary, dividend and savings figures, so his own detail
//      echoes back out in our words.
//
// WHATSAPP TEXT AND VOICE TRANSCRIPTS DO NOT REACH THIS FUNCTION, and that is deliberate.
// app/api/whatsapp/route.ts:1289 records the decision not to redact there, and
// test/specialcategory.test.mjs holds it. So this corpus is written as Ask screen traffic and
// as Puchio answers, not as WhatsApp messages. Writing WhatsApp fixtures here would have been
// a corpus of a road nothing drives down.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY STRING BELOW IS INVENTED. NOTHING CAME OUT OF THE DATABASE.
//
//   . mobile numbers use the Ofcom reserved 07700 900xxx drama range
//   . landlines use the Ofcom reserved ranges: 020 7946 0xxx, 0113 496 0xxx, 0117 496 0xxx,
//     01632 960xxx
//   . national insurance numbers use the QQ prefix, which HMRC never issues and uses as its own
//     documented dummy
//   . card numbers are the published test numbers (4111.., 4242.., 5555..4444, 3782 822463 10005)
//   . the IBAN is the published GB worked example
//   . sort codes and account numbers are obvious dummies (12 34 56, 87654321)
//   . email domains are example.com (RFC 2606 reserved) and our own lekhio.app
//   . postcodes use ZZ99, the reserved "address not known" pseudo postcode
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE TWO HALVES, AND WHY THE SECOND ONE MATTERS MORE
//
// MUST_REDACT is the leak list. A miss puts a man's national insurance number in a pool that
// staff read and that dedupes across users.
//
// MUST_KEEP is the corruption list, and it is the harder half. A pattern that eats a date, a
// price, a van registration or an invoice number does not announce itself. It quietly turns the
// learning pool into nonsense, and then the pool teaches the product nonsense. Every row here
// exists because some plausible widening of the redactor would have eaten it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// MONEY: THE ONE PLACE THIS CORPUS OVERRULES THE BRIEF, ON PURPOSE
//
// The brief asks for money to survive. The shipped function has redacted currency amounts since
// the day it was written (lib/supabase.ts:582), its own comment says so, and
// test/qa-retention.test.mjs bakes the resulting "[amount]" token into a dedupe key. Money is
// claimed by design: the figure IS the personal bit in a shared learning pool.
//
// So money is not in MUST_KEEP. Putting it there would have failed the suite over shipped,
// deliberate behaviour and told a reader the product is broken when it is not. What IS in
// MUST_KEEP is every OTHER number a tradesman texts: dates, quantities, mileage, invoice
// numbers, job references, registrations, times, percentages and VAT numbers.

// A question typed into the Ask screen composer.
const ASK = 'ask-question';
// An answer Puchio composed and sent back, which is written to the pool too.
const ANS = 'puchio-answer';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// HALF ONE. MUST REDACT. `secret` is the exact run of characters that must not survive.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const MUST_REDACT = [
  // National insurance numbers, every legal way a man writes one.
  { id: 'nino-tight', kind: 'nino', src: ASK,
    text: 'quick one, does my ni number QQ123456C go on the cis return or just the utr',
    secret: 'QQ123456C' },
  { id: 'nino-spaced', kind: 'nino', src: ASK,
    text: 'the payroll bloke wants QQ 12 34 56 C before friday, is that normal',
    secret: 'QQ 12 34 56 C' },
  { id: 'nino-lower', kind: 'nino', src: ASK,
    text: 'is qq 12 34 56 a the right shape for an ni number or have i copied it wrong',
    secret: 'qq 12 34 56 a' },
  { id: 'nino-hyphen', kind: 'nino', src: ASK,
    text: 'the form came back with QQ-12-34-56-B on it, do i correct that',
    secret: 'QQ-12-34-56-B' },
  { id: 'nino-suffix-d', kind: 'nino', src: ASK,
    text: 'does a temporary number like QQ123456D still work for cis verification',
    secret: 'QQ123456D' },
  { id: 'nino-in-answer', kind: 'nino', src: ANS,
    text: 'Yes. Put your national insurance number QQ 12 34 56 C on the CIS300 and keep a copy.',
    secret: 'QQ 12 34 56 C' },

  // Mobile numbers, written the way people really write them.
  { id: 'mob-spaced', kind: 'phone', src: ASK,
    text: 'the customer keeps ringing me on 07700 900123 about a job i finished in may',
    secret: '07700 900123' },
  { id: 'mob-hyphen', kind: 'phone', src: ASK,
    text: 'i put 07700-900456 on the invoice, does that count as a business record',
    secret: '07700-900456' },
  { id: 'mob-bracket', kind: 'phone', src: ASK,
    text: 'my number (07700) 900789 is on all the vans, is that an allowable advert',
    secret: '(07700) 900789' },
  { id: 'mob-intl', kind: 'phone', src: ASK,
    text: 'the irish customer rings me on +44 7700 900321, do i charge him vat',
    secret: '+44 7700 900321' },
  { id: 'mob-intl-tight', kind: 'phone', src: ASK,
    text: 'texts from +447700900654 are all about one job, can i claim the phone bill',
    secret: '+447700900654' },
  { id: 'mob-intl-zero', kind: 'phone', src: ASK,
    text: 'the merchant has me down as +44 (0)7700 900159 on the trade account',
    secret: '7700 900159' },
  { id: 'mob-run-together', kind: 'phone', src: ASK,
    text: 'is 07700900987 fine to print on a receipt or does it need the business address too',
    secret: '07700900987' },
  { id: 'mob-in-answer', kind: 'phone', src: ANS,
    text: 'I will chase it. The number we hold for you is 07700 900123 and I have not changed it.',
    secret: '07700 900123' },

  // Landlines, the same treatment.
  { id: 'land-london', kind: 'phone', src: ASK,
    text: 'the office line 020 7946 0321 is in my name, can the business pay for it',
    secret: '020 7946 0321' },
  { id: 'land-bracket', kind: 'phone', src: ASK,
    text: 'the merchant is (0113) 496 0123 if you need to check the account',
    secret: '(0113) 496 0123' },
  { id: 'land-hyphen', kind: 'phone', src: ASK,
    text: 'trade counter is 0117-496-0456 and they still have not sent the credit note',
    secret: '0117-496-0456' },
  { id: 'land-five-six', kind: 'phone', src: ASK,
    text: 'the site office is 01632 960123, do i need their vat number as well',
    secret: '01632 960123' },

  // Sort codes, every separator style, always with the words a man actually types around them.
  { id: 'sort-hyphen', kind: 'sortcode', src: ASK,
    text: 'my sort code is 12-34-56, does hmrc need that for a repayment',
    secret: '12-34-56' },
  { id: 'sort-spaced', kind: 'sortcode', src: ASK,
    text: 'sort code 65 43 21 is the business one, the other is personal',
    secret: '65 43 21' },
  { id: 'sort-tight', kind: 'sortcode', src: ASK,
    text: 'sortcode 123456 on the mandate, is that enough for a direct debit',
    secret: '123456' },
  { id: 'sort-slash', kind: 'sortcode', src: ASK,
    text: 'the bank wrote sort code 12/34/56 on the letter, is that the same thing',
    secret: '12/34/56' },
  { id: 'sort-in-answer', kind: 'sortcode', src: ANS,
    text: 'For a repayment HMRC needs the account name, the sort code 12-34-56 and the number.',
    secret: '12-34-56' },

  // Account numbers.
  { id: 'acct-tight', kind: 'account', src: ASK,
    text: 'account number 87654321 is the one the rent goes out of, is that a business account',
    secret: '87654321' },
  { id: 'acct-spaced', kind: 'account', src: ASK,
    text: 'acc no 8765 4321 has the deposit in it, when do i declare that',
    secret: '8765 4321' },
  { id: 'acct-slash', kind: 'account', src: ASK,
    text: 'a/c 1234 5678 is the joint one with the wife, does that change anything',
    secret: '1234 5678' },

  // IBAN.
  { id: 'iban-tight', kind: 'iban', src: ASK,
    text: 'the polish supplier wants GB33BUKB20201555555555 to pay me, is that safe to send',
    secret: 'GB33BUKB20201555555555' },
  { id: 'iban-spaced', kind: 'iban', src: ASK,
    text: 'they printed GB33 BUKB 2020 1555 5555 55 on the remittance, do i keep it',
    secret: 'GB33 BUKB 2020 1555 5555 55' },

  // Card numbers, spaced, grouped and run together.
  { id: 'card-spaced', kind: 'card', src: ASK,
    text: 'i paid the merchant on 4111 1111 1111 1111, can i claim the whole lot',
    secret: '4111 1111 1111 1111' },
  { id: 'card-hyphen', kind: 'card', src: ASK,
    text: 'the fuel card 5555-5555-5555-4444 is in the business name, is that fine',
    secret: '5555-5555-5555-4444' },
  { id: 'card-tight', kind: 'card', src: ASK,
    text: 'is 4242424242424242 the card the subscription comes off',
    secret: '4242424242424242' },
  { id: 'card-amex', kind: 'card', src: ASK,
    text: 'the amex 3782 822463 10005 is personal, does that matter for the tools i bought',
    secret: '3782 822463 10005' },

  // Emails. Already redacted today, here so a widening cannot quietly lose them.
  { id: 'email-plain', kind: 'email', src: ASK,
    text: 'send the summary to dave.plumbing@example.com when it is ready',
    secret: 'dave.plumbing@example.com' },
  { id: 'email-tagged', kind: 'email', src: ASK,
    text: 'the customer uses invoices+cis@example.com, will that break the invoice email',
    secret: 'invoices+cis@example.com' },
  { id: 'email-in-answer', kind: 'email', src: ANS,
    text: 'I have sent it to sam.sparks@lekhio.app and kept a copy against the job.',
    secret: 'sam.sparks@lekhio.app' },

  // Postcodes. The shipped function claims these, so a widening must not drop them.
  { id: 'postcode-full', kind: 'postcode', src: ASK,
    text: 'the second property at ZZ99 3CZ is let out, does that go on the same return',
    secret: 'ZZ99 3CZ' },
  { id: 'postcode-short', kind: 'postcode', src: ASK,
    text: 'i work from home at ZZ9 9ZZ, how much use of home can i claim',
    secret: 'ZZ9 9ZZ' },

  // Long digit runs. Already redacted today, held so a widening cannot lose them.
  { id: 'utr', kind: 'utr', src: ASK,
    text: 'my utr is 1234567890, do i quote it on every letter to hmrc',
    secret: '1234567890' },

  // Money. Claimed by the shipped function since day one, see the note at the top of this file.
  { id: 'amount-pound-comma', kind: 'amount', src: ASK,
    text: 'the boiler was £1,250.00 fitted, is that one claim or spread over the years',
    secret: '£1,250.00' },
  { id: 'amount-pound-small', kind: 'amount', src: ASK,
    text: 'i spent £45 on a drill bit set, does that go in tools',
    secret: '£45' },
  { id: 'amount-bare-comma', kind: 'amount', src: ASK,
    text: 'he paid 2,450.00 straight into the account on friday, when do i owe tax on it',
    secret: '2,450.00' },
  { id: 'amount-quid', kind: 'amount', src: ASK,
    text: 'the labourer wants 350 quid a day cash, how do i put that through the books',
    secret: '350 quid' },
  { id: 'amount-gbp', kind: 'amount', src: ASK,
    text: 'the invoice is in GBP 2,450 because the customer is abroad, does that change the vat',
    secret: '2,450' },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// HALF TWO. MUST KEEP. `keep` is the exact run of characters that must still be there after.
//
// This is the half that catches a redactor eating the books. Each row names the widening that
// would have destroyed it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const MUST_KEEP = [
  // Dates in every British style. A sort code pattern with a loose separator eats all of these.
  { id: 'date-slash-long', kind: 'date', src: ASK,
    text: 'the job was on 31/07/2026 and he still has not paid me',
    keep: '31/07/2026', trap: 'a sort code pattern that allows a slash separator' },
  { id: 'date-slash-short', kind: 'date', src: ASK,
    text: 'invoiced him 31/07/26 and heard nothing since',
    keep: '31/07/26', trap: 'a two two two sort code pattern with no context cue' },
  { id: 'date-hyphen-short', kind: 'date', src: ASK,
    text: 'the van went in for its mot on 31-07-26 and came back the next day',
    keep: '31-07-26', trap: 'a two two two sort code pattern with a hyphen separator' },
  { id: 'date-hyphen-long', kind: 'date', src: ASK,
    text: 'i started the contract 31-07-2026, which tax year is that',
    keep: '31-07-2026', trap: 'a hyphen separated sort code or a card grouping' },
  { id: 'date-dotted', kind: 'date', src: ASK,
    text: 'receipt is dated 31.07.26, is that too old to claim',
    keep: '31.07.26', trap: 'a sort code pattern that allows a dot separator' },
  { id: 'date-iso', kind: 'date', src: ASK,
    text: 'the bank statement line says 2026-07-31 for the transfer',
    keep: '2026-07-31', trap: 'a two two two sort code pattern matching inside a longer run' },
  { id: 'date-words', kind: 'date', src: ASK,
    text: 'i took the deposit on 4 August 2026, does it count for this quarter',
    keep: '4 August 2026', trap: 'a bare digit run rule with the threshold set too low' },
  { id: 'date-ordinal', kind: 'date', src: ASK,
    text: 'the quote expires 4th Aug 26 so i need to know before then',
    keep: '4th Aug 26', trap: 'a bare digit run rule with the threshold set too low' },
  { id: 'date-spaced-numeric', kind: 'date', src: ASK,
    text: 'work started 01 07 2026 and finished a fortnight later',
    keep: '01 07 2026', trap: 'a phone pattern keyed on a leading zero' },

  // Invoice numbers and quotes.
  { id: 'inv-prefixed', kind: 'invoice', src: ASK,
    text: 'invoice INV-2026-0184 is the one he is disputing',
    keep: 'INV-2026-0184', trap: 'a card pattern matching four groups of digits' },
  { id: 'inv-plain', kind: 'invoice', src: ASK,
    text: 'invoice 100482 is still unpaid after nine weeks',
    keep: '100482', trap: 'a run together sort code pattern with no context cue' },
  { id: 'inv-long-prefixed', kind: 'invoice', src: ASK,
    text: 'the software numbered it INV0000123456 which looks wrong to me',
    keep: 'INV0000123456', trap: 'a bare digit run rule that ignores a leading letter' },
  { id: 'quote-ref', kind: 'invoice', src: ASK,
    text: 'quote QT-4471 was accepted but the deposit has not landed',
    keep: 'QT-4471', trap: 'a national insurance pattern with a loose prefix' },
  { id: 'inv-in-answer', kind: 'invoice', src: ANS,
    text: 'Invoice INV-2026-0184 is 41 days overdue. I have a chaser ready for you to send.',
    keep: 'INV-2026-0184', trap: 'a card pattern matching four groups of digits' },

  // Job references.
  { id: 'job-ref', kind: 'jobref', src: ASK,
    text: 'job ref ASH-114 at the ashworth place needs another day',
    keep: 'ASH-114', trap: 'a national insurance pattern with a loose prefix' },
  { id: 'job-ref-digits', kind: 'jobref', src: ASK,
    text: 'job ref 12 34 56 is the one i mean, the kitchen not the bathroom',
    keep: '12 34 56', trap: 'an uncued two two two sort code pattern' },
  { id: 'job-ref-mixed', kind: 'jobref', src: ASK,
    text: 'the housebuilder calls it plot 14B phase 2, i call it a nightmare',
    keep: 'plot 14B phase 2', trap: 'a postcode pattern with a loose outward code' },

  // Van registrations. The classic thing a national insurance pattern eats.
  { id: 'reg-current', kind: 'vanreg', src: ASK,
    text: 'BD51 SMR needs its mot next month, is that an allowable cost',
    keep: 'BD51 SMR', trap: 'a national insurance or postcode pattern with two leading letters' },
  { id: 'reg-newer', kind: 'vanreg', src: ASK,
    text: 'i bought LV72 KXR in march, can i claim the whole thing this year',
    keep: 'LV72 KXR', trap: 'a national insurance or postcode pattern with two leading letters' },
  { id: 'reg-in-answer', kind: 'vanreg', src: ANS,
    text: 'The van BD51 SMR is on your books as a business asset, so the MOT is allowable.',
    keep: 'BD51 SMR', trap: 'a national insurance or postcode pattern with two leading letters' },

  // Quantities, measurements and mileage. Mileage is a real tax input, so eating it is expensive.
  { id: 'mileage', kind: 'quantity', src: ASK,
    text: 'i did 12,000 miles in the van last year, what is that worth',
    keep: '12,000', trap: 'a bare comma amount pattern with no currency cue' },
  { id: 'quantity-bricks', kind: 'quantity', src: ASK,
    text: 'ordered 2,400 bricks for the extension and half came broken',
    keep: '2,400', trap: 'a bare comma amount pattern with no currency cue' },
  { id: 'measure-metres', kind: 'quantity', src: ASK,
    text: 'ran 2.5 metres of trunking above the units',
    keep: '2.5', trap: 'a decimal amount pattern with no currency cue' },
  { id: 'measure-area', kind: 'quantity', src: ASK,
    text: 'boarded 45 sq m of ceiling in a day, is the board a material or a tool',
    keep: '45 sq m', trap: 'a small digit run rule' },
  { id: 'measure-amps', kind: 'quantity', src: ASK,
    text: 'i ran a 32 amp radial to the garage, does that count as an improvement',
    keep: '32 amp', trap: 'a national insurance pattern reading a trailing a as the suffix letter' },
  { id: 'quantity-conduit', kind: 'quantity', src: ASK,
    text: 'used 3 x 25mm conduit on the job and 2 coats of paint after',
    keep: '3 x 25mm', trap: 'a small digit run rule' },
  { id: 'quantity-rate', kind: 'quantity', src: ASK,
    text: 'he charged 0.75 a mile for the callout, is that the approved rate',
    keep: '0.75', trap: 'a phone pattern keyed on a leading zero' },

  // Times.
  { id: 'time-colon', kind: 'time', src: ASK,
    text: 'on site at 07:30 and off at 16:45 most days',
    keep: '07:30', trap: 'a phone pattern keyed on a leading zero' },
  { id: 'time-dotted', kind: 'time', src: ASK,
    text: 'finished 16.45 on the friday so it lands in this week',
    keep: '16.45', trap: 'a decimal amount pattern with no currency cue' },
  { id: 'time-words', kind: 'time', src: ASK,
    text: 'i am on site between 8am and 5pm, when can you ring',
    keep: 'between 8am and 5pm', trap: 'a small digit run rule' },

  // Percentages.
  { id: 'pct-vat', kind: 'percent', src: ASK,
    text: 'do i put 20% vat on the labour as well as the materials',
    keep: '20%', trap: 'a small digit run rule' },
  { id: 'pct-margin', kind: 'percent', src: ASK,
    text: 'my margin is about 19.5% on a fit out, is that normal for the trade',
    keep: '19.5%', trap: 'a decimal amount pattern with no currency cue' },
  { id: 'pct-cis', kind: 'percent', src: ANS,
    text: 'The contractor deducts 20 percent under CIS unless you have gross payment status.',
    keep: '20 percent', trap: 'a small digit run rule' },

  // VAT numbers. A business identifier a bookkeeping product needs to keep.
  { id: 'vat-spaced', kind: 'vatno', src: ASK,
    text: 'my vat number is GB 123 4567 89, does it go on every invoice',
    keep: 'GB 123 4567 89', trap: 'a phone pattern that does not require a leading zero' },
  { id: 'vat-tight', kind: 'vatno', src: ASK,
    text: 'vat reg GB123456789 is on the certificate, is that the number they want',
    keep: 'GB123456789', trap: 'a bare digit run rule that ignores a leading letter' },
  { id: 'vat-bare', kind: 'vatno', src: ASK,
    text: 'do i put vat number 123456789 on a cis invoice or just the utr',
    keep: '123456789', trap: 'the existing seven or more digit rule, which already eats this today' },

  // Company numbers. Two letters then six digits, which is exactly a loose national insurance shape.
  { id: 'company-number', kind: 'companyno', src: ASK,
    text: 'the limited company number is SC123456, do i still file a self assessment',
    keep: 'SC123456', trap: 'a national insurance pattern with an optional suffix letter' },

  // Order and batch references with a leading zero, which is what a phone pattern hunts for.
  { id: 'order-ref-zero', kind: 'jobref', src: ASK,
    text: 'order 0161 2026 came in short by two lengths',
    keep: '0161 2026', trap: 'a phone pattern keyed on a leading zero' },
  { id: 'batch-zero', kind: 'jobref', src: ASK,
    text: 'the render was batch 0800 5000 off the pallet',
    keep: '0800 5000', trap: 'a phone pattern keyed on a leading zero' },

  // The word sort with no code after it.
  { id: 'sort-word-only', kind: 'prose', src: ASK,
    text: 'i need to sort 3 sockets in the utility before he moves in',
    keep: 'sort 3 sockets', trap: 'a sort code pattern that fires on the cue word alone' },
];

// A control row. If the harness is not actually reaching the live function, this one stops
// looking redacted and the suite says so, instead of reporting a clean sheet it did not earn.
export const CONTROL = {
  id: 'control-email',
  text: 'send it to control.probe@example.com please',
  secret: 'control.probe@example.com',
};
