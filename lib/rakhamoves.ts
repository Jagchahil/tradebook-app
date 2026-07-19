// RAKHA'S MONEY MOVES. The proactive accountant, made structure-aware.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A real accountant carries 300 clients and sees each of them once a year. Rakha carries ONE client —
// you — and looks every time a number moves. This is the part that looks. Given a person's structure
// and their figures, it returns the concrete money-saving MOVES: put this into a pension before April,
// buy the van you were going to buy anyway now rather than in three weeks, here is £252 sitting on the
// table if you are married. Each move carries the figure behind it and a link to look further.
//
// It computes across BOTH returns, because that is the whole point of the spine (lib/position.ts): a
// company owner has the COMPANY's corporation tax AND their OWN personal tax, and a move that helps one
// can cost the other. Rakha weighs them together. A sole trader has one return; a partner has a share;
// a director has salary plus dividends. Same brain, routed by structure.
//
// DOCTRINE, ENFORCED IN THE COPY (doc 82 s5, doc 108, FA26 Sch 22):
//   . RAKHA SUGGESTS, THE USER DECIDES. Every move carries youDecide. Nothing here executes.
//   . NO CERTAINTY CLAIMS. Savings are ESTIMATES, framed "about/roughly", from the user's own numbers.
//   . CATEGORY-LEVEL LINKS ONLY. GOV.UK guidance, and a plain search — NEVER a named credit, car or
//     finance product (the FCA line). We describe the law and the choice; we do not sell a scheme.
//   . WE PRESENT THE ARITHMETIC OF A STATUTORY CHOICE (pension relief, the AIA), never an arrangement
//     engineered for the advantage. That distinction is the compliance position, not decoration.
// No em dashes or en dashes in any user-facing string, same as the rest of the agent.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { FACTS } from './taxengine';
import { corporationTax } from './ltdengine';
import { computePosition, type PositionInput } from './position';

const r0 = (n: number) => Math.round(n);
const gbp = (n: number) => `£${r0(n).toLocaleString('en-GB')}`;

// Where 40% starts on total income, and where the £100k allowance taper begins. Derived from watched
// constants, never re-typed.
const HR = FACTS.personalAllowance + FACTS.basicRateBand;      // 50,270
const TAPER = FACTS.personalAllowanceTaperFloor;               // 100,000
const ADDL = FACTS.additionalRateThreshold;                    // 125,140

export interface MoveLink { label: string; url: string; }

export interface Move {
  key: string;
  scope: 'business' | 'personal' | 'both';
  ownerName?: string;
  title: string;
  /** Estimated pounds saved, or freed, this year. 0 for an informational move. */
  estSaving: number;
  isEstimate: boolean;
  urgency: 'now' | 'this_year' | 'watch';
  why: string;
  links: MoveLink[];
  youDecide: true;
}

export interface MovesContext {
  today: Date;
  /** A purchase the user is already planning (a goal), for the buy-before-April move. */
  plannedPurchase?: { title: string; amount: number } | null;
  /** AIA-qualifying kit already bought this tax year, so we do not nudge a purchase they have made. */
  equipmentSpendYtd?: number;
  married?: boolean;
  /** True when the spouse earns under the personal allowance and can transfer some of it. */
  spouseHasSpareAllowance?: boolean;
}

