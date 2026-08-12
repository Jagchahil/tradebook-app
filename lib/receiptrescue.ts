// THE TRUNCATED-REPLY RESCUE. A receipt reading that was cut off gives up its LINES, never
// its MONEY.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY, 12 AUGUST 2026. parseReceipt's max_tokens sat at 300 from the days when the reply was
// five fields. On 10 August the prompt gained line_items, one entry per printed line, and
// nobody raised the ceiling to match a field that scales with the length of the paper. A 27
// line till roll's reply was CUT OFF mid array, JSON.parse threw, and a perfectly printed
// receipt was refused twice with "a clearer photograph usually does it". The ceiling is fixed
// in lib/claude.ts (RECEIPT_MAX_TOKENS); this module is the second half: a reply that still
// gets cut off is read for its money fields, which the prompt prints BEFORE line_items, so
// the truncated prefix always carries them.
//
// ⚠️ ONLY WHAT THE MODEL ACTUALLY WROTE IS TAKEN. No amount in the prefix means no rescue,
// because a guess is worse than a retry. A missing VAT stays null and never becomes zero:
// null means the paper did not say, and that distinction is load bearing (see ParsedReceipt
// in lib/claude.ts).
//
// ⚠️ THIS FILE IS PURE AND IMPORTS NOTHING AT RUNTIME, deliberately, so the test suite can
// load it directly under node's type stripping, the same reason lib/waintents.ts stays pure.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Structurally a Partial<ParsedReceipt> from lib/claude.ts, declared locally so this module
// keeps zero runtime imports. If ParsedReceipt gains a field, this stays a valid partial.
export interface RescuedReceipt {
  merchant_name: string;
  amount: number;
  category?: string;
  transaction_type: 'expense';
  transaction_date: string | null;
  vat: number | null;
  line_items: { description: string; amount: number }[];
}

export function rescueTruncatedReceipt(raw: string): RescuedReceipt | null {
  const merchant = /"merchant_name"\s*:\s*"((?:[^"\\]|\\.)+)"/.exec(raw);
  // First match wins, which is the top level amount: the prompt prints it before line_items,
  // so the per line amounts further down can never be mistaken for the total.
  const amount = /"amount"\s*:\s*(\d+(?:\.\d+)?)/.exec(raw);
  if (!merchant || !amount || Number(amount[1]) <= 0) return null;
  const category = /"category"\s*:\s*"([a-z]+)"/.exec(raw);
  const date = /"transaction_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(raw);
  const vat = /"vat"\s*:\s*(\d+(?:\.\d+)?)/.exec(raw);
  return {
    merchant_name: merchant[1],
    amount: Number(amount[1]),
    ...(category ? { category: category[1] } : {}),
    transaction_type: 'expense',
    transaction_date: date ? date[1] : null,
    // No figure in the prefix means the paper's VAT was cut off or never printed. Null is the
    // honest answer either way, and never zero.
    vat: vat ? Number(vat[1]) : null,
    line_items: [],
  };
}
