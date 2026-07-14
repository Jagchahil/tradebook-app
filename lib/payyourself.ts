// PAY YOURSELF. Salary, then dividends, then THE WALL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "Pay yourself £12,570, then dividends, and anything more than that will cost you THIS much in tax."
//
// That last clause is the whole feature, and it is the one no accountant ever says out loud, because
// saying it means committing to a number. Every calculator in this market shows a man his total tax
// bill. Almost none shows him the price of the NEXT thousand pounds, which is the only figure he can
// actually act on, because it is the only one attached to a decision he is about to make.
//
// He is not asking "what is my effective rate". He is asking "can I take four grand out for the
// holiday, and what does that cost me". THE WALL IS THE ANSWER.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ AND THE FRAMING IS NOT DECORATION, IT IS THE COMPLIANCE POSITION.
//
// Doc 108 §1, and Finance Act 2026 Sch 22 behind it: we say "here is what each route COSTS". We
// never say "here is the SCHEME". Presenting the arithmetic of a statutory choice is not avoidance.
// Designing an arrangement whose purpose is the tax advantage is. The difference is entirely in
// whether we are describing the law or engineering around it, and this file describes.

import { LTD, corporationTax, employerNIC, dividendTax, planLtd, salaryRungs, type LtdPlan } from './ltdengine';

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// THE WALL. What the next slice of money actually costs him.
// ---------------------------------------------------------------------------------------------

export interface Wall {
  /** The size of the slice we priced. £1,000 unless told otherwise. */
  slice: number;
  /** What he actually keeps out of that slice. */
  keeps: number;
  /** What the slice costs in tax, all in: corporation tax AND his dividend tax. */
  costs: number;
  /** The marginal rate on the slice, as a percentage. This is the number he remembers. */
  rate: number;
  /** Plain English. "Every extra £1,000 you take out costs you £457 and you keep £543." */
  says: string;
  /** True when the NEXT slice costs more than the one before: he is about to cross a band. */
  atACliff: boolean;
}

// ⚠️ THE MARGINAL COST IS COMPUTED, NOT DERIVED FROM A RATE TABLE. AND THAT IS THE POINT.
//
// You cannot read this number off HMRC's dividend rates, because the money is taxed TWICE on the way
// out and the two taxes interact. An extra £1,000 of profit taken as a dividend is hit by
// corporation tax first, and what survives is then hit by dividend tax at whatever band his TOTAL
// income has reached. Add marginal relief between the CT limits and the personal allowance taper
// above £100k, and there is no closed form. There is only: run it twice, and subtract.
//
// So we plan the whole company at profit P, plan it again at profit P + slice, and take the
// difference in what he keeps. It is slow and it is stupid and it is EXACTLY RIGHT, which is worth
// more than clever. It stays right through any Budget that changes any rate, because it never knew
// what the rates were.
export function wall(profitBeforeSalary: number, salary: number, slice = 1000): Wall {
  const here = planLtd(Math.max(0, profitBeforeSalary), salary);
  const next = planLtd(Math.max(0, profitBeforeSalary) + slice, salary);

  const keeps = r2(next.takeHome - here.takeHome);
  const costs = r2(slice - keeps);
  const rate = slice > 0 ? r2((costs / slice) * 100) : 0;

  // Is the slice AFTER this one dearer than this one? That is a cliff, and it is the thing worth
  // telling him BEFORE he crosses it rather than after.
  const after = planLtd(Math.max(0, profitBeforeSalary) + slice * 2, salary);
  const nextKeeps = r2(after.takeHome - next.takeHome);
  const atACliff = nextKeeps < keeps - 1;   // a pound of noise is not a cliff

  const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

  return {
    slice,
    keeps,
    costs,
    rate,
    says: `Every extra ${money(slice)} you take out costs you ${money(costs)} in tax. You keep ${money(keeps)}.`,
    atACliff,
  };
}

