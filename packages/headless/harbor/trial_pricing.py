"""Shared trial pricing helpers for Harbor benchmark adapters."""

from typing import Any, Callable, TypedDict


class TrialPricing(TypedDict):
    input: float
    output: float
    cache_read: float
    cache_write: float


class TrialTokenTotals(TypedDict):
    input: int
    output: int
    cache_read: int
    cache_write: int
    cache_miss: int


def pricing_from_env(get_env: Callable[[str], Any]) -> TrialPricing | None:
    input_rate = _optional_float(get_env("MAKA_TRIAL_INPUT_USD_PER_1M"))
    output_rate = _optional_float(get_env("MAKA_TRIAL_OUTPUT_USD_PER_1M"))
    if input_rate is None or output_rate is None:
        return None
    return {
        "input": input_rate,
        "output": output_rate,
        "cache_read": _optional_float(get_env("MAKA_TRIAL_CACHE_READ_USD_PER_1M"))
        or 0.0,
        "cache_write": _optional_float(get_env("MAKA_TRIAL_CACHE_WRITE_USD_PER_1M"))
        or 0.0,
    }


def estimate_cost(totals: TrialTokenTotals, pricing: TrialPricing) -> float:
    return (
        totals["cache_miss"] / 1_000_000 * pricing["input"]
        + totals["output"] / 1_000_000 * pricing["output"]
        + totals["cache_read"] / 1_000_000 * pricing["cache_read"]
        + totals["cache_write"] / 1_000_000 * pricing["cache_write"]
    )


def _optional_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None
