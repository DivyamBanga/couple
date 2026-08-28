// one! — 2-player UNO-family card battle (crazy-eights lineage).
// Full deterministic truth lives in state (deck order from the session
// seed); view() redacts the opponent's hand to a count. Console-nerd
// peeking is accepted under the couple trust model.
import { h, clear } from '../../core/ui/dom.js';
import { rngFor, shuffle } from '../../core/prng.js';
import { showModal } from '../../core/ui/modal.js';
import { nameOf, emojiOf } from '../../core/identity.js';

const COLORS = ['rose', 'butter', 'mint', 'peri'];
const SUIT = { rose: '🌷', butter: '⭐', mint: '🍀', peri: '🫧' };

// ── canonical deck: ids 0..107 ─────────────────────────────────
function buildCards() {
  const cards = [];
  for (const color of COLORS) {
    cards.push({ color, kind: 'num', n: 0 });
    for (let n = 1; n <= 9; n++) { cards.push({ color, kind: 'num', n }); cards.push({ color, kind: 'num', n }); }
    for (const kind of ['skip', 'reverse', 'draw2']) { cards.push({ color, kind }); cards.push({ color, kind }); }
  }
  for (let i = 0; i < 4; i++) cards.push({ color: null, kind: 'wild' });
  for (let i = 0; i < 4; i++) cards.push({ color: null, kind: 'wild4' });
  return cards.map((c, id) => ({ id, ...c }));
}
export const CARDS = buildCards();

const other = (who) => (who === 'diya' ? 'divyam' : 'diya');

function isLegal(card, state) {
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  if (card.color === state.currentColor) return true;
  const top = CARDS[state.discard[state.discard.length - 1]];
  if (card.kind === 'num' && top.kind === 'num' && card.n === top.n) return true;
  if (card.kind !== 'num' && card.kind === top.kind) return true;
  return false;
}

// draws n cards into hands[who] on a DRAFT state (already copied), with
// deterministic reshuffle of the discard (minus top) when the pile empties
function drawInto(st, who, n) {
  for (let i = 0; i < n; i++) {
    if (st.drawPile.length === 0) {
      if (st.discard.length <= 1) return; // nothing left anywhere
      const top = st.discard[st.discard.length - 1];
      const rest = st.discard.slice(0, -1);
      shuffle(rest, rngFor(st.seed, `reshuffle${st.reshuffles}`));
      st.drawPile = rest;
      st.discard = [top];
      st.reshuffles++;
    }
    st.hands[who].push(st.drawPile.shift());
  }
}

function copyState(state) {
  return {
    ...state,
    hands: { diya: [...state.hands.diya], divyam: [...state.hands.divyam] },
    drawPile: [...state.drawPile],
    discard: [...state.discard],
  };
}

// shared play routine for {k:'play'} and {k:'playDrawn'}
function applyPlay(st, by, cardId, color, callOne) {
  const card = CARDS[cardId];
  const opp = other(by);
  st.hands[by] = st.hands[by].filter((id) => id !== cardId);
  st.discard.push(cardId);

  if (card.kind === 'wild' || card.kind === 'wild4') {
    if (!COLORS.includes(color)) return null;
    st.currentColor = color;
  } else {
    st.currentColor = card.color;
  }

  let keepTurn = false;
  if (card.kind === 'skip' || card.kind === 'reverse') keepTurn = true;
  else if (card.kind === 'draw2') { drawInto(st, opp, 2); keepTurn = true; }
  else if (card.kind === 'wild4') { drawInto(st, opp, 4); keepTurn = true; }

  const left = st.hands[by].length;
  if (left === 0) { st.winner = by; }
  else if (left === 1 && !callOne) st.vulnerable = by;
  else if (left === 1 && callOne) st.vulnerable = st.vulnerable === by ? null : st.vulnerable;

  st.turn = keepTurn ? by : opp;
  st.lastAction = { n: st.lastAction.n + 1, by, k: 'play', cardId, callOne: !!callOne };
  return st;
}

