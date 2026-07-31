// AI SIC CODE MATCHING, wired into /start. lib/siccodes.findSic already existed and already powers
// the public register-your-business tool; this suite covers the NEW piece: sicByCode (the integrity
// check a server uses so a posted code can never arrive with a made up label attached), and that the
// onboarding path only ever stores OUR label for a code, never whatever text a client sent.
//
// The one rule that matters most: THIS IS INFORMATION, NOT A FILING. Nothing here ever submits a SIC
// code to Companies House. The person confirms it themselves when they register. If that copy, or
// the "only after he has seen it" gate, ever disappears, this suite should catch it.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sic = await import(pathToFileURL(path.join(root, 'lib/siccodes.ts')).href);
const { sicByCode, findSic, TRADE_SIC } = sic;

const supabaseSrc = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
const onboardSrc = readFileSync(path.join(root, 'app/api/onboard/route.ts'), 'utf8');
const startSrc = readFileSync(path.join(root, 'app/start/page.tsx'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

// Comments stripped before asking what a CUSTOMER reads: the old SIC sentence survives in a
// comment explaining why it was wrong, and a check that cannot tell the argument from the copy
// gets deleted, not fixed.
const codeOnlyStart = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('\nsignup SIC matching: information, never a filing');

// ---------------------------------------------------------------------------------------------
// sicByCode() — the integrity check. A code is real or it is null. Never a guess, never fuzzy.
// ---------------------------------------------------------------------------------------------

ok('a known primary code resolves to OUR label',
  sicByCode('43220')?.label === 'Plumbing, heat and air conditioning installation');

ok('a known ALT code resolves too, not just the primary of each trade',
  sicByCode('43999')?.code === '43999');

ok('a code nobody publishes is refused, not guessed at',
  sicByCode('00000') === null);

ok('empty and whitespace are refused the same way',
  sicByCode('') === null && sicByCode('   ') === null);

ok('every code findSic can ever return also resolves via sicByCode, so the two never disagree',
  TRADE_SIC.every((t) => sicByCode(t.code)?.code === t.code));

// 🔴 REVERSED ON 27 JULY 2026. This used to assert the OPPOSITE, and the old reasoning was
// "so the UI is never left with nothing".
//
// That is the wrong instinct for this particular field. The fallback was TRADE_SIC's last entry,
// 43999 "Other specialised construction", and app/start renders whatever comes back under the
// heading "Your likely SIC code". So a cafe, a restaurant and the literal string "qwertyuiop"
// were all being told, confidently, that they were specialised construction, and that code goes
// onto a Companies House incorporation filing.
//
// An empty UI is not a failure here, it is the honest answer. Every other part of this codebase
// already works this way: weeklyupdate prints nothing rather than invent a deadline, ledger says
// "not enough" rather than draw a confident number, announcements drops a summary whole rather
// than render half a rule. app/start renders no card when sicChoice is null, which is correct.
ok('findSic gives NO suggestion rather than a wrong one, for anything it cannot match',
  ['xyxyxyxyx', 'qwertyuiop', 'Cafe', 'Restaurant', 'Coffee shop'].every((q) => findSic(q).length === 0));

ok('a real trade still matches, so the rule above is not just breaking the matcher',
  findSic('Electrician')[0]?.code === '43210' && findSic('barber')[0]?.code === '96020');

ok('no returned suggestion is ever the generic construction catch all for a non construction trade',
  findSic('online seller').every((t) => t.code !== '43999'));

// ---------------------------------------------------------------------------------------------
// The server side: the LABEL is always re-derived, never trusted as free text from the client.
// ---------------------------------------------------------------------------------------------

ok('createSignup derives the label from sicByCode(signup.sic_code), not from any sic_label field',
  /sicByCode\(signup\.sic_code\)/.test(supabaseSrc));

ok('OnboardSignup carries a code, and there is no sic_label field a caller could set directly',
  /sic_code\?:\s*string \| null/.test(supabaseSrc) && !/sic_label\?:/.test(supabaseSrc));

ok('a code that fails sicByCode is simply dropped, not stored half-formed',
  /if \(sic\) \{ record\.sic_code = sic\.code; record\.sic_label = sic\.label; \}/.test(supabaseSrc));

ok('the onboard API passes through a sanitised code string, and invents no label of its own',
  /sic_code: str\(b\.sicCode/.test(onboardSrc) && !/sic_label/.test(onboardSrc));

// ---------------------------------------------------------------------------------------------
// The client: only shown, and only sent, once he has actually seen it. Never for a sole trader,
// who Companies House never asks (lib/siccodes says so in its own header comment).
// ---------------------------------------------------------------------------------------------

ok('the suggestion only computes for a limited company, never a sole trader or "a business name"',
  /tradeType === 'ltd' && effectiveTrade\.trim\(\)\.length > 1/.test(startSrc));

ok('the payload sends the code only when a suggestion actually rendered, never a bare guess',
  /sicCode: sicChoice \? sicChoice\.code : undefined/.test(startSrc));

// ⚠️ REWORDED 31 JULY. The old sentence said "when you register your limited company" to a man
// whose ltd option reads "I have a registered company": a lecture about registering a company he
// already has. The claim that matters survives the rewording and is pinned here: we file nothing,
// and the register's own entry is the record, not our match.
ok('the copy tells him plainly that we are not filing it and the register is the record',
  /We never file it anywhere/.test(startSrc) && /the one that counts/.test(startSrc));
ok('🔴 and it no longer lectures a man who already has a company about registering one',
  !/when you register your limited company/.test(codeOnlyStart(startSrc)));

ok('there is a way to see another suggestion rather than us silently keeping the first guess',
  /Not quite right\? Try another/.test(startSrc) && /setSicPick/.test(startSrc));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
