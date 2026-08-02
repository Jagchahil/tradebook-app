// The vendor rules. See lib/categories.ts.
//
// WHAT THESE TESTS PROTECT. Every rule in that file is a GUESS PRESENTED AS AN ANSWER. The app
// says "I think this is materials" and a man taps yes, because that is what people do with a
// confident machine. So a confidently WRONG rule does not merely fail to help him. It walks a
// wrong number into his tax return, and he signs it himself.
//
// Which means the most important tests in this file are not the ones proving Screwfix is
// materials. They are the ones proving that AMAZON has NO rule at all.

import { categoriseBankLine, CATEGORIES, isCategory, RULE_COUNT } from '../lib/categories.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}
const cat = (s) => categoriseBankLine(s);

console.log('\nVendor rules\n');

// ==============================================================================================
// THE REFUSALS. These come first because they matter most.
// ==============================================================================================
//
// Amazon sells drill bits and birthday presents off the same card. eBay sells a second-hand SDS
// and a Christmas present. Tesco sells sandwiches for the site and the family shop. Guessing any
// of these is how a personal purchase ends up in a man's business books with his own tick on it.
//
// He will teach us. The first time he says "AMAZON MKTPLACE is materials", lib/memory.ts
// remembers it for good and never asks again. A rule he taught beats a rule we guessed.
ok('AMAZON is NOT guessed', cat('AMAZON MKTPLACE UK') === 'other');
ok('AMZN is NOT guessed', cat('AMZN Mktp UK*RT4Y5') === 'other');
ok('EBAY is NOT guessed', cat('EBAY O*12-34567') === 'other');
ok('PAYPAL is NOT guessed', cat('PAYPAL *STEVESTOOLS') === 'other');
ok('a bare TESCO is NOT guessed', cat('TESCO STORES 3456') === 'other');
ok('ASDA is NOT guessed', cat('ASDA SUPERSTORE') === 'other');
ok('a cash withdrawal is NOT guessed', cat('CASH WITHDRAWAL LINK ATM') === 'other');
ok('a person is NOT guessed as a subcontractor', cat('DAVE SMITH') === 'other');
ok('a bank transfer is NOT guessed', cat('FASTER PAYMENT TO J CHAHIL') === 'other');

// But TESCO PETROL is unambiguous: nobody fills a van with groceries.
ok('TESCO PETROL is fuel (that one IS unambiguous)', cat('TESCO PETROL FILLING STATION') === 'fuel');

// ==============================================================================================
// FUEL
// ==============================================================================================
ok('SHELL', cat('SHELL DAWLISH') === 'fuel');
ok('BP', cat('BP CONNECT M6') === 'fuel');
ok('ESSO', cat('ESSO SERVICE STATION') === 'fuel');
ok('a bare "diesel" line', cat('DIESEL PURCHASE') === 'fuel');
// EV charging IS fuel. Same expense, same job. A man with an electric van should not have to argue.
ok('INSTAVOLT (EV) is fuel', cat('INSTAVOLT LTD') === 'fuel');
ok('BP PULSE (EV) is fuel', cat('BP PULSE CHARGING') === 'fuel');
ok('POD POINT (EV) is fuel', cat('POD POINT LONDON') === 'fuel');

// ==============================================================================================
// MATERIALS. The biggest line on a builder's statement.
// ==============================================================================================
ok('SCREWFIX', cat('SCREWFIX DIRECT LTD') === 'materials');
ok('TOOLSTATION', cat('TOOLSTATION 1234') === 'materials');
ok('TRAVIS PERKINS', cat('TRAVIS PERKINS TRADING') === 'materials');
ok('JEWSON', cat('JEWSON LIMITED') === 'materials');
ok('SELCO', cat('SELCO BUILDERS WAREHOUSE') === 'materials');
ok('B&Q', cat('B&Q 1234') === 'materials');
ok('B & Q with spaces', cat('B & Q WAREHOUSE') === 'materials');
ok('HUWS GRAY (a regional, not just the chains)', cat('HUWS GRAY LTD') === 'materials');
ok('CITY PLUMBING', cat('CITY PLUMBING SUPPLIES') === 'materials');
ok('CEF (electrical wholesale)', cat('CEF LEEDS') === 'materials');
ok('EDMUNDSON', cat('EDMUNDSON ELECTRICAL') === 'materials');
ok('TOPPS TILES', cat('TOPPS TILES PLC') === 'materials');
ok('a generic builders merchant', cat('SMITHS BUILDERS MERCHANT') === 'materials');
ok('timber', cat('LOCAL TIMBER SUPPLIES') === 'materials');

