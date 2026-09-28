// Läser Janusmeds sidtillstånd (window.__NUXT__) utan att köra någon kod från sidan.
//
// Janusmed är byggd med Nuxt, som bäddar in sidans data som ett JavaScript-uttryck:
//   window.__NUXT__=(function(a,b,…){return {…}}(värde1,värde2,…));
// I stället för att köra skriptet tolkas det till ett syntaxträd (acorn) och bara
// bokstavliga värden, objekt, listor och parameternamn utvärderas. Allt annat
// (funktionsanrop, egenskapsuppslag, operatorer) ger ett fel — sidan kan alltså
// aldrig köra kod i datapipelinen.

import { parseExpressionAt, type Expression, type Node } from 'acorn';

export class NuxtParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NuxtParseError';
  }
}

type Scope = Map<string, unknown>;

const GLOBALS: Record<string, unknown> = { undefined: undefined, NaN: Number.NaN, Infinity: Number.POSITIVE_INFINITY };

function evaluate(node: Node, scope: Scope): unknown {
  const n = node as Expression;
  switch (n.type) {
    case 'Literal':
      if ('regex' in n && n.regex) throw new NuxtParseError('Reguljärt uttryck stöds inte');
      return n.value;
    case 'Identifier':
      if (scope.has(n.name)) return scope.get(n.name);
      if (n.name in GLOBALS) return GLOBALS[n.name];
      throw new NuxtParseError(`Okänt namn: ${n.name}`);
    case 'ArrayExpression':
      return n.elements.map((el) => {
        if (el === null) return undefined;
        if (el.type === 'SpreadElement') throw new NuxtParseError('Spread stöds inte');
        return evaluate(el, scope);
      });
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {};
      for (const p of n.properties) {
        if (p.type !== 'Property' || p.kind !== 'init' || p.method || p.computed) {
          throw new NuxtParseError('Endast enkla objektegenskaper stöds');
        }
        const key = p.key.type === 'Identifier' ? p.key.name
          : p.key.type === 'Literal' ? String(p.key.value)
          : null;
        if (key === null) throw new NuxtParseError('Okänd typ av objektnyckel');
        if (key === '__proto__') continue;
        out[key] = evaluate(p.value, scope);
      }
      return out;
    }
    case 'UnaryExpression': {
      const v = evaluate(n.argument, scope);
      if (n.operator === 'void') return undefined;
      if (n.operator === '-' && typeof v === 'number') return -v;
      if (n.operator === '+' && typeof v === 'number') return v;
      if (n.operator === '!' && typeof v === 'number') return !v; // !0 / !1 används för true/false
      throw new NuxtParseError(`Operatorn ${n.operator} stöds inte`);
    }
    case 'TemplateLiteral':
      if (n.expressions.length > 0) throw new NuxtParseError('Mallsträng med uttryck stöds inte');
      return n.quasis.map((q) => q.value.cooked ?? '').join('');
    default:
      throw new NuxtParseError(`Uttryckstypen ${n.type} stöds inte`);
  }
}

/** Utvärderar Nuxts datauttryck (anropet av den anonyma funktionen) till ett vanligt objekt. */
export function evaluateNuxtPayload(source: string): unknown {
  let expr: Node;
  try {
    expr = parseExpressionAt(source, 0, { ecmaVersion: 'latest' });
  } catch (e) {
    throw new NuxtParseError(`Kunde inte tolka Nuxt-data: ${(e as Error).message}`);
  }
  if (expr.type !== 'CallExpression') throw new NuxtParseError('Nuxt-datan är inte ett funktionsanrop');
  const call = expr as Extract<Expression, { type: 'CallExpression' }>;
  const fn = call.callee;
  if (fn.type !== 'FunctionExpression') throw new NuxtParseError('Nuxt-datan anropar inte en anonym funktion');

  const args = call.arguments.map((a) => {
    if (a.type === 'SpreadElement') throw new NuxtParseError('Spread stöds inte');
    return evaluate(a, new Map());
  });
  const scope: Scope = new Map();
  fn.params.forEach((p, i) => {
    if (p.type !== 'Identifier') throw new NuxtParseError('Endast enkla parametrar stöds');
    scope.set(p.name, args[i]);
  });
  const body = fn.body.body;
  if (body.length !== 1 || body[0].type !== 'ReturnStatement' || !body[0].argument) {
    throw new NuxtParseError('Nuxt-funktionen innehåller mer än en return-sats');
  }
  return evaluate(body[0].argument, scope);
}

/** Hittar och utvärderar window.__NUXT__ i en HTML-sida. */
export function extractNuxtState(html: string): unknown {
  const marker = 'window.__NUXT__=';
  const start = html.indexOf(marker);
  if (start < 0) throw new NuxtParseError('Sidan saknar window.__NUXT__');
  return evaluateNuxtPayload(html.slice(start + marker.length));
}
