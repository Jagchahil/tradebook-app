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

ok('findSic still returns the generic fallback for gibberish, so the UI is never left with nothing',
  findSic('xyxyxyxyx').length === 1);

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

ok('the copy tells him plainly that HE confirms it, we are not filing it',
  /You will confirm it yourself there/.test(startSrc));

ok('there is a way to see another suggestion rather than us silently keeping the first guess',
  /Not quite right\? Try another/.test(startSrc) && /setSicPick/.test(startSrc));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
