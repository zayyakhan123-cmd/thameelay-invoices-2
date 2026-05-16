# Design Tokens — Contract

This document is the **visual contract** for the Thameelay Invoices redesign. Every Phase A–G production commit must use these tokens. Source of truth: `design/visual-ref/inbox.html` and `design/visual-ref/workbench.html`. If any value here diverges from the source HTML, the source HTML wins — update this file.

## Palette

### Backgrounds (dark slate, never pure black)
- `--bg: #08090f` — page background
- `--bg-elev: #11141d` — sidebar, top bar, elevated chrome
- `--surface: #161a24` — cards, inputs, table body
- `--surface-hover: #1c2030` — hover state on surface
- `--surface-2: #1c2030` — second-level surface (workbench only)

### Borders
- `--border: rgba(255,255,255,0.07)` — default 1px border
- `--border-strong: rgba(255,255,255,0.14)` — buttons, avatars, emphasized

### Text
- `--text: #e7e9f0` — primary
- `--text-muted: #8a90a0` — secondary, table cells
- `--text-soft: #5e6474` — placeholders, disabled, fine print

### Brand accent (single accent, do not introduce a second)
- `--accent: #22d3ee` (cyan-400)
- `--accent-hover: #67e8f9`
- `--accent-soft: rgba(34,211,238,0.12)` — active nav background, focus rings
- `--accent-border: rgba(34,211,238,0.36)` — hover borders, accent dividers

### Semantic colors (saturated, not neon)
- `--green: #10b981` + soft `rgba(16,185,129,0.12)` + border `rgba(16,185,129,0.30)` — cost-down, safe, approved
- `--red: #f43f5e` + soft `rgba(244,63,94,0.12)` + border `rgba(244,63,94,0.28)` — cost-up, alert, unmatched
- `--amber: #f59e0b` + soft `rgba(245,158,11,0.12)` + border `rgba(245,158,11,0.28)` — review, warning
- `--blue: #60a5fa` + soft `rgba(96,165,250,0.12)` + border `rgba(96,165,250,0.28)` — **`status-processing` ONLY**. Never use as a CTA, button, or brand accent.
- `--gray-soft: rgba(148,163,184,0.08)` + border `rgba(148,163,184,0.20)` — neutral exported/done pills

## Typography

- Body, headers: **Inter** (Google Fonts, weights 400/500/600/700)
- Display caps, mono UI labels: **JetBrains Mono** (Google Fonts, weights 400/500)
- Tabular numbers in data columns: JetBrains Mono with `font-variant-numeric: tabular-nums`
- Base size: `14px`, line-height `1.5`
- Font smoothing: `-webkit-font-smoothing: antialiased`

### Letter-spacing rules
- Body and headers: `-0.015em` to `-0.005em` (tight)
- Mono display caps (section labels, buttons, pills, tabs): `0.06em` to `0.12em`
- HARD MAX `0.14em` on display caps. Body text never uses positive letter-spacing.

## Background grid overlay
```
background-image:
  linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
  linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
background-size: 32px 32px;
background-position: -1px -1px;
```
Applied to body only. Do not stack on inner surfaces.

## Glow / shadow rules

- Primary CTA button only: `box-shadow: 0 0 0 1px rgba(34,211,238,0.40), 0 8px 24px -6px rgba(34,211,238,0.55)`
- Status pill dots: small radial glow matching the pill color, max 8px blur
- AI banner inset glow: `inset 0 0 24px rgba(34,211,238,0.04)` — barely perceptible
- NEVER on body text, table content, headers, or paragraph text
- NEVER stack multiple backdrop-blur layers

## Status pills

Mono uppercase, 10.5px, letter-spacing 0.08em, padding `3px 10px 3px 8px`, border-radius 999px, 1px border, dot 6px circle on the left.

- `status-processing` — blue, pulse animation (1.6s ease-in-out infinite) on dot
- `status-review` — amber
- `status-approved` — green
- `status-exported` — muted gray

## Hard nos (carry over from the design brief)

- NO scanlines
- NO pure-black backgrounds (`#000`, `#02050a`)
- NO magenta, pink, or any second brand accent
- NO mono font for body text or long-form paragraphs
- NO glow on body text, table content, or headers
- NO letter-spacing above `0.14em`
- NO stacked backdrop-blur layers
- NO marketing copy in the UI ("70% faster" etc.)
- NO clip-path geometric shapes as page-level decoration (brand mark only)

## Mockup-only choices to ignore in production

1. **Inbox sidebar items.** The mockup shows Vendors, Reports, Catalog. Per the MVP cut, Products/Vendors/Reports are deferred to v2. Production Inbox sidebar in Phase A: Inbox, All invoices, Pricing rules, Settings, Help.
2. **"Connect supplier" primary button** on Inbox top-right. New scope (vendor integration / EDI). Out of v1. Drop or downgrade to secondary.
3. **`min-width: 1280px`** on workbench body. Desktop-first is fine, but factor into any responsive decisions.
