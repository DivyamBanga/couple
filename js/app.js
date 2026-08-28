import { migrate, store } from './core/storage.js';
import { whoAmI, isTest } from './core/identity.js';
import { register, startRouter } from './router.js';
import { h, clear } from './core/ui/dom.js';
import { connection } from './sync/connection.js';
import { initTabLock, takeover } from './sync/tab-lock.js';

import { initGlobalUI } from './screens/global-ui.js';
import { invites, sendInvite, acceptInvite, declineInvite, cancelInvite } from './session/invites.js';
import { sendNudge } from './session/nudges.js';
import { addRecord, recordList, mergeRecords } from './scoreboard/log.js';
import { currentSession, sessions } from './session/session.js';
import './games/daily/store.js'; // daily-answer merge protocol must always be live
import identityScreen from './screens/identity.js';
import homeScreen from './screens/home.js';
import gameHostScreen from './screens/game-host.js';
import scoreboardScreen from './screens/scoreboard.js';
import settingsScreen from './screens/settings.js';
import debugScreen from './screens/debug.js';

migrate();

const me = whoAmI();
if (me) document.body.dataset.me = me;

if (isTest()) {
  document.body.append(h('div', { class: 'test-badge' }, `test · ${me ?? '?'}`));
  // E2E harness hook — only exists in ?as= test tabs
  window.__cpl = { connection, store, whoAmI, invites, sendInvite, acceptInvite, declineInvite, cancelInvite, sendNudge, addRecord, recordList, mergeRecords, currentSession, sessions };
}

register('identity', identityScreen);
register('home', homeScreen);
register('game', gameHostScreen);
register('scoreboard', scoreboardScreen);
register('settings', settingsScreen);
register('debug', debugScreen);

function showPassiveScreen() {
  const app = document.getElementById('app');
  clear(app);
  app.append(h('div', { class: 'screen stack center gap-md grow', style: 'justify-content:center;text-align:center;min-height:80dvh;' },
    h('div', { class: 'cozy-empty sticker stack center' },
      h('span', { class: 'cozy-empty__emoji' }, '🫣'),
      h('div', { class: 'title-md' }, 'already open in another tab'),
      h('div', { class: 'hand sub', style: 'font-size:17px;' }, 'the dungeon only fits one of you per device'),
      h('button', {
        class: 'btn btn--me mt-md',
        onclick: () => { takeover(); setTimeout(() => location.reload(), 150); },
      }, 'use here instead'),
    ),
  ));
}

// ── PWA service worker (prod only — dev stays cache-free) ─────
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          const { toast } = { toast: null };
          import('./core/ui/toast.js').then((m) => {
            const t = m.toast('new version ✨ tap to update', { ms: 10_000 });
            t.style.cursor = 'pointer';
            t.addEventListener('click', () => worker.postMessage('SKIP_WAITING'));
          });
        }
      });
    });
  }).catch((err) => console.warn('[sw] register failed', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    // never yank the rug mid-game — session screens reload on next visit
    if (!currentSession()) location.reload();
  });
}

const lockState = await initTabLock({
  onEvicted: () => {
    connection.goPassive();
    showPassiveScreen();
  },
});

if (lockState === 'passive') {
  showPassiveScreen();
} else {
  initGlobalUI();
  startRouter(document.getElementById('app'));
  // start sync as soon as we know who this device belongs to
  if (whoAmI()) connection.ensureStarted();
  window.addEventListener('hashchange', () => {
    if (whoAmI()) {
      document.body.dataset.me = whoAmI();
      connection.ensureStarted();
    }
  });
}
