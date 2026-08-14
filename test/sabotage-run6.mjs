// SABOTAGE THE RUN 6 PACKET. A guard that passes is not evidence until you have made it fail.
//
//   node test/sabotage-run6.mjs
//
// Each sabotage reintroduces ONE of the defects test/run6fixes.test.mjs exists to stop, on a
// scratch copy of the repo, and that suite has to go RED. A sabotage that stays green is a hole in
// the guard, not a pass. A sabotage whose anchor has gone is BROKEN and is counted separately,
// because a sabotage that cannot apply is not a sabotage that passed.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-run6-'));
  // ⚠️ scripts/ IS HERE BECAUSE test/run6fixes.test.mjs IMPORTS check-glued-figures.mjs FROM IT.
  // Without it the suite throws on a scratch copy and every no op control goes red at once, which
  // is the shape of a broken harness rather than a broken guard. Three went red together the first
  // time this ran, which is the same lesson components/ and next.config.mjs taught sabotage-run5.
  for (const d of ['lib', 'test', 'app', 'supabase', 'components', 'scripts']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  cpSync(path.join(root, 'next.config.mjs'), path.join(dir, 'next.config.mjs'));
  return dir;
}

function runSuite(dir, suite) {
  try {
    const out = execFileSync('node', [path.join(dir, `test/${suite}.test.mjs`)], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out) };
  } catch { return { red: true }; }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 90)}`);
  writeFileSync(p, s.split(from).join(to));
};

let applied = 0, held = 0, holes = 0, broken = 0;

function sabotageIn(suite, name, mutate, expectRed = true) {
  const dir = scratch();
  try { mutate(dir); applied += 1; }
  catch (e) {
    broken += 1;
    process.stdout.write(`  BROKEN SABOTAGE (anchor gone, NOT a pass)  ${name}\n    ${e.message}\n`);
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  const { red } = runSuite(dir, suite);
  rmSync(dir, { recursive: true, force: true });
  if (red === expectRed) held += 1;
  else {
    holes += 1;
    process.stdout.write(expectRed
      ? `  HOLE (sabotage stayed GREEN)  ${name}\n`
      : `  HOLE (no-op control went RED)  ${name}\n`);
  }
}
const sabotage = (name, mutate, expectRed = true) => sabotageIn('run6fixes', name, mutate, expectRed);

process.stdout.write('\nsabotaging the Run 6 packet\n');

// ── F5. THE DIRECTOR AND CLASS 4. ─────────────────────────────────────────────────────────────

// THE ORIGINAL DEFECT, put back exactly as it stood on production this morning.
sabotage('the raw company profit goes back into the personal total, which is the defect itself',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '  const projTotalIncome =\n    personalTradeNet +',
    '  const projTotalIncome =\n    projTradeNet +'));

// KILL THE FIX AT EVERY CALL SITE, not just one. A sabotage that leaves a second call site alive
// is a no-op wearing a green tick.
sabotage('the costs lever goes back to quoting the personal marginal rate',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    'missing.length >= 2 && deduct.rate > 0',
    'missing.length >= 2 && mRate > 0'));

sabotage('the purchase lever goes back to the personal marginal rate',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    'if (g && g.amount > 0 && deduct.rate > 0) {\n    const saving = round(g.amount * deduct.rate);',
    'if (g && g.amount > 0 && mRate > 0) {\n    const saving = round(g.amount * mRate);'));

// THE SENTENCE MUST NAME THE TAXPAYER. A right number under the wrong owner is the whole finding.
sabotage('the sentence stops saying whose bill it is',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    "`takes about £${round(100 * deduct.rate)} off your company's Corporation Tax`",
    '`saves about £${round(100 * deduct.rate)} at your rate`'));

// THE SHARED FUNCTION ITSELF. Each arm, separately, so one cannot cover for the other.
sabotage('the company arm hands back the personal marginal rate',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '  if (!isCompany) return { rate: marginalRate(personalTotalIncome), whose: \'you\' };',
    '  if (!isCompany) return { rate: marginalRate(personalTotalIncome), whose: \'you\' };\n  return { rate: marginalRate(companyProfit), whose: \'company\' };'));

