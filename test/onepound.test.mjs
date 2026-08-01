// ONE WAY TO WRITE A POUND, ON THE THINGS THAT LEAVE THE BUILDING. Run: node test/onepound.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS DEFENDS, AND WHY IT IS TWO NAMED FILES RATHER THAN A SWEEP.
//
// lib/money.ts exists because a sweep on 28 July 2026 found SEVENTEEN money formatters in lib/ and
// replaced them with one. Its own header states the rule this codebase keeps relearning: two
// readers over one number will drift, and the one that drifts is the one he believes.
//
// 🔴 THAT SWEEP READ lib/. IT DID NOT READ app/.
//
// So on 1 August 2026, walking a reverse charge invoice live, the trader's own screen said
// £2,400.00 and the copy his customer opens said £2400.00. app/invoice/[id]/page.tsx had kept a
// local `£${n.toFixed(2)}` throughout, and lib/email.ts had two more of them. Between them those
// three formatters print every figure on the ONE document in this product that a stranger reads:
// the invoice page, and the invoice email that carries the same invoice.
//
// gbp2's own comment had already named this exact use and been ignored by it: "Documents rather
// than conversation: the quarter pack, an invoice, proof of income. A figure a man hands to a
// lender or an accountant shows its pence."
//
// ⚠️ WHY NOT A REPO WIDE BAN ON toFixed. Because most of the remaining ones are honest: a team
// console, a per message cost in pence, a rate in lib/universe.ts. Banning the construct
// everywhere would need an allowlist, and an allowlist is a list somebody has to remember to
// update, which is the same failure in a different coat. The rule that actually matters is
// narrow and can be stated without a list: THE DOCUMENT A CUSTOMER'S ACCOUNTANT READS IS
// FORMATTED BY lib/money.ts. Two files carry that document. They are named here.
//
// ⚠️ AND IT ASSERTS THE PROPERTY, NOT THE SENTENCE. It does not pin "£2,400.00" anywhere: a test
// that pinned a formatted figure would pass the day the formatter moved and the figure happened
// to survive. It asserts that these files DELEGATE, and separately that gbp2 really does group
// thousands, by running it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// The two files that carry the document. If a third ever does, it belongs on this list, and the
// day somebody adds one without reading this the invoice starts disagreeing with itself again.
const DOCUMENT_SURFACES = ['app/invoice/[id]/page.tsx', 'lib/email.ts'];

// ---------------------------------------------------------------------------------------------
// 1. 🔴 THE DOCUMENT IS FORMATTED BY lib/money.ts AND NOWHERE ELSE.
// ---------------------------------------------------------------------------------------------
for (const rel of DOCUMENT_SURFACES) {
  const src = strip(read(rel));

  ok(`${rel} takes its pound from lib/money.ts`,
    /import \{[^}]*\bgbp2\b[^}]*\} from '(\.\.\/)*\.?\.?\/?(lib\/)?money'/.test(src));

  // The construct itself, not a sentence: a template literal that puts a pound sign in front of a
  // toFixed. That is the shape every one of the three had, and it is the shape that drifts.
  ok(`${rel} builds no pound of its own`,
    !/`£\$\{[^`]*toFixed\(/.test(src));
}

// ---------------------------------------------------------------------------------------------
// 2. AND THE THING THEY DELEGATE TO REALLY DOES WHAT THE INVOICE NEEDS.
//
// Behavioural. lib/money.ts is pure with no imports, so it loads bare and the real function runs.
// Without this, part 1 would only prove the files point at something.
// ---------------------------------------------------------------------------------------------
const M = await import(pathToFileURL(path.join(repoRoot, 'lib', 'money.ts')).href);

ok('🔴 gbp2 groups thousands, which is the whole finding',
  M.gbp2(2400) === '£2,400.00');

ok('...and keeps the pence a document has to show',
  M.gbp2(41.3) === '£41.30' && M.gbp2(0) === '£0.00');

ok('...and holds at the boundary rather than only in the middle',
  M.gbp2(999.995) === '£1,000.00' && M.gbp2(1000) === '£1,000.00');

ok('...and writes a negative the way a person does, sign outside the pound',
  M.gbp2(-2400) === '-£2,400.00');

ok('a figure that failed to compute is £0.00, never £NaN, on a document a stranger reads',
  M.gbp2(Number.NaN) === '£0.00' && M.gbp2(Number.POSITIVE_INFINITY) === '£0.00');

// ---------------------------------------------------------------------------------------------
// 3. THE TWO HALVES OF ONE INVOICE CANNOT DISAGREE.
//
// The page and the email are the same document. Asserting they share a formatter is the property;
// asserting they both print some particular figure would be the sentence.
// ---------------------------------------------------------------------------------------------
const pageSrc = strip(read('app/invoice/[id]/page.tsx'));
const mailSrc = strip(read('lib/email.ts'));

ok('🔴 the invoice PAGE and the invoice EMAIL are formatted by the same function',
  /\bgbp2\b/.test(pageSrc) && /\bgbp2\b/.test(mailSrc));

ok('the email still takes pence where it is given pence, and pounds where it is given pounds',
  /const money = \(pence: number\) => gbp2\(\(Number\(pence\) \|\| 0\) \/ 100\)/.test(mailSrc)
  && /const poundsFromNumber = \(n: number\) => gbp2\(Number\(n\) \|\| 0\)/.test(mailSrc));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
