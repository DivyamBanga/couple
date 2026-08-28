// Timed engine: same seeded challenge on both screens, synchronized 3-2-1,
// fully LOCAL play (latency can't touch fairness), then results exchange
// and a compare screen. Refresh mid-round resumes from a private snapshot.
import { h, clear, heartBurst, vibrate } from '../../core/ui/dom.js';
import { toast } from '../../core/ui/toast.js';
import { confirmModal } from '../../core/ui/modal.js';
import { connection } from '../../sync/connection.js';
import { MSG } from '../../sync/protocol.js';
import { sendInvite, invites } from '../../session/invites.js';
import { whoAmI, partnerOf, nameOf, emojiOf } from '../../core/identity.js';
import { navigate } from '../../router.js';
import { store, K } from '../../core/storage.js';

export function mountTimed(el, mod, gameMeta, session) {
  const me = whoAmI();
  const partner = partnerOf(me);
  const unsubs = [];
  let destroyed = false;
  let phase = 'ready'; // ready | countdown | play | waiting | compare
  let playApi = null;
  let timers = [];
  let goFallback = null;

  const challenge = mod.makeChallenge(session.seed);
  // test-only round-length override (?as= tabs set sessionStorage cpl.testDur)
  const durMs = Number(sessionStorage.getItem('cpl.testDur')) || mod.durMs;

  const ctx = {
    session, me, partner, gameMeta,
    myName: nameOf(me), partnerName: nameOf(partner),
    myEmoji: emojiOf(me), partnerEmoji: emojiOf(partner),
    haptic: (p = 14) => { if (store.get(K.SETTINGS)?.haptics ?? true) vibrate(p); },
  };

  const myResult = () => session.getResult('result', 0, me);
  const theirResult = () => session.getResult('result', 0, partner);
  const myReady = () => session.getResult('submit', 0, me);
  const theirReady = () => session.getResult('submit', 0, partner);

  const bodyEl = h('div', { class: 'stack gap-md grow', style: 'min-height:0;' });
  el.append(h('div', { class: 'screen stack grow' },
    h('div', { class: 'game-head' },
      h('button', {
        class: 'back-btn', 'aria-label': 'home',
        onclick: async () => {
          if (session.status === 'active' && !myResult()) {
            if (await confirmModal('leave this round? it counts for nothing 🥀', { title: 'leave?', yes: 'leave', danger: true })) {
              session.abandon('quit');
              navigate('');
            }
          } else navigate('');
        },
      }, '←'),
      h('span', { class: 'game-head__title grow' }, `${gameMeta.emoji} ${gameMeta.name}`),
    ),
    bodyEl,
  ));

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ── phases ──────────────────────────────────────────────────
  function render() {
    if (destroyed) return;
    clear(bodyEl);
    if (phase === 'ready') renderReady();
    else if (phase === 'countdown') { /* countdown renders itself */ }
    else if (phase === 'play') renderPlay();
    else if (phase === 'waiting') renderWaiting();
    else if (phase === 'compare') renderCompare();
  }

  function renderReady() {
    const rulesZone = h('div', {});
    mod.renderRules(rulesZone, ctx);
    const readyBtn = h('button', {
      class: 'btn btn--me btn--big', style: 'min-width:220px;',
      disabled: myReady() !== undefined,
      onclick: () => {
        session.putResult('submit', 0, { ready: Date.now() });
        ctx.haptic(12);
        render();
        maybeGo();
      },
    }, myReady() ? 'ready! waiting…' : "i'm ready! 🏁");
    bodyEl.append(
      rulesZone,
      h('div', { class: 'stack center gap-sm mt-md' },
        readyBtn,
        h('div', { class: 'hand sub' },
          theirReady() ? `${ctx.partnerName} is ready and waiting 😤` : `${ctx.partnerName} isn't ready yet`),
      ),
    );
  }

  function maybeGo() {
    if (phase !== 'ready' || !myReady() || !theirReady()) return;
    // initiator fires the gun; everyone else fires a fallback in case GO is lost
    if (me === session.first) {
      session.sendEphemeral(MSG.GO, { round: 0, inMs: 3000 });
      startCountdown(3000);
    } else {
      goFallback = setTimeout(() => { if (phase === 'ready') startCountdown(3000); }, 4000);
      timers.push(goFallback);
    }
  }

  function startCountdown(inMs) {
    if (phase !== 'ready') return;
    phase = 'countdown';
    clear(bodyEl);
    const num = h('div', { class: 'title-xl', style: 'font-size:88px;animation:pop-in var(--t-med) var(--bounce) both;' }, '3');
    bodyEl.append(h('div', { class: 'stack center grow', style: 'justify-content:center;' }, num,
      h('div', { class: 'hand sub', style: 'font-size:20px;' }, 'get ready…')));
    const t0 = performance.now();
    const tick = () => {
      if (destroyed) return;
      const left = inMs - (performance.now() - t0);
      const n = Math.ceil(left / 1000);
      if (left <= 0) { startPlay(); return; }
      if (num.textContent !== String(n)) {
        num.textContent = String(n);
        num.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = '';
        ctx.haptic(10);
      }
      timers.push(setTimeout(tick, 60));
    };
    tick();
  }

  function startPlay(resume = null) {
    phase = 'play';
    clear(bodyEl);
    clearTimers();

    const startedAt = resume?.startedAt ?? Date.now();
    if (!resume) session.setPrivate('run', { startedAt });

    const barFill = h('div', { style: 'height:100%;background:var(--me);border-radius:999px;transition:width .2s linear;width:100%;' });
    const timeLabel = h('span', { class: 'small', style: 'font-weight:650;min-width:34px;text-align:right;' });
    const playZone = h('div', { class: 'stack grow', style: 'min-height:0;' });
    bodyEl.append(
      h('div', { class: 'row gap-sm' },
        h('div', { class: 'grow', style: 'height:10px;background:var(--paper-deep);border-radius:999px;overflow:hidden;' }, barFill),
        timeLabel,
      ),
      playZone,
    );

    playApi = mod.mountPlay(playZone, challenge, ctx, {
      saveProgress: (data) => session.setPrivate('run', { startedAt, data }),
      restored: resume?.data ?? null,
    });

    const tick = () => {
      if (destroyed || phase !== 'play') return;
      const left = Math.max(0, durMs - (Date.now() - startedAt));
      barFill.style.width = `${(left / durMs) * 100}%`;
      timeLabel.textContent = `${Math.ceil(left / 1000)}s`;
      if (left <= 0) { finishPlay(); return; }
      timers.push(setTimeout(tick, 200));
    };
    tick();
  }

  function finishPlay() {
    if (phase !== 'play') return;
    phase = 'waiting';
    const result = playApi?.collect() ?? {};
    playApi?.destroy?.();
    playApi = null;
    session.setPrivate('run', null);
    session.putResult('result', 0, result);
    ctx.haptic([15, 40, 15]);
    render();
  }

  function renderWaiting() {
    if (theirResult() !== undefined) { phase = 'compare'; return renderCompare(); }
    bodyEl.append(h('div', { class: 'rv-waiting grow stack center', style: 'justify-content:center;' },
      h('div', { style: 'font-size:44px;animation:bob 2.4s ease-in-out infinite;' }, '⏳'),
      h('div', { class: 'hand', style: 'font-size:19px;margin-top:8px;' }, `time! waiting for ${ctx.partnerName}`,
        h('span', { class: 'dots-thinking' })),
    ));
  }

  function renderCompare() {
    phase = 'compare';
    clear(bodyEl);
    const mine = myResult();
    const theirs = theirResult();
    const myScore = mod.scoreOf(mine);
    const theirScore = mod.scoreOf(theirs);

    if (session.status === 'active') {
      const scores = { [me]: myScore, [partner]: theirScore };
      const result = myScore === theirScore
        ? { winner: null, draw: true, reason: 'draw' }
        : { winner: myScore > theirScore ? me : partner, draw: false, reason: 'win' };
      session.end(session.makeRecord(result, { diya: scores.diya, divyam: scores.divyam }));
    }

    const compareZone = h('div', { class: 'stack gap-md' });
    mod.renderCompare(compareZone, mine, theirs, challenge, ctx);

    const iWon = myScore > theirScore;
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

    bodyEl.append(
      h('div', { class: 'sticker rv-card' },
        h('div', { style: 'font-size:40px;' }, myScore === theirScore ? '🤝' : iWon ? '🎉' : '😤'),
        h('div', { class: 'title-lg' },
          myScore === theirScore ? "it's a tie!" : `${iWon ? ctx.myName : ctx.partnerName} wins!`),
        h('div', { class: 'scorestrip mt-sm' },
          h('span', { class: 'scorestrip__side p-diya' },
            h('span', { class: 'avatar avatar--sm' }, '🌷'),
            h('span', { class: 'scorestrip__num', style: 'color:var(--rose-deep);' }, String(me === 'diya' ? myScore : theirScore))),
          h('span', { class: 'scorestrip__vs' }, 'vs'),
          h('span', { class: 'scorestrip__side p-divyam' },
            h('span', { class: 'scorestrip__num', style: 'color:var(--peri-deep);' }, String(me === 'divyam' ? myScore : theirScore)),
            h('span', { class: 'avatar avatar--sm' }, '🐻')),
        ),
      ),
      compareZone,
      h('div', { class: 'stack gap-xs center' },
        connection.partnerPresent() ? rematchBtn : null,
        h('button', { class: 'btn', onclick: () => navigate('') }, 'back home'),
      ),
    );
    if (iWon) heartBurst(bodyEl, { count: 7 });
  }

  // ── events ──────────────────────────────────────────────────
  unsubs.push(session.onResult(({ channel }) => {
    if (destroyed) return;
    if (channel === 'submit' && phase === 'ready') { render(); maybeGo(); }
    else if (channel === 'result' && (phase === 'waiting' || phase === 'compare')) render();
  }));
  unsubs.push(session.onEphemeral(MSG.GO, () => {
    clearTimeout(goFallback);
    if (phase === 'ready' && myReady()) startCountdown(3000);
  }));
  unsubs.push(session.events.on('resynced', () => { if (phase === 'ready' || phase === 'waiting') { render(); maybeGo(); } }));
  unsubs.push(session.events.on('ended', ({ record }) => {
    if (record?.result?.reason === 'abandoned') navigate('');
  }));
  unsubs.push(connection.onPartner(({ present }) => {
    if (present && phase === 'ready') { render(); maybeGo(); }
  }));

  // ── boot: resume logic ──────────────────────────────────────
  const run = session.getPrivate('run');
  if (myResult() !== undefined) {
    phase = theirResult() !== undefined ? 'compare' : 'waiting';
    render();
  } else if (run?.startedAt) {
    const left = durMs - (Date.now() - run.startedAt);
    if (left <= 1000) {
      // round effectively over — collect what was saved
      phase = 'play';
      playApi = mod.mountPlay(h('div'), challenge, ctx, { saveProgress: () => {}, restored: run.data ?? null });
      finishPlay();
    } else {
      startPlay(run);
    }
  } else {
    render();
    maybeGo();
  }
  if (session.status === 'active') session.resync();

  return () => {
    destroyed = true;
    clearTimers();
    playApi?.destroy?.();
    unsubs.forEach((u) => u());
  };
}
