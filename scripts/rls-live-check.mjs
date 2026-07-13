// DOES ROW LEVEL SECURITY ACTUALLY STOP ONE USER READING ANOTHER USER'S MONEY?
//
//   node scripts/rls-live-check.mjs
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// There are 26 RLS policies on this database and every audit has verified them BY READING THEM.
// Nobody has ever signed in as one user and tried to fetch another user's transactions.
//
// Reading a policy is not testing it. That is exactly the mistake that let the AIA