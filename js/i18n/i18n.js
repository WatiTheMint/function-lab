// Мови інтерфейсу. tr('ключ', { параметри }) повертає рядок поточною мовою,
// trp('ключ', n) — правильну форму множини («1 точка», «3 точки», «5 точок»).
// Нова мова = новий словник у цій папці + рядок у LANGS.

import uk from './uk.js';
import ru from './ru.js';

export const LANGS = {
  uk: { label: 'УКР', name: 'Українська', dict: uk },
  ru: { label: 'РУС', name: 'Русский', dict: ru },
};
export const DEFAULT_LANG = 'uk';
const KEY = 'fl.lang';

let lang = DEFAULT_LANG;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (LANGS[saved]) lang = saved;
} catch {
  /* немає localStorage (Node, приватний режим) — лишаємо мову за замовчуванням */
}

const listeners = new Set();

export const getLang = () => lang;

export function setLang(next) {
  if (!LANGS[next] || next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* збереження недоступне */
  }
  for (const fn of [...listeners]) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(key) {
  const value = LANGS[lang].dict[key] ?? LANGS[DEFAULT_LANG].dict[key];
  if (value === undefined) console.warn(`i18n: немає ключа «${key}»`);
  return value;
}

/** Рядок за ключем; {name} у шаблоні замінюється на params.name. */
export function tr(key, params) {
  const value = lookup(key);
  if (value === undefined) return key;
  if (typeof value !== 'string' || !params) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/** Індекс форми множини: 0 — «одна», 1 — «кілька», 2 — «багато» (правило однакове для uk і ru). */
export function pluralIndex(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 2;
  if (b > 1 && b < 5) return 1;
  if (b === 1) return 0;
  return 2;
}

/** Форма слова для числа n: trp('pl.points', 3) → «точки». */
export function trp(key, n) {
  const forms = lookup(key);
  return Array.isArray(forms) ? forms[pluralIndex(n)] : key;
}

/** Переклад статичної розмітки: data-i18n (текст), data-i18n-html, data-i18n-attr="aria-label:ключ,title:ключ". */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = tr(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = tr(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      el.setAttribute(attr, tr(key));
    }
  }
}