sabotage('the company rate is hardcoded to the small profits rate, so marginal relief goes wrong',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '    rate: (corporationTax(profit) - corporationTax(profit - step)) / step,',
    '    rate: 0.19,'));

sabotage('the company rate is differenced over £1, which rounding turns into the wrong answer',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '  const step = Math.min(100, profit);',
    '  const step = Math.min(1, profit);'));

sabotage('a company with no profit is quoted a rate on nothing',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    "  if (profit <= 0) return { rate: 0, whose: 'company' };",
    "  if (profit < 0) return { rate: 0, whose: 'company' };"));

// THE SOLE TRADER MUST NOT MOVE. This fix is for one structure and must cost the other nothing.
sabotage('the sole trader is quietly given the company treatment too',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    "  const isCompany = input.businessType === 'limited_company';",
    '  const isCompany = true;'));

// ── F3. THE EMPLOYMENT ALLOWANCE. ────────────────────────────────────────────────────────────

// THE ORIGINAL DEFECT: the question does not exist, so nothing can ever be asked.
sabotage('the Employment Allowance question is removed entirely',
  (d) => edit(d, 'lib/circumstances.ts',
    "    key: 'other_wages',", "    key: 'other_wages_removed',"));

sabotage('the question is opened to every structure, so a solo sole trader is taxed with it',
  (d) => edit(d, 'lib/circumstances.ts',
    "    structures: ['limited_company'],\n    key: 'other_wages',",
    "    key: 'other_wages',"));

// THE WORDING TRAP THAT MADE IT TO THE SECOND DRAFT: an unknown structure is asked everything, so
// "the company" would have asked a sole trader about a company he does not have.
sabotage('the question goes back to saying "the company"',
  (d) => edit(d, 'lib/circumstances.ts',
    "ask: 'Does anybody else draw a wage from the business?',",
    "ask: 'Does anybody else draw a wage from the company?',"));

sabotage('the reason loses the figure, so the question stops being worth answering',
  (d) => edit(d, 'lib/circumstances.ts',
    'takes up to £10,500 a year off its employer National Insurance bill',
    'reduces its employer National Insurance bill'));

// THE SCREEN. Each arm separately, because one arm covering for another is how a guard passes
// while a customer is told nothing.
sabotage('the screen stops naming the allowance at all, which is the state it shipped in',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    "? 'Your company can claim the Employment Allowance, because somebody else draws a wage from it. That is up to £10,500 a year off this bill, and on these figures it covers the whole of it. The figures above do not take it off yet, so treat this line as the most you would pay rather than what you owe.'",
    "? ''"));

sabotage('the unsure arm goes quiet, which is the arm every customer starts in',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    ': \'If anybody else draws a wage from the business, your company can claim the Employment Allowance, up to £10,500 a year, and on these figures that would cover this bill entirely. We have to ask before we can count it, because a company whose only employee is its director cannot claim it.\'}',
    ": ''}"));

sabotage('the yes arm stops admitting the figures above do not include it',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    'The figures above do not take it off yet, so treat this line as the most you would pay rather than what you owe.',
    'That is worth knowing.'));

sabotage('the no arm stops giving the reason',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    'A company whose only employee is its director cannot claim the Employment Allowance, so this one stands as it is. If you take somebody on, tell us and it changes.',
    'This one stands as it is.'));

// A NAME IN A FILE IS NOT A WIRING. Kill the read and the threading separately.
sabotage('the page stops reading the answers, so every arm silently becomes the unsure one',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    '    readCircumstances(user.id).catch(() => null),',
    '    Promise.resolve(null),'));

sabotage('a failed read is treated as a "no", which tells him a bill is settled when it may not be',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    "const otherWages: 'yes' | 'no' | null = raw === 'yes' || raw === 'no' ? raw : null;",
    "const otherWages: 'yes' | 'no' | null = raw === 'yes' ? 'yes' : 'no';"));

sabotage('the answer stops being threaded into the component that draws the line',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    'otherWages={otherWages} />', 'otherWages={null} />'));

