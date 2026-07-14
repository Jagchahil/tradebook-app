// 🔴 PROOF. AND THE WORD WE ARE NEVER ALLOWED TO USE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WE DO NOT VERIFY. WE CORROBORATE. THE DIFFERENCE IS WHO IS LIABLE.
//
// "Verified" is a WARRANTY: we checked this, and we vouch for it. It is what an auditor says after
// doing work an auditor is insured to do.
//
// What we actually do is look at a photograph. A photo of a P60 can be somebody else's P60. It can be
// a forgery made in twenty minutes. It can be last year's, or a duplicate, or a genuine document for
// a genuine job that has nothing to do with the relief being claimed. NO CRYPTOGRAPHIC VERIFICATION
// EXISTS FOR ANY OF THESE DOCUMENTS. There is no signature to check. There is nothing to check it
// AGAINST.
//
// So a green tick reading VERIFIED is a warranty this company cannot honour. He relies on it. He
// files. And under Finance Act 2026 Sch 22, an assurance we cannot support is not a neutral bit of
// marketing: it is the thing that caused the loss of tax revenue.
//
// What we CAN say is narrower and still worth a lot:
//
//     "You told me you were employed until March. The P60 you sent says the same thing."
//
// Two independent things agree. That is corroboration. It is what a good accountant actually has in
// his file, and it is not proof, and we do not pretend it is.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND THE SECOND RULE, WHICH SAVES HIM AN EVENING:
// A DOCUMENT WE DO NOT NEED IS A DOCUMENT WE DO NOT ASK FOR.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// proof.ts imports circumstances.ts by extensionless specifier (Next resolves it; bare node does
// not). Stage a copy with the extension patched in, exactly as the engine suites do.
const { mkdtempSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const stage = mkdtempSync(path.join(tmpdir(), 'proof-'));
for (const f of ['circumstances', 'proof']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')
      .replace("from './circumstances'", "from './circumstances.ts'"),
  );
}
const P = await import(pathToFileURL(path.join(stage, 'proof.ts')).href);
const C = await import(pathToFileURL(path.join(stage, 'circumstances.ts')).href);
const { SAYS, asks, corroborate, tick, NEVER_ASK_FOR } = P;
const { CIRCUMSTANCES } = C;

const read = (p) => readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const proofCode = strip(read('lib/proof.ts'));

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nproof: corroborate, never verify');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE WORD. It is not in the type, and it is not on a screen.
// ---------------------------------------------------------------------------------------------

ok('🔴 THERE IS NO "verified" STANDING. Not as an oversight. As a refusal.',
  // If a future hand adds one it will be because somebody wanted a nicer word for the tick, and the
  // tick will then be a warranty on a document we cannot authenticate.
  !/'verified'|"verified"|verified:/i.test(proofCode));

ok('the ladder has three rungs and the top one is CORROBORATED',
  Object.keys(SAYS).length === 3
  && 'asserted' in SAYS && 'corroborated' in SAYS && 'conflicts' in SAYS);

ok('🔴 EVERY RUNG IS A CLAIM ABOUT WHAT WE SAW, NEVER ABOUT WHAT IS TRUE',
  // "You told me this, and the document you sent says the same." That is a fact about our own
  // reading. It is the only kind of fact we are actually in a position to assert.
  SAYS.asserted.startsWith('You told me')
  && SAYS.corroborated.includes('the document you sent says the same')
  && !/verified|proven|confirmed|guaranteed/i.test(Object.values(SAYS).join(' ')));

ok('🔴 THE GREEN TICK SAYS "Matches what you told me". It does not say VERIFIED.',
  tick('corroborated').mark === '✓'
  && tick('corroborated').label === 'Matches what you told me');

ok('...and a CONFLICT is not a red cross and not an accusation',
  // Most conflicts are a photo of the wrong year. A product that accuses him gets no more photographs.
  tick('conflicts').mark !== '✗'
  && /worth a look/i.test(tick('conflicts').label)
  && !/wrong|invalid|rejected|failed|fraud/i.test(tick('conflicts').label));

ok('🔴 AND THE WORD IS GONE FROM THE SIGNUP PAGE TOO',
  // It said, in production: "We will verify your company details for you." We do not verify. We read
  // the public Companies House register back to him. If that register is wrong, or he types a name
  // that matches someone else's company, we have "verified" precisely nothing and he has our word.
  !/We will verify your company details/i.test(strip(read('app/start/page.tsx'))));

ok('...and it now says what we actually do, which is still the good bit',
  /look your company up on the Companies House register/i.test(strip(read('app/start/page.tsx'))));

// ---------------------------------------------------------------------------------------------
// 🔴 2. A DOCUMENT WE DO NOT NEED IS A DOCUMENT WE DO NOT ASK FOR.
// ---------------------------------------------------------------------------------------------

