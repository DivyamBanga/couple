// daily word — same secret word for both of you, solve separately,
// compare grids when you've both finished.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { navigate } from '../../router.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { connection } from '../../sync/connection.js';
import { getAnswer, putMyAnswer, streak, dailyEvents, getDraft, putDraft } from './store.js';
import { fnv1a32 } from '../../core/hash.js';
import { todayKey } from '../../core/time.js';
import { loadWordle } from '../../core/dict.js';
import { createWordleSurface, WORDLE_CSS } from '../wordleduel/game.js';
import { store, K } from '../../core/storage.js';
import { vibrate } from '../../core/ui/dom.js';

const KEY = 'dailyword';

function gridRows(guesses) {
  return guesses.map((g) => g.marks);
}

function renderGrid(rows, { size = 26 } = {}) {
  const wrap = h('div', { class: 'wd-board', style: `width:${size * 5 + 24}px;` });
  for (const marks of rows) {
    const row = h('div', { class: 'wd-row' });
    for (const m of marks) row.append(h('div', { class: `wd-tile wd-tile--${m}`, style: `font-size:0;border-radius:6px;` }));
    wrap.append(row);
  }
  return wrap;
}

export default {
  id: 'dailyword',
  engine: 'viewer',
  css: WORDLE_CSS,
  blurb: 'same word for you both. who solves it faster?',

  mountViewer(el) {
    const me = whoAmI();
    const partner = partnerOf(me);
    const body = h('div', { class: 'stack gap-md grow' });
    let surface = null;
    let wordle = null;
    const unsubs = [];

    const ctx = { haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); } };

    const render = () => {
      if (!wordle) return;
      clear(body);
      surface?.destroy?.();
      surface = null;

      const target = wordle.answers[fnv1a32(`${todayKey()}|${KEY}`) % wordle.answers.length];
      const mine = getAnswer(KEY, me);
      const theirs = getAnswer(KEY, partner);
      const n = streak(KEY);

      if (!mine) {
        const draft = getDraft(KEY) ?? { guesses: [], startedAt: Date.now() };
        if (!getDraft(KEY)) putDraft(KEY, draft);
        const zone = h('div', { class: 'stack grow', style: 'justify-content:center;' });
        body.append(
          h('div', { class: 'hand sub center-text', style: 'font-size:16px;' },
            `one word, same for you and ${nameOf(partner)} · ${todayKey()}`),
          zone,
        );
        surface = createWordleSurface(zone, {
          target,
          allowed: wordle.allowed,
          ctx,
          restoredGuesses: draft.guesses,
          startedAt: draft.startedAt,
          onGuess: (guess) => {
            draft.guesses.push(guess);
            putDraft(KEY, draft);
          },
          onDone: ({ solved, guesses, ms }) => {
            putMyAnswer(KEY, { solved, guesses: guesses.length, ms, rows: gridRows(guesses) });
            if (solved) { ctx.haptic([20, 40, 20]); heartBurst(zone, { count: 6, emoji: '🟩' }); }
            setTimeout(render, solved ? 1100 : 500);
          },
        });
        return;
      }

      const myCard = h('div', { class: `sticker p-${me} stack center gap-xs`, style: 'padding:14px;border-color:var(--p-soft);flex:1;' },
        h('span', { class: 'avatar avatar--sm' }, emojiOf(me)),
        renderGrid(mine.rows),
        h('span', { class: 'small', style: 'font-weight:650;' }, mine.solved ? `${mine.guesses}/6 · ${(mine.ms / 1000).toFixed(0)}s` : 'X/6 💀'),
      );

      if (!theirs) {
        body.append(
          h('div', { class: 'row center' }, myCard),
          h('div', { class: 'rv-waiting' },
            h('div', { style: 'font-size:40px;animation:bob 2.6s ease-in-out infinite;' }, emojiOf(partner)),
            h('div', { class: 'hand', style: 'font-size:18px;margin-top:6px;' }, `${nameOf(partner)} hasn't finished today's word`,
              h('span', { class: 'dots-thinking' })),
            h('div', { class: 'small faint mt-sm' }, 'their grid appears here once they\'re done — the word stays secret'),
          ),
        );
        return;
      }

      const theirCard = h('div', { class: `sticker p-${partner} stack center gap-xs`, style: 'padding:14px;border-color:var(--p-soft);flex:1;' },
        h('span', { class: 'avatar avatar--sm' }, emojiOf(partner)),
        renderGrid(theirs.rows),
        h('span', { class: 'small', style: 'font-weight:650;' }, theirs.solved ? `${theirs.guesses}/6 · ${(theirs.ms / 1000).toFixed(0)}s` : 'X/6 💀'),
      );

      let verdict;
      if (mine.solved && !theirs.solved) verdict = `you got it, ${nameOf(partner)} didn't 😌`;
      else if (!mine.solved && theirs.solved) verdict = `${nameOf(partner)} got it… you did not 🫠`;
      else if (!mine.solved && !theirs.solved) verdict = `it beat you BOTH. it was "${target.toUpperCase()}" 💀`;
      else if (mine.guesses !== theirs.guesses) verdict = `${mine.guesses < theirs.guesses ? 'you win' : `${nameOf(partner)} wins`} today's word ⚡`;
      else if (mine.ms !== theirs.ms) verdict = `same guesses — ${mine.ms < theirs.ms ? 'you were faster' : `${nameOf(partner)} was faster`} ⏱️`;
      else verdict = 'identical performance. couple goals 🤝';

      body.append(
        h('div', { class: 'row gap-sm', style: 'align-items:stretch;' }, myCard, theirCard),
        h('div', { class: 'rv-verdict' }, verdict),
        n >= 2 ? h('div', { class: 'center' }, h('span', { class: 'chip', style: 'background:var(--butter);color:#7a4c09;font-weight:700;' }, `🔥 ${n} day streak`)) : null,
        h('div', { class: 'small faint center-text' }, 'new word at midnight'),
      );
      heartBurst(body, { count: 4 });
    };

    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title grow' }, '🟨 daily word'),
      ),
      body,
    ));

    loadWordle().then((w) => { wordle = w; render(); });
    unsubs.push(dailyEvents.on('changed', render));
    unsubs.push(connection.onPartner(() => {}));
    return () => { surface?.destroy?.(); unsubs.forEach((u) => u()); };
  },
};
