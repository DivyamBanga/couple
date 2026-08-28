import { h } from '../core/ui/dom.js';
import { whoAmI, clearIdentity, nameOf, emojiOf, isTest } from '../core/identity.js';
import { store, K } from '../core/storage.js';
import { confirmModal } from '../core/ui/modal.js';
import { toast } from '../core/ui/toast.js';
import { navigate } from '../router.js';
import { APP_VERSION } from '../version.js';

function rowCard(...kids) {
  return h('div', { class: 'sticker row gap-sm', style: 'padding:14px 16px;' }, ...kids);
}

export default {
  mount(el) {
    const me = whoAmI();
    const settings = store.get(K.SETTINGS) ?? { v: 1, haptics: true };

    const hapticsBtn = h('button', {
      class: 'btn btn--small',
      onclick: () => {
        settings.haptics = !settings.haptics;
        store.set(K.SETTINGS, settings);
        hapticsBtn.textContent = settings.haptics ? 'on' : 'off';
      },
    }, settings.haptics ? 'on' : 'off');

    el.append(h('div', { class: 'screen stack gap-sm grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title' }, '⚙️ settings'),
      ),

      rowCard(
        h('span', { class: `avatar p-${me}` }, emojiOf(me)),
        h('span', { class: 'stack grow' },
          h('span', { style: 'font-weight:620;' }, `you are ${nameOf(me)}`),
          h('span', { class: 'small sub' }, 'on this device'),
        ),
        h('button', {
          class: 'btn btn--small btn--ghost',
          onclick: async () => {
            if (await confirmModal('switch who this device belongs to?', { title: 'switch player?' })) {
              clearIdentity();
              navigate('identity');
            }
          },
        }, 'switch'),
      ),

      rowCard(
        h('span', { style: 'font-size:22px;' }, '📳'),
        h('span', { class: 'stack grow' },
          h('span', { style: 'font-weight:620;' }, 'haptics'),
          h('span', { class: 'small sub' }, 'little buzzes on nudges & turns'),
        ),
        hapticsBtn,
      ),

      rowCard(
        h('span', { style: 'font-size:22px;' }, '🧹'),
        h('span', { class: 'stack grow' },
          h('span', { style: 'font-weight:620;' }, 'wipe this device'),
          h('span', { class: 'small sub' }, 'clears local data — shared stats heal back from your partner'),
        ),
        h('button', {
          class: 'btn btn--small btn--coral',
          onclick: async () => {
            if (await confirmModal('really wipe everything on this device?', { title: 'wipe device?', yes: 'wipe it', danger: true })) {
              store.wipe();
              toast('wiped ✨');
              setTimeout(() => location.reload(), 400);
            }
          },
        }, 'wipe'),
      ),

      h('div', { class: 'center-text small faint mt-lg stack gap-xs' },
        h('span', {}, `div & diya dungeon · v${APP_VERSION}${isTest() ? ' · TEST MODE' : ''}`),
        h('button', { class: 'small faint', style: 'text-decoration:underline dotted;', onclick: () => navigate('debug') }, 'debug'),
      ),
    ));
  },
};
