// trivia battle — same questions, speed matters.
import { h } from '../../core/ui/dom.js';
import { heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { nameOf } from '../../core/identity.js';
import deck from '../../../data/decks/trivia.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 10;
const CATS = { movies: '🎬', music: '🎵', food: '🍜', science: '🔬', animals: '🦦', geo: '🗺️', sports: '🏅', random: '🎲' };

export default {
  id: 'trivia',
  engine: 'reveal',
  deckId: 'trivia',
  scored: true,
  blurb: 'same questions, first-instinct answers. speed breaks ties.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    zone.append(h('div', { class: 'sticker rv-card' },
      h('div', { class: 'rv-kicker' }, `${CATS[item.cat] ?? '🎲'} ${item.cat} · ${r + 1}/${ctx.rounds}`),
      h('div', { class: 'rv-question' }, item.q),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    const t0 = performance.now();
    zone.append(...item.choices.map((c, idx) => h('button', {
      class: 'rv-option', style: 'min-height:54px;',
      onclick: () => submit({ choice: idx, ms: Math.round(performance.now() - t0) }),
    }, c)));
    zone.append(h('div', { class: 'small faint center-text' }, 'first instinct! the clock is running ⏱️'));
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const meRight = mine.choice === item.answer;
    const themRight = theirs.choice === item.answer;
    zone.append(
      h('div', { class: 'stack gap-xs' }, item.choices.map((c, idx) => {
        const correct = idx === item.answer;
        const chips = [];
        if (mine.choice === idx) chips.push(h('span', { class: `rv-chip p-${ctx.me}`, style: 'font-size:12.5px;padding:2px 8px 2px 4px;' }, ctx.myEmoji, ` ${(mine.ms / 1000).toFixed(1)}s`));
        if (theirs.choice === idx) chips.push(h('span', { class: `rv-chip p-${ctx.partner}`, style: 'font-size:12.5px;padding:2px 8px 2px 4px;' }, ctx.partnerEmoji, ` ${(theirs.ms / 1000).toFixed(1)}s`));
        return h('div', {
          class: 'rv-option',
          style: `pointer-events:none;${correct ? 'border-color:var(--mint-deep);background:var(--mint-ghost);' : 'opacity:.55;'}`,
        }, c, chips.length ? h('span', { class: 'row gap-xs', style: 'justify-content:center;margin-top:6px;' }, chips) : null);
      })),
      h('div', { class: 'rv-verdict' },
        meRight && themRight
          ? `both right! ${mine.ms <= theirs.ms ? ctx.myName : ctx.partnerName} was faster ⚡ +1`
          : meRight ? `only ${ctx.myName} got it 🧠 +2`
            : themRight ? `only ${ctx.partnerName} got it 🧠 +2`
              : 'nobody. embarrassing for you both 💀'),
    );
    if (meRight && themRight) heartBurst(zone, { count: 4, emoji: '🧠' });
  },

  scoreRound(item, answers) {
    const points = { diya: 0, divyam: 0 };
    const dRight = answers.diya.choice === item.answer;
    const vRight = answers.divyam.choice === item.answer;
    if (dRight) points.diya += 2;
    if (vRight) points.divyam += 2;
    if (dRight && vRight && answers.diya.ms !== answers.divyam.ms) {
      points[answers.diya.ms < answers.divyam.ms ? 'diya' : 'divyam'] += 1;
    }
    return { points, match: answers.diya.choice === answers.divyam.choice };
  },

  summaryLine(t) {
    if (t.diya === t.divyam) return 'two equally big brains 🧠🧠';
    return `${nameOf(t.diya > t.divyam ? 'diya' : 'divyam')} is tonight's big brain 🧠👑`;
  },
};
