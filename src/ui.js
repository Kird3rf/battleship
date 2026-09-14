// All rendering and event handling. The only module that touches the DOM.

import {
  COLUMNS,
  FLEET,
  Game,
  HIT,
  MISS,
  SIZE,
  SUNK,
  cellName,
  describeShot,
  shipCells,
} from './game.js';
import { Opponent } from './ai.js';

const GLYPH = { [MISS]: '·', [HIT]: '✕', [SUNK]: '✹' };
const REPLY_DELAY = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450;

const game = new Game({ opponent: new Opponent() });
let horizontal = true;
let focus = { x: 0, y: 0 };
let replyTimer = null;

const el = {
  phase: document.getElementById('phase'),
  playerGrid: document.getElementById('player-grid'),
  enemyGrid: document.getElementById('enemy-grid'),
  playerFleet: document.getElementById('player-fleet'),
  enemyFleet: document.getElementById('enemy-fleet'),
  rotate: document.getElementById('rotate'),
  random: document.getElementById('random'),
  clear: document.getElementById('clear'),
  start: document.getElementById('start'),
  again: document.getElementById('again'),
  turn: document.getElementById('turn'),
  playerShots: document.getElementById('player-shots'),
  computerShots: document.getElementById('computer-shots'),
  announcer: document.getElementById('announcer'),
  log: document.getElementById('log'),
};

function buildGrid(container, { onActivate, onHover, focusable }) {
  container.replaceChildren();
  container.append(label(''));
  for (const column of COLUMNS) container.append(label(column));

  for (let y = 0; y < SIZE; y += 1) {
    container.append(label(String(y + 1)));
    for (let x = 0; x < SIZE; x += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.tabIndex = focusable && x === 0 && y === 0 ? 0 : -1;
      cell.addEventListener('click', () => onActivate(x, y));
      if (onHover) {
        cell.addEventListener('mouseenter', () => onHover(x, y));
        cell.addEventListener('focus', () => onHover(x, y));
      }
      container.append(cell);
    }
  }
  if (onHover) container.addEventListener('mouseleave', clearPreview);
}

function label(text) {
  const span = document.createElement('span');
  span.className = 'label';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = text;
  return span;
}

function cellEl(container, x, y) {
  return container.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function clearPreview() {
  for (const cell of el.playerGrid.querySelectorAll('.preview, .invalid')) {
    cell.classList.remove('preview', 'invalid');
  }
}

function previewPlacement(x, y) {
  clearPreview();
  if (game.phase !== 'placement' || !game.nextShip) return;
  const { size } = game.nextShip;
  const valid = game.playerBoard.canPlace(x, y, size, horizontal);
  for (const c of shipCells(x, y, size, horizontal)) {
    const cell = cellEl(el.playerGrid, c.x, c.y);
    if (cell) cell.classList.add(valid ? 'preview' : 'invalid');
  }
}

function onPlayerCell(x, y) {
  const result = game.placeNextShip(x, y, horizontal);
  if (!result.ok) {
    if (result.reason === 'invalid') {
      announce(`${game.nextShip.name} does not fit at ${cellName(x, y)}.`);
      flashInvalid(x, y);
    }
    return;
  }
  announce(`${result.ship.name} placed at ${cellName(x, y)}.`);
  render();
  previewPlacement(x, y);
}

function flashInvalid(x, y) {
  const cell = cellEl(el.playerGrid, x, y);
  if (!cell) return;
  cell.classList.remove('shake');
  void cell.offsetWidth; // restart the animation
  cell.classList.add('shake');
}

function onEnemyCell(x, y) {
  focus = { x, y };
  const shot = game.fireAtEnemy(x, y);
  if (!shot.ok) {
    if (shot.reason === 'repeat') announce(`${cellName(x, y)} has already been fired at.`);
    return;
  }
  report(shot);
  render();
  if (game.phase === 'playing') {
    replyTimer = setTimeout(computerTurn, REPLY_DELAY);
  } else {
    finish();
  }
}

function computerTurn() {
  const shot = game.fireAtPlayer();
  if (shot.ok) report(shot);
  render();
  if (game.phase === 'over') finish();
}

function finish() {
  announce(
    game.winner === 'player'
      ? 'You win. The enemy fleet is sunk.'
      : 'You lose. Your fleet is sunk.',
  );
  render();
}

function report(shot) {
  const text = describeShot(shot);
  announce(text);
  const item = document.createElement('li');
  item.textContent = text;
  el.log.prepend(item);
}

function announce(text) {
  el.announcer.textContent = text;
}

function onEnemyKeydown(event) {
  const moves = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  };
  const move = moves[event.key];
  if (!move) return;
  event.preventDefault();
  focus = {
    x: clamp(focus.x + move.x),
    y: clamp(focus.y + move.y),
  };
  moveFocus();
}

function clamp(value) {
  return Math.min(SIZE - 1, Math.max(0, value));
}

function moveFocus() {
  for (const cell of el.enemyGrid.querySelectorAll('.cell')) cell.tabIndex = -1;
  const cell = cellEl(el.enemyGrid, focus.x, focus.y);
  if (cell) {
    cell.tabIndex = 0;
    cell.focus();
  }
}

function describeCell(x, y, state, shipHere) {
  const where = cellName(x, y);
  if (state === SUNK) return `${where}, sunk ship`;
  if (state === HIT) return `${where}, hit`;
  if (state === MISS) return `${where}, miss`;
  return shipHere ? `${where}, your ship` : `${where}, unknown`;
}

