// dots & boxes — 6×6 dots, 5×5 boxes (25, odd → no draws).
// Completing a box claims it and grants an extra turn.
import { h } from '../../core/ui/dom.js';

const DOTS = 6;
const BW = 5; // boxes per side

const hIdx = (r, c) => r * BW + c;   // horizontal edges: r 0..5, c 0..4
const vIdx = (r, c) => r * DOTS + c; // vertical edges:   r 0..4, c 0..5
const bIdx = (r, c) => r * BW + c;   // boxes:            r 0..4, c 0..4

function boxComplete(hE, vE, br, bc) {
  return hE[hIdx(br, bc)] && hE[hIdx(br + 1, bc)] && vE[vIdx(br, bc)] && vE[vIdx(br, bc + 1)];
}

export const logic = {
  setup(seed, opts, { first }) {
    return {
      h: Array(30).fill(false), v: Array(30).fill(false),
      hBy: Array(30).fill(null), vBy: Array(30).fill(null),
      boxes: Array(25).fill(null),
      turn: first, scores: { diya: 0, divyam: 0 }, claimed: 0,
      lastEdge: null, extra: false,
    };
  },

  reduce(state, move, { by }) {
    if (by !== state.turn || move?.k !== 'edge') return null;
    const { o, r, c } = move;
    if (!Number.isInteger(r) || !Number.isInteger(c)) return null;
    if (o === 'h') {
      if (r < 0 || r > 5 || c < 0 || c > 4 || state.h[hIdx(r, c)]) return null;
    } else if (o === 'v') {
      if (r < 0 || r > 4 || c < 0 || c > 5 || state.v[vIdx(r, c)]) return null;
    } else return null;

    const hE = [...state.h];
    const vE = [...state.v];
    const hBy = [...state.hBy];
    const vBy = [...state.vBy];
    const boxes = [...state.boxes];
    if (o === 'h') { hE[hIdx(r, c)] = true; hBy[hIdx(r, c)] = by; }
    else { vE[vIdx(r, c)] = true; vBy[vIdx(r, c)] = by; }

    let claimedNow = 0;
    const candidates = o === 'h' ? [[r - 1, c], [r, c]] : [[r, c - 1], [r, c]];
    for (const [br, bc] of candidates) {
      if (br < 0 || br > 4 || bc < 0 || bc > 4) continue;
      if (boxes[bIdx(br, bc)] === null && boxComplete(hE, vE, br, bc)) {
        boxes[bIdx(br, bc)] = by;
        claimedNow++;
      }
    }
    const scores = { ...state.scores };
    scores[by] += claimedNow;
    return {
      h: hE, v: vE, hBy, vBy, boxes,
      turn: claimedNow > 0 ? by : (by === 'diya' ? 'divyam' : 'diya'),
      scores, claimed: state.claimed + claimedNow,
      lastEdge: { o, r, c }, extra: claimedNow > 0,
    };
  },

  isOver(state) {
    if (state.claimed < 25) return null;
    const { diya, divyam } = state.scores;
    return { winner: diya > divyam ? 'diya' : 'divyam', draw: false, score: { ...state.scores } };
  },

  view(state) { return state; },
};

// ── ui ─────────────────────────────────────────────────────────
const STAMP = { diya: '🌷', divyam: '🐻' };
let edgeEls = new Map(); // 'h-r-c' → el
let boxEls = [];
let numEls = null;
let flashEl = null;
let prevClaimed = 0;

