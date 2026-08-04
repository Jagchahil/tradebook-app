// FREE MTD FILING MAGNET — the page only, per the 23 July instruction: build the page and its lead
// capture, do NOT build the filing tool itself. This suite guards two separate things:
//
//   1. FREE TOOL LEAD CAPTURE (board card, "Growth foundation") turned out to already be built and
//      wired into all 7 tools named in the build prompt, discovered while starting this task, not
//      done here. This suite confirms that finding on the source, so the board can be corrected
//      without re-doing work that already exists.
//
//   2. THE NEW PAGE must stay honest (doc 103, the honesty test): no fake calculator, no button
//      that pretends to file something that is not built. The only working control on the page is
//      the email capture, and it must say plainly that this is not live yet.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nfree MTD filing magnet: the page, not the tool');

// ---------------------------------------------------------------------------------------------
// 1. Free tool lead capture — already built, confirmed here, not re-done.
// ---------------------------------------------------------------------------------------------

const CAPTURED_TOOLS = [
  ['app/tax-calculator/Calc.tsx', 'tax-calculator'],
  ['app/cis-calculator/Calc.tsx', 'cis-calculator'],
  ['app/ni-checker/Calc.tsx', 'ni-checker'],
  ['app/student-loan-checker/Calc.tsx', 'student-loan-checker'],
  ['app/rent-a-room-checker/Calc.tsx', 'rent-a-room-checker'],
  ['app/landlord-tax-calculator/Calc.tsx', 'landlord-tax-calculator'],
  ['app/invoice-generator/Generator.tsx', 'invoice-generator'],
  // 🔴 /how-mtd-works JOINED THE FAMILY ON 4 AUGUST and had been the odd one out for months: a
  // real checker a stranger could drag, with none of the machinery that makes a free tool pay.
  // Note the file is the PAGE, not a Calc.tsx: the control is a range input driven by a vanilla
  // script rather than a React component, because this page ships no client bundle of its own.
  ['app/how-mtd-works/page.tsx', 'how-mtd-works'],
];

for (const [file, source] of CAPTURED_TOOLS) {
  const src = read(file);
  ok(`${source} already renders LeadCapture with its own source tag`,
    src.includes('<LeadCapture') && new RegExp(`source=["']${source}["']`).test(src));
}

