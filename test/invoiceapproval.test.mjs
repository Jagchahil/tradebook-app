// Tests the approval gate on the WhatsApp invoice flow, and that a VAT registered
// trader is never quietly invoiced for with no VAT.
//
// THE DEFECT THIS SUITE GUARDS AGAINST.
// The WhatsApp flow used to parse a line of text with the AI, create the invoice,
// and EMAIL IT TO THE CUSTOMER in the same turn. The first time the tradesman saw
// what the AI had read off his message was after his customer already had it. A
// misread amount reached a third party with no chance to catch it, and an invoice
// cannot be unsent. Giving an email address up front is consent to a send; it is
// not approval of these figures.
//
// The web surface never did this, and says why in app/api/invoices/route.ts:
// "a message to another human being always asks, and on this surface the send
// button is his". CLAUDE.md states the rule plainly: build the approval gate
// before the automation it guards, no exceptions. The primary surface was the one
// breaking it.
//
// Second defect, same flow: createInvoice was called with no vat object, so every
// WhatsApp invoice carried tax 0 and a null treatment. For a CIS subcontractor
// under the reverse charge that is accidentally right. For a VAT registered trader
// on standard rated work for an end user it understates the VAT he must account
// for, on a document his customer books. The four questions the web form asks
// cannot be invented from one line of text, so that path now refuses and hands him
// the form.
//
//   node test/invoiceapproval.test.mjs

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const src = readFileSync(path.join(repoRoot, 'app', 'api', 'whatsapp', 'route.ts'), 'utf8');

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// Slice the invoice flow out, so a send somewhere else in this large file cannot
// make the suite pass or fail by accident.
const flowStart = src.indexOf('async function handleInvoiceFlow');
const flowEnd = src.indexOf('\n// --- Guided', flowStart);
const flow = src.slice(flowStart, flowEnd === -1 ? src.length : flowEnd);

const iItems = flow.indexOf("session.step === 'items'");
const iConfirm = flow.indexOf("session.step === 'confirm'");
const iCreate = flow.indexOf('createInvoice(');
const iVat = flow.indexOf('readVatProfile(');

console.log('\nNothing reaches his customer until he has seen the figures and said so.\n');

ok('the invoice flow was found (the pin is watching real code)', flow.length > 800);
ok('there is a confirm step', iConfirm !== -1);
ok('the confirm step comes after the items step', iItems !== -1 && iConfirm > iItems);

// The load bearing assertion: every send of the invoice email sits in the confirm
// step, never in the step that parses his words and creates the invoice.
{
  const sends = [];
  let i = flow.indexOf('sendInvoiceEmail(');
  while (i !== -1) { sends.push(i); i = flow.indexOf('sendInvoiceEmail(', i + 1); }
  ok('the flow does still send an invoice email somewhere', sends.length > 0);
  ok('EVERY invoice email send happens after the confirm step begins', sends.length > 0 && sends.every((s) => s > iConfirm));
  const itemsBlock = flow.slice(iItems, iConfirm === -1 ? flow.length : iConfirm);
  ok('the items step, which parses his text and creates the invoice, sends nothing', !itemsBlock.includes('sendInvoiceEmail('));
  ok('the items step does still create the invoice as a draft', itemsBlock.includes('createInvoice('));
}

// Silence, or a shrug, is not approval.
{
  const confirmBlock = flow.slice(iConfirm);
  ok('the confirm step requires an explicit affirmative before sending', /\/\^\(send\|yes/.test(confirmBlock));
  ok('an unrecognised reply re-asks instead of sending', /Nothing has gone to them yet|stay on this step/.test(confirmBlock));
  ok('he can correct the figures instead of sending', /change\|redo\|again/.test(confirmBlock));
  ok('a failed send tells him it did NOT go, rather than claiming success', /has NOT gone to them/.test(confirmBlock));
}

// VAT: refuse rather than guess.
console.log('\nA VAT registered trader is never invoiced for with a guessed VAT position.\n');
{
  ok('the flow reads the VAT profile', iVat !== -1);
  ok('the VAT profile is read BEFORE the invoice is created', iVat !== -1 && iCreate !== -1 && iVat < iCreate);
  const vatBlock = flow.slice(iVat, iCreate);
  ok('a registered trader is refused this surface and sent to the form', /vatProfile\.registered/.test(vatBlock) && /app\/invoices\/new/.test(flow));
  ok('an unreadable VAT profile also refuses, rather than defaulting to no VAT', /if \(!vatProfile\)/.test(vatBlock));
}

// House style, since this is customer facing copy.
{
  const copy = flow.match(/'[^']{20,}'/g) || [];
  ok('no em dash or en dash in the flow copy', !copy.some((c) => /[‒-―−]/.test(c)));
  ok('no rival domain anywhere in the flow', !new RegExp('lekhio' + '\\.com').test(flow));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
