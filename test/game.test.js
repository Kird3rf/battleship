import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOARD_SIZE,
  Board,
  CELL,
  ComputerPlayer,
  FLEET,
  Game,
  coordsFor,
  placeFleetRandomly,
} from '../src/game.js';

/** Deterministic stand-in for Math.random. */
function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('coordsFor lays cells out horizontally and vertically', () => {
  assert.deepEqual(coordsFor({ row: 1, col: 2, size: 3, horizontal: true }), [
    { row: 1, col: 2 },
    { row: 1, col: 3 },
    { row: 1, col: 4 },
  ]);
  assert.deepEqual(coordsFor({ row: 1, col: 2, size: 2, horizontal: false }), [
    { row: 1, col: 2 },
    { row: 2, col: 2 },
  ]);
});

test('ships must fit on the board and may not overlap', () => {
  const board = new Board();
  board.place({ name: 'Destroyer', row: 0, col: 0, size: 2, horizontal: true });

  assert.equal(board.canPlace({ row: 0, col: 9, size: 2, horizontal: true }), false);
  assert.equal(board.canPlace({ row: 9, col: 0, size: 2, horizontal: false }), false);
  assert.equal(board.canPlace({ row: 0, col: 1, size: 3, horizontal: true }), false);
  assert.equal(board.canPlace({ row: 1, col: 0, size: 3, horizontal: true }), true);
  assert.throws(() => board.place({ name: 'Cruiser', row: 0, col: 0, size: 3, horizontal: false }));
});

test('attacks report miss, hit and sunk', () => {
  const board = new Board();
  board.place({ name: 'Destroyer', row: 2, col: 2, size: 2, horizontal: true });

  assert.equal(board.receiveAttack(0, 0).result, CELL.MISS);
  assert.equal(board.receiveAttack(2, 2).result, CELL.HIT);
  const last = board.receiveAttack(2, 3);
  assert.equal(last.result, CELL.SUNK);
  assert.equal(last.ship.name, 'Destroyer');
  assert.equal(board.allSunk, true);
});

test('repeated and out of bounds shots are rejected', () => {
  const board = new Board();
  board.receiveAttack(5, 5);
  assert.throws(() => board.receiveAttack(5, 5), /Already fired/);
  assert.throws(() => board.receiveAttack(-1, 0), /out of bounds/);
  assert.throws(() => board.receiveAttack(0, BOARD_SIZE), /out of bounds/);
});

test('cellState hides unhit enemy ships but shows shot results', () => {
  const board = new Board();
  board.place({ name: 'Destroyer', row: 0, col: 0, size: 2, horizontal: true });

  assert.equal(board.cellState(0, 0), CELL.EMPTY);
  assert.equal(board.cellState(0, 0, true), CELL.SHIP);
  board.receiveAttack(0, 0);
  assert.equal(board.cellState(0, 0), CELL.HIT);
  board.receiveAttack(0, 1);
  assert.equal(board.cellState(0, 1), CELL.SUNK);
  board.receiveAttack(5, 5);
  assert.equal(board.cellState(5, 5), CELL.MISS);
});

test('random placement puts the whole fleet on the board without overlaps', () => {
  const board = placeFleetRandomly(new Board());
  assert.equal(board.ships.length, FLEET.length);
  assert.equal(board.isFullyPlaced, true);

  const occupied = new Set();
  for (const ship of board.ships) {
    for (const c of ship.coords) {
      assert.ok(board.inBounds(c.row, c.col));
      occupied.add(`${c.row},${c.col}`);
    }
  }
  const cells = FLEET.reduce((sum, s) => sum + s.size, 0);
  assert.equal(occupied.size, cells);
});

test('computer hunts around a hit before probing elsewhere', () => {
  const board = new Board();
  board.place({ name: 'Destroyer', row: 4, col: 4, size: 2, horizontal: true });
  const computer = new ComputerPlayer(BOARD_SIZE, sequence([0]));
  // Force the first shot onto the ship, then let the targeting queue take over.
  computer.targets.push({ row: 4, col: 4 });

  const first = computer.fire(board);
  assert.equal(first.result, CELL.HIT);
  assert.ok(computer.targets.length > 0);
  assert.ok(
    computer.targets.every(
      (t) => Math.abs(t.row - 4) + Math.abs(t.col - 4) === 1,
    ),
  );

  const follow = computer.nextShot(board);
  assert.equal(Math.abs(follow.row - 4) + Math.abs(follow.col - 4), 1);
});

