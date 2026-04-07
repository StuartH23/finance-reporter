# Feature 5 Tuning Guide: Personalized Next-Best-Action Feed

## Where Scoring Lives
- Backend engine: `backend/sdk/next_actions.py`
- API wiring: `backend/routers/actions.py`

## Default Ranking Weights
In `backend/sdk/next_actions.py`, update `DEFAULT_METRIC_WEIGHTS`:

- `impact`: `0.38`
- `urgency`: `0.28`
- `confidence`: `0.22`
- `effort`: `0.12` (applies to low effort via `1 - effort_score`)

Tip: keep weights roughly summing to `1.0` for predictable behavior.

## Personalization Knobs
In `backend/sdk/next_actions.py`:

- `PERSONALIZATION_STEP` (`0.08`): learning rate for feedback updates.
- `type_bias` adjustment per feedback:
  - completed: `+0.03`
  - dismissed: `-0.04`
  - snoozed: `-0.015`

## Cooldown and Diversity
In `backend/sdk/next_actions.py`:

- `DEFAULT_DISMISS_COOLDOWN_DAYS` (`3`)
- `DEFAULT_SNOOZE_DAYS` (`2`)
- `DIVERSITY_WINDOW_DAYS` (`7`)
- diversity penalty multiplier in `rank_action_candidates`: `0.08` per recent action of same type.

## Daily Feed Size
- `MAX_DAILY_ACTIONS` (`3`) controls max cards/day.
- Endpoint always enforces top-ranked capped list via `pick_daily_actions`.
