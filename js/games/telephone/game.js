// doodle telephone — prompt → draw → caption → draw → caption, then the
// glorious gallery reveal. Every step is a MOVE (full stroke snapshots) so
// the chain survives refreshes. Unscored: the chaos is the prize.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { partnerOf, nameOf } from '../../core/identity.js';
import { createDrawSurface, SURFACE_CSS } from '../../engines/canvas/draw-surface.js';
import deck from '../../../data/decks/drawwords.js';

const STEPS = 5; // prompt, draw, caption, draw, caption
const KIND = ['prompt', 'drawing', 'caption', 'drawing', 'caption'];

const actorOf = (step, session) => (step % 2 === 0 ? session.first : partnerOf(session.first));

const SUGGEST_TEMPLATES = [
  (a, b) => `a ${a} made entirely of ${b}`,
  (a, b) => `${a} vs ${b}: the final battle`,
  (a, b) => `a ${a} experiencing ${b}`,
  (a, b) => `${a}, but it's also ${b}`,
  (a, b) => `the world's saddest ${a} discovers ${b}`,
];

function randomSuggestion() {
  const pick = () => deck.items[Math.floor(Math.random() * deck.items.length)].word;
  const t = SUGGEST_TEMPLATES[Math.floor(Math.random() * SUGGEST_TEMPLATES.length)];
  let a = pick();
  let b = pick();
  if (a === b) b = pick();
  return t(a, b);
}

