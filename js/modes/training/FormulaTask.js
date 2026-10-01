// Тренировка «Формула по графику»: на плоскости график — запиши его формулу.
// Проверка сравнивает функции численно и показывает оба графика и место расхождения.

import { formulaTask } from './tasks.js';
import { mathLine } from '../GraphMode.js';
import { FormulaInput } from '../../ui/FormulaInput.js';
import { compareFunctions } from '../../core/numeric.js';
import { formatNumber, formatPoint, formatValue } from '../../core/format.js';
import { h, clear } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { hint } from '../../ui/Hint.js';

const FORMS = {
  linear: 'y = kx + b',
  parabola: 'y = a(x − h)² + k',
  abs: 'y = a|x − h| + k',
  sqrt: 'y = a√(x − h) + k',
  hyperbola: 'y = k/(x − h) + c',
  cubic: 'y = a(x − h)³ + k',
  exp: 'y = aˣ + c',
};

export class FormulaTask {
  constructor(mode) {
    this.mode = mode;
    this.app = mode.app;
    this.solved = 0;
    this.attempts = 0;
    this.newTask(false);
  }

  newTask(remount = true) {
    this.task = formulaTask();
    this.user = null;     // разобранная формула пользователя
    this.result = null;   // { equal, x, fx, gx }
    this.hintLevel = 0;
    this.revealed = false;
    this.tries = 0;
    this.counted = false;
    if (remount) {
      this.mount(this.left, this.right);
      this.app.resetView();
    }
  }

  defaultView() {
    return { xMin: -8, xMax: 8, yMin: -6, yMax: 6, uniform: true };
  }

