// Tests for lib/companieshouse.ts, the parsers that turn a Companies House response into the fields
// onboarding needs. Pure, fixture-based, no network and no API key. The fixtures match the shapes the
// live register returns (https://developer-specs.company-information.service.gov.uk).
//   node test/companieshouse.test.mjs

import { parseSearch, parseProfile } from '../lib/companieshouse.ts';

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// A real search response shape.
const searchJson = {
  total_results: 2,
  items: [
    { company_number: '12345678', title: 'ACME PLUMBING LTD', company_status: 'active', address_snippet: '1 High Street, London, EC1A 1BB' },
    { company_number: 'SC456789', title: 'HIGHLAND JOINERY LTD', company_status: 'active', address_snippet: '9 Glen Road, Inverness, IV1 1AA' },
    { title: 'NO NUMBER LTD', company_status: 'active' }, // must be dropped: no company_number
  ],
};

{
  const r = parseSearch(searchJson);
  ok('search: returns the two real matches, drops the one with no number', r.length === 2);
  ok('search: first match fields extracted', r[0].companyNumber === '12345678' && r[0].name === 'ACME PLUMBING LTD' && r[0].status === 'active' && /High Street/.test(r[0].addressSnippet));
  ok('search: a Scottish number is preserved as-is', r[1].companyNumber === 'SC456789');
  ok('search: empty or malformed input yields an empty list, never a throw', parseSearch(null).length === 0 && parseSearch({}).length === 0 && parseSearch({ items: 'nope' }).length === 0);
}

// A real company profile shape.
const profileJson = {
  company_name: 'ACME PLUMBING LTD',
  company_number: '12345678',
  company_status: 'active',
  type: 'ltd',
  date_of_creation: '2015-03-12',
  sic_codes: ['43220'],
  registered_office_address: {
    address_line_1: '1 High Street',
    address_line_2: 'Unit 4',
    locality: 'London',
    postal_code: 'EC1A 1BB',
    country: 'England',
  },
};

{
  const p = parseProfile(profileJson);
  ok('profile: parses', p !== null);
  ok('profile: identity fields', p.companyNumber === '12345678' && p.name === 'ACME PLUMBING LTD' && p.status === 'active' && p.type === 'ltd');
  ok('profile: incorporation date and SIC code', p.incorporatedOn === '2015-03-12' && p.sicCodes.length === 1 && p.sicCodes[0] === '43220');
  ok('profile: registered office is filled', p.registeredOffice.line1 === '1 High Street' && p.registeredOffice.postcode === 'EC1A 1BB' && p.registeredOffice.country === 'England');
}

{
  // Missing identity -> null (we never invent a company).
  ok('profile: no name/number returns null, not a half object', parseProfile({ type: 'ltd' }) === null && parseProfile(null) === null);
  // A profile with no registered office must not throw; it comes back with blank address fields.
  const p = parseProfile({ company_name: 'BARE LTD', company_number: '99999999' });
  ok('profile: missing address degrades to blanks, no throw', p !== null && p.registeredOffice.line1 === '' && p.sicCodes.length === 0 && p.incorporatedOn === null);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
