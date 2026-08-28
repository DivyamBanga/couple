// Daily-ritual data: answers keyed by (date, game, player), merged between
// devices with the same offer/pull/push pattern as the scoreboard log.
// Streaks are always derived, never stored.
import { store, K } from '../../core/storage.js';
import { fnv1a32 } from '../../core/hash.js';
import { Emitter } from '../../core/events.js';
import { connection } from '../../sync/connection.js';
import { MSG } from '../../sync/protocol.js';
import { whoAmI, partnerOf } from '../../core/identity.js';
import { todayKey, dateKey } from '../../core/time.js';

export const dailyEvents = new Emitter(); // 'changed'

function load() {
  return store.get(K.DAILY) ?? { v: 1, answers: {}, q36: { furthest: 0 } };
}

function save(d) {
  store.set(K.DAILY, d);
  dailyEvents.emit('changed');
}

// deterministic daily item index for a deck
export function dailyIndex(gameKey, len, dateK = todayKey()) {
  return fnv1a32(`${dateK}|${gameKey}`) % len;
}

export function getAnswer(gameKey, who, dateK = todayKey()) {
  return load().answers?.[dateK]?.[gameKey]?.[who] ?? null;
}

export function putMyAnswer(gameKey, data, dateK = todayKey()) {
  const d = load();
  d.answers[dateK] ??= {};
  d.answers[dateK][gameKey] ??= {};
  if (d.answers[dateK][gameKey][whoAmI()]) return false; // one answer per day
  d.answers[dateK][gameKey][whoAmI()] = { ...data, at: Date.now() };
  save(d);
  sendOffer();
  return true;
}

export function q36Progress() {
  return load().q36?.furthest ?? 0;
}

export function q36Advance(to) {
  const d = load();
  d.q36 ??= { furthest: 0 };
  if (to <= d.q36.furthest) return;
  d.q36.furthest = to;
  save(d);
  sendOffer();
}

export function q36Reset() {
  const d = load();
  d.q36 = { furthest: 0 };
  save(d);
  sendOffer();
}

// device-local in-progress drafts (e.g. half-finished daily wordle)
export function getDraft(gameKey, dateK = todayKey()) {
  const d = store.get(`draft.${gameKey}`);
  return d?.date === dateK ? d.data : null;
}

export function putDraft(gameKey, data, dateK = todayKey()) {
  store.set(`draft.${gameKey}`, { date: dateK, data });
}

// consecutive days (ending today, or yesterday if today isn't complete yet)
// where BOTH players answered.
export function streak(gameKey) {
  const d = load();
  const me = whoAmI();
  const partner = partnerOf(me);
  const complete = (dk) => d.answers?.[dk]?.[gameKey]?.[me] && d.answers?.[dk]?.[gameKey]?.[partner];
  let n = 0;
  const day = new Date();
  if (!complete(dateKey(day))) day.setDate(day.getDate() - 1);
  while (complete(dateKey(day))) {
    n++;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

// ── merge protocol (mirrors scoreboard/log.js) ─────────────────
function digest() {
  const d = load();
  const keys = [];
  for (const [dk, games] of Object.entries(d.answers ?? {})) {
    for (const [g, byWho] of Object.entries(games)) {
      for (const who of Object.keys(byWho)) keys.push(`${dk}|${g}|${who}`);
    }
  }
  return fnv1a32(keys.sort().join(',') + `|q36:${d.q36?.furthest ?? 0}`);
}

function mergeIn(payload) {
  if (!payload) return;
  const d = load();
  let changed = false;
  for (const [dk, games] of Object.entries(payload.answers ?? {})) {
    for (const [g, byWho] of Object.entries(games)) {
      for (const [who, ans] of Object.entries(byWho)) {
        d.answers[dk] ??= {};
        d.answers[dk][g] ??= {};
        if (!d.answers[dk][g][who]) {
          d.answers[dk][g][who] = ans;
          changed = true;
        }
      }
    }
  }
  const theirQ36 = payload.q36?.furthest ?? 0;
  if (theirQ36 > (d.q36?.furthest ?? 0)) {
    d.q36 = { furthest: theirQ36 };
    changed = true;
  }
  if (changed) save(d);
}

export function sendOffer() {
  connection.send(MSG.DAILY_OFFER, { digest: digest() });
}

connection.onMessage(MSG.DAILY_OFFER, async (p) => {
  if (p?.digest === digest()) return;
  try {
    const res = await connection.request(MSG.DAILY_FULL, {});
    mergeIn(res);
  } catch { /* retry on next hello */ }
  if (p?.digest !== digest()) {
    const d = load();
    connection.send(MSG.DAILY_FULL, { answers: d.answers, q36: d.q36 });
  }
});

connection.onMessage(MSG.DAILY_FULL, (p) => {
  mergeIn(p);
  const d = load();
  return { answers: d.answers, q36: d.q36 };
});

connection.onPartner(({ present }) => {
  if (present) setTimeout(sendOffer, 700);
});
