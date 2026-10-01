// Автотесты математического ядра (без браузера): node tests/run-tests.js
// Проверяют разбор формул, вычисления, анализ функций и критерий вертикальной прямой.

import { parseFunction, parseConstant, explainAt, realPow } from '../js/core/FunctionParser.js';
import { analyzeFunction } from '../js/core/FunctionAnalyzer.js';
import { realRoots } from '../js/core/polynomial.js';
import { formatNumber, formatValue, describeNumber, formatPiMultiple } from '../js/core/format.js';
import { compareFunctions } from '../js/core/numeric.js';
import { ALL_KINDS, verticalTest } from '../js/modes/testShapes.js';
import { choiceTask, pointsTask, formulaTask } from '../js/modes/training/tasks.js';
import { tableXs } from '../js/ui/ValueTable.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`✗ ${name}\n    ${err.message}`);
  }
}

function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
}

function near(actual, expected, tol = 1e-9, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg} ожидалось ≈${expected}, получено ${actual}`);
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const f = (src) => {
  const p = parseFunction(src);
  if (!p.ok) throw new Error(`не разобралось «${src}»: ${p.error.message}`);
  return p;
};
const section = (a, key) => a.sections.find((s) => s.key === key);

// ─────────────── Разбор и вычисление ───────────────

test('формулы из задания строятся и вычисляются', () => {
  near(f('y = x^2').evaluate(3), 9);
  near(f('y = 2x + 3').evaluate(2), 7);
  near(f('y = sin(x)').evaluate(Math.PI / 2), 1);
  near(f('y = sqrt(x)').evaluate(9), 3);
  near(f('y = 1/x').evaluate(4), 0.25);
  near(f('y = |x - 2|').evaluate(-1), 3);
  near(f('y = x^3 - 2x').evaluate(2), 4);
});

test('пример из задания: f(x) = x² + 2, f(3) = 11', () => {
  eq(f('x^2 + 2').evaluate(3), 11);
});

test('неявное умножение, юникод, кириллица, константы', () => {
  near(f('2x(x+1)').evaluate(2), 12);
  near(f('x²').evaluate(5), 25);
  near(f('х^2').evaluate(3), 9); // кириллическая «х»
  near(f('2pi').evaluate(0), 2 * Math.PI);
  near(f('e^x').evaluate(1), Math.E);
  near(f('sin 2x').evaluate(Math.PI / 4), 1);
  near(f('sin²x + cos²x').evaluate(0.7), 1);
  near(f('log_2(x)').evaluate(8), 3);
  near(f('lg x').evaluate(1000), 3);
  near(f('2,5x').evaluate(2), 5);
  near(f('√2x').evaluate(1), Math.SQRT2);
  near(f('-x^2').evaluate(3), -9);
  near(f('2^-x').evaluate(2), 0.25);
  near(f('|x| - |x - 1|').evaluate(5), 1);
});

test('степени в действительных числах: (−8)^(1/3) = −2, (−8)^(1/2) не определено', () => {
  near(realPow(-8, 1 / 3), -2);
  near(realPow(-8, 2 / 3), 4);
  ok(Number.isNaN(realPow(-8, 0.5)), 'корень чётной степени из отрицательного');
  ok(Number.isNaN(realPow(0, -1)), '0 в отрицательной степени');
});

test('неопределённые значения — NaN, а не Infinity', () => {
  ok(Number.isNaN(f('1/x').evaluate(0)), '1/0');
  ok(Number.isNaN(f('ln(x)').evaluate(0)), 'ln 0');
  ok(Number.isNaN(f('sqrt(x)').evaluate(-1)), '√−1');
  ok(Number.isNaN(f('tg(x)').evaluate(Math.PI / 2)), 'tg π/2');
  ok(Number.isNaN(f('e^x').evaluate(1000)), 'переполнение');
});

test('ошибки ввода распознаются и объясняются', () => {
  const bad = ['', 'x^', '2x +', 'sin', '(x+1', 'x+1)', '|x', 'x = 3', 'y = 2x + y', 'foo(x)', '2 # x', '[x+1}', '1.2.3', 'log_1(x)'];
  for (const src of bad) {
    const r = parseFunction(src);
    ok(!r.ok, `«${src}» должно быть ошибкой`);
    ok(r.error.message.length > 5, `у «${src}» должно быть понятное сообщение`);
  }
  ok(/вертикальна пряма/.test(parseFunction('x = 3').error.message), 'x = 3 — подсказка про вертикальную прямую');
  ok(/sqrt/.test(parseFunction('sqr(x)').error.message), 'подсказка sqrt');
});

test('печать формулы и подстановка', () => {
  eq(f('x^2+2').text, 'x² + 2');
  eq(f('-3x - 2').text, '−3x − 2');
  eq(f('1/(2x)').text, '1/(2x)');
  eq(f('|x-2|').text, '|x − 2|');
  const { reason } = explainAt(f('1/x').ast, 0);
  ok(/ділення на нуль/.test(reason), reason);
});

test('parseConstant: числа и выражения без x', () => {
  near(parseConstant('pi/2').value, Math.PI / 2);
  near(parseConstant('-1,5').value, -1.5);
  ok(!parseConstant('x').ok, 'x — не число');
});

// ─────────────── Форматирование ───────────────

test('числа выводятся по-русски, без NaN и Infinity', () => {
  eq(formatNumber(-2.5), '−2,5');
  eq(formatNumber(1 / 3), '0,3333');
  eq(formatValue(NaN), 'не визначено');
  eq(formatValue(Infinity), 'занадто велике');
  eq(formatNumber(12345678), '1,235·10⁷');
  eq(describeNumber(Math.SQRT2).text, '√2');
  eq(formatPiMultiple(Math.PI / 2), 'π/2');
  eq(formatPiMultiple(-3 * Math.PI / 4), '−3π/4');
});

test('таблица значений без накопления ошибок float', () => {
  const xs = tableXs(-1, 1, 0.1);
  eq(xs.length, 21);
  eq(xs[3], -0.7);
  eq(xs[13], 0.3);
});

// ─────────────── Многочлены ───────────────

test('корни многочленов, включая кратные', () => {
  const r = realRoots([-6, 11, -6, 1]); // (x−1)(x−2)(x−3)
  eq(r.join(','), '1,2,3');
  eq(realRoots([1, -2, 1]).join(','), '1'); // (x−1)²
  eq(realRoots([1, 0, 1]).length, 0); // x² + 1
  eq(realRoots([0, 0, 0, 1]).join(','), '0'); // x³
});

// ─────────────── Анализ ───────────────

test('анализ x²', () => {
  const a = analyzeFunction(f('x^2'));
  eq(section(a, 'domain').status, 'exact');
  eq(section(a, 'zeros').text, 'x = 0');
  eq(section(a, 'inc').text, '[0; +∞)');
  eq(section(a, 'dec').text, '(−∞; 0]');
  ok(/парна/.test(section(a, 'parity').text), 'парність');
  eq(section(a, 'extrema').text, 'min: (0; 0)');
});

test('анализ 1/x: разрыв, асимптоты, нечётность', () => {
  const a = analyzeFunction(f('1/x'));
  eq(section(a, 'domain').text, 'x ≠ 0');
  ok(/немає/.test(section(a, 'zeros').text), 'нулів немає');
  ok(/не входить/.test(section(a, 'yint').text), 'немає перетину з Oy');
  eq(section(a, 'asym').text, 'вертикальна: x = 0; горизонтальна: y = 0');
  ok(/^непарна/.test(section(a, 'parity').text), 'непарна');
});

test('анализ sin(x): периодические ответы точны', () => {
  const a = analyzeFunction(f('sin(x)'));
  eq(section(a, 'zeros').text, 'x = πk, k ∈ ℤ');
  eq(section(a, 'inc').text, '[−π/2 + 2πk; π/2 + 2πk], k ∈ ℤ');
});

test('анализ x³ − 2x: иррациональные корни и экстремумы', () => {
  const a = analyzeFunction(f('x^3 - 2x'));
  eq(section(a, 'zeros').text, 'x = −√2; x = 0; x = √2');
  ok(/max/.test(section(a, 'extrema').text) && /min/.test(section(a, 'extrema').text), 'max и min');
});

test('анализ |x − 2|, √(9 − x²), tg x, ln x', () => {
  eq(section(analyzeFunction(f('|x - 2|')), 'extrema').text, 'min: (2; 0)');
  eq(section(analyzeFunction(f('sqrt(9 - x^2)')), 'domain').text, '[−3; 3]');
  eq(section(analyzeFunction(f('tg x')), 'domain').text, 'x ≠ π/2 + πk, k ∈ ℤ');
  eq(section(analyzeFunction(f('ln(x)')), 'domain').text, '(0; +∞)');
});

test('выколотая точка не выдаётся за асимптоту', () => {
  const a = analyzeFunction(f('(x^2 - 1)/(x - 1)'));
  eq(section(a, 'asym').text, 'немає');
  ok(/Виколота точка \(1; 2\)/.test(section(a, 'asym').note), 'упоминание выколотой точки');
});

test('честность: приближённые выводы помечены, неизвестное — «не удалось»', () => {
  const a = analyzeFunction(f('sin(x) + x'));
  eq(section(a, 'zeros').status, 'numeric');
  const b = analyzeFunction(f('x^x'));
  eq(section(b, 'domain').status, 'unknown');
  eq(section(b, 'domain').text, 'Не вдалося визначити автоматично');
  const c = analyzeFunction(f('x^100'));
  eq(section(c, 'dec').text, '(−∞; 0]'); // а не «постоянна» около нуля
});

test('ни в одном анализе нет NaN/Infinity/undefined', () => {
  const list = ['x^2', '1/x', 'sin(x)', 'sqrt(x)', '|x-2|', 'x^3-2x', 'e^x', 'ln(x)', 'tg(x)', 'floor(x)', 'x^x', 'sin(1/x)', 'arcsin(x)', '1/(x^2-4)', 'x ln x', '2^x - 8', '5'];
  for (const src of list) {
    const shown = analyzeFunction(f(src)).sections.map((s) => `${s.title} ${s.text} ${s.note ?? ''}`).join(' | ');
    ok(!/NaN|Infinity|undefined|null/.test(shown), `«${src}»: ${shown.match(/NaN|Infinity|undefined|null/)?.[0]}`);
  }
});

// ─────────────── «Это функция?» ───────────────

test('критерий вертикальной прямой на всех видах графиков', () => {
  for (const [cat, table] of Object.entries(ALL_KINDS)) {
    for (const [kind, make] of Object.entries(table)) {
      for (let i = 0; i < 60; i++) {
        const shape = make();
        const { isFunction, witness } = verticalTest(shape);
        eq(isFunction, cat === 'FUNCTION_SHAPES', `${kind}:`);
        if (!isFunction) ok(witness && (witness.ys === 'all' || witness.ys.length >= 2), `${kind}: нужен свидетель`);
      }
    }
  }
});

// ─────────────── Тренировка ───────────────

test('задания тренировки корректны', () => {
  for (let i = 0; i < 200; i++) {
    const t = choiceTask();
    eq(t.options.length, 4, 'вариантов');
    eq(t.options[t.correctIndex], t.target, 'индекс правильного');
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      ok(!compareFunctions(t.options[a].parsed.evaluate, t.options[b].parsed.evaluate).equal, 'варианты различны');
    }
    ok(pointsTask().parsed.ok && formulaTask().parsed.ok, 'формулы заданий разбираются');
  }
});

test('сравнение формул: разная запись — одна функция', () => {
  ok(compareFunctions(f('-x^2 + 4').evaluate, f('4 - x*x').evaluate).equal, '−x² + 4 = 4 − x·x');
  ok(!compareFunctions(f('sqrt(x^2)').evaluate, f('x').evaluate).equal, '√(x²) ≠ x');
  ok(compareFunctions(f('sqrt(x^2)').evaluate, f('|x|').evaluate).equal, '√(x²) = |x|');
});

console.log(`\nFunction Lab — тести ядра: ${passed} пройдено, ${failures.length} з помилками\n`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