function renderPlayerGrid() {
  const board = game.playerBoard;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = cellEl(el.playerGrid, x, y);
      const ship = board.shipAt(x, y);
      const result = board.shotResult(x, y);
      const state = result === HIT ? (board.isSunk(ship) ? SUNK : HIT) : result;
      cell.className = `cell${ship ? ' ship' : ''}${state ? ` ${state}` : ''}`;
      cell.textContent = state ? GLYPH[state] : '';
      cell.setAttribute('aria-label', describeCell(x, y, state, Boolean(ship)));
      cell.setAttribute('aria-disabled', String(game.phase !== 'placement'));
    }
  }
  el.playerGrid.classList.toggle('interactive', game.phase === 'placement');
}

/**
 * Enemy cells are rendered from shot results only — the computer's ship
 * positions never reach the DOM until the game is over.
 */
function renderEnemyGrid() {
  const board = game.enemyBoard;
  const over = game.phase === 'over';
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const cell = cellEl(el.enemyGrid, x, y);
      const result = board.shotResult(x, y);
      const sunkShip = result === HIT && board.isSunk(board.shipAt(x, y));
      const state = result === HIT ? (sunkShip ? SUNK : HIT) : result;
      const revealed = over && !result && board.shipAt(x, y);
      cell.className = `cell${state ? ` ${state}` : ''}${revealed ? ' revealed' : ''}`;
      cell.textContent = state ? GLYPH[state] : '';
      cell.setAttribute(
        'aria-label',
        revealed ? `${cellName(x, y)}, enemy ship` : describeCell(x, y, state, false),
      );
      cell.setAttribute('aria-disabled', String(game.phase !== 'playing' || Boolean(result)));
    }
  }
  el.enemyGrid.classList.toggle('interactive', game.phase === 'playing');
}

function renderFleet(list, board, { showProgress }) {
  list.replaceChildren();
  for (const { name, size } of FLEET) {
    const ship = board.ships.find((s) => s.name === name);
    const sunk = ship ? board.isSunk(ship) : false;
    const item = document.createElement('li');
    item.className = sunk ? 'sunk' : '';
    const label = document.createElement('span');
    label.textContent = `${name} (${size})`;
    const status = document.createElement('span');
    if (sunk) status.textContent = 'sunk';
    else if (!ship) status.textContent = 'to place';
    else status.textContent = showProgress ? `${ship.hits}/${size}` : 'afloat';
    item.append(label, status);
    list.append(item);
  }
}

function phaseText() {
  if (game.phase === 'placement') {
    const ship = game.nextShip;
    return ship
      ? `Place your ${ship.name} (${ship.size} cells, ${horizontal ? 'horizontal' : 'vertical'}). Click its bow cell.`
      : 'Fleet ready. Press Start game.';
  }
  if (game.phase === 'playing') {
    return game.turn === 'player' ? 'Your turn. Fire at the enemy grid.' : 'Computer is firing…';
  }
  return game.winner === 'player' ? 'You win. The enemy fleet is sunk.' : 'You lose. Your fleet is sunk.';
}

function render() {
  el.phase.textContent = phaseText();
  el.turn.textContent = game.phase === 'placement'
    ? 'Placement'
    : game.phase === 'over'
      ? 'Game over'
      : game.turn === 'player' ? 'You' : 'Computer';
  el.playerShots.textContent = String(game.playerShots);
  el.computerShots.textContent = String(game.computerShots);

  const placing = game.phase === 'placement';
  el.rotate.disabled = !placing;
  el.random.disabled = !placing;
  el.clear.disabled = !placing;
  el.start.disabled = !game.canStart;
  el.rotate.innerHTML = `Rotate: ${horizontal ? 'horizontal' : 'vertical'} <kbd>R</kbd>`;
  el.again.hidden = game.phase !== 'over';

  renderPlayerGrid();
  renderEnemyGrid();
  renderFleet(el.playerFleet, game.playerBoard, { showProgress: true });
  renderFleet(el.enemyFleet, game.enemyBoard, { showProgress: false });
}

el.rotate.addEventListener('click', () => {
  horizontal = !horizontal;
  render();
});

el.random.addEventListener('click', () => {
  game.placeRemainingRandomly();
  announce('Remaining ships placed at random.');
  render();
});

el.clear.addEventListener('click', () => {
  game.clearPlacement();
  announce('Placement cleared.');
  render();
});

el.start.addEventListener('click', () => {
  if (!game.start()) return;
  announce('Battle stations. Your turn.');
  render();
  moveFocus();
});

el.again.addEventListener('click', () => {
  clearTimeout(replyTimer);
  game.reset();
  horizontal = true;
  focus = { x: 0, y: 0 };
  el.log.replaceChildren();
  announce('New game. Place your fleet.');
  render();
});

document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r' && game.phase === 'placement' && !event.metaKey && !event.ctrlKey) {
    horizontal = !horizontal;
    render();
  }
});

el.enemyGrid.addEventListener('keydown', onEnemyKeydown);

buildGrid(el.playerGrid, { onActivate: onPlayerCell, onHover: previewPlacement, focusable: false });
buildGrid(el.enemyGrid, { onActivate: onEnemyCell, focusable: true });
render();
