// Hosts every game route: pre-game lobby (invite flow) → engine runner
// once a session exists. One active session at a time, by design.
// Every mount creates an instance object; async work and event handlers
// verify the instance is still alive before touching the DOM (the router
// reuses one container element, so stale async mounts must no-op).
import { h, clear } from '../core/ui/dom.js';
import { gameById } from '../games/registry.js';
import { navigate } from '../router.js';
import { toast } from '../core/ui/toast.js';
import { currentSession, sessions } from '../session/session.js';
import { sendInvite, cancelInvite, acceptInvite, getOutgoing, invites } from '../session/invites.js';
import { connection } from '../sync/connection.js';
import { whoAmI, partnerOf, nameOf } from '../core/identity.js';
import { createPresencePill } from '../core/ui/presence-pill.js';

let inst = null; // current mount instance

function injectCss(id, css) {
  if (!css || document.querySelector(`style[data-game="${id}"]`)) return;
  const style = document.createElement('style');
  style.dataset.game = id;
  style.textContent = css;
  document.head.append(style);
}

async function engineMount(el, mod, g, session) {
  switch (mod.engine) {
    case 'turnbased': {
      const { mountTurnBased } = await import('../engines/turnbased/engine.js');
      return mountTurnBased(el, mod, g, session);
    }
    case 'reveal': {
      const { mountReveal } = await import('../engines/reveal/engine.js');
      return mountReveal(el, mod, g, session);
    }
    case 'timed': {
      const { mountTimed } = await import('../engines/timed/engine.js');
      return mountTimed(el, mod, g, session);
    }
    case 'prompt': {
      const { mountPrompt } = await import('../engines/prompt/engine.js');
      return mountPrompt(el, mod, g, session);
    }
    case 'canvas': {
      const { mountCanvas } = await import('../engines/canvas/engine.js');
      return mountCanvas(el, mod, g, session);
    }
    case 'custom':
      return mod.mountCustom(el, g, session);
    case 'viewer':
      return mod.mountViewer(el, g);
    default:
      throw new Error(`unknown engine ${mod.engine}`);
  }
}

function lobbyView(i, mod, g) {
  const partner = partnerOf(whoAmI());
  const pill = createPresencePill();
  i.unsubs.push(pill.destroy);

  const actionZone = h('div', { class: 'stack gap-sm center', style: 'width:100%;max-width:300px;' });

  const renderAction = () => {
    if (!i.alive) return;
    clear(actionZone);
    const out = getOutgoing();
    if (out?.gameId === g.id) {
      actionZone.append(
        h('div', { class: 'hand sub', style: 'font-size:17px;' }, `invite sent 💌 waiting for ${nameOf(partner)}`,
          h('span', { class: 'dots-thinking' })),
        h('button', { class: 'btn', onclick: () => { cancelInvite(); renderAction(); } }, 'never mind'),
      );
    } else if (connection.partnerPresent()) {
      actionZone.append(h('button', {
        class: 'btn btn--me btn--big', style: 'width:100%;',
        onclick: async () => { await sendInvite(g.id); renderAction(); },
      }, `invite ${nameOf(partner)} to play 💘`));
    } else {
      actionZone.append(
        h('div', { class: 'hand sub', style: 'font-size:17px;' }, `${nameOf(partner)} isn't here yet 💤`),
        h('div', { class: 'small faint' }, 'the invite button appears when you two are both online'),
      );
    }
  };

  i.unsubs.push(connection.onPartner(renderAction));
  i.unsubs.push(invites.on('declined', renderAction));
  i.unsubs.push(invites.on('expired', ({ reason }) => { if (reason !== 'merged' && reason !== 'superseded') renderAction(); }));
  i.unsubs.push(invites.on('incoming', ({ inviteId, gameId }) => {
    if (gameId !== g.id || !i.alive) return;
    clear(actionZone);
    actionZone.append(h('button', {
      class: 'btn btn--me btn--big', style: 'width:100%;',
      onclick: () => acceptInvite(inviteId),
    }, `${nameOf(partner)} invited YOU — let's go 💘`));
  }));

  i.el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
      h('span', { class: 'game-head__title grow' }, `${g.emoji} ${g.name}`),
      pill.el,
    ),
    h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;text-align:center;padding:20px 0 60px;' },
      h('div', { style: 'font-size:74px;animation:bob 3.4s ease-in-out infinite;' }, g.emoji),
      h('div', { class: 'title-lg' }, g.name),
      h('div', { class: 'hand sub', style: 'font-size:18px;max-width:300px;' }, mod.blurb ?? g.tagline),
      h('div', { class: 'mt-md', style: 'width:100%;display:flex;justify-content:center;' }, actionZone),
    ),
  ));
  renderAction();
}

export default {
  async mount(el, [id]) {
    const i = { el, id, alive: true, unsubs: [], cleanup: null, mode: 'loading' };
    inst = i;

    const g = gameById(id);
    if (!g) { toast('that game does not exist 🫠'); return navigate(''); }

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

    const active = currentSession();
    if (active?.status === 'active' && active.gameId !== id) {
      toast('you two have a game going — finish that first 💫', { ms: 2600 });
      return navigate(`game/${active.gameId}`);
    }

    el.append(h('div', { class: 'cozy-empty', 'data-holder': '' },
      h('span', { class: 'cozy-empty__emoji' }, g.emoji),
      h('div', { class: 'dots-thinking' }, 'setting up'),
    ));

    let mod;
    try {
      mod = (await g.load()).default;
    } catch (err) {
      console.error('[game-host] load failed', err);
      if (!i.alive) return;
      clear(el);
      el.append(h('div', { class: 'cozy-empty' },
        h('span', { class: 'cozy-empty__emoji' }, '🫠'),
        h('div', {}, 'this game failed to load — try again?'),
        h('button', { class: 'btn mt-sm', onclick: () => location.reload() }, 'reload'),
      ));
      return;
    }
    if (!i.alive) return;
    injectCss(id, mod.css);

    const mountFor = async (session) => {
      if (!i.alive) return;
      try { i.cleanup?.(); } catch { /* ignore */ }
      i.cleanup = null;
      clear(el);
      if (session && session.status === 'active' && session.gameId === id) {
        i.mode = 'engine';
        const cl = await engineMount(el, mod, g, session);
        if (!i.alive) { try { cl?.(); } catch { /* ignore */ } return; }
        i.cleanup = cl;
      } else if (mod.engine === 'viewer') {
        i.mode = 'engine';
        const cl = await engineMount(el, mod, g, null);
        if (!i.alive) { try { cl?.(); } catch { /* ignore */ } return; }
        i.cleanup = cl;
      } else {
        i.mode = 'lobby';
        lobbyView(i, mod, g);
      }
    };

    // only the LOBBY swaps itself when a session starts; if an engine is
    // already mounted (e.g. rematch from the end screen), session.js's
    // navigate() triggers a full clean remount through the router instead.
    i.unsubs.push(sessions.on('started', (s) => {
      if (s.gameId === id && i.mode === 'lobby') mountFor(s);
    }));

    await mountFor(currentSession());
  },

  unmount() {
    if (!inst) return;
    inst.alive = false;
    try { inst.cleanup?.(); } catch (err) { console.error('[game-host] cleanup', err); }
    inst.unsubs.forEach((u) => u());
    inst = null;
  },
};
