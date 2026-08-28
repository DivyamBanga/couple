// connect four — the reference turn-based game.
import { h, clear } from '../../core/ui/dom.js';

const COLS = 7;
const ROWS = 6;

// ── pure rules ─────────────────────────────────────────────────
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function winLineAt(board, idx, who) {
  const c0 = idx % COLS;
  const r0 = Math.floor(idx / COLS);
  for (const [dc, dr] of DIRS) {
    const line = [idx];
    for (const sign of [1, -1]) {
      let c = c0 + dc * sign;
      let r = r0 + dr * sign;
      while (c >= 0 && c < COLS && r >= 0 && r < ROWS && board[r * COLS + c] === who) {
        line.push(r * COLS + c);
        c += dc * sign;
        r += dr * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export const logic = {
  setup(seed, opts, { first }) {
    return { board: Array(COLS * ROWS).fill(null), turn: first, last: null, winner: null, winLine: null, count: 0 };
  },

  reduce(state, move, { by }) {
    if (state.winner || by !== state.turn) return null;
    const col = move?.col;
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return null;
    let idx = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (state.board[r * COLS + col] === null) { idx = r * COLS + col; break; }
    }
    if (idx === -1) return null;
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
    if (state.count === COLS * ROWS) return { winner: null, draw: true };
    return null;
  },

  view(state) { return state; },
};

// ── ui ─────────────────────────────────────────────────────────
let root = null;
let cells = [];

export const ui = {
  mount(el, ctx) {
    cells = [];
    const grid = h('div', { class: 'c4-grid sticker' });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = h('div', { class: 'c4-cell' });
        cells.push(cell);
        grid.append(cell);
      }
    }
    // full-height column tap zones
    const zones = h('div', { class: 'c4-zones' });
    for (let c = 0; c < COLS; c++) {
      zones.append(h('button', {
        class: 'c4-zone',
        'aria-label': `drop in column ${c + 1}`,
        onclick: () => ctx.submitMove({ col: c }),
      }));
    }
    root = h('div', { class: 'c4-wrap' }, grid, zones);
    el.append(h('div', { class: 'center grow' }, root));
  },

  render(view, ctx) {
    for (let i = 0; i < cells.length; i++) {
      const who = view.board[i];
      const cls = ['c4-cell'];
      if (who) cls.push('c4-cell--filled', `p-${who}`);
      if (view.last === i) cls.push('c4-cell--last');
      if (view.winLine?.includes(i)) cls.push('c4-cell--win');
      cells[i].className = cls.join(' ');
    }
    root.classList.toggle('c4-wrap--myturn', ctx.myTurn());
  },

  destroy() { root = null; cells = []; },
};

export const css = `
.c4-wrap { position: relative; width: min(94vw, 440px); }
.c4-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: clamp(4px, 1.4vw, 8px);
  padding: clamp(8px, 2.4vw, 14px);
  background: linear-gradient(160deg, #fff, var(--peri-ghost));
}
.c4-cell {
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--paper-deep);
  box-shadow: inset 0 2px 5px rgba(83,51,62,.14);
  position: relative;
}
.c4-cell--filled::after {
  content: '';
  position: absolute; inset: 7%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--p) 55%, #fff), var(--p) 62%);
  box-shadow: 0 2px 4px rgba(83,51,62,.22), inset 0 -3px 0 rgba(0,0,0,.10);
  animation: c4-drop var(--t-slow) var(--bounce) both;
}
@keyframes c4-drop {
  from { transform: translateY(-340%); }
  to   { transform: none; }
}
.c4-cell--last::before {
  content: '';
  position: absolute; inset: -3px;
  border-radius: 50%;
  border: 2.5px solid var(--butter-deep);
  animation: fade-in var(--t-med) ease both;
}
.c4-cell--win::after { animation: c4-drop var(--t-slow) var(--bounce) both, c4-pulse 1s ease-in-out .2s 3; }
@keyframes c4-pulse { 50% { transform: scale(1.14); } }
.c4-zones {
  position: absolute; inset: 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.c4-zone { border-radius: 12px; }
.c4-wrap--myturn .c4-zone { cursor: pointer; }
@media (hover: hover) {
  .c4-wrap--myturn .c4-zone:hover { background: rgba(255,255,255,.35); box-shadow: inset 0 0 0 2px rgba(255,255,255,.6); }
}
`;

export default {
  id: 'connect4',
  engine: 'turnbased',
  blurb: 'drop discs, make four in a row, talk trash.',
  logic,
  ui,
  css,
};
