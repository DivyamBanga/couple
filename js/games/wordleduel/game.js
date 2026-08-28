// word duel — you each secretly pick the OTHER's word, then race to solve.
// Fewer guesses wins; speed breaks ties. Board + keyboard are exported for
// reuse by the daily word ritual.
import { h, clear, heartBurst } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { loadWordle } from '../../core/dict.js';
import { store, K } from '../../core/storage.js';
import { vibrate } from '../../core/ui/dom.js';

// ── shared wordle machinery (also used by the daily) ───────────
export function markGuess(guess, target) {
  const marks = Array(5).fill(0); // 0 absent · 1 present · 2 correct
  const remaining = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) marks[i] = 2;
    else remaining[target[i]] = (remaining[target[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 0 && remaining[guess[i]] > 0) {
      marks[i] = 1;
      remaining[guess[i]]--;
    }
  }
  return marks;
}

export const WORDLE_CSS = `
.wd-board { display: grid; gap: 6px; width: min(78vw, 300px); margin: 0 auto; }
.wd-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.wd-tile {
  aspect-ratio: 1;
  border-radius: 10px;
  border: 2.5px solid var(--paper-dot);
  background: #fff;
  display: grid; place-items: center;
  font-weight: 700;
  font-size: clamp(18px, 6vw, 26px);
  text-transform: uppercase;
  transition: transform var(--t-fast) var(--bounce), background var(--t-med), border-color var(--t-med), color var(--t-med);
}
.wd-tile--filled { border-color: var(--ink-faint); transform: scale(1.04); }
.wd-tile--0 { background: #E7DBD4; border-color: #E7DBD4; color: #9b8288; }
.wd-tile--1 { background: var(--butter); border-color: var(--butter); color: #7a4c09; }
.wd-tile--2 { background: var(--mint); border-color: var(--mint); color: #1e5c44; }
.wd-row--shake { animation: wd-shake .4s ease; }
@keyframes wd-shake { 20% { transform: translateX(-6px);} 40% { transform: translateX(6px);} 60% { transform: translateX(-4px);} 80% { transform: translateX(4px);} }
.wd-kb { display: flex; flex-direction: column; gap: 6px; align-items: center; width: 100%; max-width: 430px; margin: 0 auto; }
.wd-kb__row { display: flex; gap: 5px; width: 100%; justify-content: center; }
.wd-key {
  flex: 1; max-width: 40px;
  min-height: 46px;
  border-radius: 9px;
  background: #fff;
  border: 2px solid var(--paper-dot);
  font-weight: 650;
  font-size: 14px;
  text-transform: uppercase;
  box-shadow: 0 2px 0 rgba(83,51,62,.10);
  transition: transform var(--t-fast) var(--bounce), background var(--t-med);
}
.wd-key:active { transform: scale(.9); }
.wd-key--wide { max-width: 62px; font-size: 12px; }
.wd-key--0 { background: #E7DBD4; border-color: #E7DBD4; color: #9b8288; }
.wd-key--1 { background: var(--butter); border-color: var(--butter); color: #7a4c09; }
.wd-key--2 { background: var(--mint); border-color: var(--mint); color: #1e5c44; }
.wd-mini { display: grid; gap: 3px; }
.wd-mini .wd-row { gap: 3px; }
.wd-mini .wd-tile { border-radius: 4px; border-width: 1.5px; font-size: 0; }
`;

