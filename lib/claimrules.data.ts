// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CLAIM CORPUS, THE ONE SOURCE OF TRUTH.  (Puchio's answers, the WhatsApp "can I claim X?",
// the web page, the mobile Can-I-claim screen, all of them read THIS FILE.)
//
// ⚠️ THIS FILE IS BYTE-IDENTICAL IN BOTH REPOS AND THAT IS THE WHOLE POINT.
//
//   canonical:  tradebook-web/lib/claimrules.data.ts   <- edit HERE
//   generated:  tradebook-app/lib/claimrules.data.ts   <- a verbatim copy, DO NOT hand-edit
//
// It used to be two hand-maintained copies (tradebook-web/lib/taxrules.ts and
// tradebook-app/lib/taxrules.ts), and they drifted. On the phone, for weeks: the training rule was
// the pre-2024 version that told a tradesperson an EV or bookkeeping course was not claimable (money
// LOST), the accountancy rule over-claimed our own Self Assessment fee (money over-CLAIMED, Finance
// Act 2026 Sch 22), the bank rule cited an interest cap abolished on 6 April 2024, and the tips were
// missing Marriage Allowance. Four wrong answers, live, because a compliance fix on web never reached
// mobile. So now there is ONE file. A human edits it here, `scripts/sync-corpus.mjs` copies it to the
// app, and test/taxrules-parity.test.mjs fails the build if the two ever differ by a single byte.
//
// Pure data and two pure functions: checkExpense, which looks a rule up, and isClaimQuestion, which
// decides whether a sentence a customer typed may reach the lookup at all. That second one arrived
// on 11 August 2026 and its header says why. No imports, no Node or React Native APIs, so both a
// Next build and an Expo build can consume it unchanged. General information, never tax advice. The
// test is always HMRC's "wholly and exclusively for the purposes of the trade".
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type Verdict = 'yes' | 'partly' | 'depends' | 'no';

export interface ExpenseRule {
  key: string;
  title: string;
  verdict: Verdict;
  aliases: string[];
  // One plain line, used in the WhatsApp reply and the card.
  rule: string;
  // A touch more context for the screen.
  detail: string;
}

