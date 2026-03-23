# Insight Taxonomy (Feature 10)

This taxonomy defines the coach-style insight families, required message shape, and quality controls.

## Required Shape

Every insight must include:
- `observation`: What changed (fact from metrics).
- `significance` (`why_this_matters`): Why the change matters now.
- `action` (`do_this_now`): Specific next step the user can take immediately.

Additional metadata:
- `kind`: Insight family.
- `confidence`: 0-1 confidence score.
- `template_key`: Stable localization/template id.
- `template_vars`: Numeric/string payload used to render locale-ready copy.
- `digest`: Short version for weekly digest view.
- `period_label`: Time context used by dashboard.

## Insight Families

1. Spending Trend (`spending_trend`)
- Compares category spend current vs prior complete month.
- Triggers for meaningful up/down movement.
- Template keys:
  - `spending_trend_up`
  - `spending_trend_down`

2. Goal Trajectory (`goal_trajectory`)
- Compares recent average monthly spend vs configured monthly budget.
- Classifies status as on track or off track.
- Template keys:
  - `goal_trajectory_on_track`
  - `goal_trajectory_off_track`

3. Cashflow Risk (`cashflow_risk`)
- Uses recent monthly net trend to project expected shortfall.
- Triggers only when projected monthly net is negative beyond a risk floor.
- Template key:
  - `cashflow_risk_shortfall`

4. Positive Reinforcement (`positive_reinforcement`)
- Detects consistency milestones (for example profitable-month streaks).
- Reinforces healthy behavior with a concrete next action.
- Template key:
  - `positive_reinforcement_streak`

## Quality Controls

- Confidence gating:
  - Insights below configured `confidence_threshold` are suppressed.

- Conflict handling:
  - Keep strongest item per family.
  - Suppress positive reinforcement when negative risk/off-track guidance is active in the same period.

- Data quality handling:
  - Prefer complete months for period-over-period calculations.
  - Suppress insights when insufficient data exists.

- Localization readiness:
  - Keep template ids stable.
  - Keep raw values in `template_vars` for locale-aware rendering.
  - Rendered text is generated from templates and can be translated without metric logic changes.
