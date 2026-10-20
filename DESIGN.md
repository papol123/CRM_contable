---
name: Apex Ledger Corporate
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0054d8'
  primary: '#004bc3'
  on-primary: '#ffffff'
  primary-container: '#1d63ed'
  on-primary-container: '#eeefff'
  inverse-primary: '#b3c5ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#006242'
  on-tertiary: '#ffffff'
  tertiary-container: '#007d55'
  on-tertiary-container: '#bdffdb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#00184a'
  on-primary-fixed-variant: '#003fa5'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  table-header:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  mono-metric:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered for B2B financial and supply-chain operations within the automotive parts distribution industry. The aesthetic balances corporate rigor with modern SaaS efficiency, inspired by the high-density utility of Tailwind CSS and the restrained elegance of Shadcn UI.

### Personality & Emotional Response
- **Integrity & Precision:** The interface conveys institutional reliability, numerical accuracy, and audit-grade safety.
- **Operational Speed:** Information architecture optimizes task velocity for controllers, inventory managers, and procurement officers navigating complex ledgers.
- **Calm Clarity:** Subtle visual layering minimizes cognitive strain over prolonged 8-hour desktop operational shifts.

### Design Movement
**Corporate Modernism with Tonal Layering.** The system pairs dark navigation scaffolding (Slate/Navy) with high-legibility crisp work surfaces (pure white cards nested within clean cool-gray canvases). Visual priority relies strictly on disciplined typographic scale, subtle borders (`#e2e8f0`), and vibrant cobalt-blue functional focal points rather than decorative embellishments.

## Colors

The palette establishes an unmistakable hierarchy optimized for data visualization, transaction auditing, and state signaling.

### Core Roles
- **Primary (`#1d63ed`):** Drives all key conversion actions, active navigation indicators, interactive selections, and key metric badges. Hover variant resolves to `#1550c0`; focus rings use `#1d63ed` at 20% alpha with a 2px offset.
- **Secondary / Deep Navy Shell (`#0f172a` & `#162032`):** Reserved for contextual navigation, global toolbars, and high-impact structural framing. Surface items inside the dark panel layer utilize `#162032` with subtle borders (`#1e293b`).
- **Surface & Backgrounds:**
  - Base Application Canvas: `#f8fafc` (with `#f1f5f9` for table head strips and sunken canvas areas).
  - Cards, Containers & Drawers: `#ffffff`.
  - Divider & Border Tokens: `#e2e8f0` (inputs, table rules, card strokes).

### Typography Color Hierarchy
- **Primary Text:** `#0f172a` (Slate 900) for headers, values, balances, and active labels.
- **Secondary / Supporting Text:** `#64748b` (Slate 500) for metadata, table headers, breadcrumbs, and SKU captions.
- **Disabled Text:** `#94a3b8` (Slate 400).

### Semantic & Financial Status Signals
Each semantic status is defined as a dual token pair (solid indicator / light tinted background):
- **Active / Settled / Paid:** Emerald `#10b981` (text/fill) on `#ecfdf5` (tint background).
- **Pending / In Transit / Warning:** Amber `#f59e0b` (text/fill) on `#fffbeb` (tint background).
- **Inactive / Draft / Neutral:** Slate `#64748b` (text/fill) on `#f1f5f9` (tint background).
- **Error / Void / Overdue / Critical:** Crimson `#ef4444` (text/fill) on `#fef2f2` (tint background).

## Typography

The type system runs uniformly on **Inter** to maintain uncompromised technical clarity, tabular alignment, and vertical economy across heavy data tables, accounting reconciliation charts, and SKU inventories.

### Implementation Guidelines
- **Tabular Figures:** Always apply `font-variant-numeric: tabular-nums` (or Tailwind `tabular-nums`) to all financial sums, currency tallies, stock quantities, and invoice identifiers to ensure vertical decimal alignment.
- **Table Headers:** Render `table-header` in uppercase tracking with `text-[#64748b]` to delineate data metadata from runtime cell records.
- **Hierarchy Rules:** Page headers rely on `headline-lg` (`28px`), panel subtitles on `headline-sm` (`18px`), and ledger contents on `body-md` (`14px`) and `body-sm` (`13px`) for dense transactional efficiency.

## Layout & Spacing

The architecture deploys an administrative layout composed of a persistent dark left sidebar navigation and an adaptive fluid content canvas.

### Layout Geometry
- **Sidebar Shell:** Fixed 260px width on desktop (collapsible to 72px icon-only rail). Background: `#0f172a`.
- **Top Utility Header:** Fixed 60px height. Background `#ffffff` with a bottom border `#e2e8f0`. Hosts global search, warehouse selector, and user profiles.
- **Workspace Canvas:** Fluid container with max-width constrained to `1600px` for optimal tabular reading, centered with padding `margin: 1.5rem` (24px).
- **Grid Structure:** 12-column layout utilizing a standard `gutter: 1.5rem` (24px). Component forms leverage strict 4px/8px micro-increments:
  - Micro-gaps (badge icons, chip spacing): `space-xs` (4px).
  - Compact form fields and button paddings: `space-sm` (8px).
  - Component cell padding and card gutters: `space-md` (16px).
  - Section separating gaps and card padding: `space-lg` (24px).
  - Large container blocks and metric groupings: `space-xl` (32px).

