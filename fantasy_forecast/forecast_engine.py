"""Orchestrates pulling player data and turning it into forecasts."""
import sys
from typing import List, Optional

from .espn_client import EspnFantasyDataClient
from .models import PlayerForecast
from .stats_model import build_position_priors, forecast_player


def run_forecast(
    client: EspnFantasyDataClient,
    target_week: int,
    decay: float,
    shrink_games: float,
    batch_size: int = 300,
    positions: Optional[List[str]] = None,
    progress: bool = True,
) -> List[PlayerForecast]:
    player_ids = list(client.all_active_player_ids().keys())
    if progress:
        print(f"Found {len(player_ids)} active NFL players", file=sys.stderr)

    players = list(
        client.fetch_players(player_ids, batch_size=batch_size, progress=progress)
    )

    if positions:
        wanted = {p.upper() for p in positions}
        players = [p for p in players if p.position in wanted]

    if progress:
        print("Building position-level priors...", file=sys.stderr)
    priors = build_position_priors(players, target_week, decay=decay)

    if progress:
        print("Building per-player forecasts...", file=sys.stderr)
    forecasts = []
    for player in players:
        forecast = forecast_player(
            player, target_week, priors, decay=decay, shrink_games=shrink_games
        )
        if forecast is not None:
            forecasts.append(forecast)

    forecasts.sort(key=lambda f: f.projected_points, reverse=True)
    return forecasts
