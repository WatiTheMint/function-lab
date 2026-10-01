// FunctionAnalyzer — исследование функции: область определения, нули, пересечение с Oy,
// монотонность, экстремумы, чётность, асимптоты.
//
// Принцип честности: у каждого вывода есть статус.
//   exact   — получено аналитически (многочлены, дробно-рациональные функции, монотонные
//             композиции, тригонометрия от линейного аргумента), числа могут быть иррациональными (≈);
//   numeric — найдено численно на ограниченном отрезке, это оценка;
//   unknown — «Не удалось определить автоматически».

import { compile, dependsOnX, explainAt, FUNCTIONS, oddRootDenominator, realPow } from './FunctionParser.js';
import * as P from './polynomial.js';
import * as S from './intervals.js';
import { bisect, domainEdge, goldenMin, hasJump, isNum, linspace } from './numeric.js';
import { describeNumber, formatApprox, formatNumber, formatPiMultiple, formatPiOrApprox, MINUS } from './format.js';

export const EXACT = 'exact';
export const NUMERIC = 'numeric';
export const UNKNOWN = 'unknown';
export const UNKNOWN_TEXT = 'Не вдалося визначити автоматично';

const WINDOW = [-10, 10];
const ZERO_WINDOW = [-50, 50];
const PI = Math.PI;

const isConst = (node) => !dependsOnX(node);
const constValue = (node) => compile(node)(0);

// ───────────────────────── Дробно-рациональная форма ─────────────────────────

function normRational(r) {
  if (!r) return null;
  const num = P.trim(r.num);
  const den = P.trim(r.den);
  if (!den.length) return null;
  const lead = den[den.length - 1];
  if (den.length === 1) return { num: P.scale(num, 1 / lead), den: [1] };
  return { num: P.scale(num, 1 / lead), den: P.scale(den, 1 / lead) };
}

/** Представить выражение как P(x)/Q(x) без сокращений (важно для области определения). */
export function toRational(node) {
  if (isConst(node)) {
    const v = constValue(node);
    return isNum(v) ? { num: P.trim([v]), den: [1] } : null;
  }
  switch (node.type) {
    case 'var':
      return { num: [0, 1], den: [1] };
    case 'neg': {
      const r = toRational(node.arg);
      return r && { num: P.scale(r.num, -1), den: r.den };
    }
    case 'add':
    case 'sub': {
      const a = toRational(node.left), b = toRational(node.right);
      if (!a || !b) return null;
      const bn = node.type === 'sub' ? P.scale(b.num, -1) : b.num;
      if (a.den.length === 1 && b.den.length === 1 && a.den[0] === b.den[0]) return { num: P.add(a.num, bn), den: a.den };
      return { num: P.add(P.mul(a.num, b.den), P.mul(bn, a.den)), den: P.mul(a.den, b.den) };
    }
    case 'mul': {
      const a = toRational(node.left), b = toRational(node.right);
      return a && b ? { num: P.mul(a.num, b.num), den: P.mul(a.den, b.den) } : null;
    }
    case 'div': {
      const a = toRational(node.left), b = toRational(node.right);
      if (!a || !b || !b.num.length) return null;
      return { num: P.mul(a.num, b.den), den: P.mul(a.den, b.num) };
    }
    case 'pow': {
      if (!isConst(node.exponent)) return null;
      const e = constValue(node.exponent);
      if (!Number.isInteger(e) || Math.abs(e) > 16) return null;
      const r = toRational(node.base);
      if (!r) return null;
      if (e >= 0) return { num: P.pow(r.num, e), den: P.pow(r.den, e) };
      if (!r.num.length) return null;
      return { num: P.pow(r.den, -e), den: P.pow(r.num, -e) };
    }
    default:
      return null;
  }
}

const evalR = (R, x) => P.evaluate(R.num, x) / P.evaluate(R.den, x);

function linearOf(node) {
  const R = normRational(toRational(node));
  if (!R || R.den.length !== 1 || R.num.length !== 2) return null;
  return { a: R.num[1], b: R.num[0] };
}

function testPoint(lo, hi) {
  if (lo === -Infinity && hi === Infinity) return 0;
  if (lo === -Infinity) return hi - 1;
  if (hi === Infinity) return lo + 1;
  return (lo + hi) / 2;
}

/** Множество x, где R(x) ≥ 0 / > 0 / ≠ 0 (rel = 'ge' | 'gt' | 'ne'). */
function signSet(R, rel) {
  const zeros = P.realRoots(R.num);
  const poles = P.realRoots(R.den);
  if (!R.num.length) {
    if (rel !== 'ge') return [];
    return S.normalize(cutsToIntervals(poles, () => true));
  }
  const ok = (v) => (rel === 'ge' ? v >= 0 : rel === 'gt' ? v > 0 : v !== 0);
  const pts = [...zeros, ...poles].sort((a, b) => a - b);
  const out = cutsToIntervals(pts, (lo, hi) => ok(evalR(R, testPoint(lo, hi))));
  if (rel === 'ge') {
    for (const z of zeros) if (!poles.some((p) => Math.abs(p - z) < 1e-12 * Math.max(1, Math.abs(z)))) out.push({ a: z, b: z, aIn: true, bIn: true });
  }
  return S.normalize(out);
}

function cutsToIntervals(pts, keep) {
  const cuts = [-Infinity, ...pts, Infinity];
  const out = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    if (cuts[k] === cuts[k + 1]) continue;
    if (keep(cuts[k], cuts[k + 1])) out.push({ a: cuts[k], b: cuts[k + 1], aIn: false, bIn: false });
  }
  return out;
}

// ───────────────────────────── Периодические семейства ─────────────────────────────

/** Семейство x = x0 + T·k, k ∈ ℤ, с x0 ∈ (−T/2; T/2] — как в учебниках: −π/2 + 2πk. */
function family(x0, T) {
  let r = x0 - T * Math.round(x0 / T);
  if (r <= -T / 2 + 1e-12 * T) r += T;
  if (Math.abs(r) < 1e-14 * Math.max(1, T)) r = 0;
  return { x0: r, T };
}

/** «x = 2», «x ≈ 1,4142», «x ≠ ≈ 1,4142» */
function eqApprox(name, v, rel = '=') {
  const d = describeNumber(v);
  if (d.exact) return `${name} ${rel} ${d.text}`;
  return rel === '=' ? `${name} ≈ ${d.text}` : `${name} ${rel} ≈ ${d.text}`;
}

/** «π/2 + 2πk» (без «k ∈ ℤ») */
function shiftText(x, T) {
  const tk = familyText({ x0: 0, T }).replace(/, k ∈ ℤ$/, '');
  return Math.abs(x) < 1e-14 ? tk : `${formatPiOrApprox(x)} + ${tk}`;
}

const onFamily = (F, x) => {
  const k = (x - F.x0) / F.T;
  return Math.abs(k - Math.round(k)) < 1e-9;
};

function familyText(F) {
  const t = formatPiMultiple(F.T);
  let tk;
  if (t) {
    const m = t.match(/^(\d*)π(?:\/(\d+))?$/);
    tk = m ? `${m[1]}πk${m[2] ? `/${m[2]}` : ''}` : `${t}·k`;
  } else tk = `${formatApprox(F.T)}·k`;
  if (F.x0 === 0) return `${tk}, k ∈ ℤ`;
  return `${formatPiOrApprox(F.x0)} + ${tk}, k ∈ ℤ`;
}

// ───────────────────────────── Область определения ─────────────────────────────

