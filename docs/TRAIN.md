# Train

The website's Train section (`#/train`) teaches the game in three stages: **Openings**,
**Middlegame tactics** and **Endgames**. It runs entirely in the browser; progress is kept in
`localStorage` (`sk.train`).

| Stage | Contents | Source |
|---|---|---|
| Openings | Named openings with a main line, side variations, per-move comments, plans, and general opening principles. Study a line move by move, or practise it: you play your side from memory, the book replies by itself | `web/train/openings.js`, explored with Stockhorse (G25) by `tools/train/openings_explore.py` and `openings_build.py` |
| Middlegame tactics | 367 positions from G25 self-play with one clearly best move or line: mates in 1 to 4, forks, drop tactics, loose pieces, quiet moves, only moves | `web/train/tactics.js`, from `sk-puzzlegen` (`crates/puzzlegen`) and `tools/train/build-tactics.js` |
| Endgames | 270 exact positions from the endgame tablebases (up to 4 pieces, reserves included): stalemate wins, rook and queen endings, rook against pawn, pawn endings, minor pieces, drops from the reserve, holding the draw | `web/train/endgames.js`, from `sk-tb puzzles` (`crates/tb/src/puzzles.rs`) and `tools/train/gen-endgames.js` |

## Solving

- The solver is the side to move. A puzzle's `line` alternates the solver's moves and the best
  defence, and starts and ends with a solver move. The opponent's replies are played for you.
- A wrong move is shown, taken back, and the attempt no longer counts as clean. **Hint** first
  marks the piece to move (or the reserve piece to drop), then shows the move as an arrow.
  **Show solution** plays the rest of the line.
- Some puzzles list other moves that are just as good (`alts`, such as another mate of the same
  length, or another equally fast tablebase win); playing one solves the puzzle. Any move that
  leaves the opponent without a legal move also solves it, since that wins at once in Maki.
- When solved, the panel shows the full line, the explanation and the result, with **Next
  puzzle**, **Try again** and **Analyse** (opens the analysis board with the line).

## Difficulty and rating

Each puzzle has a rating on an Elo-like scale and a level: 1 Beginner (under 1000), 2 Casual
(1000–1300), 3 Club (1300–1600), 4 Expert (1600–1900), 5 Master (1900 and up). Ratings are ranked
heuristics, not yet measured on players:

- Tactics: the search depth at which Stockhorse first finds and keeps the key move, the length of
  the line, quiet moves, drops and sacrifices, and the number of legal moves.
- Endgames: the distance to the win, the line length, a quiet key move, a tempting wrong move,
  zugzwang, drops, and how few moves win.

Each stage keeps a training rating for the player, starting at 1000. The first finished attempt at
a puzzle moves it like a game against the puzzle's rating (K = 40 for the first 20 puzzles, then
24): a clean solve is a win, anything with a wrong move, a hint or the solution a loss. **Start
training** picks unsolved puzzles from the current filter near the player's rating.

## Data format

Each `web/train/*.js` file is a plain script that sets `window.TrainData.<key>` in the browser and
exports the array under node.

```js
{
  id: 'm0001',             // m = middlegame, e = endgame
  fen: '…',                // the solver is the side to move
  line: ['b1c3', 'c6c5', 'R@c4'],
  alts: [['d2d3'], []],    // optional: other accepted moves at each solver step
  rating: 1350, level: 3,
  themes: ['fork', 'drop'], group: 'Forks',
  title: 'Drop fork on d4', goal: 'White to move and win the rook',
  explain: '…', result: 'Wins a rook (+5.1)', source: 'selfplay-g25' | 'tablebase'
}
```

Openings: `{ id, name, family, side, moves, summary, principles, comments: { ply: text },
variations: [{ name, moves, note }], eval }`, plus `TrainData.openingPrinciples` as
`[{ title, text }]`.

## Checks

```sh
node web/test-train.js                       # every FEN loads, every line and variation is legal,
                                             # positions are distinct, levels and texts present
node tools/train/check-puzzles.js web/train/tactics.js web/train/endgames.js
node tools/train/verify-endgames.js tb       # re-probes every endgame line in the tablebases
```

## Regenerating

```sh
cargo build --release
# Middlegame: self-play with G25, MultiPV screening, then a deep re-search of each candidate.
target/release/sk-puzzlegen gen --net g25.nnue --games 400 --threads 2 --seed 1 --out raw.jsonl
node tools/train/build-tactics.js tools/train/tactics-raw/raw0.jsonl tools/train/tactics-raw/raw.jsonl web/train/tactics.js
# Endgames: solve the tables, sample candidates, pick and explain them, verify.
target/release/sk-tb gen --dir tb --max 4
target/release/sk-tb puzzles --dir tb …   > cand.jsonl
node tools/train/gen-endgames.js cand.jsonl
node tools/train/verify-endgames.js tb
```

The explanations are written from templates filled with each position's facts (the key move,
the best defence, the most tempting wrong move and what it allows), so the wording repeats in
places.
