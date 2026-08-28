// draw & guess — one draws, one guesses, strokes stream live.
// Round facts (word pick, solved, skip) are MOVES so refresh recovers;
// live strokes and guesses are ephemerals.
import { h, clear } from '../../core/ui/dom.js';
import { MSG } from '../../sync/protocol.js';
import { connection } from '../../sync/connection.js';
import { rngFor, sample, shuffle } from '../../core/prng.js';
import { partnerOf, nameOf } from '../../core/identity.js';
import { createDrawSurface, SURFACE_CSS } from '../../engines/canvas/draw-surface.js';
import { markSeen } from '../../engines/reveal/engine.js';
import deck from '../../../data/decks/drawwords.js';

const byId = new Map(deck.items.map((i) => [i.id, i]));
const ROUNDS = 6;

const drawerOf = (r, session) => (r % 2 === 0 ? session.first : partnerOf(session.first));

// 6 words per difficulty, interleaved so round r offers [easy, medium, hard]
function sampleItems(seed, opts, seen = []) {
  const rng = rngFor(seed, 'deck');
  const pickN = (pool, n) => {
    if (!pool.length) pool = deck.items.map((i) => i.id);
    const unseen = pool.filter((id) => !seen.includes(id));
    const picked = sample(unseen, Math.min(n, unseen.length), rng);
    while (picked.length < n) {
      const rest = pool.filter((id) => !picked.includes(id));
      const src = rest.length ? rest : pool;
      picked.push(...sample(src, Math.min(n - picked.length, src.length), rng));
    }
    return picked;
  };
  const pools = [1, 2, 3].map((d) => deck.items.filter((i) => i.difficulty === d).map((i) => i.id));
  const [easy, med, hard] = pools.map((p) => pickN(p, ROUNDS));
  const ids = [];
  for (let r = 0; r < ROUNDS; r++) ids.push(easy[r], med[r], hard[r]);
  return ids;
}

const normText = (s) => (s ?? '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');

function closeEnough(guess, word) {
  const a = normText(guess);
  const b = normText(word);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  // levenshtein ≤ 1
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; } else if (a.length > b.length) i++; else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const pointsFor = (ms) => (ms <= 30_000 ? 3 : ms <= 60_000 ? 2 : 1);

function deriveState(session) {
  const rounds = Array(ROUNDS).fill(null);
  for (const rec of session.moves) {
    const m = rec.move ?? {};
    if (m.k === 'word' && m.r >= 0 && m.r < ROUNDS) rounds[m.r] = { wordId: m.wordId, at: m.at, outcome: null, ms: 0 };
    else if (m.k === 'solved' && rounds[m.r] && !rounds[m.r].outcome) { rounds[m.r].outcome = 'solved'; rounds[m.r].ms = m.ms ?? 0; }
    else if (m.k === 'skip' && rounds[m.r] && !rounds[m.r].outcome) rounds[m.r].outcome = 'skip';
  }
  const done = rounds.filter((r) => r?.outcome).length;
  return { rounds, cur: done, over: done >= ROUNDS };
}

function scoresFrom(session, state) {
  const s = { diya: 0, divyam: 0 };
  state.rounds.forEach((rd, i) => {
    if (!rd || rd.outcome !== 'solved') return;
    const drawer = drawerOf(i, session);
    s[partnerOf(drawer)] += pointsFor(rd.ms);
    s[drawer] += 1;
  });
  return s;
}

function blanks(word) {
  return word.split(' ').map((w) => '▁'.repeat(w.length)).join('  ');
}

