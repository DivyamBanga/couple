// question of the day — answer blind, reveal together, keep the streak alive.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { navigate } from '../../router.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { connection } from '../../sync/connection.js';
import { getAnswer, putMyAnswer, streak, dailyIndex, dailyEvents } from './store.js';
import { todayKey } from '../../core/time.js';
import { relTime } from '../../core/time.js';
import deck from '../../../data/decks/daily.js';

const KEY = 'dailyq';

function msUntilMidnight() {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return mid - now;
}

function streakFlame() {
  const n = streak(KEY);
  return n >= 2 ? h('span', { class: 'chip', style: 'background:var(--butter);color:#7a4c09;font-weight:700;' }, `🔥 ${n} day streak`) : null;
}

export default {
  id: 'dailyq',
  engine: 'viewer',
  blurb: 'one question a day. answer blind, reveal together.',

  mountViewer(el) {
    const me = whoAmI();
    const partner = partnerOf(me);
    const item = deck.items[dailyIndex(KEY, deck.items.length)];
    const body = h('div', { class: 'stack gap-md grow' });
    let unsub = null;

    const render = () => {
      clear(body);
      const mine = getAnswer(KEY, me);
      const theirs = getAnswer(KEY, partner);

      body.append(h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, `today's question · ${todayKey()}`),
        h('div', { class: 'rv-question' }, item.text),
        streakFlame() ? h('div', { class: 'mt-sm center' }, streakFlame()) : null,
      ));

      if (!mine) {
        const input = h('textarea', { class: 'input', rows: '4', maxlength: '500', placeholder: 'your answer, from the heart (or the chaos)…' });
        body.append(
          input,
          h('button', {
            class: 'btn btn--me btn--big', style: 'align-self:center;min-width:220px;',
            onclick: (e) => {
              const text = input.value.trim();
              if (!text) return;
              putMyAnswer(KEY, { text });
              heartBurst(e.currentTarget);
              render();
            },
          }, 'send it 💌'),
          h('div', { class: 'small faint center-text' }, `you can't see ${nameOf(partner)}'s answer until you've answered — no peeking policy 🤝`),
        );
      } else if (!theirs) {
        body.append(
          h('div', { class: `sticker p-${me}`, style: 'padding:16px;border-color:var(--p-soft);' },
            h('div', { class: 'small sub', style: 'font-weight:650;' }, `your answer ${emojiOf(me)}`),
            h('div', { style: 'margin-top:6px;line-height:1.5;' }, mine.text),
          ),
          h('div', { class: 'rv-waiting' },
            h('div', { style: 'font-size:40px;animation:bob 2.6s ease-in-out infinite;' }, emojiOf(partner)),
            h('div', { class: 'hand', style: 'font-size:18px;margin-top:6px;' },
              connection.partnerPresent() ? `${nameOf(partner)} is thinking` : `waiting for ${nameOf(partner)} to answer`,
              h('span', { class: 'dots-thinking' })),
            h('div', { class: 'small faint mt-sm' }, 'the reveal unlocks the moment you both have answered'),
          ),
        );
      } else {
        const card = (who, ans) => h('div', { class: `sticker p-${who}`, style: 'padding:16px;border-color:var(--p-soft);animation:pop-in var(--t-slow) var(--bounce) both;' },
          h('div', { class: 'row gap-sm' },
            h('span', { class: 'avatar avatar--sm' }, emojiOf(who)),
            h('span', { class: 'grow', style: 'font-weight:650;' }, nameOf(who)),
            h('span', { class: 'small faint' }, relTime(ans.at)),
          ),
          h('div', { style: 'margin-top:8px;line-height:1.5;' }, ans.text),
        );
        const hrs = Math.ceil(msUntilMidnight() / 3_600_000);
        body.append(
          card(me, mine),
          card(partner, theirs),
          h('div', { class: 'rv-verdict' }, 'revealed 💞 talk about it!'),
          h('div', { class: 'small faint center-text' }, `next question in ~${hrs}h`),
        );
        heartBurst(body, { count: 5 });
      }
    };

    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title grow' }, '☀️ question of the day'),
      ),
      body,
    ));
    render();
    unsub = dailyEvents.on('changed', render);
    const unsubP = connection.onPartner(render);
    return () => { unsub?.(); unsubP?.(); };
  },
};
