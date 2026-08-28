// letter scramble — same 7 letters, 60 seconds, most points wins.
import { h, clear } from '../../core/ui/dom.js';
import { rngFor, shuffle, pick } from '../../core/prng.js';
import { loadDict } from '../../core/dict.js';

const VOWELS = 'aaaeeeeiiioou'.split('');
const CONSONANTS = 'bbccdddffgghhjkllllmmnnnnppqrrrrrssssttttttvwxyz'.split('');
const SCORES = { 3: 1, 4: 1, 5: 2, 6: 3, 7: 5 };
export const scoreWord = (w) => SCORES[Math.min(w.length, 7)] ?? (w.length >= 8 ? 11 : 0);

let dict = null;
loadDict().then((d) => { dict = d; });

const css = `
.ana-tile {
  width: 46px; height: 52px;
  border-radius: 12px;
  background: #fff;
  border: 3px solid var(--paper-dot);
  font-weight: 700;
  font-size: 22px;
  box-shadow: 0 3px 0 rgba(83,51,62,.12);
  transition: transform var(--t-fast) var(--bounce), background var(--t-fast), border-color var(--t-fast);
}
.ana-tile:active { transform: scale(.92); }
.ana-tile--used {
  background: var(--me-soft);
  border-color: var(--me);
  transform: translateY(-4px);
}
`;

export default {
  id: 'anagrams',
  engine: 'timed',
  css,
  blurb: 'same seven letters, sixty seconds, most points wins.',
  durMs: 60_000,

  makeChallenge(seed) {
    const rng = rngFor(seed, 'letters');
    const letters = [];
    for (let i = 0; i < 3; i++) letters.push(pick(VOWELS, rng));
    for (let i = 0; i < 4; i++) letters.push(pick(CONSONANTS, rng));
    return { letters: shuffle(letters, rng) };
  },

  renderRules(zone, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { style: 'font-size:44px;' }, '🔤'),
      h('div', { class: 'title-md mt-sm' }, 'sixty seconds of letters'),
      h('div', { class: 'sub mt-sm', style: 'line-height:1.5;' },
        'you both get the SAME 7 letters. make as many words as you can (3+ letters). longer words = way more points.'),
      h('div', { class: 'small faint mt-sm' }, '3-4 letters: 1pt · 5: 2pts · 6: 3pts · 7: 5pts'),
    ));
  },

  mountPlay(zone, challenge, ctx, { saveProgress, restored }) {
    const found = new Set(restored?.found ?? []);
    let current = [];
    let letterTiles = [];

    const wordPreview = h('div', {
      class: 'title-lg center-text',
      style: 'min-height:38px;letter-spacing:3px;font-weight:650;',
    });
    const feedback = h('div', { class: 'hand center-text sub', style: 'min-height:24px;font-size:16px;' });
    const foundList = h('div', { class: 'row wrap gap-xs', style: 'justify-content:center;align-content:flex-start;min-height:60px;' });
    const scoreLabel = h('span', { style: 'font-weight:650;' }, '0 pts');

    const renderFound = () => {
      clear(foundList);
      let total = 0;
      [...found].slice().reverse().forEach((w) => {
        total += scoreWord(w);
        foundList.append(h('span', { class: 'chip', style: 'min-height:30px;padding:2px 12px;font-size:13.5px;' }, `${w} +${scoreWord(w)}`));
      });
      scoreLabel.textContent = `${total} pts`;
    };

    const renderTiles = () => {
      letterTiles.forEach((t, i) => {
        t.el.classList.toggle('ana-tile--used', current.includes(i));
      });
      wordPreview.textContent = current.map((i) => challenge.letters[i]).join('').toUpperCase();
    };

    const tryWord = () => {
      const word = current.map((i) => challenge.letters[i]).join('');
      current = [];
      renderTiles();
      if (word.length < 3) { feedback.textContent = 'too short!'; return; }
      if (found.has(word)) { feedback.textContent = 'already got it 😅'; return; }
      if (!dict?.has(word)) {
        feedback.textContent = `"${word}"? not a word, babe 😌`;
        ctx.haptic([10, 30, 10]);
        return;
      }
      found.add(word);
      feedback.textContent = `+${scoreWord(word)} · ${word}!`;
      ctx.haptic(15);
      saveProgress({ found: [...found] });
      renderFound();
    };

    const tilesRow = h('div', { class: 'row gap-xs wrap', style: 'justify-content:center;' });
    letterTiles = challenge.letters.map((ch, i) => {
      const el = h('button', { class: 'ana-tile', onclick: () => {
        if (current.includes(i)) {
          current = current.slice(0, current.indexOf(i));
        } else current.push(i);
        feedback.textContent = '';
        renderTiles();
      } }, ch.toUpperCase());
      tilesRow.append(el);
      return { el };
    });

    zone.append(
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' },
        h('span', { class: 'small sub' }, 'your words'), scoreLabel),
      foundList,
      h('div', { class: 'grow' }),
      wordPreview, feedback, tilesRow,
      h('div', { class: 'row gap-sm', style: 'justify-content:center;padding-bottom:6px;' },
        h('button', { class: 'btn btn--small', onclick: () => { current = []; renderTiles(); } }, 'clear'),
        h('button', { class: 'btn btn--small btn--me', style: 'min-width:120px;', onclick: tryWord }, 'submit ✓'),
      ),
    );
    renderFound();
    renderTiles();

    return {
      collect: () => ({ words: [...found] }),
      destroy: () => {},
    };
  },

  scoreOf(result) {
    return (result?.words ?? []).reduce((s, w) => s + scoreWord(w), 0);
  },

  renderCompare(zone, mine, theirs, challenge, ctx) {
    const mySet = new Set(mine?.words ?? []);
    const theirSet = new Set(theirs?.words ?? []);
    const shared = [...mySet].filter((w) => theirSet.has(w));
    const onlyMine = [...mySet].filter((w) => !theirSet.has(w));
    const onlyTheirs = [...theirSet].filter((w) => !mySet.has(w));
    const wordChips = (words, tone) => h('div', { class: 'row wrap gap-xs' },
      words.length ? words.sort((a, b) => b.length - a.length).map((w) =>
        h('span', { class: 'chip', style: `min-height:28px;padding:2px 11px;font-size:13px;${tone}` }, `${w} +${scoreWord(w)}`))
        : h('span', { class: 'small faint' }, 'none!'));
    zone.append(h('div', { class: 'sticker', style: 'padding:16px;' },
      h('div', { class: 'small sub', style: 'font-weight:650;' }, `only ${ctx.myName} found:`),
      wordChips(onlyMine, 'background:var(--me-ghost);'),
      h('div', { class: 'small sub mt-sm', style: 'font-weight:650;' }, `only ${ctx.partnerName} found:`),
      wordChips(onlyTheirs, 'background:var(--them-ghost);'),
      h('div', { class: 'small sub mt-sm', style: 'font-weight:650;' }, 'you both found:'),
      wordChips(shared, ''),
    ));
  },
};
