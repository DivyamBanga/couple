// Invite flow with commit-reveal fairness (inviter commits a nonce before
// seeing the invitee's) and deterministic simultaneous-invite resolution.
// Emits:
//   'incoming'  {inviteId, gameId, opts}          — show accept/decline UI
//   'cancelled' {inviteId, reason}                — remove that UI
//   'declined'  {inviteId, note}                  — my outgoing was declined
//   'expired'   {inviteId}                        — my outgoing timed out / partner left
//   'outgoing'  {inviteId, gameId}                — my outgoing was sent
//   'accepted'  {inviteId, gameId, opts, nonceA, nonceB} — inviter side; session layer consumes
import { connection } from '../sync/connection.js';
import { MSG } from '../sync/protocol.js';
import { Emitter } from '../core/events.js';
import { uuid, randomUint32 } from '../core/uuid.js';
import { sha256Hex } from '../core/hash.js';
import { whoAmI } from '../core/identity.js';
import { PLAYER_IDS } from '../config.js';

export const invites = new Emitter();

const EXPIRY_MS = 90_000;
let outgoing = null;                 // {inviteId, gameId, opts, nonceA, commit, timer}
const incoming = new Map();          // inviteId -> {gameId, opts, commit}
const accepted = new Map();          // inviteId -> {gameId, opts, commit, nonceB} — awaiting sess-start

export function getOutgoing() { return outgoing ? { inviteId: outgoing.inviteId, gameId: outgoing.gameId } : null; }
export function getAccepted(inviteId) { return accepted.get(inviteId) ?? null; }
export function clearAccepted(inviteId) { accepted.delete(inviteId); }

export async function sendInvite(gameId, opts = {}) {
  if (!connection.partnerPresent()) return null;
  if (outgoing) cancelInvite('replaced');

  const inviteId = uuid();
  const nonceA = randomUint32();
  const commit = await sha256Hex(`${nonceA}|${inviteId}`);
  outgoing = {
    inviteId, gameId, opts, nonceA, commit,
    timer: setTimeout(() => {
      if (outgoing?.inviteId !== inviteId) return;
      connection.send(MSG.INV_CANCEL, { inviteId });
      outgoing = null;
      invites.emit('expired', { inviteId });
    }, EXPIRY_MS),
  };
  connection.send(MSG.INVITE, { inviteId, gameId, opts, commit, ts: Date.now() });
  invites.emit('outgoing', { inviteId, gameId });
  return inviteId;
}

export function cancelInvite(reason = 'cancelled') {
  if (!outgoing) return;
  clearTimeout(outgoing.timer);
  connection.send(MSG.INV_CANCEL, { inviteId: outgoing.inviteId });
  const { inviteId } = outgoing;
  outgoing = null;
  invites.emit('expired', { inviteId, reason });
}

export function acceptInvite(inviteId) {
  const inv = incoming.get(inviteId);
  if (!inv) return false;
  incoming.delete(inviteId);
  const nonceB = randomUint32();
  accepted.set(inviteId, { ...inv, nonceB });
  // if I had my own outgoing pending, it's moot now
  if (outgoing) cancelInvite('superseded');
  connection.send(MSG.INV_ACCEPT, { inviteId, nonceB });
  return true;
}

export function declineInvite(inviteId, note) {
  if (!incoming.delete(inviteId)) return;
  connection.send(MSG.INV_DECLINE, { inviteId, note });
}

// ── wire protocol ──────────────────────────────────────────────
connection.onMessage(MSG.INVITE, (p) => {
  if (!p?.inviteId || incoming.has(p.inviteId) || accepted.has(p.inviteId)) return;

  // simultaneous invites for the SAME game → auto-merge with no extra round trip:
  // the player first in PLAYER_IDS keeps their invite; the other auto-accepts it.
  if (outgoing && outgoing.gameId === p.gameId) {
    const iWin = whoAmI() === PLAYER_IDS[0];
    if (iWin) return; // ignore theirs; they will auto-accept mine and cancel theirs
    clearTimeout(outgoing.timer);
    connection.send(MSG.INV_CANCEL, { inviteId: outgoing.inviteId });
    const mine = outgoing.inviteId;
    outgoing = null;
    invites.emit('expired', { inviteId: mine, reason: 'merged' });
    const nonceB = randomUint32();
    accepted.set(p.inviteId, { gameId: p.gameId, opts: p.opts ?? {}, commit: p.commit, nonceB });
    connection.send(MSG.INV_ACCEPT, { inviteId: p.inviteId, nonceB });
    return;
  }

  incoming.set(p.inviteId, { gameId: p.gameId, opts: p.opts ?? {}, commit: p.commit });
  invites.emit('incoming', { inviteId: p.inviteId, gameId: p.gameId, opts: p.opts ?? {} });
});

connection.onMessage(MSG.INV_ACCEPT, (p) => {
  if (!outgoing || outgoing.inviteId !== p?.inviteId) return;
  clearTimeout(outgoing.timer);
  const { inviteId, gameId, opts, nonceA } = outgoing;
  outgoing = null;
  invites.emit('accepted', { inviteId, gameId, opts, nonceA, nonceB: p.nonceB });
});

connection.onMessage(MSG.INV_DECLINE, (p) => {
  if (!outgoing || outgoing.inviteId !== p?.inviteId) return;
  clearTimeout(outgoing.timer);
  const { inviteId } = outgoing;
  outgoing = null;
  invites.emit('declined', { inviteId, note: p.note });
});

connection.onMessage(MSG.INV_CANCEL, (p) => {
  if (incoming.delete(p?.inviteId)) invites.emit('cancelled', { inviteId: p.inviteId, reason: 'cancelled' });
});

// partner gone → all pending invites are dead
connection.onPartner(({ present }) => {
  if (present) return;
  if (outgoing) {
    clearTimeout(outgoing.timer);
    const { inviteId } = outgoing;
    outgoing = null;
    invites.emit('expired', { inviteId, reason: 'partner-left' });
  }
  for (const inviteId of incoming.keys()) invites.emit('cancelled', { inviteId, reason: 'partner-left' });
  incoming.clear();
});
