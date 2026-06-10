// Produce Save Stability Tests
// Verifies that prices don't change when hitting Save multiple times,
// navigating to/from Export tab, or re-saving the same invoice.
// Run: npx playwright test tests/produce-save-stability.spec.js --reporter=list

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_FILE = path.join(__dirname, '.auth.json');
const EMAIL    = process.env.TEST_EMAIL    || 'zayyakhan2.2@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Imrankhan889@';

let browser, ctx, page;

test.setTimeout(180000);

// Synthetic invoice — no AI needed, units and costs fully controlled.
const SYNTH_INV = {
  vendor: 'TEST PRODUCE VENDOR',
  invoiceNo: 'STABILITY-TEST-001',
  date: '2026-06-08',
};
const SYNTH_LINES = [
  // Case 1X30LBS @ $35 ÷ 30 = $1.1666...
  {
    invoiceText: 'GAILAN MX', invoiceSize: '1X30LBS',
    caseCost: 35, unitsPerCase: 30, cost: 35/30, unitType: 'lb',
    catalogId: 'tr_gai-lan', catalogName: 'GAI LAN',
    score: 1, confidence: 'high', remember: false, fromMap: true,
    retailOverride: null, unitsOverride: null, soldByOverride: null,
    _vendor: 'TEST PRODUCE VENDOR', _invoiceNo: 'STABILITY-TEST-001', _invoiceDate: '2026-06-08',
    qty: 1, baseCaseCost: 35, shipPerCase: 0, ruleName: '',
  },
  // Case 1X40LBS @ $30 ÷ 40 = $0.75
  {
    invoiceText: 'THAI EGGPLANT', invoiceSize: '1X40LBS',
    caseCost: 30, unitsPerCase: 40, cost: 30/40, unitType: 'lb',
    catalogId: 'tr_thai-eggplant', catalogName: 'THAI EGGPLANT',
    score: 1, confidence: 'high', remember: false, fromMap: true,
    retailOverride: null, unitsOverride: null, soldByOverride: null,
    _vendor: 'TEST PRODUCE VENDOR', _invoiceNo: 'STABILITY-TEST-001', _invoiceDate: '2026-06-08',
    qty: 1, baseCaseCost: 30, shipPerCase: 0, ruleName: '',
  },
];
const EXPECTED = {
  'tr_gai-lan':      35/30,
  'tr_thai-eggplant': 30/40,
};

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const ctxOpts = { baseURL: 'https://www.trackaisle.com' };
  if (fs.existsSync(AUTH_FILE)) ctxOpts.storageState = AUTH_FILE;
  ctx  = await browser.newContext(ctxOpts);
  page = await ctx.newPage();
  await page.goto('/app');
  await page.waitForTimeout(3000); // let Supabase restore session before checking gate

  const needsLogin = await page.locator('#login-gate').isVisible().catch(() => false);
  if (needsLogin) {
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-btn');
    await page.waitForSelector('#page-title', { timeout: 30000 });
    await ctx.storageState({ path: AUTH_FILE });
  }
  await page.waitForSelector('[data-pg="produce"]', { state: 'visible', timeout: 15000 });
  await page.click('[data-pg="produce"]');
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  // Clean up test data — race against 8s so a hung cloud-sync never blocks afterAll
  await Promise.race([
    page.evaluate(({ inv, lines }) => {
      const db = loadDB();
      const vk = normalizeVendor(inv.vendor);
      for(const l of lines){
        const k = vk + '|' + l.catalogId;
        if(db[k]) db[k] = db[k].filter(e => e.invoiceNo !== inv.invoiceNo);
        if(db[k] && !db[k].length) delete db[k];
      }
      saveDB(db);
      const hist = pcLoadHist().filter(h => h.invoiceNo !== inv.invoiceNo);
      lsSet(SK.PC_HIST, hist);
    }, { inv: SYNTH_INV, lines: SYNTH_LINES }),
    new Promise(r => setTimeout(r, 8000)),
  ]).catch(() => {});
  await Promise.race([
    browser?.close() ?? Promise.resolve(),
    new Promise(r => setTimeout(r, 8000)),
  ]).catch(() => {});
});

// ── Helpers ──────────────────────────────────────────────────────

