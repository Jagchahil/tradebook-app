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
