// App-wide reactive UI that must work on every screen: incoming invite
// banners, nudge effects, same-identity warnings.
import { h } from '../core/ui/dom.js';
import { toast } from '../core/ui/toast.js';
import { invites, acceptInvite, declineInvite } from '../session/invites.js';
import { nudges } from '../session/nudges.js';
import { connection } from '../sync/connection.js';
import { gameById } from '../games/registry.js';
import { partnerOf, nameOf, emojiOf, whoAmI } from '../core/identity.js';
import { store, K } from '../core/storage.js';

const banners = new Map(); // inviteId -> el
let zone = null;

function ensureZone() {
  if (!zone || !zone.isConnected) {
    zone = h('div', { class: 'banner-zone' });
    document.getElementById('overlays').append(zone);
  }
  return zone;
}

function haptic(pattern) {
  if ((store.get(K.SETTINGS)?.haptics ?? true)) {
    try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
  }
}

function heartsRain(emoji = '💗', count = 5) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const s = document.createElement('span');
      s.className = 'heart-fly';
      s.textContent = emoji;
      s.style.left = `${18 + Math.random() * 64}vw`;
      s.style.bottom = `${8 + Math.random() * 20}vh`;
      document.body.append(s);
      setTimeout(() => s.remove(), 1700);
    }, i * 140);
  }
}

function removeBanner(inviteId) {
  const el = banners.get(inviteId);
  if (!el) return;
  banners.delete(inviteId);
  el.classList.add('banner--leaving');
  setTimeout(() => el.remove(), 180);
}

export function initGlobalUI() {
  const partnerName = () => nameOf(partnerOf(whoAmI()));

  invites.on('incoming', ({ inviteId, gameId }) => {
    const g = gameById(gameId);
    if (!g) return;
    haptic([25, 40, 25]);
    const el = h('div', { class: 'banner sticker' },
      h('span', { style: 'font-size:30px;' }, g.emoji),
      h('span', { class: 'stack grow', style: 'text-align:left;min-width:0;' },
        h('span', { style: 'font-weight:620;font-size:15px;' }, `${partnerName()} wants to play ${g.name}!`),
        h('span', { class: 'hand sub', style: 'font-size:14px;' }, 'right now. immediately.'),
      ),
      h('span', { class: 'stack gap-xs' },
        h('button', { class: 'btn btn--small btn--me', onclick: () => { acceptInvite(inviteId); removeBanner(inviteId); } }, "let's go 💘"),
        h('button', { class: 'btn btn--small btn--ghost', onclick: () => { declineInvite(inviteId); removeBanner(inviteId); } }, 'not now'),
      ),
    );
    banners.set(inviteId, el);
    ensureZone().append(el);
  });

  invites.on('cancelled', ({ inviteId }) => removeBanner(inviteId));

  invites.on('declined', () => {
    toast(`${partnerName()} said not now 🥺`, { emoji: '💔' });
  });

  nudges.on('nudge', ({ emoji, text }) => {
    haptic([35, 45, 35, 45, 60]);
    heartsRain(emoji);
    toast(`${partnerName()} ${text}`, { emoji });
  });

  let sameWhoWarned = 0;
  connection.onSameWho(() => {
    if (Date.now() - sameWhoWarned < 60_000) return;
    sameWhoWarned = Date.now();
    toast("you're signed in on another device too 👀", { emoji: '⚠️', ms: 4000 });
  });
}
