// ── the two of you ─────────────────────────────────────────────
export const PLAYERS = {
  divyam: { name: 'divyam', emoji: '🐻' },
  diya:   { name: 'diya',   emoji: '🐰' },
};
// Canonical order — used for deterministic tie-breaks (simultaneous invites, first-player derivation).
export const PLAYER_IDS = ['diya', 'divyam'];

// ── p2p space ──────────────────────────────────────────────────
// COUPLE_ID namespaces the trystero appId; ROOM_KEY is the room password
// (encrypts signaling/payloads against relay observers — it lives in a public
// repo, which was an accepted tradeoff when the privacy lock was declined).
export const COUPLE_ID = 'div-diya-dungeon-v1';
export const ROOM_ID = 'lobby';
export const ROOM_KEY = 'ddd-k7mvq2xw94ptzh3e';

// Public nostr relays used only for matchmaking/signaling (game data flows P2P).
export const RELAYS = [
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr.oxtr.dev',
  'wss://relay.damus.io',
  'wss://relay.nostr.net',
  'wss://nostr.bitcoiner.social',
  'wss://relay.mostr.pub',
];
export const RELAY_REDUNDANCY = 5;

// Optional future knob: paste TURN credentials here if cellular↔cellular
// connections keep failing (see plan — Open Relay et al).
export const TURN_CONFIG = null;
