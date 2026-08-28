// Turn-based runner: replay-derived state, dual validation, per-move state
// hashes, desync repair, disconnect handling, rematch flow. Game modules
// provide { logic, ui, css?, blurb?, turnLabel?, resultText? } and never
// touch the network.
import { h, clear, heartBurst, vibrate } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { MSG } from '../../sync/protocol.js';
import { replayState } from '../../session/replay.js';
import { hashState } from '../../core/hash.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, nameOf, emojiOf, partnerOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { store, K } from '../../core/storage.js';

const hashOf = (logic, state) => (logic.hashState ? logic.hashState(state) : hashState(state));

export function mountTurnBased(el, mod, gameMeta, session) {
  const logic = mod.logic;
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let state;
  let lastMove = null;
  let frozen = false; // during desync repair
  let destroyed = false;

  // ── chrome ──────────────────────────────────────────────────
  const turnbar = h('div', { class: 'turnbar' });
  const boardEl = h('div', { class: 'stack grow', style: 'min-height:0;' });
  const overlayZone = h('div', {});
  const dcZone = h('div', { style: 'margin-bottom:8px;' });
  const stage = h('div', { class: 'game-stage stack gap-sm grow' }, dcZone, turnbar, boardEl, overlayZone);

  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', { class: 'back-btn', 'aria-label': 'home', onclick: () => navigate('') }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
      h('button', {
        class: 'btn btn--small btn--ghost',
        onclick: async () => {
          if (await confirmModal('give up this game? it counts for nothing 🥀', { title: 'abandon?', yes: 'abandon', danger: true })) {
            session.abandon('quit');
            navigate('');
          }
        },
      }, 'give up'),
    ),
    stage,
  ));

  // ── state & rendering ───────────────────────────────────────
  const rebuild = () => { state = replayState(logic, session.startInfo(), session.moves); };

  const ctx = {
    session, me, partner, gameMeta,
    myTurn: () => !frozen && state.turn === me && !logic.isOver(state),
    lastMove: () => lastMove,
    submitMove: (move) => trySubmit(move),
    haptic: (pattern = 16) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(pattern); },
  };

  const renderTurnbar = () => {
    const over = logic.isOver(state);
    turnbar.className = `turnbar p-${state.turn}`;
    if (over) { turnbar.textContent = 'game over!'; return; }
    if (frozen) { turnbar.textContent = 'untangling a sync hiccup… ✨'; return; }
    const label = mod.turnLabel?.(state, ctx);
    if (label) { turnbar.textContent = label; }
    else if (state.turn === me) {
      turnbar.classList.add('turnbar--me');
      turnbar.textContent = 'your turn!';
    } else {
      turnbar.textContent = `${nameOf(partner)}'s turn`;
    }
  };

  const render = () => {
    if (destroyed) return;
    renderTurnbar();
    mod.ui.render(logic.view(state, me), ctx);
  };

  // ── move flow ───────────────────────────────────────────────
  function trySubmit(move) {
    if (frozen || state.turn !== me || logic.isOver(state)) return false;
    const next = logic.reduce(state, move, { by: me });
    if (next === null) return false;
    state = next;
    lastMove = { by: me, move };
    session.commitLocalMove(move, hashOf(logic, state));
    ctx.haptic(12);
    render();
    checkOver();
    return true;
  }

  unsubs.push(session.onMove((rec) => {
    if (frozen) return;
    if (rec.by !== state.turn || rec.by === me) return startRepair('turn-mismatch');
    const next = logic.reduce(state, rec.move, { by: rec.by });
    if (next === null) return startRepair('illegal-move');
    const hNew = hashOf(logic, next);
    if (rec.h !== undefined && rec.h !== hNew) return startRepair('hash-mismatch');
    state = next;
    lastMove = { by: rec.by, move: rec.move };
    session.acceptRemoteMove(rec);
    ctx.haptic([10, 30, 10]);
    render();
    checkOver();
  }));

  unsubs.push(session.events.on('resynced', () => {
    try {
      rebuild();
      lastMove = session.moves.length ? { by: session.moves.at(-1).by, move: session.moves.at(-1).move } : null;
      render();
      checkOver();
    } catch { startRepair('replay-failed'); }
  }));

  // ── desync repair ───────────────────────────────────────────
  async function startRepair(why) {
    if (frozen || session.status !== 'active') return;
    console.warn('[turnbased] desync:', why);
    frozen = true;
    renderTurnbar();
    connection.send(MSG.DESYNC, { sid: session.sid, atSeq: session.lastSeq, myH: hashOf(logic, state) });
    await repair();
  }

  async function repair() {
    try {
      const res = await connection.request(MSG.SYNC_REQ, { sid: session.sid, haveSeq: 0 }, { timeoutMs: 8000 });
      if (res?.gone) { frozen = false; return; } // session.js handles the record path
      const theirs = res?.moves ?? [];
      if (theirs.length >= session.moves.length) {
        session.moves = theirs;
        session.persist();
      }
      rebuild();
      frozen = false;
      render();
      checkOver();
      toast('sync hiccup smoothed over ✨', { ms: 1800 });
    } catch {
      // couldn't repair (partner gone / true divergence) → void the round
      frozen = false;
      if (session.status === 'active') {
        session.voidGame();
        toast('the gremlins ate this round 🐛 — it counts for nothing', { ms: 3500 });
      }
    }
  }

  unsubs.push(session.events.on('desync-remote', () => { frozen = true; renderTurnbar(); repair(); }));

  // ── game over ───────────────────────────────────────────────
  function checkOver() {
    const over = logic.isOver(state);
    if (!over || session.status !== 'active') return;
    const result = over.draw
      ? { winner: null, draw: true, reason: 'draw' }
      : { winner: over.winner, draw: false, reason: 'win' };
    session.end(session.makeRecord(result, over.score ?? null));
  }

  unsubs.push(session.events.on('ended', ({ record }) => {
    if (record?.result?.reason === 'abandoned') { navigate(''); return; }
    if (record?.result?.reason === 'void') { showEndOverlay(record, true); return; }
    showEndOverlay(record, false);
  }));

  function showEndOverlay(record, wasVoid) {
    render(); // final board visible under the overlay
    const winner = record?.result?.winner ?? null;
    const loser = winner ? partnerOf(winner) : null;
    const iWon = winner === me;

    let title;
    let emoji;
    if (wasVoid) { title = 'round voided'; emoji = '🐛'; }
    else if (!winner) { title = "it's a draw!"; emoji = '🤝'; }
    else {
      title = mod.resultText?.(record, state, ctx) ?? `${nameOf(winner)} wins!`;
      emoji = iWon ? '🎉' : '😤';
    }

    const rematchBtn = h('button', {
      class: 'btn btn--me btn--big',
      onclick: async (e) => {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'rematch offered 💌';
        heartBurst(e.currentTarget);
        await sendInvite(gameMeta.id, { rematchOf: session.sid, first: loser ?? undefined });
      },
    }, 'rematch 💕');

    unsubs.push(invites.on('declined', () => {
      rematchBtn.disabled = false;
      rematchBtn.textContent = 'rematch 💕';
    }));
    unsubs.push(invites.on('expired', ({ reason }) => {
      if (reason !== 'merged' && reason !== 'superseded') {
        rematchBtn.disabled = false;
        rematchBtn.textContent = 'rematch 💕';
      }
    }));

    clear(overlayZone);
    overlayZone.append(h('div', { class: 'game-overlay' },
      h('div', { class: 'game-overlay__panel sticker stack gap-sm center' },
        h('div', { style: 'font-size:52px;animation:bob 2.4s ease-in-out infinite;' }, emoji),
        h('div', { class: 'title-lg' }, title),
        record?.score ? h('div', { class: 'sub', style: 'font-weight:600;' }, `${record.score.diya} – ${record.score.divyam}`) : null,
        wasVoid ? h('div', { class: 'hand sub' }, 'a sync gremlin got in — nobody wins, nobody loses') : null,
        h('div', { class: 'stack gap-xs mt-sm', style: 'width:100%;' },
          connection.partnerPresent() && !wasVoid ? rematchBtn : null,
          wasVoid && connection.partnerPresent() ? h('button', { class: 'btn btn--me btn--big', onclick: () => { sendInvite(gameMeta.id, {}); } }, 'go again 💕') : null,
          h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
        ),
      ),
    ));
    if (iWon) heartBurst(overlayZone, { count: 8 });
  }

  // ── disconnect banner ───────────────────────────────────────
  let dcTimer = null;
  const renderDc = () => {
    clear(dcZone);
    clearInterval(dcTimer);
    if (connection.partnerPresent() || session.status !== 'active') return;
    const t0 = Date.now();
    const elapsed = h('span', { class: 'small', style: 'opacity:.7;' }, '0s');
    dcZone.append(h('div', { class: 'dc-bar' },
      h('span', { style: 'font-size:18px;' }, '📡'),
      h('span', { class: 'grow' }, `${nameOf(partner)}'s connection dropped… waiting `, elapsed),
      h('button', { class: 'btn btn--small', onclick: () => navigate('') }, 'home'),
    ));
    dcTimer = setInterval(() => { elapsed.textContent = `${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
  };
  unsubs.push(connection.onPartner(({ present }) => {
    renderDc();
    if (present && session.status === 'active') toast(`${nameOf(partner)} is back 💞`, { ms: 1600 });
  }));

  // ── boot ────────────────────────────────────────────────────
  try {
    rebuild();
  } catch (err) {
    console.error('[turnbased] replay failed at boot', err);
    session.resync().then(() => { try { rebuild(); render(); } catch { session.voidGame(); } });
    state = logic.setup(session.seed, session.opts ?? {}, { first: session.first, players: session.players });
  }
  mod.ui.mount(boardEl, ctx);
  render();
  renderDc();
  if (session.status === 'active') session.resync();
  else if (session.status === 'ended') { /* landed on a finished game */ navigate(''); }

  return () => {
    destroyed = true;
    clearInterval(dcTimer);
    unsubs.forEach((u) => u());
    mod.ui.destroy?.();
  };
}
