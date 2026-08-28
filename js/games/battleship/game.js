// battleships — hidden-fleet classic with commit/report/reveal anti-cheat.
// Fleets live ONLY in device-local private storage; the shared state is
// commits + shots + reports. Reveals at game end are verified by the
// reducer (fnv1a32 commits — playful anti-cheat between a couple, not
// cryptography).
import { h, clear } from '../../core/ui/dom.js';
import { fnv1a32, stableStringify } from '../../core/hash.js';
import { randomUint32 } from '../../core/uuid.js';
import { nameOf } from '../../core/identity.js';

const SIZE = 10;
const FLEET = [5, 4, 3, 3, 2];
const FLEET_CELLS = 17;
const SHIP_NAMES = { 5: 'carrier', 4: 'battleship', 3: 'cruiser', 2: 'lil boat' };

const other = (who) => (who === 'diya' ? 'divyam' : 'diya');
const key = (x, y) => `${x},${y}`;

// ── placement helpers (shared by logic + ui) ──────────────────
function normShip(s) {
  return { len: s.len, cells: [...s.cells].map((c) => [c[0], c[1]]).sort((a, b) => a[1] - b[1] || a[0] - b[0]) };
}

function normalizePlacement(ships) {
  return ships.map(normShip).sort((a, b) =>
    b.len - a.len || a.cells[0][1] - b.cells[0][1] || a.cells[0][0] - b.cells[0][0]);
}

function commitOf(placement, salt) {
  return fnv1a32(`${stableStringify(normalizePlacement(placement))}|${salt}`);
}

function validPlacement(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const lens = ships.map((s) => s?.len).sort((a, b) => a - b).join(',');
  if (lens !== [...FLEET].sort((a, b) => a - b).join(',')) return false;
  const seen = new Set();
  for (const s of ships) {
    if (!Array.isArray(s.cells) || s.cells.length !== s.len) return false;
    for (const c of s.cells) {
      if (!Array.isArray(c) || !Number.isInteger(c[0]) || !Number.isInteger(c[1])) return false;
      if (c[0] < 0 || c[0] >= SIZE || c[1] < 0 || c[1] >= SIZE) return false;
      const k = key(c[0], c[1]);
      if (seen.has(k)) return false;
      seen.add(k);
    }
    const xs = s.cells.map((c) => c[0]);
    const ys = s.cells.map((c) => c[1]);
    const sameX = xs.every((x) => x === xs[0]);
    const sameY = ys.every((y) => y === ys[0]);
    if (!sameX && !sameY) return false;
    const line = (sameX ? ys : xs).slice().sort((a, b) => a - b);
    for (let i = 1; i < line.length; i++) if (line[i] !== line[i - 1] + 1) return false;
  }
  return true;
}

function reportsConsistent(state, by, placement) {
  const opp = other(by);
  const occ = new Set();
  for (const s of placement) for (const c of s.cells) occ.add(key(c[0], c[1]));
  for (const [k, r] of Object.entries(state.shots[opp])) {
    if ((r === 'miss') === occ.has(k)) return false; // hit reported on water / miss on a ship
  }
  const sunkSet = new Set(state.sunk[by].map((s) => stableStringify(normShip(s))));
  for (const s of placement) {
    const fully = s.cells.every((c) => {
      const r = state.shots[opp][key(c[0], c[1])];
      return r === 'hit' || r === 'sunk';
    });
    const reported = sunkSet.has(stableStringify(normShip(s)));
    if (fully !== reported) return false; // hid a sunk ship or invented one
  }
  return true;
}

