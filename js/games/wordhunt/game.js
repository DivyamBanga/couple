// word hunt — the same seeded 4×4 board on both phones, 80 seconds,
// drag (or tap) paths through adjacent letters.
import { h, clear } from '../../core/ui/dom.js';
import { rngFor, shuffle, randInt } from '../../core/prng.js';
import { loadDict } from '../../core/dict.js';
import { scoreWord } from '../anagrams/game.js';

// classic 16-dice distribution ('q' renders as 'qu')
const DICE = ['aaeegn', 'abbjoo', 'achops', 'affkps', 'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw', 'eiosst', 'elrtty', 'himnqu', 'hlnnrz'];

let dict = null;
loadDict().then((d) => { dict = d; });

const letterAt = (grid, i) => (grid[i] === 'q' ? 'qu' : grid[i]);
const neighbors = (i) => {
  const r = Math.floor(i / 4);
  const c = i % 4;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) out.push(nr * 4 + nc);
    }
  }
  return out;
};

// all findable words — for the "words you both missed" tease
function solve(grid, dictionary) {
  const prefixes = new Set();
  const words = new Set();
  for (const w of dictionary) {
    if (w.length < 3 || w.length > 16) continue;
    for (let i = 1; i <= w.length; i++) prefixes.add(w.slice(0, i));
  }
  const dfs = (i, path, word) => {
    const next = word + letterAt(grid, i);
    if (!prefixes.has(next)) return;
    if (next.length >= 3 && dictionary.has(next)) words.add(next);
    for (const n of neighbors(i)) if (!path.includes(n)) dfs(n, [...path, i], next);
  };
  for (let i = 0; i < 16; i++) dfs(i, [], '');
  return words;
}

