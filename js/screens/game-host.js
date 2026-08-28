import { h } from '../core/ui/dom.js';
import { gameById } from '../games/registry.js';
import { navigate } from '../router.js';
import { toast } from '../core/ui/toast.js';

let activeGame = null; // { module, cleanup }

export default {
  async mount(el, [id]) {
    const g = gameById(id);
    if (!g) {
      toast('that game does not exist 🫠');
      return navigate('');
    }

    if (g.status === 'soon') {
      el.append(h('div', { class: 'screen stack grow' },
        h('div', { class: 'game-head' },
          h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
          h('span', { class: 'game-head__title' }, `${g.emoji} ${g.name}`),
        ),
        h('div', { class: 'cozy-empty sticker grow center stack' },
          h('span', { class: 'cozy-empty__emoji' }, '🧷'),
          h('div', { class: 'title-md' }, 'not glued in yet!'),
          h('div', { class: 'hand', style: 'font-size:17px;' }, 'this sticker is still drying — check back soon'),
        ),
      ));
      return;
    }

    // loading placeholder while the module fetches
    const holder = h('div', { class: 'screen stack grow' },
      h('div', { class: 'cozy-empty' },
        h('span', { class: 'cozy-empty__emoji' }, g.emoji),
        h('div', { class: 'dots-thinking' }, 'setting up'),
      ),
    );
    el.append(holder);

    try {
      const module = await g.load();
      if (!holder.isConnected) return; // user navigated away mid-load
      holder.remove();
      activeGame = { module };
      activeGame.cleanup = await module.default.mount(el, g);
    } catch (err) {
      console.error('[game-host] load failed', err);
      holder.remove();
      el.append(h('div', { class: 'cozy-empty' },
        h('span', { class: 'cozy-empty__emoji' }, '🫠'),
        h('div', {}, 'this game failed to load — try again?'),
        h('button', { class: 'btn mt-sm', onclick: () => location.reload() }, 'reload'),
      ));
    }
  },

  unmount() {
    try { activeGame?.cleanup?.(); } catch (err) { console.error('[game-host] cleanup', err); }
    try { activeGame?.module?.default?.unmount?.(); } catch (err) { console.error('[game-host] unmount', err); }
    activeGame = null;
  },
};
