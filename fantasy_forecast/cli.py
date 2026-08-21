"""Command-line entry point: fantasy-forecast"""
import argparse
import os
import sys

from .constants import DEFAULT_DECAY, DEFAULT_SHRINK_GAMES
from .espn_client import EspnFantasyDataClient
from .forecast_engine import run_forecast
from .output import print_top, write_csv, write_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fantasy-forecast",
        description=(
            "Generate week-to-week full-PPR fantasy football scoring forecasts "
            "for all active NFL players, sourced from the espn-api package."
        ),
    )
    parser.add_argument(
        "--league-id",
        type=int,
        required=True,
        help="An ESPN fantasy football league ID used to source player data. "
        "Any accessible public league works -- player data is not limited "
        "to that league's rosters.",
    )
    parser.add_argument(
        "--year",
        type=int,
        required=True,
        help="NFL season year, e.g. 2026.",
    )
    parser.add_argument(
        "--week",
        type=int,
        default=None,
        help="Week to forecast. Defaults to the league's current week.",
    )
    parser.add_argument(
        "--espn-s2",
        default=None,
        help="espn_s2 cookie, required only for private leagues. "
        "Falls back to the ESPN_S2 environment variable.",
    )
    parser.add_argument(
        "--swid",
        default=None,
        help="SWID cookie, required only for private leagues. "
        "Falls back to the ESPN_SWID environment variable.",
    )
    parser.add_argument(
        "--out",
        default="forecasts.csv",
        help="Output file path (default: forecasts.csv).",
    )
    parser.add_argument(
        "--format",
        choices=["csv", "json"],
        default=None,
        help="Output format. Defaults based on --out's file extension, else csv.",
    )
    parser.add_argument(
        "--positions",
        default=None,
        help="Comma-separated list of positions to include, e.g. QB,RB,WR,TE. "
        "Defaults to all supported positions (QB, RB, WR, TE, K, D/ST).",
    )
    parser.add_argument(
        "--decay",
        type=float,
        default=DEFAULT_DECAY,
        help=f"Recency decay per week of age, 0-1 (default: {DEFAULT_DECAY}). "
        "Lower values weight recent games more heavily.",
    )
    parser.add_argument(
        "--shrink-games",
        type=float,
        default=DEFAULT_SHRINK_GAMES,
        help="Shrinkage strength toward the position average, in 'games worth' "
        f"of prior (default: {DEFAULT_SHRINK_GAMES}). Higher values pull small "
        "samples (rookies, early season) closer to the position average.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=300,
        help="Player IDs per ESPN API request batch (default: 300).",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=0,
        help="Print the top N forecasts to the console (default: 0, off).",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress progress output.",
    )
    return parser


def _resolve_format(args) -> str:
    if args.format:
        return args.format
    if args.out.lower().endswith(".json"):
        return "json"
    return "csv"


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    espn_s2 = args.espn_s2 or os.environ.get("ESPN_S2")
    swid = args.swid or os.environ.get("ESPN_SWID")
    positions = args.positions.split(",") if args.positions else None
    progress = not args.quiet

    client = EspnFantasyDataClient(
        league_id=args.league_id, year=args.year, espn_s2=espn_s2, swid=swid
    )

    target_week = args.week or client.current_week
    if target_week < 1 or target_week > client.reg_season_weeks:
        print(
            f"Error: week {target_week} is outside the regular season "
            f"(1-{client.reg_season_weeks}).",
            file=sys.stderr,
        )
        return 1

    if progress:
        print(f"Forecasting week {target_week} of {args.year}...", file=sys.stderr)

    forecasts = run_forecast(
        client,
        target_week=target_week,
        decay=args.decay,
        shrink_games=args.shrink_games,
        batch_size=args.batch_size,
        positions=positions,
        progress=progress,
    )

    fmt = _resolve_format(args)
    if fmt == "json":
        write_json(forecasts, args.out)
    else:
        write_csv(forecasts, args.out)

    if progress:
        print(f"Wrote {len(forecasts)} player forecasts to {args.out}", file=sys.stderr)

    if args.top:
        print_top(forecasts, args.top)

    return 0


if __name__ == "__main__":
    sys.exit(main())
