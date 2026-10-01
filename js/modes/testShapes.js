// Фигуры для режима «Это функция?». Правильный ответ НЕ записан в фигуре —
// он вычисляется функцией verticalTest по критерию вертикальной прямой:
// фигура — график функции y = f(x), только если никакая прямая x = c
// не пересекает её больше одного раза.

import { parseFunction } from '../core/FunctionParser.js';
import { realRoots } from '../core/polynomial.js';
import { formatNumber, MINUS } from '../core/format.js';
import { linspace } from '../core/numeric.js';

export const RANGE = { xMin: -10, xMax: 10, yMin: -7, yMax: 7 };
const Y_LIMIT = 9; // пересечения считаем в видимой полосе (с запасом)

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const n = (v) => formatNumber(v);

// ─────────────── разметка формул ───────────────

const V = (name) => `<i class="m-v">${name}</i>`;
const N = (v) => `<span class="m-n">${n(Math.abs(v))}</span>`;
const op = (s) => `<span class="m-o">${s}</span>`;
const sup2 = '<sup class="m-sup"><span class="m-n">2</span></sup>';
/** (x − a) или x */
const shifted = (name, a) => (a === 0 ? V(name) : `<span class="m-p">(</span>${V(name)}${op(a > 0 ? MINUS : '+')}${N(a)}<span class="m-p">)</span>`);
const plusConst = (c) => (c === 0 ? '' : `${op(c > 0 ? '+' : MINUS)}${N(c)}`);
const math = (html) => `<span class="math">${html}</span>`;

// ─────────────── построители фигур ───────────────

function fnShape(source, title, note = '') {
  const p = parseFunction(source);
  if (!p.ok) throw new Error(`bad shape ${source}`);
  const f = p.evaluate;
  return {
    title,
    equation: math(`${V('y')}${op('=')}${p.html}`),
    note,
    specialXs: [],
    intersect: (x) => {
      const y = f(x);
      return Number.isFinite(y) ? [y] : [];
    },
    draw: (r, style) => r.plotFunction(f, style),
  };
}

function src(a, inner, k) {
  const coef = a === 1 ? '' : a === -1 ? '-' : `${a}*`;
  return `${coef}${inner}${k === 0 ? '' : k > 0 ? ` + ${k}` : ` - ${-k}`}`;
}
const shiftSrc = (h) => (h === 0 ? 'x' : `(x ${h > 0 ? '-' : '+'} ${Math.abs(h)})`);

