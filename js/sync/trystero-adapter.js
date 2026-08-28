// Trystero (nostr strategy) implementation of the SyncAdapter contract.
// The ONLY file in the app allowed to import from vendor/.
// Vendored: trystero@0.25.3, bundled self-contained via esbuild.
import { joinRoom, getRelaySockets, selfId } from '../../vendor/trystero-nostr.min.js';
import { SyncAdapter } from './adapter.js';
import { Emitter } from '../core/events.js';
import { MSG } from './protocol.js';

const HEARTBEAT_MS = 10_000;
const ABSENT_AFTER_MS = 25_000;
const SWEEP_MS = 5_000;

export class TrysteroAdapter extends SyncAdapter {
  #room = null;
  #cfg = null;
  #state = 'idle';
  #events = new Emitter();
  #handlers = new Map();     // type -> handler (one answering handler per type)
  #partner = null;           // { peerId, meta, lastSeen }
  #timers = [];
  #acts = null;              // { msg, rpc, hb }
  #msgLog = [];              // ring buffer for #/debug
  #destroyed = false;

  get state() { return this.#state; }
  get selfPeerId() { return selfId; }

  #setState(s) {
    if (this.#state === s || this.#destroyed) return;
    this.#state = s;
    this.#events.emit('state', s);
  }

  #log(dir, type, payload) {
    this.#msgLog.push({ dir, type, at: Date.now(), size: JSON.stringify(payload ?? null).length });
    if (this.#msgLog.length > 60) this.#msgLog.shift();
  }

  async connect(cfg) {
    if (this.#destroyed) throw Object.assign(new Error('adapter destroyed'), { code: 'transport' });
    this.#cfg = cfg;
    this.#setState('connecting');

    const roomCfg = {
      appId: cfg.coupleId,
      password: cfg.roomKey,
      relayConfig: { urls: cfg.relays, redundancy: cfg.relayRedundancy },
    };
    if (cfg.rtcConfig) roomCfg.rtcConfig = cfg.rtcConfig;
    if (cfg.turnConfig) roomCfg.turnConfig = cfg.turnConfig;

    this.#room = joinRoom(roomCfg, cfg.roomId, {
      onJoinError: (details) => console.warn('[sync] join error', details),
    });

    // three fixed wire actions; app-level types are multiplexed inside 'msg'/'rpc'
    this.#acts = {
      msg: this.#room.makeAction('msg'),
      rpc: this.#room.makeAction('rpc', { kind: 'request' }),
      hb: this.#room.makeAction('hb'),
    };

    this.#acts.msg.onMessage = (data, { peerId }) => this.#onEnvelope(data, peerId, false);
    this.#acts.rpc.onRequest = (data, { peerId }) => this.#onEnvelope(data, peerId, true);
    this.#acts.hb.onMessage = (_data, { peerId }) => this.#touch(peerId);

