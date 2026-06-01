// Real Invoice Test Checklist
// Tests duplicate guard, price history accuracy, vendor normalization,
// unmatched recovery (alias persistence), and markup trust.
// Run: npx playwright test tests/invoice-checklist.spec.js --reporter=list

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth.json');
const EMAIL    = process.env.TEST_EMAIL    || 'zayyakhan2.2@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Imrankhan889@';

let browser, ctx, page;

test.setTimeout(120000);

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctxOpts = { baseURL: 'https://www.trackaisle.com' };
  if (fs.existsSync(AUTH_FILE)) ctxOpts.storageState = AUTH_FILE;
  ctx  = await browser.newContext(ctxOpts);
  page = await ctx.newPage();
  await page.goto('/app');
  await page.waitForTimeout(2000);

  const needsLogin = await page.locator('button:has-text("Sign in")').isVisible({ timeout: 2000 }).catch(() => false);
  if (needsLogin) {
    await page.getByRole('textbox', { name: /email/i }).fill(EMAIL);
    await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForSelector('#page-title', { timeout: 30000 });
    await ctx.storageState({ path: AUTH_FILE });
  }
  // Open Produce Matcher to trigger pcSeed and data pull
  await page.click('[data-pg="produce"]');
  await page.waitForTimeout(3000);
});

test.afterAll(async () => { await browser?.close(); });

// ─────────────────────────────────────────────────────────────────
// TEST 1 — Duplicate upload guard
// ─────────────────────────────────────────────────────────────────
test('T1: duplicate upload — same invoice twice never doubles history or price obs', async () => {
  const result = await page.evaluate(() => {
    const INVOICE = { vendor: 'Test Vendor Dup', invoiceNo: 'INV-DUP-001', date: '2026-01-15' };
    const LINES = [
      { catalogId: 'tr_gongura-leaves', catalogName: 'GONGURA LEAVES', cost: 2.50,
        caseCost: 25.00, unitsPerCase: 10, unitType: 'lb',
        invoiceText: 'gongura leaves', invoiceSize: '10 lb', _vendor: INVOICE.vendor,
        _invoiceNo: INVOICE.invoiceNo, _invoiceDate: INVOICE.date }
    ];

    // Clear any existing test data
    const hist = pcLoadHist().filter(h => h.invoiceNo !== 'INV-DUP-001');
    lsSet(SK.PC_HIST, hist);
    const db = loadDB();
    const key = 'testvendordup|tr_gongura-leaves';
    delete db[key];
    saveDB(db);

    // Upload once
    pcSaveToHist(INVOICE, LINES);
    // Upload again (same invoice)
    pcSaveToHist(INVOICE, LINES);

    const histAfter = pcLoadHist().filter(h => h.invoiceNo === 'INV-DUP-001');
    const dbAfter   = loadDB()[key] || [];

    return {
      histCount:   histAfter.length,     // must be 1, not 2
      priceObsCount: dbAfter.length,     // must be 1, not 2
      histEntry:   histAfter[0]?.invoiceNo,
      priceObs:    dbAfter[0]?.invoiceNo,
    };
  });

  console.log('T1 result:', JSON.stringify(result));
  expect(result.histCount,    'History should have exactly 1 entry, not 2').toBe(1);
  expect(result.priceObsCount,'Price obs should have exactly 1 entry, not 2').toBe(1);
});