async function injectTestData() {
  await page.evaluate(({ inv, lines }) => {
    // Wipe any prior observations for this invoiceNo
    const db = loadDB();
    const vk = normalizeVendor(inv.vendor);
    lines.forEach(l => {
      const k = vk + '|' + l.catalogId;
      if(db[k]) db[k] = db[k].filter(e => e.invoiceNo !== inv.invoiceNo);
      if(db[k] && !db[k].length) delete db[k];
    });
    saveDB(db);
    const hist = pcLoadHist().filter(h => h.invoiceNo !== inv.invoiceNo);
    lsSet(SK.PC_HIST, hist);
    // Inject PC_LAST_MATCHED
    PC_LAST_MATCHED = { lines: lines.map(l => ({...l})), when: new Date().toISOString(), invoice: inv };
    pcSaveLast();
    pcRenderResults();
  }, { inv: SYNTH_INV, lines: SYNTH_LINES });
}

async function readSavedPrices() {
  return page.evaluate(({ inv, lines }) => {
    const db = loadDB();
    const vk = normalizeVendor(inv.vendor);
    const result = {};
    for(const l of lines){
      const k = vk + '|' + l.catalogId;
      const obs = (db[k] || []).find(e => e.invoiceNo === inv.invoiceNo);
      result[l.catalogId] = obs ? obs.unitCost : null;
    }
    return result;
  }, { inv: SYNTH_INV, lines: SYNTH_LINES });
}

async function hitSave() {
  await page.click('button[onclick="pcSaveAll()"]');
  await page.waitForTimeout(400);
}

// ── Tests ─────────────────────────────────────────────────────────

test('T1: first save — DB unitCost matches expected effCost exactly', async () => {
  await injectTestData();
  await hitSave();

  const saved = await readSavedPrices();
  console.log('T1 saved:', JSON.stringify(saved));

  for(const [catId, expected] of Object.entries(EXPECTED)){
    expect(saved[catId], `${catId} should be in price DB`).not.toBeNull();
    expect(Math.abs(saved[catId] - expected), `${catId} unitCost should match effCost`).toBeLessThan(0.0001);
  }
});

test('T2: Export tab round-trip — prices unchanged after Save', async () => {
  const before = await readSavedPrices();

  await page.click('[data-pct="export"]');
  await page.waitForTimeout(400);
  await page.click('[data-pct="match"]');
  await page.waitForTimeout(400);
  await hitSave();

  const after = await readSavedPrices();
  console.log('T2 before:', JSON.stringify(before), 'after:', JSON.stringify(after));

  for(const catId of Object.keys(EXPECTED)){
    expect(after[catId], `${catId} still in DB`).not.toBeNull();
    expect(Math.abs(after[catId] - before[catId]), `${catId} unchanged after Export round-trip`).toBeLessThan(0.0001);
  }
});

test('T3: Save 5x — prices stable, no duplicate observations', async () => {
  const first = await readSavedPrices();

  for(let i = 0; i < 4; i++){
    await hitSave();
  }

  const after = await readSavedPrices();
  console.log('T3 after 5 saves:', JSON.stringify(after));

  for(const catId of Object.keys(EXPECTED)){
    expect(Math.abs(after[catId] - first[catId]), `${catId} stable after 5 saves`).toBeLessThan(0.0001);
  }

  // No duplicates
  const counts = await page.evaluate(({ inv, lines }) => {
    const db = loadDB();
    const vk = normalizeVendor(inv.vendor);
    return Object.fromEntries(lines.map(l => {
      const k = vk + '|' + l.catalogId;
      return [l.catalogId, (db[k] || []).filter(e => e.invoiceNo === inv.invoiceNo).length];
    }));
  }, { inv: SYNTH_INV, lines: SYNTH_LINES });

  console.log('T3 obs counts:', JSON.stringify(counts));
  for(const [catId, count] of Object.entries(counts)){
    expect(count, `${catId} must have exactly 1 observation`).toBe(1);
  }
});

test('T4: Export/Save alternating 3 rounds — prices never drift', async () => {
  const baseline = await readSavedPrices();

  for(let i = 0; i < 3; i++){
    await page.click('[data-pct="export"]');
    await page.waitForTimeout(300);
    await page.click('[data-pct="match"]');
    await page.waitForTimeout(300);
    await hitSave();

    const round = await readSavedPrices();
    for(const catId of Object.keys(EXPECTED)){
      expect(Math.abs(round[catId] - baseline[catId]), `Round ${i+1}: ${catId} must not drift`).toBeLessThan(0.0001);
    }
  }
});
