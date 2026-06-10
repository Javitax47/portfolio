'use strict';
/* =============================================================
   tests/media-mosaic.scheduler.test.js
   Javier Portfolio · project-media-mosaic

   FocusScheduler — pruebas unitarias con reloj inyectable (tarea 7.3)

   Property 6: Reanudación con gracia, cancelable (vertiente TEMPORAL)
   Validates: Requirements 2.1, 3.4, 3.5, 6.4

   Cubre, usando un reloj simulado (sin setTimeout real):
     - 2.1 : la deriva avanza el foco (+1, con wrap) cada DWELL ms.
     - 3.4 : resumeAfter(ms) programa la vuelta a AUTO tras RESUME_DELAY.
     - 3.5 : la reanudación pendiente es CANCELABLE (pause / nuevo
             resumeAfter antes de que transcurra el plazo).
     - 6.4 : a lo sumo UN temporizador de deriva activo por mosaico
             (un único setTimeout re-encadenado, nunca setInterval).

   Runner: node --test (nativo, Node 18+). No usa DOM ni temporizadores
   reales: todo el tiempo se controla con el reloj falso (makeClock).
   Solo desarrollo: no añade build de producción.
   ============================================================= */

const { test } = require('node:test');
const assert = require('node:assert');

const { createFocusScheduler, MOSAIC_TIMING } =
  require('./_helpers.js').requireProject('js/media-mosaic.js');

const DWELL = MOSAIC_TIMING.DWELL;          // 3200
const RESUME_DELAY = MOSAIC_TIMING.RESUME_DELAY; // 900

/* ─────────────────────────────────────────────────────────────
   makeClock(): cola manual de temporizadores con tiempo virtual.
   -------------------------------------------------------------
   - setTimeout(fn, ms)  -> id ; due absoluta = now + ms
   - clearTimeout(id)    -> elimina el temporizador pendiente
   - tick(ms)            -> avanza el reloj y dispara, en orden
                            cronológico, los callbacks vencidos
                            (incluidos los re-encadenados que vuelvan
                            a vencer dentro de la misma ventana)
   - activeCount()       -> nº de temporizadores PENDIENTES (para
                            aseverar "a lo sumo un timer de deriva")
   ───────────────────────────────────────────────────────────── */
function makeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map(); // id -> { due, fn }

  function setTimeout_(fn, ms) {
    const id = ++seq;
    timers.set(id, { due: now + (ms || 0), fn: fn });
    return id;
  }
  function clearTimeout_(id) {
    timers.delete(id);
  }
  function tick(ms) {
    const target = now + ms;
    // Dispara, en orden de vencimiento, todos los timers due <= target.
    // Un callback puede re-programar (re-encadenar) un nuevo timer; si su
    // vencimiento cae dentro de la ventana, también se dispara aquí.
    while (true) {
      let pick = null;
      for (const [id, t] of timers) {
        if (t.due <= target) {
          if (pick === null || t.due < pick.due || (t.due === pick.due && id < pick.id)) {
            pick = { id: id, due: t.due, fn: t.fn };
          }
        }
      }
      if (!pick) { break; }
      timers.delete(pick.id);
      now = pick.due;   // el reloj virtual avanza al instante de disparo
      pick.fn();        // puede programar nuevos timers (re-encadenado)
    }
    now = target;       // se asienta en el objetivo
  }
  function activeCount() { return timers.size; }
  function nowMs() { return now; }

  return {
    setTimeout: setTimeout_,
    clearTimeout: clearTimeout_,
    tick: tick,
    activeCount: activeCount,
    now: nowMs
  };
}

/* ─────────────────────────────────────────────────────────────
   makeCtrl(): controlador FALSO con estado mutable.
   -------------------------------------------------------------
   Expone los métodos que usa el scheduler: getMode/getFocus/
   getCount/canAuto/setFocus/_setMode. setFocus({source}) avanza el
   foco como el real (índice absoluto, con wrap mod count) y registra
   la llamada. El Modo lo conduce el test para reflejar cada escenario.
   ───────────────────────────────────────────────────────────── */
