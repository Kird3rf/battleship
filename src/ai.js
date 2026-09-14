// Opponent logic. No DOM access, and no knowledge of the player's ships:
// it only ever sees its own shot history and the result of each shot.

import { SIZE, HIT, SUNK, key, inBounds } from './game.js';

export const HUNT = 'hunt';
export const TARGET = 'target';

/**
 * Hunt/target opponent.
 *
 * Hunt fires at a random untried cell on the parity mask ((x + y) even), which
 * cannot miss a ship because the shortest ship is 2 cells long. A hit switches
 * to target mode: the orthogonal neighbours are queued, and once a second hit
 * lines up, off-axis candidates are dropped in favour of extending the line.
 *
 * Ships may touch, so a line of hits is not necessarily one ship. A hit stays
 * a target until a ship is announced sunk; whenever the queue runs dry the axis
 * is dropped and the queue is rebuilt from the neighbours of every hit that has
 * not been accounted for by a sinking.
 */
export class Opponent {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.tried = new Set();
    this.queue = []; // { x, y } candidates, newest first
    this.hits = []; // hits of the current line, used to infer the axis
    this.unsunk = []; // every hit not yet accounted for by a sinking
    this.axis = null; // 'h' | 'v' once inferred
  }

  get mode() {
    const live = (c) => !this.hasTried(c.x, c.y);
    if (this.queue.some(live)) return TARGET;
    return this.unsunk.some((h) => this.neighbours(h).length > 0) ? TARGET : HUNT;
  }

  hasTried(x, y) {
    return this.tried.has(key(x, y));
  }

  /** Next cell to fire at, marked as tried so it can never be picked again. */
  nextShot() {
    let shot = this.takeFromQueue();
    if (!shot) {
      // The line is exhausted but the damage is not: drop the axis and come at
      // the unsunk hits from every remaining side before hunting again.
      this.requeueUnsunk();
      shot = this.takeFromQueue() ?? this.hunt();
    }
    if (!shot) return null;
    this.tried.add(key(shot.x, shot.y));
    return shot;
  }

  takeFromQueue() {
    while (this.queue.length > 0) {
      const candidate = this.queue.shift();
      if (!this.hasTried(candidate.x, candidate.y)) return candidate;
    }
    return null;
  }

  requeueUnsunk() {
    this.hits = [];
    this.axis = null;
    this.queue = dedupe(this.unsunk.flatMap((h) => this.neighbours(h)));
  }

  hunt() {
    const parity = [];
    const rest = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (this.hasTried(x, y)) continue;
        ((x + y) % 2 === 0 ? parity : rest).push({ x, y });
      }
    }
    const pool = parity.length > 0 ? parity : rest;
    if (pool.length === 0) return null;
    return pool[Math.floor(this.random() * pool.length)];
  }

  /**
   * Feeds back the outcome of the shot returned by `nextShot`. `ship` carries
   * the size of a ship that has just sunk, which is all that is needed to tell
   * its cells apart from those of a ship touching it.
   */
  recordResult(shot, outcome, ship = null) {
    if (outcome !== HIT && outcome !== SUNK) return;
    this.unsunk.push(shot);

    if (outcome === SUNK) {
      const sunk = this.sunkCells(shot, ship?.size);
      this.unsunk = this.unsunk.filter((h) => !sunk.has(key(h.x, h.y)));
      this.requeueUnsunk();
      return;
    }

    this.hits.push(shot);
    this.inferAxis();
    if (this.axis) {
      this.queue = this.queue.filter((c) => this.onAxis(c));
      this.queue.unshift(...this.lineEnds());
    } else {
      this.queue.unshift(...this.neighbours(shot));
    }
    this.queue = dedupe(this.queue).filter((c) => !this.hasTried(c.x, c.y));
  }

  inferAxis() {
    if (this.hits.length < 2) return;
    if (this.hits.every((h) => h.y === this.hits[0].y)) this.axis = 'h';
    else if (this.hits.every((h) => h.x === this.hits[0].x)) this.axis = 'v';
  }

  onAxis({ x, y }) {
    const [first] = this.hits;
    return this.axis === 'h' ? y === first.y : x === first.x;
  }

  /** The two cells extending the current line of hits. */
  lineEnds() {
    const [first] = this.hits;
    const along = this.hits.map((h) => (this.axis === 'h' ? h.x : h.y));
    const low = Math.min(...along) - 1;
    const high = Math.max(...along) + 1;
    const ends = this.axis === 'h'
      ? [{ x: low, y: first.y }, { x: high, y: first.y }]
      : [{ x: first.x, y: low }, { x: first.x, y: high }];
    return ends.filter((c) => inBounds(c.x, c.y) && !this.hasTried(c.x, c.y));
  }

  neighbours({ x, y }) {
    return [
      { x, y: y - 1 },
      { x, y: y + 1 },
      { x: x - 1, y },
      { x: x + 1, y },
    ].filter((c) => inBounds(c.x, c.y) && !this.hasTried(c.x, c.y));
  }

  /**
   * The cells of the ship the sinking shot completed: the contiguous run of
   * unsunk hits through that cell. Touching ships share a line, so the run is
   * read along one axis only, preferring the one already inferred.
   */
  sunkCells(shot, size) {
    const hit = new Set(this.unsunk.map((h) => key(h.x, h.y)));
    const run = (dx, dy) => {
      const cells = [shot];
      for (const step of [1, -1]) {
        for (let i = 1; hit.has(key(shot.x + dx * i * step, shot.y + dy * i * step)); i += 1) {
          cells.push({ x: shot.x + dx * i * step, y: shot.y + dy * i * step });
        }
      }
      return cells;
    };

    const horizontal = run(1, 0);
    const vertical = run(0, 1);
    const line = horizontal.length === vertical.length
      ? (this.axis === 'v' ? vertical : horizontal)
      : (horizontal.length > vertical.length ? horizontal : vertical);

    // A longer line than the ship means a touching ship is caught up in it;
    // the ship's own cells are the ones nearest the shot that completed it.
    const cells = size
      ? line
        .sort((a, b) => distance(shot, a) - distance(shot, b))
        .slice(0, size)
      : line;
    return new Set(cells.map((c) => key(c.x, c.y)));
  }
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function dedupe(cells) {
  const seen = new Set();
  return cells.filter((c) => {
    const k = key(c.x, c.y);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
