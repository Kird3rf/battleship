// Pure game state and rules. No DOM access, no imports.

export const SIZE = 10;
export const COLUMNS = 'ABCDEFGHIJ'.split('');

export const FLEET = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

export const MISS = 'miss';
export const HIT = 'hit';
export const SUNK = 'sunk';

export function cellName(x, y) {
  return `${COLUMNS[x]}${y + 1}`;
}

export function key(x, y) {
  return `${x},${y}`;
}

export function shipCells(x, y, size, horizontal) {
  return Array.from({ length: size }, (_, i) => ({
    x: horizontal ? x + i : x,
    y: horizontal ? y : y + i,
  }));
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE;
}

/** One side's grid: its ships and the shots fired at it. */
export class Board {
  constructor() {
    this.ships = [];
    this.shots = new Map(); // key -> MISS | HIT
  }

  shipAt(x, y) {
    return this.ships.find((ship) => ship.cells.some((c) => c.x === x && c.y === y));
  }

  /** Ships must lie fully on the board and not overlap; touching is allowed. */
  canPlace(x, y, size, horizontal) {
    const cells = shipCells(x, y, size, horizontal);
    return cells.every((c) => inBounds(c.x, c.y) && !this.shipAt(c.x, c.y));
  }

  place(name, size, x, y, horizontal) {
    if (!this.canPlace(x, y, size, horizontal)) {
      throw new Error(`Invalid placement for ${name} at ${cellName(x, y)}`);
    }
    const ship = { name, size, horizontal, cells: shipCells(x, y, size, horizontal), hits: 0 };
    this.ships.push(ship);
    return ship;
  }

  get isComplete() {
    return this.ships.length === FLEET.length;
  }

  wasShot(x, y) {
    return this.shots.has(key(x, y));
  }

  /** Fires once. Returns { outcome, ship } — callers must reject repeat shots first. */
  receiveShot(x, y) {
    const ship = this.shipAt(x, y);
    if (!ship) {
      this.shots.set(key(x, y), MISS);
      return { outcome: MISS, ship: null };
    }
    this.shots.set(key(x, y), HIT);
    ship.hits += 1;
    return { outcome: ship.hits === ship.size ? SUNK : HIT, ship };
  }

  isSunk(ship) {
    return ship.hits === ship.size;
  }

  get allSunk() {
    return this.ships.length > 0 && this.ships.every((s) => this.isSunk(s));
  }

  /** Shot result at a cell: HIT, MISS or null when untouched. */
  shotResult(x, y) {
    return this.shots.get(key(x, y)) ?? null;
  }
}

export function placeRandomFleet(board, random = Math.random) {
  for (const { name, size } of FLEET) {
    if (board.ships.some((s) => s.name === name)) continue;
    let placed = false;
    while (!placed) {
      const horizontal = random() < 0.5;
      const x = Math.floor(random() * SIZE);
      const y = Math.floor(random() * SIZE);
      if (board.canPlace(x, y, size, horizontal)) {
        board.place(name, size, x, y, horizontal);
        placed = true;
      }
    }
  }
  return board;
}

/**
 * Drives one match. The player places a fleet, then the two sides alternate
 * strictly: `fireAtEnemy` then `fireAtPlayer`, one shot each.
 */
export class Game {
  constructor({ random = Math.random, opponent = null } = {}) {
    this.random = random;
    this.opponent = opponent;
    this.reset();
  }

  reset() {
    this.playerBoard = new Board();
    this.enemyBoard = new Board();
    placeRandomFleet(this.enemyBoard, this.random);
    this.opponent?.reset();
    this.phase = 'placement';
    this.turn = 'player';
    this.winner = null;
    this.playerShots = 0;
    this.computerShots = 0;
  }

  get shotCount() {
    return this.playerShots + this.computerShots;
  }

  get nextShip() {
    return FLEET[this.playerBoard.ships.length] ?? null;
  }

  get canStart() {
    return this.phase === 'placement' && this.playerBoard.isComplete;
  }

  placeNextShip(x, y, horizontal) {
    if (this.phase !== 'placement') return { ok: false, reason: 'phase' };
    const ship = this.nextShip;
    if (!ship) return { ok: false, reason: 'complete' };
    if (!this.playerBoard.canPlace(x, y, ship.size, horizontal)) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, ship: this.playerBoard.place(ship.name, ship.size, x, y, horizontal) };
  }

  placeRemainingRandomly() {
    if (this.phase !== 'placement') return false;
    placeRandomFleet(this.playerBoard, this.random);
    return true;
  }

  clearPlacement() {
    if (this.phase !== 'placement') return false;
    this.playerBoard = new Board();
    return true;
  }

  start() {
    if (!this.canStart) return false;
    this.phase = 'playing';
    this.turn = 'player';
    return true;
  }

  /** Player's shot. A repeat or off-board shot is rejected and keeps the turn. */
  fireAtEnemy(x, y) {
    if (this.phase !== 'playing' || this.turn !== 'player') return { ok: false, reason: 'turn' };
    if (!inBounds(x, y)) return { ok: false, reason: 'bounds' };
    if (this.enemyBoard.wasShot(x, y)) return { ok: false, reason: 'repeat' };

    const { outcome, ship } = this.enemyBoard.receiveShot(x, y);
    this.playerShots += 1;
    if (this.enemyBoard.allSunk) {
      this.phase = 'over';
      this.winner = 'player';
    } else {
      this.turn = 'computer';
    }
    return { ok: true, by: 'player', x, y, outcome, ship };
  }

  /** The computer's single reply shot. */
  fireAtPlayer() {
    if (this.phase !== 'playing' || this.turn !== 'computer') return { ok: false, reason: 'turn' };
    const shot = this.opponent.nextShot();
    const { outcome, ship } = this.playerBoard.receiveShot(shot.x, shot.y);
    this.opponent.recordResult(shot, outcome, ship ? { name: ship.name, size: ship.size } : null);
    this.computerShots += 1;
    if (this.playerBoard.allSunk) {
      this.phase = 'over';
      this.winner = 'computer';
    } else {
      this.turn = 'player';
    }
    return { ok: true, by: 'computer', x: shot.x, y: shot.y, outcome, ship };
  }
}

export function describeShot({ by, x, y, outcome, ship }) {
  const who = by === 'player' ? 'You' : 'Computer';
  const where = cellName(x, y);
  if (outcome === SUNK) return `${who} fired at ${where}. Sunk: ${ship.name}`;
  if (outcome === HIT) return `${who} fired at ${where}. Hit`;
  return `${who} fired at ${where}. Miss`;
}
