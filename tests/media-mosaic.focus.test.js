'use strict';
/* =============================================================
   tests/media-mosaic.focus.test.js
   Javier Portfolio · project-media-mosaic

   Property 1: Exactamente un foco
   Validates: Requirements 1.2

   Para cualquier n >= 1 y cualquier focusIndex (entero arbitrario,
   incluidos negativos y fuera de rango), computeFocusClasses(n, focusIndex)
   produce un array de longitud n con EXACTAMENTE un 'is-focus' (en la
   posicion normalizeIndex(focusIndex, n)) y todas las demas Piezas
   marcadas 'is-ambient'. Para n <= 0 devuelve [].

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { computeFocusClasses, normalizeIndex } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   Helper: cuenta cuantas Piezas llevan 'is-focus'.
   ───────────────────────────────────────────────────────────── */
function countFocus(classes) {
  return classes.reduce((acc, cls) => acc + (cls === 'is-focus' ? 1 : 0), 0);
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 1)
   ═══════════════════════════════════════════════════════════════ */

// 1) ∀ n ∈ [1,12], ∀ focusIndex (entero arbitrario): longitud n,
//    exactamente un 'is-focus' y el resto 'is-ambient'. (Validates 1.2)
test('Property 1 · exactamente un is-focus y el resto is-ambient (n∈[1,12], focusIndex arbitrario)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 12 }), fc.integer(), (n, focusIndex) => {
      const classes = computeFocusClasses(n, focusIndex);

      // longitud n
      assert.strictEqual(
        classes.length, n,
        `la longitud debe ser ${n} (fue ${classes.length})`
      );

      // exactamente un is-focus
      assert.strictEqual(
        countFocus(classes), 1,
        `debe haber exactamente un 'is-focus' (hubo ${countFocus(classes)})`
      );

      // todo lo demas es-ambient (y solo se usan esas dos clases)
      classes.forEach((cls, i) => {
        assert.ok(
          cls === 'is-focus' || cls === 'is-ambient',
          `clase inesperada en ${i}: ${cls}`
        );
      });
    }),
    { numRuns: 200 }
  );
});

// 2) El indice del 'is-focus' coincide con normalizeIndex(focusIndex, n). (Validates 1.2)
test('Property 1 · el is-focus cae en normalizeIndex(focusIndex, n)', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 12 }), fc.integer(), (n, focusIndex) => {
      const classes = computeFocusClasses(n, focusIndex);
      const expected = normalizeIndex(focusIndex, n);

      assert.strictEqual(
        classes[expected], 'is-focus',
        `la posicion ${expected} (normalizada) debe ser 'is-focus' (fue ${classes[expected]})`
      );

      // toda otra posicion es is-ambient
      classes.forEach((cls, i) => {
        if (i !== expected) {
          assert.strictEqual(
            cls, 'is-ambient',
            `la posicion ${i} debe ser 'is-ambient' (fue ${cls})`
          );
        }
      });
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (bordes y ejemplos explícitos)
   ═══════════════════════════════════════════════════════════════ */

// 3) Edge: n <= 0 devuelve [].
test('Property 1 (edge) · n<=0 devuelve [] (n ∈ {-3,-1,0})', () => {
  for (const n of [-3, -1, 0]) {
    const classes = computeFocusClasses(n, 0);
    assert.deepStrictEqual(
      classes, [],
      `computeFocusClasses(${n}, x) debe ser [] (fue ${JSON.stringify(classes)})`
    );
  }
  // tambien con focusIndex arbitrario
  assert.deepStrictEqual(computeFocusClasses(0, 7), []);
  assert.deepStrictEqual(computeFocusClasses(-1, -42), []);
});

// 4) n=1 siempre rinde exactamente ['is-focus'] sea cual sea el focusIndex.
test('Property 1 (edge) · n=1 siempre rinde [is-focus]', () => {
  for (const focusIndex of [0, 1, -1, 5, -7, 1000, -1000]) {
    assert.deepStrictEqual(
      computeFocusClasses(1, focusIndex), ['is-focus'],
      `computeFocusClasses(1, ${focusIndex}) debe ser ['is-focus']`
    );
  }
});

// 5) Ejemplo explícito: posicion concreta y wrap de indices negativos.
test('Property 1 (ejemplo) · foco en la posicion esperada con wrap', () => {
  // n=5, focusIndex=2 -> foco en 2
  assert.deepStrictEqual(
    computeFocusClasses(5, 2),
    ['is-ambient', 'is-ambient', 'is-focus', 'is-ambient', 'is-ambient']
  );
  // wrap negativo: n=5, focusIndex=-1 -> normalizeIndex(-1,5)=4
  assert.deepStrictEqual(
    computeFocusClasses(5, -1),
    ['is-ambient', 'is-ambient', 'is-ambient', 'is-ambient', 'is-focus']
  );
  // fuera de rango por arriba: n=3, focusIndex=7 -> normalizeIndex(7,3)=1
  assert.deepStrictEqual(
    computeFocusClasses(3, 7),
    ['is-ambient', 'is-focus', 'is-ambient']
  );
});
