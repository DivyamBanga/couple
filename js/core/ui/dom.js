// Tiny hyperscript. Text children are inserted as text nodes (safe);
// use the explicit `html:` attr only for trusted internal markup.
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'string') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, kids);
  return el;
}

export function append(el, kid) {
  if (kid == null || kid === false) return;
  if (Array.isArray(kid)) { kid.forEach((x) => append(el, x)); return; }
  el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function vibrate(pattern = 18) {
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

// A few celebratory hearts bursting from an element — the reveal beat.
export function heartBurst(fromEl, { count = 6, emoji = '💗' } = {}) {
  const rect = fromEl.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'pop-heart';
    s.textContent = emoji;
    s.style.left = `${rect.left + rect.width / 2 + (Math.random() * 40 - 20)}px`;
    s.style.top = `${rect.top + rect.height / 2}px`;
    s.style.setProperty('--dx', `${Math.random() * 80 - 40}px`);
    s.style.setProperty('--dy', `${-50 - Math.random() * 60}px`);
    s.style.position = 'fixed';
    s.style.zIndex = 80;
    document.body.append(s);
    setTimeout(() => s.remove(), 950);
  }
}
