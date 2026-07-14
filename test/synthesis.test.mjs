// 🔴 SYNTHESIS. HMRC GUIDANCE IS NOT THE LAW. IT IS HMRC'S VIEW OF THE LAW.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Every answer this product gives comes off a GOV.UK page. Every rule in taxrules.ts is a paraphrase
// of HMRC's guidance, checked nightly against HMRC's guidance, and delivered to a man with the
// confidence of law.
//
// It is not law. It is one party's opinion, and that party is the one collecting the money.
//
// The real hierarchy runs the other way:
//   1. THE STATUTE    What Parliament wrote. This IS the law.
//   2. THE COURTS     What it MEANS, decided by judges. This BINDS HMRC.
//   3. HMRC GUIDANCE  What HMRC thinks the above adds up to. It binds nobody.
//
// HMRC being wrong about the law is not hypothetical. They lost the double-cab pickup argument in the
// Court of Appeal and their own manual was out of step until they rewrote it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'syn-'));
for (const f of ['rulesources', 'synthesis']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')
      .replace("from './rulesources'", "from './rulesources.ts'"),
  );
}
const S = await import(pathToFileURL(path.join(stage, 'synthesis.ts')).href);
const { split, synthesise, depth, forPrompt } = S;

const claimPage = readFileSync(path.join(root, 'app/can-i-claim/page.tsx'), 'utf8');
const strip = (s) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nsynthesis: the statute, the court, and HMRC\'s opinion');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SEMICOLON. Where the House of Lords was being thrown away.
// ---------------------------------------------------------------------------------------------

const CLOTHES = 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)';

ok('🔴 THE AUTHORITY FIELD CARRIES TWO DIFFERENT THINGS, AND WE NOW PULL THEM APART',
  // "S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)"
  //  ^^^^ the statute        ^^^^ the House of Lords deciding what it means
  (() => {
    const s = split(CLOTHES);
    return s.statute.length === 1 && /ITTOIA/.test(s.statute[0])
      && s.precedent.length === 1 && /Mallalieu/.test(s.precedent[0]);
  })());

ok('🔴 AND THE PAGE NO LONGER CUTS THE CASE OFF AT THE SEMICOLON',
  // It said: s.authority.split(';')[0]. It showed the statute and THREW THE CASE AWAY. So on the most
  // contentious rule we have, the single strongest thing we can say for it, a House of Lords
  // decision, never reached one user. Nobody meant to hide it. Nobody asked what the second half was.
  !/authority\.split\(';'\)\[0\]/.test(strip(claimPage))
  && /\{s\.authority\}/.test(strip(claimPage)));

ok('a statute with no case is still read correctly',
  split('S34(1)(a) ITTOIA 2005').statute.length === 1
  && split('S34(1)(a) ITTOIA 2005').precedent.length === 0);

// 🔴 THE BUG MY OWN CLASSIFIER SHIPPED ON ITS FIRST RUN, IN THE FILE THAT EXISTS TO PREVENT IT.
//
// My first split() said: anything that is not a case citation is a statute. So THIS string
//
//     "GOV.UK, Expenses if you are self-employed: Training courses. HMRC BROADENED this in 2024."
//
// came back as STATUTE, and synthesise() would have told a man the training rule "rests on the law",
// with the full weight of "Parliament wrote it, nothing overrides it except Parliament."
//
// It is a GOV.UK page. It is HMRC's opinion. It is the thinnest authority we have. My classifier
// dressed HMRC's guidance up as the law, which is the exact sin this whole file was written to stop.
// Six of the fifteen "statutes" were GOV.UK prose I had written myself that morning.
ok('🔴 A GOV.UK PAGE TITLE IS NOT A STATUTE, HOWEVER AUTHORITATIVE IT SOUNDS',
  split('GOV.UK, Expenses if you are self-employed: Training courses. HMRC BROADENED this in 2024.').statute.length === 0);

ok('...and neither is any other bit of HMRC prose',
  split('GOV.UK, Marriage Allowance. The LOWER earner applies.').statute.length === 0
  && split('The list under it is: start a new business.').statute.length === 0);

ok('🔴 A STATUTE MUST NAME AN ACT OR A SECTION. THE DEFAULT IS GUIDANCE, ALWAYS.',
  // The error may run one way only: we may UNDERSTATE our own authority. We may never overstate it.
  ['S34(1)(a) ITTOIA 2005', 'ITA 2007 s72', 'TCGA 1992', 'Companies Act 2006 s830',
    'Section 94 of the Finance Act 2009', 'Reg 111', 'CAA 2001']
    .every((a) => split(a).statute.length === 1));