// ── pure rules ─────────────────────────────────────────────────
export const logic = {
  setup(seed, opts, { first }) {
    return {
      phase: 'placing',
      turn: first,
      first,
      moveN: 0,
      commits: { diya: null, divyam: null },
      shots: { diya: {}, divyam: {} },      // shots[shooter][x,y] = 'hit'|'miss'|'sunk'
      pending: null,                          // {x, y, shooter} awaiting defender report
      sunk: { diya: [], divyam: [] },        // sunk[owner] = owner's ships confirmed sunk
      sunkCells: { diya: 0, divyam: 0 },
      reveals: { diya: null, divyam: null },
      sankAll: null,
      cheater: null,
      winner: null,
    };
  },

  reduce(state, move, { by }) {
    if (by !== state.turn || !move?.k) return null;
    const s = structuredClone(state);
    s.moveN++;

    if (state.phase === 'placing') {
      if (move.k !== 'commit' || !Number.isInteger(move.c) || s.commits[by] !== null) return null;
      s.commits[by] = move.c >>> 0;
      if (s.commits.diya !== null && s.commits.divyam !== null) {
        s.phase = 'firing';
        s.turn = s.first;
      } else {
        s.turn = other(by);
      }
      return s;
    }

    if (state.phase === 'firing' && !state.pending) {
      if (move.k !== 'fire') return null;
      const { x, y } = move;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
      if (s.shots[by][key(x, y)]) return null; // already fired there
      s.pending = { x, y, shooter: by };
      s.turn = other(by); // defender must report
      return s;
    }

    if (state.phase === 'firing' && state.pending) {
      if (move.k !== 'report') return null;
      const { x, y, r } = move;
      if (x !== state.pending.x || y !== state.pending.y) return null;
      if (!['hit', 'miss', 'sunk'].includes(r)) return null;
      const shooter = state.pending.shooter;
      if (by !== other(shooter)) return null;

      if (r === 'sunk') {
        const ship = move.ship;
        if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== ship.len) return null;
        if (ship.len < 2 || ship.len > 5) return null;
        if (!ship.cells.some((c) => c[0] === x && c[1] === y)) return null;
        // every cell of the claimed ship must actually have been fired at
        for (const c of ship.cells) {
          const k = key(c[0], c[1]);
          if (k !== key(x, y) && !s.shots[shooter][k]) return null;
        }
        const normed = stableStringify(normShip(ship));
        if (s.sunk[by].some((sh) => stableStringify(normShip(sh)) === normed)) return null; // double-sunk
        s.sunk[by].push(normShip(ship));
        s.sunkCells[by] += ship.len;
        for (const c of ship.cells) s.shots[shooter][key(c[0], c[1])] = 'sunk';
      } else {
        s.shots[shooter][key(x, y)] = r;
      }
      s.pending = null;

      if (s.sunkCells[by] >= FLEET_CELLS) {
        s.phase = 'reveal';
        s.sankAll = shooter;
        s.turn = s.first;
      } else {
        s.turn = r === 'miss' ? by : shooter; // miss passes the gun, hit keeps it
      }
      return s;
    }

    if (state.phase === 'reveal') {
      if (move.k !== 'reveal' || s.reveals[by]) return null;
      const placement = Array.isArray(move.placement) ? normalizePlacement(move.placement) : null;
      let honest = placement !== null
        && validPlacement(placement)
        && commitOf(placement, move.salt) === state.commits[by]
        && reportsConsistent(state, by, placement);
      if (!honest && s.cheater === null) s.cheater = by;
      s.reveals[by] = { placement: placement ?? [], salt: move.salt ?? 0 };
      s.turn = other(by);
      if (s.reveals.diya && s.reveals.divyam) {
        s.phase = 'done';
        s.winner = s.cheater ? other(s.cheater) : s.sankAll;
      }
      return s;
    }

    return null;
  },

  isOver(state) {
    if (state.phase !== 'done') return null;
    return { winner: state.winner, draw: false };
  },

  view(state) { return state; },
};

// ── ui ─────────────────────────────────────────────────────────
let els = null;        // { wrap, banner }
let sel = null;        // selected tray ship {len, tag} while placing
let armed = null;      // {x,y} crosshair on tracking grid
let draft = [];        // in-progress placement [{len, cells}]
let lastAutoN = -1;
let lastBannerN = -1;
let builtFor = '';     // phase rebuild marker

function myPlacement(ctx) { return ctx.session.getPrivate('placement'); }

