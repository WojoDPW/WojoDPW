import unittest

from fantasy_forecast.scoring import score_stat_line


class TestOffenseScoring(unittest.TestCase):
    def test_qb_stat_line(self):
        stats = {
            "passingYards": 300,
            "passingTouchdowns": 3,
            "passingInterceptions": 1,
            "rushingYards": 20,
            "rushingTouchdowns": 0,
        }
        # 300*0.04 + 3*4 + 1*(-2) + 20*0.1 = 12 + 12 - 2 + 2 = 24
        self.assertAlmostEqual(score_stat_line("QB", stats), 24.0)

    def test_rb_ppr_reception_credit(self):
        stats = {
            "rushingYards": 100,
            "rushingTouchdowns": 1,
            "receivingReceptions": 5,
            "receivingYards": 40,
            "receivingTouchdowns": 0,
        }
        # 100*0.1 + 1*6 + 5*1 + 40*0.1 = 10 + 6 + 5 + 4 = 25
        self.assertAlmostEqual(score_stat_line("RB", stats), 25.0)

    def test_fumble_and_two_point_conversion(self):
        stats = {
            "receivingReceptions": 2,
            "lostFumbles": 1,
            "receiving2PtConversions": 1,
        }
        # 2*1 - 2 + 2 = 2
        self.assertAlmostEqual(score_stat_line("WR", stats), 2.0)

    def test_empty_stat_line_scores_zero(self):
        self.assertEqual(score_stat_line("TE", {}), 0.0)


class TestKickerScoring(unittest.TestCase):
    def test_field_goal_distance_tiers(self):
        stats = {
            "madeFieldGoalsFromUnder40": 2,
            "madeFieldGoalsFrom40To49": 1,
            "madeFieldGoalsFrom50Plus": 1,
            "madeExtraPoints": 3,
        }
        # 2*3 + 1*4 + 1*5 + 3*1 = 6 + 4 + 5 + 3 = 18
        self.assertAlmostEqual(score_stat_line("K", stats), 18.0)


class TestDstScoring(unittest.TestCase):
    def test_counting_stats(self):
        stats = {
            "defensiveSacks": 3,
            "defensiveInterceptions": 2,
            "defensiveFumbles": 1,
            "defensivePlusSpecialTeamsTouchdowns": 1,
            "defensivePointsAllowed": 10,
        }
        # 3*1 + 2*2 + 1*2 + 1*6 = 3+4+2+6 = 15, plus PA tier 7-13 -> +4
        self.assertAlmostEqual(score_stat_line("D/ST", stats), 19.0)

    def test_points_allowed_tiers(self):
        cases = [
            (0, 10.0),
            (6, 7.0),
            (13, 4.0),
            (17, 1.0),
            (21, 0.0),
            (27, -1.0),
            (34, -4.0),
            (45, -7.0),
            (46, -10.0),
            (100, -10.0),
        ]
        for points_allowed, expected in cases:
            with self.subTest(points_allowed=points_allowed):
                stats = {"defensivePointsAllowed": points_allowed}
                self.assertAlmostEqual(score_stat_line("D/ST", stats), expected)


if __name__ == "__main__":
    unittest.main()