const all = asks();

ok('every circumstance says what HMRC would actually want, and several say NOTHING',
  all.length === CIRCUMSTANCES.length && all.some((a) => a.nothingNeeded));

ok('🔴 MARRIAGE NEEDS NO DOCUMENT AT ALL, and we know it',
  // HMRC wants two National Insurance numbers. It has never wanted a certificate. Asking for one
  // wastes his evening, tells him we do not know the rules, and leaves us holding a document nobody
  // needed. Every document we hold is a document we must secure, retain lawfully, and delete on
  // request. Collecting paperwork FEELS like diligence. It is a liability.
  all.find((a) => a.key === 'married').nothingNeeded === true
  && all.find((a) => a.key === 'partner_low_earner').nothingNeeded === true);

ok('...and the refusal is written down, with the reason, so nobody helpfully adds it back',
  NEVER_ASK_FOR.some((n) => /marriage certificate/i.test(n.what))
  && NEVER_ASK_FOR.every((n) => n.why.length > 40));

ok('we never ask for a bank login either, and we say why',
  NEVER_ASK_FOR.some((n) => /bank login/i.test(n.what) && /READ ONLY/i.test(n.why)));

ok('the health document is flagged sensitive, and it is the ONLY one',
  all.filter((a) => a.sensitive).length === 1
  && all.find((a) => a.sensitive).key === 'blind');

// ---------------------------------------------------------------------------------------------
// 🔴 3. CORROBORATION. Two things agree, or they do not.
// ---------------------------------------------------------------------------------------------

ok('nothing sent means ASSERTED, and that is a complete answer, not a failure',
  // Most reliefs here need no document. For those, "you told me" IS the correct evidential position.
  // A product that treats an unproven assertion as a failure state starts asking for paperwork to
  // fill the gap, and the paperwork is paperwork nobody wanted.
  corroborate('married', 'yes', null).standing === 'asserted');

ok('a document that AGREES corroborates. It does not verify.',
  corroborate('prior_employment', 'Employed until March 2025', 'Employed until March 2025').standing === 'corroborated');

ok('a document that DISAGREES is the most valuable state in the file, and it is named',
  corroborate('prior_employment', 'Employed until March 2025', 'Employed until March 2023').standing === 'conflicts');

ok('🔴 WE NAME WHAT WE COMPARED, so he can see our reasoning and tell us we misread it',
  // A tick with no reasoning is a tick he cannot argue with, and HE is the one who signs the return.
  (() => {
    const r = corroborate('prior_employment', 'Employed until March 2025', 'Employed until March 2023');
    return r.basis.includes('You said "Employed until March 2025"')
      && r.basis.includes('The document reads "Employed until March 2023"');
  })());

ok('whitespace and case are not a conflict. A man is not wrong for typing in capitals.',
  corroborate('prior_employment', 'employed until march 2025', '  Employed  Until March 2025 ').standing === 'corroborated');

ok('🔴 A HEALTH DOCUMENT IS READ AND DROPPED. It is not filed, not retained, not kept "in case".',
  // Article 9. The circumstances chain already refuses to carry it over WhatsApp in either direction.
  // Holding the image afterwards would undo all of that for the sake of a filing cabinet.
  corroborate('blind', 'yes', 'CVI issued 2024').deleteAfterReading === true);

ok('...and an ordinary document is not needlessly deleted, because that is not a virtue either',
  corroborate('prior_employment', 'yes', 'P60 2025').deleteAfterReading === false);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE WORD IS NOWHERE ON A USER-FACING SCREEN.
// ---------------------------------------------------------------------------------------------

const screens = readdirSync(path.join(root, 'app'), { recursive: true })
  .filter((f) => typeof f === 'string' && /\.tsx$/.test(f))
  .map((f) => ({ f, src: strip(read(path.join('app', f))) }));

const offenders = screens.filter(({ src }) =>
  // Identity verification at Companies House is a REAL thing HMRC and CH require, and describing it
  // is correct. Phone/email verification is a real thing we really do. What is forbidden is claiming
  // WE have verified a FACT or a DOCUMENT for him.
  /we (will |have |can )?verif(y|ied)\s+(your|his|the)\s+(company|details|documents?|receipts?|claim|expenses?|figures)/i.test(src));

ok('🔴 NO SCREEN CLAIMS WE VERIFY HIS FACTS, HIS DOCUMENTS OR HIS FIGURES',
  offenders.length === 0);

ok('...but describing Companies House identity verification is still allowed, because that is real',
  // It is a legal requirement on every director since late 2025 and telling him about it is a service.
  // The rule is not "never say the word". It is "never claim the warranty".
  screens.some(({ src }) => /verify your identity/i.test(src)));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
