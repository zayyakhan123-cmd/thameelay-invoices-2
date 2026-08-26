# ASK AI — build spec (chat over your own invoice data)

**Status:** v1 BUILT, admin-gated, **NOT pushed**. Local verification passed (below).
Everything under "Phase 2+" is unbuilt and needs your call before anyone writes code.
**Who sees it:** only `MASTER_UIDS` (your account). Every other signed-in user sees no nav
item, and `goTo('ask')` bounces them to the dashboard.

## The idea
The app already knows what you paid, who you paid, when, and what you charge. Until now you
had to know *which page* answered your question. Ask AI removes that step: you type the
question the way you'd say it out loud, and the answer comes back with the vendor and date
attached.

## What is built (v1)

**Grounding — the decision that makes this trustworthy.** The model never receives your
dataset. It gets 10 tools and must request slices, so every number in an answer traces to a
saved invoice line. The system prompt forbids estimating a price from general knowledge; a
miss returns "not on file" instead of a plausible guess.

| Tool | Answers |
|---|---|
| `search_products` | "what does X cost me" |
| `product_cost_history` | "has X gone up?" — every purchase, oldest first |
| `compare_vendors` | "who is cheapest for X" — flags mismatched pack sizes |
| `suggest_price` | cost × your category markup, + last retail you approved |
| `pricing_rules` | your markup targets |
| `list_vendors` / `vendor_products` | vendor roster, what each supplies |
| `spend_summary` | spend by month and vendor |
| `list_invoices` / `get_invoice` | invoice lookup, full line detail |

**Where it lives** — all in `app/index.html`:
- `PC`-style section at the end of the script block: `askIndex`, `askScore`, `askFind`,
  `askTools`, `askRunTool`, `askSystemPrompt`, `askSend`, `askRender`, `askMd`.
- Page `<div class="pg" id="pg-ask">`, nav `<a data-pg="ask" data-admin-only>`,
  `goTo()` branch, `updatePageHeader` entry, `.ask-*` CSS.
- `callAI()` gained one optional `tools` param — passes straight through to Anthropic and
  through the `ai` Edge Function, which forwards the body verbatim. **No Edge Function or
  schema change was needed.** Existing callers are untouched.
- Data comes from `loadDB()` / `loadHist()` / `loadProdMeta()` / `loadCats()`. Produce
  cross-feeds into `loadDB()` already, so produce and dried goods both answer.

**Admin gate:** `askIsAdmin()` → `MASTER_UIDS.has(_USER.id)`; `askApplyAdminGate()` toggles
`body.is-admin`; CSS hides `[data-admin-only]`. Guards on the router and on `askSend()`.

**Verified locally** (headless Chrome, `callAI` stubbed — zero API spend):
- 10/10 tools return correct math; cost history caught 3.80 → 4.40/lb as +15.79%;
  `compare_vendors` ranked $4.10 under $4.40 with the pack-size caution attached.
- Full tool loop: tool_use → local execution → tool_result → final answer.
- Model output escaped before markdown — `<img src=x onerror=…>` renders as text.
- Gate: signed-out / other-user / admin / after-sign-out all correct; `askSend` refuses to
  call the API for a non-admin.
- No console or page errors.

## Known gaps in v1 (decide before push)
1. **The gate is cosmetic.** A non-admin can still call `askSend()` from the console. They'd
   only ever read *their own* tenant data (the tools read local storage), so it is not a data
   leak — but it spends AI budget. **Fix: the `ai` Edge Function should reject a body carrying
   `tools` unless the caller is in `EXEMPT_USER_IDS`.** ~5 lines. Do this before push.
