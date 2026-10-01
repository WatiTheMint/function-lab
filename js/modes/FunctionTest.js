// Режим «Это функция?»: случайный график, ответ «да/нет», проверка по критерию
// вертикальной прямой с анимированной демонстрацией и статистикой.

import { BaseMode } from './BaseMode.js';
import { randomShape, verticalTest, RANGE } from './testShapes.js';
import { hint } from '../ui/Hint.js';
import { h, clear, storage, prefersReducedMotion } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { formatNumber, formatPoint, plural } from '../core/format.js';

const KEY = 'fl.test.stats';
const YES_KEYS = new Set(['1', 'т', 'y']);
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
          h('h2', { class: 'section-title' }, 'Рахунок'),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => this.resetStats() }, icon('reset', 14), 'Скинути')),
        this.statsEl),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Критерій'),
        h('p', { class: 'small' }, 'Графік задає функцію y = f(x), якщо кожному x відповідає не більше одного y. Перевірка: якщо знайдеться вертикальна пряма, яка перетинає графік хоча б у двох точках, — це не функція.')),
      hint('test-basics', 'Проведи подумки вертикальну лінію. Якщо вона перетинає графік більше ніж один раз — це не функція.'),
    ));

    this.side = h('div', { class: 'panel-body' });
    right.append(this.side);

    this.yesBtn = h('button', { type: 'button', class: 'btn btn-lg btn-success', onClick: () => this.respond(true) },
      icon('check'), 'Так, це функція', h('kbd', { 'aria-hidden': 'true' }, 'Т'));
    this.noBtn = h('button', { type: 'button', class: 'btn btn-lg btn-danger', onClick: () => this.respond(false) },
      icon('x'), 'Ні, це не функція', h('kbd', { 'aria-hidden': 'true' }, 'Н'));
    this.nextBtn = h('button', { type: 'button', class: 'btn btn-lg btn-primary', onClick: () => this.next() },
      'Наступний графік', icon('arrowRight'));
    this.bar = h('div', { class: 'answer-bar', role: 'group', 'aria-label': 'Відповідь' });
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
    this.app.setPlaneDescription(`Завдання: на площині зображено графік «${shape.title}». Чи є він графіком функції?`);
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
    else if (this.answer !== null && (e.key === 'Enter' || key === 'n' || key === 'д') && t === document.body) { e.preventDefault(); this.next(); }
  }

  // ─────────────── Отрисовка панелей ───────────────

  renderStats() {
    const s = this.stats;
    const total = s.correct + s.wrong;
    const pct = total ? Math.round((s.correct / total) * 100) : null;
    const tile = (value, label, cls = '') => h('div', { class: `stat ${cls}` }, h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label));
    clear(this.statsEl).append(
      tile(String(s.correct), 'правильних', 'is-good'),
      tile(String(s.wrong), plural(s.wrong, 'помилка', 'помилки', 'помилок'), s.wrong ? 'is-bad' : ''),
      tile(pct === null ? '—' : `${pct}%`, 'точність'),
      tile(String(s.streak), `серія · найкраща ${s.best}`),
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
          h('h2', { class: 'section-title' }, 'Питання'),
          h('p', {}, 'Чи є зображена лінія графіком функції y = f(x)?'),
          h('p', { class: 'small muted' }, 'Відповідайте кнопками під графіком або клавішами Т / Н. Площину можна рухати й масштабувати.')),
      );
      return;
    }
    this.bar.append(this.nextBtn);
    const correct = this.answer === truth.isFunction;
    const w = truth.witness;
    let explanation;
    if (truth.isFunction) {
      explanation = 'Будь-яка вертикальна пряма перетинає цей графік не більше ніж в одній точці: кожному x відповідає єдине значення y. Отже, це функція.';
    } else if (w.ys === 'all') {
      explanation = `Пряма x = ${formatNumber(w.x)} збігається з графіком — точок перетину нескінченно багато. Одному x відповідає нескінченно багато y, отже, це не функція.`;
    } else {
      const pts = w.ys.map((y) => formatPoint(w.x, y, { decimals: 2 })).join(', ');
      explanation = `Пряма x = ${formatNumber(w.x, { decimals: 2 })} перетинає графік у ${w.ys.length} ${plural(w.ys.length, 'точці', 'точках', 'точках')}: ${pts}. Одному x відповідають різні y — отже, це не функція.`;
    }
    this.side.append(
      h('div', { class: `verdict ${correct ? 'is-correct' : 'is-wrong'}`, role: 'status' },
        h('div', { class: 'verdict-title' }, icon(correct ? 'check' : 'x', 22), correct ? 'Правильно!' : 'Неправильно'),
        h('p', {}, h('strong', {}, `Правильна відповідь: ${truth.isFunction ? 'так, це функція' : 'ні, це не функція'}.`)),
        h('p', {}, explanation)),
      h('section', { class: 'section' },
        h('h2', { class: 'section-title' }, 'Що було на графіку'),
        h('p', { html: `<strong>${shape.title}</strong>` }),
        h('p', { html: shape.equation }),
        shape.note ? h('p', { class: 'small muted' }, shape.note) : null),
      hint('test-probe', 'Тепер вертикальну пряму можна тягнути мишею й дивитися, скільки точок перетину виходить.'),
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

    const count = all ? 'нескінченно багато точок' : `${ys.length} ${plural(ys.length, 'точка', 'точки', 'точок')}`;
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