// Interactive wordle surface: 6-row board + colored keyboard + physical keys.
// onSolve/onFail get ({guesses:[{word,marks}], ms}).
export function createWordleSurface(zone, { target, allowed, ctx, onGuess, onDone, restoredGuesses = [], startedAt = Date.now() }) {
  const guesses = [...restoredGuesses]; // [{word, marks}]
  let current = '';
  let done = guesses.some((g) => g.marks.every((m) => m === 2)) || guesses.length >= 6;

  const board = h('div', { class: 'wd-board' });
  const kb = h('div', { class: 'wd-kb' });
  const keyEls = {};

  const renderBoard = () => {
    clear(board);
    for (let r = 0; r < 6; r++) {
      const row = h('div', { class: 'wd-row' });
      const g = guesses[r];
      for (let c = 0; c < 5; c++) {
        const ch = g ? g.word[c] : (r === guesses.length ? current[c] ?? '' : '');
        row.append(h('div', {
          class: `wd-tile${g ? ` wd-tile--${g.marks[c]}` : ch ? ' wd-tile--filled' : ''}`,
        }, ch));
      }
      board.append(row);
    }
    // keyboard coloring: best known state per letter
    const best = {};
    for (const g of guesses) {
      for (let i = 0; i < 5; i++) best[g.word[i]] = Math.max(best[g.word[i]] ?? -1, g.marks[i]);
    }
    for (const [ch, el] of Object.entries(keyEls)) {
      el.className = `wd-key${ch.length > 1 ? ' wd-key--wide' : ''}${best[ch] !== undefined ? ` wd-key--${best[ch]}` : ''}`;
    }
  };

  const shakeRow = () => {
    const row = board.children[guesses.length];
    row?.classList.add('wd-row--shake');
    setTimeout(() => row?.classList.remove('wd-row--shake'), 450);
    ctx.haptic([10, 30, 10]);
  };

  const key = (ch) => {
    if (done) return;
    if (ch === 'back') { current = current.slice(0, -1); renderBoard(); return; }
    if (ch === 'enter') {
      if (current.length !== 5) return shakeRow();
      if (!allowed.has(current)) { toast('not a word 😌', { ms: 1200 }); return shakeRow(); }
      const marks = markGuess(current, target);
      guesses.push({ word: current, marks });
      current = '';
      renderBoard();
      ctx.haptic(12);
      onGuess?.(guesses[guesses.length - 1], guesses.length);
      const solved = marks.every((m) => m === 2);
      if (solved || guesses.length >= 6) {
        done = true;
        onDone?.({ solved, guesses, ms: Date.now() - startedAt });
      }
      return;
    }
    if (current.length < 5) { current += ch; renderBoard(); }
  };

  for (const rowStr of ['qwertyuiop', 'asdfghjkl', '±zxcvbnm«']) {
    const row = h('div', { class: 'wd-kb__row' });
    for (const ch of rowStr) {
      const val = ch === '±' ? 'enter' : ch === '«' ? 'back' : ch;
      const el = h('button', { class: `wd-key${val.length > 1 ? ' wd-key--wide' : ''}` }, val === 'enter' ? '✓' : val === 'back' ? '⌫' : ch);
      el.addEventListener('click', () => key(val));
      keyEls[val] = el;
      row.append(el);
    }
    kb.append(row);
  }

  const onKeydown = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') key('enter');
    else if (e.key === 'Backspace') key('back');
    else if (/^[a-z]$/i.test(e.key)) key(e.key.toLowerCase());
  };
  window.addEventListener('keydown', onKeydown);

  zone.append(board, h('div', { style: 'height:12px;' }), kb);
  renderBoard();

  return {
    guesses,
    destroy: () => window.removeEventListener('keydown', onKeydown),
  };
}

export function miniBoard(guessCount, lastMarks) {
  const board = h('div', { class: 'wd-board wd-mini', style: 'width:70px;' });
  for (let r = 0; r < guessCount; r++) {
    const row = h('div', { class: 'wd-row' });
    for (let c = 0; c < 5; c++) row.append(h('div', { class: `wd-tile wd-tile--${r === guessCount - 1 ? lastMarks?.[c] ?? 0 : 0}` }));
    board.append(row);
  }
  return board;
}

