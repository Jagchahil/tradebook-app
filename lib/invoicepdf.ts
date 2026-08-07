// lib/invoicepdf.ts. The invoice as a file, laid out once.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SAME DOCUMENT AS app/invoice/[id]/page.tsx, AND THAT IS THE ONLY RULE THAT MATTERS.
//
// There are now two ways for a customer to see an invoice: the page his link opens, and the file
// the tradesman forwards on WhatsApp. Those are two renderings and there must never be two
// documents. The lender documents drifted apart in July because two surfaces each did their own
// arithmetic, and the fix was one shared source of the figures. This file makes the same promise
// the cheap way: it takes the SAME PublicInvoice row and prints the SAME fields, and
// test/invoicepdf.test.mjs reads the produced file back and checks it against the page's own
// rules rather than against my intentions.
//
// 🔴 WHAT MUST BE ON A VAT INVOICE IS LAW, NOT LAYOUT. VAT Regulations 1995 reg 14: the
// supplier's name, address and VAT number, an identifying number, the tax point, the customer's
// name, a description, the rate, the amount before VAT and the VAT. The page carries them all and
// so does this. Anything moved or dropped here is not a design decision, it is a defective
// invoice, and the man who sent it carries that and not us.
//
// ⚠️ AND vat_treatment === null IS THE OLD WORLD. An invoice raised before the product knew about
// VAT prints with no rate, no VAT line and no VAT number, exactly as it printed on the day it was
// sent. A customer may have paid it and filed it. Reprinting it with figures it never had would
// hand two different papers for one transaction to an accounts payable department.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { PdfDoc, wrapText, A4_WIDTH } from './pdf';
import { rateLabel, isVatRateKey } from './vat';
import type { PublicInvoice } from './supabase';

const MARGIN = 48;
const RIGHT = A4_WIDTH - MARGIN;
const BOTTOM = 780;

