// describe it badly — technically accurate, maximally unhelpful.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS } from '../../engines/prompt/engine.js';
import { makeGuessingGame } from '../emojidecode/game.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { toast } from '../../core/ui/toast.js';
import deck from '../../../data/decks/describe.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));

const base = makeGuessingGame({
  rounds: 6,
  clueLabel: 'a terrible description',
  answerOf: (item) => item.text,
  validateClue: (t) => t.trim().length >= 10 && t.trim().length <= 140,
  composeView(zone, item, ctx) {
    const input = h('textarea', { class: 'input', rows: '3', placeholder: 'e.g. "boat gets an ice problem, door was definitely big enough"', maxlength: '140' });
    zone.append(
      h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, 'describe this as BADLY as possible:'),
        h('div', { class: 'rv-question' }, `"${item.text}"`),
        h('div', { class: 'small sub mt-sm' }, 'technically true. maximally unhelpful. 10–140 chars.'),
      ),
      input,
      h('button', {
        class: 'btn btn--me btn--big',
        onclick: () => {
          const t = input.value.trim();
          if (t.length < 10) return toast('at least 10 characters of nonsense please', { ms: 1800 });
          ctx.submit({ k: 'clue', text: t });
        },
      }, 'publish my masterpiece 🗯️'),
    );
    setTimeout(() => input.focus(), 150);
  },
  clueView(zone, clue, item, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `${ctx.partnerName}'s award-winning description:`),
      h('div', { class: 'rv-question', style: 'font-family:var(--font-hand);font-size:22px;' }, `"${clue}"`),
    ));
  },
});

export default {
  ...base,
  id: 'describeit',
  engine: 'prompt',
  css: PROMPT_CSS,
  deckId: 'describe',
  blurb: 'explain famous things terribly. somehow she\'ll still get it.',
  sampleItems: makeSampler(deck, 6),
  getItem: (id) => byId.get(id),
};
