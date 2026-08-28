// emoji decode — translate your brain into emoji; partner deciphers.
// Also exports the shared compose→guess factory used by describe-it-badly.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS, fuzzyMatch } from '../../engines/prompt/engine.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { toast } from '../../core/ui/toast.js';
import { nameOf } from '../../core/identity.js';
import deck from '../../../data/decks/emoji.js';

// ── shared factory: composer encodes a deck answer, responder guesses ──
export function makeGuessingGame({ rounds, clueLabel, composeView, clueView, answerOf, validateClue }) {
  return {
    init() {
      return {
        round: 0, phase: 'compose', clue: null, guesses: [],
        points: { diya: 0, divyam: 0 }, log: [], done: false,
      };
    },

    fold(state, step, by, ctx) {
      if (state.done) return null;
      const composer = ctx.composerOf(state.round);
      const responder = composer === 'diya' ? 'divyam' : 'diya';
      const item = ctx.item(ctx.itemIds[state.round]);
      const answer = item ? answerOf(item) : '';

      const nextRound = (s, winnerOfRound, solved) => {
        const points = { ...s.points };
        points[winnerOfRound] += 1;
        const log = [...s.log, { round: s.round, clue: s.clue, answer, solved, guesses: s.guesses.length }];
        const round = s.round + 1;
        return { ...s, points, log, round, done: round >= rounds, phase: 'compose', clue: null, guesses: [] };
      };

      if (step.k === 'clue') {
        if (by !== composer || state.phase !== 'compose') return null;
        if (typeof step.text !== 'string' || !validateClue(step.text)) return null;
        return { ...state, clue: step.text.slice(0, 200), phase: 'guess', guesses: [] };
      }
      if (step.k === 'guess') {
        if (by !== responder || state.phase !== 'guess') return null;
        if (typeof step.text !== 'string' || !step.text.trim()) return null;
        const guesses = [...state.guesses, step.text.trim().slice(0, 80)];
        if (fuzzyMatch(step.text, answer)) return nextRound({ ...state, guesses }, responder, true);
        return { ...state, guesses };
      }
      if (step.k === 'accept') { // composer's "close enough" override
        if (by !== composer || state.phase !== 'guess' || state.guesses.length === 0) return null;
        return nextRound(state, responder, true);
      }
      if (step.k === 'giveup') {
        if (by !== responder || state.phase !== 'guess') return null;
        return nextRound(state, composer, false);
      }
      return null;
    },

    isDone(state) {
      if (!state.done) return null;
      const { diya, divyam } = state.points;
      const result = diya === divyam
        ? { winner: null, draw: true, reason: 'draw' }
        : { winner: diya > divyam ? 'diya' : 'divyam', draw: false, reason: 'win' };
      return { result, score: { diya, divyam } };
    },

    progressOf(state) { return { done: state.round, total: rounds }; },

    render(zone, state, ctx) {
      const composer = ctx.composerOf(state.round);
      const iCompose = composer === ctx.me;
      const item = ctx.item(ctx.itemIds[state.round]);

      if (state.phase === 'compose') {
        if (iCompose) composeView(zone, item, ctx, state);
        else {
          zone.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
            h('div', { style: 'font-size:42px;animation:bob 2.4s ease-in-out infinite;' }, ctx.partnerEmoji),
            h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, `${ctx.partnerName} is composing ${clueLabel}`,
              h('span', { class: 'dots-thinking' })),
          ));
        }
        return;
      }

      // guess phase
      clueView(zone, state.clue, item, ctx);
      const guessLog = h('div', { class: 'row wrap gap-xs', style: 'justify-content:center;min-height:30px;' },
        state.guesses.slice(-6).map((g) => h('span', { class: 'chip', style: 'min-height:28px;padding:2px 11px;font-size:13px;opacity:.75;' }, `"${g}" ✗`)));
      zone.append(guessLog);

      if (iCompose) {
        zone.append(
          h('div', { class: 'hand center-text sub', style: 'font-size:16px;' },
            state.guesses.length ? 'wrong so far… you may show mercy' : `${ctx.partnerName} is decoding`,
            h('span', { class: 'dots-thinking' })),
          state.guesses.length ? h('button', {
            class: 'btn btn--mint', style: 'align-self:center;',
            onclick: () => ctx.submit({ k: 'accept' }),
          }, 'close enough ✓ (give it to them)') : null,
        );
      } else {
        const input = h('input', { class: 'input', placeholder: 'your guess…', maxlength: '80', autocomplete: 'off' });
        const go = h('button', {
          class: 'btn btn--me',
          onclick: () => {
            if (!input.value.trim()) return;
            ctx.submit({ k: 'guess', text: input.value });
            input.value = '';
            input.focus();
          },
        }, 'guess!');
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
        zone.append(
          h('div', { class: 'stack gap-xs' }, input,
            h('div', { class: 'row gap-xs' }, go,
              h('button', { class: 'btn btn--ghost', onclick: () => ctx.submit({ k: 'giveup' }) }, 'i give up 🏳️'))),
        );
        setTimeout(() => input.focus(), 150);
      }
    },

    resultText(state, record) {
      const w = record?.result?.winner;
      return w ? `${nameOf(w)} wins the decode war 🧠` : 'perfectly telepathic, both of you';
    },

    renderEpilogue(zone, state) {
      for (const r of state.log) {
        zone.append(h('div', { class: 'small', style: 'padding:3px 0;border-bottom:1px dashed var(--paper-dot);' },
          `${r.solved ? '✓' : '🏳️'} "${r.answer}"`));
      }
    },
  };
}

