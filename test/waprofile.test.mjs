// THE WHATSAPP BUSINESS PROFILE MAY NOT PUBLISH A MAILBOX WE DO NOT HAVE.
//
//   node test/waprofile.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT WAS ACTUALLY TRUE ON 10 AUGUST 2026, BEFORE THIS SUITE EXISTED.
//
// scripts/wa-profile.mjs line 60 read `email: 'hello@lekhio.app'`. That string appeared NOWHERE
// else in the repo except one example inside a comment in lib/email.ts. Every customer facing
// surface publishes info@lekhio.app: app/terms, app/privacy, app/security, app/llms.txt and
// app/in/page.tsx, which holds the one constant the others defer to.
//
// The profile is the card a customer sees when he taps our name in the WhatsApp thread. The
// address on it is the one he writes to when something has gone wrong with his money. So the
// script was one `--write` away from handing a dead mailbox to every customer at once, and the
// only reason it had not happened is that nobody had run it yet.
//
// ⚠️ THIS IS THE SAME DEFECT ONE SURFACE OVER. test/llmstxt.test.mjs already asserts that
// llms.txt does NOT use support@lekhio.app, calling it "the mailbox we do not have". A guard whose
// NAME claims a family and whose CODE checks one member is this codebase's oldest disease, and
// that guard checked exactly one file. This one checks the family: every address written in code
// anywhere under scripts/ has to be one the product itself publishes.
//
// ⚠️ WHAT THIS DOES NOT PROVE, SO THE NEXT READER CAN TELL A DECISION FROM A HOLE.
//
//   . It does not prove info@lekhio.app RECEIVES mail. Nothing in a repo can. It proves the
//     script cannot publish an address the rest of the product does not stand behind, which is
//     the part that is checkable here.
//   . It does not run the script. The script exits at import time without WHATSAPP_TOKEN, so it
//     cannot be imported. The extraction it performs is re-executed below against the real file
//     instead, which proves the regex and the file agree TODAY rather than on the day it was
//     written.
//   . Comments are exempt, deliberately. The record above names hello@lekhio.app on purpose, and
//     a guard that failed on the history of its own bug would push the next person to delete it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const SCRIPT = 'scripts/wa-profile.mjs';
const SOURCE = 'app/in/page.tsx';
// The one regex. The script runs this exact shape; it is re-run here against the real file.
const SUPPORT_RE = /const SUPPORT = '([^']+)';/;

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. The address has one home, and it is still there.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ ASSERT THE THING EXISTS BEFORE ASSERTING ANYTHING ABOUT IT. On 7 August a guard in
// test/thread.test.mjs compared two indexOf results, one of which had quietly become -1, and -1 is
// less than everything, so it passed for the wrong reason and guarded nothing for weeks.
const sourceSrc = read(SOURCE);
const found = SUPPORT_RE.exec(sourceSrc);
ok(`🔴 ${SOURCE} STILL DECLARES const SUPPORT, so every assertion below is real`, found !== null);

const SUPPORT = found ? found[1] : null;
ok(`the address it declares looks like a lekhio.app mailbox (got ${SUPPORT ?? 'nothing'})`,
  typeof SUPPORT === 'string' && /^[a-z][a-z0-9._%+-]*@lekhio\.app$/.test(SUPPORT));

// The miss branch has to be reachable, or the throw in the script is decoration. Run the same
// regex against a document that does not carry the line and confirm it comes back empty.
ok('and the same regex returns nothing when the line is absent, so the throw branch is real',
  SUPPORT_RE.exec('const SOMETHING_ELSE = 1;\nexport default function In() { return null; }') === null);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The product actually stands behind that address.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

// DERIVED BY WALKING, NEVER TYPED. A guard that names the files you just edited is a receipt.
function walk(dir, out = []) {
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_to_delete') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { walk(rel, out); continue; }
    if (/\.(ts|tsx|mjs)$/.test(e.name)) out.push(rel);
  }
  return out;
}

