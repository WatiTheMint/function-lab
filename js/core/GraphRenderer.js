// GraphRenderer — рисование координатной плоскости на Canvas: сетка, оси со стрелками,
// подписи делений и графики. Разрывы (1/x, tg x, floor x) определяются адаптивным
// дроблением отрезков: если скачок не исчезает при уменьшении шага — линия прерывается.

import { formatTick } from './format.js';

const SAMPLE_PX = 1.5;        // шаг выборки по экрану
const MAX_DEPTH = 12;         // глубина дробления (≈ 1/4000 пикселя)
const SMOOTH_PX = 2.5;        // отрезок короче — рисуем как есть
const BUDGET = 60000;         // предел вычислений на одну функцию за кадр
const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
const SANS = '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif';

const mantissaOf = (step) => Math.round(step / 10 ** Math.floor(Math.log10(step) + 1e-9));

export class GraphRenderer {
  constructor(canvas, cs) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cs = cs;
    this.dpr = 1;
    this.scene = null;
    this.raf = 0;
    this.now = performance.now();
    this.readColors();
    cs.on('change', () => this.requestRender());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  readColors() {
    const st = getComputedStyle(document.documentElement);
    const v = (name) => st.getPropertyValue(name).trim();
    this.colors = {
      bg: v('--plane-bg'),
      gridMinor: v('--grid-minor'),
      gridMajor: v('--grid-major'),
      axis: v('--axis'),
      tick: v('--tick-label'),
      halo: v('--label-halo'),
      accent: v('--accent'),
      success: v('--success'),
      danger: v('--danger'),
      warning: v('--warning'),
      text: v('--text'),
      muted: v('--muted'),
      surface: v('--surface'),
      fn: Array.from({ length: 8 }, (_, i) => v(`--fn-${i + 1}`)),
    };
    this.requestRender();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.cs.setSize(rect.width, rect.height);
    this.render();
  }

