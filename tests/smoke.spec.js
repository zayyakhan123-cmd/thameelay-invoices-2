// Smoke tests for trackaisle.com/app
// First run: HEADED=1 npm test  → Chrome opens, sign in once, state saved to tests/.auth.json
// Next runs:  npm test           → loads saved session, no sign-in needed
// Auto CI:    TEST_EMAIL=x TEST_PASSWORD=y npm test

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth.json');
const EMAIL     = process.env.TEST_EMAIL;
const PASSWORD  = process.env.TEST_PASSWORD;
const HEADED    = process.env.HEADED === '1';

let browser, context, page;

test.beforeAll(async () => {
  // Headless when session is already saved; headed on first run or when HEADED=1
  const hasSession = fs.existsSync(AUTH_FILE);
  browser = await chromium.launch({ headless: !HEADED && hasSession, channel: 'chrome' });

  // Load saved auth state if available
  const ctxOptions = { baseURL: 'https://www.trackaisle.com' };
  if (fs.existsSync(AUTH_FILE)) {
    ctxOptions.storageState = AUTH_FILE;
  }
  context = await browser.newContext(ctxOptions);
  page    = await context.newPage();

  await page.goto('/app');

  // Wait briefly for Supabase auto-auth to restore the session from localStorage
  await page.waitForTimeout(2000);

  // Check if we still need to sign in (form visible means session missing/expired)
  const signInBtn = page.getByRole('button', { name: 'Sign in' });
  const needsLogin = await signInBtn.isVisible({ timeout: 1000 }).catch(() => false);

  if (needsLogin) {
    if (EMAIL && PASSWORD) {
      // Auto sign-in
      await page.getByRole('textbox', { name: /email/i }).fill(EMAIL);
      await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
      await signInBtn.click();
    } else {
      // Headed: open Chrome visibly and wait for the user to sign in
      if (!browser.isConnected()) throw new Error('Browser not open');
      console.log('\n  ⏳ Chrome is open — please sign in, then the tests will continue...');
    }
    await page.waitForSelector('#page-title', { timeout: 120_000 });

    // Save the auth state so we never ask again
    await context.storageState({ path: AUTH_FILE });
    console.log('  ✓ Signed in and session saved to tests/.auth.json');
  }
});

test.afterAll(async () => {
  await browser?.close();
});

test('app loads with correct title', async () => {
  await expect(page).toHaveTitle(/Thameelay/);
});

test('invoices loaded from Supabase', async () => {
  await page.waitForTimeout(3000);
  const count = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('tm_h3') || '[]').length
  );
  expect(count).toBeGreaterThan(0);
  console.log(`  ✓ ${count} invoices in localStorage`);
});

test('dashboard renders', async () => {
  // #page-title is in the header; #pg-dashboard is the active page
  await expect(page.locator('#page-title')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#pg-dashboard')).toBeVisible({ timeout: 8000 });
});

test('upload invoices page is reachable via nav', async () => {
  await page.getByRole('navigation').getByText('Upload Invoices').click();
  await expect(page.locator('#file-in, input[type=file]').first()).toBeAttached({ timeout: 8000 });
});

test('price tracker page is reachable via nav', async () => {
  await page.getByRole('navigation').getByText('Price Tracker').click();
  // Wait for the tracker page section to be visible (SPA — other pages stay in DOM hidden)
  await expect(page.locator('#pg-tracker')).toBeVisible({ timeout: 8000 });
});

test('account settings: save and reload persists profile fields', async () => {
  // Navigate to Account Settings
  await page.getByRole('navigation').getByText('Account Settings').click();
  await expect(page.locator('#pg-account-settings')).toBeVisible({ timeout: 8000 });

  // Use a unique test value so we can confirm it round-trips
  const testName = `SmokeTest ${Date.now()}`;

  // Fill display name and save
  const nameInput = page.locator('#s-display-name');
  await nameInput.fill(testName);
  await page.locator('#s-profile-save').click();

  // Wait for success message
  await expect(page.locator('#s-profile-msg')).toHaveText('Profile saved.', { timeout: 8000 });
  console.log(`  ✓ Saved display_name="${testName}"`);

  // Reload the page and navigate back to settings
  await page.reload();
  await page.waitForTimeout(2000);
  await page.getByRole('navigation').getByText('Account Settings').click();
  await expect(page.locator('#pg-account-settings')).toBeVisible({ timeout: 8000 });

  // Verify the saved name reloaded from Supabase
  await expect(page.locator('#s-display-name')).toHaveValue(testName, { timeout: 8000 });
  console.log(`  ✓ display_name persisted after reload`);
});
