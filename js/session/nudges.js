import { connection } from '../sync/connection.js';
import { MSG } from '../sync/protocol.js';
import { Emitter } from '../core/events.js';

export const NUDGE_KINDS = {
  heart:     { emoji: '💗', text: 'sent you a heart' },
  buzz:      { emoji: '📳', text: 'is buzzing you' },
  kiss:      { emoji: '💋', text: 'blew you a kiss' },
  'miss-you': { emoji: '🥺', text: 'misses you' },
};

export const nudges = new Emitter(); // 'nudge' {kind, emoji, text}

let lastSent = 0;

export function sendNudge(kind = 'heart') {
  const now = Date.now();
  if (now - lastSent < 1500) return false; // gentle throttle
  if (!connection.send(MSG.NUDGE, { kind })) return false;
  lastSent = now;
  return true;
}

connection.onMessage(MSG.NUDGE, (p) => {
  const kind = NUDGE_KINDS[p?.kind] ? p.kind : 'heart';
  nudges.emit('nudge', { kind, ...NUDGE_KINDS[kind] });
});
