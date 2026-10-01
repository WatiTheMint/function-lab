// Тренировка «По точкам»: дана функция — поставь точки её графика, проведи кривую, проверь.
// Инструменты: постановка и перетаскивание точек, удаление, привязка к сетке,
// таблица значений (сам считаешь y), построение кривой.

import { pointsTask } from './tasks.js';
import { mathLine } from '../GraphMode.js';
import { parseConstant, toText } from '../../core/FunctionParser.js';
import { formatNumber, formatPoint, formatValue, plural } from '../../core/format.js';
import { h, clear, nextId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { hint } from '../../ui/Hint.js';

const SNAP = 0.5;
const MIN_POINTS = 5;
const MAX_POINTS = 40;
const TABLE_XS = [-3, -2, -1, 0, 1, 2, 3];
const HIT_PX = 13;

let pid = 0;

/** Сплайн Катмулла — Рома через точки, отсортированные по x. */
function spline(pts, steps = 14) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export class PointsTask {
  constructor(mode) {
    this.mode = mode;
    this.app = mode.app;
    this.snap = true;
    this.showCurve = false;
    this.solved = 0;
    this.attempts = 0;
    this.newTask(false);
  }

  get cs() { return this.app.cs; }

  newTask(remount = true) {
    this.task = pointsTask();
    this.points = [];
    this.selected = null;
    this.result = null;
    this.hover = null;
    if (remount) {
      this.mount(this.left, this.right);
      this.app.resetView();
    }
  }

  defaultView() {
    const { params } = this.task;
    const cy = Math.max(-2, Math.min(2, params.k ?? params.b ?? 0));
    return { xMin: -7, xMax: 7, yMin: cy - 6, yMax: cy + 6, uniform: true };
  }

  // ─────────────── Панели ───────────────

  mount(left, right) {
    this.left = left;
    this.right = right;
    clear(left);
    clear(right);
    const sw = (label, key) => {
      const id = nextId('sw');
      return h('label', { class: 'switch', for: id },
        h('input', { id, type: 'checkbox', role: 'switch', checked: this[key], onChange: (e) => { this[key] = e.target.checked; this.app.renderer.requestRender(); } }),
        h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', {}, label));
    };
    this.deleteBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: true, onClick: () => this.removeSelected() }, icon('trash', 14), 'Видалити точку');
    left.append(
      h('div', { class: 'task-card' },
        h('span', { class: 'task-label' }, 'Завдання'),
        h('p', {}, 'Побудуй графік функції'),
        h('div', { html: mathLine(this.task.parsed.html) })),
      h('p', { class: 'small muted' }, 'Клацни по площині — з’явиться точка. Точки можна перетягувати; вибрану точку видаляє клавіша Delete.'),
      h('div', { class: 'tool-row' },
        this.deleteBtn,
        h('button', { type: 'button', class: 'btn btn-sm', onClick: () => this.clearAll() }, icon('reset', 14), 'Очистити')),
      sw(`Прив’язка до сітки (крок ${formatNumber(SNAP)})`, 'snap'),
      sw('Сполучити точки плавною кривою', 'showCurve'),
      this.renderTable(),
      hint('train-points', 'Підстав кілька значень x у формулу, порахуй y і познач точки (x; y). Не забудь «особливі» точки — наприклад, вершину параболи.'),
    );
    this.side = h('div', { class: 'section' });
    right.append(this.side);
    this.changed();
  }

  renderTable() {
    const rows = TABLE_XS.map((x) => {
      const xIn = h('input', { type: 'text', inputmode: 'decimal', value: formatNumber(x), 'aria-label': 'x' });
      const yIn = h('input', { type: 'text', inputmode: 'decimal', placeholder: '?', 'aria-label': `y при x = ${formatNumber(x)}` });
      xIn.addEventListener('input', () => yIn.setAttribute('aria-label', `y при x = ${xIn.value}`));
      const helpBtn = h('button', {
        type: 'button',
        class: 'icon-btn is-quiet is-small',
        'aria-label': 'Підказати значення y',
        title: 'Підказати',
        onClick: () => {
          const xv = parseConstant(xIn.value);
          if (!xv.ok) { xIn.setAttribute('aria-invalid', 'true'); return; }
          const y = this.task.parsed.evaluate(xv.value);
          yIn.value = Number.isFinite(y) ? formatNumber(y) : '';
          yIn.title = `f(${formatNumber(xv.value)}) = ${toText(this.task.parsed.ast, formatNumber(xv.value))} = ${formatValue(y)}`;
          this.tableMsg.textContent = yIn.title;
        },
      }, icon('bulb', 15));
      return { xIn, yIn, el: h('tr', {}, h('td', {}, xIn), h('td', {}, yIn), h('td', {}, helpBtn)) };
    });
    this.tableRows = rows;
    this.tableMsg = h('p', { class: 'small muted', 'aria-live': 'polite' });
    return h('details', { class: 'disclosure', open: true },
      h('summary', {}, h('span', {}, 'Таблиця значень'), icon('chevronDown', 16)),
      h('div', { class: 'disclosure-body section' },
        h('p', { class: 'small muted' }, 'Порахуй y для кожного x і нанеси точки. Лампочка підкаже значення.'),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'value-table' },
            h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'x'), h('th', { scope: 'col' }, 'y'), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Підказка')))),
            h('tbody', {}, rows.map((r) => r.el)))),
        this.tableMsg,
        h('button', { type: 'button', class: 'btn btn-block', onClick: () => this.plotFromTable() }, icon('dot', 16), 'Нанести точки з таблиці')));
  }

  plotFromTable() {
    let added = 0, bad = 0;
    for (const { xIn, yIn } of this.tableRows) {
      if (!yIn.value.trim()) continue;
      const xv = parseConstant(xIn.value), yv = parseConstant(yIn.value);
      xIn.setAttribute('aria-invalid', xv.ok ? 'false' : 'true');
      yIn.setAttribute('aria-invalid', yv.ok ? 'false' : 'true');
      if (!xv.ok || !yv.ok) { bad++; continue; }
      const existing = this.points.find((p) => Math.abs(p.x - xv.value) < 1e-9);
      if (existing) existing.y = yv.value;
      else if (this.points.length < MAX_POINTS) this.points.push({ id: ++pid, x: xv.value, y: yv.value });
      added++;
    }
    this.tableMsg.textContent = bad
      ? `У ${bad} ${plural(bad, 'рядку', 'рядках', 'рядках')} не число — виправ, будь ласка.`
      : added ? `Нанесено точок: ${added}.` : 'Заповни хоча б одну клітинку y.';
    this.changed();
  }

  renderSide() {
    clear(this.side);
    const n = this.points.length;
    const distinct = new Set(this.points.map((p) => p.x)).size;
    const ready = distinct >= MIN_POINTS;
    this.side.append(
      h('div', { class: 'section-head' },
        h('h2', { class: 'section-title' }, 'Перевірка'),
        h('span', { class: 'small muted' }, `розв’язано: ${this.solved} з ${this.attempts}`)),
      h('p', { class: 'small' }, `Точок на площині: ${n}. Потрібно хоча б ${MIN_POINTS} з різними x.`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(MIN_POINTS), 'aria-valuenow': String(Math.min(distinct, MIN_POINTS)), 'aria-label': 'Готовність до перевірки' },
        h('span', { style: { width: `${Math.min(100, (distinct / MIN_POINTS) * 100)}%` } })),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: !ready || Boolean(this.result), onClick: () => this.check() }, icon('check', 16), 'Перевірити'),
    );
    if (this.result) this.side.append(...this.renderResult());
    this.side.append(h('button', { type: 'button', class: 'btn btn-block', onClick: () => this.newTask() }, icon('shuffle', 16), 'Нове завдання'));
    if (this.deleteBtn) this.deleteBtn.disabled = !this.selected;
  }

  // ─────────────── Проверка ───────────────

  check() {
    const f = this.task.parsed.evaluate;
    const groups = new Map();
    for (const p of this.points) {
      const k = Math.round(p.x * 1e9);
      groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    const dupX = [...groups.values()].filter((g) => g.length > 1).map((g) => g[0].x);
    const checked = this.points.map((p) => {
      const fx = f(p.x);
      const tol = Math.max(0.26, 0.05 * Math.abs(fx));
      const dup = dupX.some((x) => Math.abs(x - p.x) < 1e-9);
      return { ...p, fx, ok: Number.isFinite(fx) && Math.abs(p.y - fx) <= tol && !dup, dup };
    });
    const good = checked.filter((p) => p.ok).length;
    const success = good === checked.length && new Set(checked.map((p) => p.x)).size >= MIN_POINTS;
    this.attempts++;
    if (success) this.solved++;
    this.result = { checked, good, success, dupX };
    this.selected = null;
    this.renderSide();
    this.app.renderer.requestRender();
  }

  renderResult() {
    const { checked, good, success, dupX } = this.result;
    const { ast } = this.task.parsed;
    const wrong = checked.filter((p) => !p.ok && !p.dup);
    const items = [];
    items.push(h('div', { class: `verdict ${success ? 'is-correct' : 'is-wrong'}`, role: 'status' },
      h('div', { class: 'verdict-title' }, icon(success ? 'check' : 'x', 22), success ? 'Графік побудовано правильно!' : `Правильно ${good} з ${checked.length}`),
      h('p', {}, success
        ? 'Усі точки лежать на графіку функції. Зелена лінія — правильний графік.'
        : 'Зелена лінія — правильний графік. Червоні точки не лежать на ньому: пунктир показує, де має бути точка.')));
    if (dupX.length) {
      items.push(h('p', { class: 'small' }, `У кількох точок однаковий x = ${dupX.map((x) => formatNumber(x)).join(', ')}, але різні y. У функції кожному x відповідає одне значення — залиш одну точку.`));
    }
    if (wrong.length) {
      items.push(h('ul', { class: 'point-list' }, wrong.slice(0, 8).map((p) => {
        const xs = formatNumber(p.x);
        const why = Number.isFinite(p.fx)
          ? `f(${xs}) = ${toText(ast, xs)} = ${formatValue(p.fx)}`
          : `при x = ${xs} функція не визначена`;
        return h('li', {}, h('span', { class: 'bad', 'aria-hidden': 'true' }, '✗'), h('span', {}, `${formatPoint(p.x, p.y)} — ${why}`));
      })));
    }
    const tip = this.coverageTip(checked);
    if (tip) items.push(h('p', { class: 'small muted' }, tip));
    if (!success) items.push(h('button', { type: 'button', class: 'btn btn-block', onClick: () => { this.result = null; this.renderSide(); this.app.renderer.requestRender(); } }, icon('pencil', 15), 'Виправити точки'));
    return items;
  }

  coverageTip(checked) {
    const { family, params } = this.task;
    if (family === 'parabola' || family === 'abs') {
      const has = checked.some((p) => p.ok && Math.abs(p.x - params.h) < 1e-9);
      if (!has) return `Порада: познач вершину ${formatPoint(params.h, params.k)} — від неї зручно будувати ${family === 'abs' ? '«галочку»' : 'параболу'}.`;
    }
    if (family === 'linear') {
      const has = checked.some((p) => p.ok && p.x === 0);
      if (!has) return `Порада: точка перетину з віссю Oy — ${formatPoint(0, params.b)} (це b у формулі y = kx + b).`;
    }
    return null;
  }

  // ─────────────── Плоскость ───────────────

  snapValue(v) {
    return this.snap ? Math.round(v / SNAP) * SNAP || 0 : v;
  }

  pointAt(p) {
    let best = null;
    for (const q of this.points) {
      const d = Math.hypot(this.cs.x2px(q.x) - p.px, this.cs.y2px(q.y) - p.py);
      if (d <= HIT_PX && (!best || d < best.d)) best = { q, d };
    }
    return best?.q ?? null;
  }

  hitTest(p) {
    const q = this.pointAt(p);
    if (!q) return null;
    this.selected = q;
    this.renderSide();
    this.app.renderer.requestRender();
    return {
      cursor: 'grabbing',
      move: (m) => {
        q.x = this.snapValue(m.x);
        q.y = this.snapValue(m.y);
        this.result = null;
        this.app.renderer.requestRender();
      },
      end: (_, moved) => { if (moved) this.changed(); },
    };
  }

  onClick(p) {
    if (this.points.length >= MAX_POINTS) return;
    const x = this.snapValue(p.x), y = this.snapValue(p.y);
    const same = this.points.find((q) => Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9);
    if (same) { this.selected = same; this.changed(); return; }
    const pt = { id: ++pid, x, y };
    this.points.push(pt);
    this.selected = pt;
    this.result = null;
    this.changed();
  }

  onHover(p) {
    const q = this.pointAt(p);
    if (q !== this.hover) {
      this.hover = q;
      this.app.renderer.requestRender();
    }
  }

  cursorAt(p) {
    return this.pointAt(p) ? 'grab' : 'copy';
  }

  onKey(e) {
    if (!this.selected) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.removeSelected();
      return true;
    }
    if (e.key === 'Escape') {
      this.selected = null;
      this.changed();
      return true;
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (d) {
      e.preventDefault();
      this.selected.x += d[0] * SNAP;
      this.selected.y += d[1] * SNAP;
      this.result = null;
      this.changed();
      return true;
    }
    return false;
  }

  removeSelected() {
    if (!this.selected) return;
    this.points = this.points.filter((q) => q !== this.selected);
    this.selected = null;
    this.result = null;
    this.changed();
  }

  clearAll() {
    this.points = [];
    this.selected = null;
    this.result = null;
    this.changed();
  }

  changed() {
    this.app.setBadge(`<span class="muted">Побудуй</span>${mathLine(this.task.parsed.html)}`);
    this.renderSide();
    this.app.renderer.requestRender();
    this.app.setPlaneDescription(`Завдання: побудувати графік y = ${this.task.parsed.text}. Поставлено точок: ${this.points.length}.`);
  }

  draw(r) {
    const c = r.colors;
    const user = c.fn[0];
    if (this.result) r.plotFunction(this.task.parsed.evaluate, { color: c.success, width: 2.6 });
    const sorted = [...this.points].sort((p, q) => p.x - q.x);
    if (this.showCurve && sorted.length >= 2) r.plotPolyline(spline(sorted), { color: user, width: 2.2, alpha: 0.85, dash: this.result ? [6, 5] : null });
    const res = this.result ? new Map(this.result.checked.map((p) => [p.id, p])) : null;
    for (const p of this.points) {
      const info = res?.get(p.id);
      if (info && !info.ok && Number.isFinite(info.fx)) {
        r.drawSegment(p.x, p.y, p.x, info.fx, { color: c.danger, width: 1.5, dash: [4, 4] });
        r.drawPoint(p.x, info.fx, { color: c.success, r: 4, hollow: true });
      }
      const color = info ? (info.ok ? c.success : c.danger) : user;
      const active = p === this.selected || p === this.hover;
      r.drawPoint(p.x, p.y, { color, r: active ? 6.5 : 5.5, ring: p === this.selected ? 6 : 0 });
    }
    const label = this.selected ?? this.hover;
    if (label) r.drawLabel(this.cs.x2px(label.x) + 12, this.cs.y2px(label.y) - 16, formatPoint(label.x, label.y), { border: user });
  }
}
