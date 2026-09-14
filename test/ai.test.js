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
    const { outcome, ship } = board.receiveShot(shot.x, shot.y);
    opponent.recordResult(shot, outcome, ship && { name: ship.name, size: ship.size });
    shots.push({ ...shot, outcome });
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

test('a closed line of hits is worked from the sides before hunting resumes', () => {
  const opponent = new Opponent();
  // Two ships touching: a Carrier along row 2 and a Battleship along row 3.
  // Hitting one cell of each looks like a vertical ship; closing that column
  // at both ends must not end the pursuit, because both ships are still afloat.
  play(opponent, [
    [{ x: 5, y: 1 }, HIT], // F2
    [{ x: 5, y: 0 }, 'miss'], // F1
    [{ x: 5, y: 2 }, HIT], // F3
    [{ x: 5, y: 3 }, 'miss'], // F4
  ]);

  assert.equal(opponent.mode, TARGET, 'two damaged ships are still open');

  const sides = new Set(['4,1', '6,1', '4,2', '6,2']); // E2, G2, E3, G3
  for (let i = 0; i < 4; i += 1) {
    const shot = opponent.nextShot();
    assert.ok(
      sides.delete(`${shot.x},${shot.y}`),
      `shot ${i + 1} probes a neighbour of the unsunk hits, got ${shot.x},${shot.y}`,
    );
    opponent.recordResult(shot, 'miss');
  }

  assert.equal(opponent.axis, null, 'the line axis is dropped once it closes');
  assert.equal(opponent.mode, HUNT, 'only now, with every neighbour tried, hunt resumes');
});

test('hits stop being targets once their ship is announced sunk', () => {
  const opponent = new Opponent();
  play(opponent, [
    [{ x: 5, y: 1 }, HIT], // F2
    [{ x: 5, y: 2 }, HIT], // F3, the touching neighbour
    [{ x: 5, y: 3 }, 'miss'], // F4
    [{ x: 5, y: 0 }, SUNK, { name: 'Destroyer', size: 2 }], // F1 completes F1-F2
  ]);

  assert.deepEqual(
    opponent.unsunk,
    [{ x: 5, y: 2 }],
    'only the hit outside the sunk ship stays a target',
  );
  assert.ok(
    opponent.queue.every((c) => Math.abs(c.x - 5) + Math.abs(c.y - 2) === 1),
    'candidates belonging to the sunk ship are discarded',
  );
});

/** Fires a scripted sequence, marking each cell tried as `nextShot` would. */
function play(opponent, sequence) {
  for (const [cell, outcome, ship] of sequence) {
    opponent.tried.add(`${cell.x},${cell.y}`);
    opponent.recordResult(cell, outcome, ship);
  }
}

test('a fresh hit is always followed up, over 200 simulated games', () => {
  for (let run = 0; run < 200; run += 1) {
    const { shots } = simulate();
    const tried = new Set();
    let open = []; // hits on the ship currently being worked

    shots.forEach((shot, i) => {
      tried.add(`${shot.x},${shot.y}`);
      const adjacent = open.some((h) => Math.abs(h.x - shot.x) + Math.abs(h.y - shot.y) === 1);
      if (shot.outcome === SUNK || !adjacent) open = []; // sunk, or back to hunting
      if (shot.outcome !== HIT) return;
      open.push(shot);
      const next = shots[i + 1];
      // Once two hits line up the opponent deliberately ignores off-axis cells,
      // so only a first, unresolved hit must be pursued.
      if (!next || open.length !== 1) return;

      const followUps = neighbours(shot).filter((c) => !tried.has(`${c.x},${c.y}`));
      if (followUps.length === 0) return;
      assert.ok(
        followUps.some((c) => c.x === next.x && c.y === next.y),
        `run ${run}: hit at ${shot.x},${shot.y} was abandoned for ${next.x},${next.y}`,
      );
    });
  }
});

function neighbours({ x, y }) {
  return [
    { x, y: y - 1 },
    { x, y: y + 1 },
    { x: x - 1, y },
    { x: x + 1, y },
  ].filter((c) => c.x >= 0 && c.y >= 0 && c.x < SIZE && c.y < SIZE);
}

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