const leadCaptureSrc = read('components/LeadCapture.tsx');
ok('LeadCapture posts to /api/lead, the real consent-gated CRM capture endpoint',
  /fetch\('\/api\/lead'/.test(leadCaptureSrc));
ok('LeadCapture never sends without explicit consent (unticked by default)',
  /useState\(false\)/.test(leadCaptureSrc) && /consent: true/.test(leadCaptureSrc) && /if \(!consent\)/.test(leadCaptureSrc));

// ---------------------------------------------------------------------------------------------
// 2. The new page: honest, and only the capture actually works.
// ---------------------------------------------------------------------------------------------

const pageSrc = read('app/free-mtd-filing/page.tsx');

ok('the page uses the shared LeadCapture component, not a bespoke form',
  /import LeadCapture from '\.\.\/\.\.\/components\/LeadCapture'/.test(pageSrc)
  && /<LeadCapture[\s\S]{0,60}source="free-mtd-filing"/.test(pageSrc));

ok('there is no calculator input for profits or losses anywhere on the page (the tool is NOT built)',
  !/type="number"/.test(pageSrc) && !/<input/.test(pageSrc.replace(/\/\/.*$/gm, '')));

ok('the copy tells the reader plainly it is not live yet, not just "coming soon" as decoration',
  /is not live yet/.test(pageSrc));

ok('the copy never claims Lekhio files tax without approval, matching doc 104 wording elsewhere on the site',
  /filingFaqAnswer/.test(pageSrc) && /We PREPARE\. You APPROVE\./.test(pageSrc));

ok('the honest scope boundary is stated: basic profit and loss only, not property/VAT/PAYE-alongside',
  /Property income, a PAYE job alongside your trade, VAT/.test(pageSrc));

ok('no AI claim is made for THIS path specifically (it is what makes it free)',
  /No AI in this path/.test(read('app/free-mtd-filing/page.tsx')) || /does not\. It is a fully deterministic engine/.test(pageSrc));

ok('an FAQPage schema is present for SEO, same pattern as the other tool pages',
  /'@type': 'FAQPage'/.test(pageSrc));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "SAME PATTERN AS THE OTHER TOOL PAGES" WAS ASSERTED OF ONE PAGE AND OF NO OTHER.
//
// The line above tested /free-mtd-filing and nothing else, so on 4 August a sabotage pass tore the
// FAQPage schema clean off /how-mtd-works and all 157 suites stayed green. That is the same shape
// as the CSS comment guard that named the three files it had just fixed: a claim about a FAMILY,
// checked on one member.
//
// A missing schema is quiet in exactly the way that matters. Nothing breaks, no page looks wrong,
// and the tool simply stops being eligible for the rich result it was built to win. These pages
// exist to be found by a stranger with a question, so the schema IS the feature.
//
// ⚠️ THE LIST IS DERIVED FROM CAPTURED_TOOLS, not typed out again, so a tool added there is
// covered here on the same line and cannot be added to one list and forgotten in the other.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE LIST ITSELF WAS STILL A RECEIPT. DERIVED FROM freeTools NOW, NOT TYPED OUT.
//
// The first widening on 4 August took this sweep from one page to eight and immediately found
// /invoice-generator had never had a schema. The eight were still hand typed, and pinned at eight,
// which locks a coverage claim at the size it happened to be on the day it was written. The real
// population is app/_shared/site.tsx's exported freeTools, the array that draws the footer column
// and the /resources grid, and it has ELEVEN entries. Reading it here found /can-i-claim, the most
// question shaped page on the site, with no structured data at all.
//
// ⚠️ THE POINT OF READING THE EXPORT IS THAT ADDING A TOOL CANNOT MISS THIS. A tool put in
// freeTools appears in the footer, in /resources and in this sweep on the same line, which is the
// difference between a list that describes the product and a list that describes one afternoon.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const toolHrefs = [...read('app/_shared/site.tsx')
  .slice(read('app/_shared/site.tsx').indexOf('export const freeTools'))
  .matchAll(/\{ href: '(\/[a-z0-9-]+)'/g)].map((m) => m[1]);
ok(`🔴 the tool list is READ from freeTools, and it found ${toolHrefs.length} of them`,
  toolHrefs.length >= 11 && toolHrefs.includes('/can-i-claim') && toolHrefs.includes('/how-mtd-works'));

const beforeFamily = pass + fail;
for (const href of toolHrefs) {
  const page = `app${href}/page.tsx`;
  const src = read(page);
  ok(`${href} carries an FAQPage schema`, /'@type': 'FAQPage'/.test(src));
  ok(`...and renders it, rather than declaring one nothing reads`,
    /ld\+json/.test(src) && /JSON\.stringify\(faqSchema\)/.test(src));
}
ok(`🔴 and THAT sweep really ran, two checks on each of the ${toolHrefs.length} tools`,
  pass + fail - beforeFamily === toolHrefs.length * 2);

// ⚠️ THE LEAD CAPTURE SWEEP BELOW STAYS ON ITS OWN LIST, and that is not the same mistake. It
// names the FILE the component is rendered from, which is a Calc.tsx for most tools and the page
// itself for two, so it cannot be derived from an href. Its own count guard is below it.
// ⚠️ AND THE LOOP IS PROVED BY WHAT IT DID, NOT BY WHAT IT WAS GIVEN.
//
// The first version of this asserted CAPTURED_TOOLS.length === 8, and a sabotage pass pointed the
// loop at [] instead: the length was still 8, so the assertion still passed, and sixteen checks
// simply never happened. A sweep that iterates nothing passes every assertion it never makes. That
// is the same hole the CSS comment guard had on 4 August, when it shipped green over 2,880 live
// bytes, and a count of the INPUT does not close it. A count of the OUTPUT does.
const beforeSweep = pass + fail;
for (const [file] of CAPTURED_TOOLS) {
  const page = file.replace(/\/(Calc|Generator)\.tsx$/, '/page.tsx');
  const src = read(page);
  ok(`${page.replace('/page.tsx', '').replace('app/', '')} carries an FAQPage schema too`,
    /'@type': 'FAQPage'/.test(src));
  ok(`...and actually renders it, rather than declaring one nothing reads`,
    /ld\+json/.test(src) && /JSON\.stringify\(faqSchema\)/.test(src));
}
ok(`🔴 and the sweep above really ran, two checks on each of the ${CAPTURED_TOOLS.length} tools`,
  pass + fail - beforeSweep === CAPTURED_TOOLS.length * 2 && CAPTURED_TOOLS.length === 8);

// ---------------------------------------------------------------------------------------------
// 3. The page is actually reachable: registered in the sitemap and the site's own tool listings.
// ---------------------------------------------------------------------------------------------

ok('free-mtd-filing is in the public sitemap',
  /'free-mtd-filing'/.test(read('app/sitemap.ts')));

ok('free-mtd-filing is listed on the resources (all tools) page',
  /free-mtd-filing/.test(read('app/resources/page.tsx')));

ok('free-mtd-filing is linked from the site footer tools column',
  /'\/free-mtd-filing', 'Free MTD filing'/.test(read('app/_shared/site.tsx')));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