// Ordered so specific items (protective gear, uniform) are matched before the generic everyday
// clothing rule. Figures reflect the 2026/27 simplified expenses rates.
export const EXPENSE_RULES: ExpenseRule[] = [
  {
    key: 'protective',
    title: 'Boots, hi vis and protective gear',
    verdict: 'yes',
    aliases: ['boots', 'work boots', 'safety boots', 'steel toe', 'hi vis', 'hi-vis', 'high vis', 'ppe', 'hard hat', 'helmet', 'goggles', 'safety glasses', 'gloves', 'overalls', 'protective', 'knee pads', 'ear defenders', 'respirator', 'face mask'],
    rule: 'Yes, fully. Protective clothing and safety kit you need for the job are allowable in full.',
    detail: 'Anything you wear to protect yourself or your normal clothes on the job, boots, hi vis, hard hats, goggles, gloves, overalls, counts. Claim the full cost.',
  },
  {
    key: 'uniform',
    title: 'A branded uniform',
    verdict: 'yes',
    aliases: ['uniform', 'branded', 'logo top', 'logo shirt', 'logo', 'embroidered', 'workwear'],
    rule: 'Yes, if it is a real uniform. A top with your business name or logo permanently on it is allowable. A plain top is not.',
    detail: 'A uniform must carry your business name or logo, fixed on, not a clip on badge, and not be something you would wear day to day. Branded workwear is fine. Plain clothes are not, even with a stick on logo.',
  },
  {
    key: 'everyday_clothes',
    title: 'Everyday clothes',
    verdict: 'no',
    aliases: ['clothes', 'clothing', 'jeans', 'trousers', 'shirt', 'suit', 'shoes', 'jumper', 'jacket', 'coat', 'tracksuit', 't shirt', 't-shirt', 'outfit'],
    rule: 'No, sorry. Everyday clothing is not allowable, even if you only ever wear it for work. HMRC is strict on this one.',
    detail: 'This is the classic myth. Normal clothes are not claimable even if you bought them only for work and never wear them otherwise. Only a branded uniform or genuine protective clothing gets through.',
  },
  {
    key: 'tools',
    title: 'Tools and equipment',
    verdict: 'yes',
    aliases: ['tools', 'tool', 'drill', 'saw', 'ladder', 'equipment', 'machinery', 'kit', 'power tool', 'laptop', 'computer', 'printer', 'camera', 'machine'],
    rule: 'Yes, fully. Tools and equipment for the work are allowable. Big items can be claimed in full the year you buy them through the Annual Investment Allowance.',
    detail: 'Tools, machinery, a work laptop, all allowable. For larger purchases the Annual Investment Allowance lets you deduct the whole cost in the year you buy it, up to £1 million, so the full amount comes off your profit.',
  },
  {
    key: 'van',
    title: 'A van',
    verdict: 'yes',
    aliases: ['van', 'transit', 'pickup', 'flatbed'],
    rule: 'Yes. A van used for the business is allowable. You can claim the full cost the year you buy it, or run it on simplified mileage instead.',
    detail: 'A van is a clean claim. Either deduct the cost through the Annual Investment Allowance and claim the running costs, or keep it simple and claim 55p a mile for the first 10,000 business miles, then 25p. Use one method or the other, not both.',
  },
  {
    key: 'car',
    title: 'A car',
    verdict: 'depends',
    aliases: ['car', 'vehicle', 'motor'],
    rule: 'Part of it. Only the business share of a car counts. Simplest is 55p a mile for the first 10,000 business miles, then 25p.',
    detail: 'A car nearly always has private use, so you cannot claim all of it. The easy route is mileage, 55p a mile to 10,000 then 25p, which covers fuel and wear. The other route is actual running costs and capital allowances, but only the business portion, with records to back it.',
  },
  {
    key: 'fuel',
    title: 'Fuel',
    verdict: 'partly',
    aliases: ['fuel', 'diesel', 'petrol', 'unleaded'],
    rule: 'The business share. Either claim fuel as part of your actual vehicle costs, or use simplified mileage instead, not both.',
    detail: 'If you use mileage at 55p a mile, that already includes fuel, so do not claim fuel on top. If you claim actual running costs, claim only the business proportion of your fuel.',
  },
  {
    key: 'mileage',
    title: 'Mileage',
    verdict: 'yes',
    aliases: ['mileage', 'miles', 'mile'],
    rule: 'Yes. Business miles are 55p a mile for the first 10,000, then 25p. Just text me the miles and I log the claim.',
    detail: 'Simplified mileage is the easiest vehicle claim. 55p a mile for the first 10,000 business miles in the year, 25p after that. It covers fuel, insurance and wear, so you do not also claim those.',
  },
  {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THE ALIAS 'data' WAS REMOVED ON 11 AUGUST 2026, AND THE STRING THAT KILLED IT WAS
    // "delete all my data".
    //
    // A customer typed that into the in app chat. He was asking to be erased. He was handed
    // "🟡 Phone and broadband. The business share. Work out the business percentage of your
    // bill and claim that." Proved live. The chat's guard is the other half of that fault and
    // is fixed in isClaimQuestion() below, but the guard alone does not close this one, because
    // the word is ours as well as his: "can I delete my expense data?" carries a real claim word
    // and a real question shape, so it passes the guard cleanly and still lands on a phone bill.
    //
    // ⚠️ SO THE ALIAS GOES, AND IT COSTS NOTHING, WHICH IS THE WHOLE ARGUMENT. It was carried for
    // mobile data allowances, and every way a tradesman actually asks that already matches
    // something else on this row: "mobile data" hits 'mobile', "data on my phone" hits 'phone',
    // "my data bill" hits 'phone bill' when he words it that way and hits 'broadband' or
    // 'internet' when he means the house. Nobody asks whether "data" is claimable. What the bare
    // word DOES do is collide with the one vocabulary this product cannot afford to be confused
    // about: his data, our privacy policy, and, since 11 August, a page at /app/you/data whose
    // entire job is handing it back or destroying it.
    //
    // ⚠️ IT IS THE ONLY ALIAS IN THE CORPUS THAT IS A WORD FROM OUR OWN PRIVACY VOCABULARY. That
    // is the test to apply before adding another: a rule may claim a word a customer uses about
    // his TOOLS, never a word he uses about HIMSELF.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    key: 'phone',
    title: 'Phone and broadband',
    verdict: 'partly',
    aliases: ['phone', 'mobile', 'broadband', 'internet', 'wifi', 'phone bill'],
    rule: 'The business share. Work out the business percentage of your bill and claim that. Text me, like "phone bill £45, 80% business".',
    detail: 'You cannot claim the whole bill unless the line is used only for business. Work out a fair business percentage and claim that slice. Same for broadband.',
  },
  {
    key: 'use_of_home',
    title: 'Working from home',
    verdict: 'yes',
    aliases: ['working from home', 'work from home', 'use of home', 'home office', 'wfh', 'home as office', 'study'],
    rule: 'Yes. Claim a flat rate by hours, £10, £18 or £26 a month, or a fair share of your actual home bills.',
    detail: 'If you do admin or work from home, claim it. The simple way is the HMRC flat rate by hours a month, £10 for 25 to 50 hours, £18 for 51 to 100, £26 for 101 plus. Or claim a fair proportion of your actual rent, heat, light and so on.',
  },
  {
    key: 'premises',
    title: 'Rent on business premises',
    verdict: 'yes',
    aliases: ['rent', 'workshop', 'unit', 'lockup', 'lock up', 'yard', 'storage', 'premises', 'shop rent', 'studio'],
    rule: 'Yes. Rent, rates, power and insurance on premises you use for the business are allowable.',
    detail: 'A workshop, unit, yard or storage you rent for the business is fully allowable, along with its rates, power and insurance.',
  },
  {
    // HMRC BROADENED this in 2024. Keeping current skills, keeping up with the tech in your trade, and
    // NEW skills that support the business (bookkeeping, an EV charging course) are all allowable now.
    // Only training to start a DIFFERENT business, or unrelated to your trade, is out. The old narrow
    // wording lost tradespeople real relief; the mobile copy carried it for weeks after web was fixed.
    key: 'training',
    title: 'Training and courses',
    verdict: 'depends',
    aliases: ['training', 'course', 'courses', 'qualification', 'certification', 'cscs', 'gas safe course', 'ticket', 'refresher'],
    rule: 'Mostly yes. Keeping your skills current, keeping up with the tech in your trade, and even new skills that support the business, like bookkeeping, are allowable. Training to start a different business is not.',
    detail: 'HMRC widened this in 2024 and most people have not caught up. Refreshers and tickets are allowable, obviously. But so is learning something NEW, as long as it relates to how your industry is changing or it supports the business you already run. An electrician taking an EV charging course, or any trade taking a bookkeeping or admin course, can claim it. What you cannot claim is training to start a different business, or to move into an area that has nothing to do with your trade.',
  },
  {
    key: 'meals',
    title: 'Food and meals',
    verdict: 'depends',
    aliases: ['meals', 'meal', 'lunch', 'food', 'dinner', 'breakfast', 'coffee', 'subsistence', 'sandwich'],
    rule: 'Depends. A meal on a genuine business trip or an overnight stay can be claimed. Your everyday lunch cannot.',
    detail: 'Subsistence on a real business journey away from your normal pattern, or while staying away overnight, is allowable. The ordinary lunch you would buy anyway is not, even on site.',
  },
  {
    key: 'travel',
    title: 'Travel',
    verdict: 'depends',
    aliases: ['travel', 'train', 'bus', 'taxi', 'flight', 'ferry', 'tube', 'public transport', 'congestion charge', 'toll'],
    rule: 'Depends. Travel to a job, a supplier or a client is allowable. Your normal commute to a regular place of work is not.',
    detail: 'Fares and tolls for business journeys are allowable. The everyday commute between home and a regular workplace is not. If you travel to different sites, those journeys usually count.',
  },
  {
    key: 'parking',
    title: 'Parking and fines',
    verdict: 'depends',
    aliases: ['parking', 'car park', 'parking ticket', 'fine', 'penalty', 'pcn'],
    rule: 'Parking on a business trip, yes. Parking and speeding fines, no, HMRC never allows penalties.',
    detail: 'Parking while you are working is fine to claim. Fines and penalties, parking tickets, speeding, late filing, are never allowable.',
  },
  {
    key: 'materials',
    title: 'Materials and stock',
    verdict: 'yes',
    aliases: ['materials', 'stock', 'supplies', 'parts', 'consumables', 'timber', 'cable', 'pipe', 'paint', 'fixings', 'screws'],
    rule: 'Yes, fully. Materials and stock you buy for jobs are allowable in full.',
    detail: 'Everything you buy in to do the work or to sell on, materials, parts, consumables, is fully allowable.',
  },
  {
    key: 'insurance',
    title: 'Insurance',
    verdict: 'yes',
    aliases: ['insurance', 'public liability', 'liability', 'tools insurance', 'van insurance', 'professional indemnity'],
    rule: 'Yes. Business insurance like public liability, tools and professional indemnity is allowable.',
    detail: 'Cover you take for the business, public liability, tools, professional indemnity, is allowable. Van insurance is covered if you claim actual vehicle costs rather than mileage.',
  },
  {
    // HMRC's legal and financial costs page excludes "the cost of preparing and submitting your Self
    // Assessment tax return". So we do NOT tell a man our own bill is fully deductible. Bookkeeping is
    // allowable; the return prep is not. We do not mark our own homework on our own invoice.
    key: 'fees',
    title: 'Accountant and professional fees',
    verdict: 'yes',
    aliases: ['accountant', 'bookkeeper', 'accountancy', 'professional fees', 'solicitor', 'legal fees', 'software', 'subscription to software'],
    rule: 'Yes. Accountant and bookkeeping fees, and software you use for the business, are allowable.',
    detail: 'Accountancy, bookkeeping and most legal fees for running the business are allowable, as is business software. One thing HMRC is specific about, and it applies to us too: the cost of preparing and submitting your Self Assessment tax return itself is NOT allowable. The bookkeeping is. We are not going to tell you our own bill is fully deductible when HMRC\'s own page says that part of it is not.',
  },
  {
    // The £500 cash-basis interest restriction was removed on 6 April 2024, and cash basis is now the
    // default method. So there is no cap to warn about; the only thing not allowable is repaying the
    // loan capital itself. A vague "there is a cap" made people stop logging loan interest.
    key: 'bankfinance',
    title: 'Bank charges and interest',
    verdict: 'yes',
    aliases: ['bank charges', 'bank fees', 'interest', 'overdraft', 'card fees', 'finance charges', 'loan interest'],
    rule: 'Yes. Business bank charges and interest on business borrowing are allowable. Repaying the loan itself is not.',
    detail: 'Charges on a business account, overdraft and card fees, interest on business loans, hire purchase interest and leasing payments are all allowable. What you cannot claim is the repayment of the loan itself, only the interest and the charges on it. The old cap on interest under the cash basis was removed on 6 April 2024.',
  },
  {
    key: 'marketing',
    title: 'Advertising and website',
    verdict: 'yes',
    aliases: ['advertising', 'marketing', 'website', 'leaflets', 'business cards', 'signage', 'facebook ads', 'google ads', 'flyers', 'van signage'],
    rule: 'Yes. Advertising, your website, business cards, signage and ads are allowable.',
    detail: 'Getting your name out, a website, cards, leaflets, van signage, paid ads, is fully allowable.',
  },
  {
    key: 'subscriptions',
    title: 'Trade body and subscriptions',
    verdict: 'yes',
    aliases: ['subscription', 'membership', 'trade body', 'union', 'professional body', 'gas safe registration', 'niceic', 'fmb'],
    rule: 'Yes, the relevant ones. Membership of a trade or professional body for your work is allowable.',
    detail: 'Fees to a recognised trade or professional body relevant to your work, and registrations like Gas Safe or NICEIC, are allowable.',
  },
  {
    key: 'entertainment',
    title: 'Entertaining clients',
    verdict: 'no',
    aliases: ['entertainment', 'entertaining', 'client lunch', 'taking a client', 'hospitality', 'corporate hospitality'],
    rule: 'No. Entertaining clients or customers is specifically not allowable, however good for business it feels.',
    detail: 'Client entertaining is blocked by law, even when it genuinely wins work. It is one of the few things HMRC names directly as not allowable.',
  },
  {
    key: 'grooming',
    title: 'Haircuts and grooming',
    verdict: 'no',
    aliases: ['haircut', 'grooming', 'gym', 'makeup', 'make up', 'cosmetics', 'personal care'],
    rule: 'No. Personal grooming, haircuts and gym are personal, not business, so they are not allowable.',
    detail: 'Anything that keeps you, the person, going is personal in HMRC eyes, not a business cost, so it is out.',
  },
  {
    key: 'pension',
    title: 'Pension contributions',
    verdict: 'depends',
    aliases: ['pension', 'sipp', 'retirement', 'pension contribution'],
    rule: 'Not an expense, but a tax saver. A personal pension is not a business cost, but it gets you tax relief and cuts your bill. Well worth it.',
    detail: 'You do not put a personal pension through as a business expense, but paying in gets you tax relief, 20% added automatically and more reclaimed if you are a higher rate payer. One of the best legal ways to cut your tax.',
  },
  {
    key: 'bad_debt',
    title: 'A customer who never paid',
    verdict: 'yes',
    aliases: ['bad debt', 'bad debts', 'unpaid invoice', 'unpaid invoices', 'never paid', 'did not pay', 'didnt pay', 'customer never paid', 'write off', 'write-off', 'writeoff', 'wont pay', 'refuses to pay'],
    rule: 'Yes, once it is genuinely bad. A specific invoice you have given up on can be written off and deducted in the year it goes bad. A general "some might not pay" reserve cannot.',
    detail: 'HMRC allows a deduction for a specific bad or doubtful debt in the year it becomes bad, but not a blanket reserve across all your customers. So a named invoice you have chased and given up on comes off your profit. If they pay later, it goes back on.',
  },
  {
    key: 'pretrading',
    title: 'Costs before you started trading',
    verdict: 'yes',
    aliases: ['before i started', 'before trading', 'pre trading', 'pre-trading', 'setup costs', 'start up costs', 'startup costs', 'start-up', 'before i was self employed', 'costs before starting'],
    rule: 'Yes, up to seven years back. Everyday running costs you paid before your first day of trading are treated as if incurred on that first day, so they are allowable.',
    detail: 'Revenue costs (not equipment) incurred in the seven years before you started, that would have been allowable once trading, are relieved as if spent on day one. Tools and equipment are handled separately as capital.',
  },
];

