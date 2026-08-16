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

// ── F10. THE CLAIM CORPUS READ BY A DIRECTOR. ────────────────────────────────────────────────

// THE ORIGINAL DEFECT, in the words that were on the page and on the phone on 16 August.
sabotage('the tools card tells every reader the cash basis is the method they are on',
  (d) => edit(d, 'lib/claimrules.data.ts',
    'On the cash basis, which sole traders and partnerships can use, that is simply how a cost works.',
    'On the cash basis, which is the standard method for sole traders and what most people here are on, that is simply how a cost works.'));

// The half that makes the card true for a company, removed on its own. This is the shape guard,
// not the sentence guard: nothing false is said, one reader is simply left out.
sabotage('the accruals half of the tools card is dropped, leaving a company reader unaddressed',
  (d) => edit(d, 'lib/claimrules.data.ts',
    ' On the accruals basis, which is what a limited company always uses, the same result comes through the Annual Investment Allowance, up to £1 million.',
    ''));

sabotage('the bank charges card names the cash basis and only the cash basis again',
  (d) => edit(d, 'lib/claimrules.data.ts',
    'The old cap on interest under the cash basis, which only ever applied to sole traders and partnerships, was removed on 6 April 2024, and it never applied on the accruals basis a limited company uses.',
    'The old cap on interest under the cash basis was removed on 6 April 2024.'));

sabotage('a tax tip carries the cash basis on its own, which is the same defect in a shorter dress',
  (d) => edit(d, 'lib/claimrules.data.ts',
    "body: 'The whole cost of tools, equipment and a van comes off the year you pay for it, not spread over years. On the cash basis that is simply how a cost works; on the accruals basis it is the Annual Investment Allowance.'",
    "body: 'The whole cost of tools, equipment and a van comes off the year you pay for it, not spread over years. On the cash basis that is simply how a cost works.'"));

sabotage('the pension card goes back to answering a question that depends with a flat no',
  (d) => edit(d, 'lib/claimrules.data.ts',
    "rule: 'It depends who pays it. A pension you pay into yourself is not a business cost, though you still get tax relief on it. If you trade through a company, the company can pay in and deduct it against Corporation Tax.'",
    "rule: 'Not an expense, but a tax saver. A personal pension is not a business cost, but it gets you tax relief and cuts your bill.'"));

sabotage('the pension verdict goes back to no while the words stay right',
  (d) => edit(d, 'lib/claimrules.data.ts',
    "    key: 'pension',\n    title: 'Pension contributions',\n    verdict: 'depends',",
    "    key: 'pension',\n    title: 'Pension contributions',\n    verdict: 'no',"));

sabotage('the company arm survives in the headline but loses the National Insurance, which is half its value',
  (d) => edit(d, 'lib/claimrules.data.ts',
    ', and there is no National Insurance on it at either end',
    ''));

sabotage('the PTM source is deleted and the company arm is back to being our opinion',
  (d) => edit(d, 'lib/rulesources.ts',
    "      code: 'PTM043100',",
    "      code: 'PTM043101',"));

// ⚠️ THE SILENT ONE. Nothing renders differently. Khoji simply never finds the sentence again and
// alarms every night forever on a citation that is word for word right.
sabotage('the PTM quote is trimmed short and given a full stop of its own',
  (d) => edit(d, 'lib/rulesources.ts',
    "investment business, and so reducing the amount of an employer's taxable profit.\",",
    "investment business.\","));

sabotage('the PTM citation points somewhere that is not gov.uk',
  (d) => edit(d, 'lib/rulesources.ts',
    "url: 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm043100',",
    "url: 'https://www.pensionsadvisoryservice.org.uk/ptm043100',"));

sabotage('the wholly and exclusively cards go back to naming the sole trader Act alone',
  (d) => edit(d, 'lib/rulesources.ts',
    "authority: 'S34(1)(a) ITTOIA 2005; S54(1)(a) CTA 2009; Mallalieu v Drummond [1983] 57 TC 330 (HL)',",
    "authority: 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)',"));

sabotage('pre trading loses its company section',
  (d) => edit(d, 'lib/rulesources.ts',
    "authority: 'S57 ITTOIA 2005; S61 CTA 2009 (pre-trading expenses)',",
    "authority: 'S57 Income Tax (Trading and Other Income) Act 2005',"));

