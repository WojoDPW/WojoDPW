"""Scoring and modeling constants for PPR fantasy football forecasts."""

# Raw stat breakdown keys (as produced by espn_api's PLAYER_STATS_MAP) that
# matter for each position. These drive both the recency-weighted per-game
# model in stats_model.py and the scoring formula in scoring.py.
#
# Note: ESPN's public player-card data does not expose snap counts, so
# targets/carries/receptions are used as the closest available proxies for
# a player's game-to-game opportunity/usage trend.
POSITION_STAT_KEYS = {
    "QB": [
        "passingAttempts",
        "passingCompletions",
        "passingYards",
        "passingTouchdowns",
        "passingInterceptions",
        "rushingAttempts",
        "rushingYards",
        "rushingTouchdowns",
        "lostFumbles",
        "passing2PtConversions",
        "rushing2PtConversions",
    ],
    "RB": [
        "rushingAttempts",
        "rushingYards",
        "rushingTouchdowns",
        "receivingTargets",
        "receivingReceptions",
        "receivingYards",
        "receivingTouchdowns",
        "lostFumbles",
        "rushing2PtConversions",
        "receiving2PtConversions",
    ],
    "WR": [
        "receivingTargets",
        "receivingReceptions",
        "receivingYards",
        "receivingTouchdowns",
        "rushingAttempts",
        "rushingYards",
        "rushingTouchdowns",
        "lostFumbles",
        "receiving2PtConversions",
        "rushing2PtConversions",
    ],
    "TE": [
        "receivingTargets",
        "receivingReceptions",
        "receivingYards",
        "receivingTouchdowns",
        "lostFumbles",
        "receiving2PtConversions",
    ],
    "K": [
        "madeFieldGoalsFromUnder40",
        "madeFieldGoalsFrom40To49",
        "madeFieldGoalsFrom50Plus",
        "madeExtraPoints",
    ],
    "D/ST": [
        "defensiveSacks",
        "defensiveInterceptions",
        "defensiveFumbles",
        "defensivePlusSpecialTeamsTouchdowns",
        "defensiveSafeties",
        "defensiveBlockedKicks",
        "defensivePointsAllowed",
    ],
}

# Standard full-PPR offensive scoring (used for QB/RB/WR/TE).
OFFENSE_SCORING = {
    "passingYards": 0.04,        # 1 pt per 25 yards
    "passingTouchdowns": 4.0,
    "passingInterceptions": -2.0,
    "rushingYards": 0.1,         # 1 pt per 10 yards
    "rushingTouchdowns": 6.0,
    "receivingYards": 0.1,       # 1 pt per 10 yards
    "receivingTouchdowns": 6.0,
    "receivingReceptions": 1.0,  # full PPR
    "lostFumbles": -2.0,
    "passing2PtConversions": 2.0,
    "rushing2PtConversions": 2.0,
    "receiving2PtConversions": 2.0,
}

# Kicker scoring, tiered by field goal distance.
KICKER_SCORING = {
    "madeFieldGoalsFromUnder40": 3.0,
    "madeFieldGoalsFrom40To49": 4.0,
    "madeFieldGoalsFrom50Plus": 5.0,
    "madeExtraPoints": 1.0,
}

# D/ST counting-stat scoring.
DST_SCORING = {
    "defensiveSacks": 1.0,
    "defensiveInterceptions": 2.0,
    "defensiveFumbles": 2.0,  # fumble recoveries
    "defensivePlusSpecialTeamsTouchdowns": 6.0,
    "defensiveSafeties": 2.0,
    "defensiveBlockedKicks": 2.0,
}

# D/ST points-allowed tiers: (max_points_allowed_inclusive, fantasy_points).
# Mirrors the PA0/PA1/PA7/PA14/PA18/PA22/PA28/PA35/PA46 tier boundaries
# used by ESPN's own scoring settings (constant.py SETTINGS_SCORING_FORMAT_MAP).
DST_POINTS_ALLOWED_TIERS = [
    (0, 10.0),
    (6, 7.0),
    (13, 4.0),
    (17, 1.0),
    (21, 0.0),
    (27, -1.0),
    (34, -4.0),
    (45, -7.0),
    (float("inf"), -10.0),
]

# Injury-status -> availability multiplier applied to the final projection.
STATUS_MULTIPLIERS = {
    "OUT": 0.0,
    "INJURY_RESERVE": 0.0,
    "IR": 0.0,
    "SUSPENSION": 0.0,
    "DOUBTFUL": 0.25,
    "QUESTIONABLE": 0.85,
    "ACTIVE": 1.0,
}

# Recency-decay applied per week of age (weight = decay ** weeks_ago).
DEFAULT_DECAY = 0.75

# Empirical-Bayes shrinkage strength, in "games worth" of the position prior.
DEFAULT_SHRINK_GAMES = 4.0

CONFIDENCE_THRESHOLDS = {
    "High": 6,
    "Medium": 3,
}