const LINKS = {
  pension: { label: 'GOV.UK: tax relief on pension contributions', url: 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief' },
  aia: { label: 'GOV.UK: the Annual Investment Allowance', url: 'https://www.gov.uk/capital-allowances/annual-investment-allowance' },
  marriage: { label: 'GOV.UK: Marriage Allowance', url: 'https://www.gov.uk/marriage-allowance' },
  vanSearch: { label: 'Have a look at what is out there', url: 'https://www.google.com/search?q=used+vans+for+sale&tbm=shop' },
};

// Days from `today` to the following 5 April (the tax year end).
function daysToYearEnd(today: Date): number {
  const y = today.getUTCFullYear();
  const thisYE = Date.UTC(y, 3, 5); // 5 Apr this calendar year
  const end = today.getTime() <= thisYE ? thisYE : Date.UTC(y + 1, 3, 5);
  return Math.floor((end - today.getTime()) / 86400000);
}

// ── THE ENGINE ───────────────────────────────────────────────────────────────────────────────────
// Takes the same shape as computePosition (the structure + the owners), plus a little context. Returns
// the moves, most valuable first. Pure and deterministic.
export function savingsMoves(position: PositionInput, ctx: MovesContext): Move[] {
  const pos = computePosition(position);
  const moves: Move[] = [];
  const near = daysToYearEnd(ctx.today) <= 56 && daysToYearEnd(ctx.today) >= 0;

  // 0. THE GROUNDING MOVE. Always: what the business owes, and what each owner owes, side by side. This
  // is the thing no sole-trader-only engine could say, and the thing a company owner most needs to see.
  {
    const bizLine =
      pos.type === 'limited_company'
        ? `Your company's Corporation Tax is heading for about ${gbp(pos.businessTax)} on ${gbp(pos.business.taxableProfit)} of profit`
        : pos.type === 'partnership'
          ? `The partnership itself pays no tax; it just reports the ${gbp(pos.business.taxableProfit)} split`
          : `As a sole trader there is no separate business tax; it is all on your own return`;
    const persLine =
      pos.owners.length === 1
        ? `and you personally are heading for about ${gbp(pos.owners[0].personal.totalTax)}`
        : `and across ${pos.owners.length} owners the personal tax is about ${gbp(pos.personalTax)}`;
    moves.push({
      key: 'position_summary',
      scope: 'both',
      title: 'Where you stand, both sides',
      estSaving: 0,
      isEstimate: true,
      urgency: 'watch',
      why: `${bizLine}, ${persLine}. That is the two returns Rakha watches: the ${pos.business.form}, and each owner's own. Everything below is aimed at bringing the combined ${gbp(pos.combinedTax)} down, legitimately.`,
      links: [],
      youDecide: true,
    });
  }

  // 1. THE ILLEGAL DIVIDEND, if a company owner has drawn beyond what the company can distribute. Not a
  // saving, a WARNING, and it comes first because it is the one that bites (a s455 charge, a director's
  // loan). We block it in the pay-yourself engine; here we surface it as a move to fix.
  if (pos.overdrawn) {
    moves.push({
      key: 'overdrawn_dividends',
      scope: 'business',
      title: 'You have drawn more than the company can pay as a dividend',
      estSaving: 0,
      isEstimate: false,
      urgency: 'now',
      why: `The company can lawfully pay about ${gbp(pos.overdrawn.available)} in dividends from this year's profit, and ${gbp(pos.overdrawn.drewTotal)} has been drawn. The excess is not a dividend, it is a loan from the company to you, repayable, with a 33.75% charge if it is still outstanding nine months after the year end. Worth fixing before the year closes, not after. You decide, but this one is not optional if you want to stay the right side of it.`,
      links: [],
      youDecide: true,
    });
  }

  // 2. PENSION, per owner, the biggest lever a higher earner has. Contributing to a pension pulls income
  // back down the bands, and above 40% (or in the £100k taper) that is real money returned through the
  // return, ON TOP of the basic-rate relief added at source. Works for every structure because it is on
  // the owner's OWN total income.
  for (const owner of pos.owners) {
    const income = owner.personal.totalIncome;
    let target = 0;
    let reclaimRate = 0; // the part you claim BACK above basic-rate relief
    let bandName = '';
    if (income >= TAPER && income < FACTS.personalAllowanceLostAt) {
      target = TAPER; reclaimRate = 0.40; bandName = 'the £100,000 allowance taper, where the effective rate is 60%';
    } else if (income >= HR) {
      target = HR; reclaimRate = 0.20; bandName = 'the 40% higher-rate band';
    }
    if (target > 0) {
      const room = r0(income - target);
      const back = r0(room * reclaimRate);
      if (room >= 500 && back >= 100) {
        moves.push({
          key: 'pension_relief',
          scope: 'personal',
          ownerName: owner.name,
          title: `${pos.owners.length > 1 ? owner.name + ': ' : ''}a pension contribution claws back tax at your top rate`,
          estSaving: back,
          isEstimate: true,
          urgency: near ? 'now' : 'this_year',
          why: `Your income lands about ${gbp(room)} inside ${bandName}. A pension contribution of up to that ${gbp(room)} brings the top slice back down, and beyond the basic-rate relief added automatically you claim roughly ${gbp(back)} more back through your return. The money stays yours, in your pension. A standard, fully legitimate move, and cheaper to act on before 5 April than after. A suggestion from your numbers, not advice. You decide.`,
          links: [LINKS.pension],
          youDecide: true,
        });
      }
    }
  }

  // 3. BUY-BEFORE-APRIL. The van, the tools, the kit they were buying anyway. Bought before 5 April it
  // comes off THIS year's profit under the AIA. The saving is structure-specific: a company saves
  // corporation tax on the deduction; a sole trader or partner saves at their personal marginal rate
  // (income tax plus Class 4). Computed, not assumed.
  {
    const planned = ctx.plannedPurchase;
    const alreadyBought = ctx.equipmentSpendYtd ?? 0;
    const amount = planned && planned.amount > alreadyBought ? planned.amount : 0;
    if (near && amount >= 500) {
      let saving = 0;
      if (pos.type === 'limited_company') {
        // The company deducts the kit: corporation tax on ctProfit vs ctProfit minus the spend.
        const before = corporationTax(pos.business.taxableProfit);
        const after = corporationTax(Math.max(0, pos.business.taxableProfit - amount));
        saving = r0(before - after);
      } else {
        // Sole trader / partner: the deduction saves at the top of their personal income. Income tax
        // marginal plus 6% Class 4 where the slice sits in the main NIC band.
        const income = pos.owners[0]?.personal.totalIncome ?? 0;
        const itMarginal = income >= ADDL ? 0.45 : income >= TAPER && income < FACTS.personalAllowanceLostAt ? 0.60 : income >= HR ? 0.40 : income > FACTS.personalAllowance ? 0.20 : 0;
        const class4 = income > FACTS.personalAllowance && income <= FACTS.class4UpperLimit ? FACTS.class4MainRate : income > FACTS.class4UpperLimit ? FACTS.class4UpperRate : 0;
        saving = r0(amount * (itMarginal + class4));
      }
      if (saving >= 50) {
        const label = planned ? planned.title : 'the kit';
        moves.push({
          key: 'buy_before_april',
          scope: 'business',
          title: `Buying "${label}" before 5 April cuts this year's bill`,
          estSaving: saving,
          isEstimate: true,
          urgency: 'now',
          why: `You were planning "${label}" (${gbp(amount)}). Bought before 5 April the whole cost comes off THIS year's profit under the Annual Investment Allowance, worth about ${gbp(saving)} off your tax. Buy it a week into April and that saving waits a year. Only worth it for something you genuinely need, spending £1 to save 40p is not a plan. A suggestion from your numbers, not advice. You decide.`,
          links: [LINKS.aia, LINKS.vanSearch],
          youDecide: true,
        });
      }
    }
  }

  // 4. MARRIAGE ALLOWANCE. £252 of nothing-for-something if one of you earns under the personal
  // allowance and the other is a basic-rate taxpayer. Per owner who qualifies.
  if (ctx.married && ctx.spouseHasSpareAllowance) {
    const worth = r0(FACTS.marriageAllowanceTransfer * FACTS.basicRate);
    for (const owner of pos.owners) {
      const inc = owner.personal.totalIncome;
      if (inc > FACTS.personalAllowance && inc < HR) {
        moves.push({
          key: 'marriage_allowance',
          scope: 'personal',
          ownerName: owner.name,
          title: `${pos.owners.length > 1 ? owner.name + ': ' : ''}claim Marriage Allowance, about ${gbp(worth)} a year`,
          estSaving: worth,
          isEstimate: false,
          urgency: 'this_year',
          why: `If your husband, wife or civil partner earns under the ${gbp(FACTS.personalAllowance)} personal allowance, they can transfer ${gbp(FACTS.marriageAllowanceTransfer)} of it to you, worth about ${gbp(worth)} off your tax every year, and you can backdate up to four years. It is a two-minute claim on GOV.UK. You decide.`,
          links: [LINKS.marriage],
          youDecide: true,
        });
      }
    }
  }

  // 5. TWO SETS OF ALLOWANCES. Informational, for a co-owned company or a partnership: each owner has
  // their OWN personal allowance, basic-rate band and (company) dividend allowance. It is not a scheme,
  // it is a fact of how the two returns work, and it is why splitting a business between real owners is
  // taxed more gently than one person taking it all. We state it; we do not engineer it.
  if (pos.owners.length > 1) {
    moves.push({
      key: 'co_owner_allowances',
      scope: 'personal',
      title: `Each of the ${pos.owners.length} owners has their own allowances`,
      estSaving: 0,
      isEstimate: true,
      urgency: 'watch',
      why: `You are ${pos.owners.length} owners, and each of you has a full personal allowance and basic-rate band of your own. That is why the same profit shared between real owners carries less personal tax than it would on one person's return. Rakha keeps each owner's return in view so nobody's allowances go to waste. Information about how the returns work, not a scheme, and never a reason to put someone on the books who is not truly an owner.`,
      links: [],
      youDecide: true,
    });
  }

  // Most valuable first: real savings by size, then the warnings and the informational context.
  const rank = (m: Move) => (m.key === 'overdrawn_dividends' ? 1e9 : m.estSaving);
  return moves.sort((a, b) => rank(b) - rank(a));
}
