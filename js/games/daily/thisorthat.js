// daily this-or-that — 60 seconds: pick your side AND bet on theirs.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { navigate } from '../../router.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { connection } from '../../sync/connection.js';
import { getAnswer, putMyAnswer, streak, dailyIndex, dailyEvents } from './store.js';
import { todayKey } from '../../core/time.js';
import deck from '../../../data/decks/thisorthat.js';

const KEY = 'dailytot';

export default {
  id: 'dailytot',
  engine: 'viewer',
  blurb: 'the 60-second ritual: pick a side, predict theirs.',

  mountViewer(el) {
    const me = whoAmI();
    const partner = partnerOf(me);
    const item = deck.items[dailyIndex(KEY, deck.items.length)];
    const body = h('div', { class: 'stack gap-md grow' });
    let unsub = null;

    const label = (k) => (k === 'a' ? item.a : item.b);

    const render = () => {
      clear(body);
      const mine = getAnswer(KEY, me);
      const theirs = getAnswer(KEY, partner);
      const n = streak(KEY);

      body.append(h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, `today's this-or-that · ${todayKey()}`),
        h('div', { class: 'rv-question' }, `${item.a}  ☕  ${item.b}`),
        n >= 2 ? h('div', { class: 'mt-sm center' }, h('span', { class: 'chip', style: 'background:var(--butter);color:#7a4c09;font-weight:700;' }, `🔥 ${n} day streak`)) : null,
      ));

      if (!mine) {
        const state = { pick: null, predict: null };
        const lockBtn = h('button', { class: 'btn btn--me btn--big', style: 'align-self:center;min-width:200px;', disabled: true, onclick: (e) => {
          putMyAnswer(KEY, state);
          heartBurst(e.currentTarget);
          render();
        } }, 'lock both 💘');
        const group = (field) => {
          const els = [];
          const btn = (k) => {
            const b = h('button', { class: 'rv-option', style: 'min-height:52px;', onclick: () => {
              state[field] = k;
              els.forEach((x) => x.el.classList.toggle('rv-option--sel', x.k === k));
              lockBtn.disabled = !(state.pick && state.predict);
            } }, label(k));
            els.push({ k, el: b });
            return b;
          };
          return h('div', { class: 'row gap-sm' }, btn('a'), btn('b'));
        };
        body.append(
          h('div', { class: 'small sub center-text', style: 'font-weight:620;' }, 'you pick:'),
          group('pick'),
          h('div', { class: 'small sub center-text mt-sm', style: 'font-weight:620;' }, `and ${nameOf(partner)} will pick…?`),
          group('predict'),
          h('div', { class: 'mt-sm center' }, lockBtn),
        );
      } else if (!theirs) {
        body.append(h('div', { class: 'rv-waiting' },
          h('div', { style: 'font-size:40px;animation:bob 2.6s ease-in-out infinite;' }, emojiOf(partner)),
          h('div', { class: 'hand', style: 'font-size:18px;margin-top:6px;' }, `locked in! waiting for ${nameOf(partner)}`,
            h('span', { class: 'dots-thinking' })),
        ));
      } else {
        const iGuessed = mine.predict === theirs.pick;
        const theyGuessed = theirs.predict === mine.pick;
        const row = (who, emoji, data, right) => h('div', { class: `sticker row gap-sm p-${who}`, style: 'padding:12px 14px;animation:pop-in var(--t-slow) var(--bounce) both;' },
          h('span', { class: 'avatar avatar--sm' }, emoji),
          h('span', { class: 'stack grow' },
            h('span', { style: 'font-weight:620;' }, label(data.pick)),
            h('span', { class: 'small sub' }, `guessed "${label(data.predict)}" → ${right ? 'right! 🎯' : 'nope 💨'}`),
          ),
        );
        body.append(
          row(me, emojiOf(me), mine, iGuessed),
          row(partner, emojiOf(partner), theirs, theyGuessed),
          h('div', { class: 'rv-verdict' },
            mine.pick === theirs.pick ? 'same side, obviously 🫶' : 'house divided ⚖️'),
          h('div', { class: 'small faint center-text' }, 'new one at midnight'),
        );
        if (iGuessed && theyGuessed) heartBurst(body, { count: 5 });
      }
    };

    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title grow' }, '☕ daily this-or-that'),
      ),
      body,
    ));
    render();
    unsub = dailyEvents.on('changed', render);
    return () => unsub?.();
  },
};