function collectConstraints(node, out) {
  switch (node.type) {
    case 'num': case 'const': case 'var': return;
    case 'neg': case 'call': case 'log': collectConstraints(node.arg, out); break;
    case 'pow': collectConstraints(node.base, out); collectConstraints(node.exponent, out); break;
    default: collectConstraints(node.left, out); collectConstraints(node.right, out);
  }
  const need = (rel, arg) => {
    if (isConst(arg)) {
      const v = constValue(arg);
      const ok = isNum(v) && (rel === 'ge' ? v >= 0 : rel === 'gt' ? v > 0 : v !== 0);
      if (!ok) out.push({ kind: 'empty' });
      return;
    }
    const R = normRational(toRational(arg));
    out.push(R ? { kind: 'sign', R, rel } : { kind: 'unknown' });
  };
  switch (node.type) {
    case 'div': need('ne', node.right); break;
    case 'pow': {
      if (isConst(node)) break;
      if (isConst(node.exponent)) {
        const e = constValue(node.exponent);
        if (Number.isInteger(e) || oddRootDenominator(e)) {
          if (e < 0) need('ne', node.base);
        } else need(e > 0 ? 'ge' : 'gt', node.base);
      } else if (isConst(node.base)) {
        if (!(constValue(node.base) > 0)) out.push({ kind: 'unknown' });
      } else out.push({ kind: 'unknown' });
      break;
    }
    case 'call':
      switch (node.fn) {
        case 'sqrt': need('ge', node.arg); break;
        case 'ln': case 'lg': need('gt', node.arg); break;
        case 'arcsin': case 'arccos': {
          if (isConst(node.arg)) {
            if (!(Math.abs(constValue(node.arg)) <= 1)) out.push({ kind: 'empty' });
            break;
          }
          const R = normRational(toRational(node.arg));
          if (!R) { out.push({ kind: 'unknown' }); break; }
          out.push({ kind: 'sign', R: { num: P.add(R.num, R.den), den: R.den }, rel: 'ge' });
          out.push({ kind: 'sign', R: { num: P.sub(R.den, R.num), den: R.den }, rel: 'ge' });
          break;
        }
        case 'tan': case 'cot': {
          if (isConst(node.arg)) {
            if (!isNum(constValue(node))) out.push({ kind: 'empty' });
            break;
          }
          const lin = linearOf(node.arg);
          if (lin) out.push({ kind: 'periodic', ...lin, offset: node.fn === 'tan' ? PI / 2 : 0 });
          else out.push({ kind: 'unknown' });
          break;
        }
        default: break;
      }
      break;
    case 'log': need('gt', node.arg); break;
    default: break;
  }
}

export function computeDomain(ast) {
  const cons = [];
  collectConstraints(ast, cons);
  let set = S.REAL();
  let exact = true;
  const families = [];
  for (const c of cons) {
    if (c.kind === 'unknown') exact = false;
    else if (c.kind === 'empty') set = [];
    else if (c.kind === 'sign') set = S.intersect(set, signSet(c.R, c.rel));
    else families.push(family((c.offset - c.b) / c.a, PI / Math.abs(c.a)));
  }
  const uniqFamilies = families.filter((F, i) => families.findIndex((G) => Math.abs(G.T - F.T) < 1e-12 && Math.abs(G.x0 - F.x0) < 1e-12) === i);
  return { exact, set, families: uniqFamilies };
}

export function inDomain(dom, x) {
  return S.contains(dom.set, x) && !dom.families.some((F) => onFamily(F, x));
}

function numericDomainText(f, a, b) {
  const xs = linspace(a, b, 2001);
  const ys = xs.map(f);
  const parts = [];
  let isolated = 0;
  let start = null;
  for (let i = 0; i <= xs.length; i++) {
    const ok = i < xs.length && isNum(ys[i]);
    if (ok && start === null) start = i;
    if (!ok && start !== null) {
      if (i - start < 3) isolated++;
      else {
        const L = start === 0 ? { x: a, closed: true } : domainEdge(f, xs[start], xs[start - 1]);
        const R = i === xs.length ? { x: b, closed: true } : domainEdge(f, xs[i - 1], xs[i]);
        parts.push(S.formatInterval({ a: L.x, b: R.x, aIn: L.closed, bIn: R.closed }));
      }
      start = null;
    }
  }
  if (parts.length > 6) return `${parts.slice(0, 4).join(' ∪ ')} ∪ … (усього ${parts.length} проміжків)`;
  const text = parts.length ? parts.join(' ∪ ') : '∅';
  return isolated ? `${text} та окремі точки` : text;
}

function describeDomain(dom, f) {
  if (!dom.exact) {
    return {
      status: UNKNOWN,
      text: UNKNOWN_TEXT,
      note: `Чисельна оцінка на відрізку [${MINUS}10; 10]: ${numericDomainText(f, ...WINDOW)}`,
    };
  }
  if (!dom.set.length) return { status: EXACT, text: '∅ — функція ніде не визначена' };
  const fam = dom.families.map((F) => `x ≠ ${familyText(F)}`);
  if (S.isReal(dom.set)) {
    if (!fam.length) return { status: EXACT, text: 'ℝ — усі дійсні числа' };
    return { status: EXACT, text: fam.join('; ') };
  }
  const excl = S.excludedPoints(dom.set);
  if (excl && excl.length <= 4) {
    return {
      status: EXACT,
      text: [excl.map((x) => eqApprox('x', x, '≠')).join(', '), ...fam].join('; '),
      note: `D(f) = ${S.formatSet(dom.set)}`,
    };
  }
  return { status: EXACT, text: [S.formatSet(dom.set), ...fam].join('; ') };
}

// ─────────────────────────────── Нули: f(x) = t ───────────────────────────────

const EMPTY = () => ({ points: [], families: [] });

function union(A, B) {
  if (!A || !B) return null;
  if (A.all || B.all) return { all: true, points: [], families: [] };
  return { points: [...A.points, ...B.points], families: [...A.families, ...B.families] };
}

function solvePeriodic(fn, arg, t) {
  const lin = linearOf(arg);
  if (!lin) return null;
  const near1 = Math.abs(Math.abs(t) - 1) < 1e-12;
  const base = [];
  switch (fn) {
    case 'sin': {
      if (Math.abs(t) > 1 && !near1) return EMPTY();
      const s = Math.asin(Math.max(-1, Math.min(1, t)));
      if (near1) base.push([s, 2 * PI]);
      else if (t === 0) base.push([0, PI]);
      else base.push([s, 2 * PI], [PI - s, 2 * PI]);
      break;
    }
    case 'cos': {
      if (Math.abs(t) > 1 && !near1) return EMPTY();
      const c = Math.acos(Math.max(-1, Math.min(1, t)));
      if (near1) base.push([c, 2 * PI]);
      else if (t === 0) base.push([PI / 2, PI]);
      else base.push([c, 2 * PI], [-c, 2 * PI]);
      break;
    }
    case 'tan': base.push([Math.atan(t), PI]); break;
    case 'cot': base.push([PI / 2 - Math.atan(t), PI]); break;
    default: return null;
  }
  return { points: [], families: base.map(([u0, T]) => family((u0 - lin.b) / lin.a, T / Math.abs(lin.a))) };
}

