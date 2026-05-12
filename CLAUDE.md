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
