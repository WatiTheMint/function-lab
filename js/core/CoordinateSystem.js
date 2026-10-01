// CoordinateSystem — преобразование «мир ↔ экран», масштаб, сдвиг и шаг сетки.
// Масштабы по осям (sx, sy — пикселей на единицу) могут различаться: так удобно
// показывать, например, x² + 2 при x ∈ [−5; 5]. Колесо мыши меняет оба одинаково.

import { EventEmitter } from './EventEmitter.js';
import { tickDecimals } from './format.js';

export const MIN_SCALE = 1e-3;
export const MAX_SCALE = 1e6;
const MAX_CENTER = 1e7;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** «Круглый» шаг 1·10ⁿ, 2·10ⁿ или 5·10ⁿ не меньше raw. */
export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw * (1 - 1e-9)) return m * p;
  return 10 * p;
}

export class CoordinateSystem extends EventEmitter {
  constructor() {
    super();
    this.width = 1;
    this.height = 1;
    this.cx = 0;
    this.cy = 0;
    this.sx = 40;
    this.sy = 40;
  }

  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.emit('resize');
    this.emit('change');
  }

  x2px(x) { return this.width / 2 + (x - this.cx) * this.sx; }
  y2px(y) { return this.height / 2 - (y - this.cy) * this.sy; }
  px2x(px) { return this.cx + (px - this.width / 2) / this.sx; }
  px2y(py) { return this.cy - (py - this.height / 2) / this.sy; }

  get bounds() {
    return { xMin: this.px2x(0), xMax: this.px2x(this.width), yMin: this.px2y(this.height), yMax: this.px2y(0) };
  }

  get view() {
    return { cx: this.cx, cy: this.cy, sx: this.sx, sy: this.sy };
  }

  setView({ cx = this.cx, cy = this.cy, sx = this.sx, sy = this.sy }) {
    const next = {
      cx: clamp(cx, -MAX_CENTER, MAX_CENTER),
      cy: clamp(cy, -MAX_CENTER, MAX_CENTER),
      sx: clamp(sx, MIN_SCALE, MAX_SCALE),
      sy: clamp(sy, MIN_SCALE, MAX_SCALE),
    };
    if ([next.cx, next.cy, next.sx, next.sy].some((v) => !Number.isFinite(v))) return;
    Object.assign(this, next);
    this.emit('change');
  }

  panBy(dxPx, dyPx) {
    this.setView({ cx: this.cx - dxPx / this.sx, cy: this.cy + dyPx / this.sy });
  }

  /** Масштабирование относительно точки экрана (px, py): она остаётся на месте. */
  zoomAt(px, py, factor) {
    const wx = this.px2x(px), wy = this.px2y(py);
    let f = factor;
    // не даём одной оси «упереться» в предел, а другой — продолжить: сохраняем пропорции
    f = Math.min(f, MAX_SCALE / this.sx, MAX_SCALE / this.sy);
    f = Math.max(f, MIN_SCALE / this.sx, MIN_SCALE / this.sy);
    const sx = this.sx * f, sy = this.sy * f;
    this.setView({ sx, sy, cx: wx - (px - this.width / 2) / sx, cy: wy + (py - this.height / 2) / sy });
  }

  /** Вид, при котором прямоугольник целиком помещается на экране. */
  viewForRect(xMin, xMax, yMin, yMax, { uniform = true, pad = 0.06 } = {}) {
    const w = this.width * (1 - 2 * pad), h = this.height * (1 - 2 * pad);
    let sx = w / Math.max(1e-9, xMax - xMin);
    let sy = h / Math.max(1e-9, yMax - yMin);
    if (uniform) sx = sy = Math.min(sx, sy);
    return { cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2, sx, sy };
  }

  fitRect(xMin, xMax, yMin, yMax, opts) {
    this.setView(this.viewForRect(xMin, xMax, yMin, yMax, opts));
  }

  /** Шаг делений по x: как можно чаще, но так, чтобы подписи не налезали друг на друга. */
  tickStepX() {
    const maxAbs = Math.max(Math.abs(this.px2x(0)), Math.abs(this.px2x(this.width)));
    const intDigits = Math.max(1, Math.floor(Math.log10(Math.max(1, maxAbs))) + 1);
    let step = niceStep(36 / this.sx);
    for (let i = 0; i < 8; i++) {
      const dec = tickDecimals(step);
      const chars = Math.min(10, intDigits + (dec ? dec + 1 : 0) + 1);
      if (step * this.sx >= chars * 7 + 16) break;
      step = niceStep(step * 1.01);
    }
    return step;
  }

  tickStepY() { return niceStep(32 / this.sy); }

  /** Сколько знаков показывать у координат курсора при текущем масштабе. */
  decimalsX() { return clamp(Math.ceil(Math.log10(this.sx)) , 0, 6); }
  decimalsY() { return clamp(Math.ceil(Math.log10(this.sy)), 0, 6); }
}
