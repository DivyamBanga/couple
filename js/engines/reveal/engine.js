// Reveal engine: the "answer blind → reveal together" loop shared by all
// question games. Round r is complete when both players' submissions exist;
// each side pages through at their own reading pace. Answers travel as soon
// as they're made but the UI never shows the partner's answer early —
// couple-trust model (same as card hands), documented in the plan.
import { h, clear, heartBurst, vibrate } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { store, K } from '../../core/storage.js';
import { sample } from '../../core/prng.js';
import { rngFor } from '../../core/prng.js';

// Shared deck sampler: prefer unseen items; top up from the full pool when
// the unseen well runs dry.
export function makeSampler(deck, count) {
  return (seed, opts, seen = []) => {
    const rng = rngFor(seed, 'deck');
    const all = deck.items.map((i) => i.id);
    const unseen = all.filter((id) => !seen.includes(id));
    const picked = sample(unseen, Math.min(count, unseen.length), rng);
    if (picked.length < count) {
      const rest = all.filter((id) => !picked.includes(id));
      picked.push(...sample(rest, count - picked.length, rng));
    }
    return picked;
  };
}

export function markSeen(deckId, ids) {
  const seen = store.get(K.SEEN) ?? { v: 1 };
  const list = seen[deckId] ?? [];
  for (const id of ids) if (!list.includes(id)) list.push(id);
  while (list.length > 600) list.shift();
  seen[deckId] = list;
  store.set(K.SEEN, seen);
}

