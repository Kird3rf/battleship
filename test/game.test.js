import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Board,
  FLEET,
  Game,
  HIT,
  MISS,
  SIZE,
  SUNK,
  cellName,
  placeRandomFleet,
  shipCells,
} from '../src/game.js';
import { Opponent } from '../src/ai.js';

test('coordinates are labelled A-J by 1-10', () => {
  assert.equal(cellName(0, 0), 'A1');
  assert.equal(cellName(9, 9), 'J10');
  assert.equal(cellName(2, 4), 'C5');
});

test('placement rejects overlapping ships', () => {
  const board = new Board();
  board.place('Cruiser', 3, 2, 2, true); // C3-E3

  assert.equal(board.canPlace(2, 2, 2, true), false);
  assert.equal(board.canPlace(4, 2, 4, true), false); // overlaps the stern
  assert.equal(board.canPlace(3, 0, 5, false), false); // crosses the hull
  assert.throws(() => board.place('Destroyer', 2, 3, 2, true), /Invalid placement/);
  assert.equal(board.ships.length, 1);
});

test('placement rejects ships running off any edge, including wrap-around', () => {
  const board = new Board();

  assert.equal(board.canPlace(7, 0, 4, true), false); // off the right edge
  assert.equal(board.canPlace(0, 7, 4, false), false); // off the bottom edge
  assert.equal(board.canPlace(-1, 0, 2, true), false);
  assert.equal(board.canPlace(0, -1, 2, false), false);

  // A ship starting near the right edge must not wrap onto the next row.
  assert.equal(board.canPlace(9, 3, 2, true), false);
  const wrapped = shipCells(9, 3, 2, true);
  assert.deepEqual(wrapped[1], { x: 10, y: 3 }); // stays on row 4, off-board
});

test('placement accepts ships that touch', () => {
  const board = new Board();
  board.place('Cruiser', 3, 2, 2, true); // C3-E3

  assert.equal(board.canPlace(5, 2, 2, true), true); // nose to tail
  assert.equal(board.canPlace(2, 3, 3, true), true); // side by side
  assert.equal(board.canPlace(2, 1, 3, true), true);
  board.place('Destroyer', 2, 5, 2, true);
  board.place('Submarine', 3, 2, 3, true);
  assert.equal(board.ships.length, 3);
});

test('random placement places all five ships, over 1000 runs', () => {
  const cells = FLEET.reduce((sum, s) => sum + s.size, 0);
  for (let run = 0; run < 1000; run += 1) {
    const board = placeRandomFleet(new Board());
    assert.equal(board.ships.length, FLEET.length);

    const occupied = new Set();
    for (const ship of board.ships) {
      assert.equal(ship.cells.length, ship.size);
      for (const c of ship.cells) {
        assert.ok(c.x >= 0 && c.x < SIZE && c.y >= 0 && c.y < SIZE, 'ship stays on the board');
        occupied.add(`${c.x},${c.y}`);
      }
    }
    assert.equal(occupied.size, cells, 'no two ships overlap');
  }
});

test('sink detection fires exactly on the final cell, for every ship length', () => {
  for (const { name, size } of FLEET) {
    const board = new Board();
    const ship = board.place(name, size, 0, 0, true);

    ship.cells.forEach((c, i) => {
      const { outcome } = board.receiveShot(c.x, c.y);
      const last = i === size - 1;
      assert.equal(outcome, last ? SUNK : HIT, `${name} cell ${i + 1}/${size}`);
      assert.equal(board.isSunk(ship), last);
    });
  }
});

test('a miss never sinks a ship and hits are recorded per cell', () => {
  const board = new Board();
  const ship = board.place('Destroyer', 2, 4, 4, false);

  assert.equal(board.receiveShot(0, 0).outcome, MISS);
  assert.equal(board.shotResult(0, 0), MISS);
  assert.equal(board.receiveShot(4, 4).outcome, HIT);
  assert.equal(board.shotResult(4, 4), HIT);
  assert.equal(board.isSunk(ship), false);
  assert.equal(board.receiveShot(4, 5).outcome, SUNK);
  assert.equal(board.allSunk, true);
});

test('win detection fires exactly when the fifth ship sinks, not before', () => {
  const board = placeRandomFleet(new Board());
  const ships = [...board.ships];

  ships.forEach((ship, index) => {
    ship.cells.forEach((c, i) => {
      const { outcome } = board.receiveShot(c.x, c.y);
      const lastCell = i === ship.size - 1;
      const lastShip = index === ships.length - 1;
      assert.equal(outcome, lastCell ? SUNK : HIT);
      assert.equal(board.allSunk, lastCell && lastShip);
    });
  });
  assert.equal(board.allSunk, true);
});