// ⚠️ THE OPPOSITE MISTAKE, and the reason 8d holds a written down exception rather than a blanket
// rule. Pairing every card with a CTA section looks tidier and points a director at a section that
// says close to the opposite of what the card grants her.
sabotage('bad debts gets a tidy CTA sibling that restricts the deduction the card grants',
  (d) => edit(d, 'lib/rulesources.ts',
    "authority: 'S35 Income Tax (Trading and Other Income) Act 2005',",
    "authority: 'S35 ITTOIA 2005; S55 CTA 2009 (bad debts)',"));

sabotage('the signed in page stops rendering the detail, so the company arm never reaches her',
  (d) => edit(d, 'app/app/tax/can-i-claim/page.tsx',
    '<p style={S.ruleDetail}>{r.detail}</p>',
    '<p style={S.ruleDetail}>{r.rule}</p>'));

sabotage('the public page stops rendering the detail too',
  (d) => edit(d, 'app/can-i-claim/page.tsx',
    '{r.detail}</p>',
    '{r.title}</p>'));

// And the citation voice guard itself, which is what let PTM through in the first place.
sabotageIn('citationvoice', 'a citation shouts a word that is not an HMRC manual code',
  (d) => edit(d, 'lib/rulesources.ts',
    "code: 'PTM043100',",
    "code: 'PENSIONS MANUAL 043100',"));

sabotageIn('citationvoice', 'the acronym whitelist is opened up to anything in capitals',
  (d) => edit(d, 'test/citationvoice.test.mjs',
    'if (token.length >= 3 && token === token.toUpperCase() && !ACRONYMS.has(token)) {',
    'if (false && token.length >= 3 && token === token.toUpperCase() && !ACRONYMS.has(token)) {'));

// ── F9. THE INVOICE AND THE RULES THAT APPLY TO EVERYBODY. ───────────────────────────────────
//
// ⚠️ THE SCRATCH COPY NEEDS supabase/ FOR THESE. Section 9e reads the migration off disk, and a
// missing file there would take the whole suite down and read as every guard working at once.

// THE ORIGINAL DEFECT, the line as it stood on production this morning, in both renderings.
sabotage('the supply date goes back inside the carriesVat branch on the page',
  (d) => edit(d, 'app/invoice/[id]/page.tsx',
    '  const workedOn = prettyDate(invoice.supply_date);',
    '  const workedOn = carriesVat ? prettyDate(invoice.supply_date) : null;'));

sabotage('the file the customer is forwarded loses the supply date, so the two renderings differ',
  (d) => edit(d, 'lib/invoicepdf.ts',
    '  if (invoice.supply_date) {\n    page.textRight(RIGHT, rightY, `Work done ${dateWords(invoice.supply_date)}`, { size: 10, grey: 0.35 });\n    rightY += 14;\n  }',
    ''));

sabotage('the file loses the customer address',
  (d) => edit(d, 'lib/invoicepdf.ts',
    '  for (const line of addressLines) {\n    page.text(MARGIN, leftY, line, { size: 9, grey: 0.4 });\n    leftY += 11;\n  }',
    ''));

sabotage('the page stops printing the customer address',
  (d) => edit(d, 'app/invoice/[id]/page.tsx',
    '{invoice.customer_address ? (',
    '{false && invoice.customer_address ? ('));

// ⚠️ THE SILENT ONE, AND IT IS THE SHAPE THAT CAUSED THE SUPPLIER ADDRESS BUG ON THIS SAME PAGE.
// Everything renders. The column simply is not selected, so it arrives undefined forever.
sabotage('the columns exist, the renders exist, and the select never asks the database for them',
  (d) => edit(d, 'lib/supabase.ts',
    'select=number,customer_name,customer_address,customer_contact,line_items,subtotal,tax,total,reverse_charge_vat,vat_treatment,tax_point,supply_date,status',
    'select=number,customer_name,customer_contact,line_items,subtotal,tax,total,reverse_charge_vat,vat_treatment,tax_point,status'));

sabotage('the insert drops the supply date on the floor',
  (d) => edit(d, 'lib/supabase.ts',
    '      supply_date: input.supply_date ?? today.toISOString().slice(0, 10),',
    '      supply_date: null,'));

sabotage('the insert drops the customer address',
  (d) => edit(d, 'app/api/invoices/route.ts',
    '    customer_address: customerAddress,',
    '    customer_address: null,'));

