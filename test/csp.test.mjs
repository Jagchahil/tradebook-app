// A FORM THAT ENDS UP ON ANOTHER ORIGIN NEEDS THE POLICY TO SAY SO, AND WHEN IT DOES NOT, NOTHING
// ANYWHERE TELLS YOU. THE BUTTON JUST DOES NOTHING.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 30 July 2026. Bank connect and paying us both stopped working on the web the moment the setup
// wizard started using plain form posts, and stayed broken through a green test run, a clean
// typecheck, a successful build and my own walk of the live site. Jag pressed the button and it did
// nothing. I had already looked at that exact symptom once and talked myself into blaming a browser
// extension permission, which was wrong.
//
// 🔴 THE CAUSE: Content-Security-Policy form-action 'self'.
//
// Chrome enforces form-action across the REDIRECT CHAIN of a form submission, not just the form's
// own action. Our form posts to our own /api/bank/connect, which answers 303 to TrueLayer, and the
// redirect is refused. The navigation is dropped. There is no thrown error, no failed request in the
// network panel, and nothing a customer could report beyond "it does not work".
//
// ⚠️ AND IT COULD NOT HAVE BITTEN BEFORE. The phone app posts JSON and follows the link itself, and
// /start posts JSON then sets window.location, which is a SCRIPT navigation that form-action does not
// cover. The web app ships no client script on purpose, so it is the only surface in the product that
// submits a real form, and the only one this could ever have reached.
//
// THE LESSON, WHICH IS WHY THIS FILE EXISTS RATHER THAN JUST A WIDER POLICY: a security header and
// the code it governs are two halves of one decision, held in two files that never mention each
// other. So this suite reads BOTH and fails the build when they disagree.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('\ncsp: the policy and the routes it governs, checked against each other');

const cfg = read('next.config.mjs');
const formAction = (/"form-action ([^"]+)"/.exec(cfg) || [])[1] || '';
ok('there is a form-action directive at all', formAction.startsWith("'self'"));

// ---------------------------------------------------------------------------------------------
// 🔴 EVERY ORIGIN A ROUTE REDIRECTS A FORM TO MUST BE NAMED IN form-action.
//
// Found by walking every route that can answer a form post with a redirect, and reading where it
// sends him. A route added later that 303s a form to a new host fails here rather than in a
// customer's hands.
// ---------------------------------------------------------------------------------------------
const bankfeed = read('lib/bankfeed.ts');
const authHosts = [...bankfeed.matchAll(/'(https:\/\/auth\.truelayer[a-z-]*\.com)'/g)].map((m) => m[1]);
ok(`lib/bankfeed.ts names its auth hosts (${authHosts.join(', ')})`, authHosts.length === 2);
for (const host of authHosts) {
  ok(`🔴 form-action allows ${host}, which /api/bank/connect 303s a form to`, formAction.includes(host));
}

// Stripe's hosted checkout. lib/stripe.ts returns whatever URL Stripe hands back, so the host cannot
// be read out of our source; it is checkout.stripe.com for a hosted session and has been since the
// integration was written. Named here so the pairing is still written down in one place.
ok('🔴 form-action allows Stripe hosted checkout, which /api/billing/checkout 303s a form to',
  formAction.includes('https://checkout.stripe.com'));

// ---------------------------------------------------------------------------------------------
// AND NOTHING BEYOND THOSE. A widened directive is a smaller wall, so it may only be widened by
// something with a route behind it.
// ---------------------------------------------------------------------------------------------
const ALLOWED = new Set(["'self'", ...authHosts, 'https://checkout.stripe.com']);
const stray = formAction.split(/\s+/).filter((t) => t && !ALLOWED.has(t));
ok(`🔴 form-action names nothing without a route behind it${stray.length ? `\n     ${stray.join(', ')}` : ''}`,
  stray.length === 0);

// ---------------------------------------------------------------------------------------------
// THE OTHER LOCK DOWN DIRECTIVES ARE UNTOUCHED. Widening one is not licence to relax the rest, and
// the 26 July audit put these here on purpose.
// ---------------------------------------------------------------------------------------------
for (const directive of ["base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "default-src 'self'"]) {
  ok(`${directive} is still in force`, cfg.includes(`"${directive}"`));
}

// ---------------------------------------------------------------------------------------------
// 🔴 AND EVERY ROUTE THAT CAN REDIRECT A FORM OFF SITE IS ACCOUNTED FOR ABOVE.
//
// This is the check that would have caught it: walk the API, find every route that both reads a form
// body and returns a redirect to something that is not a path of ours, and require the destination
// to be one this file already knows about.
// ---------------------------------------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}
const routes = walk(path.join(root, 'app/api'));
ok('the api tree was actually walked (not vacuous)', routes.length > 40);

// ⚠️ THE FIRST VERSION OF THIS FLAGGED TWO INNOCENT ROUTES, and a check that cries wolf is a check
// somebody deletes. /api/onboarding and /api/pile both redirect to a VARIABLE, which looks identical
// to the dangerous shape until you see that the variable was built with new URL('/our/path', req.url)
// and can only ever be same origin. So the destination is resolved one level: a redirect is same
// origin if it is built inline with new URL, or if it names a local that was.
//
// ⚠️ `new URL(` COMES FIRST IN THE ALTERNATION BELOW, and that ordering is load bearing: an
// identifier pattern matches the bare word `new` and wins, which made every inline new URL() look
// like a variable and reported six clean routes as dangerous. A check that cries wolf gets deleted.
//
// What is left is the genuinely off site shape: redirecting to a value handed to us by somebody
// else, which is buildAuthLink() for TrueLayer and createSubscriptionCheckout() for Stripe.
function sameOriginOnly(src) {
  const args = [...src.matchAll(/NextResponse\.redirect\(\s*(new URL\(|[A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  return args.every((a) => {
    if (a === 'new URL(') return true;
    return new RegExp(`const ${a}\\s*=\\s*new URL\\(`).test(src);
  });
}

const offsite = routes.filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /req\.formData\(\)/.test(src) && !sameOriginOnly(src);
}).map((f) => path.relative(root, f));

ok(`🔴 every route that can redirect a form off site is one form-action names\n     ${offsite.join('\n     ') || '(none)'}`,
  offsite.length === 2
  && offsite.includes('app/api/bank/connect/route.ts')
  && offsite.includes('app/api/billing/checkout/route.ts'));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
