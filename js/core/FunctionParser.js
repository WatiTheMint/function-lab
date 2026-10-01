// FunctionParser — разбирает формулу («y = 2x + 3», «|x − 2|», «sin²x», «√x») в дерево (AST),
// компилирует его в функцию x → y и печатает обратно в текст/HTML.
// eval/new Function не используются: вычисление идёт по дереву замыканий.

import { formatNumber, formatValue, MINUS, toSuperscript, toSubscript } from './format.js';

export class ParseError extends Error {
  constructor(message, start = 0, end = start + 1) {
    super(message);
    this.name = 'ParseError';
    this.start = start;
    this.end = end;
  }
}

// ───────────────────────── Вещественная арифметика ─────────────────────────

const TRIG_EPS = 1e-14;

/** Знаменатель q (нечётный, ≤ 99), если e = p/q; иначе 0. Нужен для (−8)^(1/3) = −2. */
export function oddRootDenominator(e) {
  for (let q = 3; q <= 99; q += 2) {
    const p = e * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) return q;
  }
  return 0;
}

/** Возведение в степень в действительных числах (школьная математика). */
export function realPow(b, e) {
  if (Number.isNaN(b) || Number.isNaN(e)) return NaN;
  if (b === 0 && e < 0) return NaN;
  if (b >= 0 || Number.isInteger(e)) return b ** e;
  const q = oddRootDenominator(e);
  if (!q) return NaN;
  const p = Math.round(e * q);
  const mag = (-b) ** e;
  return p % 2 === 0 ? mag : -mag;
}

const tanSafe = (a) => (Math.abs(Math.cos(a)) < TRIG_EPS * Math.max(1, Math.abs(a)) ? NaN : Math.tan(a));
const cotSafe = (a) => {
  const s = Math.sin(a);
  return Math.abs(s) < TRIG_EPS * Math.max(1, Math.abs(a)) ? NaN : Math.cos(a) / s;
};

/** Поддерживаемые функции. label — как функция печатается (русская традиция: tg, ctg, arctg). */
export const FUNCTIONS = {
  sin: { eval: Math.sin, label: 'sin' },
  cos: { eval: Math.cos, label: 'cos' },
  tan: { eval: tanSafe, label: 'tg' },
  cot: { eval: cotSafe, label: 'ctg' },
  arcsin: { eval: Math.asin, label: 'arcsin' },
  arccos: { eval: Math.acos, label: 'arccos' },
  arctan: { eval: Math.atan, label: 'arctg' },
  arccot: { eval: (a) => Math.PI / 2 - Math.atan(a), label: 'arcctg' },
  sinh: { eval: Math.sinh, label: 'sh' },
  cosh: { eval: Math.cosh, label: 'ch' },
  tanh: { eval: Math.tanh, label: 'th' },
  sqrt: { eval: Math.sqrt, label: '√' },
  cbrt: { eval: Math.cbrt, label: '∛' },
  abs: { eval: Math.abs, label: 'abs' },
  exp: { eval: Math.exp, label: 'exp' },
  ln: { eval: (a) => (a > 0 ? Math.log(a) : NaN), label: 'ln' },
  lg: { eval: (a) => (a > 0 ? Math.log10(a) : NaN), label: 'lg' },
  sign: { eval: Math.sign, label: 'sgn' },
  floor: { eval: Math.floor, label: 'floor' },
  ceil: { eval: Math.ceil, label: 'ceil' },
};

const ALIASES = {
  tg: 'tan', ctg: 'cot', cotan: 'cot',
  asin: 'arcsin', acos: 'arccos', atan: 'arctan', arctg: 'arctan', arcctg: 'arccot', acot: 'arccot',
  sgn: 'sign', log: 'lg',
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

// Имена, на которые разбиваются слитные буквы («sinx» → sin x, «2pix» → 2 pi x).
const NAMES = [...Object.keys(FUNCTIONS), ...Object.keys(ALIASES), 'log', 'pi', 'e', 'x', 'y']
  .filter((n, i, a) => a.indexOf(n) === i)
  .sort((a, b) => b.length - a.length);

// ───────────────────────────────── Лексер ─────────────────────────────────

const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => (c >= 'a' && c <= 'z');
const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);

