-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- WHAT WAS IN THE BASKET. 10 August 2026.
--
-- parseReceipt already reads the whole photograph. Until today it returned the merchant, the
-- total, the category, the date and the VAT, and threw away every line on the paper.
--
-- 🔴 THE ARGUMENT FOR ADDING THIS BEFORE LAUNCH RATHER THAN WHEN SOMETHING NEEDS IT: the data is
-- PERISHABLE. Receipt images leave as 7 day signed links, they are deleted on erasure, and nobody
-- is ever going to re-process half a million photographs. Every receipt captured without this
-- column is permanently reduced to "Screwfix, £47.20" with no record of what was bought. The
-- model is already looking at the paper; reading the lines costs nothing extra today and cannot
-- be bought back later at any price.
--
-- ⚠️ NOTHING READS THIS COLUMN YET, AND THAT IS FINE. It is captured, stored and left alone. What
-- it unlocks, when somebody builds it:
--   1. CAPITAL ALLOWANCES. A £340 Screwfix receipt holding a £280 SDS drill is a capital purchase
--      hiding inside a consumables total. MTD software's documented blind spot is losing exactly
--      these, and no total can ever reveal one.
--   2. CATEGORISATION THAT IS ACTUALLY RIGHT. One receipt is very often two categories: materials
--      and a sandwich, tools and fuel. One category per receipt is an error we have tolerated only
--      because the lines were being discarded.
--   3. WHAT HE ACTUALLY BUYS, which is the only honest basis for ever helping him buy it better.
--
-- ⚠️ AND IT IS MORE INTRUSIVE THAN A TOTAL, WHICH IS WHY IT IS RECORDED IN THE DATA INVENTORY.
-- "Spent £47.20 at Screwfix" and "bought a 2.5mm twin and earth, a box of 45 grommets and a
-- sandwich" are different facts about a person. Retention, erasure and the export all reach it
-- for free because it is a column on transactions, which the manifest already walks.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.transactions
  add column if not exists line_items jsonb;

comment on column public.transactions.line_items is
  'What was printed on the receipt, as read by the vision model: [{description, amount}]. NULL means '
  'we never looked or the paper was not itemised, and that is deliberately different from an empty '
  'array. Never reconciled against amount: real receipts carry discounts, deposits and multi-buys, '
  'so lines that do not sum to the total are normal and prove nothing. The total is the money; '
  'these are a description of the basket. Added 10 August 2026, read by nothing yet.';

-- No index. Nothing queries it yet, and an index on a jsonb column nobody reads is a write cost
-- for a read that never happens. Add a GIN index the day something actually searches it.

notify pgrst, 'reload schema';
