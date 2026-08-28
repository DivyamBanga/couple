// The app-facing sync singleton. Owns whichever adapter is active,
// survives adapter swaps/reconnects, and re-exposes a stable event surface.
// Game code imports THIS, never an adapter.
import { TrysteroAdapter } from './trystero-adapter.js';
import { Emitter } from '../core/events.js';
import { whoAmI, deviceId } from '../core/identity.js';
import { COUPLE_ID, ROOM_ID, ROOM_KEY, RELAYS, RELAY_REDUNDANCY, TURN_CONFIG } from '../config.js';
import { APP_VERSION, PROTO_VERSION } from '../version.js';
import { uuid } from '../core/uuid.js';

const BACKOFF_MS = [1000, 2000, 5000, 10_000];

function tabId() {
  let id = sessionStorage.getItem('cpl.tabId');
  if (!id) { id = uuid(); sessionStorage.setItem('cpl.tabId', id); }
  return id;
}

class Connection {
  #adapter = null;
  #events = new Emitter();
  #handlers = new Map();     // re-registered onto every new adapter
  #unsubs = [];
  #started = false;
  #attempt = 0;
  #reconnectTimer = null;
  #passive = false;          // tab lost the tab-lock → stay offline

  get state() { return this.#adapter?.state ?? 'idle'; }
  partner() { return this.#adapter?.partner() ?? null; }
  partnerPresent() { return this.partner() !== null; }

  onState(cb) { return this.#events.on('state', cb); }
  onPartner(cb) { return this.#events.on('partner', cb); }
  onSameWho(cb) { return this.#events.on('samewho', cb); }

  onMessage(type, handler) {
    this.#handlers.set(type, handler);
    this.#adapter?.onMessage(type, handler);
    return () => {
      if (this.#handlers.get(type) === handler) {
        this.#handlers.delete(type);
        // adapter-side cleanup happens naturally on next rebuild
      }
    };
  }

  send(type, payload) { return this.#adapter?.send(type, payload) ?? false; }
  request(type, payload, opts) {
    if (!this.#adapter) return Promise.reject(Object.assign(new Error('offline'), { code: 'absent' }));
    return this.#adapter.request(type, payload, opts);
  }
  ping() { return this.#adapter?.ping() ?? Promise.resolve(null); }
  diagnostics() { return this.#adapter?.diagnostics() ?? { state: 'idle' }; }

  // ── lifecycle ─────────────────────────────────────────────
  ensureStarted() {
    if (this.#started || this.#passive || !whoAmI()) return;
    this.#started = true;
    this.#spinUp();
    this.#startWatchdog();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || this.#passive) return;
      // iOS/Android may have killed sockets while backgrounded
      if (this.state !== 'online' || !this.partnerPresent()) this.forceReconnect('visibility');
    });
    window.addEventListener('online', () => { if (!this.#passive) this.forceReconnect('net-online'); });
    // best-effort goodbye so the partner sees absence fast instead of
    // waiting out the heartbeat window
    window.addEventListener('pagehide', () => { this.send('bye', {}); });
  }

  goPassive() {
    this.#passive = true;
    clearTimeout(this.#reconnectTimer);
    this.#teardownAdapter(true);
    this.#events.emit('state', 'offline');
  }

  async #spinUp() {
    this.#teardownAdapter(false);
    const adapter = new TrysteroAdapter();
    this.#adapter = adapter;

    this.#unsubs.push(adapter.onState((s) => this.#events.emit('state', s)));
    this.#unsubs.push(adapter.onPartner((p) => this.#events.emit('partner', p)));
    this.#unsubs.push(adapter.onSameWho((m) => this.#events.emit('samewho', m)));
    for (const [type, handler] of this.#handlers) adapter.onMessage(type, handler);

    try {
      // test tabs can isolate into their own room so parallel E2E runs
      // (and stray real devices) never cross-talk
      const roomOverride = sessionStorage.getItem('cpl.testRoom');
      await adapter.connect({
        coupleId: COUPLE_ID,
        roomId: roomOverride ? `test-${roomOverride}` : ROOM_ID,
        roomKey: ROOM_KEY,
        relays: RELAYS,
        relayRedundancy: RELAY_REDUNDANCY,
        turnConfig: TURN_CONFIG ?? undefined,
        me: { who: whoAmI(), deviceId: deviceId(), tabId: tabId(), appVersion: APP_VERSION, protoVersion: PROTO_VERSION },
      });
      this.#attempt = 0;
    } catch (err) {
      if (this.#adapter !== adapter) return; // superseded
      console.warn('[sync] connect failed', err);
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect() {
    if (this.#passive) return;
    const delay = BACKOFF_MS[Math.min(this.#attempt, BACKOFF_MS.length - 1)];
    this.#attempt++;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = setTimeout(() => this.#spinUp(), delay);
  }

  // Public-relay subscriptions can silently decay after long idle, leaving
  // us "online" but undiscoverable. While the partner is absent, periodically
  // rejoin (with growing spacing) so both sides stay findable.
  #watchdogTimer = null;
  #absentSince = null;
  #nextRejoinGap = 45_000;

  #startWatchdog() {
    this.#watchdogTimer = setInterval(() => {
      if (this.#passive || !this.#started) return;
      if (this.partnerPresent()) {
        this.#absentSince = null;
        this.#nextRejoinGap = 45_000;
        return;
      }
      this.#absentSince ??= Date.now();
      if (Date.now() - this.#absentSince >= this.#nextRejoinGap) {
        this.#absentSince = Date.now();
        this.#nextRejoinGap = Math.min(this.#nextRejoinGap * 2, 180_000);
        this.forceReconnect('watchdog');
      }
    }, 15_000);
  }

  forceReconnect(reason = 'manual') {
    if (this.#passive || !this.#started) return;
    console.info('[sync] force reconnect:', reason);
    clearTimeout(this.#reconnectTimer);
    this.#attempt = 0;
    this.#spinUp();
  }

  #teardownAdapter(graceful) {
    this.#unsubs.forEach((u) => u());
    this.#unsubs = [];
    const old = this.#adapter;
    this.#adapter = null;
    if (!old) return;
    if (graceful) old.disconnect().catch(() => {});
    else old.destroy();
  }
}

export const connection = new Connection();
