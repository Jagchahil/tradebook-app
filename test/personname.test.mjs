// THE CUSTOMER'S OWN NAME WAS ASKED FOR, STORED, AND NEVER REACHED HER ACCOUNT. R2, 13 Aug 2026.
// Run with: node test/personname.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Rosa completed a seven step setup on 12 August. On 13 August a SELECT against her account came
// back with `name` NULL. Every surface that greets a customer by name had nothing to greet her with,
// and the product that calls itself a first employee did not know who it worked for.
//
// The name was never missing. /start REQUIRES it (step 2 will not advance without it),
// app/api/onboard sends it as personName, createSignup writes it to signups.person_name. And
// reconcileSignupToUser, the one function whose job is carrying a signup's answers onto the account,
// never selected the column. Captured, stored, dropped, in three steps that each did their part.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };

const supa = read('lib/supabase.ts');
const start = read('app/start/page.tsx');
const onboard = read('app/api/onboard/route.ts');

console.log('A. The name is asked for, and it is not optional');
ok('step 2 will not advance without a person name for a business shaped signup',
  /!needsPersonName \|\| personName\.trim\(\)\.length > 1/.test(start));
ok('and it is sent to the server', /personName: greetName,/.test(start));
ok('the route reads it, falling back to the business name for a sole trader',
  /person_name: str\(b\.personName\) \?\? str\(b\.name\)/.test(onboard));
ok('and createSignup stores it', /if \(signup\.person_name\) record\.person_name = signup\.person_name;/.test(supa));

console.log('B. 🔴 And it now survives the journey onto the account');
const rStart = supa.indexOf('export async function reconcileSignupToUser');
const reconcile = supa.slice(rStart, supa.indexOf('export async function', rStart + 50));
ok('the reconcile SELECT names the column, or it arrives undefined however good the code is',
  /select=trade_type,trade,name,person_name,address/.test(reconcile));
ok('the row type carries it', /person_name: string \| null/.test(reconcile));
ok('🔴 and it is written to the account', /patch\.name = s\.person_name/.test(reconcile));

console.log('C. It only ever FILLS an empty field, and never overwrites');
ok('it is gated on the business shaped case', /businessShaped && s\.person_name/.test(reconcile));
ok('🔴 and on the person field not already being set',
  /patch\.name === undefined\) patch\.name = s\.person_name/.test(reconcile));
ok('a sole trader still gets his business name in the person field, unchanged',
  /if \(businessShaped\) patch\.business_name = s\.name;\s*\n\s*else patch\.name = s\.name;/.test(reconcile));
ok('the business name still goes to the business field', /patch\.business_name = s\.name/.test(reconcile));

// The write path must be the same one the address uses, so this costs no extra request and
// inherits the income_shape fallback that exists because a missing column rejects a whole PATCH.
ok('it rides the existing profile patch rather than adding a write',
  reconcile.indexOf('patch.name = s.person_name') < reconcile.indexOf('if (Object.keys(patch).length > 0)'));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
