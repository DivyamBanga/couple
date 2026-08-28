// who's more likely — point fingers, lovingly.
import { h } from '../../core/ui/dom.js';
import { heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { PLAYERS } from '../../config.js';
import deck from '../../../data/decks/wmlt.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 10;

export default {
  id: 'wmlt',
  engine: 'reveal',
  deckId: 'wmlt',
  scored: false,
  blurb: 'point the finger. agree, and it\'s legally binding.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `who's more likely to… (${r + 1}/${ctx.rounds})`),
      h('div', { class: 'rv-question' }, item.text),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    const voteBtn = (who) => h('button', {
      class: `rv-option p-${who}`, style: 'border-color:var(--p-soft);',
      onclick: () => submit(who),
    },
      h('span', { style: 'font-size:34px;display:block;' }, PLAYERS[who].emoji),
      h('span', { style: 'font-weight:650;' }, PLAYERS[who].name),
    );
    zone.append(h('div', { class: 'row gap-sm' }, voteBtn('diya'), voteBtn('divyam')));
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const unanimous = mine === theirs;
    const accused = unanimous ? mine : null;
    zone.append(
      h('div', { class: 'row gap-sm', style: 'justify-content:center;' },
        h('span', { class: `rv-chip p-${ctx.me}` }, `${ctx.myEmoji} you said: ${PLAYERS[mine].name}`),
        h('span', { class: `rv-chip p-${ctx.partner}` }, `${ctx.partnerEmoji} ${ctx.partnerName} said: ${PLAYERS[theirs].name}`),
      ),
      unanimous
        ? h('div', { class: 'stack center gap-xs' },
          h('div', { style: 'font-size:52px;animation:bob 1.6s ease-in-out infinite;' }, PLAYERS[accused].emoji),
          h('div', { class: 'rv-verdict' }, `unanimous. it's ${PLAYERS[accused].name} 😭⚖️`))
        : h('div', { class: 'rv-verdict' }, 'hung jury — you each blamed the other 🤨'),
    );
    if (unanimous) heartBurst(zone, { count: 5, emoji: '⚖️' });
  },

  scoreRound(item, answers) {
    const [a, b] = Object.values(answers);
    return { match: a === b };
  },

  summaryLine(t, ctx) {
    return `${t.matches} unanimous verdicts out of ${ctx.rounds} ⚖️`;
  },
};
