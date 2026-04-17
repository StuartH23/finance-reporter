# Spending Donut Chart Spec

## Objective
Show category share of total spending with fast scanability, low label clutter, and clear drill-down for small categories.

## Data Rules
- Input: `spending_chart[]` with `category`, `total`, `transactions`.
- When a dashboard year is selected, request and render category data scoped to that year.
- Exclude non-positive totals from donut slices.
- Sort slices descending by `total`.
- Roll up tiny slices into `Other` when `slice_share < 2.5%`.
- Keep full drill-down list of rolled-up categories under `Other includes`.

## Visual Structure
- Donut in a fixed-height responsive shell.
- Outer labels only for large slices (`>= 8%`) and only when chart width allows it.
- Center copy inside donut hole:
  - `Total Spend` (kicker)
  - formatted total spend
  - top category + share
- Full category legend under chart with:
  - color swatch
  - category name
  - dollar amount
  - share percent

## Color System
- Deterministic category color mapping based on category name hash.
- Reserved, consistent neutral color for `Other`.
- Same category should render with the same color across pages/sessions.

## Interaction
- Hover/focus on slice highlights matching legend row.
- Hover/focus on legend row highlights matching slice.
- Non-active slices/rows dim while active target stays prominent.
- `Other` activation visually emphasizes the `Other includes` section.

## Accessibility
- Chart container has a descriptive `aria-label` containing total and top category share.
- Legend rows are keyboard-focusable buttons with readable `aria-label`.
- Focus-visible states are explicit and high-contrast.
- Chart remains understandable without color via names, values, and percentages in legend.

## Responsiveness
- Preserve donut readability on side-rail widths.
- On small screens, legend compacts to two-line rows (name/percent first, value second).
- Avoid overlapping labels by hiding low-priority outer labels at smaller widths.
