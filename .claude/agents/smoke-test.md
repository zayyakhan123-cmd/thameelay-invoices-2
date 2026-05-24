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
2. Install browser if needed: `npx playwright install chromium`
3. Run tests:
   - **Normal (headless, ~8s):** `npm test`
   - **First time / session expired:** `HEADED=1 npm test` — Chrome opens, user signs in once, session saved to `tests/.auth.json`

**Never hardcode credentials.** The saved session in `tests/.auth.json` handles auth automatically after the first run.

## What the tests check
- App loads at /app with correct title
- Sign-in works and cloudPullAll returns > 0 invoices
- Dashboard renders
- Upload Invoices page reachable via nav
- Price Tracker page (`#pg-tracker`) reachable via nav

## On failure
1. Re-run headed to watch: `HEADED=1 npm test`
2. If session expired, delete `tests/.auth.json` then re-run with `HEADED=1`
3. Check Vercel deployment status (vercel.com dashboard or `vercel ls`)
4. Check Supabase is up (fslrqqaplwfyqemdumfz.supabase.co)
5. Check browser console for CDN / auth errors
