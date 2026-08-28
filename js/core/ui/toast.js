import { h } from './dom.js';

let zone = null;

function ensureZone() {
  if (!zone || !zone.isConnected) {
    zone = h('div', { class: 'toast-zone' });
    document.getElementById('overlays').append(zone);
  }
  return zone;
}

export function toast(msg, { emoji = '', ms = 2600 } = {}) {
  const z = ensureZone();
  while (z.children.length >= 3) z.firstChild.remove();
  const el = h('div', { class: 'toast', role: 'status' }, emoji ? `${emoji} ` : '', msg);
  z.append(el);
  setTimeout(() => {
    el.classList.add('toast--leaving');
    setTimeout(() => el.remove(), 200);
  }, ms);
  return el;
}
