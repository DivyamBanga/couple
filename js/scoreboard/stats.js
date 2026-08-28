// Pure derivations over the record log. Void/abandoned games never count.
export function validRecords(records) {
  return records.filter((r) => r?.result && (r.result.reason === 'win' || r.result.reason === 'draw'));
}

export function tally(records) {
  const t = { diya: 0, divyam: 0, draws: 0, total: 0 };
  for (const r of validRecords(records)) {
    t.total++;
    if (r.result.draw || !r.result.winner) t.draws++;
    else t[r.result.winner]++;
  }
  return t;
}

export function perGame(records) {
  const map = {};
  for (const r of validRecords(records)) {
    const g = (map[r.gameId] ??= { diya: 0, divyam: 0, draws: 0, total: 0, lastPlayedAt: 0 });
    g.total++;
    if (r.result.draw || !r.result.winner) g.draws++;
    else g[r.result.winner]++;
    g.lastPlayedAt = Math.max(g.lastPlayedAt, r.endedAt ?? 0);
  }
  return map;
}

// consecutive wins by the same player, counting back from the latest
// decided game; a draw breaks the streak.
export function currentStreak(records) {
  const sorted = validRecords(records).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  let holder = null;
  let len = 0;
  for (const r of sorted) {
    if (r.result.draw || !r.result.winner) break;
    if (holder === null) { holder = r.result.winner; len = 1; }
    else if (r.result.winner === holder) len++;
    else break;
  }
  return holder ? { holder, len } : null;
}

export function bestStreaks(records) {
  const sorted = validRecords(records).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  const best = { diya: 0, divyam: 0 };
  let holder = null;
  let len = 0;
  for (const r of sorted) {
    if (r.result.draw || !r.result.winner) { holder = null; len = 0; continue; }
    if (r.result.winner === holder) len++;
    else { holder = r.result.winner; len = 1; }
    best[holder] = Math.max(best[holder], len);
  }
  return best;
}

export function mostPlayed(records) {
  const pg = perGame(records);
  let top = null;
  for (const [gameId, g] of Object.entries(pg)) {
    if (!top || g.total > top.total) top = { gameId, total: g.total };
  }
  return top;
}
