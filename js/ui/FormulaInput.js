// Поле ввода формулы с живым предпросмотром и понятными ошибками.
// При ошибке курсор выделяет проблемное место в строке.

import { parseFunction } from '../core/FunctionParser.js';
import { h, nextId } from './dom.js';

const ERROR_DELAY = 900;

export const MATH_KEYS = [
  { label: 'x²', insert: '^2' },
  { label: 'xⁿ', insert: '^' },
  { label: '√', insert: 'sqrt(', close: ')' },
  { label: '|x|', insert: '|', close: '|' },
  { label: 'a/b', insert: '/' },
  { label: 'π', insert: 'pi' },
  { label: 'e', insert: 'e' },
  { label: 'sin', insert: 'sin(', close: ')' },
  { label: 'cos', insert: 'cos(', close: ')' },
  { label: 'ln', insert: 'ln(', close: ')' },
];

export class FormulaInput {
  /**
   * @param {object} o
   * @param {string} o.label — подпись для экранных читалок
   * @param {string} [o.prefix] — «y =» перед полем
   * @param {string} [o.value]
   * @param {string} [o.placeholder]
   * @param {string} [o.submitLabel] — текст кнопки; без него кнопки нет
   * @param {(parsed:object, source:string) => ({ok:boolean, error?:object}|void)} o.onSubmit
   * @param {boolean} [o.keys] — показать ряд кнопок-вставок (удобно на телефоне)
   * @param {() => void} [o.onCancel] — Esc
   */
  constructor({ label, prefix = 'y =', value = '', placeholder = 'например, x^2 − 4', submitLabel = null, onSubmit, keys = false, onCancel = null, visibleLabel = false }) {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.prefix = prefix || 'y =';
    this.timer = 0;
    const id = nextId('formula');
    const fbId = `${id}-fb`;

    this.input = h('input', {
      id,
      class: 'formula-input',
      type: 'text',
      value,
      placeholder,
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      inputmode: 'text',
      enterkeyhint: 'done',
      'aria-describedby': fbId,
      ...(visibleLabel ? {} : { 'aria-label': label }),
      onInput: () => this.onInput(),
      onKeydown: (e) => this.onKeydown(e),
      onBlur: () => this.validate(true),
    });
    this.field = h('div', { class: 'formula-field' },
      prefix ? h('span', { class: 'formula-prefix', 'aria-hidden': 'true' }, prefix) : null,
      this.input,
    );
    this.feedback = h('div', { class: 'formula-feedback', id: fbId, 'aria-live': 'polite' });
    const row = h('div', { class: 'formula-row' }, this.field,
      submitLabel ? h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel) : null);
    this.el = h('form', {
      class: 'field',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        this.submit();
      },
    },
    visibleLabel ? h('label', { class: 'label', for: id }, label) : null,
    row,
    this.feedback,
    keys ? this.renderKeys() : null);
    if (value) this.validate(false);
  }

  renderKeys() {
    return h('div', { class: 'math-keys', role: 'group', 'aria-label': 'Вставить в формулу' },
      MATH_KEYS.map((k) => h('button', {
        type: 'button',
        class: 'math-key',
        'aria-label': `Вставить ${k.label}`,
        onClick: () => this.insert(k.insert, k.close ?? ''),
      }, k.label)));
  }

  insert(text, close = '') {
    const { input } = this;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const selected = input.value.slice(start, end);
    input.value = input.value.slice(0, start) + text + selected + close + input.value.slice(end);
    const caret = start + text.length + selected.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    this.onInput();
  }

  get value() {
    return this.input.value;
  }

  setValue(v) {
    this.input.value = v;
    this.validate(false);
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  onInput() {
    clearTimeout(this.timer);
    this.validate(false);
    this.timer = setTimeout(() => this.validate(true), ERROR_DELAY);
  }

  onKeydown(e) {
    if (e.key === 'Escape' && this.onCancel) {
      e.preventDefault();
      this.onCancel();
    }
  }

  /** showErrors=false: пока человек печатает, показываем только удачный предпросмотр. */
  validate(showErrors) {
    const src = this.input.value;
    if (!src.trim()) {
      this.setState(null);
      return null;
    }
    const res = parseFunction(src);
    if (res.ok) this.setState({ html: res.html });
    else if (showErrors) this.setState({ error: res.error.message });
    else this.setState(null, true);
    return res;
  }

  setState(state, keepError = false) {
    const fb = this.feedback;
    if (keepError && fb.classList.contains('is-error')) return;
    fb.classList.toggle('is-error', Boolean(state?.error));
    this.field.classList.toggle('is-invalid', Boolean(state?.error));
    this.input.setAttribute('aria-invalid', state?.error ? 'true' : 'false');
    if (!state) fb.textContent = '';
    else if (state.error) fb.textContent = state.error;
    else fb.innerHTML = `<span class="sr-only">Распознано: </span><span class="math-lhs" aria-hidden="true">${this.prefix}</span><span class="math">${state.html}</span>`;
  }

  showError(error) {
    this.setState({ error: error.message });
    if (Number.isFinite(error.start) && error.end > error.start) {
      this.input.focus();
      this.input.setSelectionRange(error.start, Math.min(error.end, this.input.value.length));
    }
  }

  submit() {
    clearTimeout(this.timer);
    const res = parseFunction(this.input.value);
    if (!res.ok) {
      this.showError(res.error);
      return;
    }
    const outcome = this.onSubmit?.(res, this.input.value);
    if (outcome && outcome.ok === false) this.showError(outcome.error);
  }
}
