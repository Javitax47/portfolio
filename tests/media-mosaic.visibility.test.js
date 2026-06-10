'use strict';
/* =============================================================
   tests/media-mosaic.visibility.test.js
   Javier Portfolio · project-media-mosaic

   Property 8: Pausa fuera de viewport / pestaña oculta
   Validates: Requirements 6.1, 6.5, 6.6

   Si `¬panelVisible` o `¬docVisible`, ningún medio reproduce y no
   hay timers de deriva activos. Se modela a nivel del REDUCTOR PURO
   `reduce(state, action)` (junto a `canAuto` y `recomputeMode`) de
   js/media-mosaic.js — sin DOM, sin timers, sin Date.

   Puentes modelo ⇄ efecto (lo que el reductor garantiza y por qué
   implica "ningún medio reproduce / sin timers de deriva"):
     · El Programador_de_Foco solo avanza el foco en Modo `AUTO`
       (la acción `drift` es NO-OP fuera de `AUTO`). Por tanto, si
       el reductor nunca está en `AUTO` mientras `¬panelVisible` o
       `¬docVisible`, NO hay deriva activa (Req 6.6 / Property 8).
     · El Cargador_de_Medios solo reproduce cuando se cumplen a la
       vez panelVisible ∧ docVisible ∧ ¬reducedMotion (Req 5.6). El
       Modo `AUTO`/`USER_FOCUS` "visible" es condición necesaria; al
       no poder alcanzarse `AUTO` sin visibilidad, y al forzar
       `PAUSED_OFFSCREEN`/`PAUSED_HIDDEN` en pérdida de visibilidad,
       el modelo refleja "ningún medio reproduce".

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { reduce, canAuto, recomputeMode } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

const MODES = ['AUTO', 'USER_FOCUS', 'RESUMING', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN', 'STATIC_RM'];
const PAUSED_VIS = ['PAUSED_OFFSCREEN', 'PAUSED_HIDDEN'];

/* ─────────────────────────────────────────────────────────────
   Generador de un estado válido del reductor.
   n ∈ [1,12]; focusIndex ∈ [0,n); flags booleanos; modo válido.
   El modo de partida es arbitrario a propósito para explorar todos
   los puntos de partida posibles de las transiciones de visibilidad.
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

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 8 · (1) offscreen ⇒ PAUSED_OFFSCREEN ∧ ¬panelVisible
   (Req 6.1) Para CUALQUIER estado válido, `offscreen` deja el Modo
   en 'PAUSED_OFFSCREEN' y panelVisible=false (el panel salió del
   viewport ⇒ el scheduler se pausa porque mode≠AUTO).
   ═══════════════════════════════════════════════════════════════ */