function autoMoves(view, ctx) {
  if (view.moveN === lastAutoN) return;
  const me = ctx.me;

  if (view.phase === 'firing' && view.pending && ctx.myTurn()) {
    const placement = myPlacement(ctx);
    if (!placement) return;
    lastAutoN = view.moveN;
    const { x, y } = view.pending;
    const ship = placement.find((sh) => sh.cells.some((c) => c[0] === x && c[1] === y));
    let move;
    if (!ship) move = { k: 'report', x, y, r: 'miss' };
    else {
      const oppShots = view.shots[other(me)];
      const rest = ship.cells.filter((c) => !(c[0] === x && c[1] === y));
      const allHit = rest.every((c) => {
        const r = oppShots[key(c[0], c[1])];
        return r === 'hit' || r === 'sunk';
      });
      move = allHit ? { k: 'report', x, y, r: 'sunk', ship: normShip(ship) } : { k: 'report', x, y, r: 'hit' };
    }
    setTimeout(() => ctx.submitMove(move), 60);
    return;
  }

  if (view.phase === 'reveal' && ctx.myTurn() && !view.reveals[me]) {
    const placement = myPlacement(ctx);
    const salt = ctx.session.getPrivate('salt');
    if (!placement) return;
    lastAutoN = view.moveN;
    setTimeout(() => ctx.submitMove({ k: 'reveal', placement, salt }), 60);
  }
}

function randomFleet() {
  // UI-level randomness is fine — placement is a private local choice
  for (let attempt = 0; attempt < 200; attempt++) {
    const ships = [];
    const occ = new Set();
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let t = 0; t < 80 && !placed; t++) {
        const horiz = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (horiz ? SIZE - len + 1 : SIZE));
        const y = Math.floor(Math.random() * (horiz ? SIZE : SIZE - len + 1));
        const cells = Array.from({ length: len }, (_, i) => (horiz ? [x + i, y] : [x, y + i]));
        if (cells.every((c) => !occ.has(key(c[0], c[1])))) {
          cells.forEach((c) => occ.add(key(c[0], c[1])));
          ships.push({ len, cells });
          placed = true;
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
  return [];
}

function tryPlace(ships, len, x, y) {
  const occ = new Set(ships.flatMap((s) => s.cells.map((c) => key(c[0], c[1]))));
  for (const horiz of [true, false]) {
    if (horiz && x + len > SIZE) continue;
    if (!horiz && y + len > SIZE) continue;
    const cells = Array.from({ length: len }, (_, i) => (horiz ? [x + i, y] : [x, y + i]));
    if (cells.every((c) => !occ.has(key(c[0], c[1])))) return cells;
  }
  return null;
}

function rotated(ships, idx) {
  const s = ships[idx];
  const [ox, oy] = normShip(s).cells[0];
  const horiz = s.cells.length < 2 || s.cells[0][1] === s.cells[1][1];
  const occ = new Set(ships.filter((_, i) => i !== idx).flatMap((sh) => sh.cells.map((c) => key(c[0], c[1]))));
  const cells = Array.from({ length: s.len }, (_, i) => (horiz ? [ox, oy + i] : [ox + i, oy]));
  const legal = cells.every((c) => c[0] < SIZE && c[1] < SIZE && !occ.has(key(c[0], c[1])));
  return legal ? cells : null;
}

function grid(cls, onTap) {
  const g = h('div', { class: `bs-grid ${cls}` });
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      g.append(h('button', {
        class: 'bs-cell',
        'data-xy': key(x, y),
        onclick: onTap ? () => onTap(x, y) : undefined,
      }));
    }
  }
  return g;
}

function markCell(cellEl, content, cls, fresh) {
  clear(cellEl);
  cellEl.className = `bs-cell ${cls ?? ''}`;
  if (content) cellEl.append(h('span', { class: `bs-mark${fresh ? ' bs-mark--new' : ''}` }, content));
}

