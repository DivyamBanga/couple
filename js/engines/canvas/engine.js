// Canvas engine: shared chrome for the drawing games. The games own their
// flows entirely (drawguess = versus rounds, telephone = chain + gallery);
// this provides the head/back/abandon, disconnect banner, standard end
// overlay with rematch, and small shared helpers.
import { h, clear, heartBurst, vibrate } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { store, K } from '../../core/storage.js';

export function mountCanvas(el, mod, gameMeta, session) {
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let destroyed = false;
  let gameCleanup = null;

  const dcZone = h('div', {});
  const flashZone = h('div', {});
  const bodyEl = h('div', { class: 'stack gap-sm grow', style: 'min-height:0;' });
  const overlayZone = h('div', {});
  const stage = h('div', { class: 'game-stage stack gap-sm grow' }, dcZone, flashZone, bodyEl, overlayZone);

  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', {
        class: 'back-btn', 'aria-label': 'home',
        onclick: async () => {
          if (session.status === 'active') {
            if (await confirmModal('leave this one? it counts for nothing 🥀', { title: 'leave?', yes: 'leave', danger: true })) {
              session.abandon('quit');
              navigate('');
            }
          } else navigate('');
        },
      }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
    ),
    stage,
  ));

  // ── shared helpers ──────────────────────────────────────────
  let flashTimer = null;
  const ctx = {
    session, me, partner, gameMeta, bodyEl,
    myName: nameOf(me), partnerName: nameOf(partner),
    myEmoji: emojiOf(me), partnerEmoji: emojiOf(partner),
    haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); },
    flash: (text, emoji = '✨', ms = 2200) => {
      clear(flashZone);
      clearTimeout(flashTimer);
      const elx = h('div', { class: 'dc-bar', style: 'background:var(--mint);color:#1e5c44;' },
        h('span', { style: 'font-size:18px;' }, emoji),
        h('span', { class: 'grow' }, text),
      );
      flashZone.append(elx);
      flashTimer = setTimeout(() => { elx.remove(); }, ms);
    },
    rematchRow: () => makeRematchRow(),
    onCleanup: (fn) => unsubs.push(fn),
  };

  function makeRematchRow() {
    const rematchBtn = h('button', {
      class: 'btn btn--me btn--big',
      onclick: async (e) => {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'invite sent 💌';
        heartBurst(e.currentTarget);
        await sendInvite(gameMeta.id, {});
      },
    }, 'play again 💕');
    unsubs.push(invites.on('declined', () => { rematchBtn.disabled = false; rematchBtn.textContent = 'play again 💕'; }));
    return h('div', { class: 'stack gap-xs center', style: 'width:min(280px,100%);margin:0 auto;' },
      connection.partnerPresent() ? rematchBtn : null,
      h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
    );
  }

  function showEndOverlay(record) {
    const winner = record?.result?.winner ?? null;
    const iWon = winner === me;
    const title = !winner ? "it's a tie!" : `${nameOf(winner)} wins!`;
    clear(overlayZone);
    overlayZone.append(h('div', { class: 'game-overlay' },
      h('div', { class: 'game-overlay__panel sticker stack gap-sm center' },
        h('div', { style: 'font-size:52px;animation:bob 2.4s ease-in-out infinite;' }, !winner ? '🤝' : iWon ? '🎉' : '😤'),
        h('div', { class: 'title-lg' }, title),
        record?.score ? h('div', { class: 'sub', style: 'font-weight:600;' }, `🌷 ${record.score.diya} – ${record.score.divyam} 🐻`) : null,
        h('div', { class: 'mt-sm', style: 'width:100%;' }, makeRematchRow()),
      ),
    ));
    if (iWon) heartBurst(overlayZone, { count: 8 });
  }

  // ── disconnect banner ───────────────────────────────────────
  let dcTimer = null;
  const renderDc = () => {
    clear(dcZone);
    clearInterval(dcTimer);
    if (connection.partnerPresent() || session.status !== 'active') return;
    const t0 = Date.now();
    const elapsed = h('span', { class: 'small', style: 'opacity:.7;' }, '0s');
    dcZone.append(h('div', { class: 'dc-bar' },
      h('span', { style: 'font-size:18px;' }, '📡'),
      h('span', { class: 'grow' }, `${nameOf(partner)}'s connection dropped… waiting `, elapsed),
      h('button', { class: 'btn btn--small', onclick: () => navigate('') }, 'home'),
    ));
    dcTimer = setInterval(() => { elapsed.textContent = `${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
  };
  unsubs.push(connection.onPartner(({ present }) => {
    renderDc();
    if (present && session.status === 'active') toast(`${nameOf(partner)} is back 💞`, { ms: 1600 });
  }));

  // ── endings ─────────────────────────────────────────────────
  unsubs.push(session.events.on('ended', ({ record }) => {
    const reason = record?.result?.reason;
    if (reason === 'abandoned') { navigate(''); return; }
    if (reason === 'void') { toast('that round evaporated 🫧', { ms: 2500 }); navigate(''); return; }
    if (!mod.customFinale) showEndOverlay(record);
  }));

  gameCleanup = mod.mountGame(bodyEl, ctx);
  renderDc();
  if (session.status === 'active') session.resync();

  return () => {
    destroyed = true;
    void destroyed;
    clearInterval(dcTimer);
    clearTimeout(flashTimer);
    try { gameCleanup?.(); } catch (err) { console.error('[canvas] game cleanup', err); }
    unsubs.forEach((u) => u());
  };
}
