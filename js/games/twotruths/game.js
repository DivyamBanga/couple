// two truths & a lie — spot each other's nonsense.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS, sealValue, sealCheck } from '../../engines/prompt/engine.js';
import { makeSampler } from '../../engines/reveal/engine.js';
import { toast } from '../../core/ui/toast.js';
import { nameOf } from '../../core/identity.js';
import deck from '../../../data/decks/ttal.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 4;

export default {
  id: 'twotruths',
  engine: 'prompt',
  css: PROMPT_CSS,
  deckId: 'ttal',
  blurb: 'two truths, one lie. catch mine, hide yours.',
  sampleItems: makeSampler(deck, ROUNDS),
  getItem: (id) => byId.get(id),

  init() {
    return {
      round: 0, phase: 'compose', statements: null, commit: null, pick: null,
      points: { diya: 0, divyam: 0 }, log: [], cheater: null, done: false,
    };
  },

  fold(state, step, by, ctx) {
    if (state.done) return null;
    const composer = ctx.composerOf(state.round);
    const responder = composer === 'diya' ? 'divyam' : 'diya';

    if (step.k === 'statements') {
      if (by !== composer || state.phase !== 'compose') return null;
      if (!Array.isArray(step.s) || step.s.length !== 3 || step.s.some((x) => typeof x !== 'string' || !x.trim())) return null;
      if (typeof step.c !== 'number') return null;
      return { ...state, statements: step.s.map((x) => x.trim().slice(0, 140)), commit: step.c, phase: 'pick', pick: null };
    }
    if (step.k === 'pick') {
      if (by !== responder || state.phase !== 'pick' || ![0, 1, 2].includes(step.idx)) return null;
      return { ...state, pick: step.idx, phase: 'reveal' };
    }
    if (step.k === 'reveal') {
      if (by !== composer || state.phase !== 'reveal' || ![0, 1, 2].includes(step.lie)) return null;
      if (!sealCheck(step.lie, step.salt, state.commit)) {
        return { ...state, cheater: composer, done: true };
      }
      const caught = state.pick === step.lie;
      const points = { ...state.points };
      if (caught) points[responder] += 1;
      const log = [...state.log, { round: state.round, statements: state.statements, lie: step.lie, pick: state.pick, caught }];
      const round = state.round + 1;
      return {
        ...state, points, log, round, done: round >= ROUNDS,
        phase: 'compose', statements: null, commit: null, pick: null,
      };
    }
    return null;
  },

  isDone(state) {
    if (!state.done) return null;
    if (state.cheater) {
      const winner = state.cheater === 'diya' ? 'divyam' : 'diya';
      return { result: { winner, draw: false, reason: 'win' }, score: state.points };
    }
    const { diya, divyam } = state.points;
    const result = diya === divyam
      ? { winner: null, draw: true, reason: 'draw' }
      : { winner: diya > divyam ? 'diya' : 'divyam', draw: false, reason: 'win' };
    return { result, score: { diya, divyam } };
  },

  resultText(state, record) {
    if (state.cheater) return `${nameOf(state.cheater)} got caught cheating 😤`;
    const w = record?.result?.winner;
    return w ? `${nameOf(w)} is the better lie detector 🕵️` : 'equally suspicious minds 🕵️';
  },

  progressOf(state) { return { done: state.round, total: ROUNDS }; },

  render(zone, state, ctx) {
    const composer = ctx.composerOf(state.round);
    const iCompose = composer === ctx.me;
    const theme = ctx.item(ctx.itemIds[state.round])?.text ?? 'about anything at all';

    // auto-reveal by composer
    if (state.phase === 'reveal' && iCompose) {
      const priv = ctx.session.getPrivate(`secret:${state.round}`);
      if (priv != null) setTimeout(() => ctx.submit({ k: 'reveal', lie: priv.secret, salt: priv.salt }), 60);
      zone.append(h('div', { class: 'rv-waiting' }, h('div', { class: 'dots-thinking' }, 'the truth comes out')));
      return;
    }

    if (state.phase === 'compose') {
      if (iCompose) {
        const inputs = [0, 1, 2].map((i) => h('input', { class: 'input', placeholder: `statement ${i + 1}…`, maxlength: '140', autocomplete: 'off' }));
        let lie = null;
        const lieBtns = [0, 1, 2].map((i) => h('button', {
          class: 'chip',
          'aria-pressed': 'false',
          onclick: (e) => {
            lie = i;
            lieBtns.forEach((b) => b.setAttribute('aria-pressed', 'false'));
            e.currentTarget.setAttribute('aria-pressed', 'true');
          },
        }, `#${i + 1} is the lie 🤫`));
        zone.append(
          h('div', { class: 'sticker rv-card' },
            h('div', { class: 'rv-kicker' }, `round ${state.round + 1} of ${ROUNDS} — your turn to bluff`),
            h('div', { class: 'rv-question', style: 'font-size:19px;' }, `three statements ${theme}`),
            h('div', { class: 'small sub mt-sm' }, 'two true, one lie. make the lie believable.'),
          ),
          ...inputs,
          h('div', { class: 'row gap-xs wrap', style: 'justify-content:center;' }, lieBtns),
          h('button', {
            class: 'btn btn--me btn--big',
            onclick: () => {
              const s = inputs.map((i) => i.value.trim());
              if (s.some((x) => !x)) return toast('fill in all three!', { ms: 1500 });
              if (lie === null) return toast('mark which one is the lie 🤫', { ms: 1500 });
              const { salt, c } = sealValue(lie);
              ctx.session.setPrivate(`secret:${state.round}`, { secret: lie, salt });
              ctx.submit({ k: 'statements', s, c });
            },
          }, 'serve the nonsense 🎭'),
        );
      } else {
        zone.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
          h('div', { style: 'font-size:42px;animation:bob 2.4s ease-in-out infinite;' }, '🎭'),
          h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, `${ctx.partnerName} is crafting lies ${theme}`,
            h('span', { class: 'dots-thinking' })),
        ));
      }
      return;
    }

    if (state.phase === 'pick') {
      zone.append(h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, iCompose ? 'they\'re sniffing out your lie…' : `which one is ${ctx.partnerName}'s lie?`),
        h('div', { class: 'small sub' }, theme),
      ));
      if (iCompose) {
        zone.append(
          h('div', { class: 'stack gap-xs' }, state.statements.map((s, i) => h('div', { class: 'rv-option', style: 'pointer-events:none;' }, `${i + 1}. ${s}`))),
          h('div', { class: 'rv-waiting' }, h('div', { class: 'dots-thinking' }, `${ctx.partnerName} is deliberating`)),
        );
      } else {
        zone.append(h('div', { class: 'stack gap-xs' }, state.statements.map((s, i) => h('button', {
          class: 'rv-option',
          onclick: () => ctx.submit({ k: 'pick', idx: i }),
        }, `${i + 1}. ${s}`))));
      }
      return;
    }

    // reveal phase, responder side (composer auto-reveals above)
    zone.append(h('div', { class: 'rv-waiting' }, h('div', { class: 'dots-thinking' }, 'the truth comes out')));
  },

  renderEpilogue(zone, state, ctx) {
    for (const r of state.log) {
      zone.append(h('div', { class: 'small', style: 'padding:3px 0;border-bottom:1px dashed var(--paper-dot);' },
        h('span', { style: 'font-weight:650;' }, r.caught ? '🕵️ caught: ' : '🎭 fooled: '),
        `the lie was "${r.statements[r.lie]}"`));
    }
  },
};
