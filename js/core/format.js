// Форматирование чисел для интерфейса.
// Русская запись: десятичная запятая, типографский минус «−», точки как (3; 11).
// Ни одна функция здесь не возвращает строки "NaN" или "Infinity".

export const MINUS = '−';

const SUPERSCRIPT = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻',
};
const SUBSCRIPT = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', ',': ',', '.': ',',
};

export const toSuperscript = (s) => String(s).replace(/[0-9-]/g, (c) => SUPERSCRIPT[c]);
export const toSubscript = (s) => String(s).replace(/[0-9.,]/g, (c) => SUBSCRIPT[c]);

export function roundTo(v, decimals) {
  const k = 10 ** decimals;
  return Math.round(v * k) / k;
}

function plain(v, decimals) {
  let s = roundTo(v, decimals).toFixed(decimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('-', MINUS).replace('.', ',');
}

/**
 * Число → строка. Для NaN/±Infinity возвращает null — вызывающий код
 * обязан показать понятный текст (см. formatValue).
 */
export function formatNumber(v, { decimals = 4 } = {}) {
  if (!Number.isFinite(v)) return null;
  const a = Math.abs(v);
  if (a < 1e-12) return '0';
  if (a >= 1e7 || a < 10 ** -decimals / 2) {
    let exp = Math.floor(Math.log10(a));
    let m = roundTo(v / 10 ** exp, 3);
    if (Math.abs(m) >= 10) {
      m /= 10;
      exp += 1;
    }
    return `${plain(m, 3)}·10${toSuperscript(exp)}`;
  }
  return plain(v, decimals);
}

/** Значение функции для показа пользователю: всегда осмысленная строка. */
export function formatValue(v, opts) {
  if (Number.isNaN(v)) return 'не определено';
  if (!Number.isFinite(v)) return 'слишком велико';
  return formatNumber(v, opts);
}

export function formatPoint(x, y, opts) {
  return `(${formatValue(x, opts)}; ${formatValue(y, opts)})`;
}

/**
 * Пытается распознать «красивое» число: целое, простую дробь или √n.
 * exact=true означает, что значение совпало с распознанной формой
 * с точностью до ошибок округления float (1e-9).
 */
export function describeNumber(v, { tol = 1e-9 } = {}) {
  if (!Number.isFinite(v)) return { text: '—', exact: false, value: v };
  const t = tol * Math.max(1, Math.abs(v));
  const r = Math.round(v);
  if (Math.abs(v - r) <= t) return { text: formatNumber(r), exact: true, value: r };
  for (let q = 2; q <= 16; q++) {
    const p = Math.round(v * q);
    if (Math.abs(v - p / q) <= t) {
      const val = p / q;
      if (Math.abs(roundTo(val, 4) - val) < 1e-12) return { text: formatNumber(val), exact: true, value: val };
      return { text: `${p < 0 ? MINUS : ''}${Math.abs(p)}/${q}`, exact: true, value: val };
    }
  }
  // ±√n и ±√n/q (корни квадратных уравнений с целыми коэффициентами)
  for (let q = 1; q <= 4; q++) {
    const sq = (v * q) ** 2;
    const n = Math.round(sq);
    if (n > 1 && n <= 2000 && Math.abs(sq - n) <= 1e-9 * Math.max(1, sq) && !Number.isInteger(Math.sqrt(n))) {
      const sign = v < 0 ? MINUS : '';
      return { text: `${sign}√${n}${q > 1 ? `/${q}` : ''}`, exact: true, value: v };
    }
  }
  return { text: formatNumber(v), exact: false, value: v };
}

/** Строка с «≈», если число не распознано как точное. */
export function formatApprox(v) {
  const d = describeNumber(v);
  return d.exact ? d.text : `≈ ${d.text}`;
}

/** v как кратное π («π/2», «−3π/4», «2π»), или null. */
export function formatPiMultiple(v) {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < 1e-12) return '0';
  const c = v / Math.PI;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(c * q);
    if (p !== 0 && Math.abs(c - p / q) <= 1e-9 * Math.max(1, Math.abs(c))) {
      const g = gcd(Math.abs(p), q);
      const pp = p / g;
      const qq = q / g;
      const sign = pp < 0 ? MINUS : '';
      const num = Math.abs(pp) === 1 ? 'π' : `${Math.abs(pp)}π`;
      return qq === 1 ? `${sign}${num}` : `${sign}${num}/${qq}`;
    }
  }
  return null;
}

/** Точное число, кратное π, или обычная запись с «≈». */
export function formatPiOrApprox(v) {
  return formatPiMultiple(v) ?? formatApprox(v);
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Сколько знаков после запятой нужно, чтобы подписи делений с шагом step различались. */
export function tickDecimals(step) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

export function formatTick(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  return formatNumber(v, { decimals: Math.min(10, tickDecimals(step)) });
}

/** Склонение: plural(3, 'точка', 'точки', 'точек'). */
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