function mountGame(bodyEl, ctx) {
  const { session, me } = ctx;
  const unsubs = [];
  let surface = null;
  let guesses = []; // this round's ticker {by, text, hit}
  let timerInt = null;
  let destroyed = false;

  const itemIds = session.itemIds ?? sampleItems(session.seed, session.opts ?? {}, []);
  markSeen('draw', itemIds);
  const wordFor = (r) => byId.get(deriveState(session).rounds[r]?.wordId ?? itemIds[r * 3]);

  const commit = (move) => { session.commitLocalMove(move); render(); };

  const maybeEnd = (state) => {
    if (!state.over || session.status !== 'active') return;
    const score = scoresFrom(session, state);
    const result = score.diya === score.divyam
      ? { winner: null, draw: true, reason: 'draw' }
      : { winner: score.diya > score.divyam ? 'diya' : 'divyam', draw: false, reason: 'win' };
    session.end(session.makeRecord(result, score));
  };

  function render() {
    if (destroyed) return;
    clearInterval(timerInt);
    surface?.destroy?.();
    surface = null;
    clear(bodyEl);

    const state = deriveState(session);
    if (state.over) { maybeEnd(state); return; }

    const r = state.cur;
    const drawer = drawerOf(r, session);
    const iDraw = drawer === me;
    const round = state.rounds[r];
    const score = scoresFrom(session, state);

    const head = h('div', { class: 'row', style: 'justify-content:space-between;align-items:center;' },
      h('span', { class: 'small sub', style: 'font-weight:650;' }, `round ${r + 1}/${ROUNDS} · ${iDraw ? 'you draw! 🎨' : `${ctx.partnerName} draws`}`),
      h('span', { class: 'small', style: 'font-weight:650;' },
        h('span', { style: 'color:var(--rose-deep);' }, String(score.diya)),
        h('span', { class: 'faint' }, ' – '),
        h('span', { style: 'color:var(--peri-deep);' }, String(score.divyam))),
    );
    bodyEl.append(head);

    if (!round) {
      if (iDraw) renderWordPick(r);
      else {
        bodyEl.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
          h('div', { style: 'font-size:44px;animation:bob 2.4s ease-in-out infinite;' }, '🎨'),
          h('div', { class: 'hand', style: 'font-size:18px;margin-top:8px;' }, `${ctx.partnerName} is picking a word`,
            h('span', { class: 'dots-thinking' })),
        ));
      }
      return;
    }
    renderDrawing(r, round, iDraw);
  }

  function renderWordPick(r) {
    const opts = [itemIds[r * 3], itemIds[r * 3 + 1], itemIds[r * 3 + 2]];
    bodyEl.append(
      h('div', { class: 'sticker rv-card' },
        h('div', { class: 'rv-kicker' }, 'pick your masterpiece'),
      ),
      h('div', { class: 'stack gap-sm' }, opts.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return h('button', {
          class: 'rv-option dg-word',
          onclick: () => commit({ k: 'word', r, wordId: id, at: Date.now() }),
        },
          h('span', {}, item.word),
          h('span', { class: 'small', style: 'display:block;color:var(--butter-deep);' }, '⭐'.repeat(item.difficulty)),
        );
      })),
    );
  }

  function renderDrawing(r, round, iDraw) {
    const item = byId.get(round.wordId);
    const word = item?.word ?? '???';
    guesses = guesses.filter((g) => g.r === r);

    // word banner
    bodyEl.append(h('div', { class: 'sticker center-text', style: 'padding:10px 14px;' },
      iDraw
        ? h('div', {}, h('span', { class: 'small sub' }, 'draw: '), h('span', { style: 'font-weight:700;font-size:19px;' }, word),
          h('span', { class: 'small', style: 'color:var(--butter-deep);margin-left:8px;' }, '⭐'.repeat(item?.difficulty ?? 1)))
        : h('div', {},
          h('div', { style: 'font-weight:700;font-size:21px;letter-spacing:2px;' }, blanks(word)),
          h('div', { class: 'small faint' }, `${word.replace(/[^ ]/g, '•').split(' ').map((w) => w.length).join(' + ')} letters · ${'⭐'.repeat(item?.difficulty ?? 1)}`)),
    ));

    // timer
    const timeLabel = h('span', { class: 'small', style: 'font-weight:650;' });
    const tick = () => {
      const left = 90_000 - (Date.now() - round.at);
      timeLabel.textContent = left > 0 ? `${Math.ceil(left / 1000)}s` : 'overtime! 😅';
    };
    tick();
    timerInt = setInterval(tick, 500);

    // surface
    const surfaceZone = h('div', {});
    bodyEl.append(h('div', { class: 'row', style: 'justify-content:flex-end;padding:0 6px;' }, timeLabel), surfaceZone);

    if (iDraw) {
      surface = createDrawSurface(surfaceZone, {
        onStrokeChunk: (chunk) => session.sendEphemeral(MSG.STROKE, { round: r, ...chunk }),
        onStrokeDone: () => session.setPrivate(`dg-r${r}`, surface.getStrokes()),
        onUndo: (id) => {
          session.sendEphemeral(MSG.STROKE_UNDO, { round: r, id });
          session.setPrivate(`dg-r${r}`, surface.getStrokes());
        },
        onClear: () => {
          session.sendEphemeral(MSG.CANVAS_CLEAR, { round: r });
          session.setPrivate(`dg-r${r}`, []);
        },
      });
      const saved = session.getPrivate(`dg-r${r}`);
      if (saved?.length) surface.loadStrokes(saved);
    } else {
      surface = createDrawSurface(surfaceZone, { readonly: true });
    }

    // guess ticker
    const ticker = h('div', { class: 'stack gap-xs', style: 'max-height:96px;overflow-y:auto;' });
    const renderTicker = () => {
      clear(ticker);
      [...guesses].reverse().forEach((g) => ticker.append(h('div', {
        class: 'small',
        style: `padding:4px 12px;border-radius:999px;background:${g.hit ? 'var(--mint-ghost)' : '#fff'};box-shadow:var(--shadow-press);align-self:flex-start;${g.hit ? 'font-weight:700;color:var(--mint-deep);' : ''}`,
      }, `${nameOf(g.by)}: ${g.text}${g.hit ? ' ✓' : ''}`)));
    };
    renderTicker();

    if (iDraw) {
      bodyEl.append(ticker, h('div', { class: 'row gap-sm', style: 'justify-content:center;padding:4px 0 8px;' },
        h('button', {
          class: 'btn btn--small btn--mint',
          onclick: () => commit({ k: 'solved', r, by: partnerOf(me), ms: Date.now() - round.at }),
        }, 'she got it ✓'),
        h('button', {
          class: 'btn btn--small btn--ghost',
          onclick: () => commit({ k: 'skip', r }),
        }, 'skip 😮‍💨'),
      ));
    } else {
      const input = h('input', {
        class: 'input', placeholder: 'your guess…',
        autocomplete: 'off', autocapitalize: 'none', style: 'min-height:44px;',
      });
      const send = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        guesses.push({ r, by: me, text, hit: false });
        renderTicker();
        session.sendEphemeral(MSG.GUESS, { round: r, by: me, text });
        ctx.haptic(8);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      bodyEl.append(ticker, h('div', { class: 'row gap-xs', style: 'padding-bottom:8px;' },
        input,
        h('button', { class: 'btn btn--me', style: 'min-width:72px;', onclick: send }, 'guess'),
      ));
      setTimeout(() => input.focus(), 150);
    }

    // drawer rebroadcasts everything when the partner (re)appears
    if (iDraw) {
      ctx.rebroadcast = () => {
        const strokes = surface?.getStrokes() ?? [];
        session.sendEphemeral(MSG.CANVAS_CLEAR, { round: r });
        for (const s of strokes) session.sendEphemeral(MSG.STROKE, { round: r, id: s.id, color: s.color, w: s.w, pts: s.pts, done: true });
      };
    } else ctx.rebroadcast = null;
  }

  // ── wire events ─────────────────────────────────────────────
  unsubs.push(session.onMove((rec) => {
    if (!session.acceptRemoteMove(rec)) return;
    const m = rec.move ?? {};
    const state = deriveState(session);
    if (m.k === 'solved') {
      const word = byId.get(state.rounds[m.r]?.wordId)?.word ?? '?';
      ctx.flash(`solved! it was "${word}" 🎉`, '🎉');
      ctx.haptic([15, 40, 15]);
      guesses = [];
    } else if (m.k === 'skip') {
      const word = byId.get(state.rounds[m.r]?.wordId)?.word ?? '?';
      ctx.flash(`skipped — it was "${word}" 😮‍💨`, '🫧');
      guesses = [];
    }
    render();
  }));

  unsubs.push(session.onEphemeral(MSG.STROKE, (p) => {
    const state = deriveState(session);
    if (p.round === state.cur && surface) surface.addRemoteChunk(p);
  }));
  unsubs.push(session.onEphemeral(MSG.STROKE_UNDO, (p) => {
    const state = deriveState(session);
    if (p.round === state.cur && surface) surface.removeStroke(p.id);
  }));
  unsubs.push(session.onEphemeral(MSG.CANVAS_CLEAR, (p) => {
    const state = deriveState(session);
    if (p.round === state.cur && surface) surface.clearAll();
  }));
  unsubs.push(session.onEphemeral(MSG.GUESS, (p) => {
    const state = deriveState(session);
    if (p.round !== state.cur) return;
    const round = state.rounds[state.cur];
    const iDraw = drawerOf(state.cur, session) === me;
    const word = byId.get(round?.wordId)?.word ?? '';
    const hit = iDraw && round && !round.outcome && closeEnough(p.text, word);
    guesses.push({ r: state.cur, by: p.by, text: p.text, hit });
    render();
    if (hit) commit({ k: 'solved', r: state.cur, by: p.by, ms: Date.now() - round.at });
  }));

  unsubs.push(session.events.on('resynced', () => {
    guesses = [];
    render();
    ctx.rebroadcast?.();
  }));

  // rebroadcast strokes when the partner (re)appears so their canvas heals
  unsubs.push(connection.onPartner(({ present }) => {
    if (present) setTimeout(() => { if (!destroyed) ctx.rebroadcast?.(); }, 600);
  }));

  render();

  return () => {
    destroyed = true;
    clearInterval(timerInt);
    surface?.destroy?.();
    unsubs.forEach((u) => u());
  };
}

export default {
  id: 'drawguess',
  engine: 'canvas',
  deckId: 'draw',
  css: SURFACE_CSS + `
.dg-word { min-height: 58px; }
`,
  blurb: 'one draws, one guesses. art school dropout energy.',
  sampleItems,
  mountGame,
};
