// Многочлены как массивы коэффициентов от младшего к старшему: [a0, a1, a2] = a0 + a1·x + a2·x².
// Нулевой многочлен — пустой массив. Используется анализатором для точных выводов
// (корни, знаки, производные) у многочленов и дробно-рациональных функций.

import { describeNumber } from './format.js';

export function trim(p, relTol = 1e-12) {
  let scale = 0;
  for (const c of p) scale = Math.max(scale, Math.abs(c));
  let n = p.length;
  while (n > 0 && Math.abs(p[n - 1]) <= relTol * scale) n--;
  return scale === 0 ? [] : p.slice(0, n);
}

export const degree = (p) => trim(p).length - 1;
export const isZero = (p) => trim(p).length === 0;

export function evaluate(p, x) {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = y * x + p[i];
  return y;
}

/** Масштаб ошибки округления при вычислении p(x) — для сравнения «≈ 0». */
function evalScale(p, x) {
  let s = 0;
  let xp = 1;
  const ax = Math.abs(x);
  for (const c of p) {
    s += Math.abs(c) * xp;
    xp *= ax;
  }
  return s;
}

export function add(a, b) {
  const out = new Array(Math.max(a.length, b.length)).fill(0);
  a.forEach((c, i) => { out[i] += c; });
  b.forEach((c, i) => { out[i] += c; });
  return trim(out);
}

export const scale = (p, k) => trim(p.map((c) => c * k));
export const sub = (a, b) => add(a, scale(b, -1));

export function mul(a, b) {
  if (!a.length || !b.length) return [];
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return trim(out);
}

export function derivative(p) {
  return trim(p.slice(1).map((c, i) => c * (i + 1)));
}

/** Деление с остатком: a = b·q + r. */
export function divmod(a, b) {
  a = trim(a);
  b = trim(b);
  if (!b.length) throw new Error('division by zero polynomial');
  const r = a.slice();
  const q = new Array(Math.max(0, a.length - b.length + 1)).fill(0);
  for (let k = a.length - b.length; k >= 0; k--) {
    const c = r[k + b.length - 1] / b[b.length - 1];
    q[k] = c;
    for (let j = 0; j < b.length; j++) r[k + j] -= c * b[j];
  }
  return { q: trim(q), r: trim(r.slice(0, b.length - 1), 1e-10) };
}

export function pow(p, n) {
  let out = [1];
  for (let i = 0; i < n; i++) out = mul(out, p);
  return out;
}

function cauchyBound(p) {
  const lead = Math.abs(p[p.length - 1]);
  let m = 0;
  for (let i = 0; i < p.length - 1; i++) m = Math.max(m, Math.abs(p[i]) / lead);
  return 1 + m;
}

function bisect(p, a, b) {
  let fa = evaluate(p, a);
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    const fm = evaluate(p, m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

/** Если рядом есть «красивое» число, которое не хуже как корень — берём его. */
function snap(p, r) {
  const d = describeNumber(r, { tol: 1e-7 });
  if (!d.exact || d.value === r) return r;
  return Math.abs(evaluate(p, d.value)) <= Math.abs(evaluate(p, r)) ? d.value : r;
}

function quadraticRoots(a, b, c) {
  const disc = b * b - 4 * a * c;
  const scaleD = b * b + Math.abs(4 * a * c);
  if (Math.abs(disc) <= 1e-12 * scaleD) return [-b / (2 * a)];
  if (disc < 0) return [];
  const q = -(b + Math.sign(b || 1) * Math.sqrt(disc)) / 2;
  const roots = [q / a, c / q].sort((u, v) => u - v);
  return roots;
}

/** Все действительные корни (различные, по возрастанию). */
export function realRoots(p) {
  p = trim(p);
  const n = p.length - 1;
  if (n < 1) return [];
  if (p[0] === 0) {
    // x = 0 — корень; делим на x
    let k = 0;
    while (p[k] === 0) k++;
    return uniq([0, ...realRoots(p.slice(k))].map((r) => snap(p, r)));
  }
  let roots;
  if (n === 1) roots = [-p[0] / p[1]];
  else if (n === 2) roots = quadraticRoots(p[2], p[1], p[0]);
  else {
    const crit = realRoots(derivative(p));
    const B = cauchyBound(p);
    const pts = [-B, ...crit.filter((c) => c > -B && c < B), B];
    roots = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const fa = evaluate(p, a), fb = evaluate(p, b);
      if (fa === 0) roots.push(a);
      else if (Math.sign(fa) !== Math.sign(fb) && fb !== 0) roots.push(bisect(p, a, b));
    }
    if (evaluate(p, B) === 0) roots.push(B);
    // кратные корни: критическая точка, где p ≈ 0
    for (const c of crit) if (Math.abs(evaluate(p, c)) <= 1e-9 * evalScale(p, c)) roots.push(c);
  }
  return uniq(roots.map((r) => snap(p, r)));
}

function uniq(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const x of s) {
    if (!out.length || Math.abs(x - out[out.length - 1]) > 1e-9 * Math.max(1, Math.abs(x))) out.push(x);
  }
  return out;
}

/** Кратность корня r (сколько производных обращаются в ноль). */
export function multiplicity(p, r) {
  let m = 0;
  let q = trim(p);
  while (q.length && Math.abs(evaluate(q, r)) <= 1e-8 * Math.max(1e-300, evalScale(q, r))) {
    m++;
    q = derivative(q);
  }
  return m;
}

/** p(−x) как многочлен. */
export const reflect = (p) => p.map((c, i) => (i % 2 ? -c : c));

/** Совпадают ли многочлены с относительной точностью. */
export function nearlyEqual(a, b, tol = 1e-10) {
  const n = Math.max(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s = Math.max(s, Math.abs(a[i] ?? 0), Math.abs(b[i] ?? 0));
  for (let i = 0; i < n; i++) if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > tol * Math.max(1, s)) return false;
  return true;
}