function renderPlacing(view, ctx) {
  const me = ctx.me;
  const box = els.wrap;
  clear(box);
  const committed = view.commits[me] !== null;
  const placedAll = draft.length === FLEET.length;

  const gridEl = grid('bs-place', (x, y) => {
    if (committed) return;
    const hitIdx = draft.findIndex((s) => s.cells.some((c) => c[0] === x && c[1] === y));
    if (sel) {
      const cells = tryPlace(draft, sel.len, x, y);
      if (cells) {
        draft.push({ len: sel.len, cells });
        sel = null;
        ctx.session.setPrivate('draft', draft);
      } else {
        gridEl.classList.add('bs-shake');
        setTimeout(() => gridEl.classList.remove('bs-shake'), 350);
      }
      renderPlacing(view, ctx);
    } else if (hitIdx >= 0) {
      const cells = rotated(draft, hitIdx);
      if (cells) {
        draft[hitIdx] = { len: draft[hitIdx].len, cells };
        ctx.session.setPrivate('draft', draft);
      } else {
        gridEl.classList.add('bs-shake');
        setTimeout(() => gridEl.classList.remove('bs-shake'), 350);
      }
      renderPlacing(view, ctx);
    }
  });
  for (const s of draft) {
    for (const c of s.cells) {
      const cell = gridEl.querySelector(`[data-xy="${key(c[0], c[1])}"]`);
      if (cell) cell.classList.add('bs-cell--ship');
    }
  }

  // tray of unplaced ships
  const remaining = [...FLEET];
  for (const s of draft) {
    const i = remaining.indexOf(s.len);
    if (i >= 0) remaining.splice(i, 1);
  }
  const tray = h('div', { class: 'row gap-xs wrap', style: 'justify-content:center;' },
    remaining.map((len, i) => h('button', {
      class: `chip bs-tray${sel && sel.tag === `${len}-${i}` ? ' bs-tray--sel' : ''}`,
      onclick: () => {
        sel = sel?.tag === `${len}-${i}` ? null : { len, tag: `${len}-${i}` };
        renderPlacing(view, ctx);
      },
    }, `${SHIP_NAMES[len]} ${'▪'.repeat(len)}`)),
    draft.map((s, i) => h('button', {
      class: 'chip',
      style: 'opacity:.75;',
      onclick: () => {
        if (committed) return;
        draft.splice(i, 1);
        ctx.session.setPrivate('draft', draft);
        renderPlacing(view, ctx);
      },
    }, `${SHIP_NAMES[s.len]} ✕`)),
  );

  let status;
  let readyBtn = null;
  if (committed) {
    status = `fleet locked in 🔒 waiting for ${nameOf(ctx.partner)}…`;
  } else {
    status = placedAll ? 'fleet ready — lock it in!' : sel ? 'tap the water to place it' : 'place your fleet (tap a ship, then the water · tap placed ships to rotate)';
    readyBtn = h('button', {
      class: 'btn btn--me btn--big bs-ready',
      disabled: !(placedAll && ctx.myTurn()),
      onclick: () => {
        if (!placedAll || !ctx.myTurn()) return;
        const placement = normalizePlacement(draft);
        const salt = randomUint32();
        ctx.session.setPrivate('placement', placement);
        ctx.session.setPrivate('salt', salt);
        ctx.submitMove({ k: 'commit', c: commitOf(placement, salt) });
      },
    }, placedAll && !ctx.myTurn() ? `waiting for ${nameOf(ctx.partner)} to be ready…` : 'ready! commit fleet 💪');
  }

  box.append(
    h('div', { class: 'hand sub center-text', style: 'font-size:16px;' }, status),
    h('div', { class: 'center' }, gridEl),
    tray,
    h('div', { class: 'row gap-xs', style: 'justify-content:center;' },
      !committed ? h('button', {
        class: 'btn btn--small',
        onclick: () => {
          draft = randomFleet();
          sel = null;
          ctx.session.setPrivate('draft', draft);
          renderPlacing(view, ctx);
        },
      }, 'shuffle 🎲') : null,
      !committed && draft.length ? h('button', {
        class: 'btn btn--small btn--ghost',
        onclick: () => { draft = []; sel = null; ctx.session.setPrivate('draft', draft); renderPlacing(view, ctx); },
      }, 'clear') : null,
    ),
    readyBtn ? h('div', { class: 'center' }, readyBtn) : null,
  );
}