function mountGame(bodyEl, ctx) {
  const { session, me } = ctx;
  const unsubs = [];
  let surface = null;
  let galleryIdx = 0;
  let destroyed = false;

  const steps = () => session.moves.map((rec) => rec.move);
  const commit = (move) => { session.commitLocalMove(move); render(); };

  const progressDots = (cur) => h('div', { class: 'rv-progress' },
    Array.from({ length: STEPS }, (_, i) => h('span', {
      class: `rv-dot${i < cur ? ' rv-dot--done' : i === cur ? ' rv-dot--now' : ''}`,
    })));

  function render() {
    if (destroyed) return;
    surface?.destroy?.();
    surface = null;
    clear(bodyEl);

    const chain = steps();
    const step = chain.length;

    if (step >= STEPS) return renderGallery(chain);

    const actor = actorOf(step, session);
    bodyEl.append(progressDots(step));

    if (actor !== me) {
      const verb = KIND[step] === 'drawing' ? `${ctx.partnerName} is drawing your nonsense 🎨` : KIND[step] === 'caption' ? `${ctx.partnerName} is interpreting the art 🧐` : `${ctx.partnerName} is writing the opening line ✍️`;
      bodyEl.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
        h('div', { style: 'font-size:44px;animation:bob 2.4s ease-in-out infinite;' }, ctx.partnerEmoji),
        h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, verb, h('span', { class: 'dots-thinking' })),
        h('div', { class: 'small faint mt-sm' }, 'no peeking — the reveal is everything'),
      ));
      return;
    }

    if (KIND[step] === 'prompt') return renderPrompt();
    if (KIND[step] === 'drawing') return renderDraw(step, chain[step - 1]);
    return renderCaption(step, chain[step - 1]);
  }

  function renderPrompt() {
    const input = h('textarea', { class: 'input', rows: '2', placeholder: 'write something drawable and unhinged…', style: 'font-size:16px;' });
    bodyEl.append(
      h('div', { class: 'sticker rv-card' },
        h('div', { style: 'font-size:40px;' }, '📞'),
        h('div', { class: 'title-md mt-sm' }, 'start the chain'),
        h('div', { class: 'sub mt-sm' }, `write a prompt. ${ctx.partnerName} has to DRAW it. choose violence (affectionately).`),
      ),
      input,
      h('div', { class: 'row gap-sm', style: 'justify-content:center;' },
        h('button', { class: 'btn', onclick: () => { input.value = randomSuggestion(); } }, '🎲 suggest'),
        h('button', {
          class: 'btn btn--me',
          onclick: () => {
            const text = input.value.trim();
            if (text.length < 3) return toast('give her something to work with 😌', { ms: 1600 });
            commit({ k: 'prompt', text });
          },
        }, 'start the chain →'),
      ),
    );
    setTimeout(() => input.focus(), 150);
  }

  function renderDraw(step, prev) {
    bodyEl.append(h('div', { class: 'sticker center-text', style: 'padding:12px 16px;' },
      h('div', { class: 'rv-kicker' }, 'draw this:'),
      h('div', { style: 'font-weight:650;font-size:18px;' }, `“${prev.k === 'prompt' ? prev.text : prev.text}”`),
    ));
    const zone = h('div', {});
    bodyEl.append(zone);
    surface = createDrawSurface(zone, {
      onStrokeDone: () => session.setPrivate(`tp-s${step}`, surface.getStrokes()),
      onUndo: () => session.setPrivate(`tp-s${step}`, surface.getStrokes()),
      onClear: () => session.setPrivate(`tp-s${step}`, []),
    });
    const saved = session.getPrivate(`tp-s${step}`);
    if (saved?.length) surface.loadStrokes(saved);

    bodyEl.append(h('div', { class: 'center', style: 'padding:6px 0 10px;' },
      h('button', {
        class: 'btn btn--me btn--big',
        onclick: () => {
          const strokes = surface.getStrokes();
          if (!strokes.length) return toast('draw SOMETHING, coward 💅', { ms: 1600 });
          session.setPrivate(`tp-s${step}`, null);
          commit({ k: 'drawing', strokes });
          ctx.haptic(14);
        },
      }, 'done ✍️'),
    ));
  }

  function renderCaption(step, prev) {
    bodyEl.append(h('div', { class: 'sticker center-text', style: 'padding:10px 14px;' },
      h('div', { class: 'rv-kicker' }, 'what… is this?'),
    ));
    const zone = h('div', {});
    bodyEl.append(zone);
    const view = createDrawSurface(zone, { readonly: true });
    view.loadStrokes(prev.strokes ?? []);
    surface = view;

    const input = h('input', { class: 'input', placeholder: 'describe what you see…', autocomplete: 'off' });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const submit = () => {
      const text = input.value.trim();
      if (text.length < 2) return toast('take a guess, any guess 🫣', { ms: 1500 });
      commit({ k: 'caption', text });
    };
    bodyEl.append(h('div', { class: 'row gap-xs', style: 'padding-bottom:10px;' },
      input,
      h('button', { class: 'btn btn--me', style: 'min-width:80px;', onclick: submit }, 'that. ✓'),
    ));
    setTimeout(() => input.focus(), 150);
  }

  function renderGallery(chain) {
    // the chain is complete — log it (draw record, both sides, deduped by sid)
    if (session.status === 'active') {
      session.end(session.makeRecord({ winner: null, draw: true, reason: 'draw' }, null));
    }

    const stepView = (i) => {
      const m = chain[i];
      const who = nameOf(actorOf(i, session));
      if (m.k === 'drawing') {
        const zone = h('div', {});
        const view = createDrawSurface(zone, { readonly: true });
        view.loadStrokes(m.strokes ?? []);
        surface = view;
        return h('div', { class: 'stack gap-xs', style: 'animation:pop-in var(--t-slow) var(--bounce) both;' },
          h('div', { class: 'small sub center-text' }, `${who} drew:`),
          zone,
        );
      }
      return h('div', { class: 'sticker rv-card', style: 'animation:pop-in var(--t-slow) var(--bounce) both;' },
        h('div', { class: 'rv-kicker' }, m.k === 'prompt' ? `${who} started with:` : `${who} saw that and said:`),
        h('div', { class: 'rv-question' }, `“${m.text}”`),
      );
    };

    const renderStep = () => {
      surface?.destroy?.();
      surface = null;
      clear(bodyEl);
      bodyEl.append(
        h('div', { class: 'center-text' }, h('span', { class: 'washi washi--butter' }, `the reveal 🎬 ${galleryIdx + 1}/${STEPS}`)),
        stepView(galleryIdx),
      );
      if (galleryIdx < STEPS - 1) {
        bodyEl.append(h('div', { class: 'center', style: 'padding:10px 0;' },
          h('button', { class: 'btn btn--me btn--big', onclick: () => { galleryIdx++; ctx.haptic(10); renderStep(); } }, 'next →'),
        ));
      } else {
        const first = chain[0].text;
        const last = chain[STEPS - 1].text;
        bodyEl.append(
          h('div', { class: 'rv-verdict', style: 'padding:6px 10px;' },
            `from “${first}” to “${last}” — incredible work, you two 🏆`),
          ctx.rematchRow(),
        );
        heartBurst(bodyEl, { count: 6 });
      }
    };
    renderStep();
  }

  unsubs.push(session.onMove((rec) => {
    if (!session.acceptRemoteMove(rec)) return;
    ctx.haptic(10);
    render();
  }));
  unsubs.push(session.events.on('resynced', () => render()));

  render();

  return () => {
    destroyed = true;
    surface?.destroy?.();
    unsubs.forEach((u) => u());
  };
}

export default {
  id: 'telephone',
  engine: 'canvas',
  customFinale: true,
  css: SURFACE_CSS,
  blurb: 'write → draw → misread → repeat. the reveal is everything.',
  mountGame,
};
