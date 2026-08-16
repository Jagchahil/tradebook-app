-- APPLY_2026-08-16_invoice_baseline.sql
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- F9. THE INVOICE WAS BUILT TO THE VAT RULES AND NEVER TO THE ONES THAT APPLY TO EVERYBODY.
--
-- app/invoice/[id]/page.tsx opens with twenty lines on VAT Regulations 1995 reg 14 and implements
-- it carefully, including the reverse charge case where the VAT is shown and deliberately kept
-- out of the total. That is the HARDER standard and it is done well. Reg 14 applies to the
-- minority of customers who are VAT registered.
--
-- GOV.UK, "Invoices: what they must include", applies to all of them, and two of its bullets were
-- missing from every invoice this product has ever produced:
--
--     the company name and address of the customer you are invoicing    NAME ONLY
--     the date the goods or service were provided (supply date)         ABSENT
--
-- Neither field existed anywhere. The tax point is the supply date and the product holds one, but
-- it is written as "today" at creation and only ever SHOWN to a VAT registered business.
--
-- ⚠️ WHY supply_date IS A NEW COLUMN AND NOT A REUSE OF tax_point. They are the same date most of
-- the time and they are not the same thing. The tax point is a VAT figure with its own rules: the
-- basic tax point is the supply, but issuing an invoice within 14 days creates an actual tax point
-- at the invoice date instead. Writing "the day the work was done" into tax_point would silently
-- restate a legal figure on documents that are already sent and already filed, to fix a bullet
-- that is not about VAT at all. Two columns, two meanings, and the document prints both.
--
-- BOTH COLUMNS ARE NULLABLE AND THERE IS NO BACKFILL, ON PURPOSE. An invoice raised before today
-- must print exactly as it printed on the day it was sent, which is the rule already written at
-- the top of app/invoice/[id]/page.tsx for vat_treatment. A customer may have paid it and filed
-- it, and a document does not get to change afterwards. So an old row carries null and renders
-- with no supply line and no customer address, exactly as it always has, and only invoices made
-- from today carry the fields the law asks for.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

alter table public.invoices add column if not exists customer_address text;
alter table public.invoices add column if not exists supply_date date;

comment on column public.invoices.customer_address is
  'The customer address, printed on the document. GOV.UK, Invoices: what they must include. Null on every invoice raised before 16 August 2026 and never backfilled.';

comment on column public.invoices.supply_date is
  'The date the work was done. GOV.UK calls this the supply date and asks for it on every invoice. NOT the tax point, which is a VAT figure with its own 14 day rule and keeps its own column.';

-- Read it back. Both flags should be true, and the counts are the old world you are not touching.
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'customer_address') = 1
    as customer_address_exists,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices' and column_name = 'supply_date') = 1
    as supply_date_exists,
  (select count(*) from public.invoices) as invoices_total,
  (select count(*) from public.invoices where supply_date is null) as invoices_without_supply_date;
