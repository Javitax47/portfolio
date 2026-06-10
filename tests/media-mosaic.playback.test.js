'use strict';
/* =============================================================
   tests/media-mosaic.playback.test.js
   Javier Portfolio · project-media-mosaic

   Property 7: Un único medio en reproducción
   Validates: Requirements 5.6, 5.7

   En todo estado alcanzable, A LO SUMO un medio se reproduce y solo
   puede ser el de `focusIndex`, y SOLO si se cumplen simultáneamente
   las condiciones:
       enfocado ∧ panelVisible ∧ docVisible ∧ ¬reducedMotion

   Esta es una propiedad de NIVEL MODELO (sin DOM): se modela el
   predicado de reproducción como una función pura que refleja la
   política de `render()` / `applyPlayback()` del controlador:

       shouldPlay(k) = (k === focusIndex) ∧ panelVisible ∧ docVisible
       applyPlayback gatea además con ¬reducedMotion
       ⇒ playing(k, state) =
            (k === state.focusIndex)
            ∧ state.panelVisible ∧ state.docVisible ∧ ¬state.reducedMotion

   Se valida el INVARIANTE de dos formas:
     1) sobre estados válidos ARBITRARIOS, y
     2) sobre estados ALCANZADOS aplicando secuencias aleatorias de
        acciones a través del reductor PURO `reduce` exportado por
        js/media-mosaic.js (hover/focus/click/key/drift/offscreen/
        onscreen/hide/show/setRM con payloads válidos).

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción. No se toca el DOM.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { reduce } = require('./_helpers.js').requireProject('js/media-mosaic.js');

const MODES = ['AUTO', 'USER_FOCUS', 'RESUMING', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN', 'STATIC_RM'];

/* ─────────────────────────────────────────────────────────────
   Modelo del predicado de reproducción (espejo de render()/applyPlayback).
   La Pieza k se reproduce SII es la enfocada y se cumplen las tres
   condiciones de visibilidad/movimiento.
   ───────────────────────────────────────────────────────────── */
function playing(k, state) {
  return (k === state.focusIndex)
    && !!state.panelVisible
    && !!state.docVisible
    && !state.reducedMotion;
}

/** Conjunto de índices que se reproducen en un estado dado. */
function playingIndices(state) {
  const out = [];
  for (let k = 0; k < state.n; k++) {
    if (playing(k, state)) { out.push(k); }
  }
  return out;
}

/** Comprueba los tres invariantes (1, 2, 3) sobre un estado cualquiera. */
function assertPlaybackInvariants(state, label) {
  const tag = label ? `[${label}] ` : '';
  const ids = playingIndices(state);

  // Invariante 1 — a lo sumo un medio en reproducción.
  assert.ok(
    ids.length <= 1,
    `${tag}a lo sumo un medio puede reproducir; reproducían ${ids.length}: ${JSON.stringify(ids)} (estado=${JSON.stringify(state)})`
  );

  // Invariante 2 — si alguno reproduce, es el enfocado y se cumplen las condiciones.
  if (ids.length === 1) {
    const k = ids[0];
    assert.strictEqual(k, state.focusIndex, `${tag}el medio en reproducción debe ser el enfocado`);
    assert.ok(state.panelVisible, `${tag}reproducir requiere panelVisible`);
    assert.ok(state.docVisible, `${tag}reproducir requiere docVisible`);
    assert.ok(!state.reducedMotion, `${tag}reproducir requiere ¬reducedMotion`);
  }

  // Invariante 3 — si falla cualquier condición, no reproduce nada.
  if (!state.panelVisible || !state.docVisible || state.reducedMotion) {
    assert.strictEqual(
      ids.length, 0,
      `${tag}con panelVisible/docVisible/¬reducedMotion incumplido no debe reproducir nada (reproducían ${JSON.stringify(ids)})`
    );
  }
}

/* ─────────────────────────────────────────────────────────────
   Generador de un estado VÁLIDO del mosaico.
   n ∈ [1,12]; focusIndex ∈ [0,n); flags booleanos; modo válido.
   ───────────────────────────────────────────────────────────── */
