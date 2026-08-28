// Game session lifecycle: commit-reveal handshake → seeded deterministic
// play → replay-based resync. There is no authoritative peer: state is
// always derived from the move log, and only the deterministic turn-owner
// can author seq N, so log union is conflict-free.
import { connection } from '../sync/connection.js';
import { MSG } from '../sync/protocol.js';
import { Emitter } from '../core/events.js';
import { invites, getAccepted, clearAccepted } from './invites.js';
import { whoAmI } from '../core/identity.js';
import { PLAYER_IDS } from '../config.js';
import { fnv1a32, sha256Hex } from '../core/hash.js';
import { store, K } from '../core/storage.js';
import { uuid } from '../core/uuid.js';
import { navigate } from '../router.js';
import { PROTO_VERSION } from '../version.js';
import { gameById } from '../games/registry.js';
import { addRecord } from '../scoreboard/log.js';
import { toast } from '../core/ui/toast.js';

export const sessions = new Emitter();
// 'started' (session) · 'ended' ({sid, record, byRemote}) · 'resynced' (session)

let current = null;
let lastEnded = null; // {sid, record} — answers late SYNC_REQs for a finished game

export function currentSession() { return current; }

const EPHEMERAL_TYPES = [MSG.ARM, MSG.GO, MSG.STROKE, MSG.STROKE_UNDO, MSG.CANVAS_CLEAR, MSG.GUESS];

export class Session {
  constructor(data) {
    Object.assign(this, data); // sid, gameId, opts, seed, first, players, itemIds, startedAt, private?
    this.me = whoAmI();
    this.partner = this.players.find((p) => p !== this.me);
    this.moves = data.moves ?? [];
    this.results = data.results ?? {}; // { [`${channel}:${round}:${by}`]: data }
    this.status = data.status ?? 'active';
    this.events = new Emitter();
    this.awaitingGap = false;
  }

  snapshot() {
    const { sid, gameId, opts, seed, first, players, itemIds, startedAt, moves, results, status } = this;
    return { v: 1, sid, gameId, opts, seed, first, players, itemIds, startedAt, moves, results, status, private: this.private ?? {} };
  }

  // device-local secrets (e.g. battleship fleet placement) — persisted for
  // refresh recovery but NEVER included in sync responses to the partner.
  setPrivate(key, value) {
    this.private = this.private ?? {};
    this.private[key] = value;
    this.persist();
  }

  getPrivate(key) { return (this.private ?? {})[key]; }

  persist() { store.set(K.SESSION, this.snapshot()); }

  get lastSeq() { return this.moves.length ? this.moves[this.moves.length - 1].seq : 0; }

  startInfo() {
    return { seed: this.seed, opts: this.opts, first: this.first, players: this.players, itemIds: this.itemIds };
  }

  // ── moves (turn-based / chain engines) ──────────────────────
  commitLocalMove(move, h) {
    const rec = { seq: this.lastSeq + 1, by: this.me, move, h };
    this.moves.push(rec);
    this.persist();
    connection.send(MSG.MOVE, { sid: this.sid, ...rec });
    return rec;
  }

  acceptRemoteMove(rec) {
    if (rec.seq !== this.lastSeq + 1) return false;
    this.moves.push({ seq: rec.seq, by: rec.by, move: rec.move, h: rec.h });
    this.persist();
    return true;
  }

  onMove(cb) { return this.events.on('move', cb); }

  // ── concurrent results (reveal / timed engines) ─────────────
  putResult(channel, round, data, { send = true } = {}) {
    const key = `${channel}:${round}:${this.me}`;
    if (this.results[key] !== undefined) return; // idempotent
    this.results[key] = data;
    this.persist();
    if (!send) return;
    const msgType = { submit: MSG.ROUND_SUBMIT, reveal: MSG.ROUND_REVEAL, result: MSG.ROUND_RESULT }[channel];
    if (msgType) connection.send(msgType, { sid: this.sid, round, by: this.me, data });
  }

  getResult(channel, round, by) { return this.results[`${channel}:${round}:${by}`]; }

  onResult(cb) { return this.events.on('result', cb); }