export const logic = {
  setup(seed, opts, { first, players }) {
    const order = shuffle(CARDS.map((c) => c.id), rngFor(seed, 'deal'));
    const second = other(first);
    const hands = { [first]: order.slice(0, 7), [second]: order.slice(7, 14) };
    let rest = order.slice(14);
    let starterIdx = 0;
    while (CARDS[rest[starterIdx]].kind !== 'num') starterIdx++;
    const starter = rest[starterIdx];
    rest = rest.filter((_, i) => i !== starterIdx);
    return {
      seed,
      turn: first,
      hands,
      drawPile: rest,
      discard: [starter],
      currentColor: CARDS[starter].color,
      pendingDrawn: null,
      vulnerable: null,
      reshuffles: 0,
      winner: null,
      lastAction: { n: 0, by: null, k: 'start' },
    };
  },

  reduce(state, move, { by }) {
    if (state.winner || by !== state.turn || !move?.k) return null;
    const opp = other(by);

    if (move.k === 'catch') {
      if (state.pendingDrawn || state.vulnerable !== opp) return null;
      const st = copyState(state);
      drawInto(st, opp, 2);
      st.vulnerable = null;
      st.lastAction = { n: st.lastAction.n + 1, by, k: 'catch' };
      return st; // free action — still the catcher's turn
    }

    if (move.k === 'play') {
      if (state.pendingDrawn) return null;
      if (!state.hands[by].includes(move.cardId)) return null;
      if (!isLegal(CARDS[move.cardId], state)) return null;
      const st = copyState(state);
      if (st.vulnerable === by) st.vulnerable = null; // took an action → escaped
      return applyPlay(st, by, move.cardId, move.color, move.callOne);
    }

    if (move.k === 'draw') {
      if (state.pendingDrawn) return null;
      const st = copyState(state);
      if (st.vulnerable === by) st.vulnerable = null;
      drawInto(st, by, 1);
      const drawn = st.hands[by][st.hands[by].length - 1];
      if (drawn !== undefined && isLegal(CARDS[drawn], st)) {
        st.pendingDrawn = { by, cardId: drawn };
        st.lastAction = { n: st.lastAction.n + 1, by, k: 'draw-think' };
        // turn stays — awaiting playDrawn/keep
      } else {
        st.turn = opp;
        st.lastAction = { n: st.lastAction.n + 1, by, k: 'draw-pass' };
      }
      return st;
    }

    if (move.k === 'playDrawn') {
      if (!state.pendingDrawn || state.pendingDrawn.by !== by) return null;
      const st = copyState(state);
      const cardId = st.pendingDrawn.cardId;
      st.pendingDrawn = null;
      return applyPlay(st, by, cardId, move.color, move.callOne);
    }

    if (move.k === 'keep') {
      if (!state.pendingDrawn || state.pendingDrawn.by !== by) return null;
      const st = copyState(state);
      st.pendingDrawn = null;
      st.turn = opp;
      st.lastAction = { n: st.lastAction.n + 1, by, k: 'keep' };
      return st;
    }

    return null;
  },

  isOver(state) {
    return state.winner ? { winner: state.winner, draw: false } : null;
  },

  view(state, who) {
    const opp = other(who);
    return {
      turn: state.turn,
      myHand: [...state.hands[who]],
      oppCount: state.hands[opp].length,
      drawCount: state.drawPile.length,
      discardTop: state.discard[state.discard.length - 1],
      currentColor: state.currentColor,
      pendingDrawn: state.pendingDrawn
        ? (state.pendingDrawn.by === who ? { ...state.pendingDrawn } : { by: state.pendingDrawn.by })
        : null,
      vulnerable: state.vulnerable,
      winner: state.winner,
      lastAction: state.lastAction,
    };
  },
};

// ── ui ─────────────────────────────────────────────────────────
const GLYPH = { skip: '⛔', reverse: '🔁', draw2: '+2', wild: '✦', wild4: '+4' };

function cardEl(cardId, { small = false, back = false } = {}) {
  if (back) return h('div', { class: `one-card one-card--back${small ? ' one-card--sm' : ''}` }, '💟');
  const c = CARDS[cardId];
  const cls = ['one-card', c.color ? `one-card--${c.color}` : 'one-card--wild'];
  if (small) cls.push('one-card--sm');
  const glyph = c.kind === 'num' ? String(c.n) : GLYPH[c.kind];
  return h('div', { class: cls.join(' '), 'data-card-id': cardId },
    h('span', { class: 'one-card__corner one-card__corner--tl' }, c.color ? SUIT[c.color] : '✦'),
    h('span', { class: 'one-card__glyph' }, glyph),
    h('span', { class: 'one-card__corner one-card__corner--br' }, c.color ? SUIT[c.color] : '✦'),
  );
}