function readNumber(src, i) {
  let j = i;
  while (j < src.length && isDigit(src[j])) j++;
  if ((src[j] === '.' || src[j] === ',') && isDigit(src[j + 1] ?? '')) {
    j++;
    while (j < src.length && isDigit(src[j])) j++;
  } else if (src[j] === '.' && j > i) {
    j++; // «2.» — допустимо
  }
  if ((src[j] === '.' || src[j] === ',') && isDigit(src[j + 1] ?? '')) {
    throw new ParseError('Лишний десятичный разделитель в числе', j, j + 1);
  }
  return { value: parseFloat(src.slice(i, j).replace(',', '.')), end: j };
}

function splitWord(word, offset) {
  const parts = [];
  let k = 0;
  while (k < word.length) {
    const name = NAMES.find((n) => word.startsWith(n, k));
    if (!name) {
      const rest = word.slice(k);
      const guess = NAMES.find((n) => n.length > 1 && n.startsWith(rest));
      const hint = guess ? ` Возможно, вы имели в виду ${guess}(x)?` : ' Используйте x, числа, pi, e и функции вроде sin, sqrt, ln.';
      throw new ParseError(`Неизвестное имя «${word}».${hint}`, offset, offset + word.length);
    }
    parts.push({ type: 'name', value: name, start: offset + k, end: offset + k + name.length });
    k += name.length;
  }
  return parts;
}