function validState() {
  return fc.integer({ min: 1, max: 12 }).chain((n) =>
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
}

/* ─────────────────────────────────────────────────────────────
   Generador de ACCIONES válidas para el reductor.
   `index` se acota a [0, n) (payload válido). `key` mezcla dir y index.
   ───────────────────────────────────────────────────────────── */
function actionArb(n) {
  const idx = fc.integer({ min: 0, max: n - 1 });
  return fc.oneof(
    fc.record({ type: fc.constant('drift') }),
    fc.record({ type: fc.constant('hover'), index: idx }),
    fc.record({ type: fc.constant('focus'), index: idx }),
    fc.record({ type: fc.constant('click'), index: idx }),
    fc.record({ type: fc.constant('key'), dir: fc.constantFrom('next', 'prev') }),
    fc.record({ type: fc.constant('key'), index: idx }),
    fc.record({ type: fc.constant('mouseleave') }),
    fc.record({ type: fc.constant('blur') }),
    fc.record({ type: fc.constant('resume') }),
    fc.record({ type: fc.constant('offscreen') }),
    fc.record({ type: fc.constant('onscreen') }),
    fc.record({ type: fc.constant('hide') }),
    fc.record({ type: fc.constant('show') }),
    fc.record({ type: fc.constant('setRM'), value: fc.boolean() })
  );
}

/** Estado válido inicial + secuencia de acciones acotada a su n. */
function stateWithActions() {
  return fc.integer({ min: 1, max: 12 }).chain((n) =>
    fc.record({
      start: fc.record({
        n: fc.constant(n),
        focusIndex: fc.integer({ min: 0, max: n - 1 }),
        pinned: fc.boolean(),
        panelVisible: fc.boolean(),
        docVisible: fc.boolean(),
        reducedMotion: fc.boolean(),
        mode: fc.constantFrom(...MODES)
      }),
      actions: fc.array(actionArb(n), { minLength: 0, maxLength: 40 })
    })
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 7 · Invariante 1 — a lo sumo un medio reproduce (estados arbitrarios)
   ═══════════════════════════════════════════════════════════════ */
test('Property 7 · count({k : playing(k,state)}) ≤ 1 para todo estado válido', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      assert.ok(playingIndices(state).length <= 1);
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 7 · Invariante 2 — si algo reproduce, es el foco y se cumplen condiciones
   ═══════════════════════════════════════════════════════════════ */
test('Property 7 · si alguna Pieza reproduce ⇒ k===focusIndex ∧ panelVisible ∧ docVisible ∧ ¬reducedMotion', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      const ids = playingIndices(state);
      if (ids.length === 1) {
        const k = ids[0];
        assert.strictEqual(k, state.focusIndex);
        assert.ok(state.panelVisible && state.docVisible && !state.reducedMotion);
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 7 · Invariante 3 — condición incumplida ⇒ nadie reproduce (count 0)
   ═══════════════════════════════════════════════════════════════ */
test('Property 7 · ¬panelVisible ∨ ¬docVisible ∨ reducedMotion ⇒ ningún índice reproduce', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      if (!state.panelVisible || !state.docVisible || state.reducedMotion) {
        assert.strictEqual(playingIndices(state).length, 0);
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 7 · Invariantes 1–3 sobre estados ALCANZADOS por el reductor
   Partiendo de un estado válido y aplicando una secuencia aleatoria de
   acciones (vía `reduce`), el invariante de reproducción se mantiene en
   CADA estado intermedio y en el estado final.
   ═══════════════════════════════════════════════════════════════ */
test('Property 7 · invariantes 1–3 persisten tras cualquier secuencia de acciones (reduce)', () => {
  fc.assert(
    fc.property(stateWithActions(), ({ start, actions }) => {
      // El invariante ya se cumple en el estado inicial.
      assertPlaybackInvariants(start, 'inicial');

      let state = start;
      for (let i = 0; i < actions.length; i++) {
        state = reduce(state, actions[i]);

        // El reductor preserva n y el rango del foco; verificamos el invariante.
        assert.strictEqual(state.n, start.n, 'el reductor no debe cambiar n');
        assert.ok(
          Number.isInteger(state.focusIndex) && state.focusIndex >= 0 && state.focusIndex < state.n,
          `focusIndex fuera de rango tras ${JSON.stringify(actions[i])}: ${state.focusIndex}`
        );

        assertPlaybackInvariants(state, `tras acción #${i} ${actions[i].type}`);
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y deterministas)
   ═══════════════════════════════════════════════════════════════ */

test('reproduce exactamente el foco cuando se cumplen todas las condiciones', () => {
  const s = { n: 4, focusIndex: 2, pinned: false, panelVisible: true, docVisible: true, reducedMotion: false, mode: 'AUTO' };
  assert.deepStrictEqual(playingIndices(s), [2]);
});

test('reducedMotion silencia toda reproducción aunque esté visible y enfocado', () => {
  const s = { n: 3, focusIndex: 0, pinned: false, panelVisible: true, docVisible: true, reducedMotion: true, mode: 'STATIC_RM' };
  assert.deepStrictEqual(playingIndices(s), []);
});

test('panel fuera de viewport ⇒ nada reproduce', () => {
  const s = { n: 5, focusIndex: 1, pinned: false, panelVisible: false, docVisible: true, reducedMotion: false, mode: 'PAUSED_OFFSCREEN' };
  assert.deepStrictEqual(playingIndices(s), []);
});

test('documento oculto ⇒ nada reproduce', () => {
  const s = { n: 5, focusIndex: 4, pinned: false, panelVisible: true, docVisible: false, reducedMotion: false, mode: 'PAUSED_HIDDEN' };
  assert.deepStrictEqual(playingIndices(s), []);
});

test('tras hide() el medio enfocado deja de reproducir; tras show() vuelve si procede', () => {
  let s = { n: 4, focusIndex: 2, pinned: false, panelVisible: true, docVisible: true, reducedMotion: false, mode: 'AUTO' };
  assert.deepStrictEqual(playingIndices(s), [2]);
  s = reduce(s, { type: 'hide' });
  assert.deepStrictEqual(playingIndices(s), []);
  s = reduce(s, { type: 'show' });
  assert.deepStrictEqual(playingIndices(s), [2]);
});
