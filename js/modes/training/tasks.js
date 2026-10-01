// Генератор тренировочных заданий: семейства функций с параметрами и
// правдоподобные «неправильные варианты» (знаки, сдвиги, отражения).

import { parseFunction } from '../../core/FunctionParser.js';
import { compareFunctions } from '../../core/numeric.js';

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const coef = (a) => (a === 1 ? '' : a === -1 ? '-' : String(a));
const tail = (b) => (b === 0 ? '' : b > 0 ? ` + ${b}` : ` - ${-b}`);
const shift = (h) => (h === 0 ? 'x' : `(x ${h > 0 ? '-' : '+'} ${Math.abs(h)})`);
const inner = (h) => (h === 0 ? 'x' : `x ${h > 0 ? '-' : '+'} ${Math.abs(h)}`);

/** Семейства: gen — случайные параметры, src — формула, mutate — «типичные ошибки». */
export const FAMILIES = {
  linear: {
    name: 'лінійна функція',
    gen: () => ({ k: pick([-3, -2, -1, -0.5, 0.5, 1, 2, 3]), b: rnd(-4, 4) }),
    src: ({ k, b }) => `${coef(k)}x${tail(b)}`,
    mutate: [
      (p) => ({ ...p, k: -p.k }),
      (p) => ({ ...p, b: -p.b }),
      (p) => ({ k: p.b === 0 ? 2 : p.b, b: p.k }),
      (p) => ({ ...p, k: p.k * 2 }),
      (p) => ({ k: -p.k, b: -p.b }),
    ],
  },
  parabola: {
    name: 'квадратична функція',
    gen: () => ({ a: pick([1, -1]), h: rnd(-3, 3), k: rnd(-4, 4) }),
    src: ({ a, h, k }) => `${coef(a)}${shift(h)}^2${tail(k)}`,
    mutate: [
      (p) => ({ ...p, a: -p.a }),
      (p) => ({ ...p, h: -p.h }),
      (p) => ({ ...p, k: -p.k }),
      (p) => ({ ...p, h: p.k, k: p.h }),
      (p) => ({ ...p, a: -p.a, k: -p.k }),
    ],
  },
  abs: {
    name: 'функція з модулем',
    gen: () => ({ a: pick([1, -1]), h: rnd(-3, 3), k: rnd(-3, 3) }),
    src: ({ a, h, k }) => `${coef(a)}|${inner(h)}|${tail(k)}`,
    mutate: [
      (p) => ({ ...p, a: -p.a }),
      (p) => ({ ...p, h: -p.h }),
      (p) => ({ ...p, k: -p.k }),
      (p) => ({ ...p, h: p.k, k: p.h }),
    ],
  },
  sqrt: {
    name: 'функція з коренем',
    gen: () => ({ a: pick([1, -1]), h: rnd(-4, 2), k: rnd(-3, 3) }),
    src: ({ a, h, k }) => `${coef(a)}sqrt(${inner(h)})${tail(k)}`,
    mutate: [
      (p) => ({ ...p, a: -p.a }),
      (p) => ({ ...p, h: -p.h }),
      (p) => ({ ...p, k: -p.k }),
      (p) => ({ ...p, h: p.k, k: p.h }),
    ],
  },
  hyperbola: {
    name: 'обернена пропорційність',
    gen: () => ({ k: pick([1, 2, 4, -1, -2, -4]), h: rnd(-2, 2), c: rnd(-2, 2) }),
    src: ({ k, h, c }) => `${k}/${h === 0 ? 'x' : `(${inner(h)})`}${tail(c)}`,
    mutate: [
      (p) => ({ ...p, k: -p.k }),
      (p) => ({ ...p, h: -p.h }),
      (p) => ({ ...p, c: -p.c }),
      (p) => ({ ...p, h: p.c, c: p.h }),
    ],
  },
  cubic: {
    name: 'кубічна функція',
    gen: () => ({ a: pick([1, -1]), h: rnd(-2, 2), k: rnd(-3, 3) }),
    src: ({ a, h, k }) => `${coef(a)}${shift(h)}^3${tail(k)}`,
    mutate: [
      (p) => ({ ...p, a: -p.a }),
      (p) => ({ ...p, h: -p.h }),
      (p) => ({ ...p, k: -p.k }),
    ],
  },
  exp: {
    name: 'показникова функція',
    gen: () => ({ b: pick([2, 0.5]), c: rnd(-3, 2) }),
    src: ({ b, c }) => `${b}^x${tail(c)}`,
    mutate: [
      (p) => ({ ...p, b: p.b === 2 ? 0.5 : 2 }),
      (p) => ({ ...p, c: -p.c }),
      (p) => ({ ...p, c: p.c + 2 }),
    ],
  },
};

function make(familyKey, params) {
  const fam = FAMILIES[familyKey];
  const source = fam.src(params);
  const parsed = parseFunction(source);
  if (!parsed.ok) throw new Error(`Bad task source: ${source}`);
  return { family: familyKey, familyName: fam.name, params, source, parsed };
}

/** Задание для построения по точкам: значения в целых x удобные, вершина видна. */
export function pointsTask() {
  const family = pick(['parabola', 'parabola', 'linear', 'abs']);
  let params = FAMILIES[family].gen();
  if (family === 'parabola') params = { a: pick([1, -1, 0.5]), h: rnd(-2, 2), k: rnd(-4, 3) };
  if (family === 'abs') params = { a: pick([1, -1, 2]), h: rnd(-2, 2), k: rnd(-3, 2) };
  return make(family, params);
}

/** Задание «найди формулу по графику». */
export function formulaTask() {
  const family = pick(['linear', 'parabola', 'parabola', 'abs', 'sqrt', 'hyperbola']);
  return make(family, FAMILIES[family].gen());
}

const differs = (a, b) => !compareFunctions(a.parsed.evaluate, b.parsed.evaluate, { xMin: -8, xMax: 8 }).equal;

/** Задание с выбором: правильный вариант и три непохожих на него (но правдоподобных). */
export function choiceTask() {
  const family = pick(Object.keys(FAMILIES));
  const target = make(family, FAMILIES[family].gen());
  const options = [target];
  const candidates = FAMILIES[family].mutate.map((m) => m(target.params));
  for (let i = 0; i < 30; i++) candidates.push(FAMILIES[family].gen());
  for (const params of candidates) {
    if (options.length === 4) break;
    const opt = make(family, params);
    if (options.every((o) => differs(o, opt))) options.push(opt);
  }
  const shuffled = options.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { target, options: shuffled, correctIndex: shuffled.indexOf(target) };
}
