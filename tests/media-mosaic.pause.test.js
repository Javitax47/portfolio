'use strict';
/* =============================================================
   tests/media-mosaic.pause.test.js
   Javier Portfolio · project-media-mosaic

   Property 5: Hover/teclado pausa la deriva
   Property 6: Reanudación con gracia, cancelable
   Validates: Requirements 3.1, 3.4, 3.5, 3.6, 3.7

   Se ejercita el REDUCTOR PURO `reduce(state, action)` de
   js/media-mosaic.js (junto con `canAuto` y `recomputeMode`).

   Semántica probada (a nivel de reductor, sin DOM ni timers):
     · hover/focus/key/click  ⇒ mode === 'USER_FOCUS' (pausa la deriva).
     · click                  ⇒ TOGGLE de pin (re-click misma Pieza des-fija;
                                otra Pieza fija; pinned=true).
     · mouseleave/blur        ⇒ pinned ? 'USER_FOCUS' : 'RESUMING'; foco intacto.
     · CANCELACIÓN (reductor): desde 'RESUMING', un hover/focus vuelve a
                                'USER_FOCUS' (la reanudación pendiente se
                                "cancela": al no seguir en 'RESUMING', un
                                'resume' posterior ya no nos lleva a AUTO sin
                                una nueva salida del usuario).
     · resume                 ⇒ recomputeMode(state): 'AUTO' SII canAuto(state).

   NOTA: la gracia TEMPORAL real (cancelar el setTimeout dentro de
   RESUME_DELAY) la impone el FocusScheduler y se cubre en la tarea 7.3
   (vertiente temporal de la Property 6). Aquí se modela la semántica de
   transición de estados que habilita esa cancelación.

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { reduce, canAuto, recomputeMode } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

const MODES = ['AUTO', 'USER_FOCUS', 'RESUMING', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN', 'STATIC_RM'];

/* ─────────────────────────────────────────────────────────────
   Generador de un estado válido del reductor.
   n ∈ [1,12]; focusIndex ∈ [0,n); flags booleanos; modo válido.
   El modo de partida es arbitrario a propósito: las transiciones
   de control manual no dependen del modo previo, así se exploran
   todos los puntos de partida.
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

/** Índice arbitrario (incluye negativos y >= n) para ejercitar el wrap. */
const anyIndex = fc.integer({ min: -50, max: 50 });

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 5 · Hover/teclado pausa la deriva  (Req 3.1)
   Para CUALQUIER estado válido, una acción de control manual
   (hover/focus/key/click) deja mode === 'USER_FOCUS'; y, estando
   en USER_FOCUS, un tick `drift` es no-op (no hay deriva): el foco
   no avanza. Vale con independencia de los flags de visibilidad/RM.
   ═══════════════════════════════════════════════════════════════ */
