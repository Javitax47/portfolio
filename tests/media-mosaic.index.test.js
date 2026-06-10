'use strict';
/* =============================================================
   tests/media-mosaic.index.test.js
   Javier Portfolio · project-media-mosaic

   Property 2: Índice en rango
   Property 3: Wrap correcto
   Validates: Requirements 2.2, 2.3, 3.2, 3.3

   La matemática pura de índice (normalizeIndex / nextIndex / prevIndex)
   mantiene el índice de la Pieza_Enfocada dentro de [0, n) para CUALQUIER
   entrada entera (negativa o ≥ n) y hace wrap de forma determinista:
   `next` en n−1 ⇒ 0 ; `prev` en 0 ⇒ n−1. Así, tras cualquier secuencia de
   next/prev/deriva, el foco nunca se sale de rango.

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { normalizeIndex, nextIndex, prevIndex } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

/* Arbitrario reutilizable: tamaño de conjunto n ∈ [1, 12] (Piezas del Mosaico). */
const nArb = fc.integer({ min: 1, max: 12 });

/* Aserción compacta: x es entero y 0 ≤ x < n. */
function assertInRange(x, n, label) {
  assert.ok(Number.isInteger(x), `${label}: debe ser entero (fue ${x})`);
  assert.ok(x >= 0 && x < n, `${label}: ${x} fuera de rango [0, ${n})`);
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 2 · Índice en rango)
   ═══════════════════════════════════════════════════════════════ */

// 1) normalizeIndex normaliza CUALQUIER entero (incl. negativos/grandes) a [0,n). (Validates 2.3)
test('Property 2 · normalizeIndex(i,n) ∈ [0,n) para todo entero i', () => {
  fc.assert(
    fc.property(fc.integer(), nArb, (i, n) => {
      assertInRange(normalizeIndex(i, n), n, 'normalizeIndex');
    }),
    { numRuns: 200 }
  );
});

// 2) next/prev mantienen el resultado en rango para todo entero i. (Validates 2.2, 2.3, 3.2, 3.3)
test('Property 2 · nextIndex y prevIndex permanecen en [0,n)', () => {
  fc.assert(
    fc.property(fc.integer(), nArb, (i, n) => {
      assertInRange(nextIndex(i, n), n, 'nextIndex');
      assertInRange(prevIndex(i, n), n, 'prevIndex');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 3 · Wrap correcto)
   ═══════════════════════════════════════════════════════════════ */

// 3) Wrap hacia delante: nextIndex(n-1, n) === 0. (Validates 2.2, 3.2)
test('Property 3 · wrap forward: nextIndex(n-1, n) === 0', () => {
  fc.assert(
    fc.property(nArb, (n) => {
      assert.strictEqual(
        nextIndex(n - 1, n), 0,
        `nextIndex(${n - 1}, ${n}) debe envolver a 0`
      );
    }),
    { numRuns: 200 }
  );
});

// 4) Wrap hacia atrás: prevIndex(0, n) === n-1. (Validates 2.3, 3.3)
test('Property 3 · wrap backward: prevIndex(0, n) === n-1', () => {
  fc.assert(
    fc.property(nArb, (n) => {
      assert.strictEqual(
        prevIndex(0, n), n - 1,
        `prevIndex(0, ${n}) debe envolver a ${n - 1}`
      );
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (invariante de secuencia + inversos)
   ═══════════════════════════════════════════════════════════════ */

// 5) Invariante de secuencia: partiendo de cualquier i0, aplicar una secuencia
//    aleatoria de next/prev mantiene el índice en [0,n) en CADA paso. (Validates 2.2, 2.3, 3.2, 3.3)
test('Property 2 · una secuencia de next/prev mantiene el índice en [0,n) en cada paso', () => {
  const opsArb = fc.array(fc.constantFrom('next', 'prev'), { minLength: 0, maxLength: 50 });
  fc.assert(
    fc.property(fc.integer(), nArb, opsArb, (i0, n, ops) => {
      let idx = normalizeIndex(i0, n);
      assertInRange(idx, n, 'estado inicial');
      for (let k = 0; k < ops.length; k++) {
        idx = ops[k] === 'next' ? nextIndex(idx, n) : prevIndex(idx, n);
        assertInRange(idx, n, `paso ${k} (${ops[k]})`);
      }
    }),
    { numRuns: 200 }
  );
});

// 6) next/prev son inversos módulo n. (Validates 2.2, 2.3, 3.2, 3.3)
test('Property 3 · next y prev son inversos: prev(next(i)) === norm(i) y next(prev(i)) === norm(i)', () => {
  fc.assert(
    fc.property(fc.integer(), nArb, (i, n) => {
      const norm = normalizeIndex(i, n);
      assert.strictEqual(
        prevIndex(nextIndex(i, n), n), norm,
        `prevIndex(nextIndex(${i},${n}),${n}) debe ser ${norm}`
      );
      assert.strictEqual(
        nextIndex(prevIndex(i, n), n), norm,
        `nextIndex(prevIndex(${i},${n}),${n}) debe ser ${norm}`
      );
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y bordes)
   ═══════════════════════════════════════════════════════════════ */

test('normalizeIndex: ejemplos de wrap con negativos y valores ≥ n', () => {
  assert.strictEqual(normalizeIndex(-1, 5), 4, '-1 mod 5 → 4');
  assert.strictEqual(normalizeIndex(5, 5), 0, '5 mod 5 → 0');
  assert.strictEqual(normalizeIndex(7, 5), 2, '7 mod 5 → 2');
  assert.strictEqual(normalizeIndex(-7, 5), 3, '-7 mod 5 → 3');
  assert.strictEqual(normalizeIndex(0, 1), 0, 'n=1 colapsa siempre a 0');
  assert.strictEqual(normalizeIndex(123, 1), 0, 'n=1 colapsa siempre a 0');
});

test('nextIndex/prevIndex: ejemplos de wrap en los extremos', () => {
  assert.strictEqual(nextIndex(3, 4), 0, 'next en n-1 envuelve a 0');
  assert.strictEqual(nextIndex(0, 4), 1, 'next normal +1');
  assert.strictEqual(prevIndex(0, 4), 3, 'prev en 0 envuelve a n-1');
  assert.strictEqual(prevIndex(2, 4), 1, 'prev normal -1');
  // n=1: ambos colapsan a 0 (sin avance real con una sola Pieza).
  assert.strictEqual(nextIndex(0, 1), 0, 'n=1: next se queda en 0');
  assert.strictEqual(prevIndex(0, 1), 0, 'n=1: prev se queda en 0');
});
