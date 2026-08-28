// Reusable drawing surface: DPR-aware square canvas, pointer strokes with
// normalized 0..1 coordinates (device-independent), live chunk streaming,
// undo/clear, pastel tool chips. Strokes: {id, color, w, pts:[[x,y]...]}
// where w is normalized to canvas size too.
import { h, clear } from '../../core/ui/dom.js';

const COLORS = ['#53333E', '#F0699A', '#6E8FE0', '#E89B2D', '#2F8F6B', '#E8747C'];
const SIZES = [0.011, 0.019, 0.034]; // normalized brush widths
const CHUNK_MS = 60;
const CHUNK_PTS = 24;

export const SURFACE_CSS = `
.ds-wrap { width: min(88vw, 380px); margin: 0 auto; }
.ds-frame {
  position: relative;
  border-radius: var(--r-lg);
  background: #fff;
  border: 3px solid #fff;
  box-shadow: var(--shadow-puff), 0 0 0 1px rgba(83,51,62,.06);
  overflow: hidden;
}
.ds-canvas { width: 100%; display: block; touch-action: none; }
.ds-tools { display: flex; align-items: center; justify-content: center; gap: 6px; padding-top: 10px; flex-wrap: wrap; }
.ds-chip {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 0 0 1.5px rgba(83,51,62,.15), 0 2px 4px rgba(83,51,62,.15);
  transition: transform var(--t-fast) var(--bounce);
}
.ds-chip:active { transform: scale(.86); }
.ds-chip--active { transform: scale(1.18); box-shadow: 0 0 0 2.5px var(--ink); }
.ds-size {
  width: 34px; height: 34px; border-radius: 10px;
  background: #fff; border: 2px solid var(--paper-dot);
  display: grid; place-items: center;
}
.ds-size--active { border-color: var(--ink); }
.ds-size span { border-radius: 50%; background: var(--ink); display: block; }
.ds-btn {
  min-height: 34px; padding: 4px 12px;
  border-radius: 10px; background: #fff;
  border: 2px solid var(--paper-dot);
  font-size: 13px; font-weight: 600; color: var(--ink-soft);
}
.ds-btn:active { transform: scale(.94); }
`;

let strokeCounter = 0;

