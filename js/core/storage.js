// Versioned localStorage wrapper. Every stored value is JSON with a `v` field.
// QA isolation: when a tab has the ?as= override (sessionStorage 'cpl.testAs',
// set by the inline head script BEFORE modules load), all keys get a
// `t.{who}.` prefix so two tabs in one profile act as two devices.

const TEST_AS = sessionStorage.getItem('cpl.testAs') || null;
const PREFIX = TEST_AS ? `t.${TEST_AS}.cpl.` : 'cpl.';

export const K = {
  META: 'meta',
  IDENT: 'identity',
  SETTINGS: 'settings',
  LOG: 'log',
  SESSION: 'session',
  DAILY: 'daily',
  Q36: 'q36',
  SEEN: 'deckSeen',
  CUSTOM_WORDS: 'customWords',
};

export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('[storage] set failed', key, err);
      return false;
    }
  },
  del(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
  // Wipe everything this "device" owns (respects the test prefix).
  wipe() {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  },
  dump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        try { out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)); }
        catch { out[k.slice(PREFIX.length)] = localStorage.getItem(k); }
      }
    }
    return out;
  },
};

// Per-key migrations: { [key]: { [fromVersion]: (old) => next } }
const MIGRATIONS = {};

export function migrate() {
  const meta = store.get(K.META) || { v: 1, schema: 1, firstRunAt: Date.now() };
  for (const [key, steps] of Object.entries(MIGRATIONS)) {
    let val = store.get(key);
    while (val && steps[val.v]) {
      val = steps[val.v](val);
      store.set(key, val);
    }
  }
  store.set(K.META, meta);
}
