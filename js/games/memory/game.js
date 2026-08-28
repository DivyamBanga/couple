// memory match — 10 emoji pairs, extra turn on a match.
import { h } from '../../core/ui/dom.js';
import { rngFor, shuffle } from '../../core/prng.js';

const EMOJI = ['🍓', '🌷', '🐻', '🐰', '🌙', '⭐', '🍑', '🧁', '🦋', '🌈'];
const CARDS = 20;

export const logic = {
  setup(seed, opts, { first }) {
    const layout = shuffle([...EMOJI, ...EMOJI], rngFor(seed, 'deal'));
    return { layout, matchedBy: Array(CARDS).fill(null), faceUp: [], turn: first, scores: { diya: 0, divyam: 0 }, done: 0 };
  },

  reduce(state, move, { by }) {
    if (by !== state.turn || move?.k !== 'flip') return null;
    const idx = move.idx;
    if (!Number.isInteger(idx) || idx < 0 || idx >= CARDS) return null;

    let faceUp = [...state.faceUp];
    if (faceUp.length === 2) faceUp = []; // previous mismatch clears on next action
    // membership check AFTER the auto-clear: re-flipping a just-shown card is legal
    if (state.matchedBy[idx] !== null || faceUp.includes(idx)) return null;

    const matchedBy = [...state.matchedBy];
    const scores = { ...state.scores };
    let turn = state.turn;
    let done = state.done;

    if (faceUp.length === 0) {
      faceUp = [idx];
    } else {
      const a = faceUp[0];
      if (state.layout[a] === state.layout[idx]) {
        matchedBy[a] = by;
        matchedBy[idx] = by;
        scores[by]++;
        done += 2;
        faceUp = []; // extra turn — turn stays
      } else {
        faceUp = [a, idx];
        turn = by === 'diya' ? 'divyam' : 'diya';
      }
    }
    return { layout: state.layout, matchedBy, faceUp, turn, scores, done };
  },

  isOver(state) {
    if (state.done < CARDS) return null;
    const { diya, divyam } = state.scores;
    if (diya === divyam) return { winner: null, draw: true, score: { ...state.scores } };
    return { winner: diya > divyam ? 'diya' : 'divyam', draw: false, score: { ...state.scores } };
  },

  view(state) { return state; },
};

// ── ui ─────────────────────────────────────────────────────────
let cards = [];
let numEls = null;
let prevDone = 0;

export const ui = {
  mount(el, ctx) {
    cards = [];
    prevDone = 0;
    const grid = h('div', { class: 'mm-grid' });
    for (let i = 0; i < CARDS; i++) {
      const card = h('button', { class: 'mm-card flip', 'data-idx': String(i), onclick: () => ctx.submitMove({ k: 'flip', idx: i }) },
        h('div', { class: 'flip__inner' },
          h('div', { class: 'flip__face mm-front' }, h('span', { class: 'mm-front-heart' }, '🩷')),
          h('div', { class: 'flip__face flip__face--back mm-back' }),
        ),
      );
      cards.push(card);
      grid.append(card);
    }

    numEls = {
      diya: h('span', { class: 'scorestrip__num', style: 'color:var(--rose-deep);' }, '0'),
      divyam: h('span', { class: 'scorestrip__num', style: 'color:var(--peri-deep);' }, '0'),
    };
    el.append(h('div', { class: 'mm-wrap stack gap-sm' },
      h('div', { class: 'scorestrip' },
        h('span', { class: 'scorestrip__side' }, h('span', { style: 'font-size:20px;' }, '🌷'), numEls.diya),
        h('span', { class: 'scorestrip__vs' }, 'vs'),
        h('span', { class: 'scorestrip__side' }, numEls.divyam, h('span', { style: 'font-size:20px;' }, '🐻')),
      ),
      grid,
    ));
  },

  render(view, ctx) {
    const mismatch = view.faceUp.length === 2;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (card.dataset.emoji !== view.layout[i]) {
        card.dataset.emoji = view.layout[i];
        card.querySelector('.mm-back').textContent = view.layout[i];
      }
      const matched = view.matchedBy[i] !== null;
      const up = matched || view.faceUp.includes(i);
      card.classList.toggle('flip--flipped', up);
      card.classList.toggle('mm-card--matched', matched);
      card.classList.toggle('mm-card--no', mismatch && view.faceUp.includes(i));
      card.disabled = matched;
    }
    numEls.diya.textContent = String(view.scores.diya);
    numEls.divyam.textContent = String(view.scores.divyam);
    if (view.done > prevDone) ctx.haptic([12, 40, 12]);
    prevDone = view.done;
  },

  destroy() {
    cards = [];
    numEls = null;
  },
};

export const css = `
.mm-wrap { width: 100%; max-width: 400px; margin: 0 auto; }
.mm-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  touch-action: manipulation;
}
.mm-card {
  aspect-ratio: 3 / 4;
  perspective: 700px;
  transition: transform var(--t-med) var(--ease), opacity var(--t-med) var(--ease);
}
.mm-card .flip__inner { width: 100%; height: 100%; }
.mm-card .flip__face {
  width: 100%; height: 100%;
  border-radius: 14px;
  border: 2.5px solid #fff;
  box-shadow: var(--shadow-press);
  display: grid;
  place-items: center;
}
.mm-front {
  background:
    radial-gradient(var(--rose-soft) 1.4px, transparent 1.9px),
    linear-gradient(160deg, #FFF3EA, var(--rose-ghost));
  background-size: 15px 15px, auto;
}
.mm-front-heart { font-size: 15px; opacity: .55; }
.mm-back { background: #fff; font-size: clamp(26px, 8vw, 36px); }
.mm-card--matched {
  transform: scale(0);
  opacity: 0;
  transition-delay: .55s;
  pointer-events: none;
}
.mm-card--no { animation: mm-shake .4s ease .4s; }
@keyframes mm-shake {
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
`;

export default {
  id: 'memory',
  engine: 'turnbased',
  blurb: 'flip, match, gloat. loser owes a kiss.',
  logic,
  ui,
  css,
};