// ---------------------------------------------------------------------------------------------
// 🔴 THE ILLEGAL DIVIDEND. WE BLOCK. WE DO NOT WARN.
// ---------------------------------------------------------------------------------------------
//
// A dividend can only be paid out of DISTRIBUTABLE PROFITS (Companies Act 2006 s830). Pay one when
// the company does not have them and it is unlawful, and it does not become a salary just because
// that would be more convenient. It becomes a DIRECTOR'S LOAN, repayable, with a s455 tax charge at
// 33.75% if it is still outstanding nine months after the year end.
//
// ⚠️ AND YOU CANNOT FIX IT AFTERWARDS. That is the bit people do not know.
//
// Global Corporate Ltd v Hale [2018] EWCA Civ 2618: a director took regular payments described as
// dividends, the company went under, and he argued they should be re-characterised as salary. The
// Court of Appeal said no. The label at the time of payment is what counts. He had to pay the money
// back to the liquidator.
//
// So a WARNING here is useless. A man who reads "careful, this may be unlawful" and takes the money
// anyway has not been helped, he has been given a paper trail showing we told him and he did it. And
// under FA26 Sch 22, software that computes and presents an unlawful distribution as an option is
// software providing assistance in the knowledge it will be used in connection with tax affairs.
//
// We do not show it. We do not price it. We tell him what he CAN take, and why.
export interface Drawable {
  /** The most he can lawfully take as a dividend, right now. */
  available: number;
  /** True when he has asked for more than that. */
  blocked: boolean;
  says: string;
}

export function drawable(
  profitBeforeSalary: number,
  salary: number,
  wanted: number,
  reservesBroughtForward = 0,
): Drawable {
  const plan = planLtd(Math.max(0, profitBeforeSalary), salary);

  // Distributable = post-tax profit for the year, plus anything retained from previous years.
  // Losses brought forward reduce it, which is why this takes a signed number.
  const available = r2(Math.max(0, plan.dividends + reservesBroughtForward));
  const blocked = wanted > available + 0.01;

  const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

  if (!blocked) {
    return {
      available,
      blocked: false,
      says: `You can take ${money(wanted)}. After that there is ${money(available - wanted)} of profit left to draw on.`,
    };
  }

  // THE REFUSAL, AND IT SAYS WHY. A block a man does not understand is a block he routes around.
  return {
    available,
    blocked: true,
    says: [
      `I cannot show you that as a dividend. The company only has ${money(available)} of profit left to pay one from, and you asked for ${money(wanted)}.`,
      '',
      `Taking the extra ${money(wanted - available)} anyway would not be a dividend. It would be a loan from the company to you, it has to be paid back, and if it is still outstanding nine months after the year end the company pays a 33.75% charge on it.`,
      '',
      'And you could not fix it later by calling it wages instead. A court has already ruled on exactly that, and the director had to pay the money back.',
      '',
      `So: ${money(available)} as a dividend. If you need more than that, take it as salary, and I will show you what that costs.`,
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------------------------
// THE WHOLE ANSWER. Salary, dividends, and the wall, in the order he asks about them.
// ---------------------------------------------------------------------------------------------

export interface PayPlan {
  best: LtdPlan;
  /** Every rung, priced, so he can see WHY the best one is the best one. */
  rungs: Array<{ salary: number; why: string; plan: LtdPlan }>;
  wall: Wall;
  /** True when he is close enough to a band edge that it is worth saying so. */
  warning: string | null;
}

export function payYourself(profitBeforeSalary: number): PayPlan {
  const p = Math.max(0, profitBeforeSalary);

  // ⚠️ EVERY RUNG IS PRICED. WE DO NOT PICK ONE AND HIDE THE REST.
  //
  // The rung that wins on take-home is not always the rung he should take: £5,000 saves the company
  // employer NI and costs him a qualifying year toward his state pension, which is worth roughly
  // £300 a year FOR LIFE and does not show up anywhere in a take-home number. A calculator that
  // silently optimises for this year's cash is a calculator that quietly sells his pension.
  //
  // So: show him all three, with the money AND the consequence, and let him choose. Doc 103's hard
  // limit: acting for him is only kindness when it is reversible and it is his. A missed pension year
  // is neither.
  const rungs = salaryRungs().map((r) => ({ ...r, plan: planLtd(p, r.salary) }));

  const best = rungs.reduce(
    (b, r) => (r.plan.takeHome > b.takeHome ? r.plan : b),
    rungs[0].plan,
  );

  const w = wall(p, best.salary);

  return {
    best,
    rungs,
    wall: w,
    warning: w.atACliff
      ? 'Careful. The next thousand after this one costs you more than this one does. You are about to cross into a higher band, so if you were going to take a bigger lump out, it is cheaper to do it before April than after.'
      : null,
  };
}

// Re-exported so a caller never has to reach past this file into the engine for the pieces.
export { corporationTax, employerNIC, dividendTax, planLtd, salaryRungs, LTD };
