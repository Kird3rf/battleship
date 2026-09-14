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
 */
export class Opponent {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.tried = new Set();
    this.queue = []; // { x, y } candidates, newest first
    this.hits = []; // hits on the ship currently being targeted
    this.axis = null; // 'h' | 'v' once inferred
  }

  get mode() {
    return this.queue.length > 0 ? TARGET : HUNT;
  }

  hasTried(x, y) {
    return this.tried.has(key(x, y));
  }

  /** Next cell to fire at, marked as tried so it can never be picked again. */
  nextShot() {
    const shot = this.takeFromQueue() ?? this.hunt();
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

  /** Feeds back the outcome of the shot returned by `nextShot`. */
  recordResult(shot, outcome) {
    if (outcome === SUNK) {
      this.hits.push(shot);
      this.dropCandidatesFor(this.hits);
      this.hits = [];
      this.axis = null;
      return;
    }
    if (outcome !== HIT) return;

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

  /** After a sinking, forget candidates that only existed because of that ship. */
  dropCandidatesFor(shipHits) {
    const adjacent = new Set();
    for (const hit of shipHits) {
      for (const c of [
        { x: hit.x, y: hit.y - 1 },
        { x: hit.x, y: hit.y + 1 },
        { x: hit.x - 1, y: hit.y },
        { x: hit.x + 1, y: hit.y },
      ]) {
        adjacent.add(key(c.x, c.y));
      }
    }
    this.queue = this.queue.filter((c) => !adjacent.has(key(c.x, c.y)));
  }
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
