# TrackAisle Internal App Audit

## Date: 2026-06-01

## Executive Summary

- **Total issues found: 28**
- **Critical (blocks or severely damages core flow): 4**
- **High-impact (meaningful friction, user confusion, missing feedback): 10**
- **Medium (polish, inconsistency, minor friction): 9**
- **Low (nice-to-have, cosmetic): 5**

Evidence basis: full Playwright walkthrough of every page in the app, signed in as the test account (`zayyakhan2.2@gmail.com`), with screenshots at every flow step. No code was changed during this review.

---

## Critical Issues

### C1 — Vendor modal traps all navigation until explicitly dismissed
**Flow:** Vendor Insights → click any vendor card  
**Observed:** Clicking a vendor card opens a full-screen overlay modal. While the modal is open, the modal's `#vnd-modal` div intercepts **all pointer events**, including every click on the sidebar navigation. Attempting to navigate away while the modal is open silently fails — no feedback, no close, just timeout. The only escape is to click the semi-transparent backdrop area, which is not labeled or indicated anywhere.  
**Expected:** Modal should close on Escape key, on any navigation click, or with a clearly labeled ×close button. At minimum, sidebar navigation should work even with a modal open.  
**Effort:** Low (add `keydown` Escape handler + close on any sidebar nav click).

---

### C2 — Page header title stuck on "Dashboard" for three pages
**Flow:** Navigate to Produce Matcher, then click Pricing Rules or Margin Calculator from sidebar  
**Observed:** The `#page-title` element in the top header reads "Dashboard" when the user is on the Produce Matcher, Produce Matcher Catalog, and Produce Matcher History sub-tabs. Confirmed via `document.getElementById('page-title').textContent`. Pricing Rules and Margin Calculator correctly update the title. Produce Matcher does not.  
**Expected:** Header title should always match the active page so users know where they are.  
**Effort:** Low (call `goTo` or set `#page-title` in the Produce Matcher navigation handler).

---

### C3 — Invoice History loads invoice into dashboard but gives no visible transition
**Flow:** Invoice History → click any invoice row  
**Observed:** Clicking an invoice row calls `reloadInv(vendor, invoiceNo, date)`, which silently reloads the invoice into memory and navigates to the Dashboard page. There is no animation, no toast, no indication that anything happened. The user sees no feedback during the switch. If the invoice data takes a moment to reload, the screen appears frozen.  
**Expected:** After clicking an invoice in history, show a brief "Loading…" state on the row, navigate to Dashboard, and display a toast or banner confirming which invoice is now loaded.  
**Effort:** Medium (add a loading state to the clicked row, ensure `loadInvoice` shows a confirmation).

---

### C4 — "Safe to Approve" card shows "—" and "Upload an invoice" hint with no action
**Flow:** Dashboard with no active invoice loaded  
**Observed:** The second summary card shows count "—", label "Safe to Approve", and subtext "Upload an invoice". This subtext reads like a CTA but clicking the card does nothing — `cursor: auto`, no `onclick`. The card looks interactive but is entirely inert. A new user reasonably expects clicking "Upload an invoice" to navigate them to the upload page.  
**Expected:** Either make the card clickable (navigate to Upload Invoices), or replace the subtext with static copy that doesn't suggest an action ("Load an invoice to see approvals").  
**Effort:** Low (add `onclick="goTo('upload')"` to the card element, or change the copy).

---

## High-Impact Issues

### H1 — Bell notification icon does nothing
**Flow:** Any page → click the bell icon in the top-right header  
**Observed:** Clicking the bell icon produces no response — no dropdown, no navigation, no toast. The bell shows a badge counter (currently "0") which implies it will show a list of notifications when clicked. Nothing happens.  
**Expected:** Clicking the bell should navigate to the Alerts page, or open a notification dropdown.  
**Effort:** Low (add `onclick="goTo('alerts')"` to `#bell-cnt`).

---

### H2 — "?" help button does nothing
**Flow:** Any page → click the "?" button in the top-right header  
**Observed:** Clicking the "?" button produces no response — no documentation panel, no tooltip, no external link. It looks interactive (it is a styled button) but is completely inert.  
**Expected:** Should either open a help/documentation page or at minimum a tooltip explaining it is coming soon.  
**Effort:** Low (link to docs or show a placeholder modal).

---