const productFiles = [...walk('app'), ...walk('lib')];
ok(`the walk found product files to look in (${productFiles.length}), so the count below is not vacuous`,
  productFiles.length > 50);

const publishes = productFiles.filter((f) => SUPPORT && codeOnly(read(f)).includes(SUPPORT));
ok(`🔴 ${SUPPORT} IS PUBLISHED BY THE PRODUCT ITSELF, in ${publishes.length} files under app/ and lib/`,
  publishes.length >= 3);

// Every address the product publishes anywhere. This is the allowlist, and it is read off the
// product rather than written down, so a new mailbox becomes legal the moment the product uses it
// and not one commit earlier.
const published = new Set();
for (const f of productFiles) {
  for (const m of codeOnly(read(f)).matchAll(/[a-z][a-z0-9._%+-]*@lekhio\.app/g)) published.add(m[0]);
}
ok(`the product publishes at least one address (${[...published].join(', ') || 'none'})`, published.size >= 1);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. No script may type an address of its own.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

const scriptFiles = walk('scripts');
ok(`the walk found scripts to check (${scriptFiles.length}), so the assertion below is not vacuous`,
  scriptFiles.length >= 1);

// 🔴 THE FAMILY, NOT THE ONE MEMBER. hello@lekhio.app got out because the only guard on our
// mailboxes looked at llms.txt and nothing else.
const strays = [];
for (const f of scriptFiles) {
  for (const m of codeOnly(read(f)).matchAll(/[a-z][a-z0-9._%+-]*@lekhio\.app/g)) {
    if (!published.has(m[0])) strays.push(`${f}: ${m[0]}`);
  }
}
ok(`🔴 NO SCRIPT WRITES AN ADDRESS THE PRODUCT DOES NOT PUBLISH${strays.length ? ` (${strays.join('; ')})` : ''}`,
  strays.length === 0);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. The profile reads the address rather than carrying one.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════

const scriptSrc = read(SCRIPT);
const scriptCode = codeOnly(scriptSrc);

ok('🔴 THE SCRIPT CARRIES NO EMAIL LITERAL AT ALL, so there is nothing to drift',
  !/@lekhio\.app/.test(scriptCode));

ok(`it names ${SOURCE} as the one source`,
  new RegExp(`SUPPORT_SOURCE = '${SOURCE.replace('.', '\\.')}'`).test(scriptCode));

ok('it runs the same extraction this suite just ran',
  scriptCode.includes("/const SUPPORT = '([^']+)';/"));

ok('and the profile that goes to Meta takes its email from that read',
  /\{ \.\.\.PROFILE, email: supportEmail\(\) \}/.test(scriptCode));

// ⚠️ A FALLBACK HERE WOULD BE THE WHOLE BUG AGAIN: a default address is exactly a signal that
// cannot tell "no" from "nothing". The miss must stop the write.
const fn = /function supportEmail\(\)[\s\S]*?\n}/.exec(scriptCode)?.[0] ?? '';
ok('supportEmail() was found, so the three assertions below are real', fn.length > 0);
ok('🔴 A MISS THROWS RATHER THAN FALLING BACK', /throw new Error/.test(fn));

// ⚠️ THE ASSERTION ABOVE IS NOT ENOUGH ON ITS OWN, AND THE SABOTAGE PASS IS WHAT SHOWED IT.
// Putting `return 'info@lekhio.app';` on the line BEFORE the throw left the throw in place, so
// /throw new Error/ still matched and this stayed green while the miss branch had become dead
// code. Only a second, unrelated assertion caught it. So the branch is read, not just the
// function: nothing may return before the throw the miss depends on.
const missBranch = /if \(!found\) \{([\s\S]*?)\n  \}/.exec(fn)?.[1] ?? null;
ok('the miss branch was found, so the assertion below is real', missBranch !== null);
ok('🔴 AND NOTHING RETURNS BEFORE IT, so the throw cannot become dead code',
  missBranch !== null && !/\breturn\b/.test(missBranch));

ok('and it has no default of any kind', !/\?\?|\|\|/.test(fn));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
