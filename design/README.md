# Design References

This folder holds design references for the Thameelay Invoices redesign. **Nothing here is production code.** Files in this folder are never linked from `index.html` and are not loaded by the app.

## chatgpt-flow-ref.png

ChatGPT-generated mockup of the proposed Inbox + Workbench flow. Used as a **flow/IA reference only**, not a visual reference.

### Structural decisions captured here (these we want)
- Inbox-first navigation (users see a list of invoices with status, pick one to open)
- Side-by-side workbench: original PDF on the left, extracted items table on the right
- Primary CTA: "Approve N Safe Items" button using the existing `_conf >= 0.7` safe-item gate
- Smart filter chips above the table (All / Needs Review / Cost Up / Cost Down / New Items / Low Margin)
- Bottom summary cards (Safe to Approve, Price Changes, Needs Review, Margin Loss Avoided, Projected Profit Gain)
- Export as a button with format dropdown, not a separate page
- Per-row action dropdown (Approve / Keep Price / Review)

### Things in this mockup to IGNORE (do not copy these)
- **Dark navy sidebar.** Visual direction is being determined separately. Phase 1 (commit `275b6bb`) was reverted because navy carried over. Do not re-import navy from this mockup.
- **"Upload & Extract (Background)"** in the bottom-left card. Foreground processing only for v1. Background processing is a real Supabase queue/polling change and is not in scope.
- **"Confidence" column label.** Renaming to "Match Quality" — `_conf` is a local parse/match score, not AI-supplied confidence (see project invariant #1).
- **"70% Faster than multi-step flows"** marketing claim card. Not a product feature, not in scope.
- **Sidebar items: Products, Vendors, Reports.** Deferred to v2 (see MVP cut below). Do not build these pages in Phase A–G.

### MVP cut (confirmed)
Phase A–G ships the Inbox → Workbench → Export core only. Products, Vendors, and Reports are deferred to v2.

### Still open before Phase A code begins
- Clean Claude Design visual pass (light/neutral, single accent, Linear/Notion/Stripe references). Not started.

When Phase A planning begins, this file is the structural reference. Visual direction will come from a separate file in this folder.

## visual-ref/

Claude Design output of the Inbox and Workbench screens in the locked visual direction. Use these as the literal visual reference — every Phase A–G production commit's styling should match these files.

- `visual-ref/inbox.html`
- `visual-ref/workbench.html`

## TOKENS.md

Design token contract extracted from `visual-ref/`. Source of truth for colors, typography, spacing, and shadow rules. If a production commit diverges from this doc, either the commit is wrong or the doc needs updating — do not let production silently drift.
