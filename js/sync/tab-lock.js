// One active tab per device. A second tab shows a takeover screen instead of
// silently fighting over the identity. Disabled in ?as= test tabs (they're
// intentionally parallel).
import { isTest } from '../core/identity.js';

const CLAIM_WAIT_MS = 350;
let channel = null;
let myTabId = null;
let active = false;
let onEvictedCb = null;

export function initTabLock({ onEvicted } = {}) {
  onEvictedCb = onEvicted;
  if (isTest() || !('BroadcastChannel' in window)) { active = true; return Promise.resolve('active'); }

  myTabId = sessionStorage.getItem('cpl.tabId') ?? String(Math.random());
  channel = new BroadcastChannel('cpl-tab');

  return new Promise((resolve) => {
    let answered = false;

    channel.onmessage = ({ data }) => {
      if (!data || data.tabId === myTabId) return;
      if (data.type === 'claim' && active) {
        channel.postMessage({ type: 'active', tabId: myTabId });
      } else if (data.type === 'active' && !active) {
        answered = true;
      } else if (data.type === 'takeover' && active) {
        active = false;
        onEvictedCb?.();
      }
    };

    channel.postMessage({ type: 'claim', tabId: myTabId });
    setTimeout(() => {
      active = !answered;
      resolve(active ? 'active' : 'passive');
    }, CLAIM_WAIT_MS);
  });
}

export function takeover() {
  channel?.postMessage({ type: 'takeover', tabId: myTabId });
  active = true;
}

export function isActiveTab() { return active; }
