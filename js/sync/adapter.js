// ─────────────────────────────────────────────────────────────────────────
// The transport contract. Game code NEVER touches a concrete adapter —
// everything goes through js/sync/connection.js, which owns one of these.
//
// Implementations: trystero-adapter.js (now) · firebase-adapter.js (later).
// Both must provide identical semantics:
//   • at-most-once delivery, NO ordering guarantee across message types
//     (the session layer orders via seq numbers)
//   • onPartner fires only after identity verification (hello exchange);
//     unknown peers are never surfaced
//   • send() drops (returns false) when the partner is absent — no queue;
//     callers needing reliability use request() or idempotent re-sends
//   • payloads: JSON-serializable, up to ~1 MB
//
// @typedef {'idle'|'connecting'|'online'|'reconnecting'|'offline'} ConnState
// @typedef {{who:string, deviceId:string, tabId:string, appVersion:string,
//            protoVersion:number, ts:number}} PeerMeta
// ─────────────────────────────────────────────────────────────────────────

export class SyncAdapter {
  /**
   * Join the couple space. Resolves when the transport is up (partner may
   * still be absent). Rejects {code:'timeout'|'transport', message}.
   * cfg = { coupleId, roomId, roomKey, me:PeerMeta, relays, relayRedundancy,
   *         rtcConfig?, timeoutMs? }
   */
  async connect(cfg) { throw new Error('not implemented'); }

  /** Graceful leave — best-effort BYE, then teardown of the transport. */
  async disconnect() { throw new Error('not implemented'); }

  /** Hard teardown: timers, listeners, everything. Object is dead after. */
  destroy() { throw new Error('not implemented'); }

  /** @returns {ConnState} */
  get state() { return 'idle'; }

  /** cb(state) — returns unsubscribe */
  onState(cb) { throw new Error('not implemented'); }

  /** cb({present, meta}) — returns unsubscribe */
  onPartner(cb) { throw new Error('not implemented'); }

  /** @returns {PeerMeta|null} */
  partner() { return null; }

  /** Fire-and-forget to the partner. @returns {boolean} sent */
  send(type, payload) { return false; }

  /**
   * RPC to the partner: the registered onMessage handler's return value
   * answers it. opts={timeoutMs=8000}. Rejects {code:'timeout'|'absent'|'remote'}.
   */
  request(type, payload, opts) { return Promise.reject({ code: 'absent' }); }

  /** handler(payload, meta:{from:PeerMeta}) — return value answers requests.
   *  One handler per type may answer; returns unsubscribe. */
  onMessage(type, handler) { throw new Error('not implemented'); }

  /** @returns {Promise<number|null>} RTT ms */
  async ping() { return null; }

  /** Adapter-specific debug info for #/debug. */
  diagnostics() { return {}; }
}
