# Debugging Protocol

When something doesn't work, follow this protocol. **Do not skip steps.** Most 20-minute debugging black holes happen because someone jumped to "let me try changing X" before verifying what's actually broken.

The rule: **evidence first, code changes last.**

---

## The 6-Step Protocol

### Step 1 — Reproduce it deterministically (5 min max)

Before touching ANY code:

- Write down the exact reproduction steps (literally: click here, type this, click that)
- Try in an incognito window (rules out cache/session issues)
- Confirm it fails **every** time, not just sometimes
- If it's flaky, that's a different bug — log it separately and stop debugging the consistent path

If you can't reproduce reliably, stop and gather more info from the user. Don't guess.

### Step 2 — Gather evidence from the browser (5 min max)

Open DevTools **before** reproducing. Watch all three tabs:

**Console tab:**
- Any errors? Warnings? Unhandled promise rejections?
- Any 401s, 403s, CORS errors?

**Network tab:**
- Did the request **actually fire**? (If no → UI/handler bug, skip to Step 5)
- Status code: 200, 4xx, 5xx?
- Response body: what did the server actually return?
- Request headers: is the auth token present?
- Request payload: are the fields you expect actually being sent?

**Application tab → Local Storage / Cookies:**
- Is the user actually signed in? Is the session expired?

**Write down what you observed.** Don't fix anything yet.

### Step 3 — Verify the data layer

If the request fired and returned 200 but data is still wrong, **don't trust the UI**. Check the database directly:

```sql
-- In Supabase SQL editor
SELECT * FROM user_profiles WHERE id = '<user-uuid>';
```

Did the row actually update? If no, the most likely causes (in order):

1. **RLS policy silently blocked the UPDATE** (most common Supabase bug)
2. Wrong column name in the client code
3. `upsert` vs `update` mismatch
4. A trigger threw an error that the client swallowed
5. Optimistic UI is lying — local state changed, but the network call failed

### Step 4 — Check RLS (Supabase's silent killer)

