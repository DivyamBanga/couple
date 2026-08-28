// truth or dare — chooser picks the poison, partner judges the performance.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS } from '../../engines/prompt/engine.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { nameOf } from '../../core/identity.js';
import deck from '../../../data/decks/truthordare.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 8;
const CHILI = { 1: '🍦 sweet', 2: '💋 flirty', 3: '🌶️ spicy' };

// per-round UI selection (not shared state)
let sel = { round: -1, intensity: 1 };

export default {
  id: 'truthordare',
  engine: 'prompt',
  css: PROMPT_CSS,
  deckId: 'tod',
  blurb: 'pick truth or dare, pick your heat, deliver. no chickening.',
  sampleItems: makeSampler(deck, 40),
  getItem: (id) => byId.get(id),

  init() {
    return { round: 0, phase: 'choose', card: null, used: [], points: { diya: 0, divyam: 0 }, done: false };
  },

  fold(state, step, by, ctx) {
    if (state.done) return null;
    const chooser = ctx.composerOf(state.round);
    if (step.k === 'pick') {
      if (by !== chooser || state.phase !== 'choose') return null;
      if (!['truth', 'dare'].includes(step.kind) || ![1, 2, 3].includes(step.intensity)) return null;
      const find = (pred) => ctx.itemIds.find((id) => !state.used.includes(id) && pred(byId.get(id)));
      const cardId = find((i) => i?.kind === step.kind && i?.intensity === step.intensity)
        ?? find((i) => i?.kind === step.kind)
        ?? find(() => true);
      if (!cardId) return null;
      return { ...state, card: cardId, used: [...state.used, cardId], phase: 'perform' };
    }
    if (step.k === 'judge') {
      if (by === chooser || state.phase !== 'perform') return null;
      if (!['done', 'chicken'].includes(step.v)) return null;
      const points = { ...state.points };
      if (step.v === 'chicken') points[by] += 1;
      const round = state.round + 1;
      return { ...state, points, round, card: null, phase: 'choose', done: round >= ROUNDS };
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

  resultText(state, record) {
    const w = record?.result?.winner;
    if (!w) return 'zero chickens. legends.';
    const loser = w === 'diya' ? 'divyam' : 'diya';
    return `${nameOf(loser)} chickened ${state.points[w]}× 🐔`;
  },

  progressOf(state) { return { done: state.round, total: ROUNDS }; },

  render(zone, state, ctx) {
    const chooser = ctx.composerOf(state.round);
    const iChoose = chooser === ctx.me;

    if (state.phase === 'choose') {
      if (sel.round !== state.round) sel = { round: state.round, intensity: 1 };
      if (iChoose) {
        const chips = [1, 2, 3].map((n) => h('button', {
          class: 'chip',
          'aria-pressed': String(sel.intensity === n),
          onclick: (e) => {
            sel.intensity = n;
            e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
            e.currentTarget.setAttribute('aria-pressed', 'true');
          },
        }, CHILI[n]));
        zone.append(
          h('div', { class: 'sticker rv-card' },
            h('div', { class: 'rv-kicker' }, `round ${state.round + 1} of ${ROUNDS} — your pick`),
            h('div', { class: 'rv-question' }, 'truth… or dare?'),
          ),
          h('div', { class: 'row gap-xs', style: 'justify-content:center;' }, chips),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'rv-option', onclick: () => ctx.submit({ k: 'pick', kind: 'truth', intensity: sel.intensity }) },
              h('span', { style: 'font-size:30px;display:block;' }, '🙊'), 'truth'),
            h('button', { class: 'rv-option', onclick: () => ctx.submit({ k: 'pick', kind: 'dare', intensity: sel.intensity }) },
              h('span', { style: 'font-size:30px;display:block;' }, '😈'), 'dare'),
          ),
        );
      } else {
        zone.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
          h('div', { style: 'font-size:42px;animation:bob 2.4s ease-in-out infinite;' }, ctx.partnerEmoji),
          h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, `${ctx.partnerName} is choosing their fate`,
            h('span', { class: 'dots-thinking' })),
        ));
      }
      return;
    }

    // perform phase
    const item = ctx.item(state.card);
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'row gap-xs', style: 'justify-content:center;' },
        h('span', { class: 'chip', style: 'min-height:30px;' }, item.kind === 'truth' ? '🙊 truth' : '😈 dare'),
        h('span', { class: 'chip', style: 'min-height:30px;' }, CHILI[item.intensity]),
        item.remote === false ? h('span', { class: 'chip', style: 'min-height:30px;' }, '🏠 in person') : null,
      ),
      h('div', { class: 'rv-question mt-sm', style: 'font-size:21px;' }, item.text),
    ));
    if (iChoose) {
      zone.append(h('div', { class: 'rv-waiting' },
        h('div', { class: 'hand', style: 'font-size:18px;' }, item.kind === 'truth' ? 'answer honestly. out loud. all of it.' : 'go on then. do it.'),
        h('div', { class: 'small faint mt-sm' }, `${ctx.partnerName} decides if it counts`),
      ));
    } else {
      zone.append(
        h('div', { class: 'hand sub center-text', style: 'font-size:17px;' }, `${ctx.partnerName} has to deliver. you're the judge.`),
        h('div', { class: 'row gap-sm' },
          h('button', { class: 'rv-option', style: 'background:var(--mint-ghost);border-color:var(--mint);', onclick: () => ctx.submit({ k: 'judge', v: 'done' }) },
            h('span', { style: 'font-size:26px;display:block;' }, '✓'), 'they did it'),
          h('button', { class: 'rv-option', style: 'background:var(--coral-ghost);border-color:var(--coral);', onclick: () => ctx.submit({ k: 'judge', v: 'chicken' }) },
            h('span', { style: 'font-size:26px;display:block;' }, '🐔'), 'CHICKEN! +1 me'),
        ),
      );
    }
  },
};
