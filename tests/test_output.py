import csv
import json
import os
import tempfile
import unittest

from fantasy_forecast.models import PlayerForecast
from fantasy_forecast.output import write_csv, write_json


def _sample_forecasts():
    return [
        PlayerForecast(
            player_id=1,
            name="Star WR",
            position="WR",
            pro_team="KC",
            target_week=5,
            projected_points=18.4,
            status="ACTIVE",
            games_used=4,
            confidence="Medium",
            projected_stat_line={"receivingReceptions": 6.2, "receivingYards": 82.1},
            percent_owned=99.1,
        ),
        PlayerForecast(
            player_id=2,
            name="Bye Guy",
            position="RB",
            pro_team="SF",
            target_week=5,
            projected_points=0.0,
            status="BYE",
            games_used=4,
            confidence="Medium",
            projected_stat_line={"rushingYards": 55.0},
            percent_owned=40.0,
        ),
    ]


class TestOutput(unittest.TestCase):
    def test_write_csv_roundtrip(self):
        forecasts = _sample_forecasts()
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "out.csv")
            write_csv(forecasts, path)
            with open(path) as f:
                rows = list(csv.DictReader(f))
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["rank"], "1")
            self.assertEqual(rows[0]["name"], "Star WR")
            stat_line = json.loads(rows[0]["projected_stat_line"])
            self.assertAlmostEqual(stat_line["receivingYards"], 82.1)

    def test_write_json_roundtrip(self):
        forecasts = _sample_forecasts()
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "out.json")
            write_json(forecasts, path)
            with open(path) as f:
                data = json.load(f)
            self.assertEqual(len(data), 2)
            self.assertEqual(data[1]["status"], "BYE")
            self.assertEqual(data[1]["rank"], 2)


if __name__ == "__main__":
    unittest.main()