/** Решить f(x) = t аналитически. null — не умеем (тогда ищем численно). */
function solve(node, t) {
  if (!isNum(t)) return EMPTY();
  if (isConst(node)) return null;
  const R = normRational(toRational(node));
  if (R) {
    const eq = P.sub(R.num, P.scale(R.den, t));
    if (!eq.length) return { all: true, points: [], families: [] };
    return { points: P.realRoots(eq), families: [] };
  }
  const c = isConst;
  switch (node.type) {
    case 'neg': return solve(node.arg, -t);
    case 'add':
      if (c(node.left)) return solve(node.right, t - constValue(node.left));
      if (c(node.right)) return solve(node.left, t - constValue(node.right));
      return null;
    case 'sub':
      if (c(node.right)) return solve(node.left, t + constValue(node.right));
      if (c(node.left)) return solve(node.right, constValue(node.left) - t);
      return null;
    case 'mul': {
      if (c(node.left) || c(node.right)) {
        const k = constValue(c(node.left) ? node.left : node.right);
        const g = c(node.left) ? node.right : node.left;
        if (k === 0) return null;
        return solve(g, t / k);
      }
      return t === 0 ? union(solve(node.left, 0), solve(node.right, 0)) : null;
    }
    case 'div':
      if (c(node.right)) {
        const k = constValue(node.right);
        return k === 0 ? EMPTY() : solve(node.left, t * k);
      }
      if (c(node.left)) {
        const k = constValue(node.left);
        if (t === 0) return k === 0 ? null : EMPTY();
        return solve(node.right, k / t);
      }
      return t === 0 ? solve(node.left, 0) : null;
    case 'pow': {
      const { base, exponent } = node;
      if (c(exponent)) {
        const e = constValue(exponent);
        if (e === 0) return null;
        if (t === 0) return e > 0 ? solve(base, 0) : EMPTY();
        if (Number.isInteger(e)) {
          if (e % 2 !== 0) return solve(base, Math.sign(t) * Math.abs(t) ** (1 / e));
          if (t < 0) return EMPTY();
          const r = t ** (1 / e);
          return union(solve(base, r), solve(base, -r));
        }
        return null;
      }
      if (c(base)) {
        const b = constValue(base);
        if (!(b > 0) || b === 1) return null;
        return t > 0 ? solve(exponent, Math.log(t) / Math.log(b)) : EMPTY();
      }
      return null;
    }
    case 'call': {
      const a = node.arg;
      switch (node.fn) {
        case 'sqrt': return t >= 0 ? solve(a, t * t) : EMPTY();
        case 'cbrt': return solve(a, t ** 3);
        case 'abs': return t < 0 ? EMPTY() : t === 0 ? solve(a, 0) : union(solve(a, t), solve(a, -t));
        case 'exp': return t > 0 ? solve(a, Math.log(t)) : EMPTY();
        case 'ln': return solve(a, Math.exp(t));
        case 'lg': return solve(a, 10 ** t);
        case 'arctan': return Math.abs(t) < PI / 2 ? solve(a, Math.tan(t)) : EMPTY();
        case 'arcsin': return Math.abs(t) <= PI / 2 ? solve(a, Math.sin(t)) : EMPTY();
        case 'arccos': return t >= 0 && t <= PI ? solve(a, Math.cos(t)) : EMPTY();
        case 'arccot': return t > 0 && t < PI ? solve(a, Math.cos(t) / Math.sin(t)) : EMPTY();
        case 'sinh': return solve(a, Math.asinh(t));
        case 'tanh': return Math.abs(t) < 1 ? solve(a, Math.atanh(t)) : EMPTY();
        case 'cosh': {
          if (t < 1) return EMPTY();
          if (t === 1) return solve(a, 0);
          const r = Math.acosh(t);
          return union(solve(a, r), solve(a, -r));
        }
        case 'sin': case 'cos': case 'tan': case 'cot': return solvePeriodic(node.fn, a, t);
        default: return null;
      }
    }
    case 'log': return solve(node.arg, node.base ** t);
    default: return null;
  }
}

function listPoints(xs, max = 8) {
  const shown = xs.slice(0, max).map((x) => eqApprox('x', x));
  if (xs.length > max) shown.push(`… ще ${xs.length - max}`);
  return shown.join('; ');
}

/** Граница участка, где pred истинен: pred(a) = true, pred(b) = false. */
function predicateEdge(pred, a, b) {
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    if (pred(m)) a = m; else b = m;
  }
  const d = describeNumber(a, { tol: 1e-9 });
  const x = d.exact ? d.value : a;
  return { x, closed: pred(x) };
}

function numericZeros(f, [a, b]) {
  const n = 8001;
  const xs = linspace(a, b, n);
  const ys = xs.map(f);
  const roots = [];
  const intervals = [];
  const tiny = (y) => isNum(y) && Math.abs(y) <= 1e-7;
  const isZero = (x) => f(x) === 0;
  for (let i = 0; i < n; i++) {
    if (ys[i] !== 0) continue;
    let j = i;
    while (j + 1 < n && ys[j + 1] === 0) j++;
    if (j === i) roots.push(xs[i]);
    else {
      // f = 0 на целом участке (например, floor(x) на [0; 1))
      const L = i === 0 ? { x: a, closed: true } : predicateEdge(isZero, xs[i], xs[i - 1]);
      const R = j === n - 1 ? { x: b, closed: true } : predicateEdge(isZero, xs[j], xs[j + 1]);
      intervals.push({ a: L.x, b: R.x, aIn: L.closed, bIn: R.closed });
      for (let k = i; k <= j; k++) ys[k] = NaN;
    }
    i = j;
  }
  for (let i = 0; i + 1 < n; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    if (isNum(y0) && isNum(y1) && y0 * y1 < 0) {
      const r = bisect(f, xs[i], xs[i + 1], y0, y1);
      if (tiny(f(r))) roots.push(r);
    }
  }
  const absF = (x) => {
    const y = f(x);
    return isNum(y) ? Math.abs(y) : Infinity;
  };
  for (let i = 1; i + 1 < n; i++) {
    const y = ys[i];
    if (!isNum(y) || !isNum(ys[i - 1]) || !isNum(ys[i + 1])) continue;
    if (Math.abs(y) < Math.abs(ys[i - 1]) && Math.abs(y) <= Math.abs(ys[i + 1]) && ys[i - 1] * ys[i + 1] > 0 && Math.abs(y) < 1e-2) {
      const m = goldenMin(absF, xs[i - 1], xs[i + 1]);
      if (absF(m) < 1e-9) roots.push(m);
    }
  }
  const snapped = roots.map((r) => {
    const d = describeNumber(r, { tol: 1e-7 });
    return d.exact && absF(d.value) <= absF(r) ? d.value : r;
  });
  const uniq = [];
  for (const r of snapped.sort((p, q) => p - q)) {
    if (intervals.some((I) => S.contains([I], r))) continue;
    if (!uniq.length || Math.abs(r - uniq[uniq.length - 1]) > 1e-6 * Math.max(1, Math.abs(r))) uniq.push(r);
  }
  return { roots: uniq, intervals };
}

/**
 * Проверка семейства решений подстановкой. Члены семейства, выпавшие из области
 * определения (как x = 0 у sin(x)/x), допускаются, только если область известна точно
 * и они — её конечные «выколотые» точки; тогда они возвращаются как исключения k.
 */
function verifyFamily(F, ok, dom) {
  const excluded = [];
  if (dom.exact) {
    for (const I of dom.set) for (const e of [I.a, I.b]) if (isNum(e) && !inDomain(dom, e) && onFamily(F, e)) excluded.push(Math.round((e - F.x0) / F.T));
  }
  for (let k = -3; k <= 3; k++) if (!excluded.includes(k) && !ok(F.x0 + F.T * k)) return null;
  return { ...F, except: [...new Set(excluded)].sort((p, q) => p - q) };
}