const FUNCTION_SHAPES = {
  parabola: () => {
    const a = pick([1, -1, 0.5, -0.5]);
    const h = rnd(-3, 3), k = rnd(-3, 3);
    return fnShape(src(a, `${shiftSrc(h)}^2`, k), 'Парабола', 'Ветви параболы y = a(x − h)² + k направлены вверх или вниз — каждому x соответствует ровно одно значение y.');
  },
  line: () => {
    const k = pick([-2, -1, -0.5, 0.5, 1, 2, 3]), b = rnd(-4, 4);
    return fnShape(`${k}x ${b >= 0 ? '+' : '-'} ${Math.abs(b)}`, 'Прямая', 'Невертикальная прямая y = kx + b — график линейной функции.');
  },
  abs: () => {
    const a = pick([1, -1, 2, 0.5]);
    const h = rnd(-3, 3), k = rnd(-3, 2);
    return fnShape(src(a, `|x ${h >= 0 ? '-' : '+'} ${Math.abs(h)}|`, k), 'Модуль («галочка»)', 'У графика y = |x| есть излом, но над каждым x лежит только одна точка.');
  },
  cubic: () => {
    const b = pick([-3, -2, 0, 1]);
    return fnShape(`0.25x^3 ${b >= 0 ? '+' : '-'} ${Math.abs(b) * 0.5}x`, 'Кубическая парабола', 'Кубическая функция может «петлять» вверх-вниз, но не возвращается назад по x.');
  },
  sine: () => {
    const A = pick([1, 2, 3]), k = pick([0.5, 1, 2]);
    return fnShape(`${A}sin(${k}x)`, 'Синусоида', 'Синусоида бесконечно колеблется, но каждому x соответствует одно значение sin x.');
  },
  sqrt: () => {
    const h = rnd(-6, 1), k = rnd(-3, 2);
    return fnShape(src(1, `sqrt(${shiftSrc(h)})`, k), 'Ветвь корня', 'Функция y = √x определена только при x ≥ 0 — левее графика нет, и это нормально.');
  },
  hyperbola: () => {
    const k = pick([1, 2, 4, -1, -2, -4]);
    return fnShape(`${k}/x`, 'Гипербола', 'Гипербола y = k/x состоит из двух ветвей, но они лежат над разными x.');
  },
  exponent: () => {
    const b = pick([2, 0.5]), c = rnd(-3, 1);
    return fnShape(`${b}^x ${c >= 0 ? '+' : '-'} ${Math.abs(c)}`, 'Показательная функция', 'Показательная функция y = aˣ определена при всех x и принимает одно значение.');
  },
  horizontal: () => {
    const c = rnd(-4, 4);
    return fnShape(`${c}`, 'Горизонтальная прямая', 'Горизонтальная прямая y = c — тоже функция: каждому x соответствует одно и то же значение c.');
  },
  semicircle: () => {
    const R = pick([3, 4, 5]);
    const shape = fnShape(`sqrt(${R * R} - x^2)`, 'Верхняя полуокружность', `Полуокружность y = √(${R * R} − x²) — функция: вертикальная прямая пересекает её не больше одного раза. Целая окружность — уже нет.`);
    shape.specialXs = [-R, R, 0];
    return shape;
  },
  points: () => {
    const xs = shuffle([-6, -4, -3, -1, 0, 2, 3, 5, 7]).slice(0, 7).sort((p, q) => p - q);
    const pts = xs.map((x) => ({ x, y: rnd(-5, 5) }));
    return pointsShape(pts, 'Набор точек', 'Отдельные точки тоже могут задавать функцию — если у всех точек разные x.');
  },
  piecewise: () => {
    const c = rnd(-2, 2), y1 = rnd(-4, 0), y2 = rnd(1, 4);
    return stepShape(c, y1, y2, false);
  },
};