test('start is blocked until all five ships are placed', () => {
  const game = new Game({ opponent: new Opponent() });

  FLEET.forEach((ship, i) => {
    assert.equal(game.canStart, false);
    assert.equal(game.start(), false);
    assert.equal(game.nextShip.name, ship.name);
    assert.equal(game.placeNextShip(0, i, true).ok, true);
  });

  assert.equal(game.canStart, true);
  assert.equal(game.start(), true);
  assert.equal(game.phase, 'playing');
  assert.equal(game.placeNextShip(0, 9, true).ok, false);
});

test('placement helpers refuse invalid cells and support random and clear', () => {
  const game = new Game({ opponent: new Opponent() });

  const offBoard = game.placeNextShip(7, 0, true); // Carrier is 5 long
  assert.deepEqual(offBoard, { ok: false, reason: 'invalid' });

  game.placeNextShip(0, 0, true);
  const overlap = game.placeNextShip(0, 0, true);
  assert.equal(overlap.ok, false);

  game.placeRemainingRandomly();
  assert.equal(game.playerBoard.isComplete, true);
  game.clearPlacement();
  assert.equal(game.playerBoard.ships.length, 0);
  assert.equal(game.canStart, false);
});

test('turns alternate strictly and a hit grants no extra shot', () => {
  const game = startedGame();
  const enemyShip = game.enemyBoard.ships[0];

  const hit = game.fireAtEnemy(enemyShip.cells[0].x, enemyShip.cells[0].y);
  assert.equal(hit.outcome, HIT);
  assert.equal(game.turn, 'computer');

  const secondAttempt = game.fireAtEnemy(enemyShip.cells[1].x, enemyShip.cells[1].y);
  assert.deepEqual(secondAttempt, { ok: false, reason: 'turn' });

  assert.equal(game.fireAtPlayer().ok, true);
  assert.equal(game.turn, 'player');
  assert.deepEqual(game.fireAtPlayer(), { ok: false, reason: 'turn' });
  assert.equal(game.playerShots, 1);
  assert.equal(game.computerShots, 1);
});

test('a repeat shot is rejected and does not consume the turn', () => {
  const game = startedGame();
  const target = firstEmptyCell(game.enemyBoard);
  game.fireAtEnemy(target.x, target.y);
  game.fireAtPlayer();

  const repeat = game.fireAtEnemy(target.x, target.y);
  assert.deepEqual(repeat, { ok: false, reason: 'repeat' });
  assert.equal(game.turn, 'player', 'turn is kept');
  assert.equal(game.playerShots, 1, 'shot count is unchanged');

  const next = firstEmptyCell(game.enemyBoard);
  assert.equal(game.fireAtEnemy(next.x, next.y).ok, true);
});

test('off-board shots are rejected', () => {
  const game = startedGame();
  assert.deepEqual(game.fireAtEnemy(-1, 0), { ok: false, reason: 'bounds' });
  assert.deepEqual(game.fireAtEnemy(0, SIZE), { ok: false, reason: 'bounds' });
  assert.equal(game.playerShots, 0);
});

test('the game ends when the enemy fleet sinks, before the computer replies', () => {
  const game = startedGame();
  const targets = game.enemyBoard.ships.flatMap((s) => s.cells);

  targets.forEach((c, i) => {
    const shot = game.fireAtEnemy(c.x, c.y);
    assert.equal(shot.ok, true);
    if (i < targets.length - 1) assert.equal(game.fireAtPlayer().ok, true);
  });

  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 'player');
  assert.equal(game.computerShots, targets.length - 1, 'no reply after the losing shot');
  assert.deepEqual(game.fireAtPlayer(), { ok: false, reason: 'turn' });
});

test('play again resets every piece of state, including ship objects', () => {
  const game = startedGame();
  const oldEnemyShips = game.enemyBoard.ships;
  game.fireAtEnemy(0, 0);
  game.fireAtPlayer();
  game.reset();

  assert.equal(game.phase, 'placement');
  assert.equal(game.turn, 'player');
  assert.equal(game.winner, null);
  assert.equal(game.playerShots, 0);
  assert.equal(game.computerShots, 0);
  assert.equal(game.playerBoard.ships.length, 0);
  assert.equal(game.playerBoard.shots.size, 0);
  assert.equal(game.enemyBoard.shots.size, 0);
  assert.equal(game.enemyBoard.ships.length, FLEET.length);
  assert.notEqual(game.enemyBoard.ships, oldEnemyShips);
  assert.ok(game.enemyBoard.ships.every((s) => s.hits === 0));
  assert.equal(game.opponent.tried.size, 0);
});

function startedGame() {
  const game = new Game({ opponent: new Opponent() });
  game.placeRemainingRandomly();
  game.start();
  return game;
}

function firstEmptyCell(board) {
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!board.wasShot(x, y)) return { x, y };
    }
  }
  throw new Error('board is full');
}