function analyzeZeros(ast, f, dom) {
  if (isConst(ast)) {
    const v = f(0);
    if (v === 0) return { status: EXACT, text: 'f(x) = 0 при всіх x', points: [], families: [] };
    return { status: EXACT, text: 'немає — графік не перетинає вісь Ox', points: [], families: [] };
  }
  const sol = solve(ast, 0);
  const ok = (x) => {
    const y = f(x);
    return isNum(y) && Math.abs(y) <= 1e-7;
  };
  if (sol?.all) return { status: EXACT, text: 'f(x) = 0 на всій області визначення', points: [], families: [] };
  const verified = sol ? sol.families.map((F) => verifyFamily(F, ok, dom)) : null;
  if (sol && verified.every(Boolean)) {
    const families = verified.filter((F, i) => verified.findIndex((G) => Math.abs(G.T - F.T) < 1e-12 && Math.abs(G.x0 - F.x0) < 1e-9) === i);
    const points = [...new Set(sol.points)].filter(ok).filter((x) => !families.some((F) => onFamily(F, x))).sort((p, q) => p - q);
    const parts = [];
    if (points.length) parts.push(listPoints(points));
    for (const F of families) parts.push(`x = ${familyText(F)}${F.except.length ? `, k ≠ ${F.except.join(', ')}` : ''}`);
    return {
      status: EXACT,
      text: parts.length ? parts.join('; ') : 'немає — графік не перетинає вісь Ox',
      points,
      families,
    };
  }
  const { roots, intervals } = numericZeros(f, ZERO_WINDOW);
  const parts = [];
  if (intervals.length) parts.push(`f(x) = 0 при x ∈ ${intervals.slice(0, 3).map(S.formatInterval).join(' ∪ ')}${intervals.length > 3 ? ' ∪ …' : ''}`);
  if (roots.length) parts.push(listPoints(roots, 6));
  return {
    status: NUMERIC,
    text: parts.length ? parts.join('; ') : 'не знайдено',
    note: `Пошук чисельний на відрізку [${MINUS}50; 50]: знайдені нулі наближені, а інші можуть бути поза відрізком або дуже близько один до одного.`,
    points: roots,
    families: [],
  };
}

// ───────────────────────────── Пересечение с Oy ─────────────────────────────

function analyzeYIntercept(ast) {
  const { value, reason } = explainAt(ast, 0);
  if (!isNum(value)) return { status: EXACT, text: 'немає — x = 0 не входить до області визначення', note: `Причина: ${reason}.`, point: null };
  return { status: EXACT, text: `(0; ${formatApprox(value)})`, point: { x: 0, y: value } };
}

// ─────────────────────── Монотонность и экстремумы ───────────────────────

/** f = A·core + C: снимает внешние линейные преобразования. */
function peelAffine(node) {
  let A = 1, C = 0, cur = node;
  for (;;) {
    if (cur.type === 'neg') { A = -A; cur = cur.arg; continue; }
    if ((cur.type === 'add' || cur.type === 'sub') && isConst(cur.right) && !isConst(cur.left)) {
      C += A * (cur.type === 'add' ? 1 : -1) * constValue(cur.right);
      cur = cur.left;
      continue;
    }
    if (cur.type === 'add' && isConst(cur.left) && !isConst(cur.right)) { C += A * constValue(cur.left); cur = cur.right; continue; }
    if (cur.type === 'sub' && isConst(cur.left) && !isConst(cur.right)) { C += A * constValue(cur.left); A = -A; cur = cur.right; continue; }
    if (cur.type === 'mul' && (isConst(cur.left) !== isConst(cur.right))) {
      const k = constValue(isConst(cur.left) ? cur.left : cur.right);
      if (!isNum(k) || k === 0) break;
      A *= k;
      cur = isConst(cur.left) ? cur.right : cur.left;
      continue;
    }
    if (cur.type === 'div' && isConst(cur.right) && !isConst(cur.left)) {
      const k = constValue(cur.right);
      if (!isNum(k) || k === 0) break;
      A /= k;
      cur = cur.left;
      continue;
    }
    break;
  }
  return { A, C, core: cur };
}

/** f = A·trig(a·x + b) + C */
function periodicInfo(ast) {
  const { A, C, core } = peelAffine(ast);
  if (core.type !== 'call' || !['sin', 'cos', 'tan', 'cot'].includes(core.fn)) return null;
  const lin = linearOf(core.arg);
  return lin ? { fn: core.fn, A, C, ...lin } : null;
}

const MONOTONE = { sqrt: 1, cbrt: 1, ln: 1, lg: 1, exp: 1, arctan: 1, arcsin: 1, sinh: 1, tanh: 1, arccos: -1, arccot: -1 };

/** f = φ(R(x)), где φ — композиция строго монотонных функций, R — рациональная. */
function monotoneChain(node) {
  const R = toRational(node);
  if (R) return { R, dir: 1 };
  const { A, core } = peelAffine(node);
  if (core !== node) {
    const inner = monotoneChain(core);
    return inner && { R: inner.R, dir: inner.dir * Math.sign(A) };
  }
  if (node.type === 'call' && MONOTONE[node.fn]) {
    const inner = monotoneChain(node.arg);
    return inner && { R: inner.R, dir: inner.dir * MONOTONE[node.fn] };
  }
  if (node.type === 'log') {
    const inner = monotoneChain(node.arg);
    return inner && { R: inner.R, dir: inner.dir * (node.base > 1 ? 1 : -1) };
  }
  if (node.type === 'pow' && isConst(node.base) && !isConst(node.exponent)) {
    const b = constValue(node.base);
    if (!(b > 0) || b === 1) return null;
    const inner = monotoneChain(node.exponent);
    return inner && { R: inner.R, dir: inner.dir * (b > 1 ? 1 : -1) };
  }
  if (node.type === 'pow' && isConst(node.exponent)) {
    const e = constValue(node.exponent);
    const q = Number.isInteger(e) ? 1 : oddRootDenominator(e);
    // t^n и t^(p/q) с нечётными p и q монотонны на каждом участке, где t не меняет знак:
    // x^101, x^(1/3) — возрастают; x^(−3) — убывает на (−∞; 0) и на (0; +∞).
    // t^0,5, t^π определены только при t ≥ 0 и там тоже монотонны.
    const oddPower = q && Math.round(e * q) % 2 !== 0;
    const nonNegativeBase = !q && e !== 0;
    if (oddPower || nonNegativeBase) {
      const inner = monotoneChain(node.base);
      return inner && { R: inner.R, dir: inner.dir * Math.sign(e) };
    }
  }
  return null;
}

/** f = A·|R|^p + C или A·R^(чётное) + C: монотонность как у |R| (с учётом знака показателя). */
function evenPowerOfRational(ast) {
  const { A, core } = peelAffine(ast);
  if (core.type === 'call' && core.fn === 'abs') {
    const R = normRational(toRational(core.arg));
    return R && { R, dir: Math.sign(A) };
  }
  if (core.type === 'pow' && isConst(core.exponent)) {
    const e = constValue(core.exponent);
    const q = Number.isInteger(e) ? 1 : oddRootDenominator(e);
    if (!q || Math.round(e * q) % 2 !== 0) return null;
    const R = normRational(toRational(core.base));
    return R && { R, dir: Math.sign(A) * Math.sign(e) };
  }
  return null;
}

const fmtIntervals = (list) => (list.length ? list.map(S.formatInterval).join(', ') : 'немає');

function extremaText(list) {
  if (!list.length) return 'немає';
  const parts = list.slice(0, 6).map((e) => `${e.kind === 'max' ? 'max' : 'min'}: (${formatApprox(e.x)}; ${formatApprox(e.y)})`);
  if (list.length > 6) parts.push(`… ще ${list.length - 6}`);
  return parts.join('; ');
}

/**
 * Монотонность f = φ(R) на множестве D по знаку производной R' (умноженному на dir).
 * absolute=true — для f = |R|: на участках, где R < 0, направление меняется,
 * а нули R становятся дополнительными точками излома.
 */
