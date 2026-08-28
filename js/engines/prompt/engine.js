// Prompt engine: alternating structured exchanges (compose → respond loops)
// built on the session move log. Every action is a move; state is a pure
// fold over the log, validated by both clients — refresh/resync recovery
// comes free from replaying the fold.
import { h, clear, heartBurst, vibrate } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { MSG } from '../../sync/protocol.js';
import { fnv1a32, stableStringify } from '../../core/hash.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { store, K } from '../../core/storage.js';
import { markSeen } from '../reveal/engine.js';
import { randomUint32 } from '../../core/uuid.js';

export const PROMPT_CSS = `
.pr-chat { display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; }
.pr-bubble {
  max-width: 82%;
  padding: 9px 14px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.35;
  box-shadow: var(--shadow-press);
  word-break: break-word;
}
.pr-bubble--them { align-self: flex-start; background: #fff; border-bottom-left-radius: 5px; }
.pr-bubble--me { align-self: flex-end; background: var(--me-soft); border-bottom-right-radius: 5px; }
.pr-bubble--sys { align-self: center; background: var(--paper-deep); font-family: var(--font-hand); font-size: 14px; color: var(--ink-soft); box-shadow: none; }
.pr-count {
  display: inline-grid; place-items: center;
  min-width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--butter);
  color: #7a4c09;
  font-weight: 700;
  font-size: 17px;
  border: 2.5px solid #fff;
  box-shadow: var(--shadow-press);
}
.pr-story { line-height: 1.7; font-size: 16.5px; }
.pr-story .s-diya { color: var(--rose-deep); }
.pr-story .s-divyam { color: var(--peri-deep); }
.pr-story .s-seed { font-style: italic; color: var(--ink-soft); }
`;

