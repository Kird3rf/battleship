# battleship

Browser Battleship, human against the computer. One page, client side only:
vanilla HTML, CSS and ES modules with no framework, no bundler, no build step
and no runtime dependencies. There is no backend, no account, no network call
and nothing is persisted — reloading starts a fresh game.

## Run it locally

All asset paths are relative, so the repository root is the site root.

```sh
npm start                  # http://localhost:8000 (scripts/serve.js, node:http only)
# or any static server, e.g.
python3 -m http.server 8000
```

A server is needed because browsers refuse ES modules over `file://`.
Deployed to GitHub Pages from the repository root, the same files work as is.

## How to play

1. **Place your fleet.** Click the bow cell of the ship named in the status
   line. Press <kbd>R</kbd> or the **Rotate** button to switch between
   horizontal and vertical; the preview turns green where the ship fits and red
   where it does not. **Random** fills the remaining ships, **Clear** starts the
   placement over. **Start game** stays disabled until all five ships are down.
2. **Fire.** Click a cell on the enemy grid, or move with the arrow keys and
   press <kbd>Enter</kbd> or <kbd>Space</kbd>. Every shot is reported as hit,
   miss, or `Sunk: Cruiser`, and the sidebar tracks whose turn it is and how
   many shots each side has fired.
3. **Finish.** When one fleet is gone the result is shown, the computer's ships
   are revealed and the grids stop accepting clicks. **Play again** resets
   everything, including all ship objects.

## Rules as implemented

- 10x10 grid, columns A to J, rows 1 to 10.
- Fleet per side: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2.
- Ships are horizontal or vertical, lie entirely on the board and never overlap.
  Ships **may** touch.
- Turn order alternates strictly: one player shot, then one computer shot. A hit
  does **not** grant an extra turn.
- Firing at a cell that was already fired at is rejected and does not consume
  the turn.
- A ship sinks only when every one of its cells has been hit, and is announced
  by name.
- The game ends when one side has all five ships sunk.

The computer plays hunt/target. In hunt mode it fires at a random untried cell
on the parity mask `(x + y) % 2 === 0` — the shortest ship is two cells long, so
that mask cannot miss a ship — and falls back to any untried cell if the mask
runs out. A hit queues the four in-bounds, untried orthogonal neighbours; a
second hit in line fixes the axis and discards off-axis candidates in favour of
extending the line. Sinking a ship discards that ship's remaining candidates,
and the empty queue returns it to hunt mode.

Two things are deliberate:

- `src/ai.js` never sees the player's ships. It is given only its own shot
  history and the outcome of each shot.
- The computer's ship positions are held in JavaScript state and never written
  to the DOM before the game ends. Enemy cells are rendered purely from shot
  results, so inspecting the page does not reveal the fleet.

## Accessibility

- Every cell is a focusable button with an `aria-label` giving its coordinate
  and current state (`D4, hit`). The enemy grid uses a roving tab stop, arrow
  keys move between cells and <kbd>Enter</kbd>/<kbd>Space</kbd> fires.
- Shot results are announced in an `aria-live` region.
- Hit, miss and sunk carry a distinct glyph (`✕`, `·`, `✹`) as well as a colour.
- Focus rings are visible, and `prefers-reduced-motion` disables animation.

## File layout

| Path | Contents |
| --- | --- |
| `index.html` | Page structure: two grids, controls, status and log |
| `styles.css` | All styling |
| `src/game.js` | Board, fleet, placement, shots, turn order — no DOM |
| `src/ai.js` | Hunt/target opponent — no DOM, no access to player ships |
| `src/ui.js` | Rendering and event handling, the only module touching the DOM |
| `test/` | Unit tests for the rules and the opponent |
| `scripts/serve.js` | Zero-dependency static server for local play |

## Tests

```sh
npm test          # node --test test/, Node 18 or newer
node --test test/ # same thing without npm
```

No test framework and no dependencies. The suite covers placement (overlap,
off-board and wrap-around rejection, touching allowed, 1000 random fleets),
sink detection on the final cell of every ship length, win detection on exactly
the fifth sinking, strict turn alternation and rejected repeat shots, and the
opponent over 1000 fully simulated games (never repeats a shot, never leaves the
board, always finishes within 100 shots).
