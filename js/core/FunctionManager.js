// FunctionManager — список функций пользователя: добавление, изменение, удаление,
// видимость, цвет, выбранная функция. Состояние сохраняется в localStorage.

import { EventEmitter } from './EventEmitter.js';
import { parseFunction } from './FunctionParser.js';
import { analyzeFunction } from './FunctionAnalyzer.js';
import { storage } from '../ui/dom.js';

export const MAX_FUNCTIONS = 8;
export const COLOR_NAMES = ['синий', 'красный', 'зелёный', 'фиолетовый', 'оранжевый', 'бирюзовый', 'розовый', 'оливковый'];
const KEY = 'fl.functions';
const DEFAULTS = ['x^2', '2x + 1'];

let nextId = 1;

export class FunctionManager extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this.selectedId = null;
    this.load();
  }

  get selected() {
    return this.items.find((i) => i.id === this.selectedId) ?? null;
  }

  get(id) {
    return this.items.find((i) => i.id === id) ?? null;
  }

  freeColor() {
    const used = new Set(this.items.map((i) => i.color));
    for (let c = 0; c < MAX_FUNCTIONS; c++) if (!used.has(c)) return c;
    return this.items.length % MAX_FUNCTIONS;
  }

  makeItem(parsed, { color, visible = true, animate = true } = {}) {
    return {
      id: nextId++,
      source: parsed.source,
      parsed,
      color: color ?? this.freeColor(),
      visible,
      revealAt: animate ? performance.now() : -Infinity,
      _analysis: null,
    };
  }

  /** Анализ считается лениво и кэшируется. */
  analysis(item) {
    if (!item._analysis) item._analysis = analyzeFunction(item.parsed);
    return item._analysis;
  }

  /** @returns {{ok:true,item}|{ok:false,error}} */
  add(source, opts = {}) {
    if (this.items.length >= MAX_FUNCTIONS) {
      return { ok: false, error: { message: `Можно построить не больше ${MAX_FUNCTIONS} функций одновременно. Удалите одну из списка.`, start: 0, end: 0 } };
    }
    const parsed = parseFunction(source);
    if (!parsed.ok) return parsed;
    const item = this.makeItem(parsed, opts);
    if (opts.index !== undefined) this.items.splice(opts.index, 0, item);
    else this.items.push(item);
    this.selectedId = item.id;
    this.changed();
    return { ok: true, item };
  }

  update(id, source) {
    const item = this.get(id);
    if (!item) return { ok: false, error: { message: 'Функция не найдена', start: 0, end: 0 } };
    const parsed = parseFunction(source);
    if (!parsed.ok) return parsed;
    item.parsed = parsed;
    item.source = parsed.source;
    item._analysis = null;
    item.revealAt = performance.now();
    this.changed();
    return { ok: true, item };
  }

  /** Удаляет и возвращает данные для «Отменить». */
  remove(id) {
    const index = this.items.findIndex((i) => i.id === id);
    if (index < 0) return null;
    const [item] = this.items.splice(index, 1);
    if (this.selectedId === id) this.selectedId = this.items[Math.min(index, this.items.length - 1)]?.id ?? null;
    this.changed();
    return { item, index };
  }

  restore({ item, index }) {
    if (this.items.length >= MAX_FUNCTIONS) return false;
    this.items.splice(Math.min(index, this.items.length), 0, item);
    this.selectedId = item.id;
    item.revealAt = performance.now();
    this.changed();
    return true;
  }

  toggle(id) {
    const item = this.get(id);
    if (!item) return;
    item.visible = !item.visible;
    if (item.visible) item.revealAt = performance.now();
    this.changed();
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit('select', id);
    this.changed(false);
  }

  cycleColor(id) {
    const item = this.get(id);
    if (!item) return;
    item.color = (item.color + 1) % MAX_FUNCTIONS;
    this.changed();
  }

  changed(persist = true) {
    if (persist) this.save();
    this.emit('change');
  }

  save() {
    storage.set(KEY, {
      items: this.items.map((i) => ({ source: i.source, color: i.color, visible: i.visible })),
      selected: this.items.findIndex((i) => i.id === this.selectedId),
    });
  }

  load() {
    const saved = storage.get(KEY, null);
    const list = saved?.items ?? DEFAULTS.map((source) => ({ source }));
    for (const entry of list.slice(0, MAX_FUNCTIONS)) {
      const parsed = parseFunction(entry.source);
      if (!parsed.ok) continue;
      this.items.push(this.makeItem(parsed, { color: entry.color, visible: entry.visible ?? true, animate: false }));
    }
    this.selectedId = this.items[saved?.selected ?? 0]?.id ?? this.items[0]?.id ?? null;
  }
}
