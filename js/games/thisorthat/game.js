// this or that — gut picks PLUS predicting your partner's pick.
import { h } from '../../core/ui/dom.js';
import { heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import deck from '../../../data/decks/thisorthat.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 12;

export default {
  id: 'thisorthat',
  engine: 'reveal',
  deckId: 'tot',
  scored: true,
  blurb: 'pick your side, then bet on hers. gut answers only.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `quick! (${r + 1}/${ctx.rounds})`),
      h('div', { class: 'rv-question' }, `${item.a}  ⚡  ${item.b}`),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    const state = { pick: null, predict: null };
    const btn = (key, text, field, group) => {
      const b = h('button', {
        class: 'rv-option', style: 'min-height:52px;',
        onclick: () => {
          state[field] = key;
          group.forEach((x) => x.el.classList.toggle('rv-option--sel', x.key === key));
          ctx.haptic(8);
          maybeReady();
        },
      }, text);
      group.push({ key, el: b });
      return b;
    };
    const lockBtn = h('button', { class: 'btn btn--me btn--big', style: 'align-self:center;min-width:200px;', disabled: true, onclick: () => submit(state) }, 'lock both 💘');
    const maybeReady = () => { lockBtn.disabled = !(state.pick && state.predict); };

    const g1 = [];
    const g2 = [];
    zone.append(
      h('div', { class: 'small sub center-text', style: 'font-weight:620;' }, 'you pick:'),
      h('div', { class: 'row gap-sm' }, btn('a', item.a, 'pick', g1), btn('b', item.b, 'pick', g1)),
      h('div', { class: 'small sub center-text mt-sm', style: 'font-weight:620;' }, `and ${ctx.partnerName} will pick…?`),
      h('div', { class: 'row gap-sm' }, btn('a', item.a, 'predict', g2), btn('b', item.b, 'predict', g2)),
      h('div', { class: 'mt-sm center' }, lockBtn),
    );
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const label = (k) => (k === 'a' ? item.a : item.b);
    const iGuessedRight = mine.predict === theirs.pick;
    const theyGuessedRight = theirs.predict === mine.pick;
    const row = (who, emoji, data, guessedRight) => h('div', { class: `sticker row gap-sm p-${who}`, style: 'padding:12px 14px;' },
      h('span', { class: 'avatar avatar--sm' }, emoji),
      h('span', { class: 'stack grow' },
        h('span', { style: 'font-weight:620;' }, label(data.pick)),
        h('span', { class: 'small sub' }, `guessed "${label(data.predict)}" for the other → ${guessedRight ? 'right! +1' : 'nope'}`),
      ),
      h('span', { style: 'font-size:20px;' }, guessedRight ? '🎯' : '💨'),
    );
    zone.append(
      row(ctx.me, ctx.myEmoji, mine, iGuessedRight),
      row(ctx.partner, ctx.partnerEmoji, theirs, theyGuessedRight),
      h('div', { class: 'rv-verdict' },
        mine.pick === theirs.pick ? 'and you PICKED the same 🫶' : 'split decision ⚖️'),
    );
    if (iGuessedRight && theyGuessedRight) heartBurst(zone, { count: 5 });
  },

  scoreRound(item, answers, r, ctx) {
    const mine = answers[ctx.me];
    const theirs = answers[ctx.partner];
    const points = { diya: 0, divyam: 0 };
    if (answers.diya.predict === answers.divyam.pick) points.diya++;
    if (answers.divyam.predict === answers.diya.pick) points.divyam++;
    return { points, match: mine.pick === theirs.pick };
  },

  summaryLine(t) {
    if (t.diya === t.divyam) return 'you read each other equally well 🔮';
    return `${t.diya > t.divyam ? 'diya' : 'divyam'} is the better mind-reader 🔮`;
  },
};