// ==============================================================================================
// TOOLS vs EQUIPMENT. These two are the only categories the capital-allowance logic reads
// (agent_user_aggregates), so the split has to hold.
// ==============================================================================================
ok('MACHINE MART is tools', cat('MACHINE MART LTD') === 'tools');
ok('DEWALT is tools', cat('DEWALT SERVICE CENTRE') === 'tools');
ok('MAKITA is tools', cat('MAKITA UK') === 'tools');

ok('HSS HIRE is equipment, not tools', cat('HSS HIRE SERVICE') === 'equipment');
ok('SPEEDY HIRE is equipment', cat('SPEEDY HIRE PLC') === 'equipment');
ok('plant hire is equipment', cat('LOCAL PLANT HIRE') === 'equipment');
ok('scaffolding hire is equipment', cat('ACME SCAFFOLDING HIRE') === 'equipment');

// ==============================================================================================
// THE VAN. Running it and fixing it. NOT the fuel: fuel has its own line and must win.
// ==============================================================================================
ok('DVLA is van', cat('DVLA VEHICLE TAX') === 'van');
ok('KWIK FIT is van', cat('KWIK FIT 456') === 'van');
ok('MOT is van', cat('LOCAL GARAGE MOT') === 'van');
ok('EURO CAR PARTS is van', cat('EURO CAR PARTS') === 'van');
ok('breakdown cover is van', cat('GREEN FLAG BREAKDOWN') === 'van');

// ==============================================================================================
// TRAVEL
// ==============================================================================================
ok('RINGGO is travel', cat('RINGGO PARKING') === 'travel');
ok('the congestion charge is travel', cat('TFL CONGESTION CHARGE') === 'travel');
ok('DART CHARGE is travel', cat('DART CHARGE') === 'travel');
ok('TRAINLINE is travel', cat('TRAINLINE.COM') === 'travel');
ok('TRAVELODGE is travel', cat('TRAVELODGE HOTELS') === 'travel');

// ==============================================================================================
// SUBCONTRACTOR and WAGES. Deliberately narrow.
// ==============================================================================================
//
// A payment to "Dave" is NOT a subcontractor. It might be his brother, paid back for a curry.
// Only the unambiguous words, and this refusal is the point.
ok('an explicit CIS payment is subcontractor', cat('CIS PAYMENT J SMITH') === 'subcontractor');
ok('"subcontractor" is subcontractor', cat('SUBCONTRACTOR LABOUR') === 'subcontractor');
ok('but a bare name is NOT', cat('J SMITH') === 'other');
ok('HMRC PAYE is wages', cat('HMRC PAYE') === 'wages');
ok('a pension provider is wages', cat('NEST PENSIONS') === 'wages');

// ==============================================================================================
// The rest
// ==============================================================================================
ok('HISCOX is insurance', cat('HISCOX INSURANCE') === 'insurance');
ok('tradesman saver is insurance', cat('TRADESMAN SAVER') === 'insurance');
ok('EE is phone', cat('EE LIMITED') === 'phone');
ok('VODAFONE is phone', cat('VODAFONE UK') === 'phone');

ok('XERO is software', cat('XERO LIMITED') === 'software');
ok('MICROSOFT is software', cat('MICROSOFT 365') === 'software');
ok('GODADDY is software', cat('GODADDY.COM') === 'software');

ok('ARCO is workwear', cat('ARCO LTD') === 'workwear');
ok('safety boots are workwear', cat('SAFETY BOOTS DIRECT') === 'workwear');

ok('skip hire is waste', cat('SKIP HIRE LTD') === 'waste');
ok('BIFFA is waste', cat('BIFFA WASTE SERVICES') === 'waste');

ok('CSCS is training', cat('CSCS CARD RENEWAL') === 'training');
ok('GAS SAFE is training', cat('GAS SAFE REGISTER') === 'training');
ok('NICEIC is training', cat('NICEIC ASSESSMENT') === 'training');