function fleetIndicator(view, owner) {
  const sunkLens = view.sunk[owner].map((s) => s.len);
  const pool = [...FLEET];
  return h('div', { class: 'row gap-xs', style: 'justify-content:center;' },
    pool.map((len) => {
      const i = sunkLens.indexOf(len);
      const dead = i >= 0;
      if (dead) sunkLens.splice(i, 1);
      return h('span', { class: `bs-shipicon${dead ? ' bs-shipicon--dead' : ''}` }, '▪'.repeat(len));
    }),
  );
}

function renderFiring(view, ctx) {
  const me = ctx.me;
  const partner = ctx.partner;
  const box = els.wrap;
  clear(box);
  const placement = myPlacement(ctx);

  if (!placement) {
    box.append(h('div', { class: 'cozy-empty sticker' },
      h('span', { class: 'cozy-empty__emoji' }, '🫠'),
      h('div', { class: 'title-md' }, 'this device lost the fleet'),
      h('div', { class: 'hand sub' }, 'the ship positions lived only here — you may have to abandon this one'),
    ));
    return;
  }

  const last = ctx.lastMove();
  const freshKey = last?.move?.k === 'report' ? key(last.move.x, last.move.y) : null;

  // banner on sunk reports
  if (last?.move?.k === 'report' && last.move.r === 'sunk' && view.moveN !== lastBannerN) {
    lastBannerN = view.moveN;
    const mine = last.by === me; // I reported = my ship sank
    els.banner.textContent = mine
      ? `she sank your ${SHIP_NAMES[last.move.ship.len]} 😭`
      : `you sunk her ${SHIP_NAMES[last.move.ship.len]}!! 🔥`;
    els.banner.classList.add('bs-banner--show');
    setTimeout(() => els.banner.classList.remove('bs-banner--show'), 2600);
  }

  const canFire = ctx.myTurn() && !view.pending && view.phase === 'firing';
  const track = grid('bs-track', (x, y) => {
    if (!canFire || view.shots[me][key(x, y)]) return;
    if (armed && armed.x === x && armed.y === y) {
      armed = null;
      ctx.submitMove({ k: 'fire', x, y });
    } else {
      armed = { x, y };
      renderFiring(view, ctx);
    }
  });
  for (const [k, r] of Object.entries(view.shots[me])) {
    const cell = track.querySelector(`[data-xy="${k}"]`);
    if (cell) markCell(cell, r === 'miss' ? '🫧' : r === 'sunk' ? '🔥' : '💥', `bs-cell--${r}`, k === freshKey && last?.by !== me ? false : k === freshKey);
  }
  if (armed && canFire) {
    const cell = track.querySelector(`[data-xy="${key(armed.x, armed.y)}"]`);
    if (cell && !view.shots[me][key(armed.x, armed.y)]) markCell(cell, '🎯', 'bs-cell--armed', false);
  }

  const mine = grid('bs-mine', null);
  for (const s of placement) {
    for (const c of s.cells) {
      const cell = mine.querySelector(`[data-xy="${key(c[0], c[1])}"]`);
      if (cell) cell.classList.add('bs-cell--ship');
    }
  }
  for (const [k, r] of Object.entries(view.shots[partner])) {
    const cell = mine.querySelector(`[data-xy="${k}"]`);
    if (cell) markCell(cell, r === 'miss' ? '·' : r === 'sunk' ? '🔥' : '💥', `bs-cell--${r}${cell.classList.contains('bs-cell--ship') ? ' bs-cell--ship' : ''}`, k === freshKey && last?.by === me);
  }

  box.append(
    h('div', { class: 'stack gap-xs' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' },
        h('span', { class: 'small sub' }, `her fleet`),
        fleetIndicator(view, partner),
      ),
      h('div', { class: 'center' }, track),
    ),
    h('div', { class: 'stack gap-xs mt-sm' },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' },
        h('span', { class: 'small sub' }, 'your waters'),
        fleetIndicator(view, me),
      ),
      h('div', { class: 'center' }, mine),
    ),
  );
}