export default {
  id: 'wordhunt',
  engine: 'timed',
  css: `
.wh-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: min(88vw, 340px);
  margin: 0 auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.wh-cell {
  aspect-ratio: 1;
  border-radius: 16px;
  background: #fff;
  border: 3px solid var(--paper-dot);
  display: grid; place-items: center;
  font-weight: 700;
  font-size: clamp(22px, 7vw, 30px);
  box-shadow: 0 3px 0 rgba(83,51,62,.12);
  transition: transform var(--t-fast) var(--bounce), background var(--t-fast), border-color var(--t-fast);
}
.wh-cell--path { background: var(--me-soft); border-color: var(--me); transform: scale(1.07); }
.wh-preview { min-height: 34px; letter-spacing: 2px; }
.wh-preview--good { color: var(--mint-deep); }
.wh-preview--dup { color: var(--butter-deep); }
.wh-preview--bad { color: var(--coral-deep); }
`,
  blurb: 'same board for both of you. drag through letters. brag later.',
  durMs: 80_000,

  makeChallenge(seed) {
    const rng = rngFor(seed, 'grid');
    const dice = shuffle([...DICE], rng);
    return { grid: dice.map((d) => d[randInt(rng, 0, 5)]) };
  },

  renderRules(zone, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { style: 'font-size:44px;' }, '🔍'),
      h('div', { class: 'title-md mt-sm' }, 'same board, more words'),
      h('div', { class: 'sub mt-sm', style: 'line-height:1.5;' },
        'you both get the IDENTICAL letter board. drag through neighboring letters to make words (3+). 80 seconds.'),
      h('div', { class: 'small faint mt-sm' }, '3-4 letters: 1pt · 5: 2 · 6: 3 · 7: 5 · 8+: 11'),
    ));
  },

  mountPlay(zone, challenge, ctx, { saveProgress, restored }) {
    const found = new Set(restored?.found ?? []);
    let path = [];
    let dragging = false;
    let cells = [];

    const preview = h('div', { class: 'title-lg center-text wh-preview', style: 'font-weight:650;' });
    const foundRow = h('div', { class: 'row wrap gap-xs', style: 'justify-content:center;align-content:flex-start;min-height:52px;max-height:84px;overflow-y:auto;' });
    const scoreLabel = h('span', { style: 'font-weight:650;' }, '0 pts');

    const renderFound = () => {
      clear(foundRow);
      let total = 0;
      [...found].slice().reverse().forEach((w) => {
        total += scoreWord(w);
        foundRow.append(h('span', { class: 'chip', style: 'min-height:28px;padding:2px 11px;font-size:13px;' }, `${w} +${scoreWord(w)}`));
      });
      scoreLabel.textContent = `${total} pts`;
    };

    const word = () => path.map((i) => letterAt(challenge.grid, i)).join('');

    const paint = () => {
      cells.forEach((c, i) => c.classList.toggle('wh-cell--path', path.includes(i)));
      preview.className = 'title-lg center-text wh-preview';
      preview.textContent = word().toUpperCase();
    };

    const commit = () => {
      const w = word();
      dragging = false;
      if (w.length >= 3) {
        if (found.has(w)) {
          preview.classList.add('wh-preview--dup');
          preview.textContent = `${w.toUpperCase()} — got it already`;
        } else if (dict?.has(w)) {
          found.add(w);
          preview.classList.add('wh-preview--good');
          preview.textContent = `${w.toUpperCase()} +${scoreWord(w)} ✓`;
          ctx.haptic(15);
          saveProgress({ found: [...found] });
          renderFound();
        } else {
          preview.classList.add('wh-preview--bad');
          preview.textContent = `${w.toUpperCase()}?? no 😌`;
          ctx.haptic([8, 25, 8]);
        }
      } else preview.textContent = '';
      const done = path;
      path = [];
      cells.forEach((c, i) => c.classList.toggle('wh-cell--path', false));
      void done;
    };

    const grid = h('div', { class: 'wh-grid' });
    for (let i = 0; i < 16; i++) {
      const cell = h('div', { class: 'wh-cell', 'data-i': i }, letterAt(challenge.grid, i).toUpperCase());
      cells.push(cell);
      grid.append(cell);
    }

    const cellFromPoint = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('.wh-cell');
      return el ? Number(el.dataset.i) : null;
    };
    const tryExtend = (i) => {
      if (i === null) return;
      if (path.length === 0) { path.push(i); paint(); return; }
      const last = path[path.length - 1];
      if (i === last) return;
      const backIdx = path.indexOf(i);
      if (backIdx !== -1 && backIdx === path.length - 2) { path.pop(); paint(); return; } // backtrack
      if (backIdx !== -1) return;
      if (neighbors(last).includes(i)) { path.push(i); ctx.haptic(6); paint(); }
    };

    grid.addEventListener('pointerdown', (e) => {
      dragging = true;
      grid.setPointerCapture?.(e.pointerId);
      tryExtend(cellFromPoint(e.clientX, e.clientY));
    });
    grid.addEventListener('pointermove', (e) => { if (dragging) tryExtend(cellFromPoint(e.clientX, e.clientY)); });
    grid.addEventListener('pointerup', () => { if (dragging) commit(); });
    grid.addEventListener('pointercancel', () => { if (dragging) commit(); });

    zone.append(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' },
        h('span', { class: 'small sub' }, 'your words'), scoreLabel),
      foundRow,
      preview,
      grid,
      h('div', { class: 'small faint center-text', style: 'padding:6px 0;' }, 'drag through letters, release to submit'),
    );
    renderFound();

    return { collect: () => ({ found: [...found] }), destroy: () => {} };
  },

  scoreOf(result) {
    return (result?.found ?? []).reduce((s, w) => s + scoreWord(w), 0);
  },

  renderCompare(zone, mine, theirs, challenge, ctx) {
    const mySet = new Set(mine?.found ?? []);
    const theirSet = new Set(theirs?.found ?? []);
    const shared = [...mySet].filter((w) => theirSet.has(w));
    const onlyMine = [...mySet].filter((w) => !theirSet.has(w));
    const onlyTheirs = [...theirSet].filter((w) => !mySet.has(w));
    const chips = (words, tone) => h('div', { class: 'row wrap gap-xs' },
      words.length ? words.sort((a, b) => scoreWord(b) - scoreWord(a)).map((w) =>
        h('span', { class: 'chip', style: `min-height:28px;padding:2px 11px;font-size:13px;${tone}` }, `${w} +${scoreWord(w)}`))
        : h('span', { class: 'small faint' }, 'none!'));

    const missedZone = h('div', {});
    if (dict) {
      const all = solve(challenge.grid, dict);
      const missed = [...all].filter((w) => !mySet.has(w) && !theirSet.has(w))
        .sort((a, b) => scoreWord(b) - scoreWord(a)).slice(0, 6);
      if (missed.length) {
        missedZone.append(
          h('div', { class: 'small sub mt-sm', style: 'font-weight:650;' }, 'you BOTH missed:'),
          chips(missed, 'opacity:.75;'),
        );
      }
    }

    zone.append(h('div', { class: 'sticker', style: 'padding:16px;' },
      h('div', { class: 'small sub', style: 'font-weight:650;' }, `only ${ctx.myName}:`),
      chips(onlyMine, 'background:var(--me-ghost);'),
      h('div', { class: 'small sub mt-sm', style: 'font-weight:650;' }, `only ${ctx.partnerName}:`),
      chips(onlyTheirs, 'background:var(--them-ghost);'),
      h('div', { class: 'small sub mt-sm', style: 'font-weight:650;' }, 'both of you:'),
      chips(shared, ''),
      missedZone,
    ));
  },
};