export function mountReveal(el, mod, gameMeta, session) {
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let destroyed = false;

  const itemIds = session.itemIds ?? mod.sampleItems(session.seed, session.opts ?? {}, []);
  const rounds = itemIds.length;
  markSeen(mod.deckId, itemIds);

  const ctx = {
    session, me, partner, gameMeta, rounds,
    myName: nameOf(me), partnerName: nameOf(partner),
    myEmoji: emojiOf(me), partnerEmoji: emojiOf(partner),
    haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); },
  };

  const mySubmit = (r) => session.getResult('submit', r, me);
  const theirSubmit = (r) => session.getResult('submit', r, partner);
  const roundComplete = (r) => mySubmit(r) !== undefined && theirSubmit(r) !== undefined;

  let cursor = 0;
  while (cursor < rounds && mySubmit(cursor) !== undefined && roundComplete(cursor)) cursor++;
  // if I answered but she hasn't, sit on that round's waiting view
  if (cursor < rounds && mySubmit(cursor) !== undefined && !roundComplete(cursor)) { /* stay */ }

  const totals = () => {
    const t = { diya: 0, divyam: 0, matches: 0, extra: {} };
    for (let r = 0; r < rounds; r++) {
      if (!roundComplete(r)) continue;
      const item = mod.getItem(itemIds[r]);
      const s = mod.scoreRound?.(item, { [me]: mySubmit(r), [partner]: theirSubmit(r) }, r, ctx);
      if (s?.points) { t.diya += s.points.diya ?? 0; t.divyam += s.points.divyam ?? 0; }
      if (s?.match) t.matches++;
    }
    return t;
  };

  // ── chrome ──────────────────────────────────────────────────
  const progressEl = h('div', { class: 'rv-progress' });
  const bodyEl = h('div', { class: 'stack gap-md grow', style: 'justify-content:flex-start;padding-top:4px;' });
  const scoreEl = h('div', {});

  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', {
        class: 'back-btn', 'aria-label': 'home',
        onclick: async () => {
          if (session.status === 'active' && cursor < rounds) {
            if (await confirmModal('leave this round? it counts for nothing 🥀', { title: 'leave?', yes: 'leave', danger: true })) {
              session.abandon('quit');
              navigate('');
            }
          } else navigate('');
        },
      }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
      scoreEl,
    ),
    progressEl,
    bodyEl,
  ));

  const renderProgress = () => {
    clear(progressEl);
    for (let r = 0; r < rounds; r++) {
      const cls = ['rv-dot'];
      if (roundComplete(r)) cls.push('rv-dot--done');
      if (r === cursor && cursor < rounds) cls.push('rv-dot--now');
      progressEl.append(h('span', { class: cls.join(' ') }));
    }
  };

  const renderScore = () => {
    clear(scoreEl);
    if (!mod.scored) return;
    const t = totals();
    scoreEl.append(h('span', { class: 'small', style: 'font-weight:650;white-space:nowrap;' },
      h('span', { class: 'p-diya', style: 'color:var(--rose-deep);' }, String(t.diya)),
      h('span', { class: 'faint' }, ' – '),
      h('span', { class: 'p-divyam', style: 'color:var(--peri-deep);' }, String(t.divyam)),
    ));
  };

  // ── views ───────────────────────────────────────────────────
  const render = () => {
    if (destroyed) return;
    renderProgress();
    renderScore();
    clear(bodyEl);

    if (session.status !== 'active' && cursor >= rounds) return renderSummary(true);
    if (cursor >= rounds) return renderSummary(false);

    const item = mod.getItem(itemIds[cursor]);
    const mine = mySubmit(cursor);
    const theirs = theirSubmit(cursor);

    const promptZone = h('div', {});
    mod.renderPrompt(promptZone, item, cursor, ctx);
    bodyEl.append(promptZone);

    if (mine === undefined) {
      const inputZone = h('div', { class: 'stack gap-sm' });
      mod.renderInput(inputZone, item, cursor, ctx, (data) => {
        if (mySubmit(cursor) !== undefined) return;
        session.putResult('submit', cursor, data);
        ctx.haptic(12);
        render();
      });
      bodyEl.append(inputZone);
    } else if (theirs === undefined) {
      bodyEl.append(h('div', { class: 'rv-waiting' },
        h('div', { style: 'font-size:40px;animation:bob 2.6s ease-in-out infinite;' }, ctx.partnerEmoji),
        h('div', { class: 'hand', style: 'font-size:18px;margin-top:6px;' }, `${ctx.partnerName} is thinking`,
          h('span', { class: 'dots-thinking' })),
        connection.partnerPresent() ? null : h('div', { class: 'small faint mt-sm' }, `(she's offline — your answer is saved and waiting)`),
      ));
    } else {
      const revealZone = h('div', { class: 'stack gap-md' });
      mod.renderReveal(revealZone, item, cursor, mine, theirs, ctx);
      const isLast = cursor === rounds - 1;
      revealZone.append(h('button', {
        class: 'btn btn--me btn--big', style: 'align-self:center;min-width:200px;',
        onclick: () => { cursor++; render(); },
      }, isLast ? 'see the damage 🏁' : 'next →'));
      bodyEl.append(revealZone);
    }
  };

  function renderSummary(alreadyEnded) {
    renderProgress();
    renderScore();
    clear(bodyEl);

    const allDone = Array.from({ length: rounds }, (_, r) => r).every(roundComplete);
    if (!allDone) {
      const done = Array.from({ length: rounds }, (_, r) => r).filter((r) => theirSubmit(r) !== undefined).length;
      bodyEl.append(h('div', { class: 'rv-waiting' },
        h('div', { style: 'font-size:40px;animation:bob 2.6s ease-in-out infinite;' }, ctx.partnerEmoji),
        h('div', { class: 'hand', style: 'font-size:18px;margin-top:6px;' },
          `${ctx.partnerName} is still on question ${Math.min(done + 1, rounds)} of ${rounds}`,
          h('span', { class: 'dots-thinking' })),
      ));
      return;
    }

    const t = totals();
    if (!alreadyEnded && session.status === 'active') {
      let result;
      if (!mod.scored || t.diya === t.divyam) result = { winner: null, draw: true, reason: 'draw' };
      else result = { winner: t.diya > t.divyam ? 'diya' : 'divyam', draw: false, reason: 'win' };
      session.end(session.makeRecord(result, mod.scored ? { diya: t.diya, divyam: t.divyam } : null));
    }

    const verdict = mod.summaryLine?.(t, ctx) ?? (mod.scored
      ? (t.diya === t.divyam ? 'perfectly matched. suspicious.' : `${nameOf(t.diya > t.divyam ? 'diya' : 'divyam')} takes it 🏆`)
      : 'that was lovely. again?');

    const playAgain = h('button', {
      class: 'btn btn--me btn--big',
      onclick: async (e) => {
        playAgain.disabled = true;
        playAgain.textContent = 'invite sent 💌';
        heartBurst(e.currentTarget);
        await sendInvite(gameMeta.id, {});
      },
    }, 'play again 💕');
    unsubs.push(invites.on('declined', () => { playAgain.disabled = false; playAgain.textContent = 'play again 💕'; }));

    bodyEl.append(h('div', { class: 'stack center gap-md grow', style: 'justify-content:center;padding-bottom:40px;' },
      h('div', { class: 'sticker rv-card', style: 'width:min(360px,100%);' },
        h('div', { style: 'font-size:46px;' }, mod.scored && t.diya !== t.divyam ? '🏆' : '💞'),
        mod.scored ? h('div', { class: 'title-lg mt-sm' }, `${t.diya} – ${t.divyam}`) : null,
        h('div', { class: 'rv-verdict mt-sm' }, verdict),
        t.matches > 0 ? h('div', { class: 'small sub mt-sm' }, `you matched on ${t.matches} of ${rounds}`) : null,
      ),
      h('div', { class: 'stack gap-xs', style: 'width:min(280px,100%);' },
        connection.partnerPresent() ? playAgain : null,
        h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
      ),
    ));
    if (mod.scored ? (t.diya === t.divyam ? true : (t.diya > t.divyam ? 'diya' : 'divyam') === me) : true) {
      heartBurst(bodyEl, { count: 6 });
    }
  }

  // ── events ──────────────────────────────────────────────────
  // A partner answer arriving while I'm STILL PICKING must not rebuild the
  // input view (it would wipe my in-progress selection) — the answer stays
  // hidden until I submit anyway. Just refresh the passive chrome.
  unsubs.push(session.onResult(() => {
    if (cursor < rounds && mySubmit(cursor) === undefined) {
      renderProgress();
      renderScore();
    } else render();
  }));
  unsubs.push(session.events.on('resynced', () => render()));
  unsubs.push(session.events.on('ended', ({ record }) => {
    if (record?.result?.reason === 'abandoned') navigate('');
    else render();
  }));
  unsubs.push(connection.onPartner(({ present }) => {
    if (present) toast(`${ctx.partnerName} is back 💞`, { ms: 1500 });
    render();
  }));

  render();
  if (session.status === 'active') session.resync();

  return () => {
    destroyed = true;
    unsubs.forEach((u) => u());
  };
}