  #acceptRemoteResult(channel, round, by, data) {
    if (by !== this.partner) return;
    const key = `${channel}:${round}:${by}`;
    if (this.results[key] !== undefined) return;
    this.results[key] = data;
    this.persist();
    this.events.emit('result', { channel, round, by, data });
  }

  // ── ephemerals (never persisted/replayed) ───────────────────
  sendEphemeral(type, payload) { return connection.send(type, { sid: this.sid, ...payload }); }
  onEphemeral(type, cb) { return this.events.on(`eph:${type}`, cb); }

  // ── resync ──────────────────────────────────────────────────
  async resync() {
    if (this.status !== 'active') return;
    try {
      const res = await connection.request(MSG.SYNC_REQ, { sid: this.sid, haveSeq: this.lastSeq });
      if (this.status !== 'active') return;
      if (res?.gone) {
        if (res.record) this.#endLocal(res.record, true);
        else this.#clear('gone');
        return;
      }
      let changed = false;
      for (const rec of res?.moves ?? []) {
        if (rec.seq === this.lastSeq + 1) { this.moves.push(rec); changed = true; }
      }
      for (const [key, data] of Object.entries(res?.results ?? {})) {
        if (this.results[key] === undefined && !key.endsWith(`:${this.me}`)) { this.results[key] = data; changed = true; }
      }
      if (changed) {
        this.persist();
        this.events.emit('resynced');
        sessions.emit('resynced', this);
      }
      this.awaitingGap = false;
    } catch { /* partner absent — next reconnect retries */ }
  }

  // ── endings ─────────────────────────────────────────────────
  end(record) {
    if (this.status !== 'active') return;
    this.#endLocal(record, false);
    connection.send(MSG.SESS_END, { sid: this.sid, record });
  }

  abandon(reason = 'quit') {
    if (this.status !== 'active') return;
    const record = this.#makeRecord({ winner: null, draw: false, reason: 'abandoned' }, null);
    this.#endLocal(record, false);
    connection.send(MSG.SESS_ABANDON, { sid: this.sid, reason, record });
  }

  voidGame() {
    if (this.status !== 'active') return;
    const record = this.#makeRecord({ winner: null, draw: false, reason: 'void' }, null);
    this.#endLocal(record, false);
    connection.send(MSG.SESS_END, { sid: this.sid, record });
  }

  makeRecord(result, score) { return this.#makeRecord(result, score); }

  #makeRecord(result, score) {
    return {
      id: this.sid, v: 1, gameId: this.gameId,
      startedAt: this.startedAt, endedAt: Date.now(),
      players: this.players, result, score: score ?? null,
      x: { seed: this.seed, moves: this.lastSeq },
    };
  }

  #endLocal(record, byRemote) {
    this.status = 'ended';
    addRecord(record);
    lastEnded = { sid: this.sid, record };
    if (current === this) { current = null; store.del(K.SESSION); }
    this.events.emit('ended', { record, byRemote });
    sessions.emit('ended', { sid: this.sid, record, byRemote });
  }

  #clear(reason) {
    this.status = 'ended';
    if (current === this) { current = null; store.del(K.SESSION); }
    this.events.emit('cleared', { reason });
    sessions.emit('ended', { sid: this.sid, record: null, byRemote: true });
  }

  // internal dispatch from module-level handlers
  _dispatch(type, p) {
    if (type === MSG.MOVE) {
      if (p.seq <= this.lastSeq) return;
      if (p.seq > this.lastSeq + 1) {
        if (!this.awaitingGap) { this.awaitingGap = true; this.resync(); }
        return;
      }
      this.events.emit('move', { seq: p.seq, by: p.by, move: p.move, h: p.h });
    } else if (type === MSG.ROUND_SUBMIT) this.#acceptRemoteResult('submit', p.round, p.by, p.data);
    else if (type === MSG.ROUND_REVEAL) this.#acceptRemoteResult('reveal', p.round, p.by, p.data);
    else if (type === MSG.ROUND_RESULT) this.#acceptRemoteResult('result', p.round, p.by, p.data);
    else if (EPHEMERAL_TYPES.includes(type)) this.events.emit(`eph:${type}`, p);
    else if (type === MSG.DESYNC) this.events.emit('desync-remote', p);
    else if (type === MSG.SESS_END && this.status === 'active') this.#endLocal(p.record, true);
    else if (type === MSG.SESS_ABANDON && this.status === 'active') {
      this.#endLocal(p.record ?? this.#makeRecord({ winner: null, draw: false, reason: 'abandoned' }, null), true);
      toast('game abandoned 🥀', { ms: 2200 });
    }
  }
}

