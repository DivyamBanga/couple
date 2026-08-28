// 20 questions — one thinks of a thing, the other interrogates.
import { h } from '../../core/ui/dom.js';
import { PROMPT_CSS, sealValue, sealCheck } from '../../engines/prompt/engine.js';
import { toast } from '../../core/ui/toast.js';
import { nameOf } from '../../core/identity.js';

const ROUNDS = 2;

export default {
  id: 'twentyq',
  engine: 'prompt',
  css: PROMPT_CSS,
  blurb: 'think of a thing. survive twenty questions about it.',

  init() {
    return {
      round: 0, phase: 'compose', commit: null, qa: [], pending: null,
      guess: null, verdict: null, points: { diya: 0, divyam: 0 },
      reveals: [], cheater: null, done: false,
    };
  },

  fold(state, step, by, ctx) {
    if (state.done) return null;
    const composer = ctx.composerOf(state.round);
    const responder = composer === 'diya' ? 'divyam' : 'diya';

    if (step.k === 'commit') {
      if (by !== composer || state.phase !== 'compose' || typeof step.c !== 'number') return null;
      return { ...state, commit: step.c, phase: 'play', qa: [], pending: null, guess: null, verdict: null };
    }
    if (step.k === 'ask') {
      if (by !== responder || state.phase !== 'play' || state.pending || state.qa.length >= 20) return null;
      if (typeof step.text !== 'string' || !step.text.trim()) return null;
      return { ...state, pending: { text: step.text.trim().slice(0, 120) } };
    }
    if (step.k === 'answer') {
      if (by !== composer || state.phase !== 'play' || !state.pending) return null;
      if (!['yes', 'no', 'kinda'].includes(step.a)) return null;
      return { ...state, qa: [...state.qa, { q: state.pending.text, a: step.a }], pending: null };
    }
    if (step.k === 'guess') {
      if (by !== responder || state.phase !== 'play' || state.pending) return null;
      if (typeof step.text !== 'string' || !step.text.trim()) return null;
      return { ...state, phase: 'verdict', guess: step.text.trim().slice(0, 60) };
    }
    if (step.k === 'verdict') {
      if (by !== composer || state.phase !== 'verdict' || !['right', 'wrong'].includes(step.v)) return null;
      return { ...state, phase: 'reveal', verdict: step.v };
    }
    if (step.k === 'reveal') {
      if (by !== composer || state.phase !== 'reveal') return null;
      if (!sealCheck(step.secret, step.salt, state.commit)) {
        return { ...state, cheater: composer, done: true };
      }
      const points = { ...state.points };
      if (state.verdict === 'right') points[responder] += Math.max(1, 21 - state.qa.length);
      const reveals = [...state.reveals, { round: state.round, secret: step.secret, solved: state.verdict === 'right', questions: state.qa.length }];
      const round = state.round + 1;
      return {
        ...state, points, reveals, round, done: round >= ROUNDS,
        phase: 'compose', commit: null, qa: [], pending: null, guess: null, verdict: null,
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
    return w ? `${nameOf(w)} reads minds 🔮` : 'evenly matched minds 🔮';
  },

  progressOf(state) { return { done: state.round, total: ROUNDS }; },

  render(zone, state, ctx) {
    const composer = ctx.composerOf(state.round);
    const iCompose = composer === ctx.me;

    // auto-reveal (composer): verified by both folds
    if (state.phase === 'reveal' && iCompose) {
      const priv = ctx.session.getPrivate(`secret:${state.round}`);
      if (priv) setTimeout(() => ctx.submit({ k: 'reveal', secret: priv.secret, salt: priv.salt }), 60);
      else zone.append(h('div', { class: 'cozy-empty' }, '🫠 this device lost the secret — refresh won\'t help, abandon the round'));
      zone.append(h('div', { class: 'rv-waiting' }, h('div', { class: 'dots-thinking' }, 'revealing')));
      return;
    }

    if (state.phase === 'compose') {
      if (iCompose) {
        const input = h('input', { class: 'input', placeholder: 'e.g. "our first date spot", "a capybara"…', maxlength: '30', autocomplete: 'off' });
        zone.append(
          h('div', { class: 'sticker rv-card' },
            h('div', { class: 'rv-kicker' }, `round ${state.round + 1} of ${ROUNDS} — you hide, they seek`),
            h('div', { class: 'rv-question' }, 'think of a thing 🤫'),
            h('div', { class: 'small sub mt-sm' }, 'a person, place, thing, or memory. they get 20 yes/no questions.'),
          ),
          input,
          h('button', {
            class: 'btn btn--me btn--big',
            onclick: () => {
              const secret = input.value.trim();
              if (secret.length < 2) return toast('needs at least 2 characters!', { ms: 1500 });
              const { salt, c } = sealValue(secret);
              ctx.session.setPrivate(`secret:${state.round}`, { secret, salt });
              ctx.submit({ k: 'commit', c });
            },
          }, 'locked in my head 🔒'),
        );
        setTimeout(() => input.focus(), 150);
      } else {
        zone.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
          h('div', { style: 'font-size:42px;animation:bob 2.4s ease-in-out infinite;' }, '🤫'),
          h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, `${ctx.partnerName} is thinking of something`,
            h('span', { class: 'dots-thinking' })),
        ));
      }
      return;
    }

    // chat transcript (play + verdict phases)
    const chat = h('div', { class: 'pr-chat grow', style: 'overflow-y:auto;max-height:38dvh;' });
    const bubbleSide = (who) => (who === ctx.me ? 'pr-bubble--me' : 'pr-bubble--them');
    for (const { q, a } of state.qa) {
      const asker = composer === 'diya' ? 'divyam' : 'diya';
      chat.append(
        h('div', { class: `pr-bubble ${bubbleSide(asker)}` }, q),
        h('div', { class: `pr-bubble ${bubbleSide(composer)}` }, a === 'kinda' ? 'kinda 🤏' : a),
      );
    }
    if (state.pending) chat.append(h('div', { class: `pr-bubble ${bubbleSide(composer === 'diya' ? 'divyam' : 'diya')}` }, state.pending.text));
    if (state.guess) chat.append(h('div', { class: 'pr-bubble pr-bubble--sys' }, `final guess: "${state.guess}"`));

    const remaining = 20 - state.qa.length;
    zone.append(
      h('div', { class: 'row gap-sm', style: 'align-items:center;' },
        h('span', { class: 'pr-count' }, String(remaining)),
        h('span', { class: 'stack grow' },
          h('span', { style: 'font-weight:620;' }, iCompose ? 'they\'re hunting your secret' : `interrogate ${ctx.partnerName}!`),
          h('span', { class: 'small sub' }, `${remaining} questions left`),
        ),
      ),
      chat,
    );
    setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 30);

    if (state.phase === 'verdict') {
      if (iCompose) {
        zone.append(
          h('div', { class: 'hand center-text sub', style: 'font-size:17px;' }, 'did they get it?'),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'rv-option', style: 'background:var(--mint-ghost);border-color:var(--mint);', onclick: () => ctx.submit({ k: 'verdict', v: 'right' }) }, '🎯 correct!'),
            h('button', { class: 'rv-option', style: 'background:var(--coral-ghost);border-color:var(--coral);', onclick: () => ctx.submit({ k: 'verdict', v: 'wrong' }) }, '✗ nope'),
          ),
        );
      } else {
        zone.append(h('div', { class: 'rv-waiting' }, h('div', { class: 'dots-thinking' }, 'the judges deliberate')));
      }
      return;
    }

    // play phase inputs
    if (iCompose) {
      if (state.pending) {
        zone.append(
          h('div', { class: 'row gap-xs' },
            h('button', { class: 'btn btn--mint grow', onclick: () => ctx.submit({ k: 'answer', a: 'yes' }) }, 'yes'),
            h('button', { class: 'btn btn--coral grow', onclick: () => ctx.submit({ k: 'answer', a: 'no' }) }, 'no'),
            h('button', { class: 'btn btn--butter grow', onclick: () => ctx.submit({ k: 'answer', a: 'kinda' }) }, 'kinda 🤏'),
          ),
        );
      } else {
        zone.append(h('div', { class: 'small faint center-text' }, 'waiting for their next question…'));
      }
    } else {
      if (state.pending) {
        zone.append(h('div', { class: 'small faint center-text' }, 'they\'re deciding…'));
      } else {
        const q = h('input', { class: 'input', placeholder: remaining > 0 ? 'ask a yes/no question…' : 'no questions left — guess!', maxlength: '120', autocomplete: 'off' });
        // one mutable action so switching to guess-mode replaces (not stacks) the handler
        let action = () => { if (q.value.trim()) ctx.submit({ k: 'ask', text: q.value }); };
        const askBtn = h('button', {
          class: 'btn btn--me', disabled: remaining <= 0,
          onclick: () => action(),
        }, 'ask');
        const guessBtn = h('button', {
          class: 'btn btn--butter',
          onclick: () => {
            q.value = '';
            q.placeholder = 'your FINAL guess…';
            askBtn.textContent = 'guess!';
            askBtn.disabled = false;
            action = () => { if (q.value.trim()) ctx.submit({ k: 'guess', text: q.value }); };
            guessBtn.remove();
            q.focus();
          },
        }, 'final guess 🎯');
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') askBtn.click(); });
        zone.append(h('div', { class: 'stack gap-xs' }, q, h('div', { class: 'row gap-xs' }, askBtn, guessBtn)));
        if (remaining <= 0) { askBtn.disabled = true; guessBtn.click(); }
      }
    }
  },

  renderEpilogue(zone, state) {
    for (const r of state.reveals) {
      zone.append(h('div', { class: 'small center-text', style: 'padding:2px;' },
        `round ${r.round + 1}: "${r.secret}" — ${r.solved ? `solved in ${r.questions} ✓` : 'never guessed 💀'}`));
    }
  },
};