// ⚠️ THE SLICE ITSELF. If the sentence is moved OUT of the employer NI block it must go red, or
// the guard is only proving the words exist somewhere in the file. Run 5 shipped exactly that.
sabotage('🔴 the allowance line is moved out of the employer NI block to elsewhere on the page',
  (d) => {
    edit(d, 'app/app/pay-yourself/page.tsx',
      "            {otherWages === 'yes'", "            {false && otherWages === 'yes'");
  });

// ── F1. THE FOLDS WITH NO MARKER. ────────────────────────────────────────────────────────────

// THE ORIGINAL DEFECT, put back exactly: a summary with display:flex and no class to reach it.
sabotage('the summaries lose their class, which is the state production was in',
  (d) => edit(d, 'app/app/you/page.tsx',
    '<summary className="lek-fold-top" style={S.foldTop}>', '<summary style={S.foldTop}>'));

sabotage('the details lose theirs, so the chevron can never turn over',
  (d) => edit(d, 'app/app/you/page.tsx',
    '<details className="lek-card lek-fold" style={S.fold}>',
    '<details className="lek-card" style={S.fold}>'));

sabotage('the chevron itself is deleted and only the marker kill is left, which is worse than before',
  (d) => edit(d, 'app/app/you/page.tsx',
    "  `.lek-fold-top::after{content:'';flex:none;", "  `.lek-fold-top-unused::after{content:'';flex:none;"));

sabotage('the native marker is left alive to fight the drawn one',
  (d) => edit(d, 'app/app/you/page.tsx',
    '  `.lek-fold-top::-webkit-details-marker{display:none}`,', '  ``,'));

sabotage('list-style:none is dropped, so Firefox keeps its own triangle as well',
  (d) => edit(d, 'app/app/you/page.tsx',
    '  `.lek-fold-top{list-style:none}`,', '  ``,'));

sabotage('the open state stops turning the chevron over',
  (d) => edit(d, 'app/app/you/page.tsx',
    '  `.lek-fold[open]>.lek-fold-top::after{transform:rotate(-135deg) translateY(2px)}`,', '  ``,'));

sabotage('a typed duration replaces the token, which tokens.ts exists to stop',
  (d) => edit(d, 'app/app/you/page.tsx',
    'transition:transform ${MOTION.enter} ${MOTION.ease}', 'transition:transform 180ms ease'));

sabotage('the reduced motion escape is removed',
  (d) => edit(d, 'app/app/you/page.tsx',
    '  `@media(prefers-reduced-motion:reduce){.lek-fold-top::after{transition:none}}`,', '  ``,'));

// ⚠️ THE SWEEP MUST BITE ON A PAGE THAT IS NOT /app/you, or it is a one page guard wearing a
// sweep's name. This breaks the DIARY fold instead, the one that currently keeps its native
// marker, by giving its summary a display override with nothing to draw a marker into.
sabotage('🔴 A DIFFERENT PAGE BREAKS ITS FOLD THE SAME WAY, and the sweep has to catch that too',
  (d) => edit(d, 'app/app/diary/page.tsx',
    "  foldTop: { fontSize: TYPE.note, fontWeight: 700, color: RIVER, cursor: 'pointer' },",
    "  foldTop: { fontSize: TYPE.note, fontWeight: 700, color: RIVER, cursor: 'pointer', display: 'flex' },"));

// ── F4. THE VAT STATUTORY TESTS. ─────────────────────────────────────────────────────────────

// THE ORIGINAL DEFECT: the screen does not carry them at all.
sabotage('the backward look is dropped from the screen again',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    '          <p style={S.body}>{BACKWARD_TEST}</p>\n', ''));

sabotage('the forward look is dropped, which is the one that registers her the same day',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    '          <p style={S.body}>{FORWARD_TEST}</p>\n', ''));

sabotage('the source link is dropped, so the screen asserts the law with nothing behind it',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    'https://www.gov.uk/vat-registration/when-to-register', 'https://www.gov.uk/'));

// A COPY OF A SENTENCE IS NOT THE SENTENCE. The constants are owned in one module precisely so a
// screen cannot grow its own wording, and this proves the screen still asks that module.
sabotage('the screen grows its own wording instead of asking the module that owns it',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    '<p style={S.body}>{BACKWARD_TEST}</p>',
    '<p style={S.body}>You must register once you go over the threshold.</p>'));