// ── module-level message routing ───────────────────────────────
for (const type of [MSG.MOVE, MSG.ROUND_SUBMIT, MSG.ROUND_REVEAL, MSG.ROUND_RESULT,
  ...EPHEMERAL_TYPES, MSG.DESYNC, MSG.SESS_END, MSG.SESS_ABANDON]) {
  connection.onMessage(type, (p) => {
    if (!p?.sid) return;
    if (current?.sid === p.sid) current._dispatch(type, p);
    else if (type === MSG.MOVE) {
      // partner is playing a session we don't know → tell them it's gone
      connection.send(MSG.SESS_GONE, { sid: p.sid, reason: 'unknown', record: lastEnded?.sid === p.sid ? lastEnded.record : undefined });
    }
  });
}

connection.onMessage(MSG.SYNC_REQ, (p) => {
  if (!p?.sid) return { gone: true };
  if (current?.sid === p.sid && current.status === 'active') {
    return {
      start: current.startInfo(),
      gameId: current.gameId,
      moves: current.moves.filter((m) => m.seq > (p.haveSeq ?? 0)),
      results: current.results,
    };
  }
  if (lastEnded?.sid === p.sid) return { gone: true, record: lastEnded.record };
  return { gone: true };
});

connection.onMessage(MSG.SESS_GONE, (p) => {
  if (current?.sid === p?.sid && p.record && current.status === 'active') {
    current._dispatch(MSG.SESS_END, { record: p.record });
  }
});

// partner reconnected mid-game → heal both directions
connection.onPartner(({ present }) => {
  if (present && current?.status === 'active') setTimeout(() => current?.resync(), 500);
});

// ── session creation ───────────────────────────────────────────
async function buildAndStart(data) {
  const session = new Session(data);
  current = session;
  session.persist();
  sessions.emit('started', session);
  navigate(`game/${session.gameId}`);
  return session;
}

// inviter side: invite got accepted → run the start handshake
invites.on('accepted', async ({ inviteId, gameId, opts, nonceA, nonceB }) => {
  try {
    const sid = uuid();
    const seed = fnv1a32(`${nonceA}|${nonceB}|${sid}`);
    const first = (opts?.first && PLAYER_IDS.includes(opts.first)) ? opts.first : PLAYER_IDS[seed % 2];

    // deck games sample their content ids up front so both sides see identical items
    let itemIds = null;
    const g = gameById(gameId);
    if (g) {
      const mod = (await g.load()).default;
      if (mod.sampleItems) {
        const seen = store.get(K.SEEN)?.[mod.deckId ?? gameId] ?? [];
        itemIds = mod.sampleItems(seed, opts ?? {}, seen);
      }
    }

    const payload = { sid, inviteId, gameId, opts: opts ?? {}, nonceA, nonceB, itemIds, first, protoVersion: PROTO_VERSION };
    const res = await connection.request(MSG.SESS_START, payload, { timeoutMs: 12_000 });
    if (!res?.ok) {
      if (res?.err === 'proto') toast('one of you has an old version — refresh! ✨', { ms: 5000 });
      else toast("couldn't start the game 🫠", { ms: 3000 });
      return;
    }
    await buildAndStart({
      sid, gameId, opts: opts ?? {}, seed, first, itemIds,
      players: [...PLAYER_IDS], startedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[session] start handshake failed', err);
    toast("couldn't reach her to start 🥺 try again?", { ms: 3000 });
  }
});

// invitee side: answer the start handshake
connection.onMessage(MSG.SESS_START, async (p) => {
  const acc = getAccepted(p?.inviteId);
  if (!acc) return { ok: false, err: 'unknown-invite' };
  if (p.protoVersion !== PROTO_VERSION) return { ok: false, err: 'proto' };
  const expect = await sha256Hex(`${p.nonceA}|${p.inviteId}`);
  if (expect !== acc.commit) return { ok: false, err: 'commit-mismatch' };
  if (acc.nonceB !== p.nonceB) return { ok: false, err: 'nonce-mismatch' };
  if (!PLAYER_IDS.includes(p.first)) return { ok: false, err: 'bad-first' };

  clearAccepted(p.inviteId);
  const seed = fnv1a32(`${p.nonceA}|${p.nonceB}|${p.sid}`);
  buildAndStart({
    sid: p.sid, gameId: p.gameId, opts: p.opts ?? {}, seed, first: p.first,
    itemIds: p.itemIds ?? null, players: [...PLAYER_IDS], startedAt: Date.now(),
  });
  return { ok: true };
});

// ── boot: resume a persisted active session ────────────────────
const persisted = store.get(K.SESSION);
if (persisted?.status === 'active') {
  current = new Session(persisted);
  // navigate once the app is mounted; resync happens on partner presence
  setTimeout(() => {
    if (current?.status === 'active') navigate(`game/${current.gameId}`);
  }, 50);
}
