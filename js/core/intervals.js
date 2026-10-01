// Числовые множества как отсортированные списки промежутков { a, b, aIn, bIn }.
// a может быть −∞, b — +∞; aIn/bIn — входит ли конец в множество.

import { formatApprox, MINUS } from './format.js';

export const REAL = () => [{ a: -Infinity, b: Infinity, aIn: false, bIn: false }];

const same = (u, v) => u === v || (Number.isFinite(u) && Number.isFinite(v) && Math.abs(u - v) <= 1e-12 * Math.max(1, Math.abs(u)));

export function normalize(list) {
  const sorted = list
    .filter((I) => I.a < I.b || (same(I.a, I.b) && I.aIn && I.bIn))
    .map((I) => ({ ...I }))
    .sort((p, q) => p.a - q.a || Number(q.aIn) - Number(p.aIn));
  const out = [];
  for (const I of sorted) {
    const last = out[out.length - 1];
    if (last && (I.a < last.b || (same(I.a, last.b) && (last.bIn || I.aIn)))) {
      if (I.b > last.b && !same(I.b, last.b)) {
        last.b = I.b;
        last.bIn = I.bIn;
      } else if (same(I.b, last.b)) last.bIn = last.bIn || I.bIn;
    } else out.push(I);
  }
  return out;
}

export function intersect(A, B) {
  const out = [];
  for (const I of A) {
    for (const J of B) {
      let a, aIn, b, bIn;
      if (same(I.a, J.a)) { a = I.a; aIn = I.aIn && J.aIn; } else if (I.a > J.a) { a = I.a; aIn = I.aIn; } else { a = J.a; aIn = J.aIn; }
      if (same(I.b, J.b)) { b = I.b; bIn = I.bIn && J.bIn; } else if (I.b < J.b) { b = I.b; bIn = I.bIn; } else { b = J.b; bIn = J.bIn; }
      if (a < b || (same(a, b) && aIn && bIn)) out.push({ a, b, aIn, bIn });
    }
  }
  return normalize(out);
}

export function contains(S, x) {
  return S.some((I) => (x > I.a || (I.aIn && same(x, I.a))) && (x < I.b || (I.bIn && same(x, I.b))));
}

export const isReal = (S) => S.length === 1 && S[0].a === -Infinity && S[0].b === Infinity;

/** Если S = ℝ без конечного набора точек — эти точки, иначе null. */
export function excludedPoints(S) {
  if (!S.length || S[0].a !== -Infinity || S[S.length - 1].b !== Infinity) return null;
  const pts = [];
  for (let i = 0; i + 1 < S.length; i++) {
    if (!same(S[i].b, S[i + 1].a) || S[i].bIn || S[i + 1].aIn) return null;
    pts.push(S[i].b);
  }
  return pts;
}

export function isSymmetric(S) {
  const mirrored = normalize(S.map((I) => ({ a: -I.b, b: -I.a, aIn: I.bIn, bIn: I.aIn })));
  if (mirrored.length !== S.length) return false;
  return S.every((I, i) => {
    const J = mirrored[i];
    return same(I.a, J.a) && same(I.b, J.b) && I.aIn === J.aIn && I.bIn === J.bIn;
  });
}

const fmtEnd = (v) => (v === -Infinity ? `${MINUS}∞` : v === Infinity ? '+∞' : formatApprox(v));

export function formatInterval(I) {
  if (same(I.a, I.b)) return `{${fmtEnd(I.a)}}`;
  return `${I.aIn ? '[' : '('}${fmtEnd(I.a)}; ${fmtEnd(I.b)}${I.bIn ? ']' : ')'}`;
}

export function formatSet(S) {
  if (!S.length) return '∅';
  if (isReal(S)) return 'ℝ';
  return S.map(formatInterval).join(' ∪ ');
}
