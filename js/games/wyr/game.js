// would you rather — pure conversation fuel, no scoring.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import deck from '../../../data/decks/wyr.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 10;

function optionCard(label, text, onTap) {
  return h('button', { class: 'rv-option', onclick: onTap },
    h('span', { class: 'hand', style: 'font-size:15px;color:var(--ink-faint);display:block;' }, label),
    h('span', {}, text),
  );
}

export default {
  id: 'wyr',
  engine: 'reveal',
  deckId: 'wyr',
  scored: false,
  blurb: 'impossible choices, revealed together. defend yourself.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `would you rather… (${r + 1}/${ctx.rounds})`),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    let sel = null;
    const lockBtn = h('button', { class: 'btn btn--me btn--big', style: 'align-self:center;min-width:200px;', disabled: true, onclick: () => submit(sel) }, 'lock it in 💘');
    const cards = {};
    const pick = (key) => {
      sel = key;
      cards.a.classList.toggle('rv-option--sel', key === 'a');
      cards.b.classList.toggle('rv-option--sel', key === 'b');
      lockBtn.disabled = false;
      ctx.haptic(8);
    };
    cards.a = optionCard('option one', item.a, () => pick('a'));
    cards.b = optionCard('option two', item.b, () => pick('b'));
    zone.append(cards.a, h('div', { class: 'hand center-text sub' }, 'or'), cards.b, h('div', { class: 'mt-sm center' }, lockBtn));
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const match = mine === theirs;
    const chipFor = (who, emoji) => h('span', { class: `rv-chip p-${who}` }, h('span', {}, emoji), h('span', {}, who));
    const side = (key, text) => {
      const pickers = [];
      if (mine === key) pickers.push(chipFor(ctx.me, ctx.myEmoji));
      if (theirs === key) pickers.push(chipFor(ctx.partner, ctx.partnerEmoji));
      return h('div', {
        class: 'rv-option',
        style: `pointer-events:none;${pickers.length ? 'border-color:var(--butter-deep);background:#fffdf4;' : 'opacity:.55;'}`,
      }, h('span', {}, text), pickers.length ? h('div', { class: 'row gap-xs mt-sm', style: 'justify-content:center;' }, pickers) : null);
    };
    zone.append(
      side('a', item.a),
      side('b', item.b),
      h('div', { class: 'rv-verdict' }, match ? 'same brain 🫶' : 'opposites attract… make your case 👀'),
    );
    if (match) heartBurst(zone, { count: 5 });
  },

  scoreRound(item, answers) {
    const [a, b] = Object.values(answers);
    return { match: a === b };
  },

  summaryLine(t, ctx) {
    if (t.matches >= ctx.rounds * 0.7) return 'terrifyingly compatible 🫶';
    if (t.matches >= ctx.rounds * 0.4) return 'agree on the big stuff, fight about the rest 😌';
    return 'complete opposites. it\'s called balance 💅';
  },
};