### H3 — "Updated · 5d ago" freshness indicator is stale and misleading
**Flow:** Any page → look at header top-right "Updated · 5d ago"  
**Observed:** The `#data-fresh` element reads "Updated · 5d ago" even though the most recently saved invoice in localStorage was saved 5 days ago and cloud sync is working. The indicator does not update when the app loads fresh data from Supabase. It appears to be set once at app start and never refreshed.  
**Expected:** Should reflect the actual time the data was last pulled from the cloud, and update after each successful cloud pull. If data is stale by more than 24 hours, show an amber warning.  
**Effort:** Low (read the most recent `savedAt` timestamp from localStorage after `cloudPullAll` completes and format it).

---

### H4 — Vendor deduplication failure: same vendor appears under multiple names
**Flow:** Dashboard → Vendor Dashboard section or Vendor Insights page  
**Observed:** The following clearly-same vendors appear as separate rows:
- "Gusto", "GUSTO GROUP INC", "FOOD GUSTO INC" — three separate vendor entries, all Gusto
- "U.S. Trading Company" and "U.S. TRADING COMPANY" — same vendor, different case
- One vendor appears as a bare "?" with no name (7 invoices, $56k spend — a significant account with a missing name)
- "MI10125 - Thameelay Market supplier (document issuer)" — the store itself is being identified as its own vendor

**Expected:** Vendor normalization should collapse obvious duplicates (case-insensitive match at minimum). The "?" vendor should surface a prompt to identify/merge it.  
**Effort:** Medium (add case-insensitive vendor name normalization on ingest; add a "merge vendors" UI for manual cleanup).

---

### H5 — Price Tracker "Status" column action is a single unlabeled icon with no tooltip
**Flow:** Price Tracker → look at the last column of each row  
**Observed:** Each row has a single circular icon button. `title="Mark discontinued"` is set, but the icon itself (via inspection) is not labeled visually — no text, just the icon. The tooltip only appears on desktop hover. There is no other action available per row: no "edit retail price", no "view history chart", no "flag for review". The entire tracker is effectively read-only aside from the discontinue button.  
**Expected:** Row actions should include at minimum: view price history chart, edit notes, mark discontinued. All actions should have clear labels, not just a hover tooltip.  
**Effort:** Medium (add a row action menu or inline action row).

---

### H6 — Price Tracker "Notes" column shows "—" dashes with no indication they're editable
**Flow:** Price Tracker → look at the Notes column  
**Observed:** The Notes column shows "—" for all rows. Clicking on a note cell opens an inline `<input>` — but there is zero visual indication that the field is editable. The "—" looks like a static empty-state placeholder, not a click-to-edit target. No pencil icon, no hover state, no placeholder text visible until you click.  
**Expected:** Show a pencil icon on row hover, or use a subtle input-style border on the cell to indicate editability. Placeholder text like "Add note…" inside the input after focus.  
**Effort:** Low (add hover style + pencil icon to note cells).

---

### H7 — Alerts page empty state shows message with no action CTA
**Flow:** Sidebar → Alerts  
**Observed:** The Alerts page shows a single centered line: "No alerts — load an invoice to detect issues". The entire page below the header is blank. No button, no link to Upload Invoices, no explanation of what types of alerts will appear.  
**Expected:** Empty state should include a brief explanation of what alerts look like ("margin below threshold, retail below cost, missing category") and a primary CTA button: "Upload an invoice".  
**Effort:** Low (replace empty div with a styled empty-state component with CTA).

---

### H8 — Invoice History "— #" and "—" vendor names show corrupted data with no warning
**Flow:** Invoice History → scroll list  
**Observed:** Several entries show vendor name "— #" (with invoice number like "#MI10125") indicating the AI extraction failed to identify the vendor. These entries sit in the list silently alongside valid invoices, with no visual distinction, no warning badge, and no prompt to fix the vendor name.  
**Expected:** Invoices with unresolved vendor names should be visually flagged (amber badge: "Vendor unknown") with a quick-edit action to set the correct vendor name.  
**Effort:** Medium (add conditional flag in history render + inline vendor name edit).

---

### H9 — Upload page has no "last upload" confirmation anywhere after extraction completes
**Flow:** Upload Invoices → (after extraction) → navigated to Dashboard  
**Observed:** After successful extraction the app navigates silently to the Dashboard. There is no persistent indicator of "last uploaded invoice: X" beyond a brief success toast that auto-dismisses. The `hbadge` element (top header badge) shows the invoice number/vendor but only when a specific invoice is loaded — it's the same font-size as body text and easy to miss.  
**Expected:** After upload, the header badge should visually pulse or highlight briefly. The dashboard section header "Price Approvals" should show the loaded invoice vendor + number as context.  
**Effort:** Low (add a brief highlight animation to `#hbadge` after load).

