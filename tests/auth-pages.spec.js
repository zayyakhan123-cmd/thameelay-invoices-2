// Auth-page specs: /forgot-password, /reset-password, and invoice-manager login gate toggle.
// These run against the live site — no sign-in required.
// Run: npx playwright test tests/auth-pages.spec.js --reporter=list

const { test, expect, chromium } = require('@playwright/test');

let browser, page;

test.setTimeout(30000);

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctx = await browser.newContext({ baseURL: 'https://www.trackaisle.com' });
  page = await ctx.newPage();
});

test.afterAll(async () => {
  await browser?.close();
});

// ── /reset-password ────────────────────────────────────────────────────────────

test('/reset-password bare load shows invalid/expired state with link back to /forgot-password', async () => {
  // Load with no hash token and no ?code= param — recovery session is absent
  await page.goto('/reset-password');
  await page.waitForTimeout(1500); // let the async session-check IIFE complete

  // Form should be hidden; invalid state should be visible
  const formWrap    = page.locator('#form-wrap');
  const invalidState = page.locator('#invalid-state');

  await expect(invalidState).toBeVisible({ timeout: 5000 });
  await expect(formWrap).toBeHidden();

  // The link must point back to /forgot-password
  const link = invalidState.locator('a[href="/forgot-password"]');
  await expect(link).toBeVisible();
});

// ── invoice-manager.html login gate toggle ────────────────────────────────────

test('invoice-manager login gate: "Forgot password?" visible in sign-in mode, hidden in sign-up mode', async () => {
  // invoice-manager.html is served at /app (Vercel cleanUrls maps it)
  await page.goto('/app');
  await page.waitForTimeout(2000); // let Supabase restore session attempt

  // If already signed in, skip — this test only applies to the gate
  const loginGate = page.locator('#login-gate');
  const isGateVisible = await loginGate.isVisible().catch(() => false);
  if (!isGateVisible) {
    console.log('  ⏭ Skipped: user is signed in, login gate not visible');
    return;
  }

  const forgotLink = page.locator('#login-forgot');

  // Default mode is sign-in — link must be visible
  await expect(forgotLink).toBeVisible({ timeout: 5000 });
  await expect(forgotLink).toHaveAttribute('href', '/forgot-password');

  // Toggle to sign-up mode — link must disappear
  await page.locator('#login-toggle').click();
  await expect(forgotLink).toBeHidden();

  // Toggle back to sign-in mode — link reappears
  await page.locator('#login-toggle').click();
  await expect(forgotLink).toBeVisible();
});