export const ui = {
  mount(el, ctx) {
    edgeEls = new Map();
    boxEls = [];
    prevClaimed = 0;

    const board = h('div', { class: 'db-board sticker' });
    for (let r = 0; r < DOTS; r++) {
      for (let c = 0; c < DOTS; c++) {
        board.append(h('span', { class: 'db-dot', style: `grid-row:${2 * r + 1};grid-column:${2 * c + 1};` }));
      }
    }
    for (let r = 0; r <= 5; r++) {
      for (let c = 0; c <= 4; c++) {
        const btn = h('button', {
          class: 'db-edge db-edge--h',
          'data-edge': `h-${r}-${c}`,
          'aria-label': `edge h ${r},${c}`,
          style: `grid-row:${2 * r + 1};grid-column:${2 * c + 2};`,
          onclick: () => ctx.submitMove({ k: 'edge', o: 'h', r, c }),
        });
        edgeEls.set(`h-${r}-${c}`, btn);
        board.append(btn);
      }
    }
    for (let r = 0; r <= 4; r++) {
      for (let c = 0; c <= 5; c++) {
        const btn = h('button', {
          class: 'db-edge db-edge--v',
          'data-edge': `v-${r}-${c}`,
          'aria-label': `edge v ${r},${c}`,
          style: `grid-row:${2 * r + 2};grid-column:${2 * c + 1};`,
          onclick: () => ctx.submitMove({ k: 'edge', o: 'v', r, c }),
        });
        edgeEls.set(`v-${r}-${c}`, btn);
        board.append(btn);
      }
    }
    for (let r = 0; r < BW; r++) {
      for (let c = 0; c < BW; c++) {
        const box = h('div', { class: 'db-box', style: `grid-row:${2 * r + 2};grid-column:${2 * c + 2};` });
        boxEls.push(box);
        board.append(box);
      }
    }

    numEls = {
      diya: h('span', { class: 'scorestrip__num', style: 'color:var(--rose-deep);' }, '0'),
      divyam: h('span', { class: 'scorestrip__num', style: 'color:var(--peri-deep);' }, '0'),
    };
    flashEl = h('div', { class: 'db-flash hand' }, 'extra turn! ✨');

    el.append(h('div', { class: 'db-wrap stack gap-sm' },
      h('div', { class: 'scorestrip' },
        h('span', { class: 'scorestrip__side' }, h('span', { style: 'font-size:20px;' }, STAMP.diya), numEls.diya),
        h('span', { class: 'scorestrip__vs' }, 'vs'),
        h('span', { class: 'scorestrip__side' }, numEls.divyam, h('span', { style: 'font-size:20px;' }, STAMP.divyam)),
      ),
      board,
      flashEl,
    ));
  },

  render(view, ctx) {
    for (const [key, elBtn] of edgeEls) {
      const [o, rs, cs] = key.split('-');
      const r = Number(rs);
      const c = Number(cs);
      const taken = o === 'h' ? view.h[hIdx(r, c)] : view.v[vIdx(r, c)];
      const byWho = o === 'h' ? view.hBy[hIdx(r, c)] : view.vBy[vIdx(r, c)];
      const cls = ['db-edge', `db-edge--${o}`];
      if (taken) cls.push('db-edge--taken', `p-${byWho}`);
      if (view.lastEdge && view.lastEdge.o === o && view.lastEdge.r === r && view.lastEdge.c === c) cls.push('db-edge--last');
      elBtn.className = cls.join(' ');
      elBtn.disabled = taken;
    }
    for (let i = 0; i < boxEls.length; i++) {
      const who = view.boxes[i];
      const box = boxEls[i];
      const want = who ? `db-box db-box--claimed p-${who}` : 'db-box';
      if (box.className !== want) {
        box.className = want;
        box.textContent = '';
        if (who) box.append(h('span', { class: 'db-stamp' }, STAMP[who]));
      }
    }
    numEls.diya.textContent = String(view.scores.diya);
    numEls.divyam.textContent = String(view.scores.divyam);

    if (view.claimed > prevClaimed) {
      ctx.haptic([12, 30, 12]);
      flashEl.classList.remove('db-flash--go');
      void flashEl.offsetWidth; // restart animation
      flashEl.classList.add('db-flash--go');
    }
    prevClaimed = view.claimed;
  },

  destroy() {
    edgeEls = new Map();
    boxEls = [];
    numEls = null;
    flashEl = null;
  },
};

export const css = `
.db-wrap { width: 100%; max-width: 430px; margin: 0 auto; }
.db-board {
  display: grid;
  grid-template-columns: repeat(5, 12px minmax(0, 1fr)) 12px;
  grid-template-rows: repeat(5, 12px minmax(0, 1fr)) 12px;
  width: 100%;
  aspect-ratio: 1;
  padding: 12px;
  background: linear-gradient(160deg, #fff, var(--rose-ghost));
  touch-action: manipulation;
}
.db-dot {
  width: 9px; height: 9px;
  border-radius: 50%;
  background: var(--ink-faint);
  place-self: center;
}
.db-edge { position: relative; }
.db-edge::before { content: ''; position: absolute; }
.db-edge--h::before { inset: -10px -2px; }
.db-edge--v::before { inset: -2px -10px; }
.db-edge::after {
  content: '';
  position: absolute;
  border-radius: 6px;
  background: var(--paper-dot);
  opacity: .5;
  transition: background var(--t-fast), opacity var(--t-fast), box-shadow var(--t-fast);
}
.db-edge--h::after { left: 1px; right: 1px; top: calc(50% - 2.5px); height: 5px; }
.db-edge--v::after { top: 1px; bottom: 1px; left: calc(50% - 2.5px); width: 5px; }
.db-edge--taken::after { background: var(--p); opacity: 1; }
.db-edge--taken { pointer-events: none; }
.db-edge--last::after { box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--butter-deep) 50%, transparent); }
@media (hover: hover) {
  .db-edge:not(.db-edge--taken):hover::after { background: var(--rose-soft); opacity: 1; }
}
.db-box {
  margin: 4px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  font-size: clamp(14px, 4.5vw, 22px);
}
.db-box--claimed { background: var(--p-ghost); border: 2px solid var(--p-soft); }
.db-stamp { animation: db-pop var(--t-slow) var(--bounce) both; }
@keyframes db-pop { from { transform: scale(0) rotate(-24deg); } }
.db-flash {
  text-align: center;
  font-size: 16px;
  color: var(--butter-deep);
  opacity: 0;
  min-height: 22px;
}
.db-flash--go { animation: db-flash 1.2s ease both; }
@keyframes db-flash {
  0% { opacity: 0; transform: translateY(4px); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-8px); }
}
`;

export default {
  id: 'dotsboxes',
  engine: 'turnbased',
  blurb: 'close a box, steal it, go again. sneaky wins allowed.',
  logic,
  ui,
  css,
};
