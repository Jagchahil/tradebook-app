// Parity: the web property engine (canonical) vs the app mirror.
// Run with: node test/property-parity.test.mjs   (Node 22.6+, type stripping)
//
// Same guarantee as tax-parity and nisl-parity: the two hand maintained
// copies cannot silently diverge. Compares the full combined bill across a
// grid of salaries, trades, rents, finance costs and both tax years.

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { stageLib } from './stagelib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const weblib = path.resolve(here, '../lib');
const applib = path.resolve(here, '../../tradebook-app/lib');

// 🔴 TWO STAGES, ONE PER REPO, AND BOTH DERIVED. B73, 20 August 2026.
//
// This staged both engines into ONE directory and renamed them webproperty.ts and appproperty.ts
// so they could not collide. The renaming meant each engine could only bring the siblings named on
// the line that staged it, which is the same hand written list as everywhere else with a collision
// as its excuse. Two directories remove the excuse: each engine keeps its own name and gets the
// whole of its own lib, so either side can gain an import without this suite noticing.
const webStage = stageLib('property-parity-web-', weblib);
const appStage = stageLib('property-parity-app-', applib);
const web = await import(pathToFileURL(path.join(webStage, 'propertyengine.ts')).href);
const app = await import(pathToFileURL(path.join(appStage, 'propertyengine.ts')).href);

let pass = 0;
let fail = 0;
const agree = (name, a, b) => {
  if (Math.abs(a - b) < 0.01) pass++;
  else {
    fail++;
    console.error(`DIVERGE ${name}: web ${a}, app ${b}`);
  }
};

const salaries = [0, 8000, 30000, 60000, 105000];
const trades = [0, 40000];
const rentals = [
  { rents: 0, propertyExpenses: 0, financeCosts: 0 },
  { rents: 900, propertyExpenses: 0, financeCosts: 0 },
  { rents: 12000, propertyExpenses: 2000, financeCosts: 6000 },
  { rents: 24000, propertyExpenses: 400, financeCosts: 15000 },
  { rents: 45000, propertyExpenses: 9000, financeCosts: 14000 },
];
const years = ['2026-27', '2027-28'];
const shares = [1, 0.5];

for (const taxYear of years) {
  for (const employmentIncome of salaries) {
    for (const tradeProfit of trades) {
      for (const rental of rentals) {
        for (const jointShare of shares) {
          const input = { taxYear, employmentIncome, tradeProfit, ...rental, jointShare };
          const w = web.combinedBill(input);
          const a = app.combinedBill(input);
          const tag = `${taxYear} s${employmentIncome} t${tradeProfit} r${rental.rents} f${rental.financeCosts} j${jointShare}`;
          agree(`${tag} incomeTax`, w.incomeTax, a.incomeTax);
          agree(`${tag} propertyTax`, w.propertyTax, a.propertyTax);
          agree(`${tag} s24`, w.s24Relief, a.s24Relief);
          agree(`${tag} caused`, w.taxCausedByProperty, a.taxCausedByProperty);
          agree(`${tag} class4`, w.class4, a.class4);
        }
      }
    }
  }
}

// Rent a Room agrees too.
for (const g of [4000, 7500, 9000, 15000]) {
  agree(`RaR ${g} relief`, web.rentARoom(g, 1200).taxableWithRelief, app.rentARoom(g, 1200).taxableWithRelief);
  agree(`RaR ${g} actuals`, web.rentARoom(g, 1200).taxableWithActuals, app.rentARoom(g, 1200).taxableWithActuals);
}

console.log(`property-parity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
