// PlaneController — ввод на координатной плоскости: перетаскивание (pan), колесо и щипок (zoom),
// клавиатура, наведение. Режим-«делегат» может перехватить нажатие (например, чтобы тянуть
// вертикальную прямую или точку) — тогда плоскость не сдвигается.

import { prefersReducedMotion } from '../ui/dom.js';

const CLICK_SLOP = 4;
const WHEEL_SPEED = 0.0015;

export class PlaneController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./CoordinateSystem.js').CoordinateSystem} cs
   * @param {{ onHover?: (p: {x:number,y:number,px:number,py:number}|null) => void, onUserView?: () => void }} hooks
   */
  constructor(canvas, cs, hooks = {}) {
    this.canvas = canvas;
    this.cs = cs;
    this.hooks = hooks;
    this.delegate = null;
    this.pointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.anim = 0;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('pointerleave', () => { if (!this.drag) this.hooks.onHover?.(null); });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('keydown', (e) => this.onKey(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setDelegate(delegate) {
    this.delegate = delegate;
    this.drag = null;
    this.canvas.style.cursor = '';
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    return { px, py, x: this.cs.px2x(px), y: this.cs.px2y(py) };
  }

  onDown(e) {
    if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') return;
    this.stopAnimation();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      // второй палец: щипок отменяет перетаскивание объекта
      this.drag?.handler?.cancel?.();
      const [a, b] = [...this.pointers.values()];
      this.drag = null;
      this.pinch = { dist: Math.hypot(a.px - b.px, a.py - b.py), mid: { px: (a.px + b.px) / 2, py: (a.py + b.py) / 2 } };
      return;
    }
    if (this.pointers.size > 2) return;
    const handler = this.delegate?.hitTest?.(p, e) ?? null;
    if (handler) {
      this.drag = { kind: 'object', handler, start: p, moved: false };
      handler.start?.(p);
      this.canvas.style.cursor = handler.cursor ?? 'grabbing';
    } else {
      this.drag = { kind: 'pan', start: p, last: p, moved: false };
    }
    e.preventDefault();
  }

  onMove(e) {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.px - b.px, a.py - b.py);
      const mid = { px: (a.px + b.px) / 2, py: (a.py + b.py) / 2 };
      this.cs.panBy(mid.px - this.pinch.mid.px, mid.py - this.pinch.mid.py);
      if (this.pinch.dist > 0 && dist > 0) this.cs.zoomAt(mid.px, mid.py, dist / this.pinch.dist);
      this.pinch = { dist, mid };
      this.hooks.onUserView?.();
      return;
    }

    if (this.drag) {
      const moved = Math.hypot(p.px - this.drag.start.px, p.py - this.drag.start.py) > CLICK_SLOP;
      if (moved) this.drag.moved = true;
      if (this.drag.kind === 'object') {
        this.drag.handler.move?.(p, e);
      } else if (this.drag.moved) {
        this.cs.panBy(p.px - this.drag.last.px, p.py - this.drag.last.py);
        this.drag.last = p;
        this.canvas.style.cursor = 'grabbing';
        this.hooks.onUserView?.();
      }
      this.hooks.onHover?.(p);
      return;
    }

    // наведение
    this.delegate?.onHover?.(p);
    this.hooks.onHover?.(p);
    this.canvas.style.cursor = this.delegate?.cursorAt?.(p) ?? 'crosshair';
  }

  onUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    this.canvas.releasePointerCapture?.(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    const p = this.local(e);
    if (drag.kind === 'object') {
      if (cancelled) drag.handler.cancel?.();
      else drag.handler.end?.(p, drag.moved);
    } else if (!drag.moved && !cancelled) {
      this.delegate?.onClick?.(p, e);
    }
    this.canvas.style.cursor = this.delegate?.cursorAt?.(p) ?? 'crosshair';
  }

  onWheel(e) {
    e.preventDefault();
    this.stopAnimation();
    const p = this.local(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= this.cs.height;
    dy = Math.max(-300, Math.min(300, dy));
    this.cs.zoomAt(p.px, p.py, Math.exp(-dy * WHEEL_SPEED * (e.ctrlKey ? 2.5 : 1)));
    this.hooks.onUserView?.();
    this.hooks.onHover?.(p);
  }

  onKey(e) {
    if (this.delegate?.onKey?.(e)) return;
    const step = e.shiftKey ? 160 : 48;
    const keys = {
      ArrowLeft: () => this.cs.panBy(step, 0),
      ArrowRight: () => this.cs.panBy(-step, 0),
      ArrowUp: () => this.cs.panBy(0, step),
      ArrowDown: () => this.cs.panBy(0, -step),
      '+': () => this.zoomBy(1.4),
      '=': () => this.zoomBy(1.4),
      '-': () => this.zoomBy(1 / 1.4),
      _: () => this.zoomBy(1 / 1.4),
      0: () => this.hooks.onReset?.(),
    };
    const fn = keys[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
    this.hooks.onUserView?.();
  }

  /** Масштаб относительно центра экрана, с анимацией. */
  zoomBy(factor) {
    const { cs } = this;
    this.animateTo({ ...cs.view, sx: cs.sx * factor, sy: cs.sy * factor });
  }

  /** Плавный переход к виду (центр — линейно, масштаб — в логарифмической шкале). */
  animateTo(target, duration = 260) {
    this.stopAnimation();
    const { cs } = this;
    const from = cs.view;
    if (prefersReducedMotion() || duration <= 0) {
      cs.setView(target);
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - (1 - t) ** 3;
      cs.setView({
        cx: from.cx + (target.cx - from.cx) * e,
        cy: from.cy + (target.cy - from.cy) * e,
        sx: from.sx * (target.sx / from.sx) ** e,
        sy: from.sy * (target.sy / from.sy) ** e,
      });
      this.anim = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.anim = requestAnimationFrame(step);
  }

  stopAnimation() {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = 0;
  }
}