90% of "I saved it but it didn't persist" bugs in Supabase are RLS. Check policies:

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_profiles';
```

Common RLS bugs:
- UPDATE policy has `USING` but is missing `WITH CHECK` (or vice versa)
- Policy uses `auth.uid() = id` but the user's `id` column is named differently
- Policy is `USING (true)` for SELECT but blocks UPDATE
- Service role bypasses RLS — make sure you're testing as the actual user, not the service role

To test RLS as a specific user:

```sql
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "<user-uuid>"}';
UPDATE user_profiles SET display_name = 'test' WHERE id = '<user-uuid>';
-- If this fails silently, RLS is blocking
```

### Step 5 — Isolate the layer

If still stuck, test each layer **in isolation**:

| Layer | How to test | What it tells you |
|-------|-------------|-------------------|
| DB | Run UPDATE in Supabase SQL editor | If it works → RLS or client-side bug |
| Backend/Edge fn | Invoke via CLI with a real JWT | If it works → client-side bug |
| Client API call | `curl` the endpoint manually | If it works → form/state bug |
| React state | Add `console.log` in handler | Shows if form data is captured |
| UI render | Inspect DOM after save | Shows what the user actually sees |

Walking down this list narrows the bug to one layer in under 10 minutes.

### Step 6 — Make ONE change, then re-test

When you do start changing code:

- **One change at a time.** Multiple changes = no idea which one fixed it (or broke something else).
- Re-run Step 1's reproduction after each change.
- Verify in the database, not just the UI.
- Commit the fix with a message describing what was actually wrong, not what you tried.

---

## Hard Rules

1. **15-minute timer per hypothesis.** If your guess isn't right in 15 minutes, the guess is wrong. Reset, gather more evidence.
2. **No code changes until Step 3.** Read and observe before changing.
3. **Verify, don't trust.** If the UI says "Saved ✓", check the database. Optimistic UI lies all the time.
4. **One change at a time.** Always.
5. **Stop and escalate at 30 minutes.** Write down what you know vs. what you assumed, share it, ask for help.

---

## Multi-Table Data Contamination Cleanups

When a sync bug writes one user's data into another user's account, the damage
is almost always **multi-table**. The `CLOUD_PUSHERS` system writes to 9 tables
in a single `cloudFlush()` call. If you only clean one table, the user still
sees contaminated data from the others.

### All 9 CLOUD_PUSHERS tables to check

| Table | Key column |
|-------|------------|
| `invoices` | `tenant_id` |
| `price_observations` | `tenant_id` |
| `categories` | `tenant_id` |
| `products` | `tenant_id` |
| `product_links` | `tenant_id` |
| `produce_catalog` | `tenant_id` |
| `produce_map` | `tenant_id` |
| `vendor_rules` | `tenant_id` |
| `product_meta` | `tenant_id` |

### Full-cleanup verification query

Run this after any cleanup to confirm all 9 tables are zero for the affected user:

```sql
SELECT 'invoices'          AS table_name, count(*) FROM invoices           WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'products',                         count(*) FROM products           WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'price_observations',               count(*) FROM price_observations WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'categories',                       count(*) FROM categories          WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'product_links',                    count(*) FROM product_links       WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'produce_catalog',                  count(*) FROM produce_catalog     WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'produce_map',                      count(*) FROM produce_map         WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'vendor_rules',                     count(*) FROM vendor_rules        WHERE tenant_id = '<uuid>'
UNION ALL
SELECT 'product_meta',                     count(*) FROM product_meta        WHERE tenant_id = '<uuid>';
```

### Contamination audit — check all tenants

To spot any other affected users, run per-table tenant counts:

```sql
SELECT tenant_id, count(*) AS cnt
FROM price_observations   -- repeat for each table
GROUP BY tenant_id
ORDER BY count(*) DESC;
```

A contaminated user typically shows the same row count as the legitimate user
(the data was copied verbatim). A count of ~0 with non-zero in other tables is
also a signal (as in the May 2026 incident where invoices were cleaned first
but 8 other tables were missed).

### Postmortem: May 2026 localStorage-bleed incident

- **Root cause:** `cloudPullAll()` detected "cloud empty + localStorage has
  data" and pushed all 9 tables to the new user's account. localStorage
  contained the previous user's data because sign-out didn't clear it.
- **Incomplete first cleanup:** Only `invoices` was deleted. The user still
  saw 792 price-tracker items sourced from 1,000 `price_observations` rows.
- **Lesson:** Always run the 9-table verification query after any data cleanup.
  Never assume a single table was the only one affected by a sync bug.
- **Fix applied:** `AUTO_MIGRATE_LEGACY_LOCAL = false`, sign-out clears all
  localStorage, user-ID stamp guard in `cloudPullAll()`.

---

## Quick-Reference Bug Catalogue

### "I saved a setting but it didn't persist"
1. Network tab — did the call fire? Status code?
2. SQL — `SELECT * FROM user_profiles WHERE id = '<uuid>'` — did the row change?
3. RLS — check UPDATE policy on that table
4. Look for optimistic UI lying about success
5. Check for missing `await` on the save call

### "It works locally but fails in production"
1. Check env vars in production (most common cause)
2. `supabase functions logs <name> --tail` for edge function errors
3. Compare auth state in incognito vs. logged-in tab

### "Edge function returns 500"
1. `supabase functions logs <name> --tail` — read the actual error
2. Is the service role key in the function's env vars?
3. Test the function with `supabase functions invoke <name>` before testing in UI

### "Smoke test passes but feature is broken"
The smoke test isn't testing the user-visible outcome. Update it to assert on **final state** (database row, displayed value) — not just that the page rendered.

### "Form fields don't update state"
1. Are the inputs controlled? (have `value` AND `onChange`)
2. Is `onChange` actually wired to setState?
3. Is the form reset happening on render? (state living in wrong scope)

### "Auth seems random / users randomly logged out"
1. Check session refresh logic — is it being awaited?
2. Check if multiple Supabase clients exist (singleton, please)
3. Check token expiry in Application tab

---

## Playwright as a Debugging Tool

When stuck, use Playwright to capture **everything** during reproduction:

```typescript
// debug-repro.spec.ts
test('reproduce profile save bug', async ({ page }) => {
  page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
  page.on('request', req => {
    if (req.url().includes('supabase')) {
      console.log('[REQ]', req.method(), req.url(), req.postData());
    }
  });
  page.on('response', async res => {
    if (res.url().includes('supabase')) {
      console.log('[RES]', res.status(), res.url(), await res.text().catch(() => ''));
    }
  });

  await page.goto('/settings');
  await page.fill('[name="display_name"]', 'Debug Test ' + Date.now());
  await page.click('button:has-text("Save")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'after-save.png', fullPage: true });
});
```

Run with `HEADED=1` to watch in real time. This single test usually reveals the bug in one run — you see exactly what request fires, what the response is, and what the page does after.

---

## When Asking Claude Code for Help

Bad prompt: *"profile save isn't working, figure it out"*

Good prompt:

> Profile save isn't persisting `display_name`. Evidence gathered:
> - Network tab shows POST to `/rest/v1/user_profiles` returns 200
> - Response body is `[]` (empty array, no row returned)
> - SQL query confirms the row's `display_name` did NOT change
> - RLS policies on `user_profiles`: SELECT and INSERT exist, UPDATE is missing
>
> Hypothesis: missing UPDATE RLS policy. Please add one and test.

The second prompt gets fixed in 2 minutes. The first one runs for 20 minutes guessing.

**Always lead with evidence, not symptoms.**

---

## How to Use This Document

- Keep this file at the repo root as `DEBUGGING.md`
- Reference it from `CLAUDE.md` so Claude Code reads it on every session:
  ```
  When debugging any issue, follow the protocol in DEBUGGING.md.
  Do not skip steps. Always gather evidence before making code changes.
  ```
- Update the "Quick-Reference Bug Catalogue" every time you hit a new bug category — your future self will thank you
