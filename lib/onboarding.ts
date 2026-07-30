// lib/onboarding.ts. THE SHAPE OF SETTING UP, AND NOTHING ELSE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THERE IS NO STATE IN THIS FILE, AND THAT IS THE WHOLE DESIGN OF RESUMABLE ONBOARDING.
//
// The obvious way to build a fifteen minute wizard is to accumulate his answers as you go and
// commit them at the end. That is a SECOND COPY OF THE TRUTH, and this codebase has been caught
// three times by two readers over one number: the copy that drifts is the one he believes. It would
// also leave his marriage answer sitting in a scratch column, unlogged, while lib/circumstances.ts
// insists the log IS the defence under Finance Act 2026 Sch 22.
//
// So every answer goes to its real home the moment he gives it. The business type to public.users
// through /api/business. A relief to public.circumstances, with the verbatim wording he saw, through
// /api/circumstances. The account use to public.bank_connections through /api/bank/connect. Nothing
// is held anywhere waiting to be flushed.
//
// What is left to record is WHICH STEP HE IS ON, which is one short string, and that lives in
// public.onboarding_progress. Resuming is then simply putting him back on that step, because his
// answers were applied on the way past. See supabase/APPLY_2026-07-29_onboarding_and_walink.sql,
// whose header is the argument for the missing answers column.
//
// This file is therefore pure: the order of the steps, how to move through them, and the one
// sentence we promise him about how long it takes. No database, no request, no React. A test can
// load it, and test/onboardingweb.test.mjs fails the build if it ever grows an import that stops it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ⚠️ THE ORDER IS A TAX DECISION BEFORE IT IS A UI ONE, so it is written down once, here.
//
// `business` is second because the structure decides which engine runs for him. A partner is taxed
// on his share and a director gets corporation tax, so getting it wrong walks a wrong number into
// everything after it, including the reveal.
//
// 🔴 AND `household` COMES BEFORE `about`, WHICH LOOKS BACKWARDS AND IS NOT.
//
// lib/circumstances.ts sorts by what a question is worth, and by that sort marriage sits ninth. A
// man who answers four and leaves is never asked whether he is married, which was the exact hole
// doc 108 called out: Marriage Allowance was money on the floor because there was nowhere in this
// product to tell us. The household facts are also the cheapest four questions we own, because he
// knows every answer without looking anything up, where `prior_employment` needs him to think about
// dates. So the two he is most likely to answer, and the two we most need, come first.
//
// The money ordering inside each step is still entirely lib/circumstances.ts's. Nothing here re-sorts.
// ⚠️ `mtd` SITS AFTER THE MONEY AND BEFORE THE BANK, AND BOTH HALVES OF THAT ARE ON PURPOSE.
//
// After the money, because it is the one screen that offers him nothing. Marriage is worth £252 and
// a terminal loss is worth four figures; "have you signed up for Making Tax Digital" is worth
// nothing to him at all, it changes what WE do. Put it in front of the reliefs and the man who
// leaves after four questions leaves having answered the four that were worth the least.
//
// Before the bank, because the bank step hands him to somebody else's website and is the likeliest
// place in the whole journey to lose him. Anything we still want to know has to be asked first.
// ⚠️ `reveal` IS LAST, AND THE CARD IS ON IT RATHER THAN ON A STEP OF ITS OWN.
//
// Jag's call, 28 July: the card is asked for WHILE HE IS LOOKING AT WHAT WE JUST FOUND HIM. Not on a
// page before he has seen anything, and not by email on day six when he has forgotten us. Two paths
// existed before this and the no card path never converted, because there is no automatic charge
// without a card on file.
//
// It is after the bank because the bank is what puts real money on this screen. A man who connects
// first sees his own figures; a man who skips sees what his answers opened, which is still his.
export const STEPS = ['welcome', 'business', 'household', 'about', 'mtd', 'bank', 'reveal', 'done'] as const;

export type Step = (typeof STEPS)[number];

// The step a brand new account starts on, and the value the table defaults to.
export const FIRST_STEP: Step = 'welcome';
// Reaching this is what completed_at means. It is a step rather than a flag so there is one
// vocabulary for "where is he", and nothing has to be kept in step with anything.
export const LAST_STEP: Step = 'done';

export function isStep(value: unknown): value is Step {
  return typeof value === 'string' && (STEPS as readonly string[]).includes(value);
}

// Anything unrecognised is the beginning, never a crash and never a skip to the end. A stored step
// this build has not heard of means the table outlived a rename, and starting him at the front is
// the only answer that cannot lose an answer he has not given yet.
export function toStep(value: unknown): Step {
  return isStep(value) ? value : FIRST_STEP;
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

export function nextStep(step: Step): Step {
  const i = stepIndex(step);
  return i < 0 || i >= STEPS.length - 1 ? LAST_STEP : STEPS[i + 1];
}

// Null at the front, because there is nothing behind the welcome. Back is a plain link and writes
// nothing: only going forward moves his recorded position, so looking back can never lose his place.
export function prevStep(step: Step): Step | null {
  const i = stepIndex(step);
  return i <= 0 ? null : STEPS[i - 1];
}

export function isDone(step: Step): boolean {
  return step === LAST_STEP;
}

// The steps he is actually walked through. `done` is a destination, not a screen, so it is not one
// of them and it is not in the count.
export function walkedSteps(): Step[] {
  return STEPS.filter((s) => s !== LAST_STEP);
}

export function stepNumber(step: Step): number {
  return Math.min(stepIndex(step) + 1, walkedSteps().length);
}

export function stepCount(): number {
  return walkedSteps().length;
}

// How full the bar is. Never zero: an empty bar on the first screen reads as broken rather than as
// the beginning, and never a hundred until he is actually finished.
export function progressPct(step: Step): number {
  if (isDone(step)) return 100;
  return Math.max(8, Math.round((stepIndex(step) / walkedSteps().length) * 100));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PROMISE, WRITTEN EXACTLY ONCE.
//
// /start used to say "About a minute", and the finish line of it used to admit in its own fine print
// that the real information gathering happened somewhere else. Both were true of the six questions
// and neither was true of what a man was starting.
//
// Jag's call, 28 July: say ten to fifteen minutes, up front, because we cannot tailor a man's tax
// until we know everything, and DEPTH IS THE FEATURE. A page that promises a minute and then takes
// fifteen has not saved him fourteen minutes, it has taught him we shade the truth about his money.
//
// It is one exported string because two literals is how a page ends up promising a minute while the
// screen after it asks for fifteen. test/onboardingweb.test.mjs fails the build if a second one
// appears anywhere in app/ or lib/.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const HOW_LONG = '10 to 15 minutes';

// Why it takes that long, in his words. Said beside the number every time the number is shown,
// because a cost with no reason attached is just a cost.
export const HOW_LONG_WHY =
  'We cannot tailor your tax until we know everything about you, so this is the long bit and it only happens once.';

// What each step is called on his screen. Here rather than in the page so the resume line on /app
// and the bar inside setup can never call the same step two different things.
const TITLES: Record<Step, string> = {
  welcome: 'Getting started',
  business: 'How you trade',
  household: 'You and your household',
  about: 'What you can claim',
  mtd: 'Where you stand with HMRC',
  bank: 'Your bank',
  reveal: 'What we found',
  done: 'Finished',
};

export function stepTitle(step: Step): string {
  return TITLES[step];
}
