// ValueTable — таблица значений x | f(x) с настраиваемым диапазоном и шагом.
// Умеет отдавать точки для показа на графике.

import { parseConstant } from '../core/FunctionParser.js';
import { formatNumber, plural, roundTo, tickDecimals } from '../core/format.js';
import { h, clear, nextId } from './dom.js';
import { icon } from './icons.js';

export const MAX_ROWS = 201;

/** Значения x от start до end с шагом step без накопления ошибок float. */
export function tableXs(start, end, step) {
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  const decimals = Math.min(10, Math.max(tickDecimals(step), decimalsOf(start)) + 2);
  return Array.from({ length: count }, (_, i) => roundTo(start + i * step, decimals));
}

function decimalsOf(v) {
  const s = String(v);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function formatTableValue(y) {
  if (!Number.isFinite(y)) return null;
  const text = formatNumber(y);
  return Math.abs(roundTo(y, 4) - y) > 1e-12 && Math.abs(y) < 1e7 && Math.abs(y) >= 1e-4 ? `≈ ${text}` : text;
}

export class ValueTable {
  /**
   * @param {{ onChange?: (state) => void, onHoverRow?: (x:number|null) => void }} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.item = null;
    this.range = { start: -3, end: 3, step: 1 };
    this.showPoints = false;
    this.rows = [];
    const id = nextId('vt');

    const field = (key, label) => {
      const input = h('input', {
        id: `${id}-${key}`,
        class: 'input mono',
        type: 'text',
        inputmode: 'decimal',
        value: String(this.range[key]).replace('.', ','),
        onChange: () => this.readRange(),
        onKeydown: (e) => { if (e.key === 'Enter') this.readRange(); },
      });
      this[`${key}Input`] = input;
      return h('div', { class: 'field' }, h('label', { class: 'label', for: input.id }, label), input);
    };

    this.error = h('p', { class: 'formula-feedback is-error', role: 'alert' });
    this.toggleBtn = h('button', {
      type: 'button',
      class: 'btn btn-block',
      'aria-pressed': 'false',
      onClick: () => this.setShowPoints(!this.showPoints),
    }, icon('dot', 16), h('span', {}, 'Показати точки на графіку'));
    this.tableWrap = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Таблиця значень' });

    this.el = h('div', { class: 'section' },
      h('div', { class: 'range-grid' }, field('start', 'Початок'), field('end', 'Кінець'), field('step', 'Крок')),
      this.error,
      this.toggleBtn,
      this.tableWrap,
    );
  }

  setFunction(item) {
    this.item = item;
    this.render();
  }

  readRange() {
    const vals = {};
    for (const key of ['start', 'end', 'step']) {
      const res = parseConstant(this[`${key}Input`].value);
      this[`${key}Input`].setAttribute('aria-invalid', res.ok ? 'false' : 'true');
      if (!res.ok) return this.fail(`«${this[`${key}Input`].value || 'порожньо'}» — не число`);
      vals[key] = res.value;
    }
    if (!(vals.step > 0)) return this.fail('Крок має бути більшим за нуль');
    if (vals.end < vals.start) return this.fail('Кінець діапазону має бути не меншим за початок');
    const count = Math.floor((vals.end - vals.start) / vals.step + 1e-9) + 1;
    if (count > MAX_ROWS) return this.fail(`Вийде ${count} ${plural(count, 'рядок', 'рядки', 'рядків')} — це забагато. Збільште крок або звузьте діапазон (максимум ${MAX_ROWS}).`);
    this.error.textContent = '';
    this.range = vals;
    this.render();
    this.hooks.onChange?.();
    return true;
  }

  fail(msg) {
    this.error.textContent = msg;
    return false;
  }

  setShowPoints(on) {
    this.showPoints = on;
    this.toggleBtn.setAttribute('aria-pressed', String(on));
    this.toggleBtn.querySelector('span').textContent = on ? 'Сховати точки на графіку' : 'Показати точки на графіку';
    this.hooks.onChange?.();
  }

  /** Точки таблицы для отрисовки (только определённые значения). */
  points() {
    return this.rows.filter((r) => Number.isFinite(r.y));
  }

  render() {
    clear(this.tableWrap);
    if (!this.item) return;
    const f = this.item.parsed.evaluate;
    const xs = tableXs(this.range.start, this.range.end, this.range.step);
    this.rows = xs.map((x) => ({ x, y: f(x) }));
    const tbody = h('tbody', {}, this.rows.map((r) => {
      const text = formatTableValue(r.y);
      return h('tr', {
        onMouseenter: () => this.hooks.onHoverRow?.(r.x),
        onMouseleave: () => this.hooks.onHoverRow?.(null),
      },
      h('td', {}, formatNumber(r.x, { decimals: 6 })),
      text === null ? h('td', { class: 'is-undefined' }, 'не визначено') : h('td', {}, text));
    }));
    this.tableWrap.append(h('table', { class: 'value-table' },
      h('caption', {}, `${this.rows.length} ${plural(this.rows.length, 'рядок', 'рядки', 'рядків')} · значення округлено до 4 знаків, «≈» — значення неточне`),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'x'), h('th', { scope: 'col' }, 'f(x)'))),
      tbody));
  }
}
