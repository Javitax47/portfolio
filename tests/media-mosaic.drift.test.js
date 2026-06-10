'use strict';
/* =============================================================
   tests/media-mosaic.drift.test.js
   Javier Portfolio · project-media-mosaic

   Property 4: Deriva solo en AUTO
   Validates: Requirements 2.4

   Un tick `{type:'drift'}` con origen `auto` solo cambia `focusIndex`
   si `state.mode === 'AUTO'` en ese instante; en cualquier otro Modo es
   un NO-OP (foco y demas campos sin cambios, mismo objeto de estado).
   Cuando el Modo es AUTO, la deriva avanza al siguiente indice con wrap
   (nextIndex). Aplicada |items| veces en AUTO, recorre cada Pieza
   exactamente una vez y vuelve al foco inicial (ciclo, Req 2.6).

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { reduce, nextIndex } = require('./_helpers.js').requireProject('js/media-mosaic.js');

/* ─────────────────────────────────────────────────────────────
   Generadores
   ───────────────────────────────────────────────────────────── */

/** Conjunto valido de Modos de la maquina de estados. */
const MODES = ['AUTO', 'USER_FOCUS', 'RESUMING', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN', 'STATIC_RM'];

/**
 * Arbitrary de un estado VALIDO del reductor:
 *   n ∈ [1,12], focusIndex ∈ [0,n), flags booleanos y mode del conjunto valido.
 * Se generan modos arbitrarios (no derivados) a proposito: la semantica de
 * `drift` depende UNICAMENTE de `state.mode`, por lo que probar todos los
 * Modos contra cualquier combinacion de flags es lo mas estricto.
 */
const validStateArb = fc.integer({ min: 1, max: 12 }).chain((n) =>
  fc.record({
    n: fc.constant(n),
    focusIndex: fc.integer({ min: 0, max: n - 1 }),
    pinned: fc.boolean(),
    panelVisible: fc.boolean(),
    docVisible: fc.boolean(),
    reducedMotion: fc.boolean(),
    mode: fc.constantFrom(...MODES)
  })
);

/**
 * Arbitrary de un estado AUTO realista: mode==='AUTO' con los flags que
 * satisfacen la politica de modo (canAuto). Se usa para el ciclo (Req 2.6),
 * dado que `drift` no cambia el Modo y por tanto se mantiene AUTO.
 */
const autoStateArb = fc.integer({ min: 1, max: 12 }).chain((n) =>
  fc.record({
    n: fc.constant(n),
    focusIndex: fc.integer({ min: 0, max: n - 1 }),
    pinned: fc.constant(false),
    panelVisible: fc.constant(true),
    docVisible: fc.constant(true),
    reducedMotion: fc.constant(false),
    mode: fc.constant('AUTO')
  })
);

const DRIFT = { type: 'drift' };

/* ═══════════════════════════════════════════════════════════════
   PROPERTY TESTS (Property 4 — Deriva solo en AUTO · Validates 2.4)
   ═══════════════════════════════════════════════════════════════ */

// 1) drift no-op salvo en AUTO: el foco solo avanza si mode === 'AUTO'.
test('Property 4 · drift cambia focusIndex solo en AUTO (avanza con wrap), si no es no-op', () => {
  fc.assert(
    fc.property(validStateArb, (s) => {
      const next = reduce(s, DRIFT);
      if (s.mode === 'AUTO') {
        assert.strictEqual(
          next.focusIndex, nextIndex(s.focusIndex, s.n),
          `en AUTO el foco debe avanzar a nextIndex (de ${s.focusIndex} con n=${s.n})`
        );
      } else {
        assert.strictEqual(
          next.focusIndex, s.focusIndex,
          `en modo ${s.mode} el foco NO debe cambiar (era ${s.focusIndex})`
        );
      }
    }),
    { numRuns: 200 }
  );
});

// 2) drift nunca toca mode/pinned/visibilidad/n: solo focusIndex puede cambiar.
test('Property 4 · drift no altera mode, pinned, visibilidad ni n (solo focusIndex)', () => {
  fc.assert(
    fc.property(validStateArb, (s) => {
      const next = reduce(s, DRIFT);
      assert.strictEqual(next.mode, s.mode, 'drift no cambia mode');
      assert.strictEqual(next.pinned, s.pinned, 'drift no cambia pinned');
      assert.strictEqual(next.panelVisible, s.panelVisible, 'drift no cambia panelVisible');
      assert.strictEqual(next.docVisible, s.docVisible, 'drift no cambia docVisible');
      assert.strictEqual(next.reducedMotion, s.reducedMotion, 'drift no cambia reducedMotion');
      assert.strictEqual(next.n, s.n, 'drift no cambia n');
    }),
    { numRuns: 200 }
  );
});

// 3) Ciclo (Req 2.6): n drifts en AUTO recorren cada Pieza una vez y vuelven al inicio.
test('Property 4 · ciclo: n drifts en AUTO son una permutacion de [0,n) y vuelven al foco inicial', () => {
  fc.assert(
    fc.property(autoStateArb, (s0) => {
      const n = s0.n;
      let s = s0;
      const visited = [];
      for (let k = 0; k < n; k++) {
        // El Modo se mantiene AUTO a lo largo de los n drifts (drift no cambia mode).
        assert.strictEqual(s.mode, 'AUTO', `el Modo debe seguir siendo AUTO en el paso ${k}`);
        visited.push(s.focusIndex);            // Pieza enfocada en este paso
        s = reduce(s, DRIFT);
      }
      // Vuelve al foco inicial tras n avances (ciclo completo).
      assert.strictEqual(
        s.focusIndex, s0.focusIndex,
        `tras ${n} drifts el foco debe volver a ${s0.focusIndex} (fue ${s.focusIndex})`
      );
      // Los n indices visitados son una permutacion de [0,n): cada Pieza una vez.
      const sorted = visited.slice().sort((a, b) => a - b);
      const expected = Array.from({ length: n }, (_, i) => i);
      assert.deepStrictEqual(
        sorted, expected,
        `los ${n} focos visitados deben ser una permutacion de [0,${n})`
      );
    }),
    { numRuns: 200 }
  );
});

// 4) No-op idempotente: fuera de AUTO, reduce devuelve EL MISMO objeto (===).
test('Property 4 · fuera de AUTO, drift devuelve el mismo objeto de estado (===)', () => {
  fc.assert(
    fc.property(validStateArb, (s) => {
      fc.pre(s.mode !== 'AUTO');
      const next = reduce(s, DRIFT);
      assert.strictEqual(next, s, `en modo ${s.mode} drift debe devolver el mismo estado (no-op por referencia)`);
    }),
    { numRuns: 200 }
  );
});
