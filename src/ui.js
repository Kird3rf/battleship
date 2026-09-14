import { BOARD_SIZE, CELL, Game, coordsFor } from './game.js';

const game = new Game();
let horizontal = true;

const elements = {
  status: document.getElementById('status'),
  playerBoard: document.getElementById('player-board'),
  computerBoard: document.getElementById('computer-board'),
  fleet: document.getElementById('fleet'),
  log: document.getElementById('log'),
  rotate: document.getElementById('rotate'),
  random: document.getElementById('random'),
  restart: document.getElementById('restart'),
};

function buildBoard(container, onClick, onHover) {
  container.replaceChildren();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      cell.setAttribute(
        'aria-label',
        `${String.fromCharCode(65 + col)}${row + 1}`,
      );
      cell.addEventListener('click', () => onClick(row, col));
      if (onHover) {
        cell.addEventListener('mouseenter', () => onHover(row, col));
      }
      container.append(cell);
    }
  }
  if (onHover) {
    container.addEventListener('mouseleave', () => clearPreview());
  }
}

function cellAt(container, row, col) {
  return container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

function clearPreview() {
  for (const cell of elements.playerBoard.querySelectorAll('.preview, .preview-invalid')) {
    cell.classList.remove('preview', 'preview-invalid');
  }
}

function previewPlacement(row, col) {
  clearPreview();
  const ship = game.nextShipToPlace;
  if (game.phase !== 'placement' || !ship) return;
  const valid = game.playerBoard.canPlace({ row, col, size: ship.size, horizontal });
  for (const c of coordsFor({ row, col, size: ship.size, horizontal })) {
    const cell = cellAt(elements.playerBoard, c.row, c.col);
    if (cell) cell.classList.add(valid ? 'preview' : 'preview-invalid');
  }
}

function onPlayerCellClick(row, col) {
  if (game.phase !== 'placement') return;
  const ship = game.nextShipToPlace;
  if (!ship || !game.playerBoard.canPlace({ row, col, size: ship.size, horizontal })) return;
  game.placePlayerShip(row, col, horizontal);
  clearPreview();
  render();
}

function onComputerCellClick(row, col) {
  if (game.phase !== 'battle' || game.computerBoard.hasShot(row, col)) return;
  game.playerFire(row, col);
  render();
}

function renderBoard(container, board, revealShips) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = cellAt(container, row, col);
      const state = board.cellState(row, col, revealShips);
      cell.className = `cell${state === CELL.EMPTY ? '' : ` ${state}`}`;
      cell.disabled = container === elements.computerBoard
        ? game.phase !== 'battle' || board.hasShot(row, col)
        : game.phase !== 'placement';
    }
  }
  container.classList.toggle(
    'actionable',
    container === elements.computerBoard ? game.phase === 'battle' : game.phase === 'placement',
  );
}

function renderFleet() {
  elements.fleet.replaceChildren();
  for (const ship of game.computerBoard.ships) {
    const item = document.createElement('li');
    const sunk = game.computerBoard.isSunk(ship);
    item.className = sunk ? 'sunk' : '';
    item.textContent = ship.name;
    const status = document.createElement('span');
    status.textContent = sunk ? 'sunk' : `${ship.hits}/${ship.size}`;
    item.append(status);
    elements.fleet.append(item);
  }
}

function renderLog() {
  elements.log.replaceChildren();
  for (const entry of game.log.slice(0, 20)) {
    const item = document.createElement('li');
    item.textContent = entry;
    elements.log.append(item);
  }
}

function statusText() {
  if (game.phase === 'placement') {
    const ship = game.nextShipToPlace;
    return `Place your ${ship.name} (${ship.size} cells, ${horizontal ? 'horizontal' : 'vertical'}).`;
  }
  if (game.phase === 'battle') return 'Fire at the enemy waters.';
  return game.winner === 'player' ? 'You win! The enemy fleet is sunk.' : 'You lose. Your fleet is sunk.';
}

function render() {
  elements.status.textContent = statusText();
  elements.rotate.disabled = game.phase !== 'placement';
  elements.random.disabled = game.phase !== 'placement';
  elements.rotate.textContent = `Rotate (${horizontal ? 'horizontal' : 'vertical'})`;
  renderBoard(elements.playerBoard, game.playerBoard, true);
  renderBoard(elements.computerBoard, game.computerBoard, game.phase === 'over');
  renderFleet();
  renderLog();
}

elements.rotate.addEventListener('click', () => {
  horizontal = !horizontal;
  render();
});

elements.random.addEventListener('click', () => {
  game.randomisePlayerFleet();
  render();
});

elements.restart.addEventListener('click', () => {
  game.reset();
  render();
});

buildBoard(elements.playerBoard, onPlayerCellClick, previewPlacement);
buildBoard(elements.computerBoard, onComputerCellClick);
render();