  mount(left, right) {
    this.left = left;
    this.right = right;
    clear(left);
    clear(right);
    this.input = new FormulaInput({
      label: 'Твоя формула',
      submitLabel: 'Проверить',
      keys: true,
      onSubmit: (parsed) => this.check(parsed),
    });
    this.hintBox = h('div', { class: 'section', 'aria-live': 'polite' });
    left.append(
      h('div', { class: 'task-card' },
        h('span', { class: 'task-label' }, 'Задание'),
        h('p', {}, 'Какая функция изображена на плоскости? Запиши её формулу.')),
      this.input.el,
      h('div', { class: 'tool-row' },
        h('button', { type: 'button', class: 'btn btn-sm', onClick: () => this.moreHints() }, icon('bulb', 14), 'Подсказка'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => this.reveal() }, 'Показать ответ')),
      this.hintBox,
      hint('train-formula', 'Найди на графике «опорные» точки: пересечение с осями, вершину. Подставь их координаты в общий вид формулы.'),
    );
    this.side = h('div', { class: 'section' });
    right.append(this.side);
    this.renderHints();
    this.renderSide();
    this.app.setBadge('<span class="muted">Какая функция изображена?</span>');
    this.app.setPlaneDescription('Задание: по изображённому графику записать формулу функции.');
  }

  keyPoints() {
    const { family, params, parsed } = this.task;
    const pts = [];
    const f = parsed.evaluate;
    if (['parabola', 'abs', 'cubic', 'sqrt'].includes(family)) pts.push({ x: params.h, y: params.k, label: family === 'sqrt' ? 'начало' : family === 'cubic' ? 'центр' : 'вершина' });
    const y0 = f(0);
    if (Number.isFinite(y0) && !pts.some((p) => p.x === 0)) pts.push({ x: 0, y: y0, label: 'Oy' });
    for (const x of [1, -1, 2]) {
      const y = f(x);
      if (pts.length < 3 && Number.isFinite(y) && Number.isInteger(y) && !pts.some((p) => p.x === x)) pts.push({ x, y, label: '' });
    }
    return pts;
  }

  moreHints() {
    this.hintLevel = Math.min(2, this.hintLevel + 1);
    this.renderHints();
    this.app.renderer.requestRender();
  }

  reveal() {
    this.revealed = true;
    this.input.setValue(this.task.source);
    this.renderHints();
  }

  renderHints() {
    clear(this.hintBox);
    if (this.hintLevel >= 1) {
      this.hintBox.append(h('p', { class: 'small' }, `Отмеченные точки: ${this.keyPoints().map((p) => formatPoint(p.x, p.y)).join(', ')}.`));
    }
    if (this.hintLevel >= 2) {
      this.hintBox.append(h('p', { class: 'small' }, `Это ${this.task.familyName}. Общий вид: ${FORMS[this.task.family]}.`));
    }
    if (this.revealed) {
      this.hintBox.append(h('p', { class: 'small', html: `Ответ: ${mathLine(this.task.parsed.html)}` }));
    }
  }

  check(parsed) {
    this.user = parsed;
    this.tries++;
    const cmp = compareFunctions(this.task.parsed.evaluate, parsed.evaluate, { xMin: -10, xMax: 10 });
    this.result = cmp;
    if (this.tries === 1) this.attempts++;
    if (cmp.equal && !this.counted) {
      this.counted = true;
      if (!this.revealed) this.solved++;
    }
    this.renderSide();
    this.app.renderer.requestRender();
    return { ok: true };
  }

  renderSide() {
    clear(this.side);
    this.side.append(h('div', { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Проверка'),
      h('span', { class: 'small muted' }, `решено: ${this.solved} из ${this.attempts}`)));
    if (!this.result) {
      this.side.append(h('p', { class: 'small' }, 'Введи формулу слева и нажми «Проверить». Твой график появится на плоскости рядом с заданным.'));
      return;
    }
    const r = this.result;
    if (r.equal) {
      this.side.append(h('div', { class: 'verdict is-correct', role: 'status' },
        h('div', { class: 'verdict-title' }, icon('check', 22), 'Совпадает!'),
        h('p', { html: `Твоя формула ${mathLine(this.user.html)} задаёт ту же функцию: графики совпали во всех проверенных точках отрезка [−10; 10].` }),
        this.user.text !== this.task.parsed.text ? h('p', { class: 'small', html: `В задании была записана как ${mathLine(this.task.parsed.html)}.` }) : null));
    } else {
      const xs = formatNumber(r.x, { decimals: 2 });
      let why;
      if (Number.isFinite(r.fx) && Number.isFinite(r.gx)) why = `При x = ${xs} на графике y = ${formatValue(r.fx)}, а твоя формула даёт f(${xs}) = ${formatValue(r.gx)}.`;
      else if (Number.isFinite(r.fx)) why = `При x = ${xs} график существует (y = ${formatValue(r.fx)}), а твоя формула там не определена.`;
      else why = `При x = ${xs} графика нет, а твоя формула даёт значение ${formatValue(r.gx)}.`;
      this.side.append(h('div', { class: 'verdict is-wrong', role: 'status' },
        h('div', { class: 'verdict-title' }, icon('x', 22), 'Пока не совпадает'),
        h('p', {}, why),
        h('p', { class: 'small' }, 'Синий — заданный график, красный пунктир — график твоей формулы. Исправь формулу и проверь ещё раз.')));
    }
    this.side.append(h('button', { type: 'button', class: `btn btn-block ${r.equal ? 'btn-primary' : ''}`, onClick: () => this.newTask() }, 'Новое задание', icon('arrowRight', 16)));
  }

  draw(r) {
    const c = r.colors;
    r.plotFunction(this.task.parsed.evaluate, { color: this.result?.equal ? c.success : c.fn[0], width: 2.8 });
    if (this.hintLevel >= 1) {
      for (const p of this.keyPoints()) {
        r.drawPoint(p.x, p.y, { color: c.fn[0], r: 5.5, ring: 4 });
        r.drawLabel(this.app.cs.x2px(p.x) + 10, this.app.cs.y2px(p.y) - 14, formatPoint(p.x, p.y), { font: '500 11px "JetBrains Mono", monospace' });
      }
    }
    if (this.user && this.result && !this.result.equal) {
      r.plotFunction(this.user.evaluate, { color: c.danger, width: 2.2, dash: [7, 5] });
      const { x, fx, gx } = this.result;
      if (Number.isFinite(fx)) r.drawPoint(x, fx, { color: c.fn[0], r: 6, ring: 5 });
      if (Number.isFinite(gx)) r.drawPoint(x, gx, { color: c.danger, r: 6, ring: 5 });
      if (Number.isFinite(fx) && Number.isFinite(gx)) r.drawSegment(x, fx, x, gx, { color: c.muted, width: 1.5, dash: [3, 4] });
    }
  }
}
