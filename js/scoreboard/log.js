// Append-only game-result log with serverless sync: both devices witness
// every game, record it locally, and re-merge full logs whenever they
// connect. A wiped device heals completely from its partner.
//
// Record: { id: sid, v:1, gameId, startedAt, endedAt, players:[...],
//           result: {winner|null, draw, reason:'win'|'draw'|'void'|'abandoned'},
//           score: {diya, divyam} | null, x: {seed, moves, durationMs, rematchOf?} }
import { store, K } from '../core/storage.js';
import { fnv1a32 } from '../core/hash.js';
import { Emitter } from '../core/events.js';
import { connection } from '../sync/connection.js';
import { MSG } from '../sync/protocol.js';

export const logEvents = new Emitter(); // 'changed'

function load() {
  return store.get(K.LOG) ?? { v: 1, records: {} };
}

export function allRecords() {
  return load().records;
}

export function recordList() {
  return Object.values(allRecords());
}

export function digest() {
  const ids = Object.keys(allRecords()).sort();
  return fnv1a32(ids.join(','));
}

export function addRecord(record) {
  if (!record?.id) return false;
  const log = load();
  if (log.records[record.id]) return false; // first-seen wins
  log.records[record.id] = record;
  store.set(K.LOG, log);
  logEvents.emit('changed');
  // let the partner know something new exists (cheap offer, they pull if needed)
  sendOffer();
  return true;
}

export function mergeRecords(records) {
  if (!records || typeof records !== 'object') return 0;
  const log = load();
  let added = 0;
  for (const [id, rec] of Object.entries(records)) {
    if (!log.records[id] && rec?.id === id) {
      log.records[id] = rec;
      added++;
    }
  }
  if (added > 0) {
    store.set(K.LOG, log);
    logEvents.emit('changed');
  }
  return added;
}

export function sendOffer() {
  connection.send(MSG.LOG_OFFER, { count: recordList().length, digest: digest() });
}

// ── merge protocol ─────────────────────────────────────────────
connection.onMessage(MSG.LOG_OFFER, async (p) => {
  if (p?.digest === digest()) return; // in sync
  try {
    const res = await connection.request(MSG.LOG_FULL, {});
    if (res?.records) mergeRecords(res.records);
  } catch { /* partner vanished mid-merge; next hello retries */ }
  // if we now hold records they lack, push ours back
  if (p?.digest !== digest()) connection.send(MSG.LOG_FULL, { records: allRecords() });
});

// Serves BOTH the rpc pull (returns full log) and the push variant
// (payload carries records to merge).
connection.onMessage(MSG.LOG_FULL, (p) => {
  if (p?.records) mergeRecords(p.records);
  return { records: allRecords() };
});

// every fresh partner connection triggers a digest exchange
connection.onPartner(({ present }) => {
  if (present) setTimeout(sendOffer, 400);
});
