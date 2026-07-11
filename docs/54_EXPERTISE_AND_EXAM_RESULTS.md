# 54: Expertise and Exam Results

> How Lekhio became, and proves it is, an expert in UK self-employed tax. We mapped the syllabuses of the world's leading accounting and tax qualifications, built one canonical tax engine from those rules, and run an exam-style test suite against it every release. This is the evidence, and the honest limits of what it lets us claim.

---

## What we did

Most tax apps say they are accurate. We wanted it tested. So we did three things.

First, we mapped the syllabuses of the leading qualifications and pulled out every topic relevant to a UK sole trader or trade: ICAEW ACA (Principles of Taxation, Tax Compliance), ACCA (TX and ATX, UK), CIOT CTA (the owner-managed business and individuals routes), AAT (Business Tax, Personal Tax, and the Level 2 to 3 bookkeeping units), CIMA (the financial-accounting and ethics foundation), and for a global view the US CPA REG section and the IRS Enrolled Agent exam. That gave a consolidated list of twenty topic areas that together represent expert coverage.

Second, we built one canonical tax engine, `lib/taxengine.ts`, that encodes the published 2026/27 figures and the computation methods these qualifications teach: income tax with the personal-allowance taper, Class 2 and Class 4 National Insurance, CIS deductions, mileage and use-of-home on the simplified basis, the trading allowance, the Annual Investment Allowance, VAT registration, the MTD for Income Tax thresholds, and the allowable-versus-disallowable treatment of common trade costs. One engine, used as the single source of truth, so the website calculator, the WhatsApp answers and the app all give the same correct number.

Third, we wrote an exam-style test suite of 71 questions spanning all seven qualifications and all twenty topics, and a runner that answers every question with the real engine and scores it. The expected answers were worked out by hand from HMRC's published figures, completely separately from the engine code, so a shared mistake cannot hide. The suite runs from `test/exams/`.

---

## The result

**71 out of 71. A clean 100%, for the 2026/27 tax year.**

By qualification: ACCA TX 25/25, ICAEW Tax Compliance 7/7, ICAEW Principles of Taxation 5/5, CIOT CTA 6/6, AAT Business Tax 11/11, AAT Personal and Indirect Tax 2/2, CIS for trades 5/5, MTD for Income Tax 5/5, plus the ethics, US CPA REG, IRS EA and CIMA bookkeeping checks.

By topic, every area passed: income tax and the personal-allowance taper, the additional rate, Class 4 NIC across both rates, CIS deductions and basis, mileage across both bands, use of home, the trading allowance, capital allowances and the AIA cap, VAT registration and deregistration, the MTD thresholds and first-quarter deadline, basis period reform, the cash basis, record keeping, self-assessment deadlines, badges of trade, double-entry bookkeeping, and allowable-versus-disallowable expenses.

One thing the exercise caught and confirmed: HMRC raised the simplified mileage rate to 55p per mile for the first 10,000 miles from 6 April 2026, the first increase in fifteen years. Our 55p figure is right for 2026/27. The point of running the exams is exactly this, to catch a stale figure before a customer does.

---

## What this lets us say, and what it does not

We can honestly say: Lekhio's tax engine is built on the rules taught in the leading UK tax and accountancy qualifications, covers the same topics a qualified adviser is examined on for a self-employed client, and is checked against an exam-style suite every release. That is true, it is tested, and it is more than almost any competitor can show.

We must not say, and will not: that Lekhio is a chartered accountant, that it holds any qualification, or that ICAEW, ACCA, CIOT, AAT or any body endorses, accredits or is partnered with us. They do not. Scoring 100% on our own suite is a measure of our engine's accuracy against published rules, not a professional qualification or an external accreditation. And nothing here changes the core promise: we prepare, the user approves, HMRC keeps the taxpayer responsible. The expertise makes the preparation trustworthy. It does not move the line on who is responsible.

---

## Keeping it true over time

The suite is a living asset. Each tax year, when HMRC publishes new figures, we update `FACTS` in the engine and the expected answers in the bank, run the suite, and ship only when it is green again. New topics (capital gains on a van, partnership profit shares, losses relief) become new questions. The exam is how we stay expert, not a one-off badge.

Run it any time with: `node test/exams/run-exams.mjs`.