---

### H10 — Produce Matcher History tab always shows badge "0" even with past matches
**Flow:** Produce Matcher → History tab  
**Observed:** The History tab badge shows "0" in the Produce Matcher tab bar, even though the Catalog tab shows 298 items suggesting prior usage. The History tab contains no items.  
**Expected:** If there's no history, show an empty state explaining "Match an invoice to see saved history here." If there IS history from prior sessions, the badge should reflect the count.  
**Effort:** Low (verify `pcSaveToHist` writes to the correct localStorage key; fix the badge render).

---

## Medium Issues

### M1 — Dashboard summary cards are not clickable (missed deep-link opportunity)
The six summary cards (Items Found, Safe to Approve, Price Changes Needed, etc.) all have `cursor: auto` — they are inert. Clicking "792 Items Found → Across 58 invoices" does nothing. These should deep-link to the relevant section (e.g. Price Tracker for Items Found, filtered approval table for Safe to Approve).  
**Effort:** Low.

### M2 — "View all vendors" and "View full report" links on dashboard look like plain text
The dashboard section headers have inline "View all vendors →" and "View full report →" links. They use the same font size and weight as body text. At a glance they read as section labels, not navigation links. Need stronger visual differentiation (cyan color, underline on hover, or a button style).  
**Effort:** Low.

### M3 — Pricing Rules page has a "HOLDHOLD · custom" category visible
The Pricing Rules page shows a category named "HOLDHOLD · custom". This appears to be an internal staging/default category that was never cleaned up. End users will see this and wonder what it means.  
**Effort:** Low (rename or hide).

### M4 — Settings pages lose the "Account Settings" active state in the sidebar
When navigating between settings sub-tabs (Profile → Business Info → Billing etc.), the sidebar shows "Account Settings" as active but the top header breadcrumb reads "Dashboard" on all sub-tabs after the initial Profile tab load. Confirmed: `#page-title` returns "Dashboard" on Notifications tab, Danger Zone tab.  
**Effort:** Low.

### M5 — Business Info form: no Save button visible without scrolling
The Business Info settings tab has three sections (Company, Address, Tax) and the Save button is below the Tax section. On a standard 768px viewport, the Save button is off-screen on arrival. Users may fill in fields and not know there's a button to submit.  
**Effort:** Low (add a sticky footer with Save button or a second Save button near the top of the form).

### M6 — Two-factor authentication shows "Coming soon" badge without explanation
Security settings shows "Two-Factor Authentication → Not enabled → Coming soon". There is no timeline, no "get notified when it launches" link, and no explanation of what 2FA will provide. It takes up prime real estate in the Security tab.  
**Effort:** Low (add a one-liner explanation and a "notify me" CTA or collapse the section).

### M7 — Price Tracker vendor names show internal normalized keys, not display names
The "Last Vendor" column in Price Tracker shows internal normalized keys like "ustradingcompany" and "gustogroupinc" (all lowercase, no spaces), not the display vendor names like "U.S. Trading Company" or "GUSTO GROUP INC" that appear elsewhere. This is inconsistent with Vendor Insights which shows proper vendor names.  
**Effort:** Low (denormalize vendor display name on tracker render).

### M8 — Vendor Insights: long vendor names overflow the card badly
The vendor named "Three Lady Cooks / Sam Por Krua / Aroy D / M150 / HBB / Lactasoy / Fa Thai / Maggi / Lay's / PR / Ten Jung / Nom Tang / Ellse / Lotus / Jele / Yofer / Zab Mike / Gusto / Best Choice's / Imaex / Golden Elephant / BM" wraps across two full lines of the card header, pushing all the metric columns out of alignment. This is an AI extraction failure (multiple vendors collapsed into one) but the display should truncate with an expand toggle.  
**Effort:** Low (CSS `text-overflow: ellipsis` + expand on click).

### M9 — "Updated · 5d ago" shows in Settings pages where it is meaningless
The freshness indicator ("Updated · 5d ago") appears in the header on Account Settings, Security, Billing, etc. — pages where "data freshness" is not relevant. It adds noise and may confuse users into thinking their settings data is stale.  
**Effort:** Low (hide `#h-data` on settings pages).

---

## Low Issues

### L1 — Upload page "4 · Export" step tab is never activated during the flow
The upload wizard shows four step tabs: 1 · Upload, 2 · Verify, 3 · Approve, 4 · Export. Steps 2, 3, and 4 appear greyed out. Step 4 (Export) is never reached through normal flow — there is no in-flow export trigger. The tab exists but is effectively unreachable via the wizard UI.  
**Effort:** Medium to fix properly; Low to remove the non-functional tab.