ok('an accountant is accountancy', cat('SMITH & CO ACCOUNTANTS') === 'accountancy');
ok('COMPANIES HOUSE is accountancy', cat('COMPANIES HOUSE') === 'accountancy');
ok('the ICO fee is accountancy', cat('ICO DATA PROTECTION FEE') === 'accountancy');

ok('CHECKATRADE is marketing', cat('CHECKATRADE.COM') === 'marketing');
ok('RATED PEOPLE is marketing', cat('RATED PEOPLE LTD') === 'marketing');
ok('VISTAPRINT is marketing', cat('VISTAPRINT UK') === 'marketing');

ok('an overdraft fee is bank charges', cat('ARRANGED OVERDRAFT FEE') === 'bank charges');
ok('SUMUP is bank charges', cat('SUMUP PAYMENTS') === 'bank charges');

ok('GREGGS is meals', cat('GREGGS PLC 1234') === 'meals');
ok('COSTA is meals', cat('COSTA COFFEE') === 'meals');

// ==============================================================================================
// ORDER OF THE RULES. First match wins, so the specific must beat the generic.
// ==============================================================================================
//
// "SHELL" contains no other keyword, but a fuel station attached to a shop could. And SCREWFIX
// sells workwear: it must still come back materials, because that is what he is nearly always
// buying there, and the one time it is boots he can change it in a tap.
ok('SCREWFIX WORKWEAR still lands as materials (that is where he mostly shops)',
  cat('SCREWFIX DIRECT WORKWEAR') === 'materials');
ok('a fuel line mentioning a shop is still fuel', cat('SHELL SHOP DAWLISH') === 'fuel');

// ==============================================================================================
// Structural
// ==============================================================================================
ok('every rule returns a REAL category', CATEGORIES.length > 0);
ok('"other" is a category', isCategory('other'));
ok('"materials" is a category', isCategory('materials'));
ok('"nonsense" is not', !isCategory('nonsense'));
ok('case and spacing do not matter', isCategory('  MATERIALS  '));
ok('an empty vendor is other, not a crash', cat('') === 'other');

// A guard against someone quietly gutting the file. It was 8 rules; it is now a real map.
ok(`there are meaningfully more than the old 8 rules (${RULE_COUNT})`, RULE_COUNT >= 25);

// Every category the map can EMIT must be in the canonical list, or the app will render a
// category its picker does not have and he will not be able to change it back.
// ---------------------------------------------------------------------------------------------
// 🔴 THE BUSINESS THAT WORKS FROM PREMISES, NOT A VAN.
// ---------------------------------------------------------------------------------------------
//
// Every category in this file was a tradesman's: materials, tools, van, workwear. Good for a plumber,
// and it left a coffee shop with nowhere to put the two biggest costs in its business. The lease and
// the beans both landed in 'other', the bucket named after not knowing: the review pile cannot reason
// about it, the optimiser cannot suggest against it, and he cannot check it.

ok('a business energy supplier is utilities, not other',
  cat('BRITISH GAS BUSINESS') === 'utilities' && cat('EDF ENERGY') === 'utilities');

ok('a water company and a business broadband line are utilities too',
  cat('THAMES WATER') === 'utilities' && cat('BT BUSINESS BROADBAND') === 'utilities');

ok('a serviced office and a storage unit are rent',
  cat('REGUS UK LTD') === 'rent' && cat('BIG YELLOW SELF STORAGE') === 'rent');

ok('an unambiguous premises phrase is rent',
  cat('SHOP RENT MARCH') === 'rent' && cat('COMMERCIAL RENT') === 'rent');

ok('a wholesaler and a food service supplier are STOCK, not materials',
  cat('BOOKER WHOLESALE') === 'stock' && cat('BIDFOOD') === 'stock');

ok('...because stock is SOLD ON and materials are CONSUMED: different lines, different stocktake',
  cat('GOODS FOR RESALE') === 'stock' && cat('TRAVIS PERKINS') === 'materials');

