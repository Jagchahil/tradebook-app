// HOW HE PAYS HIMSELF, COMPOSED FROM THE ENGINES AND NOTHING ELSE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ NOT ONE POUND OF TAX IS COMPUTED IN THIS FILE, AND THAT IS ITS WHOLE DISCIPLINE.
//
// The sole trader and partner figures are taxPosition() on the same OptimiserInput the Overview
// and /app/tax read, so this screen cannot disagree with the screen he checks against his bank.
// The company shape is payYourself() in lib/payyourself.ts, the engine that prices every salary
// rung and the next thousand pounds. The partnership's own words come from lib/position.ts. What
// this file adds is division by twelve and by the months that have happened, which is
// presentation arithmetic a man can check on the back of an envelope, and it is tested against
// fixtures in test/payyourselfweb.test.mjs so it cannot quietly become more than that.
//
// Pure, no clock, no network, so the test runner can attack it under bare node, exactly as
// app/app/tax/due.ts is attacked.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { taxPosition, setAsideBasisLine, type OptimiserInput } from '../../../lib/taxoptimiser';
import { payYourself, type PayPlan } from '../../../lib/payyourself';
import { computePosition, type BusinessType } from '../../../lib/position';

export type { BusinessType, PayPlan };

// The month by month answer for a man who draws rather than earns: what the business makes, what
// to keep back for the tax, and what is his. keepBack is one twelfth of the engine's own set
// aside; profit is the confirmed run rate. The three figures reconcile to the pound on purpose,
// draw = profit minus keepBack, because a screen he cannot check is a screen he stops believing.
export interface MonthlyDraw {
  profit: number;
  keepBack: number;
  draw: number;
  // False when the keep back is bigger than the business's own monthly profit, which happens when
  // the set aside also carries tax on income from outside the business. The page says so plainly
  // rather than showing a confident zero with no explanation.
  covered: boolean;
}

export type PayModel =
  // Nothing confirmed to pay himself from yet. An honest short state, never an invented figure.
  | { kind: 'nothing_yet'; structure: BusinessType }
  // A sole trader or a partner: drawings, not wages. The tax follows the profit.
  | {
      kind: 'drawings';
      structure: 'sole_trader' | 'partnership';
      /** Confirmed profit since 6 April. For a partner this is already HIS slice: getOptimiserInput scales the shared books by his share. */
      tradeNet: number;
      /** True when the year is old enough (three months) for the engine to project it. */
      projected: boolean;
      /** taxPosition's own set aside, the same figure /app/tax shows. */
      setAside: number;
      /** The engine's sentence naming what is inside the set aside. Null for a pure sole trader. */
      basis: string | null;
      /** Null when the year is too young to call a monthly figure honestly. */
      monthly: MonthlyDraw | null;
      /** Partnership only: lib/position.ts's own sentence about the SA800 and the split. */
      partnershipNote: string | null;
    }
  // A company director: the salary and dividend shape, whole, from the pay yourself engine.
  | { kind: 'company'; profit: number; plan: PayPlan };

export function payModel(structure: BusinessType, optimiser: OptimiserInput): PayModel {
  const tradeNet = Math.round(Math.max(0, optimiser.ytdTradeIncome - optimiser.ytdTradeExpenses));
  if (tradeNet <= 0) return { kind: 'nothing_yet', structure };

  // The director's answer is the engine's answer, untouched. Confirmed profit only: a pay shape on
  // a projected year would be a guess on a guess, the same judgement /app/tax/what-if wrote down.
  if (structure === 'limited_company') {
    return { kind: 'company', profit: tradeNet, plan: payYourself(tradeNet) };
  }

  const tax = taxPosition(optimiser);
  const basis = setAsideBasisLine(optimiser, tax);

  // The monthly figures only exist once the engine itself is willing to project the year. Before
  // that the page says the year is too young, which is the truth, instead of a confident number.
  const months = Math.max(0, Math.floor(optimiser.monthsElapsed));
  let monthly: MonthlyDraw | null = null;
  if (tax.projected && months > 0) {
    const profit = Math.round(tradeNet / months);
    const keepBack = Math.round(tax.setAside / 12);
    monthly = {
      profit,
      keepBack,
      draw: Math.max(0, profit - keepBack),
      covered: profit >= keepBack,
    };
  }

  // The partnership's structural sentence belongs to the engine that owns the structure, so the
  // wording cannot drift from what the agent and what-if say about the same firm.
  const partnershipNote =
    structure === 'partnership'
      ? computePosition({ type: 'partnership', profit: tradeNet, owners: [{ name: 'You' }] }).business.note
      : null;

  return {
    kind: 'drawings',
    structure: structure === 'partnership' ? 'partnership' : 'sole_trader',
    tradeNet,
    projected: tax.projected,
    setAside: tax.setAside,
    basis,
    monthly,
    partnershipNote,
  };
}
