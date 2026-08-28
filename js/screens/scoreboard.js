import { h, clear } from '../core/ui/dom.js';
import { navigate } from '../router.js';
import { recordList, logEvents } from '../scoreboard/log.js';
import { tally, perGame, currentStreak, bestStreaks, mostPlayed } from '../scoreboard/stats.js';
import { nameOf, emojiOf } from '../core/identity.js';
import { gameById } from '../games/registry.js';

let unsub = null;

function bigSide(who, num) {
  return h('div', { class: `stack center gap-xs p-${who}`, style: 'flex:1;' },
    h('span', { class: 'avatar', style: 'width:54px;height:54px;font-size:26px;' }, emojiOf(who)),
    h('span', { style: 'font-size:42px;font-weight:650;line-height:1;color:var(--p-deep);' }, String(num)),
    h('span', { class: 'small sub' }, nameOf(who)),
  );
}

function winBar(g) {
  const decided = g.diya + g.divyam;
  const diyaPct = decided === 0 ? 50 : Math.round((g.diya / decided) * 100);
  return h('div', { style: 'display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--paper-deep);' },
    h('span', { style: `width:${diyaPct}%;background:var(--rose);transition:width var(--t-slow) var(--ease);` }),
    h('span', { style: `flex:1;background:var(--peri);` }),
  );
}

function render(container) {
  clear(container);
  const records = recordList();
  const t = tally(records);

  if (t.total === 0) {
    container.append(h('div', { class: 'cozy-empty sticker grow center stack' },
      h('span', { class: 'cozy-empty__emoji' }, '🏆'),
      h('div', { class: 'title-md' }, 'no games played yet'),
      h('div', { class: 'hand', style: 'font-size:17px;' }, 'go start a rivalry, you two'),
    ));
    return;
  }

  const streak = currentStreak(records);
  const best = bestStreaks(records);
  const top = mostPlayed(records);
  const pg = perGame(records);

  container.append(
    h('div', { class: 'sticker', style: 'padding:20px 16px;' },
      h('div', { class: 'row', style: 'align-items:center;' },
        bigSide('diya', t.diya),
        h('div', { class: 'stack center gap-xs', style: 'padding:0 6px;' },
          h('span', { class: 'hand', style: 'font-size:22px;color:var(--ink-faint);' }, 'vs'),
          h('span', { class: 'small faint center-text' }, `${t.total} games`, t.draws ? h('br') : null, t.draws ? `${t.draws} draws` : null),
        ),
        bigSide('divyam', t.divyam),
      ),
      streak ? h('div', { class: 'center-text mt-md', style: 'font-weight:600;' },
        `${nameOf(streak.holder)} is on a ${streak.len} win streak `,
        h('span', { style: 'display:inline-block;animation:bob 1.6s ease-in-out infinite;' }, '🔥'),
      ) : null,
    ),

    h('div', { class: 'row gap-sm mt-md wrap' },
      h('div', { class: 'sticker grow', style: 'padding:12px 14px;min-width:130px;' },
        h('div', { class: 'small sub' }, 'best streaks'),
        h('div', { style: 'font-weight:620;' }, `🌷 ${best.diya} · 🐻 ${best.divyam}`),
      ),
      top ? h('div', { class: 'sticker grow', style: 'padding:12px 14px;min-width:130px;' },
        h('div', { class: 'small sub' }, 'most played'),
        h('div', { style: 'font-weight:620;' }, `${gameById(top.gameId)?.emoji ?? '🎮'} ${gameById(top.gameId)?.name ?? top.gameId} · ${top.total}×`),
      ) : null,
    ),

    h('div', { class: 'mt-lg' }, h('span', { class: 'washi washi--peri' }, 'game by game')),
    h('div', { class: 'stack gap-sm mt-sm' },
      Object.entries(pg)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([gameId, g]) => {
          const meta = gameById(gameId);
          return h('div', { class: 'sticker', style: 'padding:12px 14px;' },
            h('div', { class: 'row gap-sm', style: 'margin-bottom:8px;' },
              h('span', { style: 'font-size:22px;' }, meta?.emoji ?? '🎮'),
              h('span', { class: 'grow', style: 'font-weight:620;' }, meta?.name ?? gameId),
              h('span', { class: 'small sub' }, `${g.diya} – ${g.divyam}${g.draws ? ` · ${g.draws}d` : ''}`),
            ),
            winBar(g),
          );
        }),
    ),
  );
}

export default {
  mount(el) {
    const container = h('div', { class: 'stack grow' });
    el.append(h('div', { class: 'screen stack grow' },
      h('div', { class: 'game-head' },
        h('button', { class: 'back-btn', onclick: () => navigate('') }, '←'),
        h('span', { class: 'game-head__title' }, '🏆 our rivalry'),
      ),
      container,
    ));
    render(container);
    unsub = logEvents.on('changed', () => render(container));
  },

  unmount() {
    unsub?.();
    unsub = null;
  },
};
