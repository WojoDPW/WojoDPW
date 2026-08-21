"""Pure functions that turn a raw stat line into full-PPR fantasy points.

Scoring is computed independently of whatever scoring rules the source
ESPN league happens to use, so forecasts are always expressed in standard
full-PPR terms regardless of which league's player pool was used to source
the underlying per-game stats.
"""
from .constants import (
    DST_POINTS_ALLOWED_TIERS,
    DST_SCORING,
    KICKER_SCORING,
    OFFENSE_SCORING,
)


def _points_allowed_tier_score(points_allowed: float) -> float:
    for max_points, tier_score in DST_POINTS_ALLOWED_TIERS:
        if points_allowed <= max_points:
            return tier_score
    return DST_POINTS_ALLOWED_TIERS[-1][1]


def score_stat_line(position: str, stats: dict) -> float:
    """Return full-PPR fantasy points for a raw per-game stat line.

    ``stats`` maps raw breakdown keys (e.g. ``receivingYards``) to values,
    such as the projected or actual per-game stat line for a player.
    """
    if position == "K":
        return round(
            sum(stats.get(key, 0.0) * pts for key, pts in KICKER_SCORING.items()),
            4,
        )

    if position == "D/ST":
        total = sum(stats.get(key, 0.0) * pts for key, pts in DST_SCORING.items())
        total += _points_allowed_tier_score(stats.get("defensivePointsAllowed", 0.0))
        return round(total, 4)

    # QB / RB / WR / TE all share the same offensive formula.
    total = sum(stats.get(key, 0.0) * pts for key, pts in OFFENSE_SCORING.items())
    return round(total, 4)