function monotoneOnSet(R, dir, D, f, absolute = false) {
  const dNum = P.sub(P.mul(P.derivative(R.num), R.den), P.mul(R.num, P.derivative(R.den)));
  const inc = [], dec = [], flat = [], extrema = [];
  const crit = dNum.length ? [...P.realRoots(dNum), ...(absolute ? P.realRoots(R.num) : [])].sort((p, q) => p - q) : [];
  for (const J of D) {
    if (J.a === J.b) continue;
    if (!dNum.length) { flat.push(J); continue; }
    const inner = crit.filter((c, i) => c > J.a && c < J.b && c !== crit[i - 1]);
    const cuts = [J.a, ...inner, J.b];
    const pieces = [];
    for (let k = 0; k + 1 < cuts.length; k++) {
      const t = testPoint(cuts[k], cuts[k + 1]);
      const s = Math.sign(P.evaluate(dNum, t)) * dir * (absolute ? Math.sign(evalR(R, t)) : 1);
      const last = pieces[pieces.length - 1];
      if (last && last.s === s) last.b = cuts[k + 1];
      else pieces.push({ a: cuts[k], b: cuts[k + 1], s });
    }
    pieces.forEach((p, k) => {
      const I = { a: p.a, b: p.b, aIn: k === 0 ? J.aIn : true, bIn: k === pieces.length - 1 ? J.bIn : true };
      (p.s > 0 ? inc : p.s < 0 ? dec : flat).push(I);
      if (k > 0) {
        const prev = pieces[k - 1];
        const y = f(p.a);
        if (isNum(y) && prev.s !== p.s && prev.s !== 0 && p.s !== 0) extrema.push({ x: p.a, y, kind: prev.s > 0 ? 'max' : 'min' });
      }
    });
  }
  return {
    status: EXACT,
    inc: fmtIntervals(inc),
    dec: fmtIntervals(dec),
    flat: flat.length ? fmtIntervals(flat) : null,
    extrema: extremaText(extrema),
    extremaPoints: extrema,
    extremaFamilies: [],
  };
}

function periodicMonotonic(per, f) {
  const { fn, A, a, b } = per;
  const sgn = Math.sign(A) * Math.sign(a);
  const map = ([u1, u2]) => {
    const x1 = (u1 - b) / a, x2 = (u2 - b) / a;
    return x1 < x2 ? [x1, x2] : [x2, x1];
  };
  const P2 = (2 * PI) / Math.abs(a);
  const P1 = PI / Math.abs(a);
  const range = ([x1, x2], T, open) => `${open ? '(' : '['}${shiftText(x1, T)}; ${shiftText(x2, T)}${open ? ')' : ']'}, k ∈ ℤ`;
  const result = { status: EXACT, flat: null, extremaPoints: [], extremaFamilies: [] };
  if (fn === 'sin' || fn === 'cos') {
    const up = fn === 'sin' ? [-PI / 2, PI / 2] : [-PI, 0];
    const down = fn === 'sin' ? [PI / 2, 3 * PI / 2] : [0, PI];
    result.inc = range(map(sgn > 0 ? up : down), P2, false);
    result.dec = range(map(sgn > 0 ? down : up), P2, false);
    const uMax = fn === 'sin' ? PI / 2 : 0;
    const uMin = fn === 'sin' ? -PI / 2 : PI;
    const maxF = family(((A > 0 ? uMax : uMin) - b) / a, P2);
    const minF = family(((A > 0 ? uMin : uMax) - b) / a, P2);
    const yMax = f(maxF.x0), yMin = f(minF.x0);
    result.extrema = `max = ${formatApprox(yMax)} при x = ${familyText(maxF)}; min = ${formatApprox(yMin)} при x = ${familyText(minF)}`;
    result.extremaFamilies = [{ ...maxF, kind: 'max' }, { ...minF, kind: 'min' }];
  } else {
    const iv = map(fn === 'tan' ? [-PI / 2, PI / 2] : [0, PI]);
    const increasing = (fn === 'tan') === (sgn > 0);
    result.inc = increasing ? `на кожному проміжку ${range(iv, P1, true)}` : 'немає';
    result.dec = increasing ? 'немає' : `на кожному проміжку ${range(iv, P1, true)}`;
    result.extrema = 'немає';
  }
  return result;
}

function numericMonotonic(f) {
  const [a, b] = WINDOW;
  const n = 4001;
  const xs = linspace(a, b, n);
  const ys = xs.map(f);
  // 1. непрерывные куски
  const pieces = [];
  let s0 = null;
  const close = (end) => {
    if (s0 !== null && end - s0 >= 2) pieces.push([s0, end]);
    s0 = null;
  };
  for (let i = 0; i < n; i++) {
    if (!isNum(ys[i])) { close(i - 1); continue; }
    if (s0 === null) { s0 = i; continue; }
    const d = Math.abs(ys[i] - ys[i - 1]);
    const dPrev = i >= 2 && isNum(ys[i - 2]) ? Math.abs(ys[i - 1] - ys[i - 2]) : 0;
    const dNext = i + 1 < n && isNum(ys[i + 1]) ? Math.abs(ys[i + 1] - ys[i]) : 0;
    if (d > 4 * Math.max(dPrev, dNext, 1e-12) && hasJump(f, xs[i - 1], xs[i], ys[i - 1], ys[i])) {
      close(i - 1);
      s0 = i;
    }
  }
  close(n - 1);

  const inc = [], dec = [], flat = [], extrema = [];
  let total = 0;
  for (const [s, e] of pieces) {
    const left = s === 0 ? { x: a, closed: true } : isNum(ys[s - 1]) ? { x: xs[s], closed: true } : domainEdge(f, xs[s], xs[s - 1]);
    const right = e === n - 1 ? { x: b, closed: true } : isNum(ys[e + 1]) ? { x: xs[e], closed: true } : domainEdge(f, xs[e], xs[e + 1]);
    const runs = [];
    for (let i = s; i < e; i++) {
      const d = ys[i + 1] - ys[i];
      // «ноль» — только на уровне ошибки округления (относительно самих значений),
      // иначе очень маленькие, но меняющиеся значения (x¹⁰⁰ около нуля) приняли бы за постоянство
      const sg = Math.abs(d) <= 8 * Number.EPSILON * Math.max(Math.abs(ys[i]), Math.abs(ys[i + 1])) ? 0 : Math.sign(d);
      const last = runs[runs.length - 1];
      if (last && last.s === sg) last.end = i + 1;
      else runs.push({ s: sg, start: i, end: i + 1 });
    }
    // короткие «плато» на вершинах не считаем отдельными промежутками
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (r.s === 0 && r.end - r.start <= 2 && last) { last.end = r.end; continue; }
      if (last && last.s === r.s) { last.end = r.end; continue; }
      merged.push({ ...r });
    }
    total += merged.length;
    if (total > 14) return null;
    let from = left;
    merged.forEach((r, k) => {
      let to = right;
      if (k + 1 < merged.length) {
        const next = merged[k + 1];
        const i = r.end;
        const lo = xs[Math.max(s, i - 1)], hi = xs[Math.min(e, i + 1)];
        let x = xs[i];
        if (r.s !== 0 && next.s !== 0 && r.s !== next.s) {
          const sgn = r.s > 0 ? -1 : 1; // максимум ищем как минимум −f
          x = goldenMin((t) => {
            const y = f(t);
            return isNum(y) ? sgn * y : Infinity;
          }, lo, hi);
          const d = describeNumber(x, { tol: 1e-6 });
          if (d.exact && isNum(f(d.value)) && sgn * f(d.value) <= sgn * f(x) + 1e-12) x = d.value;
          extrema.push({ x, y: f(x), kind: r.s > 0 ? 'max' : 'min' });
        }
        to = { x, closed: true };
      }
      const I = { a: from.x, b: to.x, aIn: from.closed, bIn: to.closed };
      (r.s > 0 ? inc : r.s < 0 ? dec : flat).push(I);
      from = to;
    });
  }
  return {
    status: NUMERIC,
    inc: fmtIntervals(inc),
    dec: fmtIntervals(dec),
    flat: flat.length ? fmtIntervals(flat) : null,
    extrema: extremaText(extrema),
    extremaPoints: extrema,
    extremaFamilies: [],
    note: `Чисельний аналіз на відрізку [${MINUS}10; 10]; кінці ±10 — межа відрізка, а не функції.`,
  };
}