  destroy() {
    this.observer.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setScene(scene) {
    this.scene = scene;
    this.requestRender();
  }

  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      this.render(t);
    });
  }

  render(now = performance.now()) {
    const { ctx, cs } = this;
    this.now = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, cs.width, cs.height);
    this.drawGrid();
    this.scene?.drawBackground?.(this, now);
    this.drawAxes();
    this.scene?.draw?.(this, now);
  }

  // ─────────────────────────── Сетка и оси ───────────────────────────

  drawGrid() {
    const { ctx, cs } = this;
    const { xMin, xMax, yMin, yMax } = cs.bounds;
    const stepX = cs.tickStepX(), stepY = cs.tickStepY();
    const divX = mantissaOf(stepX) === 2 ? 4 : 5;
    const divY = mantissaOf(stepY) === 2 ? 4 : 5;
    const lines = (minor, div, lo, hi, vertical, major) => {
      ctx.beginPath();
      const k0 = Math.ceil(lo / minor), k1 = Math.floor(hi / minor);
      if (k1 - k0 > 4000) return;
      for (let k = k0; k <= k1; k++) {
        const isMajor = k % div === 0;
        if (isMajor !== major) continue;
        const v = k * minor;
        if (vertical) {
          const px = Math.round(cs.x2px(v)) + 0.5;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, cs.height);
        } else {
          const py = Math.round(cs.y2px(v)) + 0.5;
          ctx.moveTo(0, py);
          ctx.lineTo(cs.width, py);
        }
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.colors.gridMinor;
    lines(stepX / divX, divX, xMin, xMax, true, false);
    lines(stepY / divY, divY, yMin, yMax, false, false);
    ctx.strokeStyle = this.colors.gridMajor;
    lines(stepX / divX, divX, xMin, xMax, true, true);
    lines(stepY / divY, divY, yMin, yMax, false, true);
  }

  drawAxes() {
    const { ctx, cs } = this;
    const W = cs.width, H = cs.height;
    const ox = cs.x2px(0), oy = cs.y2px(0);
    const xAxis = oy >= 0 && oy <= H;
    const yAxis = ox >= 0 && ox <= W;
    const axisY = Math.round(oy) + 0.5, axisX = Math.round(ox) + 0.5;
    ctx.strokeStyle = this.colors.axis;
    ctx.fillStyle = this.colors.axis;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    if (xAxis) { ctx.moveTo(0, axisY); ctx.lineTo(W - 2, axisY); }
    if (yAxis) { ctx.moveTo(axisX, H); ctx.lineTo(axisX, 2); }
    ctx.stroke();
    // стрелки
    if (xAxis) this.arrow(W - 1, axisY, 1, 0);
    if (yAxis) this.arrow(axisX, 1, 0, -1);
    ctx.font = `italic 600 14px ${SANS}`;
    ctx.textBaseline = 'alphabetic';
    if (xAxis) { ctx.textAlign = 'right'; this.haloText('x', W - 6, axisY - 9, this.colors.axis); }
    if (yAxis) { ctx.textAlign = 'left'; this.haloText('y', axisX + 9, 15, this.colors.axis); }

    // деления и подписи
    const stepX = cs.tickStepX(), stepY = cs.tickStepY();
    const { xMin, xMax, yMin, yMax } = cs.bounds;
    ctx.font = `500 11px ${MONO}`;
    const labelY = Math.min(Math.max(oy + 6, 4), H - 17);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1.25;
    for (let k = Math.ceil(xMin / stepX); k <= Math.floor(xMax / stepX); k++) {
      if (k === 0) continue;
      const v = k * stepX;
      const px = cs.x2px(v);
      if (px < 10 || px > W - 26) continue;
      if (xAxis) {
        ctx.beginPath();
        ctx.moveTo(Math.round(px) + 0.5, axisY - 3);
        ctx.lineTo(Math.round(px) + 0.5, axisY + 3);
        ctx.strokeStyle = this.colors.axis;
        ctx.stroke();
      }
      this.haloText(formatTick(v, stepX), px, labelY, this.colors.tick);
    }
    ctx.textBaseline = 'middle';
    const labels = [];
    for (let k = Math.ceil(yMin / stepY); k <= Math.floor(yMax / stepY); k++) {
      if (k === 0) continue;
      const v = k * stepY;
      const py = cs.y2px(v);
      if (py < 22 || py > H - 10) continue;
      labels.push({ text: formatTick(v, stepY), py });
      if (yAxis) {
        ctx.beginPath();
        ctx.moveTo(axisX - 3, Math.round(py) + 0.5);
        ctx.lineTo(axisX + 3, Math.round(py) + 0.5);
        ctx.strokeStyle = this.colors.axis;
        ctx.stroke();
      }
    }
    const widest = Math.max(0, ...labels.map((l) => ctx.measureText(l.text).width));
    let lx = ox - 7;
    ctx.textAlign = 'right';
    if (lx - widest < 4) { lx = 6; ctx.textAlign = 'left'; }
    if (lx > W - 6) lx = W - 6;
    for (const l of labels) this.haloText(l.text, lx, l.py, this.colors.tick);
    if (xAxis && yAxis) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      this.haloText('0', ox - 6, oy + 6, this.colors.tick);
    }
  }

  arrow(x, y, dx, dy) {
    const { ctx } = this;
    const s = 7, w = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * s - dy * w, y - dy * s + dx * w);
    ctx.lineTo(x - dx * s + dy * w, y - dy * s - dx * w);
    ctx.closePath();
    ctx.fill();
  }

  haloText(text, x, y, color) {
    const { ctx } = this;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.colors.halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // ─────────────────────────── Графики ───────────────────────────

  /**
   * График y = f(x).
   * style: { color, width, alpha, dash, glow, reveal (0..1 — анимация появления), xMin, xMax }
   */
  plotFunction(f, style = {}) {
    const { ctx, cs } = this;
    const W = cs.width, H = cs.height;
    const lo = Math.max(cs.px2x(-2), style.xMin ?? -Infinity);
    const hi = Math.min(cs.px2x(W + 2), style.xMax ?? Infinity);
    if (!(hi > lo)) return;
    const n = Math.max(2, Math.ceil((cs.x2px(hi) - cs.x2px(lo)) / SAMPLE_PX));
    const dx = (hi - lo) / n;
    const LIM = H * 40;
    const syc = (y) => Math.max(-LIM, Math.min(H + LIM, cs.y2px(y)));
    let budget = BUDGET;
    let pen = false;
    const ev = (x) => {
      budget--;
      const y = f(x);
      return Number.isFinite(y) ? y : NaN;
    };
    const to = (x, y) => {
      const px = cs.x2px(x), py = syc(y);
      if (pen) ctx.lineTo(px, py);
      else { ctx.moveTo(px, py); pen = true; }
    };
    const segment = (xa, ya, xb, yb, depth) => {
      const fa = ya === ya, fb = yb === yb;
      if (!fa && !fb) { pen = false; return; }
      if (fa && fb) {
        const pa = cs.y2px(ya), pb = cs.y2px(yb);
        if ((pa < -H && pb < -H) || (pa > 2 * H && pb > 2 * H)) { to(xb, yb); return; }
        if (Math.abs(pb - pa) <= SMOOTH_PX || budget <= 0) { to(xb, yb); return; }
        if (depth >= MAX_DEPTH) { pen = false; to(xb, yb); return; } // разрыв
      } else if (depth >= MAX_DEPTH || budget <= 0) {
        pen = false;
        if (fb) to(xb, yb);
        return;
      }
      const xm = (xa + xb) / 2;
      const ym = ev(xm);
      segment(xa, ya, xm, ym, depth + 1);
      segment(xm, ym, xb, yb, depth + 1);
    };

    ctx.save();
    if (style.reveal !== undefined && style.reveal < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, W * Math.max(0, style.reveal), H);
      ctx.clip();
    }
    ctx.beginPath();
    let x0 = lo, y0 = ev(lo);
    if (y0 === y0) to(x0, y0);
    for (let i = 1; i <= n; i++) {
      const x1 = lo + i * dx;
      const y1 = ev(x1);
      segment(x0, y0, x1, y1, 0);
      x0 = x1;
      y0 = y1;
    }
    this.strokePath(style);
    ctx.restore();
  }

  /** Параметрическая кривая (x(t), y(t)) — для окружностей, «лежачих» парабол и т.п. */
  plotParametric(fx, fy, t0, t1, style = {}, n = 900) {
    const { ctx, cs } = this;
    const H = cs.height, W = cs.width;
    let pen = false, lastX = 0, lastY = 0;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const x = fx(t), y = fy(t);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { pen = false; continue; }
      const px = Math.max(-W * 40, Math.min(W * 41, cs.x2px(x)));
      const py = Math.max(-H * 40, Math.min(H * 41, cs.y2px(y)));
      if (pen && Math.hypot(px - lastX, py - lastY) > Math.max(W, H)) pen = false;
      if (pen) ctx.lineTo(px, py);
      else { ctx.moveTo(px, py); pen = true; }
      lastX = px;
      lastY = py;
    }
    this.strokePath(style);
    ctx.restore();
  }

  /** Ломаная по точкам в мировых координатах. */
  plotPolyline(points, style = {}) {
    if (points.length < 2) return;
    const { ctx, cs } = this;
    ctx.save();
    ctx.beginPath();
    points.forEach((p, i) => {
      const px = cs.x2px(p.x), py = cs.y2px(p.y);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    this.strokePath(style);
    ctx.restore();
  }

  strokePath({ color = this.colors.accent, width = 2.25, alpha = 1, dash = null, glow = false } = {}) {
    const { ctx } = this;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (glow) {
      ctx.globalAlpha = 0.18 * alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width + 7;
      ctx.setLineDash([]);
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ─────────────────────────── Примитивы ───────────────────────────

  drawPoint(x, y, { color = this.colors.accent, r = 5, hollow = false, ring = 0, alpha = 1, outline = true } = {}) {
    const { ctx, cs } = this;
    const px = cs.x2px(x), py = cs.y2px(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    if (px < -50 || py < -50 || px > cs.width + 50 || py > cs.height + 50) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ring > 0) {
      ctx.beginPath();
      ctx.arc(px, py, r + ring, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * 0.18;
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    if (hollow) {
      ctx.fillStyle = this.colors.bg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
      if (outline) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.colors.bg;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSegment(x1, y1, x2, y2, { color = this.colors.accent, width = 1.5, dash = null, alpha = 1 } = {}) {
    const { ctx, cs } = this;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cs.x2px(x1), cs.y2px(y1));
    ctx.lineTo(cs.x2px(x2), cs.y2px(y2));
    this.strokePath({ color, width, dash, alpha });
    ctx.restore();
  }

  drawVLine(x, style = {}) {
    const { ctx, cs } = this;
    const px = cs.x2px(x);
    if (px < -10 || px > cs.width + 10) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, cs.height);
    this.strokePath({ width: 1.5, ...style });
    ctx.restore();
  }

  /** Прямая y = kx + b через весь экран (side: −1/1 — только левая/правая половина экрана). */
  drawLine(k, b, style = {}) {
    const { xMin, xMax } = this.cs.bounds;
    this.drawSegment(xMin - 1, k * (xMin - 1) + b, xMax + 1, k * (xMax + 1) + b, style);
  }

  /** Подпись-плашка в экранных координатах. */
  drawLabel(px, py, text, { color = this.colors.text, bg = this.colors.surface, border = null, align = 'left', baseline = 'middle', font = `500 12px ${MONO}`, pad = 6 } = {}) {
    const { ctx, cs } = this;
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width + pad * 2;
    const h = 22;
    let x = align === 'center' ? px - w / 2 : align === 'right' ? px - w : px;
    let y = baseline === 'middle' ? py - h / 2 : baseline === 'bottom' ? py - h : py;
    x = Math.max(4, Math.min(cs.width - w - 4, x));
    y = Math.max(4, Math.min(cs.height - h - 4, y));
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fillStyle = bg;
    ctx.globalAlpha = 0.94;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (border) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + pad, y + h / 2 + 0.5);
    ctx.restore();
    return { x, y, w, h };
  }
}