// Money on a document a customer pays from always shows its pence. The summary screens round;
// paper does not. Same rule the public page states at length.
function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateWords(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ⚠️ THE RATE LABEL COMES FROM lib/vat.ts, NOT FROM HERE. `rate` is a rate KEY, not a number,
// and the page prints it through the same function. Two files each turning a key into words is
// two files that can disagree about what "exempt" says on a document a customer files.
function rateWords(rate: unknown): string {
  return isVatRateKey(rate) ? rateLabel(rate) : '';
}

export const REVERSE_CHARGE_NOTE =
  'Reverse charge: VAT Act 1994 Section 55A applies. The customer is to account for the VAT to HMRC.';

export function invoiceFileName(invoice: Pick<PublicInvoice, 'number'>): string {
  // ⚠️ NO CUSTOMER NAME IN THE FILE NAME. It is forwarded through WhatsApp, where the name of the
  // file is visible in a chat list to anybody holding the phone, and one tradesman's customer
  // list is not something we put on a lock screen.
  const safe = String(invoice.number || 'invoice').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe || 'invoice'}.pdf`;
}

export function buildInvoicePdf(invoice: PublicInvoice): Buffer {
  const carriesVat = invoice.vat_treatment === 'charged' || invoice.vat_treatment === 'reverse_charge';
  const reverseCharge = invoice.vat_treatment === 'reverse_charge';
  const doc = new PdfDoc(`Invoice ${invoice.number}`);
  let page = doc.addPage();
  let y = MARGIN + 12;

  // Anything that would run off the foot of the sheet starts a new one instead. A figure sliced
  // in half by the edge of the paper is the failure this guards.
  const room = (need: number): void => {
    if (y + need <= BOTTOM) return;
    page = doc.addPage();
    y = MARGIN + 12;
  };

  // ── Who it is from, and what it is ────────────────────────────────────────────────────────
  page.text(MARGIN, y, 'INVOICE', { size: 22, font: 'bold' });
  page.textRight(RIGHT, y, invoice.business_name || '', { size: 12, font: 'bold' });
  y += 18;
  for (const line of String(invoice.business_address || '').split(/\s*,\s*/).filter(Boolean)) {
    page.textRight(RIGHT, y, line, { size: 9, grey: 0.4 });
    y += 12;
  }
  if (invoice.business_contact) {
    page.textRight(RIGHT, y, invoice.business_contact, { size: 9, grey: 0.4 });
    y += 12;
  }
  if (carriesVat && invoice.business_vrn) {
    page.textRight(RIGHT, y, `VAT number ${invoice.business_vrn}`, { size: 9, grey: 0.4 });
    y += 12;
  }

  y = Math.max(y, MARGIN + 54);
  page.line(MARGIN, y, RIGHT, y);
  y += 22;

  // ── Who it is to, and when ────────────────────────────────────────────────────────────────
  page.text(MARGIN, y, 'Billed to', { size: 9, grey: 0.45 });
  page.textRight(RIGHT, y, `Invoice ${invoice.number}`, { size: 9, grey: 0.45 });
  y += 14;
  page.text(MARGIN, y, invoice.customer_name || 'Customer', { size: 12, font: 'bold' });
  // The tax point is the date the law names on a VAT invoice. On anything else it is the issue
  // date, and the label says which so nobody has to guess what the date means.
  const dateValue = (carriesVat ? invoice.tax_point : null) || invoice.issued_date;
  page.textRight(RIGHT, y, `${carriesVat ? 'Tax point' : 'Issued'} ${dateWords(dateValue)}`, { size: 10 });
  y += 14;
  if (invoice.customer_contact) {
    page.text(MARGIN, y, invoice.customer_contact, { size: 9, grey: 0.4 });
  }
  if (invoice.due_date) {
    page.textRight(RIGHT, y, `Due ${dateWords(invoice.due_date)}`, { size: 10, grey: 0.35 });
  }
  y += 30;

  // ── The work ──────────────────────────────────────────────────────────────────────────────
  const amountX = RIGHT;
  const rateX = RIGHT - 90;
  const descWidth = (carriesVat ? rateX - 12 : amountX - 70) - MARGIN;

  page.text(MARGIN, y, 'Description', { size: 9, grey: 0.45 });
  if (carriesVat) page.textRight(rateX, y, 'Rate', { size: 9, grey: 0.45 });
  page.textRight(amountX, y, 'Amount', { size: 9, grey: 0.45 });
  y += 8;
  page.line(MARGIN, y, RIGHT, y);
  y += 16;

  for (const li of invoice.line_items || []) {
    const lines = wrapText(String(li.description ?? ''), descWidth, 10);
    room(lines.length * 13 + 10);
    const top = y;
    lines.forEach((text, i) => {
      page.text(MARGIN, y + i * 13, text, { size: 10 });
    });
    if (carriesVat) page.textRight(rateX, top, rateWords(li.rate), { size: 9, grey: 0.4 });
    page.textRight(amountX, top, gbp(Number(li.amount ?? 0)), { size: 10, font: 'bold' });
    y = top + lines.length * 13 + 8;
    page.line(MARGIN, y, RIGHT, y, { grey: 0.9 });
    y += 14;
  }

  // ── The totals, which never split across a page ───────────────────────────────────────────
  room(carriesVat ? 70 : 40);
  if (carriesVat) {
    page.text(RIGHT - 200, y, 'Total before VAT', { size: 10, grey: 0.4 });
    page.textRight(amountX, y, gbp(invoice.subtotal), { size: 10 });
    y += 15;
    page.text(RIGHT - 200, y, reverseCharge ? 'VAT charged' : 'VAT', { size: 10, grey: 0.4 });
    page.textRight(amountX, y, gbp(invoice.tax), { size: 10 });
    y += 15;
  }
  page.line(RIGHT - 220, y, RIGHT, y);
  y += 18;
  page.text(RIGHT - 200, y, 'Total', { size: 13, font: 'bold' });
  page.textRight(amountX, y, gbp(invoice.total), { size: 15, font: 'bold' });
  y += 30;

  // 🔴 THE FIGURE THAT IS ON THE DOCUMENT AND NOT IN THE TOTAL. Under the domestic reverse
  // charge the customer accounts for the VAT to HMRC. It must appear, and it must never be added
  // to the amount he is asked to pay. VATREVCON37100.
  if (reverseCharge) {
    room(58);
    page.text(MARGIN, y, 'VAT to be accounted for by the customer', { size: 10, font: 'bold' });
    page.textRight(RIGHT, y, gbp(invoice.reverse_charge_vat), { size: 10, font: 'bold' });
    y += 14;
    for (const line of wrapText(REVERSE_CHARGE_NOTE, RIGHT - MARGIN, 9)) {
      page.text(MARGIN, y, line, { size: 9, grey: 0.4 });
      y += 11;
    }
    y += 10;
  }

  if (invoice.notes) {
    room(40);
    page.text(MARGIN, y, 'Notes', { size: 9, grey: 0.45 });
    y += 13;
    for (const line of wrapText(invoice.notes, RIGHT - MARGIN, 9)) {
      room(12);
      page.text(MARGIN, y, line, { size: 9, grey: 0.35 });
      y += 11;
    }
  }

  return doc.build();
}