function makeCtrl(init) {
  init = init || {};
  const state = {
    mode: init.mode || 'AUTO',
    focus: init.focus || 0,
    count: (init.count != null) ? init.count : 4,
    canAuto: (init.canAuto != null) ? init.canAuto : true
  };
  const calls = { setFocus: [], setMode: [] };

  return {
    getMode: function () { return state.mode; },
    getFocus: function () { return state.focus; },
    getCount: function () { return state.count; },
    canAuto: function () { return state.canAuto; },
    setFocus: function (i, opts) {
      calls.setFocus.push({ i: i, opts: opts || {} });
      const n = state.count;
      state.focus = ((i % n) + n) % n; // wrap como el controlador real
    },
    _setMode: function (m) {
      calls.setMode.push(m);
      state.mode = m;
    },
    // helpers de test
    _state: state,
    _calls: calls
  };
}

/** Crea (clock, ctrl, scheduler) cableados con el reloj inyectable. */
function setup(init, opts) {
  const clock = makeClock();
  const ctrl = makeCtrl(init);
  const sched = createFocusScheduler(ctrl, Object.assign({
    dwell: DWELL,
    resumeDelay: RESUME_DELAY,
    getReducedMotion: function () { return false; },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  }, opts || {}));
  return { clock: clock, ctrl: ctrl, sched: sched };
}

/* ═══════════════════════════════════════════════════════════════
   TESTS
   ═══════════════════════════════════════════════════════════════ */

// 1) Avance tras DWELL: un tick avanza el foco una vez; varios ticks,
//    varias veces (timer único re-encadenado).  Validates: 2.1
test('scheduler · start()+tick(DWELL) avanza el foco una vez con {source:"auto"}', () => {
  const { clock, ctrl, sched } = setup({ mode: 'AUTO', focus: 0, count: 4 });

  sched.start();
  assert.strictEqual(ctrl._calls.setFocus.length, 0, 'aún no debe haber avanzado');

  clock.tick(DWELL);
  assert.strictEqual(ctrl._calls.setFocus.length, 1, 'un DWELL => un avance');
  assert.strictEqual(ctrl._calls.setFocus[0].opts.source, 'auto', 'origen del avance: auto');
  assert.strictEqual(ctrl.getFocus(), 1, 'foco avanzó 0 -> 1');
});

test('scheduler · varios DWELL re-encadenan un único timer y avanzan con wrap', () => {
  const { clock, ctrl, sched } = setup({ mode: 'AUTO', focus: 0, count: 4 });

  sched.start();
  clock.tick(DWELL); // 0 -> 1
  clock.tick(DWELL); // 1 -> 2
  clock.tick(DWELL); // 2 -> 3
  clock.tick(DWELL); // 3 -> 0 (wrap, count=4)

  assert.strictEqual(ctrl._calls.setFocus.length, 4, 'cuatro DWELL => cuatro avances');
  assert.strictEqual(ctrl.getFocus(), 0, 'el foco volvió a 0 tras un ciclo completo');
});

// 2) A lo sumo UN temporizador de deriva activo.  Validates: 6.4
test('scheduler · a lo sumo un timer de deriva activo en todo momento', () => {
  const { clock, sched } = setup({ mode: 'AUTO', focus: 0, count: 4 });

  assert.strictEqual(clock.activeCount(), 0, 'sin timers antes de start()');

  sched.start();
  assert.strictEqual(clock.activeCount(), 1, 'exactamente un timer tras start()');

  // start() repetido NO debe duplicar el timer (no-op si ya corre).
  sched.start();
  assert.strictEqual(clock.activeCount(), 1, 'start() repetido no añade timers');

  for (let k = 0; k < 6; k++) {
    clock.tick(DWELL / 2);
    assert.ok(clock.activeCount() <= 1, 'nunca más de un timer (a mitad de DWELL)');
    clock.tick(DWELL / 2);
    assert.ok(clock.activeCount() <= 1, 'nunca más de un timer (tras completar DWELL)');
  }
});

// 3) start() es no-op con reduced-motion y con count < 2.  Validates: 2.1 (gate)
test('scheduler · start() es no-op con reducedMotion=true (no programa timer)', () => {
  const { clock, sched } = setup({ mode: 'AUTO', focus: 0, count: 4 },
    { getReducedMotion: function () { return true; } });

  sched.start();
  assert.strictEqual(sched.isRunning(), false, 'no debe quedar corriendo con reduced-motion');
  assert.strictEqual(clock.activeCount(), 0, 'no programa ningún timer de deriva');
});

test('scheduler · start() es no-op con count < 2 (nada que derivar)', () => {
  const { clock, sched } = setup({ mode: 'AUTO', focus: 0, count: 1 });

  sched.start();
  assert.strictEqual(sched.isRunning(), false, 'con 1 medio no arranca la deriva');
  assert.strictEqual(clock.activeCount(), 0, 'no programa ningún timer');
});

