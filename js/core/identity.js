import { store, K } from './storage.js';
import { uuid } from './uuid.js';
import { PLAYERS, PLAYER_IDS } from '../config.js';

const TEST_AS = sessionStorage.getItem('cpl.testAs') || null;

export function isTest() {
  return TEST_AS !== null;
}

// 'divyam' | 'diya' | null. In a ?as= tab the override IS the identity
// (already namespaced into storage by the prefix), but we still persist a
// record so deviceId is stable per test-tab-identity.
export function whoAmI() {
  if (TEST_AS) {
    let rec = store.get(K.IDENT);
    if (!rec) {
      rec = { v: 1, who: TEST_AS, deviceId: uuid() };
      store.set(K.IDENT, rec);
    }
    return TEST_AS;
  }
  return store.get(K.IDENT)?.who ?? null;
}

export function setIdentity(who) {
  if (!PLAYER_IDS.includes(who)) throw new Error(`unknown player: ${who}`);
  const prev = store.get(K.IDENT);
  store.set(K.IDENT, { v: 1, who, deviceId: prev?.deviceId ?? uuid() });
  document.body.dataset.me = who;
}

export function clearIdentity() {
  store.del(K.IDENT);
  delete document.body.dataset.me;
}

export function deviceId() {
  whoAmI(); // ensures a record exists in test mode
  return store.get(K.IDENT)?.deviceId ?? 'unknown';
}

export function partnerOf(who = whoAmI()) {
  return who === 'divyam' ? 'diya' : 'divyam';
}

export function nameOf(who) {
  return PLAYERS[who]?.name ?? who;
}

export function emojiOf(who) {
  return PLAYERS[who]?.emoji ?? '💘';
}
