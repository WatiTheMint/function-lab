// Режим «f(x)»: вертикальная прямая x = a, которую можно тянуть мышью, пальцем
// или двигать с клавиатуры. Показывает точку (a; f(a)), проекции на оси и подстановку.

import { BaseMode } from './BaseMode.js';
import { FormulaInput } from '../ui/FormulaInput.js';
import { hint } from '../ui/Hint.js';
import { h, clear, nextId, prefersReducedMotion } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { explainAt, parseConstant, parseFunction, toText } from '../core/FunctionParser.js';
import { formatNumber, formatPoint, formatValue, roundTo, tickDecimals } from '../core/format.js';

const PRESETS = ['x^2 + 2', '2x - 1', 'sqrt(x)', '1/x', 'sin(x)', '|x| - 1', 'x^3 - 3x'];
const STEPS = [0.01, 0.1, 0.5, 1];
const ANIM_MS = 360;
const SWEEP_MS = 5000;

export class InteractivePointMode extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'fx';
    this.parsed = parseFunction('x^2 + 2');
    this.a = 3;            // показываемое значение (анимируется)
    this.target = 3;       // целевое значение
    this.step = 0.5;
    this.snap = true;
    this.trailOn = false;
    this.showCurve = true;
    this.trail = [];
    this.anim = 0;
    this.sweep = null;
    this.pulseUntil = 0;
  }

  // ─────────────── Вид ───────────────

  defaultView() {
    const f = this.parsed.evaluate;
    const ys = [];
    for (let i = 0; i <= 240; i++) {
      const y = f(-6 + (12 * i) / 240);
      if (Number.isFinite(y)) ys.push(y);
    }
    const fa = f(this.target);
    if (Number.isFinite(fa)) ys.push(fa);
    ys.sort((p, q) => p - q);
    const q = (t) => ys[Math.min(ys.length - 1, Math.floor(t * (ys.length - 1)))];
    let lo = ys.length ? Math.min(0, q(0.04)) : -5;
    let hi = ys.length ? Math.max(0, q(0.75)) : 5;
    if (Number.isFinite(fa)) { lo = Math.min(lo, fa); hi = Math.max(hi, fa); }
    lo = Math.max(lo, -60);
    hi = Math.min(hi, 60);
    if (hi - lo < 6) { const c = (hi + lo) / 2; lo = c - 3; hi = c + 3; }
    const pad = (hi - lo) * 0.12;
    return { xMin: -6, xMax: 6, yMin: lo - pad, yMax: hi + pad, uniform: false };
  }

  // ─────────────── Панели ───────────────

  mount() {
    const { left, right, overlay } = this.app;
    this.formula = new FormulaInput({
      label: 'Функція',
      prefix: 'f(x) =',
      value: this.parsed.source,
      submitLabel: 'Застосувати',
      onSubmit: (parsed) => this.setFunction(parsed),
    });

    const userFns = this.app.functions.items;
    const chip = (src) => {
      const p = parseFunction(src);
      return h('button', {
        type: 'button',
        class: 'chip',
        'aria-label': `Взяти функцію f(x) = ${p.text}`,
        onClick: () => {
          this.formula.setValue(src);
          this.setFunction(p);
        },
        html: `<span class="math">${p.html}</span>`,
      });
    };

    const xId = nextId('xval');
    this.xInput = h('input', {
      id: xId,
      class: 'input mono',
      type: 'text',
      inputmode: 'decimal',
      'aria-describedby': `${xId}-err`,
      onChange: () => this.readX(),
      onKeydown: (e) => {
        if (e.key === 'Enter') this.readX();
        if (e.key === 'ArrowUp') { e.preventDefault(); this.nudge(1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); this.nudge(-1); }
      },
    });
    this.xError = h('p', { class: 'formula-feedback is-error', id: `${xId}-err`, 'aria-live': 'polite' });
    const stepId = nextId('step');
    const stepSelect = h('select', {
      id: stepId,
      class: 'input mono',
      onChange: (e) => {
        this.step = Number(e.target.value);
        this.handle?.setAttribute('aria-valuetext', this.valueText());
      },
    }, STEPS.map((s) => h('option', { value: String(s), selected: s === this.step }, formatNumber(s))));

    const sw = (label, key, onChange) => {
      const id = nextId('sw');
      return h('label', { class: 'switch', for: id },
        h('input', {
          id,
          type: 'checkbox',
          role: 'switch',
          checked: this[key],
          onChange: (e) => {
            this[key] = e.target.checked;
            onChange?.();
            this.redraw();
          },
        }),
        h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
        h('span', {}, label));
    };

    this.sweepBtn = h('button', { type: 'button', class: 'btn btn-block', onClick: () => this.toggleSweep() });
    this.updateSweepButton();

    left.append(h('div', { class: 'panel-body' },
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Функція'),
        this.formula.el,
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Готові функції' },
          userFns.map((i) => chip(i.source)),
          PRESETS.filter((src) => !userFns.some((i) => i.source === src)).map(chip))),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Значення x'),
        h('div', { class: 'stepper' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Зменшити x на крок', onClick: () => this.nudge(-1) }, icon('minus')),
          this.xInput,
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Збільшити x на крок', onClick: () => this.nudge(1) }, icon('plus'))),
        h('label', { class: 'sr-only', for: xId }, 'Значення x'),
        this.xError,
        h('div', { class: 'field' }, h('label', { class: 'label', for: stepId }, 'Крок для кнопок, стрілок і прив’язки'), stepSelect),
        h('p', { class: 'small muted' }, 'Можна вводити й вирази: −1,5 · pi/2 · √2.')),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Спостереження'),
        sw('Прив’язка до кроку під час перетягування', 'snap'),
        sw('Залишати слід із точок', 'trailOn', () => { if (!this.trailOn) this.trail = []; }),
        sw('Показувати графік функції', 'showCurve'),
        this.sweepBtn,
        h('button', { type: 'button', class: 'btn btn-ghost btn-block', onClick: () => { this.trail = []; this.redraw(); } }, icon('trash', 16), 'Очистити слід')),
      hint('fx-basics', 'Щоб зрозуміти значення f(x), обери значення x і подивись, який y відповідає цій точці. Тягни синю ручку на осі x або рухай її стрілками ← →.'),
    ));

    this.readout = h('div', { class: 'readout', 'aria-live': 'polite' });
    right.append(h('div', { class: 'panel-body' },
      h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Результат'), this.readout),
      hint('fx-trail', 'Увімкни «слід» і пробіжи по осі: з окремих точок (x; f(x)) складається графік. Графік функції — це множина всіх таких точок.'),
    ));

    // ручка прямой x = a: доступный с клавиатуры ползунок поверх плоскости
    this.handle = h('div', {
      class: 'x-handle',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Вертикальна пряма x = a',
      'aria-orientation': 'horizontal',
      onKeydown: (e) => this.onHandleKey(e),
      onPointerdown: (e) => this.onHandlePointer(e),
    });
    overlay.append(this.handle);

    this.listen(this.cs, 'change', () => this.placeHandle());
    this.describe();
    this.setA(this.target, false);
  }

  unmount() {
    super.unmount();
    cancelAnimationFrame(this.anim);
    this.stopSweep();
    this.handle = null;
  }

  setFunction(parsed) {
    this.parsed = parsed;
    this.trail = [];
    this.describe();
    this.app.resetView();
    this.update();
    return { ok: true };
  }

  readX() {
    const res = parseConstant(this.xInput.value);
    this.xInput.setAttribute('aria-invalid', res.ok ? 'false' : 'true');
    if (!res.ok) {
      this.xError.textContent = `Не вдалося прочитати x: ${res.error.message}`;
      return;
    }
    this.xError.textContent = '';
    this.setA(res.value);
  }

  nudge(dir, mult = 1) {
    const base = this.snap ? Math.round(this.target / this.step) * this.step : this.target;
    this.setA(this.clean(base + dir * this.step * mult));
  }

  clean(v) {
    return roundTo(v, Math.min(10, tickDecimals(this.step) + 2));
  }

  /** Установить x = a; animate — плавно «доехать». */
  setA(value, animate = true) {
    if (!Number.isFinite(value)) return;
    value = Math.max(-1e6, Math.min(1e6, value));
    this.target = value;
    if (this.trailOn) this.addTrail(value);
    cancelAnimationFrame(this.anim);
    const from = this.a;
    if (!animate || prefersReducedMotion() || from === value) {
      this.a = value;
      this.update();
      return;
    }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ANIM_MS);
      this.a = from + (value - from) * (1 - (1 - t) ** 3);
      this.placeHandle();
      this.redraw();
      if (t < 1) this.anim = requestAnimationFrame(tick);
      else {
        this.a = value;
        this.update();
      }
    };
    this.anim = requestAnimationFrame(tick);
    this.updateReadout();
  }

  addTrail(x) {
    const y = this.parsed.evaluate(x);
    if (!Number.isFinite(y)) return;
    if (this.trail.some((p) => Math.abs(p.x - x) < 1e-9)) return;
    this.trail.push({ x, y });
    if (this.trail.length > 800) this.trail.shift();
  }

  update() {
    this.pulseUntil = performance.now() + 900;
    this.placeHandle();
    this.updateReadout();
    this.redraw();
  }

  valueText() {
    const fa = this.parsed.evaluate(this.target);
    return `x = ${formatValue(this.target)}, f(x) ${Number.isFinite(fa) ? `= ${formatValue(fa)}` : 'не визначено'}`;
  }

  updateReadout() {
    if (!this.readout) return;
    const a = this.target;
    const aText = formatValue(a, { decimals: 6 });
    if (document.activeElement !== this.xInput) this.xInput.value = aText;
    const { value, reason } = explainAt(this.parsed.ast, a);
    const fName = `f(${aText})`;
    clear(this.readout);
    const row = (k, v, cls = '') => h('div', { class: 'readout-row' }, h('span', { class: 'k' }, k), h('span', { class: `v ${cls}` }, v));
    this.readout.append(
      row('x =', aText),
      h('div', { class: 'readout-row', html: `<span class="k">f(x) =</span><span class="v"><span class="math">${this.parsed.html}</span></span>` }),
    );
    if (Number.isFinite(value)) {
      const subst = toText(this.parsed.ast, aText);
      const result = formatValue(value);
      const approx = Math.abs(roundTo(value, 4) - value) > 1e-12 && Math.abs(value) < 1e7 ? '≈' : '=';
      this.readout.append(
        h('div', { class: 'readout-calc' }, `${fName} = ${subst} ${approx} ${result}`),
        h('div', { class: 'readout-row' }, h('span', { class: 'k' }, `y ${approx}`), h('span', { class: 'readout-big' }, result)),
        h('p', { class: 'small' }, `Точка ${formatPoint(a, value)} лежить на графіку: при x = ${aText} функція набуває значення ${result}.`),
      );
    } else {
      this.readout.append(
        h('div', { class: 'readout-calc is-undefined' }, `${fName} не визначено: ${reason}.`),
        h('p', { class: 'small muted' }, `Пряма x = ${aText} не перетинає графік — точки з таким x на ньому немає.`),
      );
    }
    this.handle?.setAttribute('aria-valuenow', String(a));
    this.handle?.setAttribute('aria-valuetext', this.valueText());
  }

  // ─────────────── Ручка и перетаскивание ───────────────

  placeHandle() {
    if (!this.handle) return;
    const { cs } = this;
    const px = cs.x2px(this.a);
    // чуть ниже оси x, чтобы не закрывать подписи делений
    const oy = cs.y2px(0) + 34;
    const py = Math.min(Math.max(oy, 26), cs.height - 24);
    const visible = px >= 0 && px <= cs.width;
    this.handle.style.left = `${Math.min(Math.max(px, 40), cs.width - 40)}px`;
    this.handle.style.top = `${py}px`;
    this.handle.style.opacity = visible ? '1' : '0.75';
    this.handle.innerHTML = `<i>x</i> = ${formatValue(this.a, { decimals: Math.max(2, tickDecimals(this.step)) })}`;
  }

  xFromPointer(px) {
    const x = this.cs.px2x(px);
    return this.snap ? this.clean(Math.round(x / this.step) * this.step) : x;
  }

  dragTo(px) {
    const x = this.xFromPointer(px);
    cancelAnimationFrame(this.anim);
    this.a = x;
    this.target = x;
    if (this.trailOn) this.addTrail(x);
    this.update();
  }

  onHandlePointer(e) {
    e.preventDefault();
    this.stopSweep();
    this.handle.setPointerCapture(e.pointerId);
    this.handle.focus();
    const rect = this.app.canvas.getBoundingClientRect();
    const move = (ev) => this.dragTo(ev.clientX - rect.left);
    const up = () => {
      this.handle?.removeEventListener('pointermove', move);
      this.handle?.removeEventListener('pointerup', up);
      this.handle?.removeEventListener('pointercancel', up);
    };
    this.handle.addEventListener('pointermove', move);
    this.handle.addEventListener('pointerup', up);
    this.handle.addEventListener('pointercancel', up);
  }

  onHandleKey(e) {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in map) {
      e.preventDefault();
      this.stopSweep();
      this.nudge(map[e.key], e.shiftKey ? 10 : 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.setA(0);
    }
  }

  /** Тянуть можно и саму прямую, не только ручку. */
  hitTest(p) {
    if (Math.abs(p.px - this.cs.x2px(this.a)) > 10) return null;
    this.stopSweep();
    return {
      cursor: 'ew-resize',
      move: (q) => this.dragTo(q.px),
      end: () => this.handle?.focus(),
    };
  }

  cursorAt(p) {
    return Math.abs(p.px - this.cs.x2px(this.a)) <= 10 ? 'ew-resize' : 'crosshair';
  }

  /** Щелчок по плоскости — перенести прямую в эту точку. */
  onClick(p) {
    this.stopSweep();
    this.setA(this.xFromPointer(p.px));
  }

  // ─────────────── «Пробежать по оси» ───────────────

  toggleSweep() {
    if (this.sweep) this.stopSweep();
    else this.startSweep();
  }

  startSweep() {
    const { xMin, xMax } = this.cs.bounds;
    const from = xMin + (xMax - xMin) * 0.04;
    const to = xMax - (xMax - xMin) * 0.04;
    const t0 = performance.now();
    this.trail = [];
    let lastStep = null;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / (prefersReducedMotion() ? 1 : SWEEP_MS));
      const x = from + (to - from) * t;
      this.a = x;
      this.target = x;
      const k = Math.round(x / this.step);
      if (k !== lastStep) {
        this.addTrail(this.clean(k * this.step));
        lastStep = k;
      }
      this.update();
      if (t < 1) this.sweep.raf = requestAnimationFrame(tick);
      else this.stopSweep();
    };
    this.sweep = { raf: requestAnimationFrame(tick) };
    this.updateSweepButton();
  }

  stopSweep() {
    if (!this.sweep) return;
    cancelAnimationFrame(this.sweep.raf);
    this.sweep = null;
    this.updateSweepButton();
    if (this.snap) this.setA(this.clean(Math.round(this.target / this.step) * this.step), false);
  }

  updateSweepButton() {
    if (!this.sweepBtn) return;
    this.sweepBtn.replaceChildren(icon(this.sweep ? 'pause' : 'play', 16), this.sweep ? 'Зупинити' : 'Пробігти по осі x');
    this.sweepBtn.setAttribute('aria-pressed', String(Boolean(this.sweep)));
  }

  // ─────────────── Рисование ───────────────

  draw(r, now) {
    const { cs } = this;
    const f = this.parsed.evaluate;
    const accent = r.colors.accent;
    const fnColor = r.colors.fn[0];
    if (this.showCurve) r.plotFunction(f, { color: fnColor, width: 2.4, alpha: 0.9 });
    for (const p of this.trail) r.drawPoint(p.x, p.y, { color: fnColor, r: 3.5, alpha: 0.85, outline: false });

    const a = this.a;
    r.drawVLine(a, { color: accent, width: 2, alpha: 0.85 });
    const fa = f(a);
    if (!Number.isFinite(fa)) return;

    const dash = [5, 5];
    r.drawSegment(a, 0, a, fa, { color: accent, width: 3.5 });
    r.drawSegment(a, fa, 0, fa, { color: accent, width: 1.75, dash, alpha: 0.9 });
    r.drawPoint(0, fa, { color: accent, r: 4 });

    const pulse = Math.max(0, (this.pulseUntil - now) / 900);
    if (pulse > 0) r.requestRender();
    r.drawPoint(a, fa, { color: accent, r: 6.5, ring: 5 + 7 * pulse });

    // подписи; если точка за краем экрана — подпись прижимается к краю
    const px = cs.x2px(a), py = cs.y2px(fa);
    const label = `${formatPoint(a, fa, { decimals: 3 })}`;
    const offscreen = py < 0 ? '↑ ' : py > cs.height ? '↓ ' : '';
    r.drawLabel(px + 14, py - 18, offscreen + label, { border: accent, font: '600 12.5px "JetBrains Mono", monospace' });
    const ox = cs.x2px(0);
    r.drawLabel(ox - 10, py, `f(x) = ${formatValue(fa, { decimals: 3 })}`, { align: 'right', color: accent, font: '600 12px "JetBrains Mono", monospace' });
  }

  onTheme() {
    this.redraw();
  }

  describe() {
    this.app.setBadge(`<span class="math-lhs">f(x) =</span><span class="math">${this.parsed.html}</span>`);
    this.app.setPlaneDescription(`Графік функції f(x) = ${this.parsed.text} і вертикальна пряма x = a, яку можна рухати.`);
  }
}
