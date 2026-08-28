import { h } from '../core/ui/dom.js';
import { setIdentity } from '../core/identity.js';
import { PLAYERS } from '../config.js';
import { navigate } from '../router.js';

export default {
  mount(el) {
    const pickBtn = (who) => h('button', {
      class: `sticker stack center gap-sm p-${who}`,
      style: 'padding:28px 20px;flex:1;min-width:140px;max-width:220px;transition:transform var(--t-med) var(--bounce);',
      onclick: (e) => {
        e.currentTarget.style.transform = 'scale(1.06)';
        setIdentity(who);
        setTimeout(() => navigate(''), 120);
      },
    },
      h('div', { class: 'avatar', style: 'width:74px;height:74px;font-size:38px;' }, PLAYERS[who].emoji),
      h('div', { class: 'title-md' }, PLAYERS[who].name),
      h('div', { class: 'hand sub' }, who === 'diya' ? 'the pretty one 🌷' : 'the lucky one 🍀'),
    );

    el.append(
      h('div', { class: 'screen stack center gap-lg grow', style: 'text-align:center;min-height:80dvh;justify-content:center;' },
        h('div', { class: 'stack gap-xs' },
          h('div', { class: 'hand', style: 'font-size:22px;color:var(--ink-soft);transform:rotate(-2deg);' }, 'welcome to'),
          h('h1', { class: 'title-xl' }, 'div & diya dungeon'),
          h('div', { class: 'hand sub', style: 'font-size:19px;' }, 'a tiny arcade for two 💘'),
        ),
        h('div', { class: 'title-md', style: 'margin-top:8px;' }, 'wait… who are you? 🤨'),
        h('div', { class: 'row gap-md wrap center' }, pickBtn('divyam'), pickBtn('diya')),
        h('div', { class: 'small faint' }, 'this phone will remember you'),
      ),
    );
  },
};
