"""Position-adjusted, recency-weighted statistical forecasting model.

For every relevant raw per-game stat (targets, carries, receptions, yards,
touchdowns, etc.) we compute a recency-weighted average of the player's own
games this season, then blend ("shrink") it toward the league-wide average
rate for that stat at that position. Shrinkage matters most for players
with few games of data (rookies, recent call-ups, early-season weeks),
where a couple of games shouldn't be taken at face value; it fades out as
more of a player's own games accumulate.

The blended per-game stat line is then run through ``scoring.score_stat_line``
to produce a single full-PPR point projection.
"""
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

from .constants import (
    CONFIDENCE_THRESHOLDS,
    DEFAULT_DECAY,
    DEFAULT_SHRINK_GAMES,
    POSITION_STAT_KEYS,
    STATUS_MULTIPLIERS,
)
from .models import PlayerForecast
from .scoring import score_stat_line

WeeklyBreakdown = Tuple[int, Dict[str, float]]


def collect_player_weekly_stats(player, target_week: int) -> List[WeeklyBreakdown]:
    """Return (week, breakdown) pairs for actual games played before target_week.

    Only weeks with a recorded actual (non-projected) stat breakdown are
    included; bye weeks and weeks with no game data are skipped.
    """
    weekly = []
    for week in range(1, target_week):
        entry = player.stats.get(week)
        if entry and entry.get("breakdown"):
            weekly.append((week, entry["breakdown"]))
    return weekly


def _weighted_rate(weekly: Iterable[WeeklyBreakdown], key: str, target_week: int, decay: float) -> Tuple[float, float]:
    """Return (weighted_sum, weight_total) for one stat across weekly games."""
    weighted_sum = 0.0
    weight_total = 0.0
    for week, breakdown in weekly:
        weeks_ago = target_week - week - 1
        weight = decay ** weeks_ago
        weighted_sum += weight * breakdown.get(key, 0.0)
        weight_total += weight
    return weighted_sum, weight_total


def build_position_priors(
    players, target_week: int, decay: float = DEFAULT_DECAY
) -> Dict[str, Dict[str, float]]:
    """Pool every player's recency-weighted per-game rates by position.

    Returns {position: {stat_key: league_average_rate_per_game}}.
    """
    pooled: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))

    for player in players:
        stat_keys = POSITION_STAT_KEYS.get(player.position)
        if not stat_keys:
            continue
        weekly = collect_player_weekly_stats(player, target_week)
        if not weekly:
            continue
        for key in stat_keys:
            weighted_sum, weight_total = _weighted_rate(weekly, key, target_week, decay)
            bucket = pooled[player.position][key]
            bucket[0] += weighted_sum
            bucket[1] += weight_total

    priors: Dict[str, Dict[str, float]] = {}
    for position, stats in pooled.items():
        priors[position] = {
            key: (ws[0] / ws[1] if ws[1] > 0 else 0.0) for key, ws in stats.items()
        }
    return priors


def resolve_status(player, target_week: int) -> Tuple[str, float]:
    """Return (status_label, availability_multiplier) for the target week."""
    if target_week not in player.schedule:
        return "BYE", 0.0

    raw_status = (player.injuryStatus or "ACTIVE").upper()
    multiplier = STATUS_MULTIPLIERS.get(raw_status, 1.0)
    return raw_status, multiplier


def _confidence_label(games_used: int) -> str:
    if games_used >= CONFIDENCE_THRESHOLDS["High"]:
        return "High"
    if games_used >= CONFIDENCE_THRESHOLDS["Medium"]:
        return "Medium"
    return "Low"


def forecast_player(
    player,
    target_week: int,
    priors: Dict[str, Dict[str, float]],
    decay: float = DEFAULT_DECAY,
    shrink_games: float = DEFAULT_SHRINK_GAMES,
) -> PlayerForecast:
    """Build a full PlayerForecast for a single player, or None if unsupported."""
    stat_keys = POSITION_STAT_KEYS.get(player.position)
    if not stat_keys:
        return None

    weekly = collect_player_weekly_stats(player, target_week)
    games_used = len(weekly)
    position_prior = priors.get(player.position, {})

    projected_stats = {}
    for key in stat_keys:
        weighted_sum, weight_total = _weighted_rate(weekly, key, target_week, decay)
        prior_rate = position_prior.get(key, 0.0)
        raw_rate = weighted_sum / weight_total if weight_total > 0 else prior_rate
        denom = games_used + shrink_games
        blended_rate = (
            (games_used * raw_rate + shrink_games * prior_rate) / denom if denom > 0 else 0.0
        )
        projected_stats[key] = round(blended_rate, 4)

    base_points = score_stat_line(player.position, projected_stats)
    status, multiplier = resolve_status(player, target_week)
    final_points = round(base_points * multiplier, 2)

    return PlayerForecast(
        player_id=player.playerId,
        name=player.name,
        position=player.position,
        pro_team=player.proTeam,
        target_week=target_week,
        projected_points=final_points,
        status=status,
        games_used=games_used,
        confidence=_confidence_label(games_used),
        projected_stat_line=projected_stats,
        percent_owned=getattr(player, "percent_owned", None),
    )
