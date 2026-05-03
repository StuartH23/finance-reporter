"""Recurring transaction detection and subscription alerting."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import timedelta

import pandas as pd

from .categories import TRANSFER_CATEGORIES

# (period_days, tolerance_days) per cadence
CADENCES: dict[str, tuple[int, int]] = {
    "weekly": (7, 2),
    "monthly": (30, 5),
    "annual": (365, 21),
}

MIN_CONFIDENCE = 0.55
EARLY_MATCH_DAYS = 3
LATE_MATCH_DAYS = 5
PAYMENT_VARIANCE_THRESHOLD = 0.15

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
    missed_expected_charge: bool
    reference_date: pd.Timestamp

    @property
    def expected_amount(self) -> float:
        if not self.amount_series:
            return 0.0
        s = sorted(self.amount_series)
        mid = len(s) // 2
        median = s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2
        return round(median, 2)

    @property
    def is_new_recurring(self) -> bool:
        return self.charge_count < 3


@dataclass
class ExpectedOccurrence:
    expected_date: pd.Timestamp
    matched_date: pd.Timestamp | None
    matched_amount: float | None


def normalize_merchant(description: str) -> str:
    text = str(description).upper()
    text = re.sub(r"https?://", " ", text)
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    text = re.sub(r"\b\d+\b", " ", text)
    tokens = [t for t in text.split() if len(t) > 1 and t not in _NOISE_TOKENS]
    # Remove consecutive duplicates (e.g. "NETFLIX NETFLIX CA" → "NETFLIX CA")
    deduped: list[str] = []
    for token in tokens:
        if not deduped or token != deduped[-1]:
            deduped.append(token)
    return " ".join(deduped[:4]) if deduped else "UNKNOWN MERCHANT"


def _confidence(
    count: int,
    period_days: int,
    tolerance_days: int,
    date_series: pd.Series,
    amount_series: pd.Series,
) -> float:
    if count < 2:
        return 0.0

    diffs = date_series.diff().dropna().dt.days.astype(float)
    if diffs.empty:
        return 0.0

    matches = 0
    for gap in diffs:
        multiplier = max(1, min(4, round(gap / period_days)))
        if abs(gap - period_days * multiplier) <= tolerance_days * multiplier:
            matches += 1
    cadence_fit = matches / len(diffs)

    abs_amount = amount_series.abs()
    mean_amount = float(abs_amount.mean()) if not abs_amount.empty else 0.0
    amount_stability = (
        max(0.0, min(1.0, 1.0 - float(abs_amount.std(ddof=0)) / mean_amount))
        if mean_amount > 0
        else 0.0
    )

    count_score = min(1.0, count / 6)
    return round((0.5 * cadence_fit) + (0.3 * count_score) + (0.2 * amount_stability), 3)


def _pick_cadence(group: pd.DataFrame) -> tuple[str | None, float]:
    diffs = group["date"].sort_values().diff().dropna().dt.days.astype(float)
    median_gap = float(diffs.median()) if not diffs.empty else 0.0

    best_name: str | None = None
    best_score = 0.0
    for cadence_name, (period_days, tolerance_days) in CADENCES.items():
        score = _confidence(
            count=len(group),
            period_days=period_days,
            tolerance_days=tolerance_days,
            date_series=group["date"],
            amount_series=group["amount"],
        )
        # When scores tie, prefer the cadence whose primary period is closest
        # to the actual median gap — prevents weekly (7*4=28d) from beating
        # monthly (30d) on charges that are clearly billed once a month.
        closer = best_name is not None and abs(period_days - median_gap) < abs(
            CADENCES[best_name][0] - median_gap
        )
        if score > best_score or (score == best_score and closer):
            best_name, best_score = cadence_name, score
    return (best_name, best_score) if best_score >= MIN_CONFIDENCE else (None, best_score)


def _stream_id(merchant: str, cadence: str) -> str:
    digest = hashlib.sha1(f"{merchant}:{cadence}".encode(), usedforsecurity=False).hexdigest()
    return digest[:16]


def _amount_trend(amounts: pd.Series, threshold: float) -> tuple[str, float, float, bool]:
    abs_amounts = amounts.abs()
    current = float(abs_amounts.iloc[-1])
    if len(abs_amounts) <= 1:
        return "flat", current, current, False

    baseline = float(abs_amounts.iloc[:-1].median())
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

    debits = ledger[(ledger["amount"] < 0) & (~ledger["category"].isin(TRANSFER_CATEGORIES))][
        ["date", "description", "amount"]
    ].copy()
    if debits.empty:
        return []

    # Use the ledger's newest date as the reference so historical uploads
    # aren't penalised by wall-clock drift when computing activity flags.
    reference_date = ledger["date"].dropna().max()
    if pd.isna(reference_date):
        reference_date = pd.Timestamp.now(tz="UTC").tz_localize(None).normalize()

    debits["merchant"] = debits["description"].apply(normalize_merchant)

    streams: list[RecurringStream] = []
    for merchant, group in debits.groupby("merchant", sort=False):
        ordered = group.sort_values("date").reset_index(drop=True)
        if len(ordered) < 2:
            continue

        cadence, confidence = _pick_cadence(ordered)
        if cadence is None:
            continue

        period_days, tolerance = CADENCES[cadence]
        last_date = ordered["date"].iloc[-1]
        next_expected = last_date + timedelta(days=period_days)
        active = (reference_date - last_date) <= timedelta(days=period_days + tolerance + 14)
        missed_expected = (
            active
            and len(ordered) >= 3
            and reference_date > (next_expected + timedelta(days=tolerance))
        )

        trend, baseline, current, price_increase = _amount_trend(
            ordered["amount"], price_increase_threshold
        )
        streams.append(
            RecurringStream(
                stream_id=_stream_id(merchant, cadence),
                merchant=merchant,
                cadence=cadence,
                confidence=confidence,
                current_amount=round(current, 2),
                baseline_amount=round(baseline, 2),
                amount_trend=trend,
                active=active,
                next_expected_charge_date=next_expected.strftime("%Y-%m-%d"),
                last_charge_date=last_date.strftime("%Y-%m-%d"),
                charge_count=len(ordered),
                amount_series=[round(float(v), 2) for v in ordered["amount"].abs()],
                date_series=[d.strftime("%Y-%m-%d") for d in ordered["date"]],
                price_increase=price_increase,
                missed_expected_charge=missed_expected,
                reference_date=reference_date,
            )
        )

    streams.sort(key=lambda s: (not s.active, -s.confidence, s.merchant))
    return streams


def build_subscription_payload(
    ledger: pd.DataFrame,
    preferences: dict[str, dict[str, bool]] | None = None,
    *,
    price_increase_threshold: float = 0.10,
) -> list[dict]:
    preferences = preferences or {}
    streams = detect_recurring_streams(ledger, price_increase_threshold=price_increase_threshold)
    result: list[dict] = []
    for stream in streams:
        pref = preferences.get(stream.stream_id, {})
        ignored = bool(pref.get("ignored", False))
        essential = bool(pref.get("essential", False))
        occurrences = _expected_occurrences(stream)
        current_occurrence = _current_occurrence(stream, occurrences)
        expected_date = current_occurrence.expected_date if current_occurrence is not None else None
        last_paid = _last_paid_occurrence(occurrences)
        payment_state = _payment_state(stream, current_occurrence)
        status_group = "inactive" if payment_state == "inactive" else "active"
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
                "next_expected_charge_date": expected_date.strftime("%Y-%m-%d")
                if expected_date is not None
                else stream.next_expected_charge_date,
                "next_due_date": expected_date.strftime("%Y-%m-%d")
                if expected_date is not None
                else None,
                "last_charge_date": stream.last_charge_date,
                "last_paid_amount": round(float(last_paid.matched_amount), 2)
                if last_paid and last_paid.matched_amount is not None
                else None,
                "trend": stream.amount_trend,
                "price_increase": stream.price_increase,
                "charge_count": stream.charge_count,
                "charge_history": [
                    {"date": d, "amount": a}
                    for d, a in zip(stream.date_series, stream.amount_series, strict=True)
                ],
                "cancellation_candidate": not essential and stream.active,
                "negotiation_opportunity": stream.price_increase,
                "is_new_recurring": stream.is_new_recurring,
                "missed_expected_charge": stream.missed_expected_charge,
                "status_group": status_group,
                "payment_state": payment_state,
                "manually_managed": False,
            }
        )
    return result


def _expected_occurrences(stream: RecurringStream) -> list[ExpectedOccurrence]:
    period_days, _ = CADENCES[stream.cadence]
    observed_dates = [pd.to_datetime(value).normalize() for value in stream.date_series]
    observed_amounts = [float(value) for value in stream.amount_series]
    if not observed_dates:
        return []

    window_end = stream.reference_date.normalize() + timedelta(days=period_days)
    expected_dates: list[pd.Timestamp] = []
    current = observed_dates[0]
    while current <= window_end:
        expected_dates.append(current)
        current = current + timedelta(days=period_days)

    unused_payments = list(zip(observed_dates, observed_amounts, strict=True))
    occurrences: list[ExpectedOccurrence] = []
    for expected_date in expected_dates:
        due_start = expected_date - timedelta(days=EARLY_MATCH_DAYS)
        due_end = expected_date + timedelta(days=LATE_MATCH_DAYS)
        matched_index: int | None = None
        best_score: tuple[int, int] | None = None
        for index, (paid_date, _paid_amount) in enumerate(unused_payments):
            if not (due_start <= paid_date <= due_end):
                continue
            score = (abs((paid_date - expected_date).days), 0 if paid_date <= expected_date else 1)
            if best_score is None or score < best_score:
                matched_index = index
                best_score = score

        if matched_index is None:
            occurrences.append(
                ExpectedOccurrence(
                    expected_date=expected_date,
                    matched_date=None,
                    matched_amount=None,
                )
            )
            continue

        matched_date, matched_amount = unused_payments.pop(matched_index)
        occurrences.append(
            ExpectedOccurrence(
                expected_date=expected_date,
                matched_date=matched_date,
                matched_amount=matched_amount,
            )
        )
    return occurrences


def _current_occurrence(
    stream: RecurringStream,
    occurrences: list[ExpectedOccurrence],
) -> ExpectedOccurrence | None:
    reference_date = stream.reference_date.normalize()
    for occurrence in occurrences:
        due_end = occurrence.expected_date + timedelta(days=LATE_MATCH_DAYS)
        if due_end >= reference_date:
            return occurrence
    return occurrences[-1] if occurrences else None


def _last_paid_occurrence(occurrences: list[ExpectedOccurrence]) -> ExpectedOccurrence | None:
    matched = [occurrence for occurrence in occurrences if occurrence.matched_amount is not None]
    return matched[-1] if matched else None


def _payment_state(
    stream: RecurringStream,
    occurrence: ExpectedOccurrence | None,
) -> str:
    if not stream.active or occurrence is None:
        return "inactive"

    reference_date = stream.reference_date.normalize()
    due_end = occurrence.expected_date + timedelta(days=LATE_MATCH_DAYS)
    if occurrence.expected_date > reference_date:
        return "upcoming"
    if occurrence.matched_amount is not None:
        if stream.expected_amount <= 0:
            return "paid_ok"
        ratio = (
            abs(float(occurrence.matched_amount) - stream.expected_amount) / stream.expected_amount
        )
        return "paid_variance" if ratio > PAYMENT_VARIANCE_THRESHOLD else "paid_ok"
    if due_end >= reference_date:
        return "upcoming"
    return "inactive"


def _make_alert(sub: dict, alert_type: str, message: str) -> dict:
    return {
        "stream_id": sub["stream_id"],
        "merchant": sub["merchant"],
        "alert_type": alert_type,
        "message": message,
    }


def build_alerts(subscriptions: list[dict], include_missed: bool = True) -> list[dict]:
    alerts: list[dict] = []
    for sub in subscriptions:
        if sub["ignored"]:
            continue
        if sub["price_increase"]:
            alerts.append(
                _make_alert(
                    sub,
                    "price_increased",
                    (
                        f"{sub['merchant']} increased from "
                        f"${sub['baseline_amount']:.2f} to ${sub['amount']:.2f}."
                    ),
                )
            )
        if sub["is_new_recurring"]:
            alerts.append(
                _make_alert(
                    sub,
                    "new_recurring_charge_detected",
                    f"New recurring charge detected for {sub['merchant']}.",
                )
            )
        if include_missed and sub["missed_expected_charge"]:
            alerts.append(
                _make_alert(
                    sub,
                    "missed_expected_charge",
                    f"Expected charge for {sub['merchant']} appears to be missed.",
                )
            )
    return alerts