export const ui = {
  mount(el, ctx) {
    sel = null;
    armed = null;
    lastAutoN = -1;
    lastBannerN = -1;
    builtFor = '';
    draft = ctx.session.getPrivate('draft') ?? [];
    els = {
      banner: h('div', { class: 'bs-banner' }),
      wrap: h('div', { class: 'stack gap-sm grow' }),
    };
    el.append(els.banner, els.wrap);
  },

  render(view, ctx) {
    if (!els) return;
    autoMoves(view, ctx);
    if (view.phase === 'placing') renderPlacing(view, ctx);
    else renderFiring(view, ctx);
    builtFor = view.phase;
  },

  destroy() { els = null; draft = []; },
};

export function turnLabel(state, ctx) {
  const partner = nameOf(ctx.partner);
  if (state.phase === 'placing') {
    return state.commits[ctx.me] === null ? 'place your fleet 🚢' : `${partner} is placing her fleet…`;
  }
  if (state.phase === 'firing') {
    if (state.pending) return 'incoming… 📡';
    return state.turn === ctx.me ? 'fire! 🎯' : `${partner} is aiming…`;
  }
  if (state.phase === 'reveal') return 'revealing fleets… 🔍';
  return null;
}

export function resultText(record, state, ctx) {
  const winner = record?.result?.winner;
  if (!winner) return null;
  if (state?.cheater) return `${nameOf(state.cheater)} got caught cheating 😤`;
  return `${nameOf(winner)} sank the fleet!`;
}

export const css = `
.bs-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 2px;
  width: 100%;
  background: linear-gradient(160deg, #fff, var(--peri-ghost));
  border: 3px solid #fff;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-puff);
  padding: 5px;
}
.bs-track, .bs-place { max-width: 372px; }
.bs-mine { max-width: 240px; }
.bs-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  background: var(--peri-ghost);
  box-shadow: inset 0 1px 2px rgba(83,51,62,.10);
  display: grid;
  place-items: center;
  padding: 0;
  position: relative;
  min-width: 0;
}
.bs-cell--ship { background: var(--peri-soft); box-shadow: inset 0 0 0 1.5px var(--peri); }
.bs-cell--hit { background: var(--rose-soft); }
.bs-cell--sunk { background: var(--coral-ghost); }
.bs-cell--armed { outline: 2px solid var(--butter-deep); outline-offset: -1px; }
.bs-mark { font-size: 13px; line-height: 1; }
.bs-mine .bs-mark { font-size: 9px; }
.bs-mark--new { animation: bs-pop var(--t-slow) var(--bounce) both; }
@keyframes bs-pop { from { transform: scale(2.2); opacity: 0; } }
.bs-tray--sel { background: var(--ink); color: var(--paper); transform: rotate(-1.5deg); }
.bs-shake { animation: bs-shake .3s ease; }
@keyframes bs-shake { 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.bs-shipicon { font-size: 10px; letter-spacing: 1px; color: var(--peri-deep); }
.bs-shipicon--dead { color: var(--ink-faint); text-decoration: line-through; }
.bs-banner {
  position: fixed;
  top: calc(64px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%) scale(.8);
  background: var(--ink);
  color: var(--paper);
  font-weight: 620;
  padding: 10px 22px;
  border-radius: var(--r-pill);
  box-shadow: var(--shadow-float);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--t-med) ease, transform var(--t-med) var(--bounce);
  z-index: 40;
  white-space: nowrap;
}
.bs-banner--show { opacity: 1; transform: translateX(-50%) scale(1); }
`;

export default {
  id: 'battleship',
  engine: 'turnbased',
  blurb: 'hide your fleet, hunt hers down. no peeking — the game checks.',
  logic,
  ui,
  css,
  turnLabel,
  resultText,
};
