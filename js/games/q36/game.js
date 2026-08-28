// 36 questions — the famous Aron study set, as a shared slow ritual.
// One shared pointer, advanced when you've actually talked about a card;
// progress syncs between devices whenever you're connected.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { navigate } from '../../router.js';
import { confirmModal } from '../../core/ui/modal.js';
import { partnerOf, whoAmI, nameOf } from '../../core/identity.js';
import { q36Progress, q36Advance, q36Reset, dailyEvents } from '../daily/store.js';
import { fmtMMSS } from '../../core/time.js';
import deck from '../../../data/decks/q36.js';

const ALL = deck.sets.flat();
const SET_INTROS = [
  { title: 'set one', hand: 'gentle beginnings — favorite dinner guests and secret hunches', emoji: '🌱' },
  { title: 'set two', hand: 'deeper waters — memories, dreams, and what love means', emoji: '🌊' },
  { title: 'set three', hand: 'the deep end — say the true things out loud', emoji: '🌌' },
];

export default {
  id: 'q36',
  engine: 'viewer',
  blurb: 'the study-famous questions. take turns answering out loud. no rushing.',

  mountViewer(el) {
    const me = whoAmI();
    const partner = partnerOf(me);
    const body = h('div', { class: 'stack gap-md grow' });
    let unsub = null;
    let gazeTimer = null;

    const render = () => {
      clear(body);
      clearInterval(gazeTimer);
      const p = q36Progress(); // 0..36 answered; 37 = eye gaze done

      if (p >= 37) {
        body.append(h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;text-align:center;' },
          h('div', { style: 'font-size:56px;' }, '💞'),
          h('div', { class: 'title-lg' }, 'all 36, done.'),
          h('div', { class: 'hand sub', style: 'font-size:18px;max-width:300px;' },
            'science says you two are now closer than ever. we say you already were.'),
          h('button', {
            class: 'btn mt-md',
            onclick: async () => {
              if (await confirmModal('start the whole journey again from question 1?', { title: 'restart?' })) {
                q36Reset();
                render();
              }
            },
          }, 'start over someday 🔄'),
        ));
        heartBurst(body, { count: 8 });
        return;
      }

      if (p >= 36) {
        // the famous finale: 4 minutes of eye contact
        const label = h('div', { class: 'title-xl' }, '4:00');
        let left = 240_000;
        const startBtn = h('button', {
          class: 'btn btn--me btn--big',
          onclick: () => {
            startBtn.remove();
            const t0 = Date.now();
            gazeTimer = setInterval(() => {
              left = 240_000 - (Date.now() - t0);
              if (left <= 0) {
                clearInterval(gazeTimer);
                q36Advance(37);
                render();
                return;
              }
              label.textContent = fmtMMSS(left);
            }, 250);
          },
        }, 'start the four minutes 👀');
        body.append(h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;text-align:center;' },
          h('div', { style: 'font-size:48px;' }, '👁️👁️'),
          h('div', { class: 'title-md' }, 'the finale'),
          h('div', { class: 'hand sub', style: 'font-size:18px;max-width:300px;' },
            'look into each other\'s eyes for four whole minutes. no talking. no laughing (impossible).'),
          label,
          startBtn,
        ));
        return;
      }

      const setIdx = Math.floor(p / 12);
      const inSetIdx = p % 12;
      const item = ALL[p];

      if (inSetIdx === 0) {
        const intro = SET_INTROS[setIdx];
        body.append(h('div', { class: 'sticker rv-card', style: 'animation:pop-in var(--t-slow) var(--bounce) both;' },
          h('div', { style: 'font-size:40px;' }, intro.emoji),
          h('div', { class: 'title-md mt-sm' }, intro.title),
          h('div', { class: 'hand sub mt-sm', style: 'font-size:17px;' }, intro.hand),
        ));
      }

      body.append(
        h('div', { class: 'small sub center-text' }, `question ${p + 1} of 36 · set ${setIdx + 1}`),
        h('div', { class: 'sticker rv-card', style: 'animation:pop-in var(--t-med) var(--bounce) both;' },
          h('div', { class: 'rv-question', style: 'font-size:clamp(19px,4.8vw,23px);' }, item.text),
        ),
        h('div', { class: 'hand sub center-text', style: 'font-size:16px;' },
          'both of you answer out loud — whoever reads it goes second 😌'),
        h('div', { class: 'stack center gap-xs mt-sm' },
          h('button', {
            class: 'btn btn--me btn--big', style: 'min-width:240px;',
            onclick: (e) => {
              heartBurst(e.currentTarget, { count: 3 });
              q36Advance(p + 1);
              render();
            },
          }, 'we both answered → next'),
          p > 0 ? h('div', { class: 'small faint' }, 'progress syncs to both phones when you\'re connected') : null,
        ),
      );

      // progress dots by set
      const dots = h('div', { class: 'rv-progress mt-sm' });
      for (let i = setIdx * 12; i < setIdx * 12 + 12; i++) {
        dots.append(h('span', { class: `rv-dot${i < p ? ' rv-dot--done' : i === p ? ' rv-dot--now' : ''}` }));
      }
      body.append(dots);
    };

    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title grow' }, '💌 36 questions'),
        h('span', { class: 'small faint' }, `with ${nameOf(partner)}`),
      ),
      body,
    ));
    render();
    unsub = dailyEvents.on('changed', render);
    return () => { unsub?.(); clearInterval(gazeTimer); };
  },
};