// GATING IS THE SUBTLE ONE. Hidden behind nearLine, a customer far from the line learns nothing,
// and hidden behind a successful read, a failed read silently repeals the law.
sabotage('the tests are hidden behind nearLine, the way the card fee note is',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    '          <p style={S.body}>{BACKWARD_TEST}</p>',
    '          {nearLine ? <p style={S.body}>{BACKWARD_TEST}</p> : null}'));

sabotage('🔴 the tests are moved above the turnover arms, so a failed read loses them',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    '          {haveStanding ? (',
    '          <p style={S.body}>{BACKWARD_TEST}</p>\n          {haveStanding ? ('));

// THE STYLE KEY THAT TYPECHECKS WHILE ABSENT. S is Record<string, CSSProperties>.
sabotage('the source link style key is removed, which tsc stays silent about',
  (d) => edit(d, 'app/app/tax/vat/page.tsx',
    "  inlineLink: { color: RIVER, fontWeight: 700, textDecoration: 'none' },", ''));

// THE WIDENING MUST NOT BE A MOVE. WhatsApp keeps both.
sabotage('the tests are taken off WhatsApp now the web has them, which is a move not a widening',
  (d) => edit(d, 'app/api/whatsapp/route.ts',
    '  parts.push(BACKWARD_TEST);\n', ''));

// ── F6. THE TWENTY FOUR HOUR DAY. ────────────────────────────────────────────────────────────

// THE ORIGINAL DEFECT: raw calendar hours printed at a customer.
sabotage('the job screen goes back to printing raw hours for a day long slot',
  (d) => edit(d, 'lib/jobphotos.ts',
    '  if (hours >= 24) return dayPhrase ? `About ${dayPhrase}, from your diary` : null;\n', ''));

sabotage('a missing phrase falls back to the hour count instead of saying nothing',
  (d) => edit(d, 'lib/jobphotos.ts',
    'return dayPhrase ? `About ${dayPhrase}, from your diary` : null;',
    'return `About ${dayPhrase ?? `${hours}h`}, from your diary`;'));

sabotage('the threshold moves, so a day slot slips back into the hours arm',
  (d) => edit(d, 'lib/jobphotos.ts', 'if (hours >= 24)', 'if (hours >= 25)'));

// A PARAMETER NOTHING PASSES IS A DEFAULT. Kill the wiring at the call site.
sabotage('the page stops handing the words over, so the new arm is never reached',
  (d) => edit(d, 'app/app/diary/page.tsx',
    'hoursGuessPhrase(hours, job ? durationPhrase(job.startsAt, job.endsAt) : null)',
    'hoursGuessPhrase(hours)'));

// TWO COPIES OF A RULE DRIFT. The screen must ask durationPhrase, not restate it.
sabotage('the job screen grows its own words instead of asking durationPhrase',
  (d) => edit(d, 'app/app/diary/page.tsx',
    'hoursGuessPhrase(hours, job ? durationPhrase(job.startsAt, job.endsAt) : null)',
    "hoursGuessPhrase(hours, job ? 'one day' : null)"));

// ⚠️ THE IMPORT FREE PROPERTY, which the first attempt at this fix broke. One import fails the
// whole jobdiary suite with a module not found, because it imports this file directly off disk.
sabotage('🔴 an import is added to lib/jobphotos.ts, exactly as the first draft of this fix did',
  (d) => edit(d, 'lib/jobphotos.ts',
    'const HOUR_MS', "import { durationPhrase } from './diary';\n\nconst HOUR_MS"));

// ── F2. THE GLUED FIGURES AND THE CHECK THAT READS THE BUILD. ────────────────────────────────

// THE THREE SITES, put back one at a time. The source looks right either way, which is exactly why
// this survived a 236 suite gate.
sabotage('pay-yourself loses its explicit space again',
  (d) => edit(d, 'app/app/pay-yourself/page.tsx',
    "{gbp0(best.ctProfit)}{' '}of profit", '{gbp0(best.ctProfit)} of profit'));

sabotage('tax/summary loses its explicit space again',
  (d) => edit(d, 'app/app/tax/summary/page.tsx',
    "{pack.taxYear}{' '}added up", '{pack.taxYear} added up'));