test('Property 8 · offscreen ⇒ PAUSED_OFFSCREEN y panelVisible=false (Req 6.1)', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      const next = reduce(state, { type: 'offscreen' });
      assert.strictEqual(next.mode, 'PAUSED_OFFSCREEN', "offscreen ⇒ mode='PAUSED_OFFSCREEN'");
      assert.strictEqual(next.panelVisible, false, 'offscreen ⇒ panelVisible=false');
      // Sin deriva: un tick drift es no-op fuera de AUTO.
      const afterDrift = reduce(next, { type: 'drift' });
      assert.strictEqual(afterDrift.focusIndex, next.focusIndex, 'sin deriva activa estando PAUSED_OFFSCREEN');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 8 · (2) hide ⇒ PAUSED_HIDDEN ∧ ¬docVisible
   (Req 6.5) Para CUALQUIER estado válido, `hide` deja el Modo en
   'PAUSED_HIDDEN' y docVisible=false (documento oculto ⇒ scheduler
   pausado porque mode≠AUTO).
   ═══════════════════════════════════════════════════════════════ */
test('Property 8 · hide ⇒ PAUSED_HIDDEN y docVisible=false (Req 6.5)', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      const next = reduce(state, { type: 'hide' });
      assert.strictEqual(next.mode, 'PAUSED_HIDDEN', "hide ⇒ mode='PAUSED_HIDDEN'");
      assert.strictEqual(next.docVisible, false, 'hide ⇒ docVisible=false');
      const afterDrift = reduce(next, { type: 'drift' });
      assert.strictEqual(afterDrift.focusIndex, next.focusIndex, 'sin deriva activa estando PAUSED_HIDDEN');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 8 · (3) Sin deriva ni autoplay mientras hay pausa de
   visibilidad (Req 6.6).
   - En CUALQUIER estado con mode ∈ {PAUSED_OFFSCREEN, PAUSED_HIDDEN},
     una acción `drift` es NO-OP (focusIndex intacto), porque el
     reductor solo avanza en 'AUTO'. ⇒ no hay timer de deriva activo.
   - Modelado de "ningún medio reproduce": cuando ¬panelVisible ∨
     ¬docVisible, recomputeMode(s) ∈ {PAUSED_OFFSCREEN, PAUSED_HIDDEN}
     (NUNCA 'AUTO'), por lo que no se habilita autoplay/deriva.
   ═══════════════════════════════════════════════════════════════ */
test('Property 8 · pausa de visibilidad ⇒ drift no-op y recomputeMode nunca AUTO (Req 6.6)', () => {
  fc.assert(
    fc.property(validState(), fc.constantFrom(...PAUSED_VIS), (state, pausedMode) => {
      // (a) En un estado pausado por visibilidad, la deriva está inerte.
      const paused = Object.assign({}, state, { mode: pausedMode });
      const afterDrift = reduce(paused, { type: 'drift' });
      assert.strictEqual(afterDrift.focusIndex, paused.focusIndex, 'drift no-op en estado pausado por visibilidad');
      assert.strictEqual(afterDrift.mode, paused.mode, 'drift no cambia el Modo pausado');

      // (b) Si NO es visible (panel o documento), el modo en reposo nunca es AUTO.
      if (!state.panelVisible || !state.docVisible) {
        const rest = recomputeMode(state);
        assert.ok(
          PAUSED_VIS.includes(rest),
          `¬visible ⇒ recomputeMode ∈ {PAUSED_OFFSCREEN, PAUSED_HIDDEN} (fue '${rest}')`
        );
        assert.notStrictEqual(rest, 'AUTO', '¬visible nunca habilita AUTO (sin autoplay/deriva)');
        assert.strictEqual(canAuto(state), false, '¬visible ⇒ canAuto=false (no reproduce ningún medio)');
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 8 · (4) Restauración (cross-check Req 6.3).
   Desde un estado pausado por visibilidad, restaurar AMBAS
   condiciones (onscreen + show según haga falta) con ¬reducedMotion
   ∧ ¬pinned ⇒ recomputeMode = 'AUTO'. A la inversa, si alguna de
   panelVisible/docVisible sigue siendo false ⇒ NO es AUTO.
   ═══════════════════════════════════════════════════════════════ */
test('Property 8 · restaurar ambas (¬RM ∧ ¬pinned) ⇒ AUTO; si falta alguna ⇒ no AUTO (Req 6.3)', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      // Partimos de un estado pausado por visibilidad (panel fuera de viewport).
      const offscreen = reduce(state, { type: 'offscreen' });
      assert.strictEqual(offscreen.mode, 'PAUSED_OFFSCREEN');

      // Condiciones aptas para AUTO salvo visibilidad: ¬RM ∧ ¬pinned.
      const ready = Object.assign({}, offscreen, { reducedMotion: false, pinned: false });

      // Restaurar el panel (onscreen). El resultado depende de docVisible.
      const onlyPanel = reduce(ready, { type: 'onscreen' });
      if (ready.docVisible) {
        assert.strictEqual(onlyPanel.mode, 'AUTO', 'panel visible + doc visible + ¬RM ∧ ¬pinned ⇒ AUTO');
      } else {
        assert.notStrictEqual(onlyPanel.mode, 'AUTO', 'doc oculto ⇒ no AUTO tras restaurar solo el panel');
        assert.strictEqual(onlyPanel.mode, 'PAUSED_HIDDEN', 'panel visible pero doc oculto ⇒ PAUSED_HIDDEN');
      }

      // Restaurar también el documento ⇒ ambas visibles ⇒ AUTO.
      const both = reduce(onlyPanel, { type: 'show' });
      assert.strictEqual(both.panelVisible, true, 'panel restaurado');
      assert.strictEqual(both.docVisible, true, 'documento restaurado');
      assert.strictEqual(both.mode, 'AUTO', 'ambas visibles + ¬RM ∧ ¬pinned ⇒ AUTO');
      assert.ok(canAuto(both), "mode==='AUTO' implica canAuto(estado)");

      // Conversa: si tras restaurar el panel forzamos doc oculto ⇒ no AUTO.
      const hidden = reduce(both, { type: 'hide' });
      assert.notStrictEqual(hidden.mode, 'AUTO', 'doc oculto ⇒ no AUTO');
      assert.strictEqual(hidden.mode, 'PAUSED_HIDDEN');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 8 · (5) Invariante central que sostiene la Property 8:
   para TODO estado alcanzable, mode==='AUTO' ⇒ (panelVisible ∧
   docVisible). Es decir, NUNCA hay AUTO (deriva/autoplay) mientras
   se está oculto. Se comprueba sobre estados producidos por el
   reductor aplicando secuencias arbitrarias de acciones.
   ═══════════════════════════════════════════════════════════════ */
const actionArb = fc.oneof(
  fc.record({ type: fc.constant('offscreen') }),
  fc.record({ type: fc.constant('onscreen') }),
  fc.record({ type: fc.constant('hide') }),
  fc.record({ type: fc.constant('show') }),
  fc.record({ type: fc.constant('resume') }),
  fc.record({ type: fc.constant('mouseleave') }),
  fc.record({ type: fc.constant('blur') }),
  fc.record({ type: fc.constant('drift') }),
  fc.record({ type: fc.constant('setRM'), value: fc.boolean() }),
  fc.record({ type: fc.constant('hover'), index: fc.integer({ min: -20, max: 20 }) }),
  fc.record({ type: fc.constant('focus'), index: fc.integer({ min: -20, max: 20 }) }),
  fc.record({ type: fc.constant('click'), index: fc.integer({ min: -20, max: 20 }) }),
  fc.record({ type: fc.constant('key'), dir: fc.constantFrom('next', 'prev') })
);

/**
 * Estado inicial ALCANZABLE/consistente: el `mode` se deriva de los flags vía
 * `recomputeMode`, de modo que NUNCA se parte de un AUTO falso (AUTO sin
 * visibilidad). Esto modela el punto de partida real del controlador (que solo
 * establece AUTO a través de recomputeMode). Desde un estado consistente, toda
 * transición preserva el invariante mode==='AUTO' ⇒ (panelVisible ∧ docVisible).
 */
function reachableState() {
  return validState().map((s) => Object.assign({}, s, { mode: recomputeMode(s) }));
}

test('Property 8 · invariante: mode===AUTO ⇒ (panelVisible ∧ docVisible) en estados alcanzables', () => {
  fc.assert(
    fc.property(reachableState(), fc.array(actionArb, { minLength: 0, maxLength: 30 }), (initial, actions) => {
      let s = initial;
      // El estado de partida es consistente (mode = recomputeMode(flags)); el
      // invariante se verifica sobre el estado inicial y tras cada transición.
      assert.ok(s.mode !== 'AUTO' || (s.panelVisible && s.docVisible), 'seed AUTO ⇒ visible');
      for (const action of actions) {
        s = reduce(s, action);
        if (s.mode === 'AUTO') {
          assert.ok(
            s.panelVisible && s.docVisible,
            `estado AUTO no visible alcanzado: ${JSON.stringify(s)} via ${JSON.stringify(action)}`
          );
          // Y, por construcción del reductor, AUTO ⇒ canAuto completo.
          assert.ok(canAuto(s), "mode==='AUTO' ⇒ canAuto(estado)");
        }
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y deterministas)
   ═══════════════════════════════════════════════════════════════ */

const baseAuto = {
  n: 4, focusIndex: 1, pinned: false,
  panelVisible: true, docVisible: true, reducedMotion: false, mode: 'AUTO'
};

test('offscreen desde AUTO ⇒ PAUSED_OFFSCREEN, panelVisible=false, foco intacto (Req 6.1)', () => {
  const next = reduce(baseAuto, { type: 'offscreen' });
  assert.strictEqual(next.mode, 'PAUSED_OFFSCREEN');
  assert.strictEqual(next.panelVisible, false);
  assert.strictEqual(next.focusIndex, baseAuto.focusIndex);
  // En PAUSED_OFFSCREEN, drift no avanza (sin deriva).
  assert.strictEqual(reduce(next, { type: 'drift' }).focusIndex, next.focusIndex);
});

test('hide desde AUTO ⇒ PAUSED_HIDDEN, docVisible=false, foco intacto (Req 6.5)', () => {
  const next = reduce(baseAuto, { type: 'hide' });
  assert.strictEqual(next.mode, 'PAUSED_HIDDEN');
  assert.strictEqual(next.docVisible, false);
  assert.strictEqual(next.focusIndex, baseAuto.focusIndex);
  assert.strictEqual(reduce(next, { type: 'drift' }).focusIndex, next.focusIndex);
});

test('drift es no-op en PAUSED_OFFSCREEN y PAUSED_HIDDEN (Req 6.6)', () => {
  for (const mode of PAUSED_VIS) {
    const paused = Object.assign({}, baseAuto, { mode });
    const after = reduce(paused, { type: 'drift' });
    assert.strictEqual(after.focusIndex, paused.focusIndex, `drift no-op en ${mode}`);
    assert.strictEqual(after.mode, mode, `drift no cambia el Modo en ${mode}`);
  }
});

test('restaurar visibilidad: onscreen con doc oculto ⇒ PAUSED_HIDDEN; luego show ⇒ AUTO (Req 6.3)', () => {
  const offscreenHidden = Object.assign({}, baseAuto, {
    panelVisible: false, docVisible: false, mode: 'PAUSED_OFFSCREEN'
  });
  const afterOnscreen = reduce(offscreenHidden, { type: 'onscreen' });
  assert.strictEqual(afterOnscreen.mode, 'PAUSED_HIDDEN', 'panel visible pero doc oculto ⇒ PAUSED_HIDDEN');

  const afterShow = reduce(afterOnscreen, { type: 'show' });
  assert.strictEqual(afterShow.mode, 'AUTO', 'ambas visibles + ¬RM ∧ ¬pinned ⇒ AUTO');
});

test('restaurar con reducedMotion ⇒ STATIC_RM (no AUTO); con pinned ⇒ USER_FOCUS (no AUTO)', () => {
  const offscreen = Object.assign({}, baseAuto, { panelVisible: false, mode: 'PAUSED_OFFSCREEN' });

  const rm = reduce(Object.assign({}, offscreen, { reducedMotion: true }), { type: 'onscreen' });
  assert.strictEqual(rm.mode, 'STATIC_RM', 'reducedMotion ⇒ STATIC_RM al restaurar');
  assert.notStrictEqual(rm.mode, 'AUTO');

  const pin = reduce(Object.assign({}, offscreen, { pinned: true }), { type: 'onscreen' });
  assert.strictEqual(pin.mode, 'USER_FOCUS', 'pinned ⇒ USER_FOCUS al restaurar');
  assert.notStrictEqual(pin.mode, 'AUTO');
});
