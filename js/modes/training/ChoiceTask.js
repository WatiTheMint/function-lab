// Тренировка «Выбери график»: дана формула — найди её график среди четырёх вариантов.

import { choiceTask } from './tasks.js';
import { mathLine } from '../GraphMode.js';
import { CoordinateSystem } from '../../core/CoordinateSystem.js';
import { GraphRenderer } from '../../core/GraphRenderer.js';
import { compareFunctions } from '../../core/numeric.js';
import { toText } from '../../core/FunctionParser.js';
import { formatNumber, formatValue } from '../../core/format.js';
import { h, clear } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { hint } from '../../ui/Hint.js';

const LETTERS = ['А', 'Б', 'В', 'Г'];
const MINI_VIEW = [-6, 6, -6, 6];

export class ChoiceTask {
  constructor(mode) {
    this.mode = mode;
    this.app = mode.app;
    this.minis = [];
    this.solved = 0;
    this.attempts = 0;
    this.newTask(false);
  }

  newTask(remount = true) {
    this.task = choiceTask();
    this.chosen = null;
    this.preview = null;
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
    this.destroyMinis();
    clear(left);
    clear(right);
    const { target, options } = this.task;
    this.optionBtns = options.map((opt, i) => {
      const canvas = h('canvas', { 'aria-hidden': 'true' });
      const btn = h('button', {
        type: 'button',
        class: 'option',
        'aria-label': `Варіант ${LETTERS[i]}`,
        onClick: () => this.choose(i),
        onMouseenter: () => this.setPreview(i),
        onMouseleave: () => this.setPreview(null),
        onFocus: () => this.setPreview(i),
        onBlur: () => this.setPreview(null),
      }, canvas, h('span', { class: 'option-letter', 'aria-hidden': 'true' }, LETTERS[i]));
      return { btn, canvas, opt };
    });
    left.append(
      h('div', { class: 'task-card' },
        h('span', { class: 'task-label' }, 'Завдання'),
        h('p', {}, 'Який із графіків — графік функції'),
        h('div', { html: mathLine(target.parsed.html) })),
      h('div', { class: 'options', role: 'group', 'aria-label': 'Варіанти графіків' }, this.optionBtns.map((o) => o.btn)),
      hint('train-choice', 'Наведи на варіант — він з’явиться великим на площині. Підстав у формулу прості x (0, 1, −1) і порівняй із графіком.'),
    );
    this.side = h('div', { class: 'section' });
    right.append(this.side);
    this.renderSide();
    // мини-графики создаём после вставки в DOM: нужен размер холста
    requestAnimationFrame(() => this.createMinis());
    this.app.setBadge(`<span class="muted">Знайди графік</span>${mathLine(target.parsed.html)}`);
    this.app.setPlaneDescription(`Завдання: вибрати графік функції y = ${target.parsed.text} з чотирьох варіантів.`);
  }

  createMinis() {
    this.destroyMinis();
    for (const [i, o] of this.optionBtns.entries()) {
      if (!o.canvas.isConnected) return;
      const cs = new CoordinateSystem();
      const r = new GraphRenderer(o.canvas, cs);
      const fit = () => cs.fitRect(...MINI_VIEW, { pad: 0.02 });
      cs.on('resize', fit);
      r.resize();
      fit();
      r.setScene({
        draw: (rr) => {
          const state = this.chosen === null ? null : i === this.task.correctIndex ? 'ok' : i === this.chosen ? 'bad' : 'off';
          const color = state === 'ok' ? rr.colors.success : state === 'bad' ? rr.colors.danger : rr.colors.fn[0];
          rr.plotFunction(o.opt.parsed.evaluate, { color, width: 2.4, alpha: state === 'off' ? 0.45 : 1 });
        },
      });
      this.minis.push(r);
    }
  }

  destroyMinis() {
    for (const r of this.minis) r.destroy();
    this.minis = [];
  }

  unmount() {
    this.destroyMinis();
  }

  onTheme() {
    for (const r of this.minis) r.readColors();
  }

  setPreview(i) {
    if (this.chosen !== null) return;
    this.preview = i;
    this.app.renderer.requestRender();
  }

