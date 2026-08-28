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
  window.__cpl = { connection, store, whoAmI, invites, sendInvite, acceptInvite, declineInvite, cancelInvite, sendNudge, addRecord, recordList, mergeRecords };
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
