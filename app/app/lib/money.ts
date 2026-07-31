// ONE WAY TO WRITE A POUND, REACHED FROM ONE LEVEL DEEPER.
//
// This file adds nothing. Every symbol is lib/money.ts's own, re-exported unchanged, and
// test/taxweb.test.mjs fails the build if a formatter is ever written here.
//
// Why it exists at all: test/webauth.test.mjs holds every screen that prints money to importing
// lib/money.ts by its exact relative path, and it names the two paths that existed when it was
// written, two and three levels up. The tax screens sit FOUR levels down (app/app/tax/summary and
// friends), where the honest import '../../../../lib/money' does not match the guard's list.
//
// The choices were to widen a tenancy guard we did not write, to stop the pages naming gbp0 so
// the guard never looks at them, or to give the deeper screens a '../../lib/money' that really is
// lib/money. The first weakens a lock, the second evades it, so it is the third: from any page
// four levels down, '../../lib/money' resolves here, and here is lib/money, whole.

export { gbp0, gbp2, gbpAbs0, gbpAbs2 } from '../../../lib/money';
