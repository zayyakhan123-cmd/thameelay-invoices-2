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
