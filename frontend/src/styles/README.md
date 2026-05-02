# Frontend CSS Architecture

Styles use layered global CSS because the app is built around shared semantic classes and primitives.
The import order is declared in `styles/index.css` and should remain deterministic.

Layers:
- `tokens`: design variables only.
- `reset` and `base`: browser reset and element defaults.
- `layout`: app shell, navigation, workspace, and shell breakpoints.
- `primitives`: reusable cards, buttons, tables, forms, metrics, and utilities.
- `components`: feature/component groups with prefixed class names.
- `pages`: route-level composition styles.
- `utilities`: low-specificity helper classes for spacing/alignment.

Rules:
- Do not add component-local `<style>` blocks for static UI CSS.
- Put repeated colors and surfaces in `tokens.css`.
- Keep short generic class names only for true primitives.
- Prefix feature styles (`dashboard-*`, `cashflow-*`, `sub-*`, `upload-*`, `chat-*`).
- Inline styles are allowed only for runtime chart dimensions, SVG/Recharts props, or data-derived colors.
- Chart palettes may keep hard-coded colors because they encode data categories, not app chrome.