export function normalizeGuess(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function fuzzyMatch(guess, answer) {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  if (g.includes(a)) return true;
  if (a.includes(g) && g.length >= Math.max(4, Math.ceil(a.length * 0.6))) return true;
  return false;
}

export function sealValue(value) {
  const salt = randomUint32();
  return { salt, c: fnv1a32(`${stableStringify(value)}|${salt}`) };
}

export function sealCheck(value, salt, c) {
  return fnv1a32(`${stableStringify(value)}|${salt}`) === c;
}

const hashOf = (state) => fnv1a32(stableStringify(state));

export function mountPrompt(el, mod, gameMeta, session) {
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let destroyed = false;
  let frozen = false;
  let state;

  const ctx = {
    session, me, partner, gameMeta,
    myName: nameOf(me), partnerName: nameOf(partner),
    myEmoji: emojiOf(me), partnerEmoji: emojiOf(partner),
    nameOf, emojiOf,
    itemIds: session.itemIds ?? [],
    item: (id) => mod.getItem?.(id) ?? null,
    // roundIdx → who composes/chooses that round
    composerOf: (r) => (r % 2 === 0 ? session.first : partnerOf(session.first)),
    submit: (step) => trySubmit(step),
    haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); },
    seal: sealValue,
    fuzzyMatch,
  };

  if (mod.deckId && ctx.itemIds.length) markSeen(mod.deckId, ctx.itemIds);

  // ── fold machinery ──────────────────────────────────────────
  const refold = () => {
    let s = mod.init(ctx);
    for (const rec of session.moves) {
      const next = mod.fold(s, rec.move, rec.by, ctx);
      if (next === null) throw Object.assign(new Error(`bad step at seq ${rec.seq}`), { seq: rec.seq });
      s = next;
    }
    return s;
  };

  function trySubmit(step) {
    if (frozen || session.status !== 'active') return false;
    const next = mod.fold(state, step, me, ctx);
    if (next === null) return false;
    state = next;
    session.commitLocalMove(step, hashOf(state));
    ctx.haptic(10);
    render();
    checkDone();
    return true;
  }

  unsubs.push(session.onMove((rec) => {
    if (frozen) return;
    const next = mod.fold(state, rec.move, rec.by, ctx);
    if (next === null) return startRepair('invalid-step');
    if (rec.h !== undefined && rec.h !== hashOf(next)) return startRepair('hash-mismatch');
    state = next;
    session.acceptRemoteMove(rec);
    ctx.haptic([8, 25, 8]);
    render();
    checkDone();
  }));

  unsubs.push(session.events.on('resynced', () => {
    try {
      state = refold();
      render();
      checkDone();
    } catch { startRepair('refold-failed'); }
  }));

  async function startRepair(why) {
    if (frozen || session.status !== 'active') return;
    console.warn('[prompt] desync:', why);
    frozen = true;
    connection.send(MSG.DESYNC, { sid: session.sid, atSeq: session.lastSeq, myH: hashOf(state) });
    await repair();
  }

  async function repair() {
    try {
      const res = await connection.request(MSG.SYNC_REQ, { sid: session.sid, haveSeq: 0 }, { timeoutMs: 8000 });
      if (res?.gone) { frozen = false; return; }
      const theirs = res?.moves ?? [];
      if (theirs.length >= session.moves.length) {
        session.moves = theirs;
        session.persist();
      }
      state = refold();
      frozen = false;
      render();
      checkDone();
      toast('sync hiccup smoothed over ✨', { ms: 1800 });
    } catch {
      frozen = false;
      if (session.status === 'active') {
        session.voidGame();
        toast('the gremlins ate this round 🐛 — it counts for nothing', { ms: 3500 });
      }
    }
  }
  unsubs.push(session.events.on('desync-remote', () => { frozen = true; repair(); }));

  function checkDone() {
    if (session.status !== 'active') return;
    const done = mod.isDone(state, ctx);
    if (!done) return;
    session.end(session.makeRecord(done.result, done.score ?? null));
  }

  // ── chrome ──────────────────────────────────────────────────
  const progressEl = h('div', { class: 'rv-progress' });
  const dcZone = h('div', {});
  const bodyEl = h('div', { class: 'stack gap-md grow', style: 'min-height:0;' });
  const overlayZone = h('div', {});

  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', {
        class: 'back-btn', 'aria-label': 'home',
        onclick: async () => {
          if (session.status === 'active') {
            if (await confirmModal('leave this game? it counts for nothing 🥀', { title: 'leave?', yes: 'leave', danger: true })) {
              session.abandon('quit');
              navigate('');
            }
          } else navigate('');
        },
      }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
    ),
    dcZone, progressEl,
    h('div', { class: 'game-stage stack grow' }, bodyEl, overlayZone),
  ));

  const renderProgress = () => {
    clear(progressEl);
    const prog = mod.progressOf?.(state, ctx);
    if (!prog) return;
    for (let r = 0; r < prog.total; r++) {
      const cls = ['rv-dot'];
      if (r < prog.done) cls.push('rv-dot--done');
      if (r === prog.done && !state.done) cls.push('rv-dot--now');
      progressEl.append(h('span', { class: cls.join(' ') }));
    }
  };

  const render = () => {
    if (destroyed) return;
    renderProgress();
    clear(bodyEl);
    if (frozen) {
      bodyEl.append(h('div', { class: 'cozy-empty' },
        h('span', { class: 'cozy-empty__emoji' }, '✨'),
        h('div', { class: 'dots-thinking' }, 'untangling a sync hiccup')));
      return;
    }
    mod.render(bodyEl, state, ctx);
  };

  // ── endings ─────────────────────────────────────────────────
  unsubs.push(session.events.on('ended', ({ record }) => {
    if (record?.result?.reason === 'abandoned') { navigate(''); return; }
    showEndOverlay(record);
  }));

  function showEndOverlay(record) {
    render();
    const winner = record?.result?.winner ?? null;
    const iWon = winner === me;
    const wasVoid = record?.result?.reason === 'void';

    let title;
    let emoji;
    if (wasVoid) { title = 'round voided'; emoji = '🐛'; }
    else if (mod.resultText) { title = mod.resultText(state, record, ctx); emoji = winner ? (iWon ? '🎉' : '😤') : '💞'; }
    else if (!winner) { title = 'lovely. again?'; emoji = '💞'; }
    else { title = `${nameOf(winner)} wins!`; emoji = iWon ? '🎉' : '😤'; }

    const rematchBtn = h('button', {
      class: 'btn btn--me btn--big',
      onclick: async (e) => {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'invite sent 💌';
        heartBurst(e.currentTarget);
        await sendInvite(gameMeta.id, {});
      },
    }, 'play again 💕');
    unsubs.push(invites.on('declined', () => { rematchBtn.disabled = false; rematchBtn.textContent = 'play again 💕'; }));

    clear(overlayZone);
    overlayZone.append(h('div', { class: 'game-overlay' },
      h('div', { class: 'game-overlay__panel sticker stack gap-sm center' },
        h('div', { style: 'font-size:52px;animation:bob 2.4s ease-in-out infinite;' }, emoji),
        h('div', { class: 'title-lg' }, title),
        record?.score ? h('div', { class: 'sub', style: 'font-weight:600;' }, `${record.score.diya} – ${record.score.divyam}`) : null,
        mod.renderEpilogue ? (() => { const z = h('div', { style: 'width:100%;max-height:32dvh;overflow:auto;' }); mod.renderEpilogue(z, state, ctx); return z; })() : null,
        h('div', { class: 'stack gap-xs mt-sm', style: 'width:100%;' },
          connection.partnerPresent() && !wasVoid ? rematchBtn : null,
          h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
        ),
      ),
    ));
    if (iWon || !winner) heartBurst(overlayZone, { count: 6 });
  }

  // ── disconnect banner ───────────────────────────────────────
  let dcTimer = null;
  const renderDc = () => {
    clear(dcZone);
    clearInterval(dcTimer);
    if (connection.partnerPresent() || session.status !== 'active') return;
    const t0 = Date.now();
    const elapsed = h('span', { class: 'small', style: 'opacity:.7;' }, '0s');
    dcZone.append(h('div', { class: 'dc-bar', style: 'margin-bottom:8px;' },
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
    state = refold();
  } catch (err) {
    console.error('[prompt] refold failed at boot', err);
    state = mod.init(ctx);
    session.resync().then(() => { try { state = refold(); render(); checkDone(); } catch { session.voidGame(); } });
  }
  render();
  renderDc();
  if (session.status === 'active') session.resync();

  return () => {
    destroyed = true;
    clearInterval(dcTimer);
    unsubs.forEach((u) => u());
  };
}
