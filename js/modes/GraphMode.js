// Режим «График»: несколько функций, список с цветами, скрытие/удаление/правка,
// анализ выбранной функции и таблица значений.

import { BaseMode } from './BaseMode.js';
import { FormulaInput } from '../ui/FormulaInput.js';
import { ValueTable } from '../ui/ValueTable.js';
import { hint } from '../ui/Hint.js';
import { showToast } from '../ui/Toast.js';
import { h, clear, nextId } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { COLOR_NAMES, MAX_FUNCTIONS } from '../core/FunctionManager.js';
import { parseFunction } from '../core/FunctionParser.js';
import { formatPoint } from '../core/format.js';
import { EXACT, NUMERIC } from '../core/FunctionAnalyzer.js';

const EXAMPLES = ['x^2', '2x + 3', 'sin(x)', 'sqrt(x)', '1/x', '|x - 2|', 'x^3 - 2x', 'e^x', 'ln(x)', 'tg(x)'];
const REVEAL_MS = 700;
const BADGES = {
  [EXACT]: ['badge-exact', 'точно'],
  [NUMERIC]: ['badge-numeric', '≈ численно'],
  unknown: ['badge-unknown', 'не удалось'],
};

export const mathLine = (html, lhs = 'y =') => `<span class="math-lhs">${lhs}</span><span class="math">${html}</span>`;

export class GraphMode extends BaseMode {
  constructor(app) {
    super(app);
    this.id = 'graph';
    this.fm = app.functions;
    this.hover = null;
    this.showMarkers = false;
    this.infoTab = 'analysis';
    this.editingId = null;
    this.tableHoverX = null;
    this.table = new ValueTable({
      onChange: () => this.redraw(),
      onHoverRow: (x) => {
        this.tableHoverX = x;
        this.redraw();
      },
    });
  }

  mount() {
    const { left, right } = this.app;
    this.input = new FormulaInput({
      label: 'Новая функция',
      visibleLabel: false,
      submitLabel: 'Построить',
      keys: true,
      onSubmit: (parsed) => this.addFunction(parsed.source),
    });
    this.list = h('ul', { class: 'fn-list', 'aria-label': 'Построенные функции' });
    this.countEl = h('span', { class: 'count' });

    left.append(h('div', { class: 'panel-body' },
      h('section', { class: 'section', 'aria-labelledby': 'new-fn-title' },
        h('h2', { class: 'section-title', id: 'new-fn-title' }, 'Новая функция'),
        this.input.el,
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Примеры функций' },
          EXAMPLES.map((src) => {
            const p = parseFunction(src);
            return h('button', {
              type: 'button',
              class: 'chip',
              'aria-label': `Построить y = ${p.text}`,
              onClick: () => this.addFunction(src),
              html: `<span class="math">${p.html}</span>`,
            });
          }))),
      h('section', { class: 'section', 'aria-labelledby': 'fn-list-title' },
        h('div', { class: 'section-head' }, h('h2', { class: 'section-title', id: 'fn-list-title' }, 'Функции', this.countEl)),
        this.list),
      hint('graph-basics', 'Нажмите на функцию в списке, чтобы выделить её и увидеть анализ. Плоскость можно двигать мышью, а колесом — менять масштаб.'),
    ));

    this.info = h('div', { class: 'panel-body' });
    right.append(this.info);