// ── the duel itself ────────────────────────────────────────────
function mountCustom(el, gameMeta, session) {
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let surface = null;
  let destroyed = false;
  let wordle = null;

  const ctx = {
    haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); },
  };

  const mySecretFor = () => session.getResult('submit', 0, me);        // word I set for THEM
  const theirSecretFor = () => session.getResult('submit', 0, partner); // word they set for ME (my target)
  const mySummary = () => session.getResult('result', 99, me);
  const theirSummary = () => session.getResult('result', 99, partner);

  const bodyEl = h('div', { class: 'stack gap-md grow' });
  const spectateEl = h('div', {});
  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', {
        class: 'back-btn',
        onclick: async () => {
          if (session.status === 'active' && !mySummary()) {
            if (await confirmModal('leave the duel? it counts for nothing 🥀', { title: 'leave?', yes: 'leave', danger: true })) {
              session.abandon('quit');
              navigate('');
            }
          } else navigate('');
        },
      }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
      spectateEl,
    ),
    bodyEl,
  ));

  const render = () => {
    if (destroyed || !wordle) return;
    clear(bodyEl);
    surface?.destroy?.();
    surface = null;

    if (!mySecretFor()) return renderPick();
    if (!theirSecretFor()) return renderWaitWord();
    if (!mySummary()) return renderGuess();
    return renderDone();
  };

  function renderPick() {
    const input = h('input', {
      class: 'input',
      style: 'text-align:center;font-size:24px;letter-spacing:8px;text-transform:uppercase;max-width:260px;',
      maxlength: '5',
      autocomplete: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
      placeholder: '·····',
    });
    const pickBtn = h('button', {
      class: 'btn btn--me btn--big',
      onclick: () => {
        const w = input.value.trim().toLowerCase();
        if (w.length !== 5 || !/^[a-z]{5}$/.test(w)) return toast('needs to be 5 letters!', { ms: 1500 });
        if (!wordle.allowed.has(w)) return toast('has to be a real word 😌', { ms: 1500 });
        session.putResult('submit', 0, { word: w });
        ctx.haptic(12);
        render();
      },
    }, `this is ${nameOf(partner)}'s word 😈`);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') pickBtn.click(); });

    bodyEl.append(h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;padding-bottom:40px;' },
      h('div', { class: 'sticker rv-card', style: 'width:min(340px,100%);' },
        h('div', { style: 'font-size:44px;' }, '😈'),
        h('div', { class: 'title-md mt-sm' }, `pick ${nameOf(partner)}'s word`),
        h('div', { class: 'sub mt-sm' }, 'any real 5-letter word. be evil. but fair-evil.'),
      ),
      input, pickBtn,
    ));
    setTimeout(() => input.focus(), 200);
  }

  function renderWaitWord() {
    bodyEl.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
      h('div', { style: 'font-size:44px;animation:bob 2.4s ease-in-out infinite;' }, emojiOf(partner)),
      h('div', { class: 'hand', style: 'font-size:19px;margin-top:8px;' }, `${nameOf(partner)} is picking your word`,
        h('span', { class: 'dots-thinking' })),
      h('div', { class: 'small faint mt-sm' }, 'this is the scariest part'),
    ));
  }

  function renderGuess() {
    const target = theirSecretFor().word;
    const saved = session.getPrivate('duel') ?? { guesses: [], startedAt: Date.now() };
    if (!session.getPrivate('duel')) session.setPrivate('duel', saved);

    const zone = h('div', { class: 'stack grow', style: 'justify-content:center;padding-bottom:8px;' });
    bodyEl.append(
      h('div', { class: 'hand sub center-text', style: 'font-size:16px;' }, `${nameOf(partner)} chose this word for you…`),
      zone,
    );
    surface = createWordleSurface(zone, {
      target,
      allowed: wordle.allowed,
      ctx,
      restoredGuesses: saved.guesses,
      startedAt: saved.startedAt,
      onGuess: (guess, n) => {
        saved.guesses.push(guess);
        session.setPrivate('duel', saved);
        session.putResult('result', n, { word: guess.word, marks: guess.marks });
      },
      onDone: ({ solved, guesses, ms }) => {
        session.putResult('result', 99, { solved, guesses: guesses.length, ms });
        setTimeout(() => { if (!destroyed) render(); }, solved ? 1200 : 600);
        if (solved) { ctx.haptic([20, 40, 20, 40, 60]); heartBurst(zone, { count: 7, emoji: '🟩' }); }
      },
    });
  }

  function renderDone() {
    const mine = mySummary();
    const theirs = theirSummary();

    if (!theirs) {
      bodyEl.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
        h('div', { style: 'font-size:44px;' }, mine.solved ? '😎' : '🫠'),
        h('div', { class: 'title-md mt-sm' }, mine.solved ? `solved in ${mine.guesses}!` : 'brutal. you didn\'t get it.'),
        h('div', { class: 'hand sub', style: 'font-size:18px;margin-top:6px;' }, `${nameOf(partner)} is still guessing`,
          h('span', { class: 'dots-thinking' })),
      ));
      return;
    }

    // decide winner: solved beats unsolved; fewer guesses; then faster
    let winner = null;
    if (mine.solved !== theirs.solved) winner = mine.solved ? me : partner;
    else if (mine.solved && theirs.solved) {
      if (mine.guesses !== theirs.guesses) winner = mine.guesses < theirs.guesses ? me : partner;
      else if (mine.ms !== theirs.ms) winner = mine.ms < theirs.ms ? me : partner;
    }

    if (session.status === 'active') {
      const result = winner ? { winner, draw: false, reason: 'win' } : { winner: null, draw: true, reason: 'draw' };
      const score = { diya: 0, divyam: 0 };
      if (mine.solved) score[me] = 7 - mine.guesses;
      if (theirs.solved) score[partner] = 7 - theirs.guesses;
      session.end(session.makeRecord(result, score));
    }

    const myWord = mySecretFor().word;
    const theirWord = theirSecretFor().word;
    const line = (who, name, summary, word) => h('div', { class: `sticker row gap-sm p-${who}`, style: 'padding:12px 14px;' },
      h('span', { class: 'avatar avatar--sm' }, emojiOf(who)),
      h('span', { class: 'stack grow' },
        h('span', { style: 'font-weight:620;' }, summary.solved ? `${name}: solved in ${summary.guesses} (${(summary.ms / 1000).toFixed(0)}s)` : `${name}: defeated 💀`),
        h('span', { class: 'small sub' }, `their word was "${word.toUpperCase()}"`),
      ),
      h('span', { style: 'font-size:22px;' }, summary.solved ? '🟩' : '⬛'),
    );

    const rematchBtn = h('button', {
      class: 'btn btn--me btn--big',
      onclick: async (e) => {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'rematch offered 💌';
        heartBurst(e.currentTarget);
        await sendInvite(gameMeta.id, {});
      },
    }, 'rematch 💕');
    unsubs.push(invites.on('declined', () => { rematchBtn.disabled = false; rematchBtn.textContent = 'rematch 💕'; }));

    bodyEl.append(h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;padding-bottom:30px;' },
      h('div', { style: 'font-size:52px;' }, winner === null ? '🤝' : winner === me ? '🎉' : '😤'),
      h('div', { class: 'title-lg' }, winner === null ? 'a perfect tie!' : `${nameOf(winner)} wins the duel!`),
      line(me, 'you', mine, theirWord),
      line(partner, nameOf(partner), theirs, myWord),
      h('div', { class: 'stack gap-xs', style: 'width:min(280px,100%);' },
        connection.partnerPresent() ? rematchBtn : null,
        h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
      ),
    ));
    if (winner === me) heartBurst(bodyEl, { count: 8 });
  }

  const renderSpectate = () => {
    clear(spectateEl);
    if (mySummary() || !theirSecretFor() || !mySecretFor()) return;
    const rows = [];
    for (let n = 1; n <= 6; n++) {
      const g = session.getResult('result', n, partner);
      if (g) rows.push(g);
    }
    if (!rows.length) return;
    spectateEl.append(h('span', { class: 'row gap-xs', style: 'align-items:center;' },
      h('span', { class: 'small sub' }, `${emojiOf(partner)} ${rows.length}`),
      miniBoard(rows.length, rows[rows.length - 1].marks),
    ));
  };

  unsubs.push(session.onResult(({ channel, round }) => {
    if (destroyed) return;
    renderSpectate();
    if (channel === 'submit') render();
    else if (round === 99) render();
  }));
  unsubs.push(session.events.on('resynced', () => { render(); renderSpectate(); }));
  unsubs.push(session.events.on('ended', ({ record }) => {
    if (record?.result?.reason === 'abandoned') navigate('');
  }));

  loadWordle().then((w) => {
    if (destroyed) return;
    wordle = w;
    render();
    renderSpectate();
  });
  if (session.status === 'active') session.resync();

  return () => {
    destroyed = true;
    surface?.destroy?.();
    unsubs.forEach((u) => u());
  };
}

export default {
  id: 'wordleduel',
  engine: 'custom',
  css: WORDLE_CSS,
  blurb: 'you pick her word, she picks yours. fewest guesses wins.',
  mountCustom,
};
