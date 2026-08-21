"""Write PlayerForecast lists out to CSV or JSON."""
import csv
import json
from typing import List

from .models import PlayerForecast

CSV_FIELDS = [
    "rank",
    "player_id",
    "name",
    "position",
    "pro_team",
    "target_week",
    "projected_points",
    "status",
    "games_used",
    "confidence",
    "percent_owned",
    "projected_stat_line",
]


def write_csv(forecasts: List[PlayerForecast], path: str) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for rank, forecast in enumerate(forecasts, start=1):
            writer.writerow(
                {
                    "rank": rank,
                    "player_id": forecast.player_id,
                    "name": forecast.name,
                    "position": forecast.position,
                    "pro_team": forecast.pro_team,
                    "target_week": forecast.target_week,
                    "projected_points": forecast.projected_points,
                    "status": forecast.status,
                    "games_used": forecast.games_used,
                    "confidence": forecast.confidence,
                    "percent_owned": forecast.percent_owned,
                    "projected_stat_line": json.dumps(forecast.projected_stat_line),
                }
            )


def write_json(forecasts: List[PlayerForecast], path: str) -> None:
    data = []
    for rank, forecast in enumerate(forecasts, start=1):
        row = vars(forecast).copy()
        row["rank"] = rank
        data.append(row)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def print_top(forecasts: List[PlayerForecast], n: int) -> None:
    header = f"{'#':>4} {'Name':<25} {'Pos':<5} {'Team':<5} {'Wk':>3} {'Proj':>7} {'Status':<12} {'Conf':<6}"
    print(header)
    print("-" * len(header))
    for rank, forecast in enumerate(forecasts[:n], start=1):
        print(
            f"{rank:>4} {forecast.name:<25} {forecast.position:<5} "
            f"{forecast.pro_team:<5} {forecast.target_week:>3} "
            f"{forecast.projected_points:>7.2f} {forecast.status:<12} {forecast.confidence:<6}"
        )
