---
name: smoke-test
description: Run Playwright smoke tests against trackaisle.com/app after a push to verify nothing is broken.
---

Run the Playwright smoke suite against production. Report pass/fail per test and flag any regressions.

## How to trigger
After `git push origin main`, run:
```
/smoke-test
```
Or ask: "run smoke tests", "verify the push", "did anything break"

## Steps

1. Install deps if needed: `npm install` (only first time or after package.json changes)
2. Install browser if needed: `npx playwright install webkit`
3. Run: `TEST_EMAIL=zayyakhan2.2@gmail.com TEST_PASSWORD=$PW npx playwright test tests/smoke.spec.js`

**Never hardcode TEST_PASSWORD** — ask the user to set it or use a saved env var.

## What the tests check
- App loads at /app with correct title
- Sign-in works and cloudPullAll returns > 0 invoices
- Dashboard vendor summary renders
- Upload Invoices page reachable via nav
- Price Tracker page reachable via nav

## On failure
1. Re-run with `--headed` to watch: `npm run test:headed`
2. Check Vercel deployment status (vercel.com dashboard or `vercel ls`)
3. Check Supabase is up (fslrqqaplwfyqemdumfz.supabase.co)
4. Check browser console for CDN / auth errors