    this.#room.onPeerJoin = (peerId) => {
      // introduce ourselves to whoever appeared; identity resolves via hello
      this.#sendTo(peerId, MSG.HELLO, this.#helloMeta());
    };
    this.#room.onPeerLeave = (peerId) => {
      if (this.#partner?.peerId === peerId) this.#dropPartner();
    };

    // heartbeat + absence sweep
    this.#timers.push(setInterval(() => {
      if (this.#partner) this.#acts.hb.send(1, { target: this.#partner.peerId }).catch(() => {});
    }, HEARTBEAT_MS));
    this.#timers.push(setInterval(() => this.#sweep(), SWEEP_MS));

    // resolve when at least one relay socket is open (signaling reachable)
    const timeoutMs = cfg.timeoutMs ?? 15_000;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (this.#destroyed) throw Object.assign(new Error('destroyed'), { code: 'transport' });
      if (this.#anyRelayOpen()) {
        this.#setState('online');
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw Object.assign(new Error('no relay reachable'), { code: 'timeout' });
  }

  #helloMeta() {
    return { ...this.#cfg.me, ts: Date.now() };
  }

  #anyRelayOpen() {
    try {
      const socks = getRelaySockets() ?? {};
      return Object.values(socks).some((s) => (s?.readyState ?? s?.socket?.readyState) === 1);
    } catch {
      return false;
    }
  }

  #sweep() {
    if (this.#destroyed) return;
    if (this.#partner && Date.now() - this.#partner.lastSeen > ABSENT_AFTER_MS) this.#dropPartner();
    if (this.#state === 'online' && !this.#anyRelayOpen() && !this.#partner) this.#setState('reconnecting');
    else if (this.#state === 'reconnecting' && this.#anyRelayOpen()) this.#setState('online');
  }

  #touch(peerId) {
    if (this.#partner?.peerId === peerId) this.#partner.lastSeen = Date.now();
  }

  #dropPartner() {
    if (!this.#partner) return;
    this.#partner = null;
    this.#events.emit('partner', { present: false, meta: null });
  }

  // Unified inbound: hello handling is adapter-internal; everything else
  // dispatches to registered handlers. For rpc, the handler's return value
  // is the response.
  #onEnvelope(data, peerId, isRequest) {
    const { t, p } = data ?? {};
    if (!t) return isRequest ? null : undefined;
    this.#touch(peerId);
    this.#log('in', t, p);

    if (t === MSG.HELLO) { this.#onHello(p, peerId); return isRequest ? null : undefined; }
    if (t === MSG.BYE) {
      if (this.#partner?.peerId === peerId) this.#dropPartner();
      return isRequest ? null : undefined;
    }

    // ignore messages from unverified peers (never surfaced to the app)
    if (this.#partner?.peerId !== peerId) return isRequest ? null : undefined;

    const handler = this.#handlers.get(t);
    if (!handler) return isRequest ? null : undefined;
    const meta = { from: this.#partner.meta };
    if (isRequest) return Promise.resolve(handler(p, meta)).then((r) => r ?? null);
    handler(p, meta);
    return undefined;
  }

  #onHello(meta, peerId) {
    if (!meta?.who || !this.#cfg) return;
    const myWho = this.#cfg.me.who;

    if (meta.who === myWho) {
      // my identity from another device/tab — not a partner
      if (meta.deviceId !== this.#cfg.me.deviceId || meta.tabId !== this.#cfg.me.tabId) {
        this.#events.emit('samewho', meta);
      }
      return;
    }

    const partnerWho = myWho === 'divyam' ? 'diya' : 'divyam';
    if (meta.who !== partnerWho) return; // stranger — ignore entirely

    const isNew = this.#partner?.peerId !== peerId;
    // newest hello wins if partner shows up from a second device
    if (this.#partner && !isNew) { this.#partner.meta = meta; this.#partner.lastSeen = Date.now(); return; }
    if (this.#partner && isNew && (meta.ts ?? 0) < (this.#partner.meta.ts ?? 0)) return;

    this.#partner = { peerId, meta, lastSeen: Date.now() };
    // answer with our own hello so both sides verify (idempotent)
    this.#sendTo(peerId, MSG.HELLO, this.#helloMeta());
    this.#events.emit('partner', { present: true, meta });
  }

  #sendTo(peerId, type, payload) {
    this.#log('out', type, payload);
    this.#acts.msg.send({ t: type, p: payload }, { target: peerId }).catch(() => {});
  }

  onState(cb) { return this.#events.on('state', cb); }
  onPartner(cb) { return this.#events.on('partner', cb); }
  onSameWho(cb) { return this.#events.on('samewho', cb); }
  partner() { return this.#partner?.meta ?? null; }

  send(type, payload) {
    if (!this.#partner || !this.#acts) return false;
    this.#sendTo(this.#partner.peerId, type, payload);
    return true;
  }

  async request(type, payload, { timeoutMs = 8000 } = {}) {
    if (!this.#partner || !this.#acts) throw Object.assign(new Error('partner absent'), { code: 'absent' });
    this.#log('out', `${type}?`, payload);
    try {
      return await this.#acts.rpc.request({ t: type, p: payload }, { target: this.#partner.peerId, timeoutMs });
    } catch (err) {
      const code = /timeout/i.test(String(err?.message ?? err)) ? 'timeout' : 'remote';
      throw Object.assign(new Error(String(err?.message ?? err)), { code });
    }
  }

  onMessage(type, handler) {
    this.#handlers.set(type, handler);
    return () => { if (this.#handlers.get(type) === handler) this.#handlers.delete(type); };
  }

  async ping() {
    if (!this.#partner || !this.#room) return null;
    try { return await this.#room.ping(this.#partner.peerId); } catch { return null; }
  }

  diagnostics() {
    let relays = {};
    try {
      const socks = getRelaySockets() ?? {};
      relays = Object.fromEntries(Object.entries(socks).map(([url, s]) => {
        const rs = s?.readyState ?? s?.socket?.readyState;
        return [url, ({ 0: 'connecting', 1: 'open', 2: 'closing', 3: 'closed' })[rs] ?? String(rs)];
      }));
    } catch (err) { relays = { error: String(err) }; }
    return {
      selfId,
      state: this.#state,
      partner: this.#partner ? { who: this.#partner.meta.who, peerId: this.#partner.peerId, lastSeenMsAgo: Date.now() - this.#partner.lastSeen } : null,
      peers: this.#room ? Object.keys(this.#room.getPeers()) : [],
      relays,
      recentMessages: [...this.#msgLog].reverse(),
    };
  }

  async disconnect() {
    if (this.#partner) this.send(MSG.BYE, {});
    await new Promise((r) => setTimeout(r, 120)); // let BYE flush
    this.destroy();
  }

  destroy() {
    this.#destroyed = true;
    this.#timers.forEach(clearInterval);
    this.#timers = [];
    this.#dropPartner();
    try { this.#room?.leave(); } catch { /* ignore */ }
    this.#room = null;
    this.#acts = null;
    this.#setState('offline');
    this.#events.clear();
  }
}