ok('modern citations are recognised as cases, not mistaken for statute',
  split('Global Corporate v Hale [2018] EWCA Civ 2618').precedent.length === 1
  && split('X v HMRC [2024] UKUT 100 (TCC)').precedent.length === 1);

ok('no authority at all is not a crash and not an invented one',
  split(undefined).statute.length === 0 && split('').precedent.length === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE HIERARCHY. Strongest first, and guidance is LAST.
// ---------------------------------------------------------------------------------------------

const clothes = synthesise('everyday_clothes');

ok('the layers come back strongest first: statute, then the court, then HMRC',
  clothes.layers[0].layer === 'statute'
  && clothes.layers.some((l) => l.layer === 'precedent')
  && clothes.layers[clothes.layers.length - 1].layer === 'guidance');

ok('🔴 GUIDANCE IS LABELLED AS HMRC\'S OPINION, NOT AS THE LAW',
  clothes.layers.find((l) => l.layer === 'guidance').weight
    .includes('It is not the law, and HMRC has been wrong before'));

ok('🔴 THE COURT IS LABELLED AS BINDING HMRC, because it does',
  clothes.layers.find((l) => l.layer === 'precedent').weight
    .includes('It binds HMRC'));

ok('the statute is labelled as the law itself',
  clothes.layers.find((l) => l.layer === 'statute').weight.includes('This is the law itself'));

ok('the clothing rule is the strongest position we have, and it says so',
  clothes.restsOn === 'statute'
  && /This one is settled/.test(clothes.says)
  && /Mallalieu/.test(clothes.says));

// ---------------------------------------------------------------------------------------------
// 🔴 3. AND THE ONE THAT MATTERS: ADMITTING WHAT WE DO NOT HAVE.
// ---------------------------------------------------------------------------------------------

const thin = depth().filter((d) => d.restsOn === 'guidance');

ok('🔴 A RULE WITH NO STATUTE AND NO CASE SAYS SO, PLAINLY',
  // "HMRC says so, and nothing else" is a perfectly respectable answer. It is also a COMPLETELY
  // DIFFERENT answer from "the House of Lords decided this", and a man signing his own tax return is
  // entitled to know which of the two he has been handed.
  (() => {
    const t = synthesise(thin[0].rule);
    return t.restsOn === 'guidance'
      && /rests on HMRC's guidance alone/.test(t.says)
      && /HMRC's view of the law is not the law/.test(t.says);
  })());

ok('🔴 THE TRAINING RULE IS ONE OF THEM, AND WE REWROTE IT THIS MORNING ON A GUIDANCE PAGE',
  // ⚠️ No statute cited. No court has ruled. It is the thinnest layer of the three and the one where
  // HMRC has most room to be wrong, and we changed a live rule on the strength of it today. That is
  // not a reason not to have done it. It is a reason to SAY SO.
  synthesise('training').restsOn === 'guidance');

ok('the thin rules are COUNTED, not hidden',
  // The same discipline as the uncited-rules count that found three broken rules this morning. A gap
  // you can count is a gap you will close. A gap you cannot see becomes the mileage rate.
  thin.length > 0 && depth().length >= 20);

ok('...and depth() sorts the THINNEST first, because that is the list worth reading',
  depth()[0].restsOn === 'guidance');

// ---------------------------------------------------------------------------------------------
// 🔴 4. WHAT THE MODEL IS HANDED.
// ---------------------------------------------------------------------------------------------

const prompt = forPrompt('everyday_clothes');

ok('the model gets the layers LABELLED, so it cannot mistake HMRC\'s opinion for Parliament\'s words',
  /\[THE LAW \(statute\)\]/.test(prompt)
  && /\[A COURT HAS RULED \(binds HMRC\)\]/.test(prompt)
  && /HMRC's view\. NOT the law\./.test(prompt));

ok('🔴 ...AND IT IS TOLD TO SAY SO WHEN THEY DISAGREE, RATHER THAN SMOOTH IT OVER',
  // The moment guidance and law diverge is the moment a man most needs a straight answer, and it is
  // the moment every competitor gives him a confident wrong one.
  /If the guidance and the law disagree, SAY SO and tell him the law wins/.test(prompt));

ok('a rule we have no sources for returns nothing, rather than an invented authority',
  synthesise('a_rule_that_does_not_exist') === null && forPrompt('nonsense') === '');

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
