"""Templated 'explain this connection' text (spec 7.6).

Deterministic on purpose -- group evidence by source_type, count, take the
date range, fill a sentence. No LLM call in the MVP path.
"""
from __future__ import annotations

from collections import Counter

_PLURAL = {
    "CALL_RECORD": "calls",
    "TRANSACTION": "transactions",
    "LOCATION_EVENT": "co-location events",
    "FIR": "FIR references",
    "SOCIAL_MEDIA": "social-media mentions",
}


def _phrase(source_type: str, n: int) -> str:
    word = _PLURAL.get(source_type, source_type.lower().replace("_", " ") + " records")
    if n == 1:
        word = word[:-1] if word.endswith("s") else word
    return f"{n} {word}"


def summarize(evidence: list[dict]) -> dict:
    """evidence: list of dicts with source_type + a date-ish field."""
    if not evidence:
        return {
            "count": 0,
            "source_types": [],
            "key_dates": [],
            "explanation": "No supporting evidence records are attached yet.",
        }

    by_type: Counter[str] = Counter(e.get("source_type", "UNKNOWN") for e in evidence)
    dates = sorted({d[:10] for e in evidence if (d := _date_of(e))})
    date_from, date_to = (dates[0], dates[-1]) if dates else (None, None)

    ordered = by_type.most_common()
    main_type, main_n = ordered[0]
    parts = [f"Linked through {_phrase(main_type, main_n)}"]
    if date_from and date_to:
        parts.append(
            f" on {date_from}" if date_from == date_to
            else f" between {date_from} and {date_to}"
        )
    for other_type, other_n in ordered[1:]:
        parts.append(f", plus {_phrase(other_type, other_n)}")
    explanation = "".join(parts) + "."

    return {
        "count": len(evidence),
        "source_types": [t for t, _ in ordered],
        "key_dates": dates[:6],
        "explanation": explanation,
    }


def _date_of(evidence: dict) -> str | None:
    for key in ("timestamp", "start_time", "valid_from", "date", "post_timestamp"):
        val = evidence.get(key)
        if val:
            return str(val)
    excerpt = evidence.get("text_excerpt") or ""
    # excerpts often embed an ISO timestamp
    for token in excerpt.replace(".", " ").split():
        if len(token) >= 10 and token[:4].isdigit() and token[4] == "-":
            return token
    return None