function tokenize(src, offset) {
  const tokens = [];
  let i = 0;
  const at = (k) => offset + k;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const { value, end } = readNumber(src, i);
      tokens.push({ type: 'num', value, start: at(i), end: at(end) });
      i = end;
      continue;
    }

    if (SUPERSCRIPT_DIGITS.includes(c) || c === '⁻') {
      let j = i;
      let s = '';
      if (src[j] === '⁻') { s = '-'; j++; }
      if (!SUPERSCRIPT_DIGITS.includes(src[j] ?? '')) throw new ParseError('Непонятный показатель степени', at(i), at(j + 1));
      while (j < src.length && SUPERSCRIPT_DIGITS.includes(src[j])) { s += SUPERSCRIPT_DIGITS.indexOf(src[j]); j++; }
      tokens.push({ type: 'op', value: '^', start: at(i), end: at(i) });
      tokens.push({ type: 'num', value: Number(s), start: at(i), end: at(j) });
      i = j;
      continue;
    }

    if (isLetter(c)) {
      let j = i;
      while (j < src.length && isLetter(src[j])) j++;
      const parts = splitWord(src.slice(i, j), at(i));
      tokens.push(...parts);
      i = j;
      const last = parts[parts.length - 1];
      if (last.value === 'log' && (src[i] === '_' || isDigit(src[i] ?? ''))) {
        // log_2(x), log_{10}(x), log2(x)
        let j2 = i;
        if (src[j2] === '_') j2++;
        let brace = null;
        if (OPEN[src[j2]]) { brace = OPEN[src[j2]]; j2++; }
        if (!isDigit(src[j2] ?? '') && src[j2] !== '.') throw new ParseError('После log_ ожидается основание, например log_2(x)', at(i), at(j2 + 1));
        const { value, end } = readNumber(src, j2);
        j2 = end;
        if (brace) {
          if (src[j2] !== brace) throw new ParseError(`Не закрыта скобка в основании логарифма`, at(i), at(j2));
          j2++;
        }
        if (!(value > 0) || value === 1) throw new ParseError('Основание логарифма должно быть больше 0 и не равно 1', at(i), at(j2));
        last.base = value;
        last.end = at(j2);
        i = j2;
      }
      continue;
    }

    if (c === 'π') { tokens.push({ type: 'name', value: 'pi', start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '√') { tokens.push({ type: 'name', value: 'sqrt', radical: true, start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '∛') { tokens.push({ type: 'name', value: 'cbrt', radical: true, start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '+') { tokens.push({ type: 'op', value: '+', start: at(i), end: at(i + 1) }); i++; continue; }
    if ('-−–—'.includes(c)) { tokens.push({ type: 'op', value: '-', start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '*' && src[i + 1] === '*') { tokens.push({ type: 'op', value: '^', start: at(i), end: at(i + 2) }); i += 2; continue; }
    if ('*×·∙⋅'.includes(c)) { tokens.push({ type: 'op', value: '*', start: at(i), end: at(i + 1) }); i++; continue; }
    if ('/÷:'.includes(c)) { tokens.push({ type: 'op', value: '/', start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '^') { tokens.push({ type: 'op', value: '^', start: at(i), end: at(i + 1) }); i++; continue; }
    if (OPEN[c]) { tokens.push({ type: 'lparen', value: c, close: OPEN[c], start: at(i), end: at(i + 1) }); i++; continue; }
    if (CLOSE.has(c)) { tokens.push({ type: 'rparen', value: c, start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '|') { tokens.push({ type: 'bar', start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === '=') { tokens.push({ type: 'eq', start: at(i), end: at(i + 1) }); i++; continue; }
    if (c === ',') throw new ParseError('Запятая допустима только внутри числа: 2,5', at(i), at(i + 1));
    if (/[а-яё]/i.test(c)) throw new ParseError('Используйте латинские буквы: x, sin, cos, sqrt…', at(i), at(i + 1));
    throw new ParseError(`Непонятный символ «${c}»`, at(i), at(i + 1));
  }
  tokens.push({ type: 'end', start: at(src.length), end: at(src.length) });
  return tokens;
}

// ───────────────────────────────── Парсер ─────────────────────────────────

const describeToken = (t) => {
  if (t.type === 'op') return `«${t.value === '-' ? MINUS : t.value}»`;
  if (t.type === 'rparen') return `«${t.value}»`;
  if (t.type === 'bar') return '«|»';
  if (t.type === 'eq') return '«=»';
  if (t.type === 'num') return `число ${formatNumber(t.value)}`;
  return `«${t.value}»`;
};

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.i = 0;
    this.absDepth = 0;
  }

  peek() { return this.tokens[this.i]; }
  next() { return this.tokens[this.i++]; }
  isOp(t, v) { return t.type === 'op' && t.value === v; }

  parse() {
    const node = this.expr();
    const t = this.peek();
    if (t.type !== 'end') {
      if (t.type === 'rparen') throw new ParseError('Лишняя закрывающая скобка', t.start, t.end);
      if (t.type === 'eq') throw new ParseError('Лишний знак «=»', t.start, t.end);
      if (t.type === 'bar') throw new ParseError('Лишняя черта модуля «|»', t.start, t.end);
      throw new ParseError(`Неожиданно ${describeToken(t)}`, t.start, t.end);
    }
    return node;
  }

  expr() {
    let node = this.term();
    for (;;) {
      const t = this.peek();
      if (this.isOp(t, '+') || this.isOp(t, '-')) {
        this.next();
        const right = this.term();
        node = { type: t.value === '+' ? 'add' : 'sub', left: node, right };
      } else return node;
    }
  }

  startsOperand(t) {
    if (t.type === 'num' || t.type === 'lparen') return true;
    if (t.type === 'name') return true;
    if (t.type === 'bar') return this.absDepth === 0;
    return false;
  }

  term() {
    let node = this.unary();
    for (;;) {
      const t = this.peek();
      if (this.isOp(t, '*') || this.isOp(t, '/')) {
        this.next();
        const right = this.unary();
        node = { type: t.value === '*' ? 'mul' : 'div', left: node, right };
      } else if (this.startsOperand(t)) {
        const right = this.power();
        node = { type: 'mul', left: node, right, implicit: true };
      } else return node;
    }
  }

  unary() {
    const t = this.peek();
    if (this.isOp(t, '-')) { this.next(); return { type: 'neg', arg: this.unary() }; }
    if (this.isOp(t, '+')) { this.next(); return this.unary(); }
    return this.power();
  }

  power() {
    const base = this.primary();
    const t = this.peek();
    if (this.isOp(t, '^')) {
      this.next();
      if (this.peek().type === 'end') throw new ParseError('После «^» нужен показатель степени', t.start, t.end);
      const exponent = this.unary();
      return { type: 'pow', base, exponent };
    }
    return base;
  }

  primary() {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return { type: 'num', value: t.value };
      case 'name':
        if (t.value === 'x') return { type: 'var' };
        if (t.value === 'y') throw new ParseError('Справа от «=» должен быть только x: формула задаёт y через x', t.start, t.end);
        if (t.value in CONSTANTS) return { type: 'const', name: t.value, value: CONSTANTS[t.value] };
        return this.call(t);
      case 'lparen': {
        const inner = this.expr();
        const close = this.next();
        if (close.type !== 'rparen') throw new ParseError('Не хватает закрывающей скобки', t.start, close.start);
        if (close.value !== t.close) throw new ParseError(`Скобки не совпадают: «${t.value}» закрыта «${close.value}»`, t.start, close.end);
        return inner;
      }
      case 'bar': {
        this.absDepth++;
        const inner = this.expr();
        const close = this.next();
        this.absDepth--;
        if (close.type !== 'bar') throw new ParseError('Модуль не закрыт: нужна вторая черта «|»', t.start, close.start);
        return { type: 'call', fn: 'abs', arg: inner };
      }
      case 'rparen':
        throw new ParseError('Лишняя закрывающая скобка', t.start, t.end);
      case 'op':
        throw new ParseError(`Пропущено число или x перед ${describeToken(t)}`, t.start, t.end);
      case 'eq':
        throw new ParseError('Лишний знак «=»', t.start, t.end);
      case 'end':
        throw new ParseError('Формула обрывается — допишите выражение', t.start, t.end);
      default:
        throw new ParseError('Непонятная запись', t.start, t.end);
    }
  }

  call(t) {
    const fn = ALIASES[t.value] ?? t.value;
    const isLog = t.value === 'log' && t.base !== undefined;
    const label = isLog ? 'log' : FUNCTIONS[fn].label;
    const make = (arg) => (isLog ? { type: 'log', base: t.base, arg } : { type: 'call', fn, arg });

    if (t.radical) {
      // √x, √(x+1), √2x = √2·x, √−x
      if (this.isOp(this.peek(), '-')) {
        this.next();
        return make({ type: 'neg', arg: this.primary() });
      }
      if (!this.startsOperand(this.peek())) {
        throw new ParseError(`После «${t.value === 'cbrt' ? '∛' : '√'}» нужно подкоренное выражение`, t.start, t.end);
      }
      return make(this.primary());
    }

    // sin²x, sin^2(x) — степень самой функции
    let exponent = null;
    if (this.isOp(this.peek(), '^')) {
      this.next();
      exponent = this.primaryExponent();
    }

    let arg;
    const p = this.peek();
    if (p.type === 'lparen') {
      this.next();
      arg = this.expr();
      const close = this.next();
      if (close.type !== 'rparen') throw new ParseError(`Не закрыта скобка после ${label}`, p.start, close.start);
      if (close.value !== p.close) throw new ParseError(`Скобки не совпадают: «${p.value}» закрыта «${close.value}»`, p.start, close.end);
    } else if (this.startsOperand(p) || this.isOp(p, '-')) {
      arg = this.implicitArgument();
    } else {
      throw new ParseError(`После «${label}» нужен аргумент, например ${label}(x)`, t.start, t.end);
    }
    const node = make(arg);
    return exponent ? { type: 'pow', base: node, exponent } : node;
  }

  primaryExponent() {
    const t = this.peek();
    if (this.isOp(t, '-')) { this.next(); return { type: 'neg', arg: this.primary() }; }
    return this.primary();
  }

  /** Аргумент без скобок: «sin 2x» = sin(2x), «ln x^2» = ln(x²); останавливается на другой функции. */
  implicitArgument() {
    let node = this.unary();
    for (;;) {
      const t = this.peek();
      const simple = t.type === 'num' || (t.type === 'name' && (t.value === 'x' || t.value in CONSTANTS));
      if (!simple) return node;
      node = { type: 'mul', left: node, right: this.power(), implicit: true };
    }
  }
}

// ──────────────────────────────── Компиляция ────────────────────────────────

export function compile(node) {
  switch (node.type) {
    case 'num':
    case 'const': {
      const v = node.value;
      return () => v;
    }
    case 'var':
      return (x) => x;
    case 'neg': {
      const a = compile(node.arg);
      return (x) => -a(x);
    }
    case 'add': {
      const a = compile(node.left), b = compile(node.right);
      return (x) => a(x) + b(x);
    }
    case 'sub': {
      const a = compile(node.left), b = compile(node.right);
      return (x) => a(x) - b(x);
    }
    case 'mul': {
      const a = compile(node.left), b = compile(node.right);
      return (x) => a(x) * b(x);
    }
    case 'div': {
      const a = compile(node.left), b = compile(node.right);
      return (x) => {
        const d = b(x);
        return d === 0 ? NaN : a(x) / d;
      };
    }
    case 'pow': {
      const a = compile(node.base), b = compile(node.exponent);
      return (x) => realPow(a(x), b(x));
    }
    case 'call': {
      const f = FUNCTIONS[node.fn].eval;
      const a = compile(node.arg);
      return (x) => f(a(x));
    }
    case 'log': {
      const a = compile(node.arg);
      const b = node.base;
      const log = b === 2 ? Math.log2 : b === 10 ? Math.log10 : (v) => Math.log(v) / Math.log(b);
      return (x) => {
        const v = a(x);
        return v > 0 ? log(v) : NaN;
      };
    }
    default:
      throw new Error(`Unknown node ${node.type}`);
  }
}

/** Обёртка: любое не-конечное значение превращается в NaN («не определено»). */
export function toEvaluator(ast) {
  const raw = compile(ast);
  return (x) => {
    const y = raw(x);
    return Number.isFinite(y) ? y : NaN;
  };
}

export function dependsOnX(node) {
  switch (node.type) {
    case 'var': return true;
    case 'num': case 'const': return false;
    case 'neg': case 'call': case 'log': return dependsOnX(node.arg);
    case 'pow': return dependsOnX(node.base) || dependsOnX(node.exponent);
    default: return dependsOnX(node.left) || dependsOnX(node.right);
  }
}

// ─────────────────────── Почему значение не определено ───────────────────────

/**
 * Вычисляет f(x) и, если результат не определён, объясняет причину словами.
 * @returns {{ value: number, reason: string|null }}
 */
export function explainAt(ast, x) {
  let reason = null;
  const fail = (msg) => {
    if (!reason) reason = msg;
    return NaN;
  };
  const ev = (node) => {
    switch (node.type) {
      case 'num': case 'const': return node.value;
      case 'var': return x;
      case 'neg': return -ev(node.arg);
      case 'add': return ev(node.left) + ev(node.right);
      case 'sub': return ev(node.left) - ev(node.right);
      case 'mul': return ev(node.left) * ev(node.right);
      case 'div': {
        const a = ev(node.left), d = ev(node.right);
        if (Number.isNaN(a) || Number.isNaN(d)) return NaN;
        if (d === 0) return fail(`деление на ноль: знаменатель ${toText(node.right)} равен 0`);
        return a / d;
      }
      case 'pow': {
        const b = ev(node.base), e = ev(node.exponent);
        if (Number.isNaN(b) || Number.isNaN(e)) return NaN;
        const v = realPow(b, e);
        if (Number.isNaN(v)) {
          if (b === 0) return fail('ноль нельзя возводить в отрицательную степень');
          return fail(`отрицательное число ${formatValue(b)} нельзя возвести в степень ${formatValue(e)}`);
        }
        return v;
      }
      case 'call': {
        const a = ev(node.arg);
        if (Number.isNaN(a)) return NaN;
        const v = FUNCTIONS[node.fn].eval(a);
        if (!Number.isNaN(v)) return v;
        const arg = toText(node.arg);
        switch (node.fn) {
          case 'sqrt': return fail(`корень из отрицательного числа: ${arg} = ${formatValue(a)}`);
          case 'ln': case 'lg': return fail(`логарифм определён только для положительных чисел, а ${arg} = ${formatValue(a)}`);
          case 'arcsin': case 'arccos': return fail(`${FUNCTIONS[node.fn].label} определён только на [−1; 1], а ${arg} = ${formatValue(a)}`);
          case 'tan': return fail(`tg не определён там, где cos(${arg}) = 0`);
          case 'cot': return fail(`ctg не определён там, где sin(${arg}) = 0`);
          default: return fail('значение не определено');
        }
      }
      case 'log': {
        const a = ev(node.arg);
        if (Number.isNaN(a)) return NaN;
        if (!(a > 0)) return fail(`логарифм определён только для положительных чисел, а ${toText(node.arg)} = ${formatValue(a)}`);
        return Math.log(a) / Math.log(node.base);
      }
      default: return NaN;
    }
  };
  const value = ev(ast);
  if (Number.isFinite(value)) return { value, reason: null };
  if (!reason) reason = Number.isNaN(value) ? 'значение не определено' : 'значение слишком велико для вычисления';
  return { value: NaN, reason };
}

// ───────────────────────────────── Печать ─────────────────────────────────

const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4, call: 5, log: 5, num: 6, const: 6, var: 6 };
const prec = (n) => (n.type === 'num' && n.value < 0 ? 3 : PREC[n.type]);
const fmtConst = (v) => formatNumber(v, { decimals: 10 });

/** Узел начинается с числа (тогда «2·3», а не «23»). */
function leadsWithNumber(n) {
  if (n.type === 'num') return true;
  if (n.type === 'mul' || n.type === 'div' || n.type === 'add' || n.type === 'sub') return leadsWithNumber(n.left);
  if (n.type === 'pow') return leadsWithNumber(n.base);
  return false;
}

/** Можно ли записать произведение без знака умножения: «2x», «2π», «πx», «3sin(x)». */
function isImplicitPair(left, right) {
  const base = left.type === 'neg' ? left.arg : left; // «−3x»: минус перед числом
  const leftNum = base.type === 'num' && base.value >= 0;
  const leftConst = base.type === 'const';
  if (!leftNum && !leftConst) return false;
  if (leadsWithNumber(right) || prec(right) === 3) return false;
  if (leftConst && right.type === 'const') return false;
  return true;
}

/**
 * Текстовая запись: «x² + 2», «2sin(x)», «|x − 2|».
 * subst — подставить вместо x строку (для «f(3) = 3² + 2»).
 */
export function toText(node, subst = null) {
  const wrap = (n, cond) => (cond ? `(${toText(n, subst)})` : toText(n, subst));
  switch (node.type) {
    case 'num': return fmtConst(node.value);
    case 'const': return node.name === 'pi' ? 'π' : 'e';
    case 'var':
      if (subst == null) return 'x';
      return subst.startsWith(MINUS) || subst.includes('·') ? `(${subst})` : subst;
    case 'neg': return MINUS + wrap(node.arg, prec(node.arg) < 3 || node.arg.type === 'neg');
    case 'add': return `${toText(node.left, subst)} + ${wrap(node.right, node.right.type === 'neg' || prec(node.right) === 3)}`;
    case 'sub': return `${toText(node.left, subst)} ${MINUS} ${wrap(node.right, prec(node.right) <= 1 || prec(node.right) === 3)}`;
    case 'mul': {
      const L = wrap(node.left, prec(node.left) < 2 || node.left.type === 'div');
      const R = wrap(node.right, prec(node.right) <= 2 || prec(node.right) === 3);
      return subst == null && isImplicitPair(node.left, node.right) ? L + R : `${L}·${R}`;
    }
    case 'div':
      return `${wrap(node.left, prec(node.left) < 2)}/${wrap(node.right, prec(node.right) <= 3)}`;
    case 'pow': {
      const B = wrap(node.base, prec(node.base) < 5);
      const e = node.exponent;
      if (e.type === 'num' && Number.isInteger(e.value)) return B + toSuperscript(e.value);
      if (e.type === 'var' && subst == null) return `${B}ˣ`;
      return `${B}^${wrap(e, prec(e) < 6)}`;
    }
    case 'call': {
      const a = toText(node.arg, subst);
      switch (node.fn) {
        case 'abs': return `|${a}|`;
        case 'sqrt': return prec(node.arg) >= 5 ? `√${a}` : `√(${a})`;
        case 'cbrt': return prec(node.arg) >= 5 ? `∛${a}` : `∛(${a})`;
        case 'exp': return node.arg.type === 'var' && subst == null ? 'eˣ' : `e^(${a})`;
        default: return `${FUNCTIONS[node.fn].label}(${a})`;
      }
    }
    case 'log': return `log${toSubscript(fmtConst(node.base))}(${toText(node.arg, subst)})`;
    default: return '?';
  }
}

/** HTML-разметка формулы (дроби «этажом», степени, корень с чертой). */
export function toHTML(node, ctx = {}) {
  const inSup = ctx.inSup ?? false;
  const sub = (n, extra = {}) => toHTML(n, { ...ctx, ...extra });
  const paren = (html) => `<span class="m-p">(</span>${html}<span class="m-p">)</span>`;
  const wrap = (n, cond) => (cond ? paren(sub(n)) : sub(n));
  const op = (s) => `<span class="m-o">${s}</span>`;
  switch (node.type) {
    case 'num': return `<span class="m-n">${fmtConst(node.value)}</span>`;
    case 'const': return `<i class="m-c">${node.name === 'pi' ? 'π' : 'e'}</i>`;
    case 'var': return '<i class="m-v">x</i>';
    case 'neg': return `<span class="m-u">${MINUS}</span>${wrap(node.arg, prec(node.arg) < 3 || node.arg.type === 'neg')}`;
    case 'add': return `${sub(node.left)}${op('+')}${wrap(node.right, prec(node.right) === 3)}`;
    case 'sub': return `${sub(node.left)}${op(MINUS)}${wrap(node.right, prec(node.right) <= 1 || prec(node.right) === 3)}`;
    case 'mul': {
      const stacked = !inSup;
      const L = wrap(node.left, prec(node.left) < 2 || (!stacked && node.left.type === 'div'));
      const R = wrap(node.right, prec(node.right) < 2 || prec(node.right) === 3 || (!stacked && node.right.type === 'div'));
      const implicit = isImplicitPair(node.left, node.right) || (stacked && node.left.type === 'div' && !leadsWithNumber(node.right));
      return implicit ? `${L}<span class="m-j"></span>${R}` : `${L}${op('·')}${R}`;
    }
    case 'div':
      if (inSup) return `${wrap(node.left, prec(node.left) < 2)}/${wrap(node.right, prec(node.right) <= 3)}`;
      return `<span class="m-frac"><span class="m-fn">${sub(node.left)}</span><span class="m-fd">${sub(node.right)}</span></span>`;
    case 'pow': {
      const B = wrap(node.base, prec(node.base) < 5 || node.base.type === 'div');
      return `${B}<sup class="m-sup">${toHTML(node.exponent, { ...ctx, inSup: true })}</sup>`;
    }
    case 'call': {
      const a = sub(node.arg);
      switch (node.fn) {
        case 'abs': return `<span class="m-abs">|</span>${a}<span class="m-abs">|</span>`;
        case 'sqrt': return `<span class="m-sqrt"><span class="m-rad">√</span><span class="m-rd">${a}</span></span>`;
        case 'cbrt': return `<span class="m-sqrt"><span class="m-rad">∛</span><span class="m-rd">${a}</span></span>`;
        case 'exp': return `<i class="m-c">e</i><sup class="m-sup">${toHTML(node.arg, { ...ctx, inSup: true })}</sup>`;
        case 'floor': return `<span class="m-p">⌊</span>${a}<span class="m-p">⌋</span>`;
        case 'ceil': return `<span class="m-p">⌈</span>${a}<span class="m-p">⌉</span>`;
        default: return `<span class="m-f">${FUNCTIONS[node.fn].label}</span>${paren(a)}`;
      }
    }
    case 'log': return `<span class="m-f">log</span><sub class="m-sub">${fmtConst(node.base)}</sub>${paren(sub(node.arg))}`;
    default: return '?';
  }
}

// ─────────────────────────────── Публичный API ───────────────────────────────

const LHS_FUNCTION = /^\s*(?:y|[a-z]\s*\(\s*x\s*\))\s*=/;
const LHS_VERTICAL = /^\s*x\s*=\s*([^=]*)$/;

function normalizeInput(raw) {
  // кириллические «х»/«у» на русской раскладке → латинские x/y
  return raw.replace(/[хХ]/g, 'x').replace(/[уУ]/g, 'y').toLowerCase();
}

/**
 * Разбор формулы функции y = f(x).
 * @returns {{ok:true, ast, source, text, html, evaluate} | {ok:false, error:{message,start,end}}}
 */
export function parseFunction(input) {
  const source = String(input ?? '');
  const src = normalizeInput(source);
  try {
    if (!src.trim()) throw new ParseError('Введите формулу, например x^2 или 2x + 3', 0, 0);
    let offset = 0;
    const lhs = src.match(LHS_FUNCTION);
    if (lhs) offset = lhs[0].length;
    else if (LHS_VERTICAL.test(src)) {
      throw new ParseError('«x = …» — это вертикальная прямая, а не функция y = f(x): одному x соответствует бесконечно много y. Загляните в режим «Это функция?»', 0, src.length);
    }
    const body = src.slice(offset);
    if (!body.trim()) throw new ParseError('После «=» нужна формула', offset, offset);
    const tokens = tokenize(body, offset);
    const ast = new Parser(tokens).parse();
    return {
      ok: true,
      source: source.trim(),
      ast,
      text: toText(ast),
      html: toHTML(ast),
      evaluate: toEvaluator(ast),
    };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: { message: err.message, start: err.start, end: err.end } };
    throw err;
  }
}

/** Разбор числа или константного выражения («-1,5», «pi/2», «√2»). */
export function parseConstant(input) {
  const res = parseFunction(input);
  if (!res.ok) return res;
  if (dependsOnX(res.ast)) return { ok: false, error: { message: 'Здесь нужно число, без x', start: 0, end: String(input).length } };
  const value = res.evaluate(0);
  if (!Number.isFinite(value)) return { ok: false, error: { message: 'Выражение не имеет значения', start: 0, end: String(input).length } };
  return { ok: true, value, text: res.text };
}
