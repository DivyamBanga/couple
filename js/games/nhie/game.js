// never have i ever — confessions on tap.
import { h } from '../../core/ui/dom.js';
import { heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import deck from '../../../data/decks/nhie.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 10;

export default {
  id: 'nhie',
  engine: 'reveal',
  deckId: 'nhie',
  scored: false,
  blurb: 'confess, you two. every answer is a story.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `never have i ever… (${r + 1}/${ctx.rounds})`),
      h('div', { class: 'rv-question' }, item.text),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    zone.append(h('div', { class: 'row gap-sm' },
      h('button', { class: 'rv-option', style: 'background:var(--coral-ghost);border-color:var(--coral);', onclick: () => submit('have') },
        h('span', { style: 'font-size:26px;display:block;' }, '🙋'), 'I have…'),
      h('button', { class: 'rv-option', style: 'background:var(--mint-ghost);border-color:var(--mint);', onclick: () => submit('never') },
        h('span', { style: 'font-size:26px;display:block;' }, '😇'), 'never!'),
    ));
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const chip = (who, emoji, val) => h('div', { class: `sticker row gap-sm p-${who}`, style: 'padding:12px 14px;' },
      h('span', { class: 'avatar avatar--sm' }, emoji),
      h('span', { class: 'grow', style: 'font-weight:620;' }, who),
      h('span', { style: 'font-size:22px;' }, val === 'have' ? '🙋' : '😇'),
    );
    let verdict;
    if (mine === 'have' && theirs === 'have') verdict = 'BOTH of you?? story time, immediately 🍿';
    else if (mine === 'never' && theirs === 'never') verdict = 'two little angels 😇 (allegedly)';
    else verdict = `${mine === 'have' ? ctx.myName : ctx.partnerName} has a story to tell 👀`;
    zone.append(chip(ctx.me, ctx.myEmoji, mine), chip(ctx.partner, ctx.partnerEmoji, theirs),
      h('div', { class: 'rv-verdict' }, verdict));
    if (mine === 'have' && theirs === 'have') heartBurst(zone, { count: 4, emoji: '🍿' });
  },

  scoreRound(item, answers) {
    const [a, b] = Object.values(answers);
    return { match: a === b };
  },

  summaryLine(t, ctx) {
    return t.matches >= ctx.rounds * 0.6 ? 'you two have lived the same life 🫶' : 'so many stories left to trade 📖';
  },
};
