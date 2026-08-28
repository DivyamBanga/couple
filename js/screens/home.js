import { h, clear } from '../core/ui/dom.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../core/identity.js';
import { GAMES, MOODS } from '../games/registry.js';
import { navigate } from '../router.js';

let unsub = [];

function greetingLine() {
  const hr = new Date().getHours();
  if (hr < 5) return 'up late together? 🌙';
  if (hr < 12) return 'good morning, cutie ☀️';
  if (hr < 17) return 'afternoon date? 🍑';
  if (hr < 22) return 'what are we playing tonight?';
  return 'one more game before bed? 🌙';
}

function tile(g) {
  return h('button', {
    class: `tile sticker${g.status === 'soon' ? ' tile--soon' : ''}`,
    onclick: () => navigate(`game/${g.id}`),
    'data-mood': g.mood,
  },
    h('span', { class: `tile__mood mood-${g.mood}` }),
    h('span', { class: 'tile__emoji' }, g.emoji),
    h('span', { class: 'tile__name' }, g.name),
    h('span', { class: 'tile__tag' }, g.tagline),
  );
}

export default {
  mount(el) {
    const me = whoAmI();
    const partner = partnerOf(me);
    let mood = sessionStorage.getItem('cpl.mood') || 'all';

    // ── header ──────────────────────────────────────────────
    const presenceSlot = h('span', { id: 'presence-slot' },
      h('span', { class: `presence p-${partner}` },
        h('span', { class: 'presence__avatar' }, emojiOf(partner)),
        h('span', { class: 'presence__dot' }),
        h('span', {}, `${nameOf(partner)} · offline`),
      ),
    );

    const head = h('div', { class: 'row gap-sm', style: 'justify-content:space-between;align-items:flex-start;' },
      h('div', { class: 'stack' },
        h('div', { class: 'hand', style: 'font-size:17px;color:var(--ink-soft);transform:rotate(-1.6deg);' }, 'div & diya dungeon'),
        h('h1', { class: 'title-xl' }, `hi ${nameOf(me)} `, h('span', { style: 'display:inline-block;animation:bob 3.5s ease-in-out infinite;' }, me === 'diya' ? '🌷' : '🫶')),
        h('div', { class: 'hand sub', style: 'font-size:18px;' }, greetingLine()),
      ),
      h('button', { class: 'back-btn', 'aria-label': 'settings', onclick: () => navigate('settings'), style: 'font-size:21px;' }, '⚙️'),
    );

    // ── today strip ─────────────────────────────────────────
    const dailies = GAMES.filter((g) => g.mood === 'daily');
    const todayStrip = h('div', { class: 'stack gap-sm mt-lg' },
      h('div', {}, h('span', { class: 'washi washi--butter' }, 'today ☀️')),
      h('div', { class: 'row gap-sm hide-scroll', style: 'overflow-x:auto;padding:6px 2px 10px;align-items:stretch;' },
        dailies.map((g) => h('button', {
          class: `sticker row gap-sm${g.status === 'soon' ? ' tile--soon' : ''}`,
          style: 'padding:12px 16px;flex:0 0 auto;min-width:210px;position:relative;',
          onclick: () => navigate(`game/${g.id}`),
        },
          h('span', { style: 'font-size:26px;' }, g.emoji),
          h('span', { class: 'stack', style: 'text-align:left;' },
            h('span', { style: 'font-weight:620;font-size:15px;' }, g.name),
            h('span', { class: 'hand sub', style: 'font-size:14px;line-height:1.1;' }, g.tagline),
          ),
        )),
      ),
    );

    // ── mood chips + grid ───────────────────────────────────
    const grid = h('div', {
      style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;padding:8px 2px 4px;',
    });

    const renderGrid = () => {
      clear(grid);
      const list = GAMES.filter((g) => (mood === 'all' ? g.mood !== 'daily' : g.mood === mood));
      list.forEach((g) => grid.append(tile(g)));
    };

    const chips = h('div', { class: 'row gap-xs hide-scroll', style: 'overflow-x:auto;padding:2px;' },
      MOODS.map((m) => h('button', {
        class: 'chip',
        'aria-pressed': String(m.id === mood),
        onclick: (e) => {
          mood = m.id;
          sessionStorage.setItem('cpl.mood', mood);
          chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
          e.currentTarget.setAttribute('aria-pressed', 'true');
          renderGrid();
        },
      }, `${m.emoji} ${m.label}`)),
    );
    renderGrid();

    const gamesSection = h('div', { class: 'stack gap-sm mt-lg' },
      h('div', { class: 'row gap-sm', style: 'justify-content:space-between;' },
        h('span', { class: 'washi' }, 'the games 🎮'),
      ),
      chips,
      grid,
    );

    // ── footer ──────────────────────────────────────────────
    const footer = h('div', { class: 'row gap-sm mt-lg wrap', style: 'justify-content:center;' },
      h('button', { class: 'btn', onclick: () => navigate('scoreboard') }, '🏆 our rivalry'),
      h('button', { id: 'nudge-btn', class: 'btn btn--round btn--me', 'aria-label': 'send a nudge', disabled: true, title: 'connects soon!' }, '💗'),
    );

    el.append(h('div', { class: 'screen stack' },
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-bottom:6px;' }, presenceSlot),
      head, todayStrip, gamesSection, footer,
    ));
  },

  unmount() {
    unsub.forEach((u) => u());
    unsub = [];
  },
};
