// Режим «Это функция?»: случайный график, ответ «да/нет», проверка по критерию
// вертикальной прямой с анимированной демонстрацией и статистикой.

import { BaseMode } from './BaseMode.js';
import { randomShape, verticalTest, RANGE } from './testShapes.js';
import { hint } from '../ui/Hint.js';
import { h, clear, storage, prefersReducedMotion } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { formatNumber, formatPoint, plural } from '../core/format.js';

const KEY = 'fl.test.stats';
const YES_KEYS = new Set(['1', 'д', 'y']);
const NO_KEYS = new Set(['2', 'н', 'n']);

export class FunctionTest extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'test';
    this.stats = { correct: 0, wrong: 0, streak: 0, best: 0, ...storage.get(KEY, {}) };
    this.task = null;
    this.answer = null;   // null — ещё не отвечали; true/false — ответ пользователя
    this.probe = null;    // { x, animating }
    this.anim = 0;
  }

  defaultView() {
    return { ...RANGE, uniform: true };
  }

  mount() {
    const { left, right, footer } = this.app;
    this.statsEl = h('div', { class: 'stats', 'aria-live': 'polite' });
    left.append(h('div', { class: 'panel-body' },
      h('section', { class: 'section' },
        h('div', { class: 'section-head' },
          h('h2', { class: 'section-title' }, 'Счёт'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => this.resetStats() }, icon('reset', 14), 'Сбросить')),
        this.statsEl),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Критерий'),
        h('p', { class: 'small' }, 'График задаёт функцию y = f(x), если каждому x соответствует не больше одного y. Проверка: если найдётся вертикальная прямая, которая пересекает график хотя бы в двух точках, — это не функция.')),
      hint('test-basics', 'Проведи мысленно вертикальную линию. Если она пересекает график более одного раза — это не функция.'),
    ));

    this.side = h('div', { class: 'panel-body' });
    right.append(this.side);

    this.yesBtn = h('button', { type: 'button', class: 'btn btn-lg btn-success', onClick: () => this.respond(true) },
      icon('check'), 'Да, это функция', h('kbd', { 'aria-hidden': 'true' }, 'Д'));
    this.noBtn = h('button', { type: 'button', class: 'btn btn-lg btn-danger', onClick: () => this.respond(false) },
      icon('x'), 'Нет, это не функция', h('kbd', { 'aria-hidden': 'true' }, 'Н'));
    this.nextBtn = h('button', { type: 'button', class: 'btn btn-lg btn-primary', onClick: () => this.next() },
      'Следующий график', icon('arrowRight'));
    this.bar = h('div', { class: 'answer-bar', role: 'group', 'aria-label': 'Ответ' });
    footer.append(this.bar);

    const onKey = (e) => this.onGlobalKey(e);
    document.addEventListener('keydown', onKey);
    this.cleanups.push(() => document.removeEventListener('keydown', onKey));

    this.renderStats();
    if (!this.task) this.next(false);
    else this.renderState();
  }

  unmount() {
    super.unmount();
    cancelAnimationFrame(this.anim);
    this.anim = 0;
    if (this.probe) this.probe.animating = false;
  }

  // ─────────────── Ход игры ───────────────

  next(focus = true) {
    cancelAnimationFrame(this.anim);
    const shape = randomShape(this.task?.shape.kind);
    this.task = { shape, truth: verticalTest(shape) };
    this.answer = null;
    this.probe = null;
    this.app.setPlaneDescription(`Задание: на плоскости изображён график «${shape.title}». Является ли он графиком функции?`);
    if (this.app.viewTouched) this.app.resetView();
    this.renderState();
    this.redraw();
    if (focus) this.yesBtn.focus();
  }

  respond(saysFunction) {
    if (this.answer !== null || !this.task) return;
    const correct = saysFunction === this.task.truth.isFunction;
    this.answer = saysFunction;
    const s = this.stats;
    if (correct) {
      s.correct++;
      s.streak++;
      s.best = Math.max(s.best, s.streak);
    } else {
      s.wrong++;
      s.streak = 0;
    }
    storage.set(KEY, s);
    this.renderStats();
    this.renderState();
    this.demonstrate();
    this.nextBtn.focus();
  }

  resetStats() {
    this.stats = { correct: 0, wrong: 0, streak: 0, best: 0 };
    storage.set(KEY, this.stats);
    this.renderStats();
  }

  onGlobalKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if (this.answer === null && YES_KEYS.has(key)) { e.preventDefault(); this.respond(true); }
    else if (this.answer === null && NO_KEYS.has(key)) { e.preventDefault(); this.respond(false); }
    else if (this.answer !== null && (e.key === 'Enter' || key === 'n' || key === 'т') && t === document.body) { e.preventDefault(); this.next(); }
  }

  // ─────────────── Отрисовка панелей ───────────────

  renderStats() {
    const s = this.stats;
    const total = s.correct + s.wrong;
    const pct = total ? Math.round((s.correct / total) * 100) : null;
    const tile = (value, label, cls = '') => h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
    clear(this.statsEl).append(
      tile(String(s.correct), 'правильных', 'is-good'),
      tile(String(s.wrong), plural(s.wrong, 'ошибка', 'ошибки', 'ошибок'), s.wrong ? 'is-bad' : ''),
      tile(pct === null ? '—' : `${pct}%`, 'точность'),
      tile(String(s.streak), `серия · лучшая ${s.best}`),
    );
  }

  renderState() {
    const { shape, truth } = this.task;
    clear(this.bar);
    clear(this.side);
    if (this.answer === null) {
      this.bar.append(this.yesBtn, this.noBtn);
      this.side.append(
        h('section', { class: 'section' },
          h('h2', { class: 'section-title' }, 'Вопрос'),
          h('p', {}, 'Является ли изображённая линия графиком функции y = f(x)?'),
          h('p', { class: 'small muted' }, 'Ответьте кнопками под графиком или клавишами Д / Н. Плоскость можно двигать и масштабировать.')),
      );
      return;
    }
    this.bar.append(this.nextBtn);
    const correct = this.answer === truth.isFunction;
    const w = truth.witness;
    let explanation;
    if (truth.isFunction) {
      explanation = 'Любая вертикальная прямая пересекает этот график не больше чем в одной точке: каждому x соответствует единственное значение y. Значит, это функция.';
    } else if (w.ys === 'all') {
      explanation = `Прямая x = ${formatNumber(w.x)} совпадает с графиком — точек пересечения бесконечно много. Одному x соответствует бесконечно много y, значит, это не функция.`;
    } else {
      const pts = w.ys.map((y) => formatPoint(w.x, y, { decimals: 2 })).join(', ');
      explanation = `Прямая x = ${formatNumber(w.x, { decimals: 2 })} пересекает график в ${w.ys.length} ${plural(w.ys.length, 'точке', 'точках', 'точках')}: ${pts}. Одному x соответствуют разные y — значит, это не функция.`;
    }
    this.side.append(
      h('div', { class: `verdict ${correct ? 'is-correct' : 'is-wrong'}`, role: 'status' },
        h('div', { class: 'verdict-title' }, icon(correct ? 'check' : 'x', 22), correct ? 'Правильно!' : 'Неправильно'),
        h('p', {}, h('strong', {}, `Правильный ответ: ${truth.isFunction ? 'да, это функция' : 'нет, это не функция'}.`)),
        h('p', {}, explanation)),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Что было на графике'),
        h('p', { html: `<strong>${shape.title}</strong>` }),
        h('p', { html: shape.equation }),
        shape.note ? h('p', { class: 'small muted' }, shape.note) : null),
      hint('test-probe', 'Теперь вертикальную прямую можно тянуть мышью и смотреть, сколько точек пересечения получается.'),
    );
  }

  // ─────────────── Демонстрация вертикальной прямой ───────────────

  demonstrate() {
    const { truth } = this.task;
    const { xMin, xMax } = this.cs.bounds;
    const from = xMin + (xMax - xMin) * 0.03;
    const to = truth.isFunction ? xMax - (xMax - xMin) * 0.03 : truth.witness.x;
    const end = truth.isFunction ? niceX(this.task.shape) : to;
    const duration = prefersReducedMotion() ? 0 : truth.isFunction ? 1800 : 1200;
    this.probe = { x: from, animating: true };
    const t0 = performance.now();
    const tick = (now) => {
      const t = duration ? Math.min(1, (now - t0) / duration) : 1;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.probe.x = from + (to - from) * e;
      if (t >= 1) {
        this.probe = { x: end, animating: false };
        this.redraw();
        return;
      }
      this.redraw();
      this.anim = requestAnimationFrame(tick);
    };
    this.anim = requestAnimationFrame(tick);
  }

  hitTest(p) {
    if (!this.probe || this.probe.animating) return null;
    if (Math.abs(p.px - this.cs.x2px(this.probe.x)) > 12) return null;
    return {
      cursor: 'ew-resize',
      move: (q) => {
        this.probe.x = this.cs.px2x(q.px);
        this.redraw();
      },
    };
  }

  cursorAt(p) {
    if (this.probe && !this.probe.animating && Math.abs(p.px - this.cs.x2px(this.probe.x)) <= 12) return 'ew-resize';
    return 'crosshair';
  }

  onClick(p) {
    if (this.probe && !this.probe.animating) {
      this.probe.x = p.x;
      this.redraw();
    }
  }

  draw(r) {
    if (!this.task) return;
    const { shape } = this.task;
    const color = r.colors.fn[0];
    shape.draw(r, { color, width: 2.6 });
    if (!this.probe) return;

    const x = this.probe.x;
    const raw = shape.intersect(x);
    const all = raw === 'all';
    const ys = all ? [] : raw.filter((y) => Math.abs(y) < 1e6);
    const many = all || ys.length >= 2;
    const lineColor = many ? r.colors.danger : r.colors.success;
    r.drawVLine(x, { color: lineColor, width: all ? 4 : 2, dash: all ? null : [7, 5], alpha: 0.95 });
    for (const y of ys) r.drawPoint(x, y, { color: lineColor, r: 6, ring: many ? 6 : 4 });

    const count = all ? 'бесконечно много точек' : `${ys.length} ${plural(ys.length, 'точка', 'точки', 'точек')}`;
    const px = this.cs.x2px(x);
    r.drawLabel(px + 10, 18, `x = ${formatNumber(x, { decimals: 2 })}: ${count}`, {
      baseline: 'top',
      color: lineColor,
      border: lineColor,
      font: '600 12.5px "IBM Plex Sans", sans-serif',
    });
  }
}

/** Красивое место, где остановить прямую у функции: в области определения, около нуля. */
function niceX(shape) {
  for (const x of [1, 2, -1, -2, 3, 0.5, 4, 5]) {
    const ys = shape.intersect(x);
    if (ys !== 'all' && ys.length === 1 && Math.abs(ys[0]) < 6) return x;
  }
  return 1;
}
