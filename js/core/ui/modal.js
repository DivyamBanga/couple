import { h, append } from './dom.js';

// showModal({ title, body, actions, dismissible }) → { close }
// body: node | string | array. actions: [{label, cls, onClick, close=true}]
export function showModal({ title, body, actions = [], dismissible = true } = {}) {
  const overlay = h('div', { class: 'modal-overlay' });
  const panel = h('div', { class: 'modal sticker stack gap-md', role: 'dialog', 'aria-modal': 'true' });

  if (title) panel.append(h('div', { class: 'title-md' }, title));
  if (body != null) {
    const bodyEl = h('div', { class: 'stack gap-sm' });
    append(bodyEl, body);
    panel.append(bodyEl);
  }

  const close = () => {
    overlay.classList.add('banner--leaving');
    setTimeout(() => overlay.remove(), 150);
  };

  if (actions.length) {
    const row = h('div', { class: 'row gap-sm wrap', style: 'justify-content:flex-end;margin-top:4px;' });
    for (const a of actions) {
      row.append(h('button', {
        class: `btn ${a.cls ?? ''}`,
        onclick: () => {
          if (a.close !== false) close();
          a.onClick?.();
        },
      }, a.label));
    }
    panel.append(row);
  }

  if (dismissible) {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  overlay.append(panel);
  document.getElementById('overlays').append(overlay);
  return { close, panel };
}

export function confirmModal(message, { title = 'you sure?', yes = 'yes!', no = 'nevermind', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = showModal({
      title,
      body: message,
      dismissible: false,
      actions: [
        { label: no, cls: 'btn--ghost', onClick: () => resolve(false) },
        { label: yes, cls: danger ? 'btn--coral' : 'btn--me', onClick: () => resolve(true) },
      ],
    });
    void m;
  });
}
