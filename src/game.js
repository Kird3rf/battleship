export const BOARD_SIZE = 10;

export const FLEET = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

export const CELL = {
  EMPTY: 'empty',
  SHIP: 'ship',
  MISS: 'miss',
  HIT: 'hit',
  SUNK: 'sunk',
};

export function coordsFor({ row, col, size, horizontal }) {
  return Array.from({ length: size }, (_, i) => ({
    row: horizontal ? row : row + i,
    col: horizontal ? col + i : col,
  }));
}

export class Board {
  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.ships = [];
    this.shots = new Set();
  }

  inBounds(row, col) {
    return row >= 0 && col >= 0 && row < this.size && col < this.size;
  }

  shipAt(row, col) {
    return this.ships.find((ship) =>
      ship.coords.some((c) => c.row === row && c.col === col),
    );
  }

  canPlace({ row, col, size, horizontal }) {
    const coords = coordsFor({ row, col, size, horizontal });
    return coords.every(
      (c) => this.inBounds(c.row, c.col) && !this.shipAt(c.row, c.col),
    );
  }

  place({ name, row, col, size, horizontal }) {
    if (!this.canPlace({ row, col, size, horizontal })) {
      throw new Error(`Cannot place ${name} at ${row},${col}`);
    }
    const ship = {
      name,
      size,
      horizontal,
      coords: coordsFor({ row, col, size, horizontal }),
      hits: 0,
    };
    this.ships.push(ship);
    return ship;
  }

  get isFullyPlaced() {
    return this.ships.length === FLEET.length;
  }

  hasShot(row, col) {
    return this.shots.has(`${row},${col}`);
  }

  /**
   * Fires at a cell. Returns { result: 'miss' | 'hit' | 'sunk', ship }.
   * Throws when the cell is off-board or already targeted.
   */
  receiveAttack(row, col) {
    if (!this.inBounds(row, col)) {
      throw new Error(`Shot out of bounds: ${row},${col}`);
    }
    if (this.hasShot(row, col)) {
      throw new Error(`Already fired at ${row},${col}`);
    }
    this.shots.add(`${row},${col}`);
    const ship = this.shipAt(row, col);
    if (!ship) return { result: CELL.MISS, ship: null };
    ship.hits += 1;
    return { result: ship.hits === ship.size ? CELL.SUNK : CELL.HIT, ship };
  }

  isSunk(ship) {
    return ship.hits === ship.size;
  }

  get allSunk() {
    return this.ships.length > 0 && this.ships.every((s) => this.isSunk(s));
  }

  /** State of a cell, hiding unhit ships unless `revealShips` is set. */
  cellState(row, col, revealShips = false) {
    const ship = this.shipAt(row, col);
    if (this.hasShot(row, col)) {
      if (!ship) return CELL.MISS;
      return this.isSunk(ship) ? CELL.SUNK : CELL.HIT;
    }
    return ship && revealShips ? CELL.SHIP : CELL.EMPTY;
  }
}

export function placeFleetRandomly(board, random = Math.random) {
  for (const { name, size } of FLEET) {
    let placed = false;
    while (!placed) {
      const horizontal = random() < 0.5;
      const row = Math.floor(random() * board.size);
      const col = Math.floor(random() * board.size);
      if (board.canPlace({ row, col, size, horizontal })) {
        board.place({ name, row, col, size, horizontal });
        placed = true;
      }
    }
  }
  return board;
}

/** Computer opponent: random fire until a hit, then work along the target. */
export class ComputerPlayer {
  constructor(size = BOARD_SIZE, random = Math.random) {
    this.size = size;
    this.random = random;
    this.targets = [];
  }

  nextShot(enemyBoard) {
    while (this.targets.length > 0) {
      const target = this.targets.shift();
      if (!enemyBoard.hasShot(target.row, target.col)) return target;
    }
    const open = [];
    for (let row = 0; row < this.size; row += 1) {
      for (let col = 0; col < this.size; col += 1) {
        // Ships are at least 2 long, so only half the cells need probing.
        if (!enemyBoard.hasShot(row, col) && (row + col) % 2 === 0) {
          open.push({ row, col });
        }
      }
    }
    if (open.length === 0) {
      for (let row = 0; row < this.size; row += 1) {
        for (let col = 0; col < this.size; col += 1) {
          if (!enemyBoard.hasShot(row, col)) open.push({ row, col });
        }
      }
    }
    if (open.length === 0) return null;
    return open[Math.floor(this.random() * open.length)];
  }

  fire(enemyBoard) {
    const shot = this.nextShot(enemyBoard);
    if (!shot) return null;
    const outcome = enemyBoard.receiveAttack(shot.row, shot.col);
    if (outcome.result === CELL.HIT) {
      this.queueNeighbours(shot, enemyBoard);
    } else if (outcome.result === CELL.SUNK) {
      this.targets = [];
    }
    return { ...shot, ...outcome };
  }

  queueNeighbours({ row, col }, enemyBoard) {
    const candidates = [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ];
    for (const c of candidates) {
      if (enemyBoard.inBounds(c.row, c.col) && !enemyBoard.hasShot(c.row, c.col)) {
        this.targets.push(c);
      }
    }
  }
}

export class Game {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.playerBoard = new Board();
    this.computerBoard = new Board();
    placeFleetRandomly(this.computerBoard, this.random);
    this.computer = new ComputerPlayer(BOARD_SIZE, this.random);
    this.phase = 'placement';
    this.winner = null;
    this.log = [];
  }

  get nextShipToPlace() {
    return FLEET[this.playerBoard.ships.length] ?? null;
  }

  placePlayerShip(row, col, horizontal) {
    if (this.phase !== 'placement') throw new Error('Placement is over');
    const ship = this.nextShipToPlace;
    if (!ship) throw new Error('Fleet already placed');
    const placed = this.playerBoard.place({ ...ship, row, col, horizontal });
    if (this.playerBoard.isFullyPlaced) this.phase = 'battle';
    return placed;
  }

  randomisePlayerFleet() {
    this.playerBoard = new Board();
    placeFleetRandomly(this.playerBoard, this.random);
    this.phase = 'battle';
  }

  /** Player fires, then the computer replies unless the game just ended. */
  playerFire(row, col) {
    if (this.phase !== 'battle') throw new Error('Game is not in battle phase');
    const player = this.computerBoard.receiveAttack(row, col);
    this.log.unshift(describe('You', row, col, player));
    if (this.computerBoard.allSunk) {
      this.phase = 'over';
      this.winner = 'player';
      return { player, computer: null };
    }
    const computer = this.computer.fire(this.playerBoard);
    if (computer) this.log.unshift(describe('Computer', computer.row, computer.col, computer));
    if (this.playerBoard.allSunk) {
      this.phase = 'over';
      this.winner = 'computer';
    }
    return { player, computer };
  }
}

function describe(who, row, col, outcome) {
  const cell = `${String.fromCharCode(65 + col)}${row + 1}`;
  if (outcome.result === CELL.SUNK) return `${who} sank the ${outcome.ship.name} at ${cell}`;
  if (outcome.result === CELL.HIT) return `${who} hit a ship at ${cell}`;
  return `${who} missed at ${cell}`;
}
