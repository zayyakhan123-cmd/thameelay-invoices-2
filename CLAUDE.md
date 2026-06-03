# CLAUDE.md

Notes for future Claude sessions working in this repo.

## Historical data is frozen unless explicitly recomputed via the vendor-modal button

When the sold-by inference rules change (e.g. new units recognized, new
description-based overrides, regex fixes), **already-saved invoices keep
their old `_soldBy`, `_u`, and unit-cost values.** Re-running `classifyInvoice`
on every load would silently change prior numbers and confuse anyone reading
the price tracker.

The `_rt`-guards in the history-render path (`!i._rt`) and the cloud-pull
path are intentionally narrow — they only re-classify items that were never
classified, not items missing newer fields like `_soldBy`. Do not widen
those guards to chase missing fields.

The single supported way to upgrade saved data is the **⟳ Recompute sold-by**
button in the Vendor Insights modal header. It calls `vendorRecomputeSoldBy`
([index.html](index.html)), which re-runs `classifyInvoice` for every
invoice from that one vendor, writes back to localStorage + Supabase, and
re-renders the modal. Per-vendor scope is deliberate: it lets the user
audit a single vendor's pricing without touching the rest.

If you ever feel the urge to add a site-wide "recompute everything" pass,
talk to the user first — it has user-visible side effects on the price
tracker that need to be opted into.

## Retail memory: ↺ overrides per-invoice, no full-forget yet

Each row in `product_meta` may carry `last_retail` and `last_retail_at` —
populated when the user clicks ✓ Approve in the dashboard approval table
(`setAp` calls `setProdLastRetail`). The next time the same product shows
up, `resolveSuggestedRetail` prefills the input with that stored value and
labels it `↻ from last decision`.

The ↺ button on the row only adds the product's `prodMetaKey` to the
session-only `_RETAIL_OVERRIDE` Set — it does **not** delete the
`product_meta` row. After reload (or sign-out/back-in) the memory wins
again. That's intentional: ↺ is for "ignore my last call on THIS invoice."

A real "forget this product's retail entirely" affordance is intentionally
out of scope for this batch. When we add it, the natural home is the
vendor drill-down page (alongside the existing discontinued/note edits) —
clearing `last_retail` / `last_retail_at` on the row and pushing through
`saveProdMeta`.

The 'ai' branch in `resolveSuggestedRetail` is currently unreachable —
the AI prompt extracts cost/size/soldBy only, so the fallthrough is
always `'calculated'`. The branch is wired so that if/when the AI prompt
is extended to emit a retail suggestion, only `resolveSuggestedRetail`
needs to learn about it; the rendering and read chain are already in
place.
When debugging any issue, follow the protocol in DEBUGGING.md.
Do not skip steps. Gather evidence before making code changes.

## Working conventions

These rules apply to every code change in this repo, regardless of size.

### Small-batch discipline
One commit at a time. Each commit must be independently revertable. If you find yourself touching multiple unrelated concerns in one diff, split it. The May 12 invoice-manager.html revert was a casualty of bundled commits — three changes got panic-reverted together because one of them looked risky.

Never bundle:
- Structural changes (new files, deletions, route changes) with cleanup (renames, comment edits)
- New features with refactors
- Bug fixes with formatting changes

### Scope is mandatory
Every code-change prompt names IN SCOPE, OUT OF SCOPE, and HARD RULES. At minimum OUT OF SCOPE always includes:
- Cloud sync functions: `cloudFlush`, `cloudSignOut`, `cloudSignIn`, `cloudSignUp`, `cloudUpdateAuthUI`, `cloudPromptSignIn`
- May 26 isolation guards: `AUTO_MIGRATE_LEGACY_LOCAL`, `tm_data_owner`, `SK.*` localStorage keys
- The 9 cloud-synced tables and their RLS policies: invoices, products, price_observations, categories, product_links, produce_catalog, produce_map, vendor_rules, product_meta
- Stripe constants: `STRIPE_PRICES`, webhook URL, edge function names
- Supabase constants: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, project ref

If the change actually needs to touch one of these, surface it before writing code.

### Read before writing
When adding new code that mirrors an existing pattern (Supabase init, login form, table rendering, etc.), read the source-of-truth file first. Match the CDN version, constant names, and init style exactly. Don't invent a parallel pattern. If you can't find the pattern, stop and ask.

### Self-verify after deploy
`git push` exiting 0 is not success. Verify against the live URL:
- Status check: `curl -sI <url> | head -1`
- Content check: `curl -s <url> | grep -o '<expected-text>'`
- Flow check: Playwright or browser tool — click through and assert outcomes
- Wait ~60s after push for Vercel to deploy before checking

Report PASS/FAIL with the evidence (curl output, screenshot, or test result). Do not declare success without it. If you lack the tooling to verify, say so explicitly — don't paper over it.

### Auto-iterate on test failures
After making changes:
1. Run `npm test`
2. If failures, analyze, fix, re-run
3. Up to 3 iterations
4. If still red, stop and report what's failing, what you tried, what you suspect

Never push with failing tests. A red test you didn't write is still your problem — investigate before pushing. The `#login-forgot` selector miss (broken since its commit was shipped, caught two commits later) is the failure mode this rule prevents.

### Smoke test format
Every commit shipping visible behavior includes a numbered SMOKE TEST AFTER PUSH section with explicit pass criteria per step. "Looks good" is not a pass criterion. "Tab title reads 'Forgot password — Track Aisle'" is.

### When in doubt, stop
If you've spent 15 minutes guessing at intent or scope, stop guessing and ask. Same 15-minute timer as DEBUGGING.md.