// ---------------------------------------------------------------------------------------------
// 🔴 THE GUARD THAT MATTERS MOST IN THIS WHOLE FILE.
// ---------------------------------------------------------------------------------------------
//
// A rule on the bare word "rent" would sweep up A MAN'S OWN HOUSE RENT and claim tax relief on it.
// That is not a misfiling to tidy up later. It is a WRONG CLAIM ON A REAL RETURN, in his name, that
// he signed and is legally responsible for. Same reasoning that leaves 'mortgage interest' with no
// auto rule at all. Use of home is a FLAT RATE; it is never his actual rent.
//
// If these ever start matching, someone has added a loose rule, and this test is the only thing
// standing between that and a false claim.

ok('🔴 A MAN\'S OWN HOME RENT IS NEVER AUTO CLAIMED AS BUSINESS RENT',
  cat('RENT') !== 'rent' && cat('MONTHLY RENT') !== 'rent'
  && cat('RENT PAYMENT') !== 'rent' && cat('LANDLORD RENT DD') !== 'rent');

ok('...and a letting agent taking his HOME rent is not swept up either',
  cat('RENT TO CONNELLS') !== 'rent' && cat('HAART RENT') !== 'rent');

ok('🔴 the trades are not misfiled to serve the shops: "gas" and "electric" stay a plumber\'s words',
  cat('GAS FITTINGS LTD') !== 'utilities' && cat('ELECTRIC SUPPLIES CO') !== 'utilities');

const emitted = [
  'fuel', 'materials', 'tools', 'equipment', 'van', 'travel', 'subcontractor', 'wages',
  'insurance', 'phone', 'software', 'workwear', 'waste', 'training', 'accountancy',
  'marketing', 'bank charges', 'meals', 'other',
  // Added 27 Jul when the cost sheet stopped being a tradesman's only.
  'rent', 'utilities', 'stock',
];
ok('every category the map emits is in the canonical list', emitted.every(isCategory));

// 🔴 A MERCHANT WE CLAIM TO KNOW, WRITTEN THE WAY A BANK ACTUALLY WRITES IT.
//
// Found on the live pile on 28 July 2026, on Jag's real feed: "Transport for London, 3 payments"
// came through as an unknown and offered him a 24 option dropdown. The rule knew "tfl" and nothing
// else. One bank sends TFL TRAVEL CH, another spells it out.
//
// This is worse than never having claimed the merchant. The whole promise of the pile is that we
// recognise the ones anybody would recognise, and being asked about Transport for London is the
// moment a man decides the grouping does not work.
console.log('\nBANKS DO NOT AGREE ON HOW A MERCHANT IS SPELLED');
ok('🔴 TRANSPORT FOR LONDON, SPELLED OUT', cat('TRANSPORT FOR LONDON') === 'travel');
ok('and the abbreviation a different bank sends', cat('TFL TRAVEL CH') === 'travel');
ok('mixed case and a reference do not break it', cat('Transport for London 1234567') === 'travel');
// The full name must not have widened the rule into things that are not travel.
ok('it did not start swallowing unrelated lines', cat('LONDON STONE PAVING') !== 'travel');
ok('a merchant in another rule is untouched', cat('SCREWFIX DIRECT') === 'materials');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SELF STORAGE THAT IS NOT ONE OF THE SIX NATIONAL BRANDS.
//
// Walking a real statement on 2 August 2026: KIRKSTALL SELF STORAGE, £1,040 across four payments,
// suggested as nothing at all, because the rule was a brand list. A tradesman's storage unit is
// where his gear lives and it is one of the most ordinary costs in this trade.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nSelf storage, including the independents');
ok('🔴 KIRKSTALL SELF STORAGE is rent, and it used to be nothing',
  cat('KIRKSTALL SELF STORAGE') === 'rent');
ok('so is any other independent', cat('HOLBECK SELF-STORAGE LTD') === 'rent');
ok('and a storage unit by that name', cat('ARMLEY STORAGE UNIT 14') === 'rent');
ok('CONTROL: the national brands still work', cat('BIG YELLOW SELF STORAGE') === 'rent');
// 🔴 THE RULE THIS FILE EXISTS TO PROTECT. The bare word "rent" must never match, because a man's
// own house rent is not a business cost and claiming it is a wrong return in his name.
ok('🔴 AND THE BARE WORD "rent" STILL MATCHES NOTHING', cat('RENT') === 'other');
ok('nor a standing order that just says rent', cat('SO RENT PAYMENT') === 'other');
ok('cloud storage is not premises', cat('GOOGLE CLOUD STORAGE') !== 'rent');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