const byId = new Map(deck.items.map((i) => [i.id, i]));
const CATS = { movie: '🎬 movie', song: '🎵 song', food: '🍜 food', place: '🗺️ place', phrase: '💬 phrase' };
const noLetters = (t) => t.trim().length > 0 && !/[a-z]/i.test(t);

const base = makeGuessingGame({
  rounds: 6,
  clueLabel: 'an emoji riddle',
  answerOf: (item) => item.answer,
  validateClue: noLetters,
  composeView(zone, item, ctx) {
    const input = h('input', { class: 'input', style: 'text-align:center;font-size:26px;', placeholder: '🫵🧠➡️😀', maxlength: '40', autocomplete: 'off' });
    zone.append(
      h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, 'translate this into emoji:'),
        h('div', { class: 'rv-question' }, `"${item.answer}"`),
        h('div', { class: 'small sub mt-sm' }, `category: ${CATS[item.cat] ?? item.cat} · emojis only, no letters!`),
      ),
      input,
      h('div', { class: 'row gap-xs' },
        h('button', {
          class: 'btn btn--ghost grow',
          onclick: () => { input.value = item.emojis; input.focus(); },
        }, 'use the suggestion 💡'),
        h('button', {
          class: 'btn btn--me grow',
          onclick: () => {
            if (!noLetters(input.value)) return toast('emojis only — no letters allowed 😌', { ms: 1800 });
            ctx.submit({ k: 'clue', text: input.value.trim() });
          },
        }, 'send it 📤'),
      ),
    );
    setTimeout(() => input.focus(), 150);
  },
  clueView(zone, clue, item, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `decode ${ctx.partnerName}'s brain (${CATS[item.cat] ?? item.cat})`),
      h('div', { style: 'font-size:44px;line-height:1.3;letter-spacing:4px;' }, clue),
    ));
  },
});

export default {
  ...base,
  id: 'emojidecode',
  engine: 'prompt',
  css: PROMPT_CSS,
  deckId: 'emoji',
  blurb: 'turn famous things into emoji. hope your partner speaks fluent you.',
  sampleItems: makeSampler(deck, 6),
  getItem: (id) => byId.get(id),
};