// Match a free-text query to a rule by its aliases. Pure, deterministic, no network.
//
// ⚠️ IT ANSWERS ANY STRING THAT HAPPENS TO CARRY AN ALIAS, AND THAT IS CORRECT FOR WHAT IT IS.
// It is a lookup, not a router. Every caller that hands it a sentence a customer typed must first
// decide that the sentence is a claim question at all, and isClaimQuestion() below is the one
// place that decision is written down. Do not add a second one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE LONGEST ALIAS WINS, AND IT USED TO BE THE FIRST RULE IN THE FILE. 11 August 2026.
//
// This walked EXPENSE_RULES in order and returned the first rule with any alias in the string. File
// order is not a judgement about which alias is the better match, and on three real questions it
// gave the wrong one. The worst by a distance:
//
//   "can I claim a parking ticket?"  ->  TRAINING AND COURSES, "Mostly yes."
//
// because the training rule carries the alias 'ticket' and sits three rules above parking. This
// file's own parking rule says HMRC never allows a penalty. So the corpus contradicted itself and
// told a man a fine was probably claimable, which is the OVER CLAIM direction, on the exact class
// Finance Act 2026 Sch 22 reaches, on a product whose header is about not helping bring an
// inaccurate return about. Two more of the same shape: "car parking" answered A CAR ('car' beat
// 'car park'), and "van insurance" answered A VAN ('van' beat 'van insurance').
//
// ⚠️ THE FIX IS SPECIFICITY, NOT REORDERING. Reordering trades one arbitrary tie break for another
// and the next alias collision is somebody else's afternoon. The longest matching alias is the most
// specific thing the customer actually said: 'parking ticket' beats 'ticket', 'car park' beats
// 'car', 'van insurance' beats 'van'. File order survives only as the final tie break between two
// aliases of the SAME length, where it is as good as anything.
//
// ⚠️ AND IT IS STILL WHOLE WORD, SPACE DELIMITED, AND STILL RETURNS null WHEN NOTHING MATCHES.
// isClaimQuestion() in front of it decides whether the corpus should be asked at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function checkExpense(query: string): ExpenseRule | null {
  const q = ' ' + query.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  let best: ExpenseRule | null = null;
  let bestLen = 0;
  for (const r of EXPENSE_RULES) {
    for (const a of r.aliases) {
      const alias = a.toLowerCase();
      // Strictly greater, so the earlier rule keeps a tie and nothing already correct moves.
      if (alias.length > bestLen && q.includes(' ' + alias + ' ')) {
        best = r;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DOOR IN FRONT OF THE CORPUS. IT LIVES HERE BECAUSE THE SECOND COPY OF IT WAS THE BUG.
//
// Found live in the in app chat, 11 August 2026, on two strings a customer actually typed:
//
//   "delete all my data"  ->  🟡 Phone and broadband. "The business share. Work out the business
//                             percentage of your bill and claim that."
//   "free subscription"   ->  ✅ Trade body and subscriptions.
//
// The first is a man asking to be erased. The second is a question about OUR price. Both were
// answered with an expenses card, because app/api/thread/route.ts guarded its claim lane with one
// condition, `!/£\s*\d/.test(q)`, under a comment claiming it was "guarded the same way the
// WhatsApp checker guards itself". It was not. isExpenseCheck() in app/api/whatsapp/route.ts has
// three conditions and only the money one had been copied across, so on the chat every sentence
// without a pound sign reached a corpus that answers anything carrying an alias.
//
// 🔴 THE DEFECT IS THE COPY, NOT THE MISSING LINE. A guard that exists twice drifts, and this one
// drifted in the direction nobody sees: nothing crashes, nothing looks broken, and the only person
// who can tell is the customer holding a screenshot of a phone bill card under the words "delete
// all my data". Writing the missing condition into the route by hand would have shipped a third
// copy and set the next drift up. So the corpus owns the decision and every channel asks it.
//
// ⚠️ WHATSAPP STILL HOLDS A PRIVATE COPY, AND IT SHOULD BE COLLAPSED ONTO THIS ONE IN A LATER
// PASS. isExpenseCheck() in app/api/whatsapp/route.ts does the same job with its own regexes,
// and it also decides WHICH HANDLER a message reaches, so moving it is a routing change on the
// busiest surface in the product and it is not smuggled in under a chat fix. Until that pass
// lands there are two copies. There must never be three.
//
// THE THREE CONDITIONS, AND WHY EACH ONE EARNS ITS PLACE:
//
//   1. NO MONEY AMOUNT. A message carrying a pound figure is telling us about a purchase, not
//      asking about the rules. WhatsApp's reasoning, kept word for word.
//   2. IT HAS TO READ LIKE A QUESTION. "delete all my data" and "free subscription" are both
//      instructions or fragments, and neither survives this line. It is the cheapest condition
//      here and it is the one that caught both proved strings.
//   3. IT HAS TO BE ABOUT CLAIMING. Either the claim vocabulary is in it, or it is the bare
//      follow up "what about X".
//
// ⚠️ CONDITION 3 IS ONE CLAUSE WIDER THAN WHATSAPP'S AND THE CLAUSE IS DELIBERATE. WhatsApp lists
// "what about" as a question SHAPE and then demands a claim word on top, so "what about my van
// insurance", which is how a man asks the second question of a claim conversation, matches nothing
// and goes to the model on both channels today. In this lane order there is nothing else a bare
// "what about X" can mean: the product questions, the deadlines and the totals have all had their
// turn above it. So the follow up is a claim signal in its own right.
//
// ⚠️ AND THE HONEST LIMIT OF THAT CLAUSE, WRITTEN DOWN RATHER THAN DISCOVERED LATER: "what about
// my subscription?" now reaches the corpus and comes back about trade bodies. It is the same shape
// as the "free subscription" fault and this guard does not close it. The real answer is that a
// question about our price belongs to matchProductTruth() in lib/waintents.ts, which today knows
// about filing, approval, savings, concealment and investment advice, and nothing about what we
// charge. That is a lane to add there, not a denylist to grow here.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// The claim vocabulary. Kept identical to CLAIM_WORDS in app/api/whatsapp/route.ts so the two
// copies can be collapsed onto this one without a behaviour change on that channel.
const CLAIM_WORDS = /\b(claim|expense|deduct|deductible|allowable|write[- ]?off|writeoff|tax[- ]?deductible)\b/i;

// A pound figure with a number after it. A logged purchase, not a question about the rules.
const LOGGED_AMOUNT = /£\s*\d/;

// It reads like somebody asking rather than somebody instructing.
const ASKING = /\bcan i\b|\bcould i\b|\bable to\b|\bdo i\b|\bis (?:it|this|that|a|an|my|the)\b|\bare (?:my|these|those)\b|\bwhat about\b|\?/i;

// "what about my van insurance". The second question of a claim conversation, carrying no claim
// word because the first question already said it.
const FOLLOW_UP = /\bwhat about\b/i;

// Is this sentence a claim question at all? Ask this BEFORE checkExpense on any surface where a
// customer types freely. Pure, deterministic, no network, same as everything else in this file.
export function isClaimQuestion(query: string): boolean {
  const q = query || '';
  if (LOGGED_AMOUNT.test(q)) return false;
  if (!ASKING.test(q)) return false;
  return CLAIM_WORDS.test(q) || FOLLOW_UP.test(q);
}

export const VERDICT_ICON: Record<Verdict, string> = {
  yes: '✅',
  partly: '🟡',
  depends: '🟡',
  no: '❌',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: 'Yes, claim it',
  partly: 'Part of it',
  depends: 'It depends',
  no: 'Usually not',
};

// The legal ways to keep more of what you earn. Used for the "pay less tax" reply and the page.
export const TAX_TIPS: { title: string; body: string }[] = [
  { title: 'Claim every allowable expense', body: 'The biggest one. Money you spend on the business that you forget to claim is tax you did not need to pay. Log it all, even the small stuff.' },
  { title: 'Working from home', body: 'Do your quotes and admin at home? Claim the flat rate, up to £26 a month, or a fair share of your actual bills.' },
  { title: 'Mileage', body: 'Every business mile is 55p for the first 10,000, then 25p. It adds up fast over a year of driving to jobs.' },
  { title: 'Tools in full, the year you buy them', body: 'The Annual Investment Allowance lets you deduct the whole cost of tools, equipment and a van in the year you buy, not spread over years.' },
  { title: 'Phone and broadband', body: 'Claim the business share of your phone and internet. For most trades that is most of the bill.' },
  { title: 'A pension', body: 'Paying into a pension gets you tax relief and cuts your bill. One of the most tax efficient moves there is for the self employed.' },
  { title: 'Claim your CIS back', body: 'If contractors deduct CIS from your pay, that is tax already handed over. It comes off your bill at tax time, and is often a refund.' },
  { title: 'The £1,000 trading allowance', body: 'If your costs are tiny, you can claim a flat £1,000 instead of your actual expenses. Lekhio uses whichever leaves you better off.' },
  { title: 'Marriage allowance', body: 'If your husband or wife earns under £12,570, they can pass you £1,260 of their tax free allowance. That is £252 off your bill every year, and you can backdate it four years. They have to apply, not you. HMRC will not take it from the person receiving it.' },
  { title: 'Time big buys before 5 April', body: 'A large tool or van bought just before the tax year ends brings the relief forward a whole year. Timing matters.' },
];