test('computer clears its target queue once a ship is sunk', () => {
  const board = new Board();
  board.place({ name: 'Destroyer', row: 0, col: 0, size: 2, horizontal: true });
  const computer = new ComputerPlayer(BOARD_SIZE, sequence([0]));
  computer.targets.push({ row: 0, col: 0 }, { row: 0, col: 1 });

  computer.fire(board);
  const sunk = computer.fire(board);
  assert.equal(sunk.result, CELL.SUNK);
  assert.deepEqual(computer.targets, []);
});

test('computer never repeats a shot and eventually sinks everything', () => {
  const board = placeFleetRandomly(new Board());
  const computer = new ComputerPlayer(BOARD_SIZE);
  const seen = new Set();

  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE && !board.allSunk; i += 1) {
    const shot = computer.fire(board);
    const key = `${shot.row},${shot.col}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
  assert.equal(board.allSunk, true);
});

test('game placement phase walks the fleet then starts the battle', () => {
  const game = new Game();
  assert.equal(game.phase, 'placement');
  assert.equal(game.nextShipToPlace.name, FLEET[0].name);

  FLEET.forEach((ship, i) => game.placePlayerShip(i, 0, true));

  assert.equal(game.phase, 'battle');
  assert.equal(game.nextShipToPlace, null);
  assert.equal(game.playerBoard.isFullyPlaced, true);
  assert.throws(() => game.placePlayerShip(0, 0, true), /Placement is over/);
});

test('firing before the battle phase is rejected', () => {
  const game = new Game();
  assert.throws(() => game.playerFire(0, 0), /not in battle phase/);
});

test('player shot is answered by the computer and logged', () => {
  const game = new Game();
  game.randomisePlayerFleet();

  const { player, computer } = game.playerFire(0, 0);
  assert.ok([CELL.MISS, CELL.HIT, CELL.SUNK].includes(player.result));
  assert.ok(computer);
  assert.equal(game.playerBoard.hasShot(computer.row, computer.col), true);
  assert.equal(game.log.length, 2);
});

test('sinking the enemy fleet ends the game before the computer replies', () => {
  const game = new Game();
  game.randomisePlayerFleet();

  const enemyCells = game.computerBoard.ships.flatMap((s) => s.coords);
  let shotsBack = 0;
  for (const { row, col } of enemyCells) {
    const { computer } = game.playerFire(row, col);
    if (computer) shotsBack += 1;
  }

  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 'player');
  assert.equal(shotsBack, enemyCells.length - 1);
  assert.throws(() => game.playerFire(0, 1), /not in battle phase/);
});

test('losing the fleet makes the computer the winner', () => {
  const game = new Game();
  game.randomisePlayerFleet();
  for (const ship of game.playerBoard.ships) {
    for (const { row, col } of ship.coords) {
      if (!game.playerBoard.hasShot(row, col)) game.playerBoard.receiveAttack(row, col);
    }
  }
  // Leave one player cell for the computer's reply to finish the job.
  const last = game.playerBoard.ships[0].coords[0];
  game.playerBoard.shots.delete(`${last.row},${last.col}`);
  game.playerBoard.ships[0].hits -= 1;
  game.computer.targets.push(last);

  const open = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!game.computerBoard.hasShot(row, col)) open.push({ row, col });
    }
  }
  game.playerFire(open[0].row, open[0].col);

  assert.equal(game.phase, 'over');
  assert.equal(game.winner, 'computer');
});

test('reset deals a fresh board and fleet', () => {
  const game = new Game();
  game.randomisePlayerFleet();
  game.playerFire(0, 0);
  game.reset();

  assert.equal(game.phase, 'placement');
  assert.equal(game.winner, null);
  assert.deepEqual(game.log, []);
  assert.equal(game.playerBoard.ships.length, 0);
  assert.equal(game.computerBoard.isFullyPlaced, true);
  assert.equal(game.computerBoard.shots.size, 0);
});