sabotage('the form asks for the address and lets him past without one',
  (d) => edit(d, 'app/app/invoices/new/page.tsx',
    '<textarea id="address" name="address" rows={3} maxLength={300} required className="lek-field" />',
    '<textarea id="address" name="address" rows={3} maxLength={300} className="lek-field" />'));

sabotage('the form asks when the work was done and lets him past without answering',
  (d) => edit(d, 'app/app/invoices/new/page.tsx',
    '<input id="worked_on" name="worked_on" type="date" required max={today} className="lek-field" defaultValue={prefillOn} />',
    '<input id="worked_on" name="worked_on" type="date" max={today} className="lek-field" defaultValue={prefillOn} />'));

sabotage('a supply date in the future can be picked, so work is billed before it is done',
  (d) => edit(d, 'app/app/invoices/new/page.tsx',
    'type="date" required max={today}',
    'type="date" required'));

sabotage('the route stops refusing a form with no address',
  (d) => edit(d, 'app/api/invoices/route.ts',
    '  if (isForm && !customerAddress) {\n    return back(\'problem=address\');\n  }',
    ''));

sabotage('the route stops refusing a form with no supply date',
  (d) => edit(d, 'app/api/invoices/route.ts',
    '  if (isForm && !supply) {\n    return back(\'problem=worked\');\n  }',
    ''));

// ⚠️ THE OPPOSITE MISTAKE, and it is the one that would break WhatsApp for everybody. Demanding
// these of the API blocks a man dictating an invoice one handed, who has no address to give.
sabotage('the address is demanded of the API too, which blocks invoicing from a message',
  (d) => edit(d, 'app/api/invoices/route.ts',
    '  if (isForm && !customerAddress) {',
    '  if (!customerAddress) {'));

sabotage('an unreadable supply date quietly becomes today instead of being refused',
  (d) => edit(d, 'app/api/invoices/route.ts',
    "      return isForm ? back('problem=worked') : NextResponse.json({ error: 'bad_supply_date' }, { status: 400 });",
    '      supply = null;'));

// ⚠️ AND THE OLD WORLD, which is the assertion nobody thinks to write. A sent invoice must not
// change after the fact, so a null must print nothing rather than falling back to a date it never
// carried. This is the same rule vat_treatment null has held on this page since 1 August.
sabotage('a legacy invoice starts printing the issue date wearing a supply date label',
  (d) => edit(d, 'lib/invoicepdf.ts',
    '  if (invoice.supply_date) {\n    page.textRight(RIGHT, rightY, `Work done ${dateWords(invoice.supply_date)}`',
    '  if (invoice.supply_date || invoice.issued_date) {\n    page.textRight(RIGHT, rightY, `Work done ${dateWords(invoice.supply_date || invoice.issued_date)}`'));

sabotage('the migration backfills every sent invoice with a supply date it never had',
  (d) => edit(d, 'supabase/APPLY_2026-08-16_invoice_baseline.sql',
    'alter table public.invoices add column if not exists supply_date date;',
    'alter table public.invoices add column if not exists supply_date date;\nupdate public.invoices set supply_date = issued_date where supply_date is null;'));

sabotage('the diary stops carrying the date it already holds',
  (d) => edit(d, 'app/api/diary/route.ts',
    'if (/^\\d{4}-\\d{2}-\\d{2}$/.test(worked)) bits.push(`on=${worked}`);',
    ''));

sabotage('the form trusts the date out of the URL without checking its shape',
  (d) => edit(d, 'app/app/invoices/new/page.tsx',
    "const prefillOn = /^\\d{4}-\\d{2}-\\d{2}$/.test(onRaw) && !Number.isNaN(Date.parse(onRaw)) ? onRaw : today;",
    'const prefillOn = onRaw || today;'));

// And the rule the invoice form has held since VAT landed, which my own first draft broke.
sabotageIn('invoicesweb', 'the address note mentions VAT to a woman who is not registered',
  (d) => edit(d, 'app/app/invoices/new/page.tsx',
    'every invoice must carry.',
    'every invoice must carry, whether or not you charge VAT.'));

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

const EXPECTED = 92;
process.stdout.write(`\n  ${applied} applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== EXPECTED) {
  process.stdout.write(`  COUNT WRONG: expected ${EXPECTED} sabotages to apply, got ${applied}\n`);
  process.exit(1);
}
