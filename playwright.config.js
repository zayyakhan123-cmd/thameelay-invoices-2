const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90_000,   // 90s to allow manual login if needed
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    headless: process.env.HEADED !== '1' && !!process.env.TEST_EMAIL,
    baseURL: 'https://www.trackaisle.com',
    // Auto mode:   TEST_EMAIL=x TEST_PASSWORD=y npm test
    // Manual mode: HEADED=1 npm test  (Chrome opens, you sign in once)
  },
});