function pickColor() {
  return new Promise((resolve) => {
    const m = showModal({
      title: 'pick a color!',
      dismissible: false,
      body: h('div', { class: 'row gap-sm', style: 'justify-content:center;flex-wrap:wrap;' },
        COLORS.map((color) => h('button', {
          class: `one-colorpick one-colorpick--${color}`,
          'data-color': color,
          onclick: () => { m.close(); resolve(color); },
        }, SUIT[color])),
      ),
      actions: [],
    });
  });
}

let els = null;
let oneArmed = false;
let lastActionSeen = -1;

export const ui = {
  mount(el, ctx) {
    oneArmed = false;
    lastActionSeen = -1;
    els = {
      oppName: h('span', { style: 'font-weight:620;' }, ''),
      oppBacks: h('div', { class: 'one-fan one-fan--opp' }),
      drawPile: null,
      drawCount: h('span', { class: 'one-pilecount' }, ''),
      discardSlot: h('div', { class: 'one-discard' }),
      msg: h('div', { class: 'one-msg hand' }, ''),
      actions: h('div', { class: 'one-actions row gap-sm', style: 'justify-content:center;flex-wrap:wrap;min-height:52px;' }),
      hand: h('div', { class: 'one-fan one-fan--mine', 'data-count': '0' }),
    };

    els.drawPile = h('button', {
      class: 'one-drawpile', 'aria-label': 'draw a card',
      onclick: () => ctx.submitMove({ k: 'draw' }),
    }, cardEl(0, { back: true }), els.drawCount);

    el.append(h('div', { class: 'one-table stack grow' },
      h('div', { class: 'one-opp row gap-sm' },
        h('span', { class: `avatar avatar--sm p-${ctx.partner}` }, emojiOf(ctx.partner)),
        els.oppName,
        h('span', { class: 'grow' }),
        els.oppBacks,
      ),
      h('div', { class: 'one-center row gap-md', style: 'justify-content:center;align-items:center;' },
        els.drawPile,
        els.discardSlot,
      ),
      els.msg,
      els.actions,
      h('div', { class: 'one-handwrap' }, els.hand),
    ));
  },

  render(view, ctx) {
    const { me, partner } = ctx;
    const myTurn = ctx.myTurn() && !view.pendingDrawn;

    els.oppName.textContent = nameOf(partner);

    // opponent backs
    clear(els.oppBacks);
    const shown = Math.min(view.oppCount, 8);
    for (let i = 0; i < shown; i++) els.oppBacks.append(cardEl(0, { back: true, small: true }));
    els.oppBacks.append(h('span', { class: 'one-oppcount' }, String(view.oppCount)));
    els.oppBacks.dataset.oppCount = view.oppCount;

    // center
    els.drawCount.textContent = String(view.drawCount);
    els.drawPile.disabled = !myTurn;
    clear(els.discardSlot);
    const top = cardEl(view.discardTop);
    top.classList.add('one-card--top');
    els.discardSlot.append(top);
    els.discardSlot.className = `one-discard one-glow--${view.currentColor}`;
    els.discardSlot.dataset.cardId = view.discardTop;

    // message ticker
    const la = view.lastAction;
    if (la && la.n !== lastActionSeen) {
      lastActionSeen = la.n;
      const nm = la.by === me ? 'you' : nameOf(partner);
      const texts = {
        'play': la.callOne ? `${nm} yelled ONE! 🚨` : '',
        'draw-pass': `${nm} drew and passed 😮‍💨`,
        'draw-think': la.by === me ? '' : `${nameOf(partner)} drew a card 🤔`,
        'keep': `${nm} kept it 🤫`,
        'catch': `${nm} CAUGHT ${la.by === me ? nameOf(partner) : 'you'}! +2 cards 😤`,
      };
      els.msg.textContent = texts[la.k] ?? '';
      if (la.k === 'catch') ctx.haptic([30, 40, 30]);
    }
    if (view.vulnerable === me) els.msg.textContent = "you forgot to yell one!! 🫣 pray she doesn't notice";

    // actions
    clear(els.actions);
    if (view.myHand.length === 2 && !view.winner) {
      const btn = h('button', {
        class: `btn btn--small ${oneArmed ? 'btn--coral' : 'btn--butter'} one-onebtn${oneArmed ? ' one-onebtn--armed' : ''}`,
        onclick: () => { oneArmed = !oneArmed; ui.render(view, ctx); },
      }, oneArmed ? 'ONE! armed 🚨' : 'yell ONE! 🚨');
      els.actions.append(btn);
    }
    if (view.vulnerable === partner && ctx.myTurn() && !view.pendingDrawn) {
      els.actions.append(h('button', {
        class: 'btn btn--small btn--coral one-catchbtn',
        onclick: () => ctx.submitMove({ k: 'catch' }),
      }, `CATCH ${nameOf(partner).toUpperCase()}! 😤`));
    }
    if (view.pendingDrawn?.cardId !== undefined) {
      const drawn = view.pendingDrawn.cardId;
      els.actions.append(h('div', { class: 'row gap-sm', style: 'align-items:center;' },
        cardEl(drawn, { small: true }),
        h('button', {
          class: 'btn btn--small btn--mint one-playdrawn',
          onclick: async () => {
            const c = CARDS[drawn];
            const color = (c.kind === 'wild' || c.kind === 'wild4') ? await pickColor() : undefined;
            ctx.submitMove({ k: 'playDrawn', color, callOne: oneArmed });
            oneArmed = false;
          },
        }, 'play it ▶'),
        h('button', { class: 'btn btn--small one-keep', onclick: () => ctx.submitMove({ k: 'keep' }) }, 'keep 🤫'),
      ));
    }

    // my hand (display-sorted: color then number)
    clear(els.hand);
    els.hand.dataset.count = view.myHand.length;
    const sorted = [...view.myHand].sort((a, b) => {
      const ca = CARDS[a]; const cb = CARDS[b];
      const ci = (COLORS.indexOf(ca.color) + 9) % 9; const cj = (COLORS.indexOf(cb.color) + 9) % 9;
      if (ci !== cj) return ci - cj;
      return (ca.n ?? 10) - (cb.n ?? 10) || ca.kind.localeCompare(cb.kind);
    });
    for (const cardId of sorted) {
      const legal = myTurn && isLegal(CARDS[cardId], { currentColor: view.currentColor, discard: [view.discardTop] });
      const elCard = cardEl(cardId);
      elCard.classList.toggle('one-card--legal', legal);
      elCard.classList.add('one-card--inhand');
      elCard.addEventListener('click', async () => {
        if (!legal) { elCard.classList.remove('one-card--shake'); void elCard.offsetWidth; elCard.classList.add('one-card--shake'); return; }
        const c = CARDS[cardId];
        const color = (c.kind === 'wild' || c.kind === 'wild4') ? await pickColor() : undefined;
        ctx.submitMove({ k: 'play', cardId, color, callOne: oneArmed });
        oneArmed = false;
      });
      els.hand.append(elCard);
    }
  },

  destroy() { els = null; },
};