function analyzeMonotonic(ast, f, dom) {
  const per = periodicInfo(ast);
  if (per) return periodicMonotonic(per, f);
  if (dom.exact && !dom.families.length) {
    const chain = monotoneChain(ast);
    const R = chain && normRational(chain.R);
    if (R) return monotoneOnSet(R, chain.dir, dom.set, f);
    const even = evenPowerOfRational(ast);
    if (even) return monotoneOnSet(even.R, even.dir, dom.set, f, true);
  }
  const num = numericMonotonic(f);
  if (num) return num;
  return { status: UNKNOWN, inc: UNKNOWN_TEXT, dec: UNKNOWN_TEXT, extrema: UNKNOWN_TEXT, extremaPoints: [], extremaFamilies: [], flat: null, note: 'Функція надто часто змінює характер на відрізку [−10; 10].' };
}

// ─────────────────────────────────── Чётность ───────────────────────────────────

const ODD_FUNCS = new Set(['sin', 'tan', 'cot', 'arcsin', 'arctan', 'sinh', 'tanh', 'cbrt', 'sign']);
const EVEN_FUNCS = new Set(['cos', 'abs', 'cosh']);

/** Чётность по построению формулы: 'even' | 'odd' | null (не удалось доказать). */
function symbolicParity(node) {
  switch (node.type) {
    case 'num': case 'const': return 'even';
    case 'var': return 'odd';
    case 'neg': return symbolicParity(node.arg);
    case 'add': case 'sub': {
      const a = symbolicParity(node.left), b = symbolicParity(node.right);
      if (a && a === b) return a;
      if (isConst(node.left) && constValue(node.left) === 0) return b;
      if (isConst(node.right) && constValue(node.right) === 0) return a;
      return null;
    }
    case 'mul': case 'div': {
      const a = symbolicParity(node.left), b = symbolicParity(node.right);
      if (!a || !b) return null;
      return a === b ? 'even' : 'odd';
    }
    case 'pow': {
      if (isConst(node)) return 'even';
      const a = symbolicParity(node.base);
      if (isConst(node.exponent)) {
        const e = constValue(node.exponent);
        if (a === 'even') return 'even';
        if (a !== 'odd') return null;
        if (Number.isInteger(e)) return e % 2 === 0 ? 'even' : 'odd';
        const q = oddRootDenominator(e);
        if (!q) return null;
        return Math.round(e * q) % 2 === 0 ? 'even' : 'odd';
      }
      const b = symbolicParity(node.exponent);
      if (b === 'even' && (isConst(node.base) || a === 'even')) return 'even';
      return null;
    }
    case 'call': case 'log': {
      const a = symbolicParity(node.arg);
      if (a === 'even') return 'even';
      if (a !== 'odd') return null;
      if (node.type === 'call' && ODD_FUNCS.has(node.fn)) return 'odd';
      if (node.type === 'call' && EVEN_FUNCS.has(node.fn)) return 'even';
      return null;
    }
    default: return null;
  }
}

function analyzeParity(ast, f, dom) {
  if (isConst(ast)) {
    const v = f(0);
    if (v === 0) return { status: EXACT, text: 'і парна, і непарна (f(x) = 0)' };
    return { status: EXACT, text: 'парна (стала функція)', note: 'Графік симетричний відносно осі Oy.' };
  }
  if (dom.exact) {
    const symFam = dom.families.every((F) => onFamily(F, -F.x0));
    if (!S.isSymmetric(dom.set) || !symFam) {
      const w = [0.5, 1, 2, 3, 1.5, 4, 5, 7, 10, 0.25].flatMap((x) => [x, -x]).find((x) => inDomain(dom, x) && !inDomain(dom, -x));
      return {
        status: EXACT,
        text: 'ні парна, ні непарна',
        note: w !== undefined
          ? `Область визначення несиметрична: f(${formatNumber(w)}) існує, а f(${formatNumber(-w)}) — ні.`
          : 'Область визначення несиметрична відносно нуля.',
      };
    }
  }
  const sym = symbolicParity(ast);
  if (sym === 'even') return { status: EXACT, text: 'парна: f(−x) = f(x)', note: 'Графік симетричний відносно осі Oy.' };
  if (sym === 'odd') return { status: EXACT, text: 'непарна: f(−x) = −f(x)', note: 'Графік симетричний відносно початку координат.' };

  const probes = [1, 2, 0.5, 3, 1.5, 2.5, 0.7, 1.3, 4.1, 5.3, 6.7, 0.31, 7.9, 9.2, 13.7, 21.1];
  let notEven = null, notOdd = null, asym = null, checked = 0;
  for (const x of probes) {
    const a = f(x), b = f(-x);
    if (isNum(a) !== isNum(b)) { asym ??= isNum(a) ? x : -x; continue; }
    if (!isNum(a)) continue;
    checked++;
    const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (!notEven && Math.abs(a - b) > tol) notEven = { x, a, b };
    if (!notOdd && Math.abs(a + b) > tol) notOdd = { x, a, b };
  }
  if (asym !== null) {
    return { status: EXACT, text: 'ні парна, ні непарна', note: `Область визначення несиметрична: f(${formatNumber(asym)}) існує, а f(${formatNumber(-asym)}) — ні.` };
  }
  if (notEven && notOdd) {
    const w = notEven;
    const fx = (x) => `f(${formatNumber(x)})`;
    const note = notOdd.x === w.x
      ? `Контрприклад: ${eqApprox(fx(w.x), w.a)}, ${eqApprox(fx(-w.x), w.b)} — не рівні й не протилежні.`
      : `${eqApprox(fx(w.x), w.a)}, ${eqApprox(fx(-w.x), w.b)} — отже, не парна; ${eqApprox(fx(notOdd.x), notOdd.a)}, ${eqApprox(fx(-notOdd.x), notOdd.b)} — отже, не непарна.`;
    return { status: EXACT, text: 'ні парна, ні непарна', note };
  }
  if (checked && !notEven) return { status: NUMERIC, text: 'схоже на парну', note: `Рівність f(−x) = f(x) виконується в ${checked} перевірених точках, але строго не доведена.` };
  if (checked && !notOdd) return { status: NUMERIC, text: 'схоже на непарну', note: `Рівність f(−x) = −f(x) виконується в ${checked} перевірених точках, але строго не доведена.` };
  return { status: UNKNOWN, text: UNKNOWN_TEXT };
}

// ─────────────────────────────────── Асимптоты ───────────────────────────────────

function polyGcd(a, b) {
  a = P.trim(a);
  b = P.trim(b);
  for (let i = 0; i < 40 && b.length; i++) {
    const { r } = P.divmod(a, b);
    const sc = Math.max(...a.map(Math.abs));
    const rr = P.trim(r.map((c) => (Math.abs(c) <= 1e-9 * sc ? 0 : c)));
    a = b;
    b = rr;
  }
  return P.scale(a, 1 / a[a.length - 1]);
}

function lineText(k, b) {
  const kd = describeNumber(k);
  let s;
  if (kd.exact && kd.value === 1) s = 'x';
  else if (kd.exact && kd.value === -1) s = `${MINUS}x`;
  else s = `${kd.exact ? kd.text : `≈ ${kd.text}`}x`;
  const bd = describeNumber(b);
  if (bd.exact && bd.value === 0) return s;
  const mag = describeNumber(Math.abs(b));
  return `${s} ${b < 0 ? MINUS : '+'} ${mag.exact ? mag.text : `≈ ${mag.text}`}`;
}

