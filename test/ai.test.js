import assert from 'node:assert/strict';
import test from 'node:test';
import { Board, FLEET, HIT, SIZE, SUNK, placeRandomFleet } from '../src/game.js';
import { HUNT, Opponent, TARGET } from '../src/ai.js';

/** Plays a whole game against a random fleet, returning every shot fired. */
function simulate(opponent = new Opponent()) {
  const board = placeRandomFleet(new Board());
  const shots = [];
  while (!board.allSunk) {
    const shot = opponent.nextShot();
    assert.ok(shot, 'opponent always has a cell left to fire at');
    const { outcome } = board.receiveShot(shot.x, shot.y);
    opponent.recordResult(shot, outcome);
    shots.push(shot);
    assert.ok(shots.length <= SIZE * SIZE, 'simulation does not run away');
  }
  return { board, shots };
}

test('hunt mode only fires at untried cells on the parity mask', () => {
  const opponent = new Opponent();
  for (let i = 0; i < 50; i += 1) {
    assert.equal(opponent.mode, HUNT);
    const shot = opponent.nextShot();
    assert.equal((shot.x + shot.y) % 2, 0, 'parity mask');
    opponent.recordResult(shot, 'miss');
  }
  assert.equal(opponent.tried.size, 50);
});

test('hunt falls back to off-parity cells once the mask is exhausted', () => {
  const opponent = new Opponent();
  for (let i = 0; i < 50; i += 1) opponent.recordResult(opponent.nextShot(), 'miss');

  const shot = opponent.nextShot();
  assert.equal((shot.x + shot.y) % 2, 1);
  assert.equal(opponent.tried.size, 51);
});

test('a hit queues the in-bounds orthogonal neighbours', () => {
  const opponent = new Opponent();
  opponent.recordResult({ x: 0, y: 0 }, HIT);

  assert.equal(opponent.mode, TARGET);
  assert.deepEqual(opponent.queue, [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
  ]);
});

test('a second hit in line fixes the axis and drops off-axis candidates', () => {
  const opponent = new Opponent();
  opponent.tried.add('4,4');
  opponent.recordResult({ x: 4, y: 4 }, HIT);
  assert.equal(opponent.queue.length, 4);

  opponent.tried.add('5,4');
  opponent.recordResult({ x: 5, y: 4 }, HIT);

  assert.equal(opponent.axis, 'h');
  assert.ok(opponent.queue.every((c) => c.y === 4), 'only cells on the hit row remain');
  assert.deepEqual(opponent.queue.slice(0, 2), [
    { x: 3, y: 4 },
    { x: 6, y: 4 },
  ]);
});

test('sinking a ship clears its candidates and returns to hunt mode', () => {
  const opponent = new Opponent();
  opponent.tried.add('4,4');
  opponent.recordResult({ x: 4, y: 4 }, HIT);
  opponent.tried.add('4,5');
  opponent.recordResult({ x: 4, y: 5 }, SUNK);

  assert.deepEqual(opponent.queue, []);
  assert.deepEqual(opponent.hits, []);
  assert.equal(opponent.axis, null);
  assert.equal(opponent.mode, HUNT);
});

test('the opponent never fires out of bounds', () => {
  const { shots } = simulate();
  for (const shot of shots) {
    assert.ok(shot.x >= 0 && shot.x < SIZE, `x in bounds: ${shot.x}`);
    assert.ok(shot.y >= 0 && shot.y < SIZE, `y in bounds: ${shot.y}`);
  }
});

test('the opponent never repeats a shot, over 1000 simulated games', () => {
  for (let run = 0; run < 1000; run += 1) {
    const { shots } = simulate();
    const seen = new Set();
    for (const { x, y } of shots) {
      const cell = `${x},${y}`;
      assert.equal(seen.has(cell), false, `repeat shot at ${cell} in run ${run}`);
      seen.add(cell);
    }
  }
});

test('the opponent finishes a game within 100 shots, over 1000 runs', () => {
  for (let run = 0; run < 1000; run += 1) {
    const { board, shots } = simulate();
    assert.equal(board.allSunk, true, `run ${run} finished`);
    assert.ok(shots.length <= 100, `run ${run} used ${shots.length} shots`);
  }
});

test('targeting beats pure chance: the average game is well under 100 shots', () => {
  let total = 0;
  const runs = 200;
  for (let run = 0; run < runs; run += 1) total += simulate().shots.length;

  const fleetCells = FLEET.reduce((sum, s) => sum + s.size, 0);
  const average = total / runs;
  assert.ok(average > fleetCells, `average ${average} is plausible`);
  assert.ok(average < 80, `average ${average} beats undirected firing`);
});

test('the opponent is reusable after a reset', () => {
  const opponent = new Opponent();
  simulate(opponent);
  opponent.reset();

  assert.equal(opponent.tried.size, 0);
  assert.deepEqual(opponent.queue, []);
  assert.equal(opponent.mode, HUNT);
  const { board } = simulate(opponent);
  assert.equal(board.allSunk, true);
});
