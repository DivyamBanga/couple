import { clear } from './core/ui/dom.js';
import { whoAmI } from './core/identity.js';

// Screen contract: { mount(el, params), unmount?() }
const routes = new Map(); // name -> screen module
let current = null;       // { screen, name }
let appEl = null;

export function register(name, screen) {
  routes.set(name, screen);
}

export function navigate(path) {
  const target = `#/${path.replace(/^[#/]+/, '')}`;
  if (location.hash === target) render();
  else location.hash = target;
}

export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', args: parts.slice(1) };
}

function render() {
  const { name, args } = currentRoute();

  // identity gate: everything except the picker needs to know who you are
  if (!whoAmI() && name !== 'identity') return navigate('identity');
  if (whoAmI() && name === 'identity') return navigate('');

  const screen = routes.get(name) ?? routes.get('home');
  try { current?.screen?.unmount?.(); } catch (err) { console.error('[router] unmount', err); }

  clear(appEl);
  window.scrollTo(0, 0);
  current = { screen, name };
  try {
    screen.mount(appEl, args);
  } catch (err) {
    console.error('[router] mount failed', err);
    appEl.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'cozy-empty';
    d.textContent = 'something wobbled 🫠 — try going back home';
    appEl.append(d);
  }
}

export function startRouter(el) {
  appEl = el;
  window.addEventListener('hashchange', render);
  render();
}