  choose(i) {
    if (this.chosen !== null) return;
    this.chosen = i;
    this.preview = null;
    this.attempts++;
    const ok = i === this.task.correctIndex;
    if (ok) this.solved++;
    this.optionBtns.forEach((o, j) => {
      o.btn.disabled = true;
      if (j === this.task.correctIndex) o.btn.classList.add('is-correct');
      else if (j === i) o.btn.classList.add('is-wrong');
      o.btn.setAttribute('aria-label', `Варіант ${LETTERS[j]}: y = ${o.opt.parsed.text}${j === this.task.correctIndex ? ' — правильний' : ''}`);
    });
    for (const r of this.minis) r.requestRender();
    this.renderSide();
    this.app.renderer.requestRender();
    this.side.querySelector('.verdict')?.focus();
  }

  /** Понятная точка, где выбранный график расходится с правильным. */
  explainDifference(target, chosen) {
    const cmp = compareFunctions(target.parsed.evaluate, chosen.parsed.evaluate, { xMin: -6, xMax: 6 });
    if (cmp.equal) return null;
    const xs = formatNumber(cmp.x, { decimals: 2 });
    const fx = Number.isFinite(cmp.fx) ? `f(${xs}) = ${toText(target.parsed.ast, xs)} = ${formatValue(cmp.fx)}` : `при x = ${xs} функція не визначена`;
    const gx = Number.isFinite(cmp.gx) ? `на вибраному графіку y = ${formatValue(cmp.gx)}` : 'на вибраному графіку точки з таким x немає';
    return { text: `Перевіримо x = ${xs}: ${fx}, а ${gx}.`, x: cmp.x, fx: cmp.fx, gx: cmp.gx };
  }

  renderSide() {
    clear(this.side);
    this.side.append(h('div', { class: 'section-head' },
      h('h2', { class: 'section-title' }, 'Відповідь'),
      h('span', { class: 'small muted' }, `розв’язано: ${this.solved} з ${this.attempts}`)));
    if (this.chosen === null) {
      this.side.append(h('p', { class: 'small' }, 'Обери один із чотирьох графіків ліворуч.'));
      return;
    }
    const { target, options, correctIndex } = this.task;
    const ok = this.chosen === correctIndex;
    const diff = ok ? null : this.explainDifference(target, options[this.chosen]);
    this.diff = diff;
    const y0 = target.parsed.evaluate(0);
    this.side.append(
      h('div', { class: `verdict ${ok ? 'is-correct' : 'is-wrong'}`, tabindex: '-1', role: 'status' },
        h('div', { class: 'verdict-title' }, icon(ok ? 'check' : 'x', 22), ok ? 'Правильно!' : 'Не той графік'),
        h('p', {}, `Правильна відповідь — варіант ${LETTERS[correctIndex]}. На площині його показано зеленим${ok ? '' : ', а вибраний — червоним пунктиром'}.`),
        diff ? h('p', {}, diff.text) : null,
        Number.isFinite(y0) ? h('p', { class: 'small' }, `Підказка на майбутнє: графік перетинає вісь Oy у точці (0; ${formatValue(y0)}) — підстав x = 0.`) : null),
      h('ul', { class: 'point-list' }, options.map((o, j) => h('li', {},
        h('strong', {}, `${LETTERS[j]}:`),
        h('span', { html: mathLine(o.parsed.html) }),
        j === correctIndex ? h('span', { class: 'ok' }, '✓') : null))),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => this.newTask() }, 'Наступне завдання', icon('arrowRight', 16)),
    );
  }

  draw(r) {
    const { options, correctIndex } = this.task;
    if (this.chosen === null) {
      if (this.preview !== null) {
        r.plotFunction(options[this.preview].parsed.evaluate, { color: r.colors.fn[0], width: 2.6 });
        r.drawLabel(12, 14, `Варіант ${LETTERS[this.preview]}`, { baseline: 'top', font: '600 13px "IBM Plex Sans", sans-serif' });
      }
      return;
    }
    r.plotFunction(options[correctIndex].parsed.evaluate, { color: r.colors.success, width: 2.8 });
    if (this.chosen !== correctIndex) {
      r.plotFunction(options[this.chosen].parsed.evaluate, { color: r.colors.danger, width: 2.2, dash: [7, 5] });
      const d = this.diff;
      if (d) {
        if (Number.isFinite(d.fx)) r.drawPoint(d.x, d.fx, { color: r.colors.success, r: 6, ring: 5 });
        if (Number.isFinite(d.gx)) r.drawPoint(d.x, d.gx, { color: r.colors.danger, r: 6, ring: 5 });
        if (Number.isFinite(d.fx) && Number.isFinite(d.gx)) r.drawSegment(d.x, d.fx, d.x, d.gx, { color: r.colors.muted, width: 1.5, dash: [3, 4] });
      }
    }
  }
}
