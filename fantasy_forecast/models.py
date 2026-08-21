"""Plain data containers shared across the forecast pipeline."""
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class PlayerForecast:
    player_id: int
    name: str
    position: str
    pro_team: str
    target_week: int
    projected_points: float
    status: str
    games_used: int
    confidence: str
    projected_stat_line: Dict[str, float] = field(default_factory=dict)
    percent_owned: Optional[float] = None