const NONFUNCTION_SHAPES = {
  vertical: () => {
    const c = pick([-5, -3, -2, 1, 2, 3, 4]);
    return {
      title: 'Вертикальная прямая',
      equation: math(`${V('x')}${op('=')}<span class="m-n">${n(c)}</span>`),
      note: `Прямая x = ${n(c)}: одному значению x соответствует бесконечно много значений y.`,
      specialXs: [c],
      intersect: (x) => (Math.abs(x - c) < 1e-9 ? 'all' : []),
      draw: (r, style) => r.drawVLine(c, { width: 2.6, ...style }),
    };
  },
  circle: () => {
    const R = pick([2, 3, 4, 5]);
    const a = R >= 5 ? 0 : rnd(-3, 3), b = R >= 4 ? 0 : rnd(-2, 2);
    return {
      title: 'Окружность',
      equation: math(`${shifted('x', a)}${sup2}${op('+')}${shifted('y', b)}${sup2}${op('=')}<span class="m-n">${R * R}</span>`),
      note: 'Окружность нельзя задать одной формулой y = f(x): над каждой внутренней точкой диаметра лежат две её точки.',
      specialXs: [a],
      intersect: (x) => {
        const d = R * R - (x - a) ** 2;
        if (d < -1e-12) return [];
        if (Math.abs(d) < 1e-12) return [b];
        const s = Math.sqrt(d);
        return [b + s, b - s];
      },
      draw: (r, style) => r.plotParametric((t) => a + R * Math.cos(t), (t) => b + R * Math.sin(t), 0, 2 * Math.PI, style),
    };
  },
  ellipse: () => {
    const A = pick([4, 5, 6]), B = pick([2, 3]);
    return {
      title: 'Эллипс',
      equation: math(`<span class="m-frac"><span class="m-fn">${V('x')}${sup2}</span><span class="m-fd"><span class="m-n">${A * A}</span></span></span>${op('+')}<span class="m-frac"><span class="m-fn">${V('y')}${sup2}</span><span class="m-fd"><span class="m-n">${B * B}</span></span></span>${op('=')}<span class="m-n">1</span>`),
      note: 'Эллипс, как и окружность, — замкнутая кривая: вертикальная прямая через его середину пересекает его дважды.',
      specialXs: [0],
      intersect: (x) => {
        const d = 1 - (x / A) ** 2;
        if (d < -1e-12) return [];
        if (Math.abs(d) < 1e-12) return [0];
        const s = B * Math.sqrt(d);
        return [s, -s];
      },
      draw: (r, style) => r.plotParametric((t) => A * Math.cos(t), (t) => B * Math.sin(t), 0, 2 * Math.PI, style),
    };
  },
  sidewaysParabola: () => {
    const a = pick([0.5, 1, -0.5, -1]), k = rnd(-2, 2), h = rnd(-4, 2);
    const coef = a === 1 ? '' : a === -1 ? MINUS : `<span class="m-n">${n(a)}</span>`;
    return {
      title: '«Лежачая» парабола',
      equation: math(`${V('x')}${op('=')}${coef}${shifted('y', k)}${sup2}${plusConst(h)}`),
      note: 'Это парабола, повёрнутая на бок: x выражается через y, а одному x соответствуют два значения y.',
      specialXs: [h + a * 4, h + a],
      intersect: (x) => {
        const d = (x - h) / a;
        if (d < -1e-12) return [];
        if (Math.abs(d) < 1e-12) return [k];
        const s = Math.sqrt(d);
        return [k + s, k - s];
      },
      draw: (r, style) => r.plotParametric((t) => a * (t - k) ** 2 + h, (t) => t, -12, 12, style),
    };
  },
  sidewaysAbs: () => {
    const h = rnd(-4, 1);
    return {
      title: '«Галочка» на боку',
      equation: math(`${V('x')}${op('=')}<span class="m-abs">|</span>${V('y')}<span class="m-abs">|</span>${plusConst(h)}`),
      note: 'Повёрнутый график модуля: вправо от вершины над каждым x две точки — сверху и снизу.',
      specialXs: [h + 3],
      intersect: (x) => {
        const d = x - h;
        if (d < -1e-12) return [];
        if (Math.abs(d) < 1e-12) return [0];
        return [d, -d];
      },
      draw: (r, style) => r.plotParametric((t) => Math.abs(t) + h, (t) => t, -12, 12, style),
    };
  },
  hyperbolaLR: () => {
    const A = pick([1, 2, 3]);
    return {
      title: 'Гипербола с «боковыми» ветвями',
      equation: math(`<span class="m-frac"><span class="m-fn">${V('x')}${sup2}</span><span class="m-fd"><span class="m-n">${A * A}</span></span></span>${op(MINUS)}${V('y')}${sup2}${op('=')}<span class="m-n">1</span>`),
      note: 'Ветви этой гиперболы открываются влево и вправо, поэтому над точками справа и слева их по две.',
      specialXs: [A * 2, -A * 2],
      intersect: (x) => {
        const d = (x / A) ** 2 - 1;
        if (d < -1e-12) return [];
        if (Math.abs(d) < 1e-12) return [0];
        const s = Math.sqrt(d);
        return [s, -s];
      },
      draw: (r, style) => {
        r.plotParametric((t) => A * Math.cosh(t), (t) => Math.sinh(t), -3, 3, style);
        r.plotParametric((t) => -A * Math.cosh(t), (t) => Math.sinh(t), -3, 3, style);
      },
    };
  },
  sidewaysSine: () => {
    const A = pick([2, 3]);
    return {
      title: 'Синусоида на боку',
      equation: math(`${V('x')}${op('=')}<span class="m-n">${A}</span><span class="m-f">sin</span>${V('y')}`),
      note: 'Повёрнутая синусоида: одна вертикальная прямая пересекает её сразу во многих точках.',
      specialXs: [0, A / 2],
      intersect: (x) => {
        const s = x / A;
        if (Math.abs(s) > 1) return [];
        const u = Math.asin(s);
        const ys = [];
        for (let k = -4; k <= 4; k++) {
          ys.push(u + 2 * Math.PI * k, Math.PI - u + 2 * Math.PI * k);
        }
        return dedupe(ys.filter((y) => Math.abs(y) <= Y_LIMIT + 3));
      },
      draw: (r, style) => r.plotParametric((t) => A * Math.sin(t), (t) => t, -14, 14, style, 1400),
    };
  },
  sidewaysCubic: () => ({
    title: 'Кубическая кривая на боку',
    equation: math(`${V('x')}${op('=')}<span class="m-frac"><span class="m-fn">${V('y')}<sup class="m-sup"><span class="m-n">3</span></sup>${op(MINUS)}<span class="m-n">3</span>${V('y')}</span><span class="m-fd"><span class="m-n">2</span></span></span>`),
    note: 'Кривая делает «петлю» назад по x, поэтому между x = −1 и x = 1 над одним x лежат три её точки.',
    specialXs: [0],
    intersect: (x) => realRoots([-2 * x, -3, 0, 1]),
    draw: (r, style) => r.plotParametric((t) => (t ** 3 - 3 * t) / 2, (t) => t, -4, 4, style),
  }),
  pointsRepeat: () => {
    const xs = shuffle([-6, -4, -2, 0, 1, 3, 5]).slice(0, 6).sort((p, q) => p - q);
    const pts = xs.map((x) => ({ x, y: rnd(-4, 4) }));
    const dup = pick(pts);
    let y2 = rnd(-5, 5);
    if (y2 === dup.y) y2 = dup.y > 0 ? dup.y - 3 : dup.y + 3;
    pts.push({ x: dup.x, y: y2 });
    return pointsShape(pts, 'Набор точек', `У двух точек одинаковый x = ${n(dup.x)}, но разные y — значит, это не функция.`);
  },
  piecewiseBad: () => {
    const c = rnd(-2, 2), y1 = rnd(-4, 0), y2 = rnd(1, 4);
    return stepShape(c, y1, y2, true);
  },
};

