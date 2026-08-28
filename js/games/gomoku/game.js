// five in a row (gomoku) — 15×15 freestyle: five or more wins.
import { h } from '../../core/ui/dom.js';

const N = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function winLineAt(board, idx, who) {
  const c0 = idx % N;
  const r0 = Math.floor(idx / N);
  for (const [dc, dr] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      let c = c0 + dc * sign;
      let r = r0 + dr * sign;
      while (c >= 0 && c < N && r >= 0 && r < N && board[r * N + c] === who) {
        line.push(r * N + c);
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export const logic = {
  setup(seed, opts, { first }) {
    return { board: Array(N * N).fill(null), turn: first, last: null, winner: null, winLine: null, count: 0 };
  },

  reduce(state, move, { by }) {
    if (state.winner || by !== state.turn) return null;
    const { r, c } = move ?? {};
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= N || c < 0 || c >= N) return null;
    const idx = r * N + c;
    if (state.board[idx] !== null) return null;
    const board = [...state.board];
    board[idx] = by;
    const winLine = winLineAt(board, idx, by);
    return {
      board,
      turn: by === 'diya' ? 'divyam' : 'diya',
      last: idx,
      winner: winLine ? by : null,
      winLine,
      count: state.count + 1,
    };
  },

  isOver(state) {
    if (state.winner) return { winner: state.winner, draw: false };
    if (state.count === N * N) return { winner: null, draw: true };
    return null;
  },

  view(state) { return state; },
};

// ── ui ─────────────────────────────────────────────────────────
let cells = [];
let ghost = null;   // pending two-tap placement (cell idx)
let hintEl = null;
let lastView = null;
let lastCtx = null;

function paint() {
  if (!lastView || !cells.length) return;
  const v = lastView;
  const ctx = lastCtx;
  if (!ctx.myTurn()) ghost = null;
  for (let i = 0; i < cells.length; i++) {
    const who = v.board[i];
    const cls = ['gk-cell'];
    if (who) cls.push('gk-cell--filled', `p-${who}`);
    if (v.last === i) cls.push('gk-cell--last');
    if (v.winLine?.includes(i)) cls.push('gk-cell--win');
    if (ghost === i && !who) cls.push('gk-cell--ghost', `p-${ctx.me}`);
    cells[i].className = cls.join(' ');
  }
  hintEl?.classList.toggle('gk-hint--show', ghost !== null);
}

function onTap(i, ctx) {
  if (!lastView || !ctx.myTurn() || lastView.board[i] !== null) return;
  if (ghost === i) {
    ghost = null;
    ctx.submitMove({ r: Math.floor(i / N), c: i % N });
  } else {
    ghost = i;
    ctx.haptic(6);
    paint();
  }
}

export const ui = {
  mount(el, ctx) {
    cells = [];
    ghost = null;
    const board = h('div', { class: 'gk-board sticker' });
    for (let i = 0; i < N * N; i++) {
      const cell = h('button', { class: 'gk-cell', 'aria-label': `cell ${Math.floor(i / N) + 1},${(i % N) + 1}`, onclick: () => onTap(i, ctx) });
      cells.push(cell);
      board.append(cell);
    }
    hintEl = h('div', { class: 'gk-hint hand' }, 'tap again to place ✓');
    el.append(h('div', { class: 'gk-wrap stack gap-sm' }, board, hintEl));
  },

  render(view, ctx) {
    lastView = view;
    lastCtx = ctx;
    paint();
  },

  destroy() {
    cells = [];
    ghost = null;
    hintEl = null;
    lastView = null;
    lastCtx = null;
  },
};

export const css = `
.gk-wrap { width: 100%; max-width: 440px; margin: 0 auto; }
.gk-board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  width: 100%;
  aspect-ratio: 1;
  padding: 7px;
  background: linear-gradient(160deg, #fff, var(--paper-deep));
  touch-action: manipulation;
}
.gk-cell {
  position: relative;
  background-image:
    linear-gradient(to right, transparent calc(50% - .6px), rgba(83,51,62,.13) calc(50% - .6px), rgba(83,51,62,.13) calc(50% + .6px), transparent calc(50% + .6px)),
    linear-gradient(to bottom, transparent calc(50% - .6px), rgba(83,51,62,.13) calc(50% - .6px), rgba(83,51,62,.13) calc(50% + .6px), transparent calc(50% + .6px));
}
.gk-cell--filled::after, .gk-cell--ghost::after {
  content: '';
  position: absolute; inset: 10%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--p) 55%, #fff), var(--p) 62%);
  box-shadow: 0 1.5px 3px rgba(83,51,62,.25);
  animation: gk-pop var(--t-med) var(--bounce) both;
}
@keyframes gk-pop { from { transform: scale(.3); } }
.gk-cell--ghost::after { opacity: .45; animation: none; }
.gk-cell--ghost::before {
  content: '✓';
  position: absolute; inset: 0;
  display: grid; place-items: center;
  color: #fff; font-size: 10px; font-weight: 700;
  z-index: 1;
}
.gk-cell--last::before {
  content: '';
  position: absolute; inset: 6%;
  border-radius: 50%;
  border: 2px solid var(--butter-deep);
  z-index: 1;
}
.gk-cell--win::after {
  animation: gk-pop var(--t-med) var(--bounce) both, gk-pulse 1s ease-in-out .2s 3;
}
@keyframes gk-pulse { 50% { transform: scale(1.22); } }
.gk-hint {
  text-align: center;
  font-size: 15px;
  color: var(--ink-soft);
  opacity: 0;
  transition: opacity var(--t-fast);
  min-height: 20px;
}
.gk-hint--show { opacity: 1; }
`;

export default {
  id: 'gomoku',
  engine: 'turnbased',
  blurb: 'line up five before she does. no pressure.',
  logic,
  ui,
  css,
};