sabotage('proof-of-income loses its explicit space again',
  (d) => edit(d, 'app/app/proof-of-income/page.tsx',
    "{gbp2(proof.cisDeducted)}{' '}of tax was taken", '{gbp2(proof.cisDeducted)} of tax was taken'));

// THE SCANNER ITSELF. If it stops detecting, the CI step is a green tick over nothing.
sabotage('the scanner stops recognising the call form the compiler emits',
  (d) => edit(d, 'scripts/check-glued-figures.mjs',
    'const re = /([\\w)\\]])\\s*,\\s*"([a-zA-Z][^"\\\\]{6,})"/g;',
    'const re = /([\\w])\\s*,\\s*"([a-zA-Z][^"\\\\]{6,})"/g;'));

// ⚠️ TWO EARLIER VERSIONS OF THIS SABOTAGE COULD NOT BITE, and both sat there GREEN pretending to
// be holes in the guard. Relaxing the prose filter did nothing because the CAPTURE already refuses
// a leading space; relaxing the capture did nothing because the FILTER then refuses it. Two
// independent defences, which is why the correct form was never at risk. So this one removes the
// defence that IS load bearing: the children array proximity check, without which any array of
// strings anywhere in a bundle becomes a finding.
sabotage('the scanner stops requiring a children array, so any string array becomes a finding',
  (d) => {
    const f = 'scripts/check-glued-figures.mjs';
    const src = readFileSync(path.join(d, f), 'utf8');
    const line = src.split('\n').find((l) => l.includes('children') && l.includes('continue;'));
    if (!line) throw new Error('ANCHOR MISSING: the children array proximity check is gone');
    writeFileSync(path.join(d, f), src.replace(line + '\n', ''));
  });

sabotage('the scanner stops skipping line breaks, so every <br/> becomes a false finding',
  (d) => edit(d, 'scripts/check-glued-figures.mjs',
    'if (/jsx\\)\\("br"/.test(before)) continue;', ''));

// 🔴 THE RUN 5 SIGNATURE FAILURE. A check that cannot see its input must never report success.
sabotage('🔴 A MISSING BUILD IS TREATED AS A PASS, which is how a job removed live data in Run 5',
  (d) => edit(d, 'scripts/check-glued-figures.mjs',
    '    process.exit(1);\n  }\n  const hits = [];', '    process.exit(0);\n  }\n  const hits = [];'));

sabotage('an empty chunk directory is treated as a pass',
  (d) => edit(d, 'scripts/check-glued-figures.mjs',
    'if (scanned === 0) {', 'if (scanned === -1) {'));

sabotage('the scanner finds glued figures and exits zero anyway',
  (d) => edit(d, 'scripts/check-glued-figures.mjs',
    "      + '  already does in sixteen places in these same files.\\n\\n',\n    );\n    process.exit(1);",
    "      + '  already does in sixteen places in these same files.\\n\\n',\n    );\n    process.exit(0);"));

// ── NO OP CONTROLS. These change nothing that matters and MUST stay green, or this runner is
//    only detecting that a file was touched at all. ───────────────────────────────────────────

sabotage('CONTROL: a comment reworded changes nothing',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '// A rule only holds where it is pointed, and this one was pointed at taxPosition().',
    '// A rule holds only where it is pointed, and this one was pointed at taxPosition().'), false);

sabotage('CONTROL: whitespace in the deductibleSaving body changes nothing',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '  const profit = Math.max(0, companyProfit);',
    '  const profit = Math.max(0, companyProfit);\n'), false);

sabotage('CONTROL: renaming the local binding changes nothing',
  (d) => edit(d, 'lib/taxoptimiser.ts',
    '  const deduct = deductibleSaving(isCompany, projTradeNet, projTotalIncome);',
    '  const deductible = deductibleSaving(isCompany, projTradeNet, projTotalIncome);\n  const deduct = deductible;'), false);

const EXPECTED = 56;
process.stdout.write(`\n  ${applied} applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== EXPECTED) {
  process.stdout.write(`  COUNT WRONG: expected ${EXPECTED} sabotages to apply, got ${applied}\n`);
  process.exit(1);
}