export const css = `
.one-table { gap: 10px; min-height: 0; }
.one-opp { padding: 4px 2px; }
.one-fan { display: flex; align-items: center; }
.one-fan--opp .one-card { margin-left: -30px; }
.one-fan--opp .one-card:first-child { margin-left: 0; }
.one-oppcount { margin-left: 8px; font-weight: 650; color: var(--ink-soft); }
.one-center { padding: 10px 0 4px; }
.one-drawpile { position: relative; transition: transform var(--t-fast) var(--bounce); }
.one-drawpile:not(:disabled):active { transform: scale(.94); }
.one-drawpile:disabled { opacity: .7; }
.one-pilecount {
  position: absolute; top: -8px; right: -8px;
  background: var(--ink); color: var(--paper);
  font-size: 12px; font-weight: 650;
  padding: 2px 8px; border-radius: 999px; border: 2px solid #fff;
}
.one-discard { position: relative; border-radius: 18px; padding: 6px; transition: box-shadow var(--t-med); }
.one-glow--rose   { box-shadow: 0 0 0 4px var(--rose-soft), 0 0 26px var(--rose-soft); }
.one-glow--butter { box-shadow: 0 0 0 4px var(--butter), 0 0 26px var(--butter); }
.one-glow--mint   { box-shadow: 0 0 0 4px var(--mint), 0 0 26px var(--mint); }
.one-glow--peri   { box-shadow: 0 0 0 4px var(--peri-soft), 0 0 26px var(--peri-soft); }
.one-msg { min-height: 24px; text-align: center; font-size: 16px; color: var(--ink-soft); }
.one-handwrap { overflow-x: auto; padding: 14px 4px 8px; margin: 0 -4px; scrollbar-width: none; }
.one-handwrap::-webkit-scrollbar { display: none; }
.one-fan--mine { padding-left: 12px; min-height: 104px; }
.one-fan--mine .one-card { margin-left: -22px; flex: none; }
.one-fan--mine .one-card:first-child { margin-left: 0; }

.one-card {
  width: 64px; height: 92px;
  border-radius: 12px;
  border: 3px solid #fff;
  box-shadow: 0 3px 8px rgba(83,51,62,.18);
  display: flex; align-items: center; justify-content: center;
  position: relative;
  font-weight: 700;
  background: #eee;
  user-select: none; -webkit-user-select: none;
  animation: one-in var(--t-med) var(--bounce) both;
}
@keyframes one-in { from { opacity: 0; transform: translateY(14px) scale(.85); } }
.one-card--sm { width: 44px; height: 62px; border-width: 2px; border-radius: 9px; }
.one-card--rose   { background: linear-gradient(150deg, #ffd7e4, var(--rose)); color: #fff; }
.one-card--butter { background: linear-gradient(150deg, #ffedc9, var(--butter-deep)); color: #fff; }
.one-card--mint   { background: linear-gradient(150deg, #d7f0e5, var(--mint-deep)); color: #fff; }
.one-card--peri   { background: linear-gradient(150deg, #d9e3fb, var(--peri)); color: #fff; }
.one-card--wild   { background: conic-gradient(var(--rose) 0 25%, var(--butter) 0 50%, var(--mint) 0 75%, var(--peri) 0); color: #fff; }
.one-card--back {
  background: repeating-linear-gradient(135deg, var(--rose-ghost) 0 10px, #fff 10px 20px);
  color: var(--rose);
  font-size: 20px;
}
.one-card__glyph { font-size: 30px; text-shadow: 0 1px 2px rgba(83,51,62,.25); }
.one-card--sm .one-card__glyph { font-size: 20px; }
.one-card__corner { position: absolute; font-size: 11px; opacity: .9; }
.one-card__corner--tl { top: 4px; left: 6px; }
.one-card__corner--br { bottom: 4px; right: 6px; transform: rotate(180deg); }
.one-card--inhand { cursor: pointer; transition: transform var(--t-fast) var(--bounce), box-shadow var(--t-fast); }
.one-card--legal { transform: translateY(-10px); box-shadow: 0 8px 18px rgba(83,51,62,.25), 0 0 0 3px var(--butter); }
.one-card--legal:hover { transform: translateY(-14px) scale(1.04); }
.one-card--top { animation: one-slam var(--t-med) var(--bounce) both; }
@keyframes one-slam { from { opacity: 0; transform: scale(1.4) rotate(-6deg); } }
.one-card--shake { animation: one-shake .3s ease; }
@keyframes one-shake { 25% { transform: translateX(-5px) rotate(-2deg); } 75% { transform: translateX(5px) rotate(2deg); } }

.one-onebtn--armed { animation: one-pulse 1s ease-in-out infinite; }
@keyframes one-pulse { 50% { transform: scale(1.06); } }
.one-colorpick {
  width: 64px; height: 64px; border-radius: 50%;
  font-size: 26px; border: 4px solid #fff;
  box-shadow: var(--shadow-puff);
  transition: transform var(--t-fast) var(--bounce);
}
.one-colorpick:active { transform: scale(.9); }
.one-colorpick--rose { background: var(--rose); }
.one-colorpick--butter { background: var(--butter); }
.one-colorpick--mint { background: var(--mint); }
.one-colorpick--peri { background: var(--peri); }
`;

export default {
  id: 'one',
  engine: 'turnbased',
  blurb: 'match colors, stack chaos, and never forget to yell ONE!',
  logic,
  ui,
  css,
  turnLabel(state, ctx) {
    if (state.pendingDrawn?.by === ctx.me) return 'play it or keep it? 🤔';
    return null;
  },
};
