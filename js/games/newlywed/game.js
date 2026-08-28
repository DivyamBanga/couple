// do you know me? — newlywed quiz: one answers about themselves,
// the other predicts. roles swap every round.
import { h } from '../../core/ui/dom.js';
import { heartBurst } from '../../core/ui/dom.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { partnerOf, nameOf } from '../../core/identity.js';
import deck from '../../../data/decks/newlywed.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 8;

// round r subject: alternates starting with session.first
function subjectOf(r, session) {
  return r % 2 === 0 ? session.first : partnerOf(session.first);
}

export default {
  id: 'newlywed',
  engine: 'reveal',
  deckId: 'newlywed',
  scored: true,
  blurb: 'you answer about yourself. she predicts. prove who pays attention.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  renderPrompt(zone, item, r, ctx) {
    const subject = subjectOf(r, ctx.session);
    const iAmSubject = subject === ctx.me;
    zone.append(h('div', { class: `sticker rv-card p-${subject}`, style: 'border-color:var(--p-soft);' },
      h('div', { class: 'rv-kicker' },
        iAmSubject ? `about YOU — answer honestly (${r + 1}/${ctx.rounds})` : `predict ${nameOf(subject)}'s answer (${r + 1}/${ctx.rounds})`),
      h('div', { class: 'rv-question' }, item.text),
    ));
  },

  renderInput(zone, item, r, ctx, submit) {
    let sel = null;
    const lockBtn = h('button', {
      class: 'btn btn--me btn--big', style: 'align-self:center;min-width:200px;', disabled: true,
      onclick: () => submit(sel),
    }, subjectOf(r, ctx.session) === ctx.me ? 'that\'s my truth 🤞' : 'final answer 🔮');
    const btns = item.choices.map((c, idx) => h('button', {
      class: 'rv-option', style: 'min-height:54px;',
      onclick: (e) => {
        sel = idx;
        zone.querySelectorAll('.rv-option').forEach((b) => b.classList.remove('rv-option--sel'));
        e.currentTarget.classList.add('rv-option--sel');
        lockBtn.disabled = false;
        ctx.haptic(8);
      },
    }, c));
    zone.append(...btns, h('div', { class: 'mt-sm center' }, lockBtn));
  },

  renderReveal(zone, item, r, mine, theirs, ctx) {
    const subject = subjectOf(r, ctx.session);
    const iAmSubject = subject === ctx.me;
    const truth = iAmSubject ? mine : theirs;
    const guess = iAmSubject ? theirs : mine;
    const hit = truth === guess;
    const predictor = partnerOf(subject);

    zone.append(
      h('div', { class: 'stack gap-xs' }, item.choices.map((c, idx) => {
        const isTruth = idx === truth;
        const isGuess = idx === guess;
        return h('div', {
          class: 'rv-option',
          style: `pointer-events:none;${isTruth ? 'border-color:var(--mint-deep);background:var(--mint-ghost);' : isGuess ? 'border-color:var(--coral);background:var(--coral-ghost);' : 'opacity:.5;'}`,
        }, c,
          isTruth ? h('span', { class: 'small', style: 'display:block;color:var(--mint-deep);font-weight:650;' }, `✓ ${nameOf(subject)}'s truth`) : null,
          isGuess && !isTruth ? h('span', { class: 'small', style: 'display:block;color:var(--coral-deep);font-weight:650;' }, `${nameOf(predictor)} guessed this`) : null,
          isGuess && isTruth ? h('span', { class: 'small', style: 'display:block;color:var(--mint-deep);font-weight:650;' }, `and ${nameOf(predictor)} KNEW it 🎯` ) : null,
        );
      })),
      h('div', { class: 'rv-verdict' }, hit ? `${nameOf(predictor)} knows ${nameOf(subject)} scarily well 💘 +1` : 'years together and STILL surprising each other 😌'),
    );
    if (hit) heartBurst(zone, { count: 5 });
  },

  scoreRound(item, answers, r, ctx) {
    const subject = subjectOf(r, ctx.session);
    const predictor = partnerOf(subject);
    const hit = answers[subject] === answers[predictor];
    return { points: { diya: 0, divyam: 0, [predictor]: hit ? 1 : 0 }, match: hit };
  },

  summaryLine(t, ctx) {
    if (t.diya === t.divyam) return 'you know each other equally scarily well 👀';
    return `${nameOf(t.diya > t.divyam ? 'diya' : 'divyam')} officially pays more attention 💘`;
  },
};
