import unittest

from fantasy_forecast.forecast_engine import run_forecast
from tests.test_stats_model import FakePlayer


class FakeClient:
    """Duck-types EspnFantasyDataClient without touching the network."""

    def __init__(self, players):
        self._players = players

    def all_active_player_ids(self):
        return {p.playerId: p.name for p in self._players}

    def fetch_players(self, player_ids, batch_size=300, progress=True):
        wanted = set(player_ids)
        return (p for p in self._players if p.playerId in wanted)


class TestRunForecast(unittest.TestCase):
    def test_end_to_end_ranks_and_filters(self):
        wr = FakePlayer(
            1,
            "Good WR",
            "WR",
            weekly_breakdowns={
                w: {"receivingReceptions": 8, "receivingYards": 100, "receivingTouchdowns": 1}
                for w in range(1, 5)
            },
        )
        rb = FakePlayer(
            2,
            "Ok RB",
            "RB",
            weekly_breakdowns={
                w: {"rushingAttempts": 12, "rushingYards": 45, "rushingTouchdowns": 0}
                for w in range(1, 5)
            },
        )
        punter = FakePlayer(3, "Unsupported Punter", "P")

        client = FakeClient([wr, rb, punter])
        forecasts = run_forecast(
            client, target_week=5, decay=0.75, shrink_games=4.0, progress=False
        )

        # Punter has no supported stat model and should be excluded entirely.
        self.assertEqual({f.player_id for f in forecasts}, {1, 2})
        # Results should be sorted by projected points, descending.
        self.assertGreaterEqual(forecasts[0].projected_points, forecasts[1].projected_points)
        self.assertEqual(forecasts[0].player_id, 1)

    def test_position_filter(self):
        wr = FakePlayer(1, "Some WR", "WR", weekly_breakdowns={1: {"receivingReceptions": 3}})
        rb = FakePlayer(2, "Some RB", "RB", weekly_breakdowns={1: {"rushingAttempts": 10}})
        client = FakeClient([wr, rb])

        forecasts = run_forecast(
            client,
            target_week=2,
            decay=0.75,
            shrink_games=4.0,
            positions=["rb"],
            progress=False,
        )
        self.assertEqual([f.position for f in forecasts], ["RB"])


if __name__ == "__main__":
    unittest.main()