function pointsShape(pts, title, note) {
  const list = pts.map((p) => `(${n(p.x)}; ${n(p.y)})`).join(', ');
  return {
    title,
    equation: `<span class="small">${list}</span>`,
    note,
    specialXs: pts.map((p) => p.x),
    intersect: (x) => pts.filter((p) => Math.abs(p.x - x) < 1e-9).map((p) => p.y),
    draw: (r, style) => { for (const p of pts) r.drawPoint(p.x, p.y, { color: style.color, r: 5.5 }); },
  };
}

/** Ступенька: y = y1 при x < c и y = y2 при x ≥ c. bothClosed — оба конца закрашены (не функция). */
function stepShape(c, y1, y2, bothClosed) {
  const cond1 = bothClosed ? '≤' : '<';
  return {
    title: bothClosed ? 'Ступенька с двумя закрашенными концами' : 'Ступенька (кусочная функция)',
    equation: `<span class="small">y = ${n(y1)} при x ${cond1} ${n(c)}; y = ${n(y2)} при x ≥ ${n(c)}</span>`,
    note: bothClosed
      ? `Обе точки (${n(c)}; ${n(y1)}) и (${n(c)}; ${n(y2)}) закрашены — обе принадлежат графику, и при x = ${n(c)} получаются два значения y.`
      : `Пустой кружок в точке (${n(c)}; ${n(y1)}) не принадлежит графику, поэтому при x = ${n(c)} точка одна — (${n(c)}; ${n(y2)}).`,
    specialXs: [c],
    intersect: (x) => {
      if (x < c - 1e-9) return [y1];
      if (x > c + 1e-9) return [y2];
      return bothClosed ? [y2, y1] : [y2];
    },
    draw: (r, style) => {
      r.plotFunction(() => y1, { ...style, xMax: c });
      r.plotFunction(() => y2, { ...style, xMin: c });
      r.drawPoint(c, y1, { color: style.color, r: 5.5, hollow: !bothClosed });
      r.drawPoint(c, y2, { color: style.color, r: 5.5 });
    },
  };
}

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dedupe(ys) {
  const s = ys.slice().sort((p, q) => p - q);
  return s.filter((y, i) => i === 0 || Math.abs(y - s[i - 1]) > 1e-9);
}

