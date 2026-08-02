// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONTROL DOCTRINE. Jag, 2 August 2026: "part of our philosophy is giving your employee the
// control that has been taken away from you by connecting the bank."
//
// 🔴 WHAT THIS SUITE ACTUALLY PROTECTS, and it is one thing. The product now tells a man that what
// he claims is his to decide. That sentence is true, and it is the whole pitch. On its own, on a
// screen about a bank statement, it also reads as an offer to leave a few payments out.
//
// It is not one. Costs are optional: nobody is made to claim a deduction and leaving one out only
// ever costs him more tax. Income is not: what he was paid is what HMRC checks, and Finance Act
// 2026 Sch 22 reaches people who help bring about a loss of tax revenue. So the two sentences
// travel together, always, and this suite is what makes "always" mean something.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const C = await import('../lib/control.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('\n1. The pair cannot be split');
{
  const choice = C.controlChoice();
  ok('controlChoice hands over both sentences', Boolean(choice.costs) && Boolean(choice.income));
  ok('controlCopy hands over the whole block',
    ['title', 'why', 'costs', 'income'].every((k) => typeof C.controlCopy()[k] === 'string' && C.controlCopy()[k].length > 20));
  // 🔴 THE ENFORCEMENT. A comment asking callers to be careful is a rule somebody follows until
  // the afternoon they are in a hurry. The only routes to these strings are the two functions,
  // and both hand over the pair.
  ok('🔴 the costs sentence is NOT reachable on its own through an export',
    C.CONTROL_COSTS === undefined && C.CONTROL_INCOME === undefined);
  ok('the pair is the same pair in both functions',
    C.controlCopy().costs === C.controlChoice().costs
    && C.controlCopy().income === C.controlChoice().income);
}

console.log('\n2. What the two sentences are allowed to say');
{
  const { costs, income } = C.controlChoice();
  ok('the costs sentence states the consequence, so it cannot be read as a wink',
    /more tax/i.test(costs));
  ok('🔴 the income sentence says every payment in gets counted', /every payment in/i.test(income));
  ok('it names HMRC as the one who checks, rather than us',
    /hmrc/i.test(income));
  // Not a lecture, not a threat, and no promise about what anybody else will or will not see.
  ok('it does not threaten him with a penalty', !/penalt|prosecut|fine|jail|prison/i.test(income));
  ok('and it promises nothing about confidentiality, because that is not ours to promise',
    !/confidential|private|nobody (else )?(will |can )?see/i.test(costs + income));
}

console.log('\n3. No screen renders one half without the other');
{
  // The sweep. Every .tsx under app/ that reaches for the costs sentence must also render the
  // income one. Property based rather than a fixed list of two files, so a third screen added in
  // six months is covered on the day it is written.
  const files = [];
  // ⚠️ withFileTypes AND NO DOT DIRECTORIES. app/.node is a local toolchain folder full of
  // symlinks pointing at binaries that are not there, and a statSync walk dies on the first one.
  // Nothing shipped ever lives in a dot directory, so skipping them loses no coverage.
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.tsx')) files.push(p);
    }
  };
  walk(path.join(root, 'app'));

  const users = files
    .map((p) => ({ p: path.relative(root, p), src: readFileSync(p, 'utf8') }))
    .filter((f) => /\.costs\}/.test(f.src));

  ok('the sweep found the screens that use it, so it is testing something',
    users.length >= 2);
  ok('🔴 EVERY ONE OF THEM RENDERS THE INCOME SENTENCE TOO',
    users.every((f) => /\.income\}/.test(f.src)));
  ok('and every one of them gets the words from lib/control.ts rather than typing its own',
    users.every((f) => /from '.*lib\/control'/.test(f.src)));
}

console.log('\n4. The screen where the whole block belongs');
{
  const imp = read('app/app/money/import/page.tsx');
  ok('the CSV upload carries the title and the reason, not just the pair',
    /control\.title\}/.test(imp) && /control\.why\}/.test(imp));
  ok('⚠️ and the old mechanism-only line is gone rather than repeated underneath',
    !/Every payment lands waiting for your yes/.test(imp));
  ok('the de-duplication promise it did carry is still there, because that is a real promise',
    /nothing\s+doubles up/.test(imp));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
