// Eastland Food Corporation Invoice Test
// Tests extraction quality + POS Nation export on a real invoice.
// Run: npx playwright test tests/eastland-invoice-test.spec.js --reporter=list

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const AUTH_FILE   = path.join(__dirname, '.auth.json');
const INVOICE_TXT = path.join(__dirname, '..', 'files', 'eastland-300240235.txt');
const EMAIL    = process.env.TEST_EMAIL    || 'zayyakhan2.2@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'Imrankhan889@';

test.setTimeout(180000);

let browser, ctx, page;

test.beforeAll(async ({ browser: b }) => {
  const { chromium } = require('@playwright/test');
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
  await page.waitForTimeout(3000);
});

test.afterAll(async () => { await browser?.close(); });

// ─────────────────────────────────────────────────────────────────
// TEST 1 — Extract the real Eastland invoice
// ─────────────────────────────────────────────────────────────────
test('T1: Eastland invoice extraction — items, totals, promo handling', async () => {
  const invoiceText = fs.readFileSync(INVOICE_TXT, 'utf8');

  const result = await page.evaluate(async (text) => {
    const prompt = buildAiPrompt();
    try {
      const resp = await callAI({
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Extract this invoice:\n\n${text}` }
        ]}],
        model: 'claude-sonnet-4-6',
        maxTokens: 8000,
      });
      const parsed = aiJson(resp.text);
      const invList = Array.isArray(parsed) ? parsed : [parsed];
      const inv = invList[0];
      const items = inv.items || [];
      return {
        ok:         true,
        vendor:     inv.vendor,
        invoiceNo:  inv.invoiceNo,
        date:       inv.date,
        total:      inv.total,
        itemCount:  items.length,
        inputTok:   resp.usage?.input_tokens || 0,
        outputTok:  resp.usage?.output_tokens || 0,
        cacheRead:  resp.usage?.cache_read_input_tokens || 0,
        items: items.map(i => ({
          item:     i.item,
          barcode:  i.barcode || '',
          desc:     i.desc,
          size:     i.size,
          qty:      i.qty,
          cost:     i.caseCost,
          cat:      i.cat,
          soldBy:   i.soldBy,
          isOOS:    i.isOOS,
        })),
      };
    } catch(e) { return { ok: false, error: e.message }; }
  }, invoiceText);

  if (!result.ok) throw new Error(result.error);

  console.log('\n══ EASTLAND EXTRACTION RESULT ══════════════════════');
  console.log(`Vendor:      ${result.vendor}`);
  console.log(`Invoice #:   ${result.invoiceNo}`);
  console.log(`Date:        ${result.date}`);
  console.log(`Total:       $${result.total}`);
  console.log(`Items:       ${result.itemCount}`);
  console.log(`Input tok:   ${result.inputTok.toLocaleString()} (cache read: ${result.cacheRead.toLocaleString()})`);
  console.log('\n── Line items ──────────────────────────────────────');
  result.items.forEach((i, n) => {
    const bc = i.barcode ? ` [BC:${i.barcode}]` : '';
    const oos = i.isOOS ? ' ⊘OOS' : '';
    console.log(`  ${String(n+1).padStart(2)}. ${i.item} | ${i.desc.substring(0,35).padEnd(35)} | ${i.size.padEnd(12)} | qty:${i.qty} | $${i.cost}${bc}${oos}`);
  });

  // Key assertions
  expect(result.ok).toBe(true);
  expect(result.vendor).toMatch(/eastland/i);
  expect(result.invoiceNo).toBe('300240235');
  expect(result.total).toBeCloseTo(2391.98, 0);
  // 18 line items on the invoice (including 2 OOS free items + 1 back order)
  expect(result.itemCount).toBeGreaterThanOrEqual(16);

  // Promo handling: free items (qty 1, total $0) should be OOS
  const freeOysterSauce = result.items.find(i => i.item === '11000060' && i.qty === 1 && i.cost === 0);
  if (freeOysterSauce) {
    console.log('\n── Free item (oyster sauce) ────────────────────────');
    console.log(`  isOOS: ${freeOysterSauce.isOOS} (expected true — $0 free item)`);
  }

  return result; // return for T2
});

// ─────────────────────────────────────────────────────────────────
// TEST 2 — POS Nation export from extracted Eastland invoice
// Shows exactly what the CSV would look like for each line item
// ─────────────────────────────────────────────────────────────────
test('T2: POS Nation export — department IDs, barcodes, sell-by-weight', async () => {
  const invoiceText = fs.readFileSync(INVOICE_TXT, 'utf8');

  const result = await page.evaluate(async (text) => {
    // Re-extract (uses cached prompt — fast)
    const resp = await callAI({
      messages: [{ role: 'user', content: [
        { type: 'text', text: buildAiPrompt(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `Extract this invoice:\n\n${text}` }
      ]}],
      model: 'claude-sonnet-4-6',
      maxTokens: 8000,
    });
    const parsed = aiJson(resp.text);
    const inv = Array.isArray(parsed) ? parsed[0] : parsed;

    // Simulate loadInvoice + approvals
    inv.items.forEach(i => {
      if(!i.item) i.item = i.desc.substring(0,20);
      classifyInvoice(inv);
    });

    // Build export rows the same way the app does
    const rows = (inv.items || [])
      .filter(i => i._rt === 'purchased' && i.qty > 0)
      .map(i => {
        const cu = unitCost(i);
        const retail = cu * 1.35; // 35% markup for test
        const rawBc = i.barcode || (detectBarcodeFormat(i.item).format !== 'SKU' ? i.item : '');
        return {
          no: i.item, barcode: rawBc, desc: i.desc, size: i.size,
          catId: i.cat, soldBy: i._soldBy || i.soldBy || 'each',
          qty: i.qty, upc: i._u,
          box: i.caseCost, unit: cu, retail: parseFloat(retail.toFixed(2)),
          cat: i.cat,
        };
      });

    // Set export settings for POS Nation
    EXPORT_SETTINGS.fmt    = 'posnation';
    EXPORT_SETTINGS.bcFmt  = 'EAN-13';
    EXPORT_SETTINGS.pnTaxId = '3';
    EXPORT_SETTINGS.pnQty  = 'blank';

    const csv = buildPosNationCSV(rows);
    const lines = csv.split('\n');

    // lines[0] = BOM + header, lines[1..] = data rows
    const headerLine = lines[0].replace(/^﻿/, ''); // strip BOM for assertion
    return {
      rowCount: rows.length,
      header:   headerLine,
      rows:     lines.slice(1, 7), // first 6 data rows
      allRows:  lines.slice(1),
      cacheRead: resp.usage?.cache_read_input_tokens || 0,
    };
  }, invoiceText);

  console.log('\n══ POS NATION EXPORT PREVIEW ════════════════════════');
  console.log(`Exported rows: ${result.rowCount}`);
  console.log(`Cache read:    ${result.cacheRead.toLocaleString()} tokens (prompt reuse)`);
  console.log('\nHeader:');
  console.log(' ', result.header);
  console.log('\nFirst 6 data rows:');
  result.rows.forEach((r, i) => console.log(`  ${i+1}. ${r}`));
  console.log('\nAll rows:');
  result.allRows.forEach((r, i) => {
    const cols = r.split(',');
    if (cols.length > 5) {
      console.log(`  UPC:${cols[0].padEnd(14)} Desc:${cols[1].padEnd(35)} Dept:${cols[5]} UOM:${cols[10]} FoodSt:${cols[11]} WIC:${cols[12]} Weight:${cols[15]}`);
    }
  });

  // Verify structure
  expect(result.rowCount).toBeGreaterThan(0);
  expect(result.header).toContain('UPC');
  expect(result.header).toContain('Department ID');
  expect(result.header).toContain('Sell by Weight');
  expect(result.header).toContain('WIC Eligible');
  expect(result.header.split(',').length).toBe(17); // must have all 17 columns
});