function rationalLimit(R, s) {
  if (!R.num.length) return 0;
  const dn = R.num.length - 1, dd = R.den.length - 1;
  const lead = R.num[dn] / R.den[dd];
  if (dn < dd) return 0;
  if (dn === dd) return lead;
  return Math.sign(lead) * (s < 0 && (dn - dd) % 2 ? -1 : 1) * Infinity;
}

/** Предел при x → s·∞ (s = ±1). number | ±Infinity | null (неизвестно). */
function limitAt(node, s) {
  if (isConst(node)) {
    const v = constValue(node);
    return isNum(v) ? v : null;
  }
  const R = normRational(toRational(node));
  if (R) return rationalLimit(R, s);
  const L = (n) => limitAt(n, s);
  switch (node.type) {
    case 'neg': {
      const a = L(node.arg);
      return a === null ? null : -a;
    }
    case 'add': case 'sub': {
      const a = L(node.left);
      let b = L(node.right);
      if (a === null || b === null) return null;
      if (node.type === 'sub') b = -b;
      if (!isNum(a) && !isNum(b) && Math.sign(a) !== Math.sign(b)) return null;
      return a + b;
    }
    case 'mul': {
      const a = L(node.left), b = L(node.right);
      if (a === null || b === null) return null;
      if ((!isNum(a) && b === 0) || (!isNum(b) && a === 0)) return null;
      return a * b;
    }
    case 'div': {
      const a = L(node.left), b = L(node.right);
      if (a === null || b === null || b === 0) return null;
      if (!isNum(a) && !isNum(b)) return null;
      return a / b;
    }
    case 'pow': {
      const a = L(node.base), e = L(node.exponent);
      if (a === null || e === null) return null;
      if (isConst(node.base)) {
        if (!(a > 0)) return null;
        if (a === 1) return 1;
        if (isNum(e)) return a ** e;
        return (a > 1) === (e > 0) ? Infinity : 0;
      }
      if (isConst(node.exponent)) {
        if (isNum(a)) {
          const v = realPow(a, e);
          return isNum(v) ? v : null;
        }
        if (e < 0) return 0;
        if (e === 0) return 1;
        if (a > 0) return Infinity;
        if (Number.isInteger(e)) return e % 2 ? -Infinity : Infinity;
        const q = oddRootDenominator(e);
        return q ? (Math.round(e * q) % 2 ? -Infinity : Infinity) : null;
      }
      return null;
    }
    case 'call': {
      const a = L(node.arg);
      if (a === null) return null;
      const fin = isNum(a);
      switch (node.fn) {
        case 'exp': return fin ? Math.exp(a) : a > 0 ? Infinity : 0;
        case 'arctan': return fin ? Math.atan(a) : Math.sign(a) * (PI / 2);
        case 'arccot': return fin ? PI / 2 - Math.atan(a) : a > 0 ? 0 : PI;
        case 'tanh': return fin ? Math.tanh(a) : Math.sign(a);
        case 'sqrt': return fin ? (a >= 0 ? Math.sqrt(a) : null) : a > 0 ? Infinity : null;
        case 'cbrt': case 'sinh': return fin ? FUNCTIONS[node.fn].eval(a) : a;
        case 'cosh': return fin ? Math.cosh(a) : Infinity;
        case 'abs': return Math.abs(a);
        case 'ln': case 'lg':
          if (fin) return a > 0 ? FUNCTIONS[node.fn].eval(a) : a === 0 ? -Infinity : null;
          return a > 0 ? Infinity : null;
        case 'sign': return fin ? null : Math.sign(a);
        case 'floor': case 'ceil': return fin ? null : a;
        case 'arcsin': case 'arccos': case 'sin': case 'cos': case 'tan': case 'cot': {
          if (!fin) return null;
          const v = FUNCTIONS[node.fn].eval(a);
          return isNum(v) ? v : null;
        }
        default: return null;
      }
    }
    case 'log': {
      const a = L(node.arg);
      if (a === null) return null;
      if (isNum(a)) return a > 0 ? Math.log(a) / Math.log(node.base) : null;
      return a > 0 ? (node.base > 1 ? Infinity : -Infinity) : null;
    }
    default: return null;
  }
}

function numericLimit(f, s) {
  // нецелые x: у функций вроде xˣ отрицательные целые точки — изолированные
  const xs = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8].map((v) => s * v * Math.SQRT2);
  const ys = xs.map(f);
  if (!ys.slice(2).every(isNum)) return null;
  const [, , y5, y6, y7, y8] = ys;
  const d1 = Math.abs(y8 - y7), d2 = Math.abs(y7 - y6);
  if (d1 <= 1e-6 * Math.max(1, Math.abs(y8)) && d2 <= 1e-4 * Math.max(1, Math.abs(y7)) && d1 <= d2 + 1e-15) {
    return { kind: 'h', y: y8 };
  }
  const k5 = y5 / xs[2], k6 = y6 / xs[3], k7 = y7 / xs[4];
  if (Math.abs(k7 - k6) <= 1e-6 * Math.max(1, Math.abs(k7)) && Math.abs(k7) > 1e-6 && Math.abs(k6 - k5) >= Math.abs(k7 - k6)) {
    const kd = describeNumber(k7, { tol: 1e-5 });
    const k = kd.exact ? kd.value : k7;
    const b4 = f(xs[1]) - k * xs[1], b5 = y5 - k * xs[2], b6 = y6 - k * xs[3];
    if ([b4, b5, b6].every(isNum) && Math.abs(b6 - b5) <= 1e-4 * Math.max(1, Math.abs(b6)) && Math.abs(b6 - b5) <= Math.abs(b5 - b4) + 1e-12) {
      return { kind: 'o', k, b: b6 };
    }
  }
  return null;
}

/** Растёт ли |f| неограниченно при x → c (side = ±1). */
function growsUnbounded(f, c, side) {
  const vals = [];
  for (let k = 2; k <= 12; k++) {
    const y = f(c + side * 10 ** -k * Math.max(1, Math.abs(c)));
    if (!isNum(y)) return vals.length > 0 && vals[vals.length - 1] > 1e6;
    vals.push(Math.abs(y));
  }
  for (let i = 0; i + 1 < vals.length; i++) if (vals[i + 1] < vals[i] * (1 - 1e-9)) return false;
  return vals[vals.length - 1] - vals[0] >= 10;
}

function joinAsymptotes(parts) {
  return parts.length ? parts.join('; ') : 'немає';
}

function rationalAsymptotes(R, f) {
  const g = polyGcd(R.num, R.den);
  let num = R.num, den = R.den;
  const holes = [];
  if (g.length > 1) {
    for (const r of P.realRoots(g)) {
      const reduced = { num: P.divmod(num, g).q, den: P.divmod(den, g).q };
      const y = evalR(reduced, r);
      if (isNum(y) && !isNum(f(r))) holes.push({ x: r, y });
    }
    num = P.divmod(num, g).q;
    den = P.divmod(den, g).q;
  }
  const red = normRational({ num, den });
  const parts = [];
  const markers = { vlines: [], lines: [], holes };
  const vs = red.den.length > 1 ? P.realRoots(red.den) : [];
  if (vs.length) {
    parts.push(`вертикальн${vs.length > 1 ? 'і' : 'а'}: ${vs.map((x) => eqApprox('x', x)).join(', ')}`);
    markers.vlines.push(...vs);
  }
  const dn = red.num.length - 1, dd = red.den.length - 1;
  if (dd > 0 || dn <= 0) {
    if (dn < dd) { parts.push('горизонтальна: y = 0'); markers.lines.push({ k: 0, b: 0 }); }
    else if (dn === dd && dd > 0) {
      const y = red.num[dn] / red.den[dd];
      parts.push(`горизонтальна: y = ${formatApprox(y)}`);
      markers.lines.push({ k: 0, b: y });
    } else if (dn === dd + 1) {
      const { q } = P.divmod(red.num, red.den);
      parts.push(`похила: y = ${lineText(q[1] ?? 0, q[0] ?? 0)}`);
      markers.lines.push({ k: q[1] ?? 0, b: q[0] ?? 0 });
    }
  }
  const note = holes.length
    ? `Виколот${holes.length > 1 ? 'і точки' : 'а точка'} ${holes.map((h) => `(${formatApprox(h.x)}; ${formatApprox(h.y)})`).join(', ')} — це не асимптота.`
    : null;
  return { status: EXACT, text: joinAsymptotes(parts), note, markers };
}

