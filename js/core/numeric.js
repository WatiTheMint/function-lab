// Численные инструменты: бисекция, золотое сечение, поиск разрывов, сравнение функций.

import { describeNumber } from './format.js';

export const isNum = Number.isFinite;

export function linspace(a, b, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = a + ((b - a) * i) / (n - 1);
  return out;
}

/** Корень на [a, b] при разных знаках fa и fb. */
export function bisect(f, a, b, fa = f(a), fb = f(b)) {
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (m <= a || m >= b) break;
    const fm = f(m);
    if (fm === 0) return m;
    if (!isNum(fm)) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; }
  }
  return Math.abs(fa) < Math.abs(fb) ? a : b;
}

/** Минимум унимодальной функции на [a, b]. */
export function goldenMin(f, a, b, iters = 120) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < iters && b - a > 1e-13 * Math.max(1, Math.abs(a)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Есть ли между a и b разрыв (скачок, полюс или «дыра» в области определения). */
export function hasJump(f, a, b, fa = f(a), fb = f(b), depth = 0) {
  if (!isNum(fa) || !isNum(fb)) return true;
  const d = Math.abs(fb - fa);
  if (d <= 1e-9 * (1 + Math.abs(fa))) return false;
  if (depth > 45 || b - a <= 1e-13 * (1 + Math.abs(a))) return d > 1e-6 * (1 + Math.abs(fa));
  const m = (a + b) / 2;
  const fm = f(m);
  if (!isNum(fm)) return true;
  return Math.abs(fm - fa) > Math.abs(fb - fm) ? hasJump(f, a, m, fa, fm, depth + 1) : hasJump(f, m, b, fm, fb, depth + 1);
}

/** Граница области определения между a (определено) и b (не определено). */
export function domainEdge(f, a, b) {
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    if (isNum(f(m))) a = m; else b = m;
  }
  const d = describeNumber(a, { tol: 1e-9 });
  if (d.exact && isNum(f(d.value))) return { x: d.value, closed: true };
  if (d.exact) return { x: d.value, closed: false };
  return { x: a, closed: true };
}

/** «Удобные» x для объяснений: сначала маленькие целые. */
export const PROBE_XS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 0.5, -0.5, 5, -5, 1.5, -1.5, 6, -6];

/**
 * Совпадают ли две функции на отрезке (одинаковые значения и одинаковая область определения).
 * Возвращает первую «понятную» точку расхождения.
 */
export function compareFunctions(f, g, { xMin = -10, xMax = 10, n = 600, tol = 1e-6 } = {}) {
  const differ = (x) => {
    const a = f(x), b = g(x);
    if (!isNum(a) && !isNum(b)) return false;
    if (isNum(a) !== isNum(b)) return true;
    return Math.abs(a - b) > tol * Math.max(1, Math.abs(a), Math.abs(b));
  };
  for (const x of PROBE_XS) if (x >= xMin && x <= xMax && differ(x)) return { equal: false, x, fx: f(x), gx: g(x) };
  // нерегулярная сетка, чтобы не попадать только в «особые» точки
  for (let i = 0; i < n; i++) {
    const x = xMin + ((xMax - xMin) * (i + 0.5 + 0.37 * Math.sin(i * 12.9898))) / n;
    if (differ(x)) return { equal: false, x, fx: f(x), gx: g(x) };
  }
  return { equal: true };
}
