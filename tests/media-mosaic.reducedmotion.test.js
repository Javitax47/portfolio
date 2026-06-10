'use strict';
/* =============================================================
   tests/media-mosaic.reducedmotion.test.js
   Javier Portfolio · project-media-mosaic

   Property 9: Reduced-motion
   Validates: Requirements 7.1, 7.2

   Con `prefers-reduced-motion: reduce` (reducedMotion = true), el
   Controlador_de_Mosaico NO inicia el Foco_a_la_Deriva ni reproduce
   medios automáticamente (Req 7.1), pero el control manual por hover y
   teclado sigue disponible (Req 7.2). Se ejercita el REDUCTOR PURO
   `reduce(state, action)` de js/media-mosaic.js junto con `recomputeMode`
   y la matemática de índice `normalizeIndex` (sin DOM ni timers).

   Modelo de reproducción (autoplay) probado a nivel de estado, con el
   MISMO predicado de la tarea 9.4:
     playing(k, s) = (k === s.focusIndex)
                     ∧ s.panelVisible ∧ s.docVisible ∧ ¬s.reducedMotion
   Bajo reducedMotion = true, playing(k, s) es false para todo k: no hay
   autoplay (Req 7.1).

   Semántica de Modo bajo RM (recomputeMode da prioridad a RM sobre pin):
     · ¬panelVisible            ⇒ 'PAUSED_OFFSCREEN'
     · ¬docVisible              ⇒ 'PAUSED_HIDDEN'
     · reducedMotion (visible)  ⇒ 'STATIC_RM'
   El Modo NUNCA es 'AUTO' bajo RM, así que `drift` (que solo avanza en
   AUTO) jamás avanza el foco: no hay deriva automática (Req 7.1).

   Runner: node --test (nativo, Node 18+). Generadores: fast-check.
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { reduce, recomputeMode, normalizeIndex } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

const MODES = ['AUTO', 'USER_FOCUS', 'RESUMING', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN', 'STATIC_RM'];

/* ─────────────────────────────────────────────────────────────
   Generador de un estado válido del reductor con reducedMotion=true
   FORZADO. n ∈ [1,12]; focusIndex ∈ [0,n); flags de visibilidad/pin
   arbitrarios; modo de partida arbitrario (se exploran todos los
   puntos de partida: la semántica de RM no depende del modo previo).
   ───────────────────────────────────────────────────────────── */
function rmState() {
  return fc.integer({ min: 1, max: 12 }).chain((n) =>
    fc.record({
      n: fc.constant(n),
      focusIndex: fc.integer({ min: 0, max: n - 1 }),
      pinned: fc.boolean(),
      panelVisible: fc.boolean(),
      docVisible: fc.boolean(),
      reducedMotion: fc.constant(true), // ← FORZADO (prefers-reduced-motion: reduce)
      mode: fc.constantFrom(...MODES)
    })
  );
}

/** Índice arbitrario (incluye negativos y >= n) para ejercitar el wrap. */
const anyIndex = fc.integer({ min: -50, max: 50 });

/**
 * Predicado de reproducción (autoplay) a nivel de estado — mismo que en la
 * tarea 9.4 (Property 7). Un medio reproduce solo si es el enfocado y se
 * cumplen panelVisible ∧ docVisible ∧ ¬reducedMotion.
 */
function playing(k, s) {
  return (k === s.focusIndex) && !!s.panelVisible && !!s.docVisible && !s.reducedMotion;
}

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 9 · (1) Sin deriva automática alcanzable  (Req 7.1)
   Bajo reducedMotion, recomputeMode NUNCA devuelve 'AUTO' (es
   'STATIC_RM' cuando el panel es visible, o 'PAUSED_*' si no): el Modo
   en reposo nunca habilita la deriva automática.
   ═══════════════════════════════════════════════════════════════ */
