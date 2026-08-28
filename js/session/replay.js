// State is never transmitted — it is always derived by replaying the move
// log through the game's pure reducer. Both clients hold the same log, so
// both derive the same state.
export function replayState(logic, start, moves) {
  let state = logic.setup(start.seed, start.opts ?? {}, { first: start.first, players: start.players });
  for (const rec of moves) {
    const next = logic.reduce(state, rec.move, { by: rec.by });
    if (next === null) {
      throw Object.assign(new Error(`illegal move in log at seq ${rec.seq}`), { code: 'replay', seq: rec.seq });
    }
    state = next;
  }
  return state;
}