2. **Chat resets on reload.** In-memory only.
3. **Chat is gated by the invoice quota.** Every message runs `check_ai_monthly_quota`, which
   counts invoices. Chat doesn't burn quota, but a user at their cap can't chat. Fine while
   admin-only (you're exempt); wrong the day it goes multi-tenant.
4. ~~"Wholesale" is undefined.~~ **RESOLVED 2026-08-25: wholesale = 20% markup**
   (`ASK_WHOLESALE_MARKUP_PCT`). `suggest_price` takes `price_type: 'retail'|'wholesale'`;
   an explicit `markup_pct` still wins over both.
5. **Vendor nicknames.** "Mr Hung" only matches if the invoice says Hung. A nickname map
   (`tm_vendor_aliases`) would fix it.

## Phase 2 — more tools (the highest-value additions)
Ranked. Each is a new `askRunTool` case + schema entry; no UI work.

1. **`margin_check`** — items whose last approved retail is now below your target markup at
   today's cost. This is the "where am I quietly losing money" question, and the data for it
   already exists (`product_meta.last_retail` + current `unitCost` + `catMarkup`).
2. **`pack_size_change`** — same product, same vendor, `units_per_case` changed between
   invoices. Shrinkflation detector: the case price held, the case got smaller. Nothing in
   the app surfaces this today.
3. **`price_increases(window)`** — biggest cost jumps in a window. `computeMoney()` already
   calculates this for the Money page — **wrap it, don't reimplement it.**
4. **`vendor_scorecard`** — per vendor: how often they raise prices, average size of a raise,
   how many items they're cheapest on, shipping rules from `pcRuleFor()`.
5. **`reorder_due`** — `product_meta` already carries `reorder_point` / `target_stock`.
6. **`duplicate_billing`** — same invoice number twice, or one item billed twice on an invoice.
7. **`produce_unmatched`** — invoice lines that never matched a catalog item, so the chat can
   feed the Produce Matcher instead of just reporting a gap.

## Phase 3 — make answers actionable
8. **Expandable tool chips.** Tap "Comparing vendors" to see the actual rows behind the
   number. Trust comes from being able to check the work.
9. **Deep links.** Model emits `[[invoice:A-1042]]` / `[[product:SUGAR APPLE|Hung Phat]]`;
   the renderer turns them into buttons that jump to Invoice History or the Price Tracker
   drill-down. Chat becomes a way to navigate the app, not a dead end.
10. **Proposed writes, never silent ones.** "Set produce markup to 45%", "mark this
    discontinued", "approve $5.99 retail" → the answer renders an **Apply** button that calls
    the existing function (`saveCats`, `saveProdMeta`, `setProdLastRetail`). The model never
    writes directly, and nothing touches the 9 synced tables without a tap.
11. **"Draft my order."** Reorder points + cheapest vendor per item → a copyable list per
    vendor. This is the first thing here that saves an hour rather than a minute.

## Phase 4 — reach
12. **Voice input.** Ask while walking the aisle with your hands full.
13. **Weekly digest.** Run three canned questions on a schedule; deliver the answers.
14. **Photo question.** Snap a shelf tag → "is this price still right?" Vision is already
    wired for invoice extraction.

## Cost per chat (measured shapes, Sonnet 4.6 pricing: $3/M in, $15/M out)
Each question = 2–5 API calls (question → tool rounds → answer). Fixed prefix (system
prompt + 10 tool schemas) ≈ 2.2K tokens, resent on every call — which is why it's now
sent as a cache-controlled block: cache reads bill at 10% of the input rate with a 5-min
TTL, and chat rounds land well inside that window.

| Shape | Uncached | With caching |
|---|---|---|
| Simple (2 calls, small tool result) | ~1.0¢ | ~0.5¢ |
| Typical (3 calls, mid-size results) | ~2.5¢ | ~1.2¢ |
| Heavy (5 rounds, big invoice dumps) | ~6–8¢ | ~3–4¢ |
| 10-question session (history grows each turn) | ~30–50¢ | ~15–25¢ |

Practical read: **a penny or two per question; a serious session costs less than a coffee.**
The tools-not-dump design is what keeps it there — pasting the whole catalog into the prompt
would 10× the input tokens per call.

## Hard rules
- Never dump the catalog into the prompt. Tools only — cost and hallucination both scale with
  what you paste in.
- Never state a number that didn't come from a tool result.
- No writes to the 9 cloud-synced tables without an explicit tap.
- Chat needs its own budget before it is exposed beyond the admin account. Each question is
  2–5 API calls.

## Open questions for the owner
- What markup *is* wholesale for you? (A number turns gap #4 into a real answer.)
- Is `557e2ae3…` (zayyakhan2.2) the account this should unlock on? It's what `MASTER_UIDS`
  holds today.
- Which of Phase 2 do you want first? My pick: `margin_check`, then `pack_size_change`.