function analyzeAsymptotes(ast, f, dom) {
  const markers = { vlines: [], vfamilies: [], lines: [], holes: [] };
  if (isConst(ast)) return { status: EXACT, text: 'немає', markers };
  const per = periodicInfo(ast);
  if (per) {
    if (per.fn === 'sin' || per.fn === 'cos') return { status: EXACT, text: 'немає', markers };
    const F = family(((per.fn === 'tan' ? PI / 2 : 0) - per.b) / per.a, PI / Math.abs(per.a));
    markers.vfamilies.push(F);
    return { status: EXACT, text: `вертикальні: x = ${familyText(F)}`, markers };
  }
  const R = normRational(toRational(ast));
  if (R) {
    const res = rationalAsymptotes(R, f);
    return { ...res, markers: { ...markers, ...res.markers } };
  }

  // Общий случай: кандидаты в вертикальные асимптоты — концы области определения.
  let status = EXACT;
  const parts = [];
  const candidates = new Set();
  if (dom.exact) {
    for (const I of dom.set) {
      if (isNum(I.a) && Math.abs(I.a) <= 1e6) candidates.add(I.a);
      if (isNum(I.b) && Math.abs(I.b) <= 1e6) candidates.add(I.b);
    }
  } else {
    const xs = linspace(...ZERO_WINDOW, 4001);
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = isNum(f(xs[i])), b = isNum(f(xs[i + 1]));
      if (a !== b) candidates.add(a ? domainEdge(f, xs[i], xs[i + 1]).x : domainEdge(f, xs[i + 1], xs[i]).x);
    }
  }
  const vs = [...candidates].filter((c) => growsUnbounded(f, c, -1) || growsUnbounded(f, c, 1)).sort((p, q) => p - q);
  for (const F of dom.families) {
    if ([F.x0, F.x0 + F.T].every((c) => growsUnbounded(f, c, -1) || growsUnbounded(f, c, 1))) {
      markers.vfamilies.push(F);
      parts.push(`вертикальні: x = ${familyText(F)}`);
      status = NUMERIC;
    }
  }
  if (vs.length) {
    status = NUMERIC;
    parts.push(`вертикальн${vs.length > 1 ? 'і' : 'а'}: ${vs.map((x) => eqApprox('x', x)).join(', ')}`);
    markers.vlines.push(...vs);
  }

  const sideOpen = (s) => (dom.exact
    ? (s > 0 ? dom.set.at(-1)?.b === Infinity : dom.set[0]?.a === -Infinity)
    : [1e4 * Math.SQRT2, 1e5 * Math.PI, 1e6 * Math.E].every((v) => isNum(f(s * v))));
  const sides = {};
  for (const s of [1, -1]) {
    if (!sideOpen(s)) continue;
    const lim = limitAt(ast, s);
    if (lim !== null) {
      if (isNum(lim)) sides[s] = { kind: 'h', y: lim, exact: true };
      continue;
    }
    const num = numericLimit(f, s);
    if (num) {
      sides[s] = { ...num, exact: false };
      status = NUMERIC;
    }
  }
  const lineOf = (L) => (L.kind === 'h' ? { k: 0, b: L.y } : { k: L.k, b: L.b });
  const textOf = (L) => {
    if (L.kind === 'h') {
      const pi = L.y !== 0 ? formatPiMultiple(L.y) : null;
      if (L.exact) return `горизонтальна: ${pi ? `y = ${pi}` : eqApprox('y', L.y)}`;
      const d = describeNumber(L.y, { tol: 1e-6 });
      return `горизонтальна: y ${d.exact ? '=' : '≈'} ${d.text}`;
    }
    return `похила: y ≈ ${lineText(L.k, L.b).replace(/≈ /g, '')}`;
  };
  const same = sides[1] && sides[-1] && sides[1].kind === sides[-1].kind
    && Math.abs((sides[1].y ?? sides[1].b) - (sides[-1].y ?? sides[-1].b)) < 1e-9
    && Math.abs((sides[1].k ?? 0) - (sides[-1].k ?? 0)) < 1e-9;
  if (same) {
    parts.push(textOf(sides[1]));
    markers.lines.push(lineOf(sides[1]));
  } else {
    if (sides[-1]) { parts.push(`${textOf(sides[-1])} при x → ${MINUS}∞`); markers.lines.push({ ...lineOf(sides[-1]), side: -1 }); }
    if (sides[1]) { parts.push(`${textOf(sides[1])} при x → +∞`); markers.lines.push({ ...lineOf(sides[1]), side: 1 }); }
  }
  return {
    status,
    text: joinAsymptotes(parts),
    note: status === NUMERIC ? 'Частину висновків отримано чисельно (перевірка поведінки функції біля меж і на нескінченності).' : null,
    markers,
  };
}

// ─────────────────────────────────── Итог ───────────────────────────────────

/**
 * Полный анализ функции.
 * @param {{ast:object, evaluate:(x:number)=>number}} parsed — результат parseFunction
 */
export function analyzeFunction(parsed) {
  const { ast, evaluate: f } = parsed;
  const dom = computeDomain(ast);
  const domain = describeDomain(dom, f);
  const zeros = analyzeZeros(ast, f, dom);
  const yint = analyzeYIntercept(ast);
  const mono = analyzeMonotonic(ast, f, dom);
  const parity = analyzeParity(ast, f, dom);
  const asym = analyzeAsymptotes(ast, f, dom);

  const sections = [
    { key: 'domain', title: 'Область визначення', status: domain.status, text: domain.text, note: domain.note },
    { key: 'zeros', title: 'Нулі функції', status: zeros.status, text: zeros.text, note: zeros.note },
    { key: 'yint', title: 'Перетин з віссю Oy', status: yint.status, text: yint.text, note: yint.note },
    { key: 'inc', title: 'Зростає', status: mono.status, text: mono.inc, note: mono.note },
    { key: 'dec', title: 'Спадає', status: mono.status, text: mono.dec },
    ...(mono.flat ? [{ key: 'flat', title: 'Стала', status: mono.status, text: mono.flat }] : []),
    { key: 'extrema', title: 'Екстремуми', status: mono.status, text: mono.extrema },
    { key: 'parity', title: 'Парність', status: parity.status, text: parity.text, note: parity.note },
    { key: 'asym', title: 'Асимптоти', status: asym.status, text: asym.text, note: asym.note },
  ];

  const markers = {
    points: [
      ...zeros.points.map((x) => ({ x, y: 0, kind: 'zero' })),
      ...(yint.point ? [{ ...yint.point, kind: 'yint' }] : []),
      ...mono.extremaPoints.map((e) => ({ x: e.x, y: e.y, kind: e.kind })),
    ],
    families: [
      ...zeros.families.map((F) => ({ ...F, kind: 'zero' })),
      ...mono.extremaFamilies,
    ],
    holes: asym.markers.holes,
    vlines: asym.markers.vlines,
    vfamilies: asym.markers.vfamilies,
    lines: asym.markers.lines,
  };
  return { sections, markers, domain: dom };
}
