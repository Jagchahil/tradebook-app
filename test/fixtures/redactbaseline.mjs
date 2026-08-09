// THE REDACTOR AS IT STOOD BEFORE 9 AUGUST 2026. A FOSSIL, NOT AN IMPLEMENTATION.
//
// ⚠️ NOTHING CALLS THIS AND NOTHING SHOULD. The live redactor is redactPii in lib/supabase.ts
// and test/redactcorpus.test.mjs measures THAT one, through its real call path. This file is
// four regexes kept for one job only: to prove, on every run, that the corpus can tell a
// redactor that leaks from one that does not.
//
// WHY IT IS KEPT AT ALL, WHEN THE SMALLER SURFACE WOULD BE TO DELETE IT.
//
// Without it, the corpus suite asserts "the live function leaks nothing" and that assertion
// passes just as happily if the corpus has quietly stopped testing anything: a broken miss
// detector, a fixture that stopped loading, a harness that reads the wrong field. Green would
// mean either "the redactor is good" or "the suite went blind", and those are not the same
// sentence. Scoring this fossil beside the live one every run separates them. It must leak
// exactly the thirty one rows it leaked on 8 August 2026, held by equality. If the suite goes
// blind, this goes to zero leaks and the run turns red.
//
// It was reduced to exactly this on 9 August 2026, from a file that also carried a full copy of
// the widened function while lib/supabase.ts was reserved to another lane. That copy is gone.
// A second CURRENT implementation is a hazard; a frozen OLD one is a measuring stick, and this
// file can never drift into being mistaken for the first because the test pins its score to the
// old numbers.

// The four rules, exactly as they shipped: email, UK postcode, pound amount, long digit run.
export function redactPiiBeforeWidening(s) {
  return (s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode]')
    .replace(/£\s?\d[\d,]*(\.\d+)?/g, '[amount]')
    .replace(/\b\d{7,}\b/g, '[number]');
}

// What it leaked, measured on 8 August 2026 against test/fixtures/redactcorpus.mjs. Thirty one
// of forty three. Every national insurance number, every sort code, both IBANs, every phone
// number written with a space or a hyphen, three of four cards.
export const LEAKED_BEFORE_WIDENING = [
  'nino-tight', 'nino-spaced', 'nino-lower', 'nino-hyphen', 'nino-suffix-d', 'nino-in-answer',
  'mob-spaced', 'mob-hyphen', 'mob-bracket', 'mob-intl', 'mob-intl-zero', 'mob-in-answer',
  'land-london', 'land-bracket', 'land-hyphen', 'land-five-six',
  'sort-hyphen', 'sort-spaced', 'sort-tight', 'sort-slash', 'sort-in-answer',
  'acct-spaced', 'acct-slash',
  'iban-tight', 'iban-spaced',
  'card-spaced', 'card-hyphen', 'card-amex',
  'amount-bare-comma', 'amount-quid', 'amount-gbp',
];

// And the one ordinary number it already destroyed, which the widening did NOT rescue and
// deliberately does not: a bare nine digit VAT number, eaten by the seven digit rule.
export const ATE_BEFORE_WIDENING = ['vat-bare'];
