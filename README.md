# battleship

A browser Battleship game: place your fleet on a 10x10 grid and trade shots with a
computer opponent. Plain HTML, CSS and ES modules — no build step and no runtime
dependencies.

## Play

```sh
npm start        # serves the game at http://localhost:8000
```

Opening `index.html` directly from disk also works in browsers that allow ES
modules over `file://`; the server avoids that restriction.

Place each of the five ships by clicking your own grid (use **Rotate** to switch
orientation, or **Random fleet** to skip placement), then fire by clicking the
enemy grid. The computer replies after every shot: it fires at random until it
finds a ship, then works the cells around the hit.

## Tests

```sh
npm test         # node --test, requires Node 18+
```

The game rules live in `src/game.js` and are covered by `test/game.test.js`;
`src/ui.js` only renders that state to the DOM.
