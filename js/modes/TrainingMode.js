// Режим «Тренировка»: три упражнения на связь формулы и графика.
//   • «По точкам»        — дана формула, построй график сам;
//   • «Выбери график»    — дана формула, найди её график среди вариантов;
//   • «Формула по графику» — дан график, введи формулу.
// Режим лишь переключает упражнения и передаёт им ввод с плоскости.

import { BaseMode } from './BaseMode.js';
import { PointsTask } from './training/PointsTask.js';
import { ChoiceTask } from './training/ChoiceTask.js';
import { FormulaTask } from './training/FormulaTask.js';
import { h } from '../ui/dom.js';

const KINDS = [
  { id: 'points', label: 'За точками', title: 'Побудуй графік за точками', make: (m) => new PointsTask(m) },
  { id: 'choice', label: 'Вибір', title: 'Обери графік серед варіантів', make: (m) => new ChoiceTask(m) },
  { id: 'formula', label: 'Формула', title: 'Запиши формулу за графіком', make: (m) => new FormulaTask(m) },
];

export class TrainingMode extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'train';
    this.kind = 'points';
    this.tasks = {};
  }

  get sub() {
    if (!this.tasks[this.kind]) this.tasks[this.kind] = KINDS.find((k) => k.id === this.kind).make(this);
    return this.tasks[this.kind];
  }

  defaultView() {
    return this.sub.defaultView();
  }

  mount() {
    const { left, right } = this.app;
    this.tabs = KINDS.map((k) => h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(k.id === this.kind),
      tabindex: k.id === this.kind ? '0' : '-1',
      onClick: () => this.switchKind(k.id),
      title: k.title,
      'aria-label': k.title,
      onKeydown: (e) => this.onTabKey(e, k.id),
    }, k.label));
    this.subLeft = h('div', { class: 'section' });
    this.subRight = h('div', { class: 'section' });
    left.append(h('div', { class: 'panel-body' },
      h('div', { class: 'segmented is-block', role: 'tablist', 'aria-label': 'Вправа' }, this.tabs),
      this.subLeft));
    right.append(h('div', { class: 'panel-body' }, this.subRight));
    this.sub.mount(this.subLeft, this.subRight);
  }

  unmount() {
    super.unmount();
    for (const t of Object.values(this.tasks)) t.unmount?.();
  }

  switchKind(id) {
    if (id === this.kind) return;
    this.sub.unmount?.();
    this.kind = id;
    this.tabs.forEach((t, i) => {
      const active = KINDS[i].id === id;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    this.sub.mount(this.subLeft, this.subRight);
    this.app.resetView();
    this.redraw();
  }

  onTabKey(e, id) {
    const i = KINDS.findIndex((k) => k.id === id);
    const j = e.key === 'ArrowRight' ? (i + 1) % KINDS.length : e.key === 'ArrowLeft' ? (i + KINDS.length - 1) % KINDS.length : null;
    if (j === null) return;
    e.preventDefault();
    this.switchKind(KINDS[j].id);
    this.tabs[j].focus();
  }

  onTheme() { this.sub.onTheme?.(); }
  draw(r, now) { this.sub.draw?.(r, now); }
  hitTest(p, e) { return this.sub.hitTest?.(p, e) ?? null; }
  onClick(p, e) { this.sub.onClick?.(p, e); }
  onHover(p) { this.sub.onHover?.(p); }
  onKey(e) { return this.sub.onKey?.(e) ?? false; }
  cursorAt(p) { return this.sub.cursorAt?.(p) ?? 'crosshair'; }
}