// 4) pause() cancela el timer de deriva pendiente.  Validates: 6.4
test('scheduler · pause() cancela el timer y el tick posterior no hace nada', () => {
  const { clock, ctrl, sched } = setup({ mode: 'AUTO', focus: 0, count: 4 });

  sched.start();
  assert.strictEqual(clock.activeCount(), 1, 'un timer tras start()');

  sched.pause();
  assert.strictEqual(clock.activeCount(), 0, 'pause() deja 0 timers activos');
  assert.strictEqual(sched.isRunning(), false, 'pause() detiene el scheduler');

  clock.tick(DWELL * 3);
  assert.strictEqual(ctrl._calls.setFocus.length, 0, 'sin avances tras pausar');
});

// 5) resumeAfter(ms): vuelve a AUTO y re-arranca si canAuto.  Validates: 3.4
test('scheduler · resumeAfter: tras el plazo vuelve a AUTO y reanuda la deriva si canAuto', () => {
  const { clock, ctrl, sched } = setup({ mode: 'USER_FOCUS', focus: 2, count: 4, canAuto: true });

  sched.resumeAfter(RESUME_DELAY);
  assert.strictEqual(clock.activeCount(), 1, 'hay un timer de reanudación pendiente');
  assert.strictEqual(ctrl._calls.setMode.length, 0, 'aún no ha reanudado');

  clock.tick(RESUME_DELAY);
  assert.deepStrictEqual(ctrl._calls.setMode, ['AUTO'], 'se llamó _setMode("AUTO")');
  assert.strictEqual(sched.isRunning(), true, 'el scheduler vuelve a correr');
  assert.strictEqual(clock.activeCount(), 1, 'hay un timer de deriva re-armado');
});

test('scheduler · resumeAfter: si canAuto() es false, no vuelve a AUTO ni reanuda', () => {
  const { clock, ctrl, sched } = setup({ mode: 'PAUSED_OFFSCREEN', focus: 1, count: 4, canAuto: false });

  sched.resumeAfter(RESUME_DELAY);
  clock.tick(RESUME_DELAY);

  assert.strictEqual(ctrl._calls.setMode.length, 0, 'no se cambia el modo a AUTO');
  assert.strictEqual(sched.isRunning(), false, 'no reanuda la deriva');
  assert.strictEqual(clock.activeCount(), 0, 'no quedan timers activos');
});

// 6) resumeAfter es CANCELABLE.  Validates: 3.5
test('scheduler · pause() antes del plazo cancela la reanudación pendiente', () => {
  const { clock, ctrl, sched } = setup({ mode: 'USER_FOCUS', focus: 0, count: 4, canAuto: true });

  sched.resumeAfter(RESUME_DELAY);
  clock.tick(RESUME_DELAY - 1); // aún no transcurre el plazo
  assert.strictEqual(ctrl._calls.setMode.length, 0, 'todavía no reanuda');

  sched.pause(); // cancela la reanudación pendiente
  assert.strictEqual(clock.activeCount(), 0, 'no quedan timers tras cancelar');

  clock.tick(RESUME_DELAY * 3); // mucho tiempo después
  assert.strictEqual(ctrl._calls.setMode.length, 0, 'la reanudación quedó cancelada');
  assert.strictEqual(sched.isRunning(), false, 'sigue sin reanudar');
});

test('scheduler · un segundo resumeAfter reemplaza al primero (no se acumulan ni disparan dos veces)', () => {
  const { clock, ctrl, sched } = setup({ mode: 'USER_FOCUS', focus: 0, count: 4, canAuto: true });

  sched.resumeAfter(RESUME_DELAY);
  clock.tick(RESUME_DELAY - 1);          // casi vence el primero
  sched.resumeAfter(RESUME_DELAY);        // reinicia la gracia; cancela el primero
  assert.strictEqual(clock.activeCount(), 1, 'sigue habiendo un único timer de reanudación');

  // En el instante en que habría vencido el PRIMERO, no debe dispararse.
  clock.tick(1);
  assert.strictEqual(ctrl._calls.setMode.length, 0, 'el primer resume fue cancelado');

  // Al cumplirse el plazo del SEGUNDO, reanuda exactamente una vez.
  clock.tick(RESUME_DELAY - 1);
  assert.deepStrictEqual(ctrl._calls.setMode, ['AUTO'], 'reanuda una sola vez (segundo plazo)');
});
