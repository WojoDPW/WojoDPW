"""Thin wrapper around espn_api's football League for pulling the full
active-player universe rather than just one league's rosters.

``League.player_map`` is populated from ESPN's ``/players`` endpoint with
``filterActive: true`` (see espn_api.requests.espn_requests.get_pro_players),
which returns every active NFL player league-wide -- not just players
rostered in or available to the league used to source the data. The league
ID is only needed to give ESPN's player-card endpoint scoring context; any
accessible league works.
"""
import sys
import time
from typing import Dict, Iterator, List, Optional

from espn_api.football import League


class EspnFantasyDataClient:
    def __init__(
        self,
        league_id: int,
        year: int,
        espn_s2: Optional[str] = None,
        swid: Optional[str] = None,
    ):
        self.league = League(league_id=league_id, year=year, espn_s2=espn_s2, swid=swid)

    @property
    def current_week(self) -> int:
        return self.league.current_week

    @property
    def reg_season_weeks(self) -> int:
        return self.league.settings.reg_season_count

    def all_active_player_ids(self) -> Dict[int, str]:
        """Return {player_id: name} for every active NFL player."""
        return {
            player_id: name
            for player_id, name in self.league.player_map.items()
            if isinstance(player_id, int)
        }

    def fetch_players(
        self,
        player_ids: List[int],
        batch_size: int = 300,
        pause_seconds: float = 0.3,
        progress: bool = True,
    ) -> Iterator:
        """Yield fully-populated Player objects (with weekly stats) in batches."""
        total_batches = (len(player_ids) + batch_size - 1) // batch_size
        for batch_num, i in enumerate(range(0, len(player_ids), batch_size), start=1):
            batch = player_ids[i : i + batch_size]
            if progress:
                print(
                    f"Fetching player data: batch {batch_num}/{total_batches} "
                    f"({len(batch)} players)",
                    file=sys.stderr,
                )
            result = self.league.player_info(playerId=batch)
            if result is None:
                continue
            if isinstance(result, list):
                yield from result
            else:
                yield result
            if batch_num < total_batches:
                time.sleep(pause_seconds)
