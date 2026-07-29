// WHO GETS A SECOND FREE WEEK, AND WHO MUST NEVER BE REFUSED ONE. See lib/trialidentity.ts.
//
// WHAT THESE TESTS PROTECT
//
// Two opposite mistakes, and they are not the same size.
//
// Letting a chancer take a second trial costs us one month of one subscription. Refusing a
// GENUINE new customer costs us that customer for ever, at the exact moment he was ready to try
// us, and he will never tell us why. lib/entitlement.ts already writes this asymmetry down and
// leans every ambiguous case open. This file is where that lean is pinned.
//
// So the load bearing assertions here are the REFUSALS THAT MUST NOT HAPPEN:
//
//   . two men who share a name are two men
//   . two companies called Smith Electrical are two companies
//   . d.ave@ and dave@ on a private domain may be two colleagues
//
// If any of those ever starts refusing, we are turning away real trade and the signup numbers
// will not tell us which ones, because a man who is refused simply leaves.
//
// The other half is the one that must hold: the SAME MAILBOX is the same man however he spells
// it, because that is the lazy abuse this exists to stop.

import {
  normaliseEmail, normaliseName, normalisePhone, decideTrialGrant, refusalNote,
} from '../lib/trialidentity.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\ntrial identity: who we already know');

// ---------------------------------------------------------------------------------------------
// THE SAME MAILBOX, SPELLED DIFFERENTLY. This is the abuse.
// ---------------------------------------------------------------------------------------------
ok('a plus tag is the same mailbox',
  normaliseEmail('dave+lekhio@example.com') === normaliseEmail('dave@example.com'));
ok('gmail ignores dots, so we do too',
  normaliseEmail('d.a.v.e@gmail.com') === normaliseEmail('dave@gmail.com'));
ok('googlemail is gmail',
  normaliseEmail('dave@googlemail.com') === 'dave@gmail.com');
ok('case and padding do not make a new person',
  normaliseEmail('  DAVE@Example.COM ') === 'dave@example.com');

// ---------------------------------------------------------------------------------------------
// 🔴 THE REFUSAL THAT MUST NOT HAPPEN. A dot is only meaningless on gmail.
//
// On a private domain d.ave@ and dave@ are very often two people at the same firm. Collapsing
// them would refuse a real man because his colleague signed up first.
// ---------------------------------------------------------------------------------------------
ok('a dot on a private domain is NOT stripped, because those may be two colleagues',
  normaliseEmail('d.ave@smithelectrical.co.uk') !== normaliseEmail('dave@smithelectrical.co.uk'));

ok('rubbish in is empty out, never a half address', normaliseEmail('not an email') === '');
ok('an empty local part is empty out', normaliseEmail('@example.com') === '');

// ---------------------------------------------------------------------------------------------
// The number, as evidence rather than as a send target.
// ---------------------------------------------------------------------------------------------
ok('a UK number matches however it is written',
  normalisePhone('07123 456789') === normalisePhone('+447123456789'));
ok('a leading 00 44 is the same number', normalisePhone('00447123456789') === normalisePhone('07123456789'));
ok('something too short is no evidence at all', normalisePhone('0712') === '');

// ---------------------------------------------------------------------------------------------
// Names, flattened only enough to raise a flag.
// ---------------------------------------------------------------------------------------------
ok('ltd and limited are the same suffix',
  normaliseName('Smith Electrical Ltd') === normaliseName('smith electrical limited'));
ok('punctuation and double spaces do not make a new company',
  normaliseName('Smith  Electrical, Ltd.') === normaliseName('Smith Electrical Ltd'));

// ---------------------------------------------------------------------------------------------
// THE DECISION.
// ---------------------------------------------------------------------------------------------
const dave = {
  userId: 'u-new',
  email: 'dave@gmail.com',
  signupPhone: '07123456789',
  personName: 'Dave Smith',
  businessName: 'Smith Electrical Ltd',
};

ok('a man we have never seen gets his week',
  decideTrialGrant(dave, []).grant === true);

ok('nothing about a first trial is flagged',
  decideTrialGrant(dave, []).flags.length === 0);

const priorSameEmail = [{ user_id: 'u-old', email_norm: 'dave@gmail.com' }];
ok('the same mailbox, spelled differently, is refused',
  decideTrialGrant({ ...dave, email: 'd.a.v.e+again@googlemail.com' }, priorSameEmail).grant === false);
ok('and it says the reason was the email',
  decideTrialGrant({ ...dave, email: 'd.a.v.e+again@googlemail.com' }, priorSameEmail).refusedOn === 'email');

const priorSamePhone = [{ user_id: 'u-old', email_norm: 'someone@else.com', signup_phone: '+447123456789' }];
ok('the same number is refused even on a fresh inbox',
  decideTrialGrant({ ...dave, email: 'brand@new.com' }, priorSamePhone).grant === false);
ok('and it says the reason was the phone',
  decideTrialGrant({ ...dave, email: 'brand@new.com' }, priorSamePhone).refusedOn === 'phone');

const priorSameAccount = [{ user_id: 'u-new' }];
ok('one account gets one local grant, whatever else changed',
  decideTrialGrant(dave, priorSameAccount).grant === false);
ok('the account is the most specific reason and wins over the others',
  decideTrialGrant(dave, [{ user_id: 'u-new', email_norm: 'dave@gmail.com' }]).refusedOn === 'account');

// ---------------------------------------------------------------------------------------------
// 🔴 THE ONES THAT MUST STILL GET THEIR WEEK. This is the half that protects revenue we have not
// earned yet, and it is the half that would fail silently.
// ---------------------------------------------------------------------------------------------
const otherDave = [{
  user_id: 'u-old',
  email_norm: 'different@person.com',
  signup_phone: '+447999888777',
  person_name: 'Dave Smith',
  business_name: 'Smith Electrical Ltd',
}];
const verdict = decideTrialGrant(dave, otherDave);
ok('a DIFFERENT Dave Smith at a DIFFERENT Smith Electrical still gets his week',
  verdict.grant === true);
ok('but a human is told to look at the name',
  verdict.flags.includes('name'));
ok('and at the business',
  verdict.flags.includes('business'));
ok('a flag is never a refusal reason', verdict.refusedOn === null);

ok('no user id is refused rather than granted to nobody',
  decideTrialGrant({ ...dave, userId: '' }, []).grant === false);

// ---------------------------------------------------------------------------------------------
// What he is actually told. Never a dead end: a refused man already has an account, and the thing
// he needs is the way back into it.
// ---------------------------------------------------------------------------------------------
ok('a refused man is pointed at signing in, not shown a door',
  refusalNote('email').toLowerCase().includes('sign in'));
ok('every refusal reason has words', refusalNote(null).length > 20);

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
