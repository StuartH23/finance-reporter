"""Recurring transaction detection and subscription alerting."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import timedelta

import pandas as pd

from .categories import TRANSFER_CATEGORIES

CADENCE_DAYS = {
    "weekly": 7,
    "monthly": 30,
    "annual": 365,
}

CADENCE_TOLERANCE_DAYS = {
    "weekly": 2,
    "monthly": 5,
    "annual": 21,
}

MIN_CONFIDENCE = 0.55

_NOISE_TOKENS = {
    "ACH",
    "AUTOPAY",
    "PAYMENT",
    "PURCHASE",
    "CARD",
    "CHECKCARD",
    "POS",
    "DEBIT",
    "CREDIT",
    "WITHDRAWAL",
    "ONLINE",
    "TRANSFER",
    "RECURRING",
    "DBT",
    "PYMT",
    "WWW",
    "COM",
}


@dataclass
class RecurringStream:
    stream_id: str
    merchant: str
    cadence: str
    confidence: float
    expected_amount: float
    current_amount: float
    baseline_amount: float
    amount_trend: str
    active: bool
    next_expected_charge_date: str | None
    last_charge_date: str
    charge_count: int
    amount_series: list[float]
    date_series: list[str]
    price_increase: bool
    is_new_recurring: bool
    missed_expected_charge: bool


def normalize_merchant(description: str) -> str:
    text = str(description).upper()
    text = re.sub(r"https?://", " ", text)
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    text = re.sub(r"\b\d+\b", " ", text)
    tokens = [t for t in text.split() if len(t) > 1 and t not in _NOISE_TOKENS]
    if not tokens:
        return "UNKNOWN MERCHANT"
    return " ".join(tokens[:4])


def _confidence(
    count: int,
    cadence_days: int,
    tolerance_days: int,
    date_series: pd.Series,
    amount_series: pd.Series,
) -> tuple[float, float]:
    if count < 2:
        return 0.0, 0.0

    diffs = date_series.diff().dropna().dt.days.astype(float)
    if diffs.empty:
        return 0.0, 0.0

    matches = 0
    for gap in diffs:
        multiplier = max(1, min(4, round(gap / cadence_days)))
        expected = cadence_days * multiplier
        if abs(gap - expected) <= tolerance_days * multiplier:
            matches += 1
    cadence_fit = matches / len(diffs)

    abs_amount = amount_series.abs()
    mean_amount = float(abs_amount.mean()) if not abs_amount.empty else 0.0
    if mean_amount <= 0:
        amount_stability = 0.0
    else:
        cv = float(abs_amount.std(ddof=0)) / mean_amount
        amount_stability = max(0.0, min(1.0, 1.0 - cv))

    count_score = min(1.0, count / 6)
    score = (0.5 * cadence_fit) + (0.3 * count_score) + (0.2 * amount_stability)
    return round(score, 3), cadence_fit


def _pick_cadence(group: pd.DataFrame) -> tuple[str | None, float]:
    best_name: str | None = None
    best_score = 0.0
    for cadence_name, cadence_days in CADENCE_DAYS.items():
        score, _ = _confidence(
            count=len(group),
            cadence_days=cadence_days,
            tolerance_days=CADENCE_TOLERANCE_DAYS[cadence_name],
            date_series=group["date"],
            amount_series=group["amount"],
        )
        if score > best_score:
            best_name = cadence_name
            best_score = score
    if best_score < MIN_CONFIDENCE:
        return None, best_score
    return best_name, best_score


def _stream_id(merchant: str, cadence: str) -> str:
    digest = hashlib.sha1(f"{merchant}:{cadence}".encode(), usedforsecurity=False).hexdigest()
    return digest[:16]


def _amount_trend(amounts: pd.Series, threshold: float) -> tuple[str, float, float, bool]:
    abs_amounts = amounts.abs()
    current = float(abs_amounts.iloc[-1])
    if len(abs_amounts) <= 1:
        return "flat", current, current, False

    baseline_series = abs_amounts.iloc[:-1]
    baseline = float(baseline_series.median())
    if baseline <= 0:
        return "flat", baseline, current, False

    delta = (current - baseline) / baseline
    if delta > threshold:
        return "up", baseline, current, True
    if delta < -threshold:
        return "down", baseline, current, False
    return "flat", baseline, current, False


def detect_recurring_streams(
    ledger: pd.DataFrame,
    *,
    price_increase_threshold: float = 0.10,
) -> list[RecurringStream]:
    if ledger.empty:
        return []

    debits = ledger[
        (ledger["amount"] < 0) & (~ledger["category"].isin(TRANSFER_CATEGORIES))
    ][["date", "description", "amount"]].copy()
    if debits.empty:
        return []

    debits["merchant"] = debits["description"].apply(normalize_merchant)

    streams: list[RecurringStream] = []
    for merchant, group in debits.groupby("merchant", sort=False):
        ordered = group.sort_values("date").reset_index(drop=True)
        if len(ordered) < 2:
            continue

        cadence, confidence = _pick_cadence(ordered)
        if cadence is None:
            continue

        cadence_days = CADENCE_DAYS[cadence]
        tolerance = CADENCE_TOLERANCE_DAYS[cadence]
        last_date = ordered["date"].iloc[-1]
        next_expected = last_date + timedelta(days=cadence_days)
        today = pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()
        missed_expected = today > (next_expected + timedelta(days=tolerance))
        active = (today - last_date) <= timedelta(days=(cadence_days + tolerance + 14))

        trend, baseline, current, price_increase = _amount_trend(
            ordered["amount"], price_increase_threshold
        )
        stream = RecurringStream(
            stream_id=_stream_id(merchant, cadence),
            merchant=merchant,
            cadence=cadence,
            confidence=confidence,
            expected_amount=round(float(ordered["amount"].abs().median()), 2),
            current_amount=round(current, 2),
            baseline_amount=round(baseline, 2),
            amount_trend=trend,
            active=active,
            next_expected_charge_date=next_expected.strftime("%Y-%m-%d"),
            last_charge_date=last_date.strftime("%Y-%m-%d"),
            charge_count=len(ordered),
            amount_series=[round(float(v), 2) for v in ordered["amount"].abs().tolist()],
            date_series=[d.strftime("%Y-%m-%d") for d in ordered["date"].tolist()],
            price_increase=price_increase,
            is_new_recurring=len(ordered) == 2,
            missed_expected_charge=missed_expected and active,
        )
        streams.append(stream)

    streams.sort(key=lambda s: (not s.active, -s.confidence, s.merchant))
    return streams


def build_subscription_payload(
    ledger: pd.DataFrame,
    preferences: dict[str, dict[str, bool]] | None = None,
    *,
    price_increase_threshold: float = 0.10,
) -> list[dict]:
    preferences = preferences or {}
    streams = detect_recurring_streams(
        ledger, price_increase_threshold=price_increase_threshold
    )
    result: list[dict] = []
    for stream in streams:
        pref = preferences.get(stream.stream_id, {})
        ignored = bool(pref.get("ignored", False))
        essential = bool(pref.get("essential", False))
        result.append(
            {
                "stream_id": stream.stream_id,
                "merchant": stream.merchant,
                "cadence": stream.cadence,
                "confidence": stream.confidence,
                "active": stream.active,
                "ignored": ignored,
                "essential": essential,
                "amount": stream.current_amount,
                "baseline_amount": stream.baseline_amount,
                "expected_amount": stream.expected_amount,
                "next_expected_charge_date": stream.next_expected_charge_date,
                "last_charge_date": stream.last_charge_date,
                "trend": stream.amount_trend,
                "price_increase": stream.price_increase,
                "charge_count": stream.charge_count,
                "charge_history": [
                    {"date": d, "amount": a}
                    for d, a in zip(stream.date_series, stream.amount_series, strict=True)
                ],
                "cancellation_candidate": (not essential) and stream.active,
                "negotiation_opportunity": stream.price_increase,
                "is_new_recurring": stream.is_new_recurring,
                "missed_expected_charge": stream.missed_expected_charge,
            }
        )
    return result


def build_alerts(subscriptions: list[dict], include_missed: bool = True) -> list[dict]:
    alerts: list[dict] = []
    for sub in subscriptions:
        if sub["ignored"]:
            continue
        if sub["price_increase"]:
            alerts.append(
                {
                    "stream_id": sub["stream_id"],
                    "merchant": sub["merchant"],
                    "alert_type": "price_increased",
                    "message": (
                        f"{sub['merchant']} increased from ${sub['baseline_amount']:.2f} "
                        f"to ${sub['amount']:.2f}."
                    ),
                }
            )
        if sub["is_new_recurring"]:
            alerts.append(
                {
                    "stream_id": sub["stream_id"],
                    "merchant": sub["merchant"],
                    "alert_type": "new_recurring_charge_detected",
                    "message": f"New recurring charge detected for {sub['merchant']}.",
                }
            )
        if include_missed and sub["missed_expected_charge"]:
            alerts.append(
                {
                    "stream_id": sub["stream_id"],
                    "merchant": sub["merchant"],
                    "alert_type": "missed_expected_charge",
                    "message": f"Expected charge for {sub['merchant']} appears to be missed.",
                }
            )
    return alerts