export function createDrawSurface(container, {
  readonly = false,
  onStrokeChunk = null,
  onStrokeDone = null,
  onUndo = null,
  onClear = null,
} = {}) {
  const strokes = new Map(); // id -> {id, color, w, pts}
  const ownIds = [];
  const lastDrawn = new Map(); // id -> index of last rendered point

  let color = COLORS[0];
  let width = SIZES[1];
  let live = null;   // in-progress own stroke
  let pending = [];  // points not yet chunked out
  let chunkTimer = null;
  let cssSize = 340;

  const wrap = h('div', { class: 'ds-wrap', 'data-strokes': '0' });
  const frame = h('div', { class: 'ds-frame' });
  const canvas = h('canvas', { class: 'ds-canvas' });
  frame.append(canvas);
  wrap.append(frame);
  const g = canvas.getContext('2d');

  const markCount = () => { wrap.dataset.strokes = String(strokes.size); };

  const size = () => {
    cssSize = Math.max(200, Math.min(wrap.clientWidth || 340, 420));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.height = `${cssSize}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    redraw();
  };

  const px = (v) => v * cssSize;

  function drawSegment(stroke, fromIdx) {
    const pts = stroke.pts;
    if (!pts.length) return;
    g.strokeStyle = stroke.color;
    g.fillStyle = stroke.color;
    g.lineWidth = Math.max(1.5, px(stroke.w));
    if (pts.length === 1) {
      g.beginPath();
      g.arc(px(pts[0][0]), px(pts[0][1]), Math.max(1, px(stroke.w) / 2), 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.beginPath();
    const start = Math.max(0, fromIdx - 1);
    g.moveTo(px(pts[start][0]), px(pts[start][1]));
    for (let i = start + 1; i < pts.length; i++) g.lineTo(px(pts[i][0]), px(pts[i][1]));
    g.stroke();
  }

  function redraw() {
    g.clearRect(0, 0, cssSize, cssSize);
    lastDrawn.clear();
    for (const s of strokes.values()) {
      drawSegment(s, 0);
      lastDrawn.set(s.id, s.pts.length);
    }
  }

  function appendPoints(stroke, newPts) {
    const from = lastDrawn.get(stroke.id) ?? 0;
    stroke.pts.push(...newPts);
    drawSegment(stroke, from);
    lastDrawn.set(stroke.id, stroke.pts.length);
  }

  // ── local drawing ───────────────────────────────────────────
  const norm = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Number(x.toFixed(3)), Number(y.toFixed(3))];
  };

  const flushChunk = (done) => {
    if (!live) return;
    if (pending.length || done) {
      onStrokeChunk?.({ id: live.id, color: live.color, w: live.w, pts: pending, done });
      pending = [];
    }
  };

  const endStroke = () => {
    if (!live) return;
    clearInterval(chunkTimer);
    chunkTimer = null;
    flushChunk(true);
    ownIds.push(live.id);
    onStrokeDone?.(live);
    live = null;
    markCount();
  };

  if (!readonly) {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const id = `s${Date.now().toString(36)}${strokeCounter++}`;
      live = { id, color, w: width, pts: [] };
      strokes.set(id, live);
      pending = [];
      const p = norm(e);
      live.pts.push(p);
      pending.push(p);
      drawSegment(live, 0);
      lastDrawn.set(id, 1);
      chunkTimer = setInterval(() => flushChunk(false), CHUNK_MS);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!live) return;
      const p = norm(e);
      const last = live.pts[live.pts.length - 1];
      if (Math.abs(p[0] - last[0]) < 0.004 && Math.abs(p[1] - last[1]) < 0.004) return;
      appendPoints(live, [p]);
      pending.push(p);
      if (pending.length >= CHUNK_PTS) flushChunk(false);
    });
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
  }

  // ── tools ───────────────────────────────────────────────────
  let tools = null;
  if (!readonly) {
    const colorChips = COLORS.map((c) => h('button', {
      class: `ds-chip${c === color ? ' ds-chip--active' : ''}`,
      style: `background:${c};`,
      'aria-label': `color ${c}`,
      onclick: (e) => {
        color = c;
        tools.querySelectorAll('.ds-chip').forEach((el) => el.classList.remove('ds-chip--active'));
        e.currentTarget.classList.add('ds-chip--active');
      },
    }));
    const sizeChips = SIZES.map((s, i) => h('button', {
      class: `ds-size${s === width ? ' ds-size--active' : ''}`,
      'aria-label': `brush size ${i + 1}`,
      onclick: (e) => {
        width = s;
        tools.querySelectorAll('.ds-size').forEach((el) => el.classList.remove('ds-size--active'));
        e.currentTarget.classList.add('ds-size--active');
      },
    }, h('span', { style: `width:${6 + i * 5}px;height:${6 + i * 5}px;` })));

    let clearArmed = false;
    const clearBtn = h('button', {
      class: 'ds-btn',
      onclick: () => {
        if (!clearArmed) {
          clearArmed = true;
          clearBtn.textContent = 'sure?';
          setTimeout(() => { clearArmed = false; clearBtn.textContent = 'clear'; }, 2000);
          return;
        }
        clearArmed = false;
        clearBtn.textContent = 'clear';
        strokes.clear();
        ownIds.length = 0;
        redraw();
        markCount();
        onClear?.();
      },
    }, 'clear');

    tools = h('div', { class: 'ds-tools' },
      ...colorChips,
      h('span', { style: 'width:6px;' }),
      ...sizeChips,
      h('button', {
        class: 'ds-btn',
        onclick: () => {
          const id = ownIds.pop();
          if (!id) return;
          strokes.delete(id);
          redraw();
          markCount();
          onUndo?.(id);
        },
      }, '↩ undo'),
      clearBtn,
    );
    wrap.append(tools);
  }

  container.append(wrap);
  size();
  const onResize = () => size();
  window.addEventListener('resize', onResize);

  return {
    el: wrap,
    addRemoteChunk(p) {
      let s = strokes.get(p.id);
      if (!s) {
        s = { id: p.id, color: p.color, w: p.w, pts: [] };
        strokes.set(p.id, s);
        lastDrawn.set(p.id, 0);
      }
      if (p.pts?.length) appendPoints(s, p.pts);
      markCount();
    },
    removeStroke(id) {
      if (strokes.delete(id)) { redraw(); markCount(); }
    },
    clearAll() {
      strokes.clear();
      ownIds.length = 0;
      redraw();
      markCount();
    },
    getStrokes: () => [...strokes.values()],
    loadStrokes(arr) {
      strokes.clear();
      for (const s of arr ?? []) strokes.set(s.id, { ...s, pts: [...s.pts] });
      redraw();
      markCount();
    },
    destroy() {
      clearInterval(chunkTimer);
      window.removeEventListener('resize', onResize);
      wrap.remove();
    },
  };
}
