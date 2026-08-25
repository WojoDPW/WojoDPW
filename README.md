# fantasy-forecast

A command-line tool that generates week-to-week full-PPR fantasy football
scoring forecasts for every active NFL player, using [espn-api](https://github.com/cwendt94/espn-api)
(pinned to `0.46.0`) as the data source.

## How it sources "all active NFL players"

`espn-api`'s `League` object is built around a single fantasy league, but its
player list (`League.player_map`) actually comes from ESPN's
`/players` endpoint with `filterActive: true` — every active NFL player,
not just players rostered in or available to that one league. This tool
uses that fact: you point it at any accessible ESPN league (a public league
works fine, no login required) purely to get scoring/API context, then it
pulls the full active-player universe and fetches each player's own
season-to-date weekly stat lines via ESPN's player-card endpoint.

## Install

```bash
pip install -r requirements.txt
# or, to install the `fantasy-forecast` console script:
pip install -e .
```

## Usage

```bash
python -m fantasy_forecast --league-id 123456 --year 2026 --out forecasts.csv
```

or, if installed as a package:

```bash
fantasy-forecast --league-id 123456 --year 2026 --out forecasts.csv
```

Useful flags:

| Flag | Description |
|---|---|
| `--league-id` (required) | Any accessible ESPN league ID. |
| `--year` (required) | NFL season year, e.g. `2026`. |
| `--week` | Week to forecast. Defaults to the league's current week. |
| `--espn-s2` / `--swid` | Cookies for a private league (or set `ESPN_S2` / `ESPN_SWID` env vars). |
| `--positions` | Comma list to restrict output, e.g. `QB,RB,WR,TE`. |
| `--format` | `csv` or `json`. Inferred from `--out`'s extension otherwise. |
| `--decay` | Recency decay per week of age (default `0.75`). Lower = more recency-weighted. |
| `--shrink-games` | Shrinkage strength toward the position average, in "games worth" (default `4.0`). |
| `--top N` | Also print the top N forecasts to the console. |

Example: forecast next week for a private league, kickers and defenses excluded:

```bash
export ESPN_S2="..."
export ESPN_SWID="{...}"
python -m fantasy_forecast --league-id 123456 --year 2026 \
    --positions QB,RB,WR,TE --out week_forecast.json
```

## Methodology

For every player, and separately for every stat category relevant to their
position (targets, carries, receptions, completions, yards, touchdowns,
interceptions, made field goals by distance, sacks, etc.):

1. **Recency-weighted average.** Each of the player's own games this season
   is weighted `decay ** weeks_ago`, so recent games (a usage bump, a new
   role) count more than early-season games.
2. **Shrinkage toward the position average.** That per-player weighted rate
   is blended with the league-wide weighted-average rate for the same stat
   at the same position, in proportion to how many games the player has
   actually played (`--shrink-games` sets how many games' worth of prior to
   blend in). A player with 1-2 games of data leans heavily on the position
   average; a player with a full season of data is barely nudged by it.
   This keeps small samples (rookies, recent call-ups, early-season weeks)
   from producing wild single-game extrapolations.
3. **Scoring.** The blended per-game stat line is scored with a fixed,
   standard full-PPR formula (see below) — independent of whatever scoring
   rules the source league actually uses.
4. **Availability adjustment.** The scored projection is then multiplied by
   an availability factor: `0` for `BYE`/`OUT`/`IR`/`SUSPENSION`, `0.25` for
   `DOUBTFUL`, `0.85` for `QUESTIONABLE`, `1.0` otherwise.

Positions are modeled independently (QB, RB, WR, TE, K, D/ST each use their
own relevant stat categories); any other ESPN roster slot (P, HC, etc.) is
skipped as unsupported.

### Scoring formula (full PPR)

- Passing: 0.04 pt/yard, 4 pt/TD, -2 pt/INT
- Rushing: 0.1 pt/yard, 6 pt/TD
- Receiving: 0.1 pt/yard, 6 pt/TD, **1 pt/reception**
- Fumbles lost: -2
- 2-point conversions: +2
- Kicking: 3 pt (<40 yd FG), 4 pt (40-49 yd), 5 pt (50+ yd), 1 pt/XP
- D/ST: 1 pt/sack, 2 pt/INT, 2 pt/fumble recovery, 6 pt/TD, 2 pt/safety,
  2 pt/blocked kick, plus a points-allowed tier bonus (+10 for a shutout
  down to -10 for 46+ allowed)

## Known limitations

- **No snap counts.** ESPN's public player-card data doesn't expose snap
  share, so target/carry/reception volume is used as the closest available
  proxy for a player's opportunity trend.
- **No opponent/matchup adjustment.** Forecasts aren't adjusted for the
  upcoming opponent's defensive strength against the position.
- **Cold start.** In week 1 (or for a player with zero games this season),
  there's no current-season data to weight, so the projection is entirely
  the position-average prior. Pulling in prior-season data as an additional
  fallback prior would be a natural extension.
- Requires network access to ESPN's fantasy API (`lm-api-reads.fantasy.espn.com`
  and `site.api.espn.com`); it will not run in a network-sandboxed environment.

## Tests

```bash
python -m unittest discover -s tests -v
```

All tests run against synthetic in-memory data and don't require network
access.

## Draft board

[`draft_board/index.html`](draft_board/index.html) is a self-contained draft
board built from this tool's forecast output (`ffPts`), plus ADP, strength
of schedule, and health data. It's a single static HTML file — no build
step, no server-side code — that anyone can open directly in a browser.

It supports position tabs, a combined "Best Available" board, a personal
watch list, name search, a round filter, and marking players as drafted (by
you, by someone else, or as a keeper — keepers don't count against the live
round/pick tracker).

**Shared state** (who's drafted, league settings) syncs in real time through
a small [Firestore](https://firebase.google.com/docs/firestore) database —
every viewer with the page open sees every mark within moments, with no
login required. Personal state (your watch list, which tab you're on) stays
local to your own browser via `localStorage`/`sessionStorage` and is never
shared. The Firebase project config embedded in the page is a public client
identifier, not a secret; actual access is scoped by
[`draft_board/firestore.rules`](draft_board/firestore.rules).

### Hosting it

1. Create a free Firebase project, enable **Firestore Database** (start in
   test mode), then paste `draft_board/firestore.rules` into
   **Firestore Database → Rules → Publish**.
2. Register a web app in that project and drop its config object into the
   `firebaseConfig` constant near the top of `draft_board/index.html`'s
   script (already done for the `draft-board-a5366` project this board
   currently points at — swap it if you fork this for a different league).
3. Serve the file anywhere static — **GitHub Pages** is the path of least
   resistance since it's already in this repo: repo **Settings → Pages →
   Deploy from a branch**, pick the branch containing this file, and share
   the resulting URL with your co-manager(s). No Firebase Hosting, no CLI
   login, no server to run.

This is a living tool, not a point-in-time snapshot: draft marks and league
settings live in Firestore, not baked into the file, so the same deployed
page carries forward from draft to draft. To reset for a new season, use
the in-app "Clear all draft marks" control rather than editing the file.