// ─────────────────────────────────────────────────────────────────
// TEST 2 — Price history accuracy (Gongura Leaves baseline → increase → decrease)
// ─────────────────────────────────────────────────────────────────
test('T2: price history — baseline, increase, decrease all tracked correctly', async () => {
  const result = await page.evaluate(() => {
    const VENDOR = { vendor: 'Test Vendor Price', invoiceNo: 'INV-PRICE-', date: '' };
    // Use a unique catalogId guaranteed to have no prior history across any vendor.
    // Using gongura-leaves risks cross-vendor bleed from T1's test data.
    const CAT_ID = '_test_price_history_' + Date.now();
    const vk = normalizeVendor(VENDOR.vendor);
    const dbKey = vk + '|' + CAT_ID;

    // Wipe any prior test data under this key
    const db = loadDB();
    delete db[dbKey];
    saveDB(db);
    const hist = pcLoadHist().filter(h => !h.invoiceNo.startsWith('INV-PRICE-'));
    lsSet(SK.PC_HIST, hist);

    function makeInv(no, cost) {
      const inv = { vendor: VENDOR.vendor, invoiceNo: 'INV-PRICE-' + no, date: '2026-0' + no + '-01' };
      const lines = [{
        catalogId: CAT_ID, catalogName: 'GONGURA LEAVES', cost,
        caseCost: cost * 10, unitsPerCase: 10, unitType: 'lb',
        invoiceText: 'gongura leaves', invoiceSize: '10 lb',
        _vendor: inv.vendor, _invoiceNo: inv.invoiceNo, _invoiceDate: inv.date
      }];
      pcSaveToHist(inv, lines);
      return pcFindPriorCost(CAT_ID, VENDOR.vendor, inv.invoiceNo);
    }

    const baseline  = makeInv(1, 2.00);  // first time — no prior
    const increase  = makeInv(2, 2.60);  // +30% — should detect increase
    const decrease  = makeInv(3, 2.20);  // -15.4% — should detect decrease

    // Also verify the main price DB has all 3 observations
    const dbObs = (loadDB()[dbKey] || []).filter(e => e.invoiceNo.startsWith('INV-PRICE-'));

    return {
      baselineResult: baseline,                        // null = correct (no prior)
      increaseDetected: increase ? {
        cost: increase.cost, pct: ((2.60 - increase.cost) / increase.cost * 100).toFixed(1) + '%'
      } : null,
      decreaseDetected: decrease ? {
        cost: decrease.cost, pct: ((2.20 - decrease.cost) / decrease.cost * 100).toFixed(1) + '%'
      } : null,
      mainTrackerObsCount: dbObs.length,               // must be 3
      mainTrackerCosts: dbObs.map(o => o.unitCost),    // [2.00, 2.60, 2.20]
    };
  });

  console.log('T2 result:', JSON.stringify(result));
  expect(result.baselineResult,     'First upload should have no prior cost').toBeNull();
  expect(result.increaseDetected,   'Second upload should find prior cost').not.toBeNull();
  expect(result.increaseDetected?.cost, 'Increase baseline should be 2.00').toBe(2.00);
  expect(result.decreaseDetected?.cost, 'Decrease baseline should be 2.60').toBe(2.60);
  expect(result.mainTrackerObsCount,'Main tracker should have 3 observations').toBe(3);
  expect(result.mainTrackerCosts,   'Main tracker costs should be [2,2.6,2.2]').toEqual([2.00, 2.60, 2.20]);
});

// ─────────────────────────────────────────────────────────────────
// TEST 3 — Vendor normalization: "Detroit Produce" vs "Detroit Produce Inc."
// ─────────────────────────────────────────────────────────────────
test('T3: vendor normalization — variants of same vendor name', async () => {
  const result = await page.evaluate(() => {
    const variants = [
      'Detroit Produce',
      'Detroit Produce Inc.',
      'DETROIT PRODUCE LLC',
      'detroit produce',
      'Detroit  Produce', // double space
    ];
    return variants.map(v => ({
      original: v,
      normalized: normalizeVendor(v),
    }));
  });

  console.log('T3 result:', JSON.stringify(result, null, 2));

  // Check: do all variants produce the same key?
  const keys = result.map(r => r.normalized);
  const uniqueKeys = [...new Set(keys)];
  const allSame = uniqueKeys.length === 1;

  console.log('T3: unique vendor keys:', uniqueKeys);
  console.log('T3: all normalize to same key?', allSame);

  if (!allSame) {
    console.warn('⚠ T3: some variants still differ after fix:', uniqueKeys);
  }

  // After the normalizeVendor fix, all 5 variants must collapse to the same key.
  expect(uniqueKeys.length, 'All Detroit Produce variants must normalize to the same key').toBe(1);

  // Bonus: verify Inc/LLC variants of Gusto also collapse (legal suffix stripped, "group" stays)
  const gustoVariants = await page.evaluate(() => {
    return ['Gusto Group Inc.', 'GUSTO GROUP LLC', 'gusto group', 'Gusto Group, Inc']
      .map(v => ({ original: v, normalized: normalizeVendor(v) }));
  });
  console.log('T3 Gusto variants:', JSON.stringify(gustoVariants));
  const gustoKeys = [...new Set(gustoVariants.map(r => r.normalized))];
  expect(gustoKeys.length, 'Gusto Group variants must normalize to same key').toBe(1);
});