test('Property 9 · recomputeMode bajo reducedMotion nunca es AUTO (sin deriva auto)', () => {
  fc.assert(
    fc.property(rmState(), (s) => {
      const mode = recomputeMode(s);
      assert.notStrictEqual(mode, 'AUTO', `recomputeMode bajo RM no debe ser AUTO (fue '${mode}')`);

      // El Modo en reposo bajo RM es STATIC_RM (visible) o PAUSED_* (no visible).
      const expected = !s.panelVisible ? 'PAUSED_OFFSCREEN'
        : !s.docVisible ? 'PAUSED_HIDDEN'
        : 'STATIC_RM';
      assert.strictEqual(mode, expected, `recomputeMode bajo RM debería ser '${expected}'`);
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 9 · (2) Un tick `drift` es no-op bajo reducedMotion  (Req 7.1)
   Partiendo de un estado recomputado con setRM(true) (que fuerza el Modo
   en reposo, nunca 'AUTO'), `drift` no avanza el foco: no hay deriva.
   ═══════════════════════════════════════════════════════════════ */
test('Property 9 · drift no avanza el foco bajo reducedMotion (estado recomputado por setRM)', () => {
  fc.assert(
    fc.property(rmState(), (raw) => {
      // setRM(true) fuerza recompute ⇒ Modo en reposo (nunca AUTO).
      const s = reduce(raw, { type: 'setRM', value: true });
      assert.notStrictEqual(s.mode, 'AUTO', 'setRM(true) nunca deja el Modo en AUTO');

      const next = reduce(s, { type: 'drift' });
      assert.strictEqual(
        next.focusIndex, s.focusIndex,
        `drift no debe avanzar el foco bajo RM (era ${s.focusIndex}, fue ${next.focusIndex})`
      );
      // Fuera de AUTO, drift es no-op por referencia (mismo objeto de estado).
      assert.strictEqual(next, s, 'drift fuera de AUTO devuelve el mismo estado (no-op)');
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 9 · (3) setRM(true) recomputa a un Modo sin autoplay  (Req 7.1)
   `setRM(true)` deja reducedMotion=true y el Modo recomputado, que es
   uno de {STATIC_RM, PAUSED_OFFSCREEN, PAUSED_HIDDEN} y NUNCA 'AUTO'.
   ═══════════════════════════════════════════════════════════════ */
test('Property 9 · setRM(true) ⇒ reducedMotion=true y Modo en {STATIC_RM, PAUSED_*}, nunca AUTO', () => {
  fc.assert(
    fc.property(rmState(), (raw) => {
      // Partimos de cualquier valor de reducedMotion para que setRM tenga efecto real.
      const start = Object.assign({}, raw, { reducedMotion: false });
      const next = reduce(start, { type: 'setRM', value: true });

      assert.strictEqual(next.reducedMotion, true, 'setRM(true) activa reducedMotion');
      assert.notStrictEqual(next.mode, 'AUTO', 'bajo RM el Modo nunca es AUTO');
      assert.strictEqual(
        next.mode, recomputeMode(next),
        'setRM aplica exactamente recomputeMode(estado)'
      );
      assert.ok(
        ['STATIC_RM', 'PAUSED_OFFSCREEN', 'PAUSED_HIDDEN'].includes(next.mode),
        `Modo bajo RM debe ser STATIC_RM o PAUSED_* (fue '${next.mode}')`
      );
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 9 · (4) Control manual SIGUE disponible bajo RM  (Req 7.2)
   hover/focus/key/click cambian la Pieza_Enfocada y dejan Modo
   'USER_FOCUS' incluso con reducedMotion=true. Para hover/focus/key(index)
   /click el foco resultante es normalizeIndex(j, n).
   ═══════════════════════════════════════════════════════════════ */
test('Property 9 · hover/focus/key/click cambian el foco y Modo=USER_FOCUS bajo RM', () => {
  fc.assert(
    fc.property(rmState(), anyIndex, (state, j) => {
      const expectIdx = normalizeIndex(j, state.n);

      // Acciones cuyo foco resultante es normalizeIndex(j, n).
      const indexed = [
        { type: 'hover', index: j },
        { type: 'focus', index: j },
        { type: 'key', index: j },
        { type: 'click', index: j }
      ];
      for (const action of indexed) {
        const next = reduce(state, action);
        assert.strictEqual(
          next.mode, 'USER_FOCUS',
          `${JSON.stringify(action)} bajo RM debe dejar Modo USER_FOCUS (fue '${next.mode}')`
        );
        assert.strictEqual(
          next.focusIndex, expectIdx,
          `${JSON.stringify(action)} debe fijar foco en normalizeIndex(${j}, ${state.n})=${expectIdx}`
        );
        assert.strictEqual(next.reducedMotion, true, 'el control manual no desactiva RM');
      }

      // Teclado por dirección: cambia el foco con wrap y mantiene USER_FOCUS.
      const nextDir = reduce(state, { type: 'key', dir: 'next' });
      const prevDir = reduce(state, { type: 'key', dir: 'prev' });
      assert.strictEqual(nextDir.mode, 'USER_FOCUS', 'key next ⇒ USER_FOCUS bajo RM');
      assert.strictEqual(prevDir.mode, 'USER_FOCUS', 'key prev ⇒ USER_FOCUS bajo RM');
      for (const m of [nextDir, prevDir]) {
        assert.ok(
          Number.isInteger(m.focusIndex) && m.focusIndex >= 0 && m.focusIndex < state.n,
          `foco fuera de rango bajo RM: ${m.focusIndex} (n=${state.n})`
        );
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   PROPERTY 9 · (5) Sin autoplay bajo RM  (Req 7.1)
   Con reducedMotion=true, playing(k, s)=false para TODO k, tanto en el
   estado base como tras tomar el control manual (que conserva RM).
   ═══════════════════════════════════════════════════════════════ */
test('Property 9 · ningún medio reproduce bajo RM (playing(k, s)=false para todo k)', () => {
  fc.assert(
    fc.property(rmState(), anyIndex, (state, j) => {
      // Estado base bajo RM: nada reproduce.
      for (let k = 0; k < state.n; k++) {
        assert.strictEqual(
          playing(k, state), false,
          `bajo RM no debe reproducir ningún medio (k=${k}, focus=${state.focusIndex})`
        );
      }

      // Tras control manual (hover): sigue bajo RM ⇒ sin autoplay.
      const focused = reduce(state, { type: 'hover', index: j });
      for (let k = 0; k < focused.n; k++) {
        assert.strictEqual(
          playing(k, focused), false,
          `tras hover bajo RM no debe reproducir ningún medio (k=${k})`
        );
      }
    }),
    { numRuns: 200 }
  );
});

/* ═══════════════════════════════════════════════════════════════
   UNIT TESTS (ejemplos explícitos y deterministas)
   ═══════════════════════════════════════════════════════════════ */

const baseRM = {
  n: 4, focusIndex: 1, pinned: false,
  panelVisible: true, docVisible: true, reducedMotion: true, mode: 'STATIC_RM'
};

test('bajo RM visible, recomputeMode ⇒ STATIC_RM (sin deriva auto)', () => {
  assert.strictEqual(recomputeMode(baseRM), 'STATIC_RM');
});

test('bajo RM, drift es no-op (foco intacto)', () => {
  const next = reduce(baseRM, { type: 'drift' });
  assert.strictEqual(next.focusIndex, 1);
  assert.strictEqual(next, baseRM, 'drift fuera de AUTO devuelve el mismo estado');
});

test('setRM(true) sobre estado AUTO ⇒ STATIC_RM (corta la deriva)', () => {
  const auto = { n: 4, focusIndex: 0, pinned: false, panelVisible: true, docVisible: true, reducedMotion: false, mode: 'AUTO' };
  const next = reduce(auto, { type: 'setRM', value: true });
  assert.strictEqual(next.reducedMotion, true);
  assert.strictEqual(next.mode, 'STATIC_RM');
});

test('bajo RM, hover toma el control: USER_FOCUS y foco en la Pieza pedida', () => {
  const next = reduce(baseRM, { type: 'hover', index: 2 });
  assert.strictEqual(next.mode, 'USER_FOCUS');
  assert.strictEqual(next.focusIndex, 2);
  assert.strictEqual(next.reducedMotion, true, 'hover no desactiva RM');
});

test('bajo RM, ningún medio reproduce (playing=false en el foco)', () => {
  assert.strictEqual(playing(baseRM.focusIndex, baseRM), false);
});
