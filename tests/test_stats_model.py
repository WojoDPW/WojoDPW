import unittest

from fantasy_forecast.stats_model import (
    build_position_priors,
    collect_player_weekly_stats,
    forecast_player,
    resolve_status,
)


class FakePlayer:
    """Minimal stand-in for espn_api.football.Player used in tests."""

    def __init__(
        self,
        player_id,
        name,
        position,
        pro_team="XXX",
        injury_status="ACTIVE",
        schedule_weeks=range(1, 18),
        weekly_breakdowns=None,
        percent_owned=50.0,
    ):
        self.playerId = player_id
        self.name = name
        self.position = position
        self.proTeam = pro_team
        self.injuryStatus = injury_status
        self.schedule = {w: {"team": "OPP", "date": None} for w in schedule_weeks}
        self.percent_owned = percent_owned
        self.stats = {}
        for week, breakdown in (weekly_breakdowns or {}).items():
            self.stats[week] = {"breakdown": breakdown}


class TestCollectWeeklyStats(unittest.TestCase):
    def test_only_prior_weeks_with_breakdown_included(self):
        player = FakePlayer(
            1,
            "Test RB",
            "RB",
            weekly_breakdowns={
                1: {"rushingYards": 50},
                2: {"rushingYards": 60},
                # week 3 missing -> bye/no data, should be skipped
                4: {"rushingYards": 70},
            },
        )
        weekly = collect_player_weekly_stats(player, target_week=5)
        self.assertEqual([w for w, _ in weekly], [1, 2, 4])

        # future weeks are never included even if present
        weekly = collect_player_weekly_stats(player, target_week=3)
        self.assertEqual([w for w, _ in weekly], [1, 2])


class TestResolveStatus(unittest.TestCase):
    def test_bye_week(self):
        player = FakePlayer(1, "Bye Guy", "WR", schedule_weeks=[1, 2, 4, 5])
        status, mult = resolve_status(player, target_week=3)
        self.assertEqual(status, "BYE")
        self.assertEqual(mult, 0.0)

    def test_out_status_zeroes_projection(self):
        player = FakePlayer(1, "Hurt Guy", "WR", injury_status="OUT")
        status, mult = resolve_status(player, target_week=3)
        self.assertEqual(status, "OUT")
        self.assertEqual(mult, 0.0)

    def test_questionable_discount(self):
        player = FakePlayer(1, "Maybe Guy", "WR", injury_status="QUESTIONABLE")
        status, mult = resolve_status(player, target_week=3)
        self.assertEqual(status, "QUESTIONABLE")
        self.assertEqual(mult, 0.85)

    def test_active_full_weight(self):
        player = FakePlayer(1, "Healthy Guy", "WR", injury_status="ACTIVE")
        status, mult = resolve_status(player, target_week=3)
        self.assertEqual(status, "ACTIVE")
        self.assertEqual(mult, 1.0)


class TestForecastPlayer(unittest.TestCase):
    def test_consistent_producer_projects_near_own_average(self):
        # A WR who has caught exactly 8/100/1 every week should project
        # close to his own rate once enough games have accumulated,
        # regardless of the position-wide prior.
        breakdown = {
            "receivingTargets": 10,
            "receivingReceptions": 8,
            "receivingYards": 100,
            "receivingTouchdowns": 1,
        }
        weekly = {w: dict(breakdown) for w in range(1, 9)}
        player = FakePlayer(1, "Steady WR", "WR", weekly_breakdowns=weekly)

        other = FakePlayer(
            2,
            "Bench WR",
            "WR",
            weekly_breakdowns={w: {"receivingTargets": 2, "receivingReceptions": 1, "receivingYards": 8} for w in range(1, 9)},
        )

        priors = build_position_priors([player, other], target_week=9, decay=0.75)
        forecast = forecast_player(player, target_week=9, priors=priors, decay=0.75, shrink_games=4.0)

        # 8 rec * 1 + 100 yds * 0.1 + 1 TD * 6 = 8 + 10 + 6 = 24, shrunk slightly
        # toward the (lower) position prior since shrink_games=4 vs 8 games played.
        self.assertGreater(forecast.projected_points, 15.0)
        self.assertLess(forecast.projected_points, 24.0)
        self.assertEqual(forecast.games_used, 8)
        self.assertEqual(forecast.confidence, "High")

    def test_rookie_with_no_history_falls_back_to_position_prior(self):
        veteran = FakePlayer(
            1,
            "Veteran RB",
            "RB",
            weekly_breakdowns={
                w: {"rushingAttempts": 15, "rushingYards": 75, "rushingTouchdowns": 1}
                for w in range(1, 5)
            },
        )
        rookie = FakePlayer(2, "Rookie RB", "RB", weekly_breakdowns={})

        priors = build_position_priors([veteran, rookie], target_week=5, decay=0.75)
        forecast = forecast_player(rookie, target_week=5, priors=priors, decay=0.75, shrink_games=4.0)

        self.assertEqual(forecast.games_used, 0)
        self.assertEqual(forecast.confidence, "Low")
        # Should land exactly on the veteran-driven position prior since the
        # rookie has zero games of his own to blend in.
        veteran_points = 75 * 0.1 + 1 * 6.0  # 13.5
        self.assertAlmostEqual(forecast.projected_points, veteran_points, delta=0.5)

    def test_bye_week_zeroes_out_final_projection_but_keeps_stat_line(self):
        player = FakePlayer(
            1,
            "Bye WR",
            "WR",
            schedule_weeks=[1, 2, 4],
            weekly_breakdowns={
                1: {"receivingReceptions": 5, "receivingYards": 60},
                2: {"receivingReceptions": 5, "receivingYards": 60},
            },
        )
        priors = build_position_priors([player], target_week=3, decay=0.75)
        forecast = forecast_player(player, target_week=3, priors=priors, decay=0.75, shrink_games=4.0)

        self.assertEqual(forecast.status, "BYE")
        self.assertEqual(forecast.projected_points, 0.0)
        # underlying stat line should still reflect the (pre-multiplier) model
        self.assertGreater(forecast.projected_stat_line["receivingReceptions"], 0)

    def test_unsupported_position_returns_none(self):
        player = FakePlayer(1, "Punter", "P")
        forecast = forecast_player(player, target_week=3, priors={}, decay=0.75, shrink_games=4.0)
        self.assertIsNone(forecast)


if __name__ == "__main__":
    unittest.main()