// ─────────────────────────────────────────────────────────────────
// TEST 4 — Unmatched recovery: bad spelling → assign → mapping saved
// ─────────────────────────────────────────────────────────────────
test('T4: unmatched recovery — assigning saves the mapping for next time', async () => {
  const result = await page.evaluate(() => {
    // Simulate an unmatched line (bad spelling of gongura)
    const MISSPELLED = 'gongoora leves';  // intentional typo

    // Inject a results session with one unmatched line
    PC_LAST_MATCHED = {
      lines: [{
        invoiceText:   MISSPELLED,
        invoiceSize:   '10 lb',
        caseCost:      25.00,
        unitsPerCase:  10,
        unitType:      'lb',
        cost:          2.50,
        catalogId:     null,         // unmatched
        catalogName:   null,
        confidence:    'none',
        score:         0,
        remember:      false,
        _vendor:       'Test Vendor',
        _invoiceNo:    'INV-UNMATCH-001',
        _invoiceDate:  '2026-06-01',
      }],
      when: new Date().toISOString(),
    };

    // Simulate user assigning via pcOverride(0, 'tr_gongura-leaves')
    pcOverride(0, 'tr_gongura-leaves');

    // After override, the line should have a catalogId
    const lineAfter = PC_LAST_MATCHED.lines[0];

    // Simulate remember toggle (user checks "remember this mapping")
    pcRememberToggle(0);
    pcSaveLast();

    // Check map was saved
    const map = pcLoadMap();
    const savedMapping = map[MISSPELLED];

    return {
      lineHasCatalogId: !!lineAfter.catalogId,
      catalogIdAssigned: lineAfter.catalogId,
      mappingSaved: savedMapping,           // should be 'tr_gongura-leaves'
      rememberFlag: PC_LAST_MATCHED.lines[0].remember,
    };
  });

  console.log('T4 result:', JSON.stringify(result));
  expect(result.lineHasCatalogId,  'Line should have catalogId after override').toBe(true);
  expect(result.catalogIdAssigned, 'CatalogId should be tr_gongura-leaves').toBe('tr_gongura-leaves');
  expect(result.mappingSaved,      'Mapping should be saved in pcMap').toBe('tr_gongura-leaves');
  expect(result.rememberFlag,      'Remember flag should be set').toBe(true);
});

// ─────────────────────────────────────────────────────────────────
// TEST 5 — Retail markup trust: results view price === PDF price
// ─────────────────────────────────────────────────────────────────
test('T5: markup trust — results retail price matches what export PDF would use', async () => {
  const result = await page.evaluate(() => {
    const testCases = [
      { cost: 2.50, markup: 50,   label: '50% on $2.50' },
      { cost: 3.17, markup: 40,   label: '40% on $3.17' },
      { cost: 1.80, markup: 60,   label: '60% on $1.80' },
    ];

    return testCases.map(tc => {
      // Simulate changing markup via the results-toolbar function
      pcMarkupChanged(String(tc.markup), 'results');

      // Both the results render and pcExportPDF use pcRetailFor()
      // which now reads from _PC_MARKUP. Test that the module var is set.
      const fromFunction = pcRetailFor(tc.cost);

      // Also verify the export-tab input is synced
      const exportInput  = document.getElementById('pc-pdf-markup');
      const exportValue  = exportInput ? parseFloat(exportInput.value) : null;
      const moduleMarkup = _PC_MARKUP;

      // Manual expected value
      const raw          = tc.cost * (1 + tc.markup / 100);
      const expected     = charmRoundUp(raw, [0.29, 0.49, 0.79, 0.99]);

      return {
        label:        tc.label,
        markup:       tc.markup,
        moduleMarkup,                    // must === tc.markup
        exportInput:  exportValue,       // must === tc.markup
        fromFunction,                    // must === expected
        expected,
        match:        fromFunction === expected,
        exportSynced: exportValue === tc.markup,
      };
    });
  });

  console.log('T5 result:', JSON.stringify(result, null, 2));
  for (const tc of result) {
    expect(tc.moduleMarkup,  `${tc.label}: module var must match`).toBe(tc.markup);
    expect(tc.exportSynced,  `${tc.label}: export tab input must sync`).toBe(true);
    expect(tc.match,         `${tc.label}: pcRetailFor must equal charm-rounded expected`).toBe(true);
  }
});
