import { h, clear } from '../core/ui/dom.js';
import { store } from '../core/storage.js';
import { whoAmI, deviceId, isTest } from '../core/identity.js';
import { navigate } from '../router.js';
import { connection } from '../sync/connection.js';
import { toast } from '../core/ui/toast.js';
import { APP_VERSION, PROTO_VERSION } from '../version.js';

let timer = null;

export default {
  mount(el) {
    const syncPre = h('pre', {
      class: 'sticker',
      style: 'padding:12px;font-size:11px;overflow:auto;max-height:34dvh;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;',
    });
    const dumpPre = h('pre', {
      class: 'sticker',
      style: 'padding:12px;font-size:11px;overflow:auto;max-height:30dvh;font-family:ui-monospace,monospace;',
    });

    const refresh = () => {
      syncPre.textContent = JSON.stringify(connection.diagnostics(), null, 1);
      dumpPre.textContent = JSON.stringify(store.dump(), null, 1);
    };

    el.append(h('div', { class: 'screen stack gap-sm grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('settings') }, '←'),
        h('span', { class: 'game-head__title' }, '🛠️ debug'),
      ),
      h('div', { class: 'sticker', style: 'padding:12px 16px;font-size:13px;' },
        h('div', {}, `who: ${whoAmI()} · device: ${deviceId().slice(0, 8)} · test: ${isTest()}`),
        h('div', {}, `app: ${APP_VERSION} · proto: ${PROTO_VERSION}`),
      ),
      h('div', { class: 'row gap-xs wrap' },
        h('button', {
          class: 'btn btn--small',
          onclick: async () => {
            const ms = await connection.ping();
            toast(ms == null ? 'no partner to ping 🥺' : `pong! ${Math.round(ms)}ms`, { emoji: '🏓' });
          },
        }, '🏓 ping'),
        h('button', { class: 'btn btn--small', onclick: () => connection.forceReconnect('debug') }, '🔄 reconnect'),
        h('button', { class: 'btn btn--small', onclick: refresh }, '♻️ refresh'),
      ),
      h('div', { class: 'small sub' }, 'sync'),
      syncPre,
      h('div', { class: 'small sub' }, 'storage'),
      dumpPre,
    ));

    refresh();
    timer = setInterval(refresh, 2000);
  },

  unmount() {
    clearInterval(timer);
    timer = null;
  },
};