/**
 * Критерий вертикальной прямой. Проверяем густую сетку x и «особые» x фигуры.
 * @returns {{ isFunction: boolean, witness: null | { x:number, ys: number[]|'all', count:number } }}
 */
export function verticalTest(shape) {
  // «особые» x (центр окружности, повторяющийся x у точек…) проверяем первыми:
  // при равной наглядности свидетель берётся из них — там самые круглые координаты
  const xs = [...shape.specialXs, ...linspace(RANGE.xMin, RANGE.xMax, 2001)];
  const special = shape.specialXs.length;
  let found = false;
  let best = null;
  // наглядность свидетеля: точки видны на экране, не слипаются, x — «круглое» и ближе к центру
  const score = (x, ys) => {
    if (ys === 'all') return Infinity;
    let gap = Infinity;
    for (let i = 1; i < ys.length; i++) gap = Math.min(gap, Math.abs(ys[i] - ys[i - 1]));
    return Math.min(gap, 5) * (Number.isInteger(x) ? 1.5 : 1) - Math.abs(x) * 0.08;
  };
  for (const [i, x] of xs.entries()) {
    const raw = shape.intersect(x);
    const ys = raw === 'all' ? 'all' : dedupe(raw.filter((y) => Math.abs(y) <= Y_LIMIT)).sort((p, q) => q - p);
    const count = ys === 'all' ? Infinity : ys.length;
    if (count < 2) continue;
    found = true;
    const shown = ys === 'all' ? 'all' : ys.filter((y) => Math.abs(y) <= RANGE.yMax - 0.5);
    if (shown !== 'all' && shown.length < 2) continue;
    const s = score(x, shown) + (i < special ? 3 : 0);
    if (!best || s > best.score) best = { x, ys: shown, count: shown === 'all' ? Infinity : shown.length, score: s };
  }
  if (found && !best) {
    // все пересечения за краем экрана — показываем как есть
    for (const x of xs) {
      const raw = shape.intersect(x);
      if (raw !== 'all' && raw.length >= 2) return { isFunction: false, witness: { x, ys: dedupe(raw).sort((p, q) => q - p), count: raw.length } };
    }
  }
  return { isFunction: !found, witness: best };
}

const FUNCTION_KINDS = Object.keys(FUNCTION_SHAPES);
const NONFUNCTION_KINDS = Object.keys(NONFUNCTION_SHAPES);

/** Случайное задание; не повторяет вид фигуры подряд. */
export function randomShape(lastKind = null) {
  const wantFunction = Math.random() < 0.5;
  const kinds = (wantFunction ? FUNCTION_KINDS : NONFUNCTION_KINDS).filter((k) => k !== lastKind);
  const kind = pick(kinds);
  const shape = (FUNCTION_SHAPES[kind] ?? NONFUNCTION_SHAPES[kind])();
  shape.kind = kind;
  return shape;
}

export const ALL_KINDS = { FUNCTION_SHAPES, NONFUNCTION_SHAPES };
