import { h } from './dom.js';
import { connection } from '../../sync/connection.js';
import { partnerOf, nameOf, emojiOf, whoAmI } from '../identity.js';

// Live "diya is here 🟢" pill. Returns { el, destroy }.
export function createPresencePill() {
  const partner = partnerOf(whoAmI());
  const label = h('span', {}, '…');
  const el = h('span', { class: `presence p-${partner}` },
    h('span', { class: 'presence__avatar' }, emojiOf(partner)),
    h('span', { class: 'presence__dot' }),
    label,
  );

  const render = () => {
    const name = nameOf(partner);
    el.classList.remove('presence--online', 'presence--connecting');
    if (connection.partnerPresent()) {
      el.classList.add('presence--online');
      label.textContent = `${name} is here!`;
    } else if (connection.state === 'online' || connection.state === 'connecting' || connection.state === 'reconnecting') {
      el.classList.add('presence--connecting');
      label.textContent = `waiting for ${name}`;
    } else {
      label.textContent = `${name} · away`;
    }
  };

  const unsubs = [
    connection.onPartner(render),
    connection.onState(render),
  ];
  render();

  return { el, destroy: () => unsubs.forEach((u) => u()) };
}