### Responsive Adaptation
- **Desktop (>= 1280px):** Full 260px dark sidebar, expanded 12-column ledger sheets, dual-pane reconciliation drawers.
- **Tablet (768px - 1279px):** Collapsed 72px icon sidebar; content cards wrap into 6-column configurations; tables gain horizontal sticky-column scrolling.
- **Mobile (< 768px):** Off-canvas slide-out navigation sheet; single-column stacked forms; tabular data defaults to condensed list cards showing SKU, status badge, and total amount.

## Elevation & Depth

In alignment with modern corporate design, the system relies on high-definition structural boundaries (`#e2e8f0`) rather than deep drop shadows. Depth is achieved via tonal contrast and restrained ambient diffusions.

### Elevation Hierarchy
1. **Canvas Tier (0dp):** Color `#f8fafc`. The non-interactive background surface supporting all content.
2. **Surface Tier / Cards (1dp):** Pure white `#ffffff` encased in a crisp 1px solid `#e2e8f0` border, paired with an ambient shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
3. **Dropdowns & Popovers (2dp):** Floating white surfaces with border `#e2e8f0` and ambient elevation: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
4. **Modals & Flyout Drawers (3dp):** Elevated above a 40% alpha backdrop blur overlay (`rgba(15, 23, 42, 0.45)` backdrop-filter: `blur(4px)`). Shadow: `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.05)`.

## Shapes

The system enforces a clean, compact geometry:
- **Base Rounding (`rounded-md` / 6px):** Inputs, select boxes, dropdown menu items, inline badges, and table action buttons.
- **Container Rounding (`rounded-lg` / 8px):** Standard application cards, accounting widgets, KPI summary pods, and dialog surfaces.
- **Parent Surface Rounding (`rounded-xl` / 12px):** Global modal panels, drawer headers, and analytical master-detail containers.
- **Fully Rounded (`rounded-full` / 9999px):** Exclusively designated for circular user avatars and pill-shaped semantic status indicators.

## Components

### Buttons
- **Primary:** Background `#1d63ed`, text `#ffffff`, border transparent, hover `#1550c0`, active `#0f3ea9`. Padding `0.5rem 1rem`, font weight 500, radius 8px (`rounded-lg`).
- **Secondary / Outline:** Background `#ffffff`, text `#0f172a`, border 1px solid `#e2e8f0`, hover `#f1f5f9`.
- **Destructive:** Background `#ef4444`, text `#ffffff`, hover `#dc2626`.
- **Ghost:** Background transparent, text `#64748b`, hover `#f1f5f9`, hover text `#0f172a`.

### Status Badges & Chips
Constructed with inline-flex alignment, height 22px, padding `2px 8px`, font size 12px, font weight 500, radius `9999px` (pill):
- **Active:** Background `#ecfdf5`, text `#065f46`, border 1px solid `#a7f3d0`. Includes a 6px circular dot `#10b981`.
- **Pending:** Background `#fffbeb`, text `#92400e`, border 1px solid `#fde68a`. Includes a 6px circular dot `#f59e0b`.
- **Inactive:** Background `#f1f5f9`, text `#475569`, border 1px solid `#e2e8f0`. Includes a 6px circular dot `#94a3b8`.
- **Error / Blocked:** Background `#fef2f2`, text `#991b1b`, border 1px solid `#fecaca`. Includes a 6px circular dot `#ef4444`.

### Tables (Financial & Ledger Specific)
- **Header:** Background `#f8fafc`, text `#64748b`, uppercase 12px, tracking wide, height 40px, bottom border 1px solid `#e2e8f0`.
- **Rows:** Alternating hover state `#f8fafc`. Cell padding `12px 16px`, height 52px. Border bottom 1px solid `#e2e8f0`.
- **Data Alignment:** Left-align alphanumeric text and item descriptions; right-align currency amounts, quantities, and numeric totals using tabular figures.

### Input Fields & Controls
- **Inputs & Selects:** Height 38px, background `#ffffff`, border 1px solid `#e2e8f0`, padding `0 12px`, text `#0f172a`, placeholder `#94a3b8`, radius 6px. Focus state: border `#1d63ed`, box-shadow `0 0 0 3px rgba(29, 99, 237, 0.15)`.
- **Checkboxes & Radios:** 16x16px, border 1px solid `#cbd5e1`, checked background `#1d63ed`, checked border `#1d63ed`, text checkmark `#ffffff`. Radius 4px for checkboxes, full circle for radios.

### Cards & Metric Containers
- Constructed in `#ffffff` with 1px solid `#e2e8f0` border, `rounded-lg` (8px). Padding is standardized to 20px or 24px (`space-lg`). Metric title sits at `13px` `#64748b`, value at `24px` bold `#0f172a`, contextual percentage difference tag docked top-right.

### Modals & Sliding Drawers
- **Drawers:** Fly out from right screen edge (standard width 540px for single invoice audit, 720px for part cross-reference). Header contains title, close icon, bottom border `#e2e8f0`.
- **Modals:** Centered on desktop, width max 560px, radius 12px (`rounded-xl`), background `#ffffff`, padding 24px, accompanied by `#f8fafc` footer toolbar separated by 1px solid border `#e2e8f0`.