    this.listen(this.fm, 'change', () => this.refresh());
    this.refresh();
  }

  refresh() {
    this.renderList();
    this.renderInfo();
    this.describe();
    this.redraw();
  }

  addFunction(source) {
    const res = this.fm.add(source);
    if (!res.ok) {
      if (this.fm.items.length >= MAX_FUNCTIONS) showToast(res.error.message);
      return res;
    }
    this.input.setValue('');
    this.ensureVisible(res.item);
    return res;
  }

  /** Если график целиком вне экрана — сдвигаем плоскость к нему. */
  ensureVisible(item) {
    const { cs } = this;
    const { xMin, xMax, yMin, yMax } = cs.bounds;
    const f = item.parsed.evaluate;
    for (let i = 0; i <= 200; i++) {
      const y = f(xMin + ((xMax - xMin) * i) / 200);
      if (Number.isFinite(y) && y >= yMin && y <= yMax) return;
    }
    for (const x of [0, 1, -1, 2, 5, 10, -5, -10, 50, 100]) {
      const y = f(x);
      if (Number.isFinite(y)) {
        this.app.controller.animateTo({ ...cs.view, cx: x, cy: y });
        return;
      }
    }
  }

  // ─────────────── Список функций ───────────────

  renderList() {
    clear(this.list);
    this.countEl.textContent = `${this.fm.items.length}/${MAX_FUNCTIONS}`;
    if (!this.fm.items.length) {
      this.list.append(h('li', { class: 'empty' }, 'Пока нет ни одной функции. Введите формулу выше или нажмите на пример.'));
      return;
    }
    for (const item of this.fm.items) this.list.append(this.renderItem(item));
  }

  renderItem(item) {
    const selected = item.id === this.fm.selectedId;
    const color = `var(--fn-${item.color + 1})`;
    const li = h('li', { class: `fn-item${selected ? ' is-selected' : ''}${item.visible ? '' : ' is-hidden'}` });
    li.style.setProperty('--c', color);

    const swatch = h('button', {
      type: 'button',
      class: 'fn-swatch',
      'aria-label': `Цвет графика: ${COLOR_NAMES[item.color]}. Сменить цвет`,
      title: 'Сменить цвет',
      onClick: () => this.fm.cycleColor(item.id),
    });

    if (this.editingId === item.id) {
      const editor = new FormulaInput({
        label: `Изменить формулу y = ${item.parsed.text}`,
        value: item.source,
        submitLabel: 'OK',
        onSubmit: (parsed) => {
          const res = this.fm.update(item.id, parsed.source);
          if (res.ok) {
            this.editingId = null;
            this.renderList();
          }
          return res;
        },
        onCancel: () => {
          this.editingId = null;
          this.renderList();
        },
      });
      li.append(swatch, h('div', { class: 'fn-edit' }, editor.el));
      queueMicrotask(() => editor.focus());
      return li;
    }

    const main = h('button', {
      type: 'button',
      class: 'fn-main',
      'aria-pressed': String(selected),
      'aria-label': `y = ${item.parsed.text}${item.visible ? '' : ' (скрыта)'}. Выбрать`,
      onClick: () => this.fm.select(item.id),
      onDblclick: () => this.startEdit(item.id),
      html: mathLine(item.parsed.html),
    });
    const actions = h('div', { class: 'fn-actions' },
      h('button', {
        type: 'button',
        class: 'icon-btn is-quiet is-small',
        'aria-label': item.visible ? 'Скрыть график' : 'Показать график',
        title: item.visible ? 'Скрыть' : 'Показать',
        onClick: () => this.fm.toggle(item.id),
      }, icon(item.visible ? 'eye' : 'eyeOff', 17)),
      h('button', {
        type: 'button',
        class: 'icon-btn is-quiet is-small',
        'aria-label': 'Таблица значений',
        title: 'Таблица значений',
        onClick: () => {
          this.infoTab = 'table';
          if (this.fm.selectedId === item.id) this.renderInfo();
          else this.fm.select(item.id);
          this.info.querySelector('.range-grid input')?.focus();
        },
      }, icon('table', 17)),
      h('button', {
        type: 'button',
        class: 'icon-btn is-quiet is-small',
        'aria-label': 'Изменить формулу',
        title: 'Изменить',
        onClick: () => this.startEdit(item.id),
      }, icon('pencil', 16)),
      h('button', {
        type: 'button',
        class: 'icon-btn is-quiet is-small is-danger',
        'aria-label': `Удалить y = ${item.parsed.text}`,
        title: 'Удалить',
        onClick: () => this.removeFunction(item.id),
      }, icon('trash', 16)),
    );
    li.append(swatch, main, actions);
    return li;
  }

  startEdit(id) {
    this.editingId = id;
    this.renderList();
  }

  removeFunction(id) {
    const removed = this.fm.remove(id);
    if (!removed) return;
    this.list.querySelector('.fn-main')?.focus();
    showToast(`Функция y = ${removed.item.parsed.text} удалена`, {
      action: { label: 'Отменить', onClick: () => this.fm.restore(removed) },
    });
  }

  // ─────────────── Информация о функции ───────────────

  renderInfo() {
    clear(this.info);
    const item = this.fm.selected;
    if (!item) {
      this.info.append(h('div', { class: 'empty' }, 'Выберите функцию в списке, чтобы увидеть её свойства и таблицу значений.'));
      return;
    }
    const head = h('div', { class: 'info-head', html: `<span class="dot" style="--c: var(--fn-${item.color + 1})"></span>${mathLine(item.parsed.html)}` });
    const tabsId = nextId('info');
    const tab = (key, label) => h('button', {
      type: 'button',
      role: 'tab',
      id: `${tabsId}-${key}`,
      'aria-selected': String(this.infoTab === key),
      'aria-controls': `${tabsId}-panel`,
      tabindex: this.infoTab === key ? '0' : '-1',
      onClick: () => {
        this.infoTab = key;
        this.renderInfo();
        this.info.querySelector(`#${tabsId}-${key}`)?.focus();
        this.redraw();
      },
      onKeydown: (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          this.infoTab = this.infoTab === 'analysis' ? 'table' : 'analysis';
          this.renderInfo();
          this.info.querySelector(`#${tabsId}-${this.infoTab}`)?.focus();
          this.redraw();
        }
      },
    }, label);
    const tabs = h('div', { class: 'segmented is-block', role: 'tablist', 'aria-label': 'Сведения о функции' },
      tab('analysis', 'Анализ'), tab('table', 'Таблица значений'));
    const panel = h('div', { role: 'tabpanel', id: `${tabsId}-panel`, 'aria-labelledby': `${tabsId}-${this.infoTab}`, class: 'section' });
    if (this.infoTab === 'analysis') panel.append(...this.renderAnalysis(item));
    else {
      this.table.setFunction(item);
      panel.append(this.table.el);
    }
    this.info.append(head, tabs, panel);
  }

  renderAnalysis(item) {
    const { sections } = this.fm.analysis(item);
    const dl = h('dl', { class: 'analysis' }, sections.map((s) => {
      const [cls, label] = BADGES[s.status] ?? BADGES.unknown;
      return h('div', { class: `analysis-row${s.status === 'unknown' ? ' is-unknown' : ''}` },
        h('dt', {}, h('span', {}, s.title), h('span', { class: `badge ${cls}` }, label)),
        h('dd', {}, s.text, s.note ? h('div', { class: 'note' }, s.note) : null));
    }));
    const toggleId = nextId('markers');
    const toggle = h('label', { class: 'switch', for: toggleId },
      h('input', {
        id: toggleId,
        type: 'checkbox',
        role: 'switch',
        checked: this.showMarkers,
        onChange: (e) => {
          this.showMarkers = e.target.checked;
          this.redraw();
        },
      }),
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
      h('span', {}, 'Показать нули, экстремумы и асимптоты на графике'));
    return [toggle, dl];
  }

  describe() {
    const visible = this.fm.items.filter((i) => i.visible);
    this.app.setPlaneDescription(visible.length
      ? `На плоскости ${visible.length === 1 ? 'график функции' : 'графики функций'}: ${visible.map((i) => `y = ${i.parsed.text}`).join('; ')}.`
      : 'Плоскость пуста.');
  }

  // ─────────────── Плоскость ───────────────

  onHover(p) {
    let best = null;
    for (const item of this.fm.items) {
      if (!item.visible) continue;
      const y = item.parsed.evaluate(p.x);
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(this.cs.y2px(y) - p.py);
      if (d < 14 && (!best || d < best.d)) best = { item, x: p.x, y, d };
    }
    const had = this.hover;
    this.hover = best;
    if (had || best) this.redraw();
  }

  onClick() {
    if (this.hover) this.fm.select(this.hover.item.id);
  }

  cursorAt() {
    return this.hover ? 'pointer' : 'crosshair';
  }

  draw(r, now) {
    const sel = this.fm.selected;
    const visible = this.fm.items.filter((i) => i.visible);
    const ordered = [...visible.filter((i) => i !== sel), ...visible.filter((i) => i === sel)];
    let animating = false;

    if (this.showMarkers && sel?.visible) this.drawAsymptotes(r, sel);

    for (const item of ordered) {
      const t = Math.min(1, (now - item.revealAt) / REVEAL_MS);
      if (t < 1) animating = true;
      const reveal = 1 - (1 - t) ** 3;
      const isSel = item === sel;
      r.plotFunction(item.parsed.evaluate, {
        color: r.colors.fn[item.color],
        width: isSel ? 3 : 2.2,
        glow: isSel && visible.length > 1,
        alpha: sel && !isSel && visible.length > 1 ? 0.8 : 1,
        reveal,
      });
    }

    if (sel?.visible) {
      if (this.showMarkers) this.drawMarkers(r, sel);
      if (this.infoTab === 'table' && this.table.showPoints && this.table.item === sel) this.drawTablePoints(r, sel);
    }

    if (this.hover) {
      const { item, x, y } = this.hover;
      const color = r.colors.fn[item.color];
      r.drawPoint(x, y, { color, r: 5, ring: 5 });
      r.drawLabel(this.cs.x2px(x) + 12, this.cs.y2px(y) - 16, formatPoint(x, y, { decimals: Math.max(2, this.cs.decimalsX()) }), { border: color });
    }
    if (animating) r.requestRender();
  }

  drawAsymptotes(r, item) {
    const m = this.fm.analysis(item).markers;
    const style = { color: r.colors.muted, width: 1.5, dash: [6, 5] };
    for (const x of m.vlines) r.drawVLine(x, style);
    for (const F of m.vfamilies) forFamily(this.cs, F, (x) => r.drawVLine(x, style));
    for (const L of m.lines) r.drawLine(L.k, L.b, style);
  }

  drawMarkers(r, item) {
    const m = this.fm.analysis(item).markers;
    const f = item.parsed.evaluate;
    const color = r.colors.fn[item.color];
    const label = (x, y, text) => r.drawLabel(this.cs.x2px(x) + 10, this.cs.y2px(y) - 14, text, { color: r.colors.text, font: '600 11px "IBM Plex Sans", sans-serif' });
    for (const p of m.points) {
      const kind = p.kind;
      r.drawPoint(p.x, p.y, { color: kind === 'zero' ? r.colors.danger : kind === 'yint' ? r.colors.accent : color, r: 5 });
      if (kind === 'max' || kind === 'min') label(p.x, p.y, kind);
    }
    for (const F of m.families) {
      forFamily(this.cs, F, (x) => {
        const y = F.kind === 'zero' ? 0 : f(x);
        if (!Number.isFinite(y)) return;
        r.drawPoint(x, y, { color: F.kind === 'zero' ? r.colors.danger : color, r: 4.5 });
      });
    }
    for (const hole of m.holes) r.drawPoint(hole.x, hole.y, { color, r: 5, hollow: true });
  }

  drawTablePoints(r, item) {
    const color = r.colors.fn[item.color];
    const pts = this.table.points();
    for (const p of pts) {
      const active = this.tableHoverX !== null && p.x === this.tableHoverX;
      r.drawPoint(p.x, p.y, { color, r: active ? 6.5 : 4.5, ring: active ? 6 : 0 });
    }
    if (pts.length <= 15) {
      for (const p of pts) r.drawLabel(this.cs.x2px(p.x) + 9, this.cs.y2px(p.y) - 13, formatPoint(p.x, p.y), { font: '500 11px "JetBrains Mono", monospace' });
    } else if (this.tableHoverX !== null) {
      const p = pts.find((q) => q.x === this.tableHoverX);
      if (p) r.drawLabel(this.cs.x2px(p.x) + 10, this.cs.y2px(p.y) - 14, formatPoint(p.x, p.y), { border: color });
    }
  }
}

/** Вызвать fn для каждого члена семейства x0 + T·k, попадающего на экран. */
export function forFamily(cs, F, fn) {
  const { xMin, xMax } = cs.bounds;
  const k0 = Math.ceil((xMin - F.x0) / F.T), k1 = Math.floor((xMax - F.x0) / F.T);
  if (k1 - k0 > 300) return;
  for (let k = k0; k <= k1; k++) fn(F.x0 + F.T * k);
}
