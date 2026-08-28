// Every P2P message type in the app. Payloads are documented where they're
// produced; all handlers must be idempotent (duplicate delivery is possible
// after reconnects even though the transport itself doesn't duplicate).
export const MSG = {
  // lobby
  HELLO: 'hello',            // PeerMeta {who, deviceId, tabId, appVersion, protoVersion, ts}
  BYE: 'bye',                // {}
  NUDGE: 'nudge',            // {kind:'heart'|'buzz'|'kiss'|'miss-you'}
  IDENT_YIELD: 'ident-yield',// {} — you connected as me somewhere newer; this device goes passive

  // invites
  INVITE: 'invite',          // {inviteId, gameId, opts, commit, ts}
  INV_ACCEPT: 'inv-accept',  // {inviteId, nonceB}
  INV_DECLINE: 'inv-decline',// {inviteId, note?}
  INV_CANCEL: 'inv-cancel',  // {inviteId}

  // session control
  SESS_START: 'sess-start',  // request: {sid, inviteId, gameId, opts, nonceA, nonceB, itemIds?, protoVersion}
  SESS_END: 'sess-end',      // {sid, record}
  SESS_ABANDON: 'sess-abandon', // {sid, reason}
  SESS_GONE: 'sess-gone',    // {sid, reason, record?}

  // in-game
  MOVE: 'move',              // {sid, seq, by, move, h}
  SYNC_REQ: 'sync-req',      // request: {sid, haveSeq} → SYNC_RES shape as response
  ROUND_SUBMIT: 'round-submit', // {sid, round, by, answer?|sealed?, elapsedMs?}
  ROUND_REVEAL: 'round-reveal', // {sid, round, by, answer, salt?}
  ROUND_RESULT: 'round-result', // {sid, round, by, result}
  ARM: 'arm',                // {sid, round}
  GO: 'go',                  // {sid, round, inMs, durMs}
  STROKE: 'stroke',          // {sid, round, id, color, w, pts, done}
  STROKE_UNDO: 'stroke-undo',// {sid, round, id}
  CANVAS_CLEAR: 'canvas-clear', // {sid, round}
  GUESS: 'guess',            // {sid, round, by, text}
  DESYNC: 'desync',          // {sid, atSeq, myH}

  // shared-data merges
  LOG_OFFER: 'log-offer',    // {count, digest}
  LOG_FULL: 'log-full',      // request {} → {records}; or push {records}
  DAILY_OFFER: 'daily-offer',// {digest}
  DAILY_FULL: 'daily-full',  // request {} → {answers, q36}; or push {answers, q36}
};
