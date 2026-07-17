// Can-I-claim CORPUS parity guard  (Puchio's answers).
//
// ⚠️ THIS EXISTS BECAUSE THE CORPUS DRIFTED AND NOBODY CAUGHT IT FOR WEEKS.
//
// The claim rules live as two hand-maintained copies:
//   web (canonical):  tradebook-web/lib/taxrules.ts
//   app:              tradebook-app/lib/taxrules.ts
//
// The tax ENGINE already has parity guards (tax-parity, nisl-parity, ...), so the rates cannot
// silently diverge. The corpus had none. So when the compliance pass fixed two rules on WEB, the
// mobile copies kept the wrong answers, live, on the phone, for weeks:
//   . "Lekhio itself is allowable"  -> nudged him to over-claim on OUR OWN fee (HMRC excludes the
//     cost of preparing his Self Assessment return). Finance Act 2026 Sch 22: over-claiming relief
//     is sanctionable. It is the most self-serving sentence the codebase ever held.
//   . "a cap on interest under the simpler cash basis"  -> that cap was ABOLISHED on 6 April 2024.
//
// This guard makes that class of drift impossible: same rules, same verdicts, on both sides, and the
// two known regressions can never come back on mobile. It reaches into the sibling repo, so run-all
// skips it automatically when the mobile checkout is absent, and CI (which checks out both) runs it.
//
//   node test/taxrules-parity.test.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// The corpus is now ONE file, byte-identical in both repos. We compare the canonical data files
// directly: the strongest possible guard, because it leaves no room for the same rule to be worded
// two ways. (The old two-hand-typed-arrays are gone; taxrules.ts is now a thin re-export of these.)
const webPath = path.resolve(here, '../lib/claimrules.data.ts');
const appPath = path.resolve(here, '../../tradebook-app/lib/claimrules.data.ts');

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) {
    pass++;
    process.stdout.write(`  PASS  ${desc}\n`);
  } else {
    fail++;
    process.stdout.write(`  FAIL  ${desc}\n`);
  }
}

// A real rule starts with `key: 'x', title:`. Comments that merely mention a key (like the fix notes)
// do not, so this ignores them. For each rule we take its span up to the next rule and read the
// verdict out of it. Text (rule/detail) can legitimately differ between the two builds, so we do not
// demand identical prose; we demand the same rules and the same verdicts, plus the banned phrases.
function parseRules(text) {
  const starts = [...text.matchAll(/key:\s*'([^']+)',\s*title:/g)];
  const rules = {};
  for (let i = 0; i < starts.length; i++) {
    const key = starts[i][1];
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : text.length;
    const span = text.slice(from, to);
    const v = span.match(/verdict:\s*'([^']+)'/);
    // detail can contain escaped apostrophes (HMRC\'s), so allow \. inside the string.
    const d = span.match(/detail:\s*'((?:[^'\\]|\\.)*)'/);
    rules[key] = { verdict: v ? v[1] : null, detail: d ? d[1] : '' };
  }
  return rules;
}

if (!existsSync(appPath)) {
  // Should not happen: run-all only runs this when the sibling is present. Belt and braces.
  console.log('\n  (mobile corpus not found, skipping)\n');
  process.exit(0);
}

const webText = readFileSync(webPath, 'utf8');
const appText = readFileSync(appPath, 'utf8');
const web = parseRules(webText);
const app = parseRules(appText);

const webKeys = Object.keys(web).sort();
const appKeys = Object.keys(app).sort();

// 0. THE ONE THAT MAKES DRIFT IMPOSSIBLE: the canonical corpus is byte-identical in both repos. Not
//    "the same rules", not "the same verdicts", the same FILE. If this passes, everything below is
//    guaranteed; the checks below stay as documentation of what we would otherwise have to trust.
ok('the claim corpus is byte-identical in web and mobile (run scripts/sync-corpus.mjs if not)', webText === appText);

// 1. THE SAME RULES ON BOTH SIDES. A rule added to one and not the other is exactly the drift that
//    let the fixes miss the phone. Equality in both directions, so neither side can be the odd one.
const missingFromApp = webKeys.filter((k) => !app[k]);
const missingFromWeb = appKeys.filter((k) => !web[k]);
ok(`every web rule exists on mobile (${webKeys.length} rules)${missingFromApp.length ? ' -> missing: ' + missingFromApp.join(', ') : ''}`, missingFromApp.length === 0);
ok(`every mobile rule exists on web${missingFromWeb.length ? ' -> extra on mobile: ' + missingFromWeb.join(', ') : ''}`, missingFromWeb.length === 0);

// 2. THE SAME VERDICT PER RULE. "Yes, claim it" on one side and "It depends" on the other is a man
//    told two different answers to the same question depending on which screen he opened.
const verdictDrift = webKeys.filter((k) => app[k] && web[k].verdict !== app[k].verdict);
ok(`every shared rule has the same verdict on both sides${verdictDrift.length ? ' -> differ: ' + verdictDrift.join(', ') : ''}`, verdictDrift.length === 0);

// 3. THE TWO KNOWN REGRESSIONS CAN NEVER COME BACK ON MOBILE.
//    We check the RULE DETAIL a user actually sees, not the raw file, so an explanatory comment that
//    quotes the old wording to warn against it does not itself trip the guard. (That is the very trap
//    the domain guard warns about: the exception you grant yourself while writing about the rule.)
const fees = app['fees']?.detail ?? '';
const bank = app['bankfinance']?.detail ?? '';
ok('mobile fees rule does not over-claim our own fee as fully deductible', !/Lekhio itself is allowable/i.test(fees));
ok('mobile fees rule tells him the Self Assessment return prep is NOT allowable', /Self Assessment tax return/i.test(fees));
ok('mobile bank rule states the interest cap was removed (6 April 2024), not that it still applies', /removed on 6 April 2024/i.test(bank) && !/There is a cap on interest/i.test(bank));

// The training rule was the pre-2024 version on mobile for weeks, quietly LOSING people relief. It
// must carry the widened wording (new skills that support the trade are claimable), not just refreshers.
const training = app['training']?.detail ?? '';
ok('training rule reflects the 2024 widening, not the old refresher-only version', /widened this in 2024/i.test(training) && /EV charging/i.test(training));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