### L2 — Produce Matcher header description uses jargon
The page subtitle reads: "Match invoice items to your photo catalog · 50% markup → rounded to $.49 / $.99 · Export PDF price tag catalog". This is dense and assumes prior knowledge of the feature. A new user won't understand what "photo catalog" or "$.49 / $.99 rounding" means without context.  
**Effort:** Low (rewrite to plain language).

### L3 — Margin Calculator shows placeholder values on load with no "enter to calculate" prompt
The Margin Calculator loads with placeholder values (33.00, 12, 2) and a partially-filled results panel, giving the impression the calculator has already been used. The "Results" panel says "Enter case cost and units per case to begin." but the input fields already have numbers in them.  
**Effort:** Low (clear placeholder values on load so the state is unambiguously empty).

### L4 — Price Tracker filter pills have no "X" to deselect active filter
Clicking "Up ▲" or any category pill activates it. Clicking it again to deselect works, but there's no visual X or clear indicator that it's an active toggle. Users may think filters are stuck.  
**Effort:** Low (add X icon to active pill state).

### L5 — Invoice History delete button has no confirmation step
Clicking "Delete" on an invoice in history triggers immediate deletion (confirmed by `deleteHistory(0)` call without any `confirm()` dialog). Accidental deletions cannot be undone.  
**Effort:** Low (add a confirm dialog or an undo toast).

---

## Recommended Fix Order

### Tier 1 — Fix first (Critical + high user-impact)

1. **C1** — Vendor modal navigation trap. Breaks the entire app while a modal is open; highest severity.
2. **C4** — "Upload an invoice" hint on dashboard card that does nothing. First thing a new user sees.
3. **H1** — Bell notification icon does nothing. Looks broken to every user on every page.
4. **H2** — "?" help button does nothing. Same.
5. **C2** — Page header title stuck on "Dashboard" for Produce Matcher. Basic orientation cue.
6. **H3** — Stale "Updated · 5d ago" indicator. Erodes trust in data accuracy.

### Tier 2 — High-impact polish (ship in one sprint)

7. **H4** — Vendor deduplication (U.S. Trading Company / Gusto variants / "?" vendor). Data quality affects every downstream view.
8. **H7** — Alerts empty state has no CTA. Dead-end page for new users.
9. **C3** — Invoice History click gives no visible feedback.
10. **H6** — Price Tracker notes column looks static, not editable.
11. **H8** — Corrupted vendor names ("— #") shown with no flag.
12. **L5** — Delete invoice with no confirmation.

### Tier 3 — Medium polish (next sprint)

13. **M1** — Summary cards not clickable (deep links).
14. **M7** — Internal vendor key names in Price Tracker.
15. **M8** — Long vendor name overflow in Vendor Insights.
16. **M3** — HOLDHOLD category visible in Pricing Rules.
17. **M5** — Business Info save button hidden below fold.
18. **H5** — Price Tracker read-only with minimal row actions.
19. **H9** — No post-upload confirmation in dashboard.

### Tier 4 — Nice to have

20. **H10** — Produce Matcher History badge.
21. **M2**, **M4**, **M6**, **M9**, **L1–L4** — remaining polish.

---

## Flow-by-Flow Summary

| Flow | Works? | Key issue |
|---|---|---|
| Invoice Upload | ✅ Functional | Silent redirect after extraction; no post-load context in header |
| Dashboard (loaded) | ✅ Functional | Cards not clickable; stale timestamp |
| Dashboard (empty) | ⚠️ Confusing | "Upload an invoice" hint is inert; no CTA path |
| Price Tracker | ✅ Functional | Read-only; internal vendor keys; note fields appear static |
| Vendor Insights | 🔴 Broken | Modal traps navigation; duplicate vendors; overflow names |
| Alerts | ⚠️ Empty | No empty-state CTA; bell icon doesn't link here |
| Account Settings | ✅ Functional | Header title bug on some sub-tabs; 2FA "coming soon" noise |
| Billing | ✅ Functional | Clear usage bar; View Plans CTA present |
| Produce Matcher | ⚠️ Header bug | Page title stays "Dashboard"; History badge always 0 |
| Invoice History | ✅ Functional | No delete confirmation; corrupted vendor names shown without flag |
| Pricing Rules | ✅ Functional | HOLDHOLD category visible |
| Margin Calculator | ✅ Functional | Placeholder values create ambiguous empty state |
