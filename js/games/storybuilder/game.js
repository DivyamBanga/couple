// story builder — co-write a disaster, one sentence at a time.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS } from '../../engines/prompt/engine.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { toast } from '../../core/ui/toast.js';
import { partnerOf } from '../../core/identity.js';
import deck from '../../../data/decks/story.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const MIN_EACH = 4;

export default {
  id: 'storybuilder',
  engine: 'prompt',
  css: PROMPT_CSS,
  deckId: 'story',
  blurb: 'one sentence each. no plan. no brakes. read it aloud after.',
  sampleItems: makeSampler(deck, 1),
  getItem: (id) => byId.get(id),

  init(ctx) {
    return { sentences: [], turn: ctx.session.first, endBy: null, done: false };
  },

  fold(state, step, by, ctx) {
    if (state.done) return null;
    if (by !== state.turn) return null;
    const other = partnerOf(by);

    if (step.k === 'sentence') {
      if (typeof step.text !== 'string') return null;
      const text = step.text.trim();
      if (text.length < 3 || text.length > 200) return null;
      return { ...state, sentences: [...state.sentences, { by, text: text.slice(0, 200) }], turn: other, endBy: null };
    }
    if (step.k === 'end') {
      const myCount = state.sentences.filter((s) => s.by === by).length;
      if (myCount < MIN_EACH) return null;
      if (state.endBy && state.endBy !== by) return { ...state, done: true };
      return { ...state, endBy: by, turn: other };
    }
    return null;
  },

  isDone(state) {
    if (!state.done) return null;
    return { result: { winner: null, draw: true, reason: 'draw' }, score: null };
  },

  resultText() { return 'a masterpiece 📖'; },

  progressOf() { return null; },

  render(zone, state, ctx) {
    const seed = ctx.item(ctx.itemIds[0])?.text ?? 'Once upon a time…';
    const myTurn = state.turn === ctx.me;
    const myCount = state.sentences.filter((s) => s.by === ctx.me).length;

    const story = h('div', { class: 'sticker pr-story', style: 'padding:18px 16px;max-height:38dvh;overflow-y:auto;' },
      h('span', { class: 's-seed' }, seed + ' '),
      state.sentences.map((s) => h('span', { class: `s-${s.by}` }, s.text + ' ')),
    );
    zone.append(
      h('div', { class: 'row gap-sm', style: 'justify-content:space-between;align-items:center;' },
        h('span', { class: 'washi washi--butter' }, 'your story so far 📖'),
        h('span', { class: 'small sub' }, `${state.sentences.length} sentences`),
      ),
      story,
    );
    setTimeout(() => { story.scrollTop = story.scrollHeight; }, 30);

    if (state.endBy && state.endBy !== ctx.me) {
      zone.append(h('div', { class: 'pr-bubble pr-bubble--sys', style: 'align-self:center;' },
        `${ctx.partnerName} thinks it's the end… continue or agree?`));
    }

    if (myTurn) {
      const input = h('textarea', { class: 'input', rows: '2', placeholder: 'and then…', maxlength: '200' });
      const addBtn = h('button', {
        class: 'btn btn--me grow',
        onclick: () => {
          const t = input.value.trim();
          if (t.length < 3) return toast('a real sentence please 😌', { ms: 1400 });
          ctx.submit({ k: 'sentence', text: t });
        },
      }, 'add sentence ✍️');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addBtn.click(); } });
      const endBtn = myCount >= MIN_EACH ? h('button', {
        class: `btn ${state.endBy ? 'btn--butter' : 'btn--ghost'}`,
        onclick: () => ctx.submit({ k: 'end' }),
      }, state.endBy ? 'agree: the end 🎬' : 'the end? 🎬') : null;
      zone.append(h('div', { class: 'stack gap-xs' }, input, h('div', { class: 'row gap-xs' }, addBtn, endBtn)));
      setTimeout(() => input.focus(), 150);
    } else {
      zone.append(h('div', { class: 'rv-waiting' },
        h('div', { class: 'hand', style: 'font-size:17px;' }, `${ctx.partnerName} is writing`,
          h('span', { class: 'dots-thinking' })),
      ));
    }
  },

  renderEpilogue(zone, state, ctx) {
    const seed = ctx.item(ctx.itemIds[0])?.text ?? '';
    zone.append(
      h('div', { class: 'pr-story', style: 'text-align:left;font-size:15px;' },
        h('span', { class: 's-seed' }, seed + ' '),
        state.sentences.map((s) => h('span', { class: `s-${s.by}` }, s.text + ' ')),
      ),
      h('div', { class: 'hand sub mt-sm' }, '— written by divyam & diya'),
    );
  },
};