test('Property 5 · hover/focus/key/click ⇒ USER_FOCUS y pausa la deriva', () => {
  fc.assert(
    fc.property(validState(), anyIndex, (state, idx) => {
      const manualActions = [
        { type: 'hover', index: idx },
        { type: 'focus', index: idx },
        { type: 'key', index: idx },
        { type: 'key', dir: 'next' },
        { type: 'key', dir: 'prev' },
        { type: 'click', index: idx }
      ];

      for (const action of manualActions) {
        const next = reduce(state, action);

        // (Req 3.1 / Property 5) el control manual fija el Modo USER_FOCUS.
        assert.strictEqual(
          next.mode, 'USER_FOCUS',
          `acción ${JSON.stringify(action)} debería dejar mode='USER_FOCUS' (fue '${next.mode}')`
        );

        // Invariante de rango: foco normalizado en [0, n).
        assert.ok(
          Number.isInteger(next.focusIndex) && next.focusIndex >= 0 && next.focusIndex < state.n,
          `focusIndex fuera de rango: ${next.focusIndex} (n=${state.n})`
        );

        // "Pausa la deriva": ya en USER_FOCUS, un tick auto es no-op.
        const afterDrift = reduce(next, { type: 'drift' });
        assert.strictEqual(
          afterDrift.focusIndex, next.focusIndex,
          'un tick drift no debe avanzar el foco fuera de AUTO (deriva pausada)'
        );
        assert.strictEqual(afterDrift.mode, 'USER_FOCUS', 'drift en USER_FOCUS es no-op de modo');
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 5 · Toggle de pin por click  (Req 3.6)
   - Click sobre la MISMA Pieza enfocada dos veces ⇒ pinned vuelve a
     su valor original; mode='USER_FOCUS'; foco intacto.
   - Click sobre una Pieza DISTINTA ⇒ pinned=true; mode='USER_FOCUS';
     foco pasa a la nueva Pieza.
   ═══════════════════════════════════════════════════════════════ */
test('Property 5 · click sobre la misma Pieza dos veces restaura pinned (toggle)', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      const f = state.focusIndex; // click sobre la Pieza actualmente enfocada

      const s1 = reduce(state, { type: 'click', index: f });
      assert.strictEqual(s1.mode, 'USER_FOCUS', 'click ⇒ USER_FOCUS');
      assert.strictEqual(s1.focusIndex, f, 'click sobre el foco actual no mueve el foco');
      assert.strictEqual(s1.pinned, !state.pinned, 'primer click sobre la misma Pieza alterna pinned');

      const s2 = reduce(s1, { type: 'click', index: f });
      assert.strictEqual(s2.mode, 'USER_FOCUS', 'segundo click ⇒ USER_FOCUS');
      assert.strictEqual(s2.focusIndex, f, 'el foco sigue en la misma Pieza');
      assert.strictEqual(
        s2.pinned, state.pinned,
        'dos clicks sobre la misma Pieza devuelven pinned a su valor original'
      );
    }),
    { numRuns: 200 }
  );
});

test('Property 5 · click sobre una Pieza distinta fija (pinned=true) y mueve el foco', () => {
  // n>=2 para que exista una Pieza distinta de la enfocada.
  const stateN2 = fc.integer({ min: 2, max: 12 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      focusIndex: fc.integer({ min: 0, max: n - 1 }),
      offset: fc.integer({ min: 1, max: n - 1 }), // garantiza destino != focusIndex
      pinned: fc.boolean(),
      panelVisible: fc.boolean(),
      docVisible: fc.boolean(),
      reducedMotion: fc.boolean(),
      mode: fc.constantFrom(...MODES)
    })
  );

  fc.assert(
    fc.property(stateN2, (s) => {
      const { offset } = s;
      const state = {
        n: s.n, focusIndex: s.focusIndex, pinned: s.pinned,
        panelVisible: s.panelVisible, docVisible: s.docVisible,
        reducedMotion: s.reducedMotion, mode: s.mode
      };
      const target = (state.focusIndex + offset) % state.n; // distinto del foco actual

      const next = reduce(state, { type: 'click', index: target });
      assert.strictEqual(next.mode, 'USER_FOCUS', 'click ⇒ USER_FOCUS');
      assert.strictEqual(next.focusIndex, target, 'el foco pasa a la Pieza clicada');
      assert.strictEqual(next.pinned, true, 'click sobre otra Pieza la fija (pinned=true)');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 6 · Salida del usuario  (Req 3.4 / 3.5)
   mouseleave/blur: si pinned ⇒ permanece 'USER_FOCUS' (el pin ignora
   la reanudación); si ¬pinned ⇒ 'RESUMING'. El foco no cambia.
   ═══════════════════════════════════════════════════════════════ */
test('Property 6 · mouseleave/blur: pinned⇒USER_FOCUS, ¬pinned⇒RESUMING; foco intacto', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      for (const type of ['mouseleave', 'blur']) {
        const next = reduce(state, { type });
        const expected = state.pinned ? 'USER_FOCUS' : 'RESUMING';
        assert.strictEqual(
          next.mode, expected,
          `${type} con pinned=${state.pinned} debería dar mode='${expected}' (fue '${next.mode}')`
        );
        assert.strictEqual(next.focusIndex, state.focusIndex, `${type} no debe mover el foco`);
        assert.strictEqual(next.pinned, state.pinned, `${type} no debe cambiar pinned`);
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 6 · Reanudación cancelable (a nivel de reductor)  (Req 3.5)
   Desde 'RESUMING' (alcanzado con mouseleave estando ¬pinned), un
   hover/focus devuelve a 'USER_FOCUS': la reanudación pendiente queda
   cancelada. En contraste, un 'resume' desde 'RESUMING' aplica
   recomputeMode. Aserción clave: hover-tras-mouseleave NUNCA termina
   en 'AUTO' (no se reanuda sin un 'resume' explícito).
   ═══════════════════════════════════════════════════════════════ */
test('Property 6 · hover/focus desde RESUMING cancela la reanudación (no AUTO)', () => {
  fc.assert(
    fc.property(validState(), anyIndex, (state, idx) => {
      // Forzar la salida del usuario sin pin para entrar en RESUMING.
      const unpinned = Object.assign({}, state, { pinned: false });
      const resuming = reduce(unpinned, { type: 'mouseleave' });
      assert.strictEqual(resuming.mode, 'RESUMING', 'mouseleave ¬pinned ⇒ RESUMING');

      // Cancelación: reaparece hover/focus antes de la gracia.
      for (const type of ['hover', 'focus']) {
        const cancelled = reduce(resuming, { type, index: idx });
        assert.strictEqual(
          cancelled.mode, 'USER_FOCUS',
          `${type} desde RESUMING debe volver a USER_FOCUS (cancela la reanudación)`
        );
        assert.notStrictEqual(
          cancelled.mode, 'AUTO',
          'hover-tras-mouseleave nunca debe terminar en AUTO sin un resume'
        );
        // Tras cancelar, ya no estamos en RESUMING: un drift sigue siendo no-op.
        const afterDrift = reduce(cancelled, { type: 'drift' });
        assert.strictEqual(afterDrift.focusIndex, cancelled.focusIndex, 'sin deriva tras cancelar');
      }

      // Contraste: un 'resume' desde RESUMING aplica recomputeMode.
      const resumed = reduce(resuming, { type: 'resume' });
      assert.strictEqual(
        resumed.mode, recomputeMode(resuming),
        'resume desde RESUMING aplica recomputeMode(state)'
      );
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 6 · Reanudación con gracia transcurrida  (Req 3.7)
   Para cualquier estado válido, 'resume' devuelve recomputeMode(state)
   y, en particular, 'AUTO' SII canAuto(state)
   (panelVisible ∧ docVisible ∧ ¬reducedMotion ∧ ¬pinned).
   ═══════════════════════════════════════════════════════════════ */
test('Property 6 · resume ⇒ AUTO sii canAuto(state); si no, modo en reposo (recomputeMode)', () => {
  fc.assert(
    fc.property(validState(), (state) => {
      const next = reduce(state, { type: 'resume' });

      assert.strictEqual(
        next.mode, recomputeMode(state),
        'resume debe devolver exactamente recomputeMode(state)'
      );
      assert.strictEqual(
        next.mode === 'AUTO', canAuto(state),
        `resume ⇒ AUTO debe equivaler a canAuto(state) (canAuto=${canAuto(state)}, mode='${next.mode}')`
      );

      // El invariante central nunca se viola: mode==='AUTO' ⇒ canAuto.
      if (next.mode === 'AUTO') {
        assert.ok(canAuto(next), "mode==='AUTO' implica canAuto(estado)");
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

test('hover fija el foco solicitado y pasa a USER_FOCUS', () => {
  const next = reduce(baseAuto, { type: 'hover', index: 2 });
  assert.strictEqual(next.mode, 'USER_FOCUS');
  assert.strictEqual(next.focusIndex, 2);
  assert.strictEqual(next.pinned, false, 'hover no fija (pin) la Pieza');
});

test('key dir=next/prev mueve con wrap y mantiene USER_FOCUS', () => {
  const last = Object.assign({}, baseAuto, { focusIndex: 3 }); // n=4 ⇒ último
  const fwd = reduce(last, { type: 'key', dir: 'next' });
  assert.strictEqual(fwd.focusIndex, 0, 'next en n-1 hace wrap a 0');
  assert.strictEqual(fwd.mode, 'USER_FOCUS');

  const first = Object.assign({}, baseAuto, { focusIndex: 0 });
  const back = reduce(first, { type: 'key', dir: 'prev' });
  assert.strictEqual(back.focusIndex, 3, 'prev en 0 hace wrap a n-1');
  assert.strictEqual(back.mode, 'USER_FOCUS');
});

test('mouseleave: pinned permanece USER_FOCUS; ¬pinned pasa a RESUMING', () => {
  const pinned = Object.assign({}, baseAuto, { pinned: true, mode: 'USER_FOCUS' });
  assert.strictEqual(reduce(pinned, { type: 'mouseleave' }).mode, 'USER_FOCUS');

  const userFocus = Object.assign({}, baseAuto, { mode: 'USER_FOCUS' });
  assert.strictEqual(reduce(userFocus, { type: 'blur' }).mode, 'RESUMING');
});

test('cancelación: RESUMING --hover--> USER_FOCUS (no AUTO)', () => {
  const resuming = Object.assign({}, baseAuto, { mode: 'RESUMING' });
  const cancelled = reduce(resuming, { type: 'hover', index: 2 });
  assert.strictEqual(cancelled.mode, 'USER_FOCUS');
});

test('resume desde RESUMING con condiciones AUTO ⇒ AUTO; si reducedMotion ⇒ STATIC_RM', () => {
  const resuming = Object.assign({}, baseAuto, { mode: 'RESUMING' });
  assert.strictEqual(reduce(resuming, { type: 'resume' }).mode, 'AUTO');

  const rm = Object.assign({}, resuming, { reducedMotion: true });
  assert.strictEqual(reduce(rm, { type: 'resume' }).mode, 'STATIC_RM');

  const pinned = Object.assign({}, resuming, { pinned: true });
  assert.strictEqual(reduce(pinned, { type: 'resume' }).mode, 'USER_FOCUS');
});
