import { h } from '../core/ui/dom.js';
import { navigate } from '../router.js';

export default {
  mount(el) {
    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title' }, '🏆 our rivalry'),
      ),
      h('div', { class: 'cozy-empty sticker grow center stack' },
        h('span', { class: 'cozy-empty__emoji' }, '🏆'),
        h('div', { class: 'title-md' }, 'no games played yet'),
        h('div', { class: 'hand', style: 'font-size:17px;' }, 'go start a rivalry, you two'),
      ),
    ));
  },
};